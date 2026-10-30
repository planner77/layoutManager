/** #85: Group operations share the CAD Version/SHA and G7 memo:write boundary. */
import {randomUUID} from 'node:crypto';
import type {Database} from '@/server/db';
import {writeTransaction} from '@/server/db';
import {CadError} from '@/domain/cad';
import {requireG7CadPermission,type G7CadWrite} from '@/server/g7-operational/cad-guard';
import {businessSchema,memoFeatureSchema,memoGroupDto} from './service';
import {ID,keys,memoGroupName,revision,sourceSha} from './validation';
const blocked=(code:string,status:number):never=>{throw new CadError(code,'메모 그룹 작업을 수행할 수 없습니다.',status);};
const cas=():never=>blocked('BUSINESS_REVISION_CONFLICT',409);
type Tx=Parameters<Parameters<typeof writeTransaction>[1]>[0];
async function scope(tx:Tx,versionId:string,sha:string){
 const v=await tx.cadFileVersion.findUnique({where:{id:versionId},select:{sha256:true,fileFormat:true}});
 if(!v)blocked('BUSINESS_VERSION_NOT_FOUND',404);
 if(v.fileFormat!=='DXF')blocked('BUSINESS_DXF_ONLY',415);
 if(v.sha256.toLowerCase()!==sha)blocked('BUSINESS_SOURCE_CHANGED',409);
}
async function audit(tx:Tx,proof:G7CadWrite,actorId:string,siteId:string,versionId:string,
 targetId:string,action:'CREATE'|'EDIT'|'DELETE',before:number|null,after:number|null){
 const allowed=await requireG7CadPermission(tx,proof,'memo:write',{kind:'version',versionId});
 if(allowed.actorId!==actorId||allowed.siteId!==siteId)blocked('BUSINESS_ACCESS_DENIED',403);
 await tx.cadBusinessAudit.create({data:{id:randomUUID(),actorUserId:actorId,siteId,versionId,
  targetKind:'MEMO',targetId,action,beforeRevision:before,afterRevision:after,outcome:'SUCCESS',
  requestId:proof.requestId,timestampUtc:new Date().toISOString()}});
}
export class MemoGroupRepository{
 constructor(readonly db:Database){}
 async create(versionId:string,raw:unknown,proof:G7CadWrite){
  const b=keys(raw,['sourceSha256','name']),sha=sourceSha(b.sourceSha256),name=memoGroupName(b.name);
  await businessSchema(this.db);
  if(!await memoFeatureSchema(this.db))blocked('MEMO_FEATURE_SCHEMA_UNAVAILABLE',503);
  return writeTransaction(this.db,async tx=>{
   const allowed=await requireG7CadPermission(tx,proof,'memo:write',{kind:'version',versionId});
   await scope(tx,versionId,sha);
   const groups=await tx.cadMemoGroup.findMany({where:{versionId,deletedAt:null}});
   if(groups.length>=20)blocked('MEMO_GROUP_LIMIT',413);
   if(groups.some(g=>g.name===name))blocked('MEMO_GROUP_DUPLICATE',409);
   const id=randomUUID(),now=new Date().toISOString();
   const group=await tx.cadMemoGroup.create({data:{id,versionId,sourceSha256:sha,name,
    sortOrder:groups.length,revision:0,createdById:allowed.actorId,updatedById:allowed.actorId,
    createdAt:now,updatedAt:now}});
   await audit(tx,proof,allowed.actorId,allowed.siteId,versionId,id,'CREATE',null,0);
   return memoGroupDto(group);
  });
 }
 async edit(versionId:string,id:string,raw:unknown,proof:G7CadWrite,remove=false){
  if(!ID.test(id))blocked('MEMO_GROUP_ID_INVALID',400);
  const b=remove?keys(raw,['expectedRevision']):keys(raw,['expectedRevision','operation','name']);
  const expected=revision(b.expectedRevision);
  if(!remove&&b.operation!=='rename')blocked('MEMO_GROUP_OPERATION_INVALID',400);
  const nextName=remove?null:memoGroupName(b.name);
  await businessSchema(this.db);
  if(!await memoFeatureSchema(this.db))blocked('MEMO_FEATURE_SCHEMA_UNAVAILABLE',503);
  return writeTransaction(this.db,async tx=>{
   const allowed=await requireG7CadPermission(tx,proof,'memo:write',{kind:'version',versionId});
   const group=await tx.cadMemoGroup.findFirst({where:{id,versionId,deletedAt:null}});
   if(!group)blocked('MEMO_GROUP_NOT_FOUND',404);
   await scope(tx,versionId,group.sourceSha256);
   if(group.createdById!==allowed.actorId)blocked('BUSINESS_OWNER_REQUIRED',403);
   if(group.revision!==expected)cas();
   if(nextName!==null&&await tx.cadMemoGroup.count({where:{versionId,deletedAt:null,
      name:nextName,id:{not:id}}})>0)blocked('MEMO_GROUP_DUPLICATE',409);
   if(remove){
    const assigned=await tx.cadMemoFeature.findMany({where:{groupId:id,versionId}});
    for(const row of assigned){
     const memo=await tx.cadMemo.findFirst({where:{id:row.memoId,versionId,deletedAt:null}});
     if(!memo)continue; // historic soft-deleted memo gets only its sidecar unassigned
     if(memo.createdById!==allowed.actorId)blocked('BUSINESS_OWNER_REQUIRED',403);
     const n=await tx.cadMemo.updateMany({where:{id:memo.id,versionId,revision:memo.revision,deletedAt:null},
      data:{revision:memo.revision+1,updatedById:allowed.actorId,updatedAt:new Date().toISOString()}});
     if(n.count!==1)cas();
     await tx.cadMemoFeature.update({where:{memoId:memo.id},data:{groupId:null}});
     await audit(tx,proof,allowed.actorId,allowed.siteId,versionId,memo.id,'EDIT',memo.revision,memo.revision+1);
    }
    await tx.cadMemoFeature.updateMany({where:{groupId:id,versionId},data:{groupId:null}});
   }
   const n=await tx.cadMemoGroup.updateMany({where:{id,versionId,revision:expected,deletedAt:null},
    data:{...(remove?{deletedAt:new Date().toISOString(),deletedById:allowed.actorId}:{name:nextName!}),
      revision:expected+1,updatedById:allowed.actorId,updatedAt:new Date().toISOString()}});
   if(n.count!==1)cas();
   await audit(tx,proof,allowed.actorId,allowed.siteId,versionId,id,remove?'DELETE':'EDIT',expected,expected+1);
   return remove?{deleted:true,revision:expected+1}:
     memoGroupDto(await tx.cadMemoGroup.findUniqueOrThrow({where:{id}}));
  });
 }
}
