/** #201 Version-owned folders and object membership; no geometry or source mutation. */
import {randomUUID} from 'node:crypto';
import type {Prisma} from '@/generated/prisma/client';
import {CadError} from '@/domain/cad';
import {writeTransaction,type Database} from '@/server/db';
import {requireSceneRead} from '@/server/scene/scene-context';
import {requireG7CadPermission,requireG7RuntimeWrite,type G7CadWrite} from '@/server/g7-operational/cad-guard';
import {assertRuntimeApprovalCurrent} from '@/server/g7-operational/runtime-handler';
import {outlineGeometryBounds} from '@/domain/outline-tree';
import {hasG7FeatureSchemaHistory} from '@/server/g7-operational/greenfield-schema';
import type {G7RuntimeActiveGate} from '@/server/g7-operational/runtime-gate';

type Tx=Prisma.TransactionClient;
type Kind='OUTLINE'|'ZONE';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(code:string,status:number):never{throw new CadError(code,'트리 요청을 처리할 수 없습니다. 다시 조회하세요.',status);}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))fail('TREE_INPUT_INVALID',400);return value as Record<string,unknown>;}
function exact(value:Record<string,unknown>,allowed:string[],required:string[]):void{
 if(Object.keys(value).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(value,k)))fail('TREE_INPUT_INVALID',400);
}
function id(value:unknown):string{if(typeof value!=='string'||!UUID.test(value))fail('TREE_INPUT_INVALID',400);return value as string;}
function nullableId(value:unknown):string|null{return value===null?null:id(value);}
function rev(value:unknown,allowZero=false):number{
 if(!Number.isSafeInteger(value)||Number(value)<(allowZero?0:1))fail('TREE_INPUT_INVALID',400);
 return value as number;
}
function order(value:unknown):number{
 if(!Number.isSafeInteger(value)||Number(value)<0||Number(value)>9999)fail('TREE_INPUT_INVALID',400);
 return value as number;
}
function name(value:unknown):{name:string;nameKey:string}{
 if(typeof value!=='string')fail('TREE_INPUT_INVALID',400);
 const normalized=(value as string).trim().normalize('NFC');
 if(!normalized||normalized.length>100||/[\x00-\x1f\x7f]/.test(normalized))fail('TREE_INPUT_INVALID',400);
 return {name:normalized,nameKey:normalized.toLocaleLowerCase('ko-KR')};
}
async function schema(tx:Tx):Promise<void>{
 const rows=await tx.$queryRawUnsafe<{migration_name:string}[]>('SELECT migration_name FROM "_prisma_migrations" ORDER BY rowid');
 if(!hasG7FeatureSchemaHistory(rows,'tree'))fail('TREE_SCHEMA_UNAVAILABLE',503);
}
async function scope(tx:Tx,versionId:string){
 const version=await tx.cadFileVersion.findUnique({where:{id:versionId},select:{id:true,sha256:true,locationId:true,fileFormat:true,location:{select:{building:{select:{siteId:true}}}}}});
 if(!version)fail('TREE_VERSION_NOT_FOUND',404);
 if(version!.fileFormat!=='DXF')fail('TREE_DXF_ONLY',415);
 return {versionId,sourceSha256:version!.sha256,locationId:version!.locationId,siteId:version!.location.building.siteId};
}
function current(gate:G7RuntimeActiveGate){try{assertRuntimeApprovalCurrent(gate);}catch{fail('G7_RUNTIME_BLOCKED',503);}}
async function folder(tx:Tx,versionId:string,folderId:string|null,expected:number|null){
 if(folderId===null){if(expected!==null)fail('TREE_INPUT_INVALID',400);return null;}
 if(expected===null)fail('TREE_INPUT_INVALID',400);
 const row=await tx.treeFolder.findFirst({where:{id:folderId,versionId,deletedAt:null}});
 if(!row)fail('TREE_FOLDER_NOT_FOUND',409);
 if(row!.revision!==expected)fail('TREE_REVISION_CONFLICT',409);
 return row!;
}
async function assertObject(tx:Tx,s:Awaited<ReturnType<typeof scope>>,kind:Kind,objectId:string):Promise<void>{
 if(kind==='OUTLINE'){
  const row=await tx.cadOutline.findFirst({where:{id:objectId,versionId:s.versionId,deletedAt:null},select:{id:true}});
  if(!row)fail('TREE_OBJECT_NOT_FOUND',404);
 }else{
  const row=await tx.cadZone.findFirst({where:{id:objectId,locationId:s.locationId,parentZoneId:null,deletedAt:null},select:{id:true}});
  if(!row)fail('TREE_OBJECT_NOT_FOUND',404);
 }
}
async function audit(tx:Tx,proof:G7CadWrite,s:Awaited<ReturnType<typeof scope>>,actorId:string,
 targetKind:'FOLDER'|Kind,targetId:string,action:'CREATE'|'EDIT'|'MOVE'|'DELETE',before:number|null,after:number|null):Promise<void>{
 const actor=await requireG7CadPermission(tx,proof,'zone:write',{kind:'version',versionId:s.versionId});
 if(actor.actorId!==actorId||actor.siteId!==s.siteId)fail('TREE_ACCESS_DENIED',403);
 await tx.treeAudit.create({data:{id:randomUUID(),actorUserId:actorId,siteId:s.siteId,versionId:s.versionId,
  targetKind,targetId,action,beforeRevision:before,afterRevision:after,requestId:proof.requestId,timestampUtc:new Date().toISOString()}});
 const gate=requireG7RuntimeWrite(proof);if(!gate)fail('G7_RUNTIME_BLOCKED',503);current(gate);
}
export async function readTree(db:Database,request:Request,versionId:string,gate:G7RuntimeActiveGate){
 return writeTransaction(db,async tx=>{
  const actor=await requireSceneRead(request,tx,versionId,gate,'zone:read');
  if(!actor)fail('TREE_AUTH_REQUIRED',401);
  await schema(tx);const s=await scope(tx,versionId);
  const [folders,memberships,outlines,zones,categories,geometries,scene,types]=await Promise.all([
   tx.treeFolder.findMany({where:{versionId,deletedAt:null},orderBy:[{sortOrder:'asc'},{name:'asc'},{id:'asc'}]}),
   tx.treeMembership.findMany({where:{versionId}}),
   tx.cadOutline.findMany({where:{versionId,deletedAt:null},select:{id:true,name:true,kind:true,outlineTypeId:true,geometryJson:true}}),
   tx.cadZone.findMany({where:{locationId:s.locationId,deletedAt:null},select:{id:true,name:true,code:true,categoryId:true,parentZoneId:true,sortOrder:true}}),
   tx.zoneCategory.findMany({where:{siteId:s.siteId},select:{id:true,name:true}}),
   tx.cadZoneGeometry.findMany({where:{versionId},select:{zoneId:true,state:true,sourceSha256:true,sceneRevision:true}}),
   tx.currentScene.findUnique({where:{versionId},select:{revision:true}}),
   tx.outlineType.findMany({select:{id:true,name:true,active:true}}),
  ]);
  const allowed=new Set([...outlines.map(o=>'OUTLINE:'+o.id),...zones.filter(z=>z.parentZoneId===null).map(z=>'ZONE:'+z.id)]);
  const reread=await requireSceneRead(request,tx,versionId,gate,'zone:read');
  if(!reread||reread.actorId!==actor.actorId||reread.siteId!==actor.siteId)fail('TREE_AUTH_REQUIRED',401);
  current(gate);
  return {...s,actorId:actor.actorId,canEdit:actor.canWrite,folders,memberships:memberships.filter(m=>allowed.has(m.kind+':'+m.objectId)),
   outlines:outlines.map(({geometryJson,...o})=>({...o,bounds:extractBounds(geometryJson)})),
   zones:zones.map(z=>{const g=geometries.find(item=>item.zoneId===z.id);return {...z,geometryState:!g?null:g.state==='MAPPED'&&g.sourceSha256===s.sourceSha256&&g.sceneRevision===scene?.revision?'MAPPED':'UNMAPPED'};}),categories,types:types.filter(t=>outlines.some(o=>o.outlineTypeId===t.id))};
 });
}
function extractBounds(json:string):{minX:number;minY:number;maxX:number;maxY:number}|null{
 try{return outlineGeometryBounds(JSON.parse(json));}catch{return null;}
}
async function uniqueName(tx:Tx,versionId:string,parentFolderId:string|null,nameKey:string,except?:string){
 const existing=await tx.treeFolder.findMany({where:{versionId,parentFolderId,deletedAt:null},select:{id:true,nameKey:true}});
 if(existing.some(f=>f.id!==except&&f.nameKey===nameKey))fail('TREE_NAME_CONFLICT',409);
}
export async function createTreeFolder(db:Database,versionId:string,raw:unknown,proof:G7CadWrite){
 const b=object(raw);exact(b,['name','parentFolderId','expectedParentRevision','sortOrder'],['name','parentFolderId','expectedParentRevision','sortOrder']);
 const n=name(b.name),parentId=nullableId(b.parentFolderId),expected=b.expectedParentRevision===null?null:rev(b.expectedParentRevision),sortOrder=order(b.sortOrder);
 return writeTransaction(db,async tx=>{
  const actor=await requireG7CadPermission(tx,proof,'zone:write',{kind:'version',versionId});await schema(tx);const s=await scope(tx,versionId);
  await folder(tx,versionId,parentId,expected);await uniqueName(tx,versionId,parentId,n.nameKey);
  const now=new Date().toISOString(),newId=randomUUID();
  const created=await tx.treeFolder.create({data:{id:newId,versionId,parentFolderId:parentId,...n,sortOrder,revision:1,createdById:actor.actorId,updatedById:actor.actorId,createdAt:now,updatedAt:now}});
  await audit(tx,proof,s,actor.actorId,'FOLDER',newId,'CREATE',null,1);
  return {folder:created};
 });
}
export async function changeTreeFolder(db:Database,versionId:string,folderId:string,raw:unknown,proof:G7CadWrite,remove:boolean){
 const b=object(raw);exact(b,remove?['expectedRevision']:['expectedRevision','name','parentFolderId','expectedParentRevision','sortOrder'],
  remove?['expectedRevision']:['expectedRevision','name','parentFolderId','expectedParentRevision','sortOrder']);
 const expected=rev(b.expectedRevision),parentId=remove?null:nullableId(b.parentFolderId),parentExpected=remove?null:b.expectedParentRevision===null?null:rev(b.expectedParentRevision),n=remove?null:name(b.name),sortOrder=remove?0:order(b.sortOrder);
 return writeTransaction(db,async tx=>{
  const actor=await requireG7CadPermission(tx,proof,'zone:write',{kind:'version',versionId});await schema(tx);const s=await scope(tx,versionId);
  const old=await tx.treeFolder.findFirst({where:{id:folderId,versionId,deletedAt:null}});
  if(!old)fail('TREE_FOLDER_NOT_FOUND',404);if(old!.revision!==expected)fail('TREE_REVISION_CONFLICT',409);
  if(remove){
   const admin=await tx.userRoleGrant.findFirst({where:{userId:actor.actorId,role:'Admin'}});
   if(old!.createdById!==actor.actorId&&!admin)fail('TREE_DELETE_DENIED',403);
   if(await tx.treeFolder.count({where:{versionId,parentFolderId:folderId,deletedAt:null}}))fail('TREE_FOLDER_NOT_EMPTY',409);
   const all=await tx.treeMembership.findMany({where:{versionId,folderId}});
   for(const m of all){
    if(m.kind==='OUTLINE'&&await tx.cadOutline.count({where:{id:m.objectId,versionId,deletedAt:null}})||
       m.kind==='ZONE'&&await tx.cadZone.count({where:{id:m.objectId,locationId:s.locationId,parentZoneId:null,deletedAt:null}}))fail('TREE_FOLDER_NOT_EMPTY',409);
   }
  }else{
   if(parentId===folderId)fail('TREE_PARENT_INVALID',409);
   await folder(tx,versionId,parentId,parentExpected);await uniqueName(tx,versionId,parentId,n!.nameKey,folderId);
   const all=await tx.treeFolder.findMany({where:{versionId,deletedAt:null},select:{id:true,parentFolderId:true}});
   let cursor=parentId;const seen=new Set<string>();while(cursor){if(cursor===folderId||seen.has(cursor))fail('TREE_PARENT_INVALID',409);seen.add(cursor);cursor=all.find(f=>f.id===cursor)?.parentFolderId??null;}
  }
  const now=new Date().toISOString();
  const changed=await tx.treeFolder.updateMany({where:{id:folderId,versionId,revision:expected,deletedAt:null},data:{...remove?{deletedAt:now,deletedById:actor.actorId}:{...n!,parentFolderId:parentId,sortOrder},revision:expected+1,updatedById:actor.actorId,updatedAt:now}});
  if(changed.count!==1)fail('TREE_REVISION_CONFLICT',409);
  await audit(tx,proof,s,actor.actorId,'FOLDER',folderId,remove?'DELETE':'EDIT',expected,expected+1);
  return {folder:await tx.treeFolder.findUnique({where:{id:folderId}})};
 });
}
export async function changeTreeMembership(db:Database,versionId:string,raw:unknown,proof:G7CadWrite){
 const b=object(raw);exact(b,['kind','objectId','folderId','expectedRevision','expectedFolderRevision','sortOrder'],['kind','objectId','folderId','expectedRevision','expectedFolderRevision','sortOrder']);
 if(b.kind!=='OUTLINE'&&b.kind!=='ZONE')fail('TREE_INPUT_INVALID',400);
 const kind=b.kind as Kind,objectId=id(b.objectId),folderId=nullableId(b.folderId),expected=rev(b.expectedRevision,true),folderExpected=b.expectedFolderRevision===null?null:rev(b.expectedFolderRevision),sortOrder=order(b.sortOrder);
 return writeTransaction(db,async tx=>{
  const actor=await requireG7CadPermission(tx,proof,'zone:write',{kind:'version',versionId});await schema(tx);const s=await scope(tx,versionId);
  await assertObject(tx,s,kind,objectId);await folder(tx,versionId,folderId,folderExpected);
  const old=await tx.treeMembership.findUnique({where:{versionId_kind_objectId:{versionId,kind,objectId}}});
  if((old?.revision??0)!==expected)fail('TREE_REVISION_CONFLICT',409);
  const now=new Date().toISOString();let membership;
  if(old){const changed=await tx.treeMembership.updateMany({where:{id:old.id,revision:expected},data:{folderId,sortOrder,revision:expected+1,updatedById:actor.actorId,updatedAt:now}});
   if(changed.count!==1)fail('TREE_REVISION_CONFLICT',409);
   membership=await tx.treeMembership.findUnique({where:{id:old.id}});
  }else membership=await tx.treeMembership.create({data:{id:randomUUID(),versionId,kind,objectId,folderId,sortOrder,revision:1,createdById:actor.actorId,updatedById:actor.actorId,createdAt:now,updatedAt:now}});
  await audit(tx,proof,s,actor.actorId,kind,objectId,'MOVE',old?.revision??null,membership!.revision);
  return {membership};
 });
}
