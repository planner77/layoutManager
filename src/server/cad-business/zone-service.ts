/** #196: G7-only, floor-owned semantic zones and Site-owned category catalogue. */
import {createHash,randomUUID} from 'node:crypto';
import type {Prisma} from '@/generated/prisma/client';
import {CadError} from '@/domain/cad';
import {assertZoneParent,normalizeZoneMetadata,validateZonePolygon,zoneContainsPolygon,
  zoneNameKey,type CadZoneDto,type ZoneCategoryDto,type ZoneGeometryDto,type ZoneListDto,
  type ZoneMetadata,type ZonePolygon} from '@/domain/cad-zone';
import {writeTransaction,type Database} from '@/server/db';
import {requireSceneRead} from '@/server/scene/scene-context';
import {requireG7CadPermission,requireG7RuntimeWrite,type G7CadWrite} from '@/server/g7-operational/cad-guard';
import {assertRuntimeApprovalCurrent} from '@/server/g7-operational/runtime-handler';
import {G7_GREENFIELD_BASELINE} from '@/server/g7-operational/greenfield-schema';
import type {G7RuntimeActiveGate} from '@/server/g7-operational/runtime-gate';

type Tx=Prisma.TransactionClient;
type ZoneRow=Awaited<ReturnType<Tx['cadZone']['findFirst']>> & {};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const messages:Record<string,string>={
 ZONE_NOT_CONTAINED:'자식 구역 경계가 부모 구역 경계를 벗어납니다.',
 ZONE_PARENT_INVALID:'같은 층의 삭제되지 않은 부모를 선택하세요. 순환 관계는 허용되지 않습니다.',
 ZONE_HAS_CHILDREN:'하위 구역을 먼저 정리하세요.',
 ZONE_REVISION_CONFLICT:'다른 변경이 먼저 저장되었습니다. 구역을 다시 조회하세요.',
 ZONE_SCENE_CONFLICT:'Scene 버전이 변경되었습니다. 현재 도면을 다시 조회하세요.',
 ZONE_SOURCE_CHANGED:'원본 도면이 변경되었습니다. 다시 조회하세요.',
 ZONE_CATEGORY_IN_USE:'참조 중인 구역이 있어 카테고리를 삭제할 수 없습니다.',
 ZONE_CATEGORY_UNAVAILABLE:'선택한 카테고리를 사용할 수 없습니다.',
 ZONE_NAME_CONFLICT:'같은 층에 같은 이름의 구역이 있습니다.',
 ZONE_GEOMETRY_INVALID:'경계는 닫힌 단순 Polygon이어야 합니다. 교차·중복점·0면적을 확인하세요.',
 ZONE_DELETE_DENIED:'구역 작성자 또는 해당 Site 관리자만 삭제할 수 있습니다.',
 ZONE_IDEMPOTENCY_CONFLICT:'같은 재시도 키에 다른 내용이 사용되었습니다.',
};
const fail=(code:string,status:number):never=>{throw new CadError(code,messages[code]??'구역 요청을 처리할 수 없습니다.',status);};
function id(value:unknown):string{if(typeof value!=='string'||!UUID.test(value))fail('ZONE_INPUT_INVALID',400);return value as string;}
function obj(raw:unknown):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('ZONE_INPUT_INVALID',400);
 return raw as Record<string,unknown>;
}
function exact(raw:Record<string,unknown>,allowed:readonly string[],required:readonly string[]=[]):void{
 if(Object.keys(raw).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(raw,k)))fail('ZONE_INPUT_INVALID',400);
}
function revision(raw:unknown):number{
 if(!Number.isSafeInteger(raw)||Number(raw)<1)fail('ZONE_INPUT_INVALID',400);
 return raw as number;
}
function normalizeMeta(raw:unknown):ZoneMetadata{
 try{return normalizeZoneMetadata(raw);}catch{return fail('ZONE_INPUT_INVALID',400);}
}
function normalizeGeom(raw:unknown){
 const g=obj(raw);exact(g,['sourceSha256','sceneRevision','polygon'],['sourceSha256','sceneRevision','polygon']);
 if(typeof g.sourceSha256!=='string'||!/^[0-9a-f]{64}$/i.test(g.sourceSha256)||
    !Number.isSafeInteger(g.sceneRevision)||Number(g.sceneRevision)<0)fail('ZONE_INPUT_INVALID',400);
 try{return {sourceSha256:(g.sourceSha256 as string).toLowerCase(),sceneRevision:g.sceneRevision as number,
   ...validateZonePolygon(g.polygon)};}
 catch{return fail('ZONE_GEOMETRY_INVALID',400);}
}
function stable(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b))
  .map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';
 return JSON.stringify(value)??'null';
}
async function schema(tx:Tx):Promise<void>{
 const rows=await tx.$queryRawUnsafe<{migration_name:string}[]>('SELECT migration_name FROM "_prisma_migrations"');
 if(rows.length!==1||rows[0].migration_name!==G7_GREENFIELD_BASELINE)fail('ZONE_SCHEMA_UNAVAILABLE',503);
}
async function version(tx:Tx,versionId:string){
 const v=await tx.cadFileVersion.findUnique({where:{id:versionId},
  select:{id:true,sha256:true,fileFormat:true,locationId:true,location:{select:{building:{select:{siteId:true}}}}}});
 if(!v)return fail('ZONE_VERSION_NOT_FOUND',404);
 if(v.fileFormat!=='DXF')fail('ZONE_DXF_ONLY',415);
 return v!;
}
function current(gate:G7RuntimeActiveGate){
 try{assertRuntimeApprovalCurrent(gate);}catch{fail('G7_RUNTIME_BLOCKED',503);}
}
function dtoCategory(c:{id:string;name:string;revision:number;active:boolean;sortOrder:number}):ZoneCategoryDto{
 return {id:c.id,name:c.name,revision:c.revision,active:c.active,sortOrder:c.sortOrder};
}
function dtoZone(z:NonNullable<ZoneRow>,g:ZoneGeometryDto|null):CadZoneDto{
 return {id:z.id,locationId:z.locationId,siteId:z.siteId,name:z.name,categoryId:z.categoryId,
  description:z.description,code:z.code,tags:JSON.parse(z.tagsJson),sortOrder:z.sortOrder,
  parentZoneId:z.parentZoneId,references:JSON.parse(z.referencesJson),revision:z.revision,
  createdById:z.createdById,updatedById:z.updatedById,createdAt:z.createdAt,updatedAt:z.updatedAt,geometry:g};
}
function dtoGeometry(g:{versionId:string;sourceSha256:string;sceneRevision:number;polygonJson:string;
 boundsJson:string;area:number;state:string;revision:number;reason:string|null},
 sha:string,sceneRevision:number|null):ZoneGeometryDto{
 const usable=g.state==='MAPPED'&&g.sourceSha256===sha&&sceneRevision===g.sceneRevision;
 return {versionId:g.versionId,sourceSha256:g.sourceSha256,sceneRevision:g.sceneRevision,
  polygon:JSON.parse(g.polygonJson),bounds:JSON.parse(g.boundsJson),area:g.area,
  state:usable?'MAPPED':'UNMAPPED',revision:g.revision,
  ...(!usable?{reason:g.reason??(g.sourceSha256!==sha?'SOURCE_CHANGED':'SCENE_CHANGED')}:{})};
}
async function audit(tx:Tx,proof:G7CadWrite,actorId:string,siteId:string,locationId:string|null,
 versionId:string|null,kind:'ZONE'|'CATEGORY'|'GEOMETRY',targetId:string,
 action:'CREATE'|'EDIT'|'DELETE'|'UNMAP',before:number|null,after:number|null){
 const permitted=await requireG7CadPermission(tx,proof,kind==='CATEGORY'?'zoneCategory:manage':'zone:write',
  {kind:'version',versionId:versionId!});
 if(permitted.actorId!==actorId||permitted.siteId!==siteId)fail('ZONE_ACCESS_DENIED',403);
 await tx.cadZoneAudit.create({data:{id:randomUUID(),actorUserId:actorId,siteId,
  locationId,versionId,targetKind:kind,targetId,action,beforeRevision:before,afterRevision:after,
  requestId:proof.requestId,timestampUtc:new Date().toISOString()}});
}
async function checkCategory(tx:Tx,siteId:string,next:string|null,prior:string|null):Promise<void>{
 if(!next)return;
 const c=await tx.zoneCategory.findFirst({where:{id:next,siteId}});
 if(!c||(next!==prior&&!c.active))fail('ZONE_CATEGORY_UNAVAILABLE',409);
}
async function uniqueName(tx:Tx,locationId:string,name:string,except?:string):Promise<void>{
 const rows=await tx.cadZone.findMany({where:{locationId,deletedAt:null},select:{id:true,name:true}});
 if(rows.some(row=>row.id!==except&&zoneNameKey(row.name)===zoneNameKey(name)))fail('ZONE_NAME_CONFLICT',409);
}
async function parentValid(tx:Tx,locationId:string,zoneId:string,parentZoneId:string|null):Promise<void>{
 const zones=await tx.cadZone.findMany({where:{locationId,deletedAt:null},
  select:{id:true,locationId:true,parentZoneId:true}});
 const next=zones.some(z=>z.id===zoneId)
  ?zones.map(z=>z.id===zoneId?{...z,parentZoneId}:z)
  :[...zones,{id:zoneId,locationId,parentZoneId}];
 try{assertZoneParent(next,zoneId,parentZoneId);}catch{fail('ZONE_PARENT_INVALID',409);}
}
async function sceneExact(tx:Tx,versionId:string,sha:string,sceneRevision:number):Promise<void>{
 const v=await version(tx,versionId);
 if(v.sha256.toLowerCase()!==sha)fail('ZONE_SOURCE_CHANGED',409);
 const pointer=await tx.currentScene.findUnique({where:{versionId}});
 if(!pointer||pointer.revision!==sceneRevision)fail('ZONE_SCENE_CONFLICT',409);
}
/** Validates every currently usable same-version parent/child pair in the floor. */
async function hierarchy(tx:Tx,locationId:string):Promise<void>{
 const zones=await tx.cadZone.findMany({where:{locationId,deletedAt:null},select:{id:true,locationId:true,parentZoneId:true}});
 try{for(const z of zones)assertZoneParent(zones,z.id,z.parentZoneId);}catch{fail('ZONE_PARENT_INVALID',409);}
 const geoms=await tx.cadZoneGeometry.findMany({where:{locationId,state:'MAPPED'}});
 const versions=await tx.cadFileVersion.findMany({where:{locationId},select:{id:true,sha256:true}});
 const scenes=await tx.currentScene.findMany({where:{versionId:{in:versions.map(v=>v.id)}},select:{versionId:true,revision:true}});
 const source=new Map(versions.map(v=>[v.id,v.sha256]));const scene=new Map(scenes.map(s=>[s.versionId,s.revision]));
 const map=new Map(geoms.filter(g=>g.sourceSha256===source.get(g.versionId)&&g.sceneRevision===scene.get(g.versionId))
  .map(g=>[g.zoneId+'|'+g.versionId,JSON.parse(g.polygonJson) as ZonePolygon]));
 for(const z of zones){
  if(!z.parentZoneId)continue;
  for(const v of versions){
   const child=map.get(z.id+'|'+v.id),parent=map.get(z.parentZoneId+'|'+v.id);
   if(child&&parent&&!zoneContainsPolygon(parent,child))fail('ZONE_NOT_CONTAINED',409);
  }
 }
}
function metaData(meta:ZoneMetadata){return {name:meta.name,nameKey:zoneNameKey(meta.name),categoryId:meta.categoryId,
 description:meta.description,code:meta.code,tagsJson:JSON.stringify(meta.tags),sortOrder:meta.sortOrder,
 parentZoneId:meta.parentZoneId,referencesJson:JSON.stringify(meta.references)};}
async function selected(tx:Tx,zoneId:string,versionId:string,sha:string,scene:number|null):Promise<CadZoneDto>{
 const z=await tx.cadZone.findUniqueOrThrow({where:{id:zoneId}});
 const g=await tx.cadZoneGeometry.findUnique({where:{zoneId_versionId:{zoneId,versionId}}});
 return dtoZone(z,g?dtoGeometry(g,sha,scene):null);
}
export async function listZones(db:Database,request:Request,versionId:string,gate:G7RuntimeActiveGate):Promise<ZoneListDto>{
 return writeTransaction(db,async tx=>{
  const actor=await requireSceneRead(request,tx,versionId,gate,'zone:read');
  if(!actor)return fail('ZONE_AUTH_REQUIRED',401);
  await schema(tx);
  const v=await version(tx,versionId),siteId=v.location.building.siteId;
  const pointer=await tx.currentScene.findUnique({where:{versionId}});
  const [zones,categories,geoms,admin]=await Promise.all([
   tx.cadZone.findMany({where:{locationId:v.locationId,deletedAt:null},orderBy:[{sortOrder:'asc'},{name:'asc'},{id:'asc'}]}),
   tx.zoneCategory.findMany({where:{siteId},orderBy:[{sortOrder:'asc'},{name:'asc'},{id:'asc'}]}),
   tx.cadZoneGeometry.findMany({where:{versionId,locationId:v.locationId}}),
   tx.userRoleGrant.findFirst({where:{userId:actor.actorId,role:'Admin'},select:{userId:true}}),
  ]);
  const mapped=new Map(geoms.map(g=>[g.zoneId,g]));
  const reread=await requireSceneRead(request,tx,versionId,gate,'zone:read');
  if(!reread||reread.actorId!==actor.actorId)fail('ZONE_AUTH_REQUIRED',401);
  current(gate);
  return {zones:zones.map(z=>dtoZone(z,mapped.has(z.id)?dtoGeometry(mapped.get(z.id)!,v.sha256,pointer?.revision??null):null)),
   categories:categories.map(dtoCategory),actorId:actor.actorId,canEdit:actor.canWrite,
   canDeleteAny:actor.canWrite&&!!admin,canManageCategories:actor.canWrite&&!!admin,
   locationId:v.locationId,siteId,versionId,sourceSha256:v.sha256,sceneRevision:pointer?.revision??null};
 });
}
export async function createZone(db:Database,versionId:string,raw:unknown,proof:G7CadWrite,key:string|null){
 const b=obj(raw);exact(b,['name','categoryId','description','code','tags','sortOrder','parentZoneId','references','geometry'],
  ['name']);
 if(!key||!UUID.test(key))return fail('ZONE_IDEMPOTENCY_REQUIRED',400);
 const meta=normalizeMeta(b),geom=b.geometry===undefined?null:normalizeGeom(b.geometry);
 const digest=createHash('sha256').update(stable({meta,geom})).digest('hex');
 return writeTransaction(db,async tx=>{
  const actor=await requireG7CadPermission(tx,proof,'zone:write',{kind:'version',versionId});
  await schema(tx);const v=await version(tx,versionId);
  const receipt=await tx.cadZoneCreateReceipt.findUnique({where:{actorUserId_versionId_idempotencyKey:{
   actorUserId:actor.actorId,versionId,idempotencyKey:key}}});
  if(receipt){
   if(receipt.requestSha256!==digest)fail('ZONE_IDEMPOTENCY_CONFLICT',409);
   const existing=await tx.cadZone.findUnique({where:{id:receipt.zoneId}});
   if(!existing||existing.deletedAt)return fail('ZONE_REPLAY_DELETED',410);
   const ptr=await tx.currentScene.findUnique({where:{versionId}});
   const replayGate=requireG7RuntimeWrite(proof);if(!replayGate)return fail('G7_RUNTIME_BLOCKED',503);current(replayGate);
   return {zone:await selected(tx,existing.id,versionId,v.sha256,ptr?.revision??null),replayed:true};
  }
  await checkCategory(tx,actor.siteId,meta.categoryId,null);
  await uniqueName(tx,v.locationId,meta.name);
  if(geom)await sceneExact(tx,versionId,geom.sourceSha256,geom.sceneRevision);
  if(await tx.cadZone.count({where:{locationId:v.locationId,deletedAt:null}})>=200)fail('ZONE_LIMIT',413);
  const now=new Date().toISOString(),zoneId=randomUUID();
  await parentValid(tx,v.locationId,zoneId,meta.parentZoneId);
  await tx.cadZone.create({data:{id:zoneId,locationId:v.locationId,siteId:actor.siteId,
   ...metaData(meta),revision:1,createdById:actor.actorId,updatedById:actor.actorId,
   createdAt:now,updatedAt:now}});
  if(geom)await tx.cadZoneGeometry.create({data:{zoneId,locationId:v.locationId,versionId,
   sourceSha256:geom.sourceSha256,sceneRevision:geom.sceneRevision,
   polygonJson:JSON.stringify(geom.polygon),boundsJson:JSON.stringify(geom.bounds),area:geom.area,
   state:'MAPPED',revision:1,createdAt:now,updatedAt:now}});
  await hierarchy(tx,v.locationId);
  await audit(tx,proof,actor.actorId,actor.siteId,v.locationId,versionId,'ZONE',zoneId,'CREATE',null,1);
  await tx.cadZoneCreateReceipt.create({data:{id:randomUUID(),actorUserId:actor.actorId,
   versionId,idempotencyKey:key,requestSha256:digest,zoneId,createdAt:now}});
  const ptr=await tx.currentScene.findUnique({where:{versionId}});
  return {zone:await selected(tx,zoneId,versionId,v.sha256,ptr?.revision??null),replayed:false};
 });
}
export async function changeZone(db:Database,versionId:string,zoneId:string,raw:unknown,proof:G7CadWrite,remove:boolean){
 id(zoneId);const b=obj(raw);exact(b,remove?['expectedRevision']:['expectedRevision','name','categoryId','description','code','tags','sortOrder','parentZoneId','references','geometry'],
  remove?['expectedRevision']:['expectedRevision','name','categoryId','description','code','tags','sortOrder','parentZoneId','references']);
 const expected=revision(b.expectedRevision),meta=remove?null:normalizeMeta(b),geom=!remove&&b.geometry!==undefined?normalizeGeom(b.geometry):null;
 return writeTransaction(db,async tx=>{
  const actor=await requireG7CadPermission(tx,proof,'zone:write',{kind:'version',versionId});
  await schema(tx);const v=await version(tx,versionId);
  const old=await tx.cadZone.findFirst({where:{id:zoneId,locationId:v.locationId,deletedAt:null}});
  if(!old)return fail('ZONE_NOT_FOUND',404);
  if(old.revision!==expected)fail('ZONE_REVISION_CONFLICT',409);
  if(remove){
   const admin=await tx.userRoleGrant.findFirst({where:{userId:actor.actorId,role:'Admin'},select:{userId:true}});
   if(old.createdById!==actor.actorId&&!admin)fail('ZONE_DELETE_DENIED',403);
   if(await tx.cadZone.count({where:{parentZoneId:zoneId,locationId:v.locationId,deletedAt:null}})>0)
    fail('ZONE_HAS_CHILDREN',409);
  }else{
   await checkCategory(tx,actor.siteId,meta!.categoryId,old.categoryId);
   await uniqueName(tx,v.locationId,meta!.name,zoneId);
   await parentValid(tx,v.locationId,zoneId,meta!.parentZoneId);
   if(geom)await sceneExact(tx,versionId,geom.sourceSha256,geom.sceneRevision);
  }
  const now=new Date().toISOString();
  const changed=await tx.cadZone.updateMany({where:{id:zoneId,locationId:v.locationId,revision:expected,deletedAt:null},
   data:{...(remove?{deletedAt:now,deletedById:actor.actorId}:metaData(meta!)),revision:expected+1,
    updatedById:actor.actorId,updatedAt:now}});
  if(changed.count!==1)fail('ZONE_REVISION_CONFLICT',409);
  if(geom){
   const oldGeom=await tx.cadZoneGeometry.findUnique({where:{zoneId_versionId:{zoneId,versionId}}});
   const data={sourceSha256:geom.sourceSha256,sceneRevision:geom.sceneRevision,
    polygonJson:JSON.stringify(geom.polygon),boundsJson:JSON.stringify(geom.bounds),area:geom.area,
    state:'MAPPED',reason:null,updatedAt:now};
   if(oldGeom)await tx.cadZoneGeometry.update({where:{zoneId_versionId:{zoneId,versionId}},
    data:{...data,revision:oldGeom.revision+1}});
   else await tx.cadZoneGeometry.create({data:{zoneId,locationId:v.locationId,versionId,
    ...data,revision:1,createdAt:now}});
  }
  if(!remove)await hierarchy(tx,v.locationId);
  await audit(tx,proof,actor.actorId,actor.siteId,v.locationId,versionId,'ZONE',zoneId,remove?'DELETE':'EDIT',expected,expected+1);
  const ptr=await tx.currentScene.findUnique({where:{versionId}});
  return remove?{deleted:true,revision:expected+1}:{zone:await selected(tx,zoneId,versionId,v.sha256,ptr?.revision??null)};
 });
}
export async function listZoneCategories(db:Database,request:Request,versionId:string,gate:G7RuntimeActiveGate){
 const list=await listZones(db,request,versionId,gate);
 return {categories:list.categories,actorId:list.actorId,siteId:list.siteId,
  canManageCategories:list.canManageCategories};
}
function categoryInput(raw:unknown,patch:boolean){
 const b=obj(raw);exact(b,patch?['expectedRevision','name','sortOrder','active']:['name','sortOrder'],
  patch?['expectedRevision']:['name','sortOrder']);
 if(typeof b.name!=='string'&&!patch)fail('ZONE_INPUT_INVALID',400);
 if(b.name!==undefined){
  try{normalizeZoneMetadata({name:b.name});}catch{fail('ZONE_INPUT_INVALID',400);}
 }
 if(b.sortOrder!==undefined&&(!Number.isSafeInteger(b.sortOrder)||Number(b.sortOrder)<0||Number(b.sortOrder)>9999))fail('ZONE_INPUT_INVALID',400);
 if(b.active!==undefined&&typeof b.active!=='boolean')fail('ZONE_INPUT_INVALID',400);
 return b;
}
export async function createZoneCategory(db:Database,versionId:string,raw:unknown,proof:G7CadWrite){
 const b=categoryInput(raw,false),name=normalizeMeta({name:b.name}).name;
 return writeTransaction(db,async tx=>{
  const actor=await requireG7CadPermission(tx,proof,'zoneCategory:manage',{kind:'version',versionId});
  await schema(tx);await version(tx,versionId);
  if(await tx.zoneCategory.findFirst({where:{siteId:actor.siteId,nameKey:zoneNameKey(name)}}))fail('ZONE_CATEGORY_CONFLICT',409);
  const now=new Date().toISOString(),id=randomUUID();
  const category=await tx.zoneCategory.create({data:{id,siteId:actor.siteId,name,nameKey:zoneNameKey(name),
   active:true,sortOrder:b.sortOrder as number,revision:1,createdById:actor.actorId,
   updatedById:actor.actorId,createdAt:now,updatedAt:now}});
  await audit(tx,proof,actor.actorId,actor.siteId,null,versionId,'CATEGORY',id,'CREATE',null,1);
  return {category:dtoCategory(category)};
 });
}
export async function changeZoneCategory(db:Database,versionId:string,categoryId:string,raw:unknown,proof:G7CadWrite,remove:boolean){
 id(categoryId);const b=remove?obj(raw):categoryInput(raw,true);
 if(remove)exact(b,['expectedRevision'],['expectedRevision']);
 const expected=revision(b.expectedRevision);
 return writeTransaction(db,async tx=>{
  const actor=await requireG7CadPermission(tx,proof,'zoneCategory:manage',{kind:'version',versionId});
  await schema(tx);await version(tx,versionId);
  const prior=await tx.zoneCategory.findFirst({where:{id:categoryId,siteId:actor.siteId}});
  if(!prior)return fail('ZONE_CATEGORY_NOT_FOUND',404);
  if(prior.revision!==expected)fail('ZONE_REVISION_CONFLICT',409);
  if(remove&&await tx.cadZone.count({where:{categoryId,siteId:actor.siteId}})>0)
   fail('ZONE_CATEGORY_IN_USE',409);
  const name=b.name===undefined?prior.name:normalizeMeta({name:b.name}).name,key=zoneNameKey(name);
  if(await tx.zoneCategory.findFirst({where:{siteId:actor.siteId,nameKey:key,id:{not:categoryId}}}))fail('ZONE_CATEGORY_CONFLICT',409);
  const category=await tx.zoneCategory.update({where:{id:categoryId},data:{name,nameKey:key,
   sortOrder:b.sortOrder===undefined?prior.sortOrder:b.sortOrder as number,
   active:remove?false:b.active===undefined?prior.active:b.active as boolean,
   revision:expected+1,updatedById:actor.actorId,updatedAt:new Date().toISOString()}});
  await audit(tx,proof,actor.actorId,actor.siteId,null,versionId,'CATEGORY',categoryId,
   remove?'DELETE':'EDIT',expected,expected+1);
  return {category:dtoCategory(category)};
 });
}
