/** #98/#83 authenticated, revision-CAS business persistence. No legacy/anonymous fallback. */
import { randomUUID } from 'node:crypto';
import {anchorDto,hasAnchorSchema,reconcileOutlineAnchors} from './anchor-service';
import type {MemoAnchorState} from '@/domain/cad-memo-anchor';
import {EMPTY_MEMO_SETTINGS,normalizeMemoSettings,type MemoSettings} from '@/domain/memo-schedule';
import type { Database } from '@/server/db';
import { writeTransaction } from '@/server/db';
import { CadError } from '@/domain/cad';
import { prepareG7CadWrite, requireG7CadPermission, type G7CadWrite } from '@/server/g7-operational/cad-guard';
import { cadWriteContext } from '@/server/g7-operational/cad-preview-context';
import { attestTransformedOutlineDraftAgainstImmutableDxf } from '@/server/outline/transform-attestation';
import { geometry,keys,memoEditOperation,memoGroupId,memoGroupName,memoText,name,operations,point,provenance,revision,sourceSha,transformed,ID } from './validation';
import type { GeoJSONOutline } from '@/viewers/core/outline-compute';
function bad(code:string,status:number):never {throw new CadError(code,'업무 객체를 확인하거나 수정할 수 없습니다.',status);}
function cas():never {return bad('BUSINESS_REVISION_CONFLICT',409);}
type Kind='outline'|'memo';
type AuditAction='CREATE'|'EDIT'|'DELETE';
export function requireBusinessWrite(request:Request,requestId:string):G7CadWrite{
 const proof=prepareG7CadWrite(request,requestId);
 if(!proof?.runtime)bad('BUSINESS_AUTH_REQUIRED',403);
 return proof;
}
export async function businessSchema(db:Database):Promise<void>{
 const rows=await db.$queryRawUnsafe<{name:string}[]>(
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('CadOutline','CadMemo','CadBusinessAudit') ORDER BY name");
 if(rows.map(x=>x.name).join(',')!=='CadBusinessAudit,CadMemo,CadOutline')
  bad('BUSINESS_SCHEMA_UNAVAILABLE',503);
}
/** Older volumes may be read, but M4/M5 writes require an intact sidecar pair. */
export async function memoFeatureSchema(db:Database):Promise<boolean>{
 const rows=await db.$queryRawUnsafe<{name:string}[]>(
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('CadMemoFeature','CadMemoGroup') ORDER BY name");
 if(rows.length===0)return false;
 if(rows.map(x=>x.name).join(',')!=='CadMemoFeature,CadMemoGroup')bad('MEMO_FEATURE_SCHEMA_PARTIAL',503);
 return true;
}
async function version(tx:Database | Parameters<Parameters<typeof writeTransaction>[1]>[0],id:string,sha:string){
 const v=await tx.cadFileVersion.findUnique({where:{id},select:{id:true,sha256:true,fileFormat:true}});
 if(!v)bad('BUSINESS_VERSION_NOT_FOUND',404);
 if(v.fileFormat!=='DXF')bad('BUSINESS_DXF_ONLY',415);
 if(v.sha256.toLowerCase()!==sha)bad('BUSINESS_SOURCE_CHANGED',409);
 return v;
}
async function scene(tx:Parameters<Parameters<typeof writeTransaction>[1]>[0],id:string,expected:number){
 const pointer=await tx.currentScene.findUnique({where:{versionId:id}});
 if(!pointer||pointer.revision!==expected)cas();
}
async function audit(tx:Parameters<Parameters<typeof writeTransaction>[1]>[0], proof:G7CadWrite,
 actorId:string,siteId:string,kind:'OUTLINE'|'MEMO',objectId:string,action:AuditAction,
 vId:string,before:number|null,after:number|null){
 const actionName=kind==='OUTLINE'?'outline:write':'memo:write';
 const approved=await requireG7CadPermission(tx,proof,actionName,{kind:'version',versionId:vId});
 if(approved.actorId!==actorId||approved.siteId!==siteId)bad('BUSINESS_ACCESS_DENIED',403);
 await tx.cadBusinessAudit.create({data:{id:randomUUID(),actorUserId:actorId,siteId,
  versionId:vId,targetKind:kind,targetId:objectId,action,beforeRevision:before,
  afterRevision:after,outcome:'SUCCESS',requestId:proof.requestId,timestampUtc:new Date().toISOString()}});
}
type MemoFeatureLike={
 groupId:string|null;visible:boolean;scheduleEnabled:boolean;startDate:string|null;dueDate:string|null;
 completionEnabled:boolean;isCompleted:boolean;completedAt:string|null
};
const memoFeatureDefault:MemoFeatureLike={groupId:null,visible:true,...EMPTY_MEMO_SETTINGS};
export const memoGroupDto=(g:{id:string;versionId:string;sourceSha256:string;name:string;
 sortOrder:number;revision:number;createdById:string;updatedById:string;createdAt:string;updatedAt:string})=>({
 id:g.id,versionId:g.versionId,sourceSha256:g.sourceSha256,name:g.name,
 sortOrder:g.sortOrder,revision:g.revision,createdById:g.createdById,updatedById:g.updatedById,
 createdAt:g.createdAt,updatedAt:g.updatedAt
});
export const memoDto=(v:{
 id:string;versionId:string;sourceSha256:string;title:string;content:string;
 anchorX:number;anchorY:number;offsetX:number;offsetY:number;
 createdById:string;updatedById:string;createdAt:string;updatedAt:string;revision:number
},anchor:MemoAnchorState={mode:'FREE'},meta:MemoFeatureLike|null=null)=>({
 anchor,id:v.id,versionId:v.versionId,sourceSha256:v.sourceSha256,title:v.title,content:v.content,
 anchorWcsXY:{x:v.anchorX,y:v.anchorY},labelOffset:{x:v.offsetX,y:v.offsetY},
 createdById:v.createdById,updatedById:v.updatedById,createdAt:v.createdAt,
 updatedAt:v.updatedAt,revision:v.revision,textFormat:'plain' as const,persisted:true as const,
 ...(meta??memoFeatureDefault)
});
const outlineDto=(v:{
 id:string;versionId:string;sourceSha256:string;sceneRevision:number;origin:string;
 validationMode:string;kind:string;name:string;geometryJson:string;baseGeometryJson:string;
 sourceRefsJson:string;derivedFromJson:string;transformJson:string;outlineTypeId:string|null;
 createdById:string;updatedById:string;createdAt:string;updatedAt:string;revision:number
})=>({
 id:v.id,versionId:v.versionId,sourceSha256:v.sourceSha256,sceneRevision:v.sceneRevision,
 origin:v.origin,validationMode:v.validationMode,kind:v.kind,name:v.name,
 geometry:JSON.parse(v.geometryJson),baseGeometry:JSON.parse(v.baseGeometryJson),
 sourceRefs:JSON.parse(v.sourceRefsJson),derivedFrom:JSON.parse(v.derivedFromJson),
 operations:JSON.parse(v.transformJson),outlineTypeId:v.outlineTypeId,
 createdById:v.createdById,updatedById:v.updatedById,createdAt:v.createdAt,updatedAt:v.updatedAt,revision:v.revision
});
export class BusinessRepository {
 constructor(readonly db:Database){}
 async list(kind:'memo',versionId:string):Promise<{memos:ReturnType<typeof memoDto>[];groups:ReturnType<typeof memoGroupDto>[];featuresAvailable:boolean}>;
 async list(kind:'outline',versionId:string):Promise<{outlines:ReturnType<typeof outlineDto>[] }>;
 async list(kind:Kind,versionId:string){
  await businessSchema(this.db);
  const v=await this.db.cadFileVersion.findUnique({where:{id:versionId},select:{id:true}});
  if(!v)bad('BUSINESS_VERSION_NOT_FOUND',404);
  if(kind==='memo'){
   const rows=await this.db.cadMemo.findMany({where:{versionId,deletedAt:null},
     orderBy:{createdAt:'asc'},take:101});
   const bound=await hasAnchorSchema(this.db)
     ?await this.db.cadMemoAnchor.findMany({where:{versionId,memoId:{in:rows.map(x=>x.id)}}}):[];
   const byId=new Map(bound.map(x=>[x.memoId,x]));
   const featuresAvailable=await memoFeatureSchema(this.db);
   const extra=featuresAvailable?await this.db.cadMemoFeature.findMany({
    where:{versionId,memoId:{in:rows.map(x=>x.id)}}}):[];
   const byMemo=new Map(extra.map(x=>[x.memoId,x]));
   const groups=featuresAvailable?await this.db.cadMemoGroup.findMany({
    where:{versionId,deletedAt:null},orderBy:[{sortOrder:'asc'},{createdAt:'asc'}],take:21}):[];
   return {memos:rows.map(x=>memoDto(x,anchorDto(byId.get(x.id)??null),byMemo.get(x.id)??null)),
    groups:groups.map(memoGroupDto),featuresAvailable};
  }
  return {outlines:(await this.db.cadOutline.findMany({where:{versionId,deletedAt:null},orderBy:{createdAt:'asc'},take:101})).map(outlineDto)};
 }
 async createMemo(versionId:string,body:unknown,proof:G7CadWrite){
  const b=keys(body,['sourceSha256','title','content','anchorWcsXY'],['labelOffset']);
  const sha=sourceSha(b.sourceSha256),txt=memoText(b.title,b.content);
  const at=point(b.anchorWcsXY),offset=b.labelOffset===undefined?{x:14,y:-12}:point(b.labelOffset);
  await businessSchema(this.db);
  const featureAvailable=await memoFeatureSchema(this.db);
  return writeTransaction(this.db,async tx=>{
   const allowed=await requireG7CadPermission(tx,proof,'memo:write',{kind:'version',versionId});
   await version(tx,versionId,sha);
   if(await tx.cadMemo.count({where:{versionId,deletedAt:null}})>=100)bad('BUSINESS_LIMIT',413);
   const now=new Date().toISOString(),id=randomUUID();
   const v=await tx.cadMemo.create({data:{
    id,versionId,sourceSha256:sha,title:txt.title,content:txt.content,
    anchorX:at.x,anchorY:at.y,offsetX:offset.x,offsetY:offset.y,
    revision:0,createdById:allowed.actorId,updatedById:allowed.actorId,createdAt:now,updatedAt:now
   }});
   if(featureAvailable)await tx.cadMemoFeature.create({data:{
    memoId:id,versionId,sourceSha256:sha,groupId:null,visible:true,
    scheduleEnabled:false,startDate:null,dueDate:null,completionEnabled:false,isCompleted:false,completedAt:null
   }});
   await audit(tx,proof,allowed.actorId,allowed.siteId,'MEMO',id,'CREATE',versionId,null,0);
   return memoDto(v,{mode:'FREE'},memoFeatureDefault);
  });
 }
 async editMemo(versionId:string,id:string,body:unknown,proof:G7CadWrite,remove=false){
  const b=remove?keys(body,['expectedRevision']):keys(body,['expectedRevision','operation'],
   ['title','content','anchorWcsXY','groupId','visible','scheduleEnabled','startDate','dueDate','completionEnabled','isCompleted']);
  const expected=revision(b.expectedRevision);
  if(!ID.test(id))bad('BUSINESS_ID_INVALID',400);
  // PATCH never elevates to DELETE; route method owns the delete branch.
  const operation=memoEditOperation(b.operation,remove);
  if(operation==='text')keys(b,['expectedRevision','operation','title','content']);
  if(operation==='move')keys(b,['expectedRevision','operation','anchorWcsXY']);
  if(operation==='metadata')keys(b,['expectedRevision','operation','groupId','visible',
    'scheduleEnabled','startDate','dueDate','completionEnabled','isCompleted']);
  const data=operation==='text'?memoText(b.title,b.content):
   operation==='move'?{anchorWcsXY:point(b.anchorWcsXY)}:null;
  await businessSchema(this.db);
  const anchorAvailable=await hasAnchorSchema(this.db);
  const featureAvailable=await memoFeatureSchema(this.db);
  if(operation==='metadata'&&!featureAvailable)bad('MEMO_FEATURE_SCHEMA_UNAVAILABLE',503);
  return writeTransaction(this.db,async tx=>{
   const allowed=await requireG7CadPermission(tx,proof,'memo:write',{kind:'version',versionId});
   const old=await tx.cadMemo.findFirst({where:{id,versionId,deletedAt:null}});
   if(!old)bad('BUSINESS_NOT_FOUND',404);
   await version(tx,versionId,old.sourceSha256);
   // M2 Owner has NOT approved cross-Editor Memo collaboration: owner-only.
   if(old.createdById!==allowed.actorId)bad('BUSINESS_OWNER_REQUIRED',403);
   if(old.revision!==expected)cas();
   if(operation==='metadata'){
    if(typeof b.visible!=='boolean')bad('MEMO_VISIBILITY_INVALID',422);
    const groupId=memoGroupId(b.groupId);
    if(groupId!==null&&!await tx.cadMemoGroup.findFirst({where:{
      id:groupId,versionId,sourceSha256:old.sourceSha256,deletedAt:null}}))
      bad('MEMO_GROUP_SCOPE_INVALID',409);
    const existing=await tx.cadMemoFeature.findUnique({where:{memoId:id}});
    const previous:MemoSettings=existing?{
      scheduleEnabled:existing.scheduleEnabled,startDate:existing.startDate,dueDate:existing.dueDate,
      completionEnabled:existing.completionEnabled,isCompleted:existing.isCompleted,
      completedAt:existing.completedAt}:EMPTY_MEMO_SETTINGS;
    let settings:MemoSettings;
    try{settings=normalizeMemoSettings({
      scheduleEnabled:b.scheduleEnabled,startDate:b.startDate,dueDate:b.dueDate,
      completionEnabled:b.completionEnabled,isCompleted:b.isCompleted},previous);}
    catch{return bad('MEMO_SETTINGS_INVALID',422);}
    await tx.cadMemoFeature.upsert({where:{memoId:id},
      create:{memoId:id,versionId,sourceSha256:old.sourceSha256,groupId,visible:b.visible,...settings},
      update:{groupId,visible:b.visible,...settings}});
   }
   if(remove&&featureAvailable)await tx.cadMemoFeature.updateMany({where:{memoId:id},data:{groupId:null}});
   const update=operation==='delete'?{deletedAt:new Date().toISOString(),deletedById:allowed.actorId}:
       operation==='text'?data as {title:string;content:string}:
       operation==='move'?{anchorX:(data as {anchorWcsXY:{x:number;y:number}}).anchorWcsXY.x,
        anchorY:(data as {anchorWcsXY:{x:number;y:number}}).anchorWcsXY.y}:{};
   // An explicit free WCS move detaches the old object binding in the SAME CAS transaction.
   if((operation==='move'||remove)&&anchorAvailable)await tx.cadMemoAnchor.deleteMany({where:{memoId:id,versionId}});
   const casResult=await tx.cadMemo.updateMany({where:{id,versionId,revision:expected,deletedAt:null},
    data:{...update,revision:expected+1,updatedById:allowed.actorId,updatedAt:new Date().toISOString()}});
   if(casResult.count!==1)cas();
   await audit(tx,proof,allowed.actorId,allowed.siteId,'MEMO',id,remove?'DELETE':'EDIT',versionId,expected,expected+1);
   if(remove)return {deleted:true,revision:expected+1};
   return memoDto((await tx.cadMemo.findUniqueOrThrow({where:{id}})),
    anchorDto(anchorAvailable?await tx.cadMemoAnchor.findUnique({where:{memoId:id}}):null),
    featureAvailable?await tx.cadMemoFeature.findUnique({where:{memoId:id}}):null);
  });
 }
 async createOutline(versionId:string,raw:unknown,proof:G7CadWrite){
  const b=keys(raw,['mode','sourceSha256','expectedSceneRevision','name','kind'],
   ['geometry','derivedFrom','outlineTypeId','sourceExport']);
  const sha=sourceSha(b.sourceSha256),srev=revision(b.expectedSceneRevision);
  const title=name(b.name),kind=b.kind;
  if(kind!=='CONVEX'&&kind!=='PRECISE')bad('OUTLINE_KIND_INVALID',400);
  if(b.outlineTypeId!==undefined&&b.outlineTypeId!==null)bad('OUTLINE_TYPE_UNAVAILABLE',409);
  let base:GeoJSONOutline,sourceRefs:string[]=[],derived:string[]=[];
  let validationMode:'APP_CREATED'|'SOURCE_CANONICAL';
  if(b.mode==='APP_CREATED'){
   if(b.sourceExport!==undefined)bad('OUTLINE_SOURCE_MODE_INVALID',400);
   base=geometry(b.geometry);derived=provenance(b.derivedFrom);
   validationMode='APP_CREATED';
  }else if(b.mode==='SOURCE_CANONICAL'){
   if(b.geometry!==undefined||b.derivedFrom!==undefined||b.sourceExport===undefined)bad('OUTLINE_SOURCE_MODE_INVALID',400);
   validationMode='SOURCE_CANONICAL';
   // The read/CPU-heavy immutable DXF attestation must never start
   // until Version -> Site write scope is checked against the live session.
   // Recheck inside the final CAS+Audit transaction to close the TOCTOU window.
   await writeTransaction(this.db,async tx=>{
    await requireG7CadPermission(tx,proof,'outline:write',{kind:'version',versionId});
    await version(tx,versionId,sha);
    await scene(tx,versionId,srev);
   });
   // Server-held immutable bytes and #97 handle/canonical attestation; never trust browser source claims.
   const cad=cadWriteContext(proof);
   try{
    const versionRow=await cad.repo.db.cadFileVersion.findUnique({where:{id:versionId},
      select:{sha256:true,storagePath:true,fileFormat:true}});
    if(!versionRow||versionRow.sha256!==sha||versionRow.fileFormat!=='DXF')bad('BUSINESS_SOURCE_CHANGED',409);
    const source=await cad.storage.content(versionRow.storagePath);
    if(source.size>100*1024*1024)bad('OUTLINE_SOURCE_SIZE',413);
    const bytes=new Uint8Array(await new Response(source.stream).arrayBuffer());
    if(bytes.byteLength!==source.size)bad('OUTLINE_SOURCE_SIZE',413);
    const verified=attestTransformedOutlineDraftAgainstImmutableDxf(b.sourceExport,versionId,sha,bytes);
    if(verified.outlines.length!==1||verified.outlines[0].kind!==kind)bad('OUTLINE_SOURCE_MODE_INVALID',400);
    const outline=verified.outlines[0];
    base=outline.effectiveGeometry;
    sourceRefs=outline.sourceEntityIds;
   }finally{await cad.close();}
  }else bad('OUTLINE_MODE_INVALID',400);
  await businessSchema(this.db);
  return writeTransaction(this.db,async tx=>{
   const allowed=await requireG7CadPermission(tx,proof,'outline:write',{kind:'version',versionId});
   await version(tx,versionId,sha);await scene(tx,versionId,srev);
   if(await tx.cadOutline.count({where:{versionId,deletedAt:null}})>=100)bad('BUSINESS_LIMIT',413);
   const id=randomUUID(),now=new Date().toISOString();
   const v=await tx.cadOutline.create({data:{
    id,versionId,sourceSha256:sha,sceneRevision:srev,origin:'APP_CREATED',validationMode,
    kind,name:title,baseGeometryJson:JSON.stringify(base),geometryJson:JSON.stringify(base),
    sourceRefsJson:JSON.stringify(sourceRefs),derivedFromJson:JSON.stringify(derived),
    transformJson:'[]',outlineTypeId:null,revision:0,
    createdById:allowed.actorId,updatedById:allowed.actorId,createdAt:now,updatedAt:now
   }});
   await audit(tx,proof,allowed.actorId,allowed.siteId,'OUTLINE',id,'CREATE',versionId,null,0);
   return outlineDto(v);
  });
 }
 async editOutline(versionId:string,id:string,raw:unknown,proof:G7CadWrite,remove=false){
  const b=remove?keys(raw,['expectedRevision']):keys(raw,['expectedRevision','operation'],['name','operations']);
  const expected=revision(b.expectedRevision);
  if(!ID.test(id))bad('BUSINESS_ID_INVALID',400);
  if(!remove&&b.operation==='rename')keys(b,['expectedRevision','operation','name']);
  else if(!remove&&b.operation==='transform')keys(b,['expectedRevision','operation','operations']);
  else if(!remove)bad('BUSINESS_OPERATION_INVALID',400);
  const rename=!remove&&b.operation==='rename'?name(b.name):null;
  const ops=!remove&&b.operation==='transform'?operations(b.operations):null;
  await businessSchema(this.db);
  const anchorAvailable=await hasAnchorSchema(this.db);
  return writeTransaction(this.db,async tx=>{
   const allowed=await requireG7CadPermission(tx,proof,'outline:write',{kind:'version',versionId});
   const old=await tx.cadOutline.findFirst({where:{id,versionId,deletedAt:null}});
   if(!old)bad('BUSINESS_NOT_FOUND',404);
   await version(tx,versionId,old.sourceSha256);await scene(tx,versionId,old.sceneRevision);
   if(old.revision!==expected)cas();
   const update=remove?{deletedAt:new Date().toISOString(),deletedById:allowed.actorId}:
     rename!==null?{name:rename}:(()=>{
       const verified=transformed(geometry(JSON.parse(old.baseGeometryJson)),ops!);
       return {geometryJson:JSON.stringify(verified.geometry),transformJson:JSON.stringify(ops)};
     })();
   const casResult=await tx.cadOutline.updateMany({where:{id,versionId,revision:expected,deletedAt:null},
    data:{...update,revision:expected+1,updatedById:allowed.actorId,updatedAt:new Date().toISOString()}});
   if(casResult.count!==1)cas();
   if(anchorAvailable&&(remove||ops!==null)){
    const matrix=ops!==null?transformed(geometry(JSON.parse(old.baseGeometryJson)),ops).transform:undefined;
    await reconcileOutlineAnchors(tx,proof,allowed,versionId,id,remove?'delete':'transform',matrix);
   }
   await audit(tx,proof,allowed.actorId,allowed.siteId,'OUTLINE',id,remove?'DELETE':'EDIT',versionId,expected,expected+1);
   return remove?{deleted:true,revision:expected+1}:outlineDto(await tx.cadOutline.findUniqueOrThrow({where:{id}}));
  });
 }
}
