/** #84: optional M3 anchor storage; only the newest exact Greenfield baseline.
 * Legacy v0.47.1 CadMemo columns are unchanged, and all anchor writes fail closed
 * if the new anchor table is absent. No private DXF source is exposed.
 */
import {randomUUID} from 'node:crypto';
import {CadError} from '@/domain/cad';
import {xy,projectAffine,invertAffine,type MemoAnchorState,type AnchorOrigin} from '@/domain/cad-memo-anchor';
import {writeTransaction,type Database} from '@/server/db';
import {requireG7CadPermission,type G7CadWrite} from '@/server/g7-operational/cad-guard';
import {geometry,keys,operations,point,revision,transformed,ID} from './validation';
import type {Prisma} from '@/generated/prisma/client';

type Tx=Prisma.TransactionClient;
function fail(code:string,status=409):never {throw new CadError(code,'메모 앵커가 현재 도면과 일치하지 않습니다.',status);}
export async function hasAnchorSchema(db:Database):Promise<boolean>{
 const rows=await db.$queryRawUnsafe<{name:string}[]>(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='CadMemoAnchor'");
 return rows.length===1;
}
export function anchorDto(a:{
 status:string;targetOrigin:string|null;targetId:string|null;localX:number|null;localY:number|null
}|null):MemoAnchorState{
 if(!a)return {mode:'FREE'};
 if(a.status==='BROKEN_ANCHOR')return {mode:'BROKEN_ANCHOR'};
 if(a.status!=='ATTACHED'||(a.targetOrigin!=='APP_CREATED'&&a.targetOrigin!=='DXF_IMPORTED')||
    !a.targetId||a.localX===null||a.localY===null)
  return fail('MEMO_ANCHOR_INVALID',503);
 return {mode:'ATTACHED',targetRef:{origin:a.targetOrigin,id:a.targetId},
  localAnchorWcsXY:xy(a.localX,a.localY)};
}
/** Explicit WCS move. The existing DB binding alone chooses the target. */
export async function repositionMemoAnchor(db:Database,versionId:string,memoId:string,
 raw:unknown,proof:G7CadWrite){
 const b=keys(raw,['operation','behavior','expectedRevision','expectedSceneRevision','anchorWcsXY'],
  ['expectedTargetRevision']);
 if(b.operation!=='reposition'||!ID.test(memoId))fail('MEMO_ANCHOR_OPERATION_INVALID',400);
 if(b.behavior!=='KEEP'&&b.behavior!=='DETACH')fail('MEMO_ANCHOR_BEHAVIOR_INVALID',400);
 const expected=revision(b.expectedRevision),expectedScene=revision(b.expectedSceneRevision);
 const world=point(b.anchorWcsXY);
 if(b.behavior==='DETACH'&&b.expectedTargetRevision!==undefined)
  fail('MEMO_ANCHOR_TARGET_REVISION_INVALID',400);
 if(!await hasAnchorSchema(db))fail('MEMO_ANCHOR_SCHEMA_UNAVAILABLE',503);
 return writeTransaction(db,async tx=>{
  const allowed=await requireG7CadPermission(tx,proof,'memo:write',{kind:'version',versionId});
  const memo=await tx.cadMemo.findFirst({where:{id:memoId,versionId,deletedAt:null}});
  if(!memo)fail('MEMO_ANCHOR_NOT_FOUND',404);
  if(memo.createdById!==allowed.actorId)fail('MEMO_ANCHOR_OWNER_REQUIRED',403);
  if(memo.revision!==expected)fail('MEMO_ANCHOR_REVISION_CONFLICT');
  const version=await tx.cadFileVersion.findUnique({where:{id:versionId},
   select:{sha256:true,fileFormat:true}});
  if(!version||version.fileFormat!=='DXF'||version.sha256!==memo.sourceSha256)
   fail('MEMO_ANCHOR_SOURCE_CONFLICT');
  const scene=await tx.currentScene.findUnique({where:{versionId}});
  if(!scene||scene.revision!==expectedScene)fail('MEMO_ANCHOR_SCENE_CONFLICT');
  const existing=await tx.cadMemoAnchor.findUnique({where:{memoId}});
  const now=new Date().toISOString();
  if(b.behavior==='KEEP'){
   if(!existing||existing.status!=='ATTACHED'||!existing.targetId||
      (existing.targetOrigin!=='APP_CREATED'&&existing.targetOrigin!=='DXF_IMPORTED')||
      existing.versionId!==versionId||existing.sourceSha256!==memo.sourceSha256)
    fail('MEMO_ANCHOR_NOT_ATTACHED');
   let local:{x:number;y:number};
   if(existing.targetOrigin==='APP_CREATED'){
    if(b.expectedTargetRevision===undefined)fail('MEMO_ANCHOR_TARGET_REVISION_REQUIRED',400);
    const targetRevision=revision(b.expectedTargetRevision);
    const row=await tx.cadOutline.findFirst({where:{id:existing.targetId,versionId,deletedAt:null}});
    if(!row||row.sourceSha256!==memo.sourceSha256)fail('MEMO_ANCHOR_TARGET_NOT_FOUND');
    if(row.revision!==targetRevision)fail('MEMO_ANCHOR_TARGET_REVISION_CONFLICT');
    try{
     const matrix=transformed(geometry(JSON.parse(row.baseGeometryJson)),
      operations(JSON.parse(row.transformJson))).transform;
     local=invertAffine(matrix,world);
    }catch{fail('MEMO_ANCHOR_TARGET_INVALID',422);}
   }else{
    if(b.expectedTargetRevision!==undefined)fail('MEMO_ANCHOR_TARGET_REVISION_INVALID',400);
    const refs=await tx.cadOutline.findMany({where:{versionId,sourceSha256:memo.sourceSha256,
     validationMode:'SOURCE_CANONICAL',deletedAt:null},select:{sourceRefsJson:true},take:100});
    if(!existing.targetId.startsWith(versionId+':'+memo.sourceSha256+':')||
       !refs.some(row=>{try{return (JSON.parse(row.sourceRefsJson) as string[]).includes(existing.targetId!);}
        catch{return false;}}))fail('MEMO_ANCHOR_SOURCE_UNVERIFIED',422);
    local=world;
   }
   await tx.cadMemoAnchor.update({where:{memoId},data:{localX:local.x,localY:local.y,updatedAt:now}});
  }else await tx.cadMemoAnchor.deleteMany({where:{memoId,versionId}});
  const changed=await tx.cadMemo.updateMany({where:{id:memoId,versionId,revision:expected,deletedAt:null},
   data:{anchorX:world.x,anchorY:world.y,revision:expected+1,updatedById:allowed.actorId,updatedAt:now}});
  if(changed.count!==1)fail('MEMO_ANCHOR_REVISION_CONFLICT');
  await audited(tx,proof,allowed.actorId,allowed.siteId,versionId,memoId,expected,expected+1);
  return {revision:expected+1,anchor:anchorDto(await tx.cadMemoAnchor.findUnique({where:{memoId}})),
   anchorWcsXY:world};
 });
}
async function audited(tx:Tx,proof:G7CadWrite,actorId:string,siteId:string,versionId:string,
 memoId:string,before:number,after:number){
 // An outline move can change only a derived anchor. Cross-editor text edits remain blocked.
 const allowed=await requireG7CadPermission(tx,proof,'memo:write',{kind:'version',versionId});
 if(allowed.actorId!==actorId||allowed.siteId!==siteId)fail('MEMO_ANCHOR_ACCESS_DENIED',403);
 await tx.cadBusinessAudit.create({data:{id:randomUUID(),actorUserId:actorId,siteId,versionId,
  targetKind:'MEMO',targetId:memoId,action:'EDIT',beforeRevision:before,afterRevision:after,
  outcome:'SUCCESS',requestId:proof.requestId,timestampUtc:new Date().toISOString()}});
}
export async function mutateMemoAnchor(db:Database,versionId:string,memoId:string,raw:unknown,proof:G7CadWrite){
 if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&
    (raw as Record<string,unknown>).operation==='reposition')
  return repositionMemoAnchor(db,versionId,memoId,raw,proof);
 const b=keys(raw,['expectedRevision','operation'],['targetOrigin','targetId']);
 const expected=revision(b.expectedRevision);
 if(!ID.test(memoId))fail('MEMO_ANCHOR_INVALID',400);
 if(b.operation!=='attach'&&b.operation!=='detach')fail('MEMO_ANCHOR_OPERATION_INVALID',400);
 if(b.operation==='detach')keys(b,['expectedRevision','operation']);
 else keys(b,['expectedRevision','operation','targetOrigin','targetId']);
 if(!await hasAnchorSchema(db))fail('MEMO_ANCHOR_SCHEMA_UNAVAILABLE',503);
 return writeTransaction(db,async tx=>{
  const allowed=await requireG7CadPermission(tx,proof,'memo:write',{kind:'version',versionId});
  const memo=await tx.cadMemo.findFirst({where:{id:memoId,versionId,deletedAt:null}});
  if(!memo)fail('MEMO_ANCHOR_NOT_FOUND',404);
  if(memo.createdById!==allowed.actorId)fail('MEMO_ANCHOR_OWNER_REQUIRED',403);
  if(memo.revision!==expected)fail('MEMO_ANCHOR_REVISION_CONFLICT',409);
  const now=new Date().toISOString();
  if(b.operation==='attach'){
   const origin=b.targetOrigin;
   if(origin!=='APP_CREATED'&&origin!=='DXF_IMPORTED')fail('MEMO_ANCHOR_ORIGIN_INVALID',422);
   if(typeof b.targetId!=='string'||b.targetId.length>200||!b.targetId)
     fail('MEMO_ANCHOR_TARGET_INVALID',422);
   let local:{x:number;y:number};
   if(origin==='APP_CREATED'){
    if(!ID.test(b.targetId))fail('MEMO_ANCHOR_TARGET_INVALID',422);
    const row=await tx.cadOutline.findFirst({where:{id:b.targetId,versionId,deletedAt:null}});
    if(!row||row.sourceSha256!==memo.sourceSha256)fail('MEMO_ANCHOR_TARGET_NOT_FOUND',404);
    const scene=await tx.currentScene.findUnique({where:{versionId}});
    if(!scene||scene.revision!==row.sceneRevision)fail('MEMO_ANCHOR_SCENE_CONFLICT',409);
    const matrix=transformed(geometry(JSON.parse(row.baseGeometryJson)),
      operations(JSON.parse(row.transformJson))).transform;
    local=invertAffine(matrix,{x:memo.anchorX,y:memo.anchorY});
   }else{
    // Only source refs validated earlier against immutable DXF via SOURCE_CANONICAL.
    // A browser-supplied arbitrary render/Handle ID is never enough.
    const refs=await tx.cadOutline.findMany({
      where:{versionId,sourceSha256:memo.sourceSha256,validationMode:'SOURCE_CANONICAL',deletedAt:null},
      select:{sourceRefsJson:true},take:100});
    if(!b.targetId.startsWith(versionId+':'+memo.sourceSha256+':')||
       !refs.some(row=>{try{return (JSON.parse(row.sourceRefsJson) as string[]).includes(b.targetId as string);}
         catch{return false;}}))fail('MEMO_ANCHOR_SOURCE_UNVERIFIED',422);
    local=xy(memo.anchorX,memo.anchorY);
   }
   const existing=await tx.cadMemoAnchor.findUnique({where:{memoId}});
   if(existing)await tx.cadMemoAnchor.delete({where:{memoId}});
   await tx.cadMemoAnchor.create({data:{memoId,versionId,sourceSha256:memo.sourceSha256,
     status:'ATTACHED',targetOrigin:origin as AnchorOrigin,targetId:b.targetId as string,
     localX:local.x,localY:local.y,createdAt:now,updatedAt:now}});
  }else{
   await tx.cadMemoAnchor.deleteMany({where:{memoId,versionId}});
  }
  const changed=await tx.cadMemo.updateMany({where:{id:memoId,versionId,revision:expected,deletedAt:null},
   data:{revision:expected+1,updatedById:allowed.actorId,updatedAt:now}});
  if(changed.count!==1)fail('MEMO_ANCHOR_REVISION_CONFLICT',409);
  await audited(tx,proof,allowed.actorId,allowed.siteId,versionId,memoId,expected,expected+1);
  return {revision:expected+1,anchor:anchorDto(await tx.cadMemoAnchor.findUnique({where:{memoId}}))};
 });
}
export async function reconcileOutlineAnchors(tx:Tx,proof:G7CadWrite,actor:{actorId:string;siteId:string},
 versionId:string,outlineId:string,change:'delete'|'transform',matrix?:import('@/domain/generated-document').Affine2D){
 const anchors=await tx.cadMemoAnchor.findMany({
  where:{versionId,targetOrigin:'APP_CREATED',targetId:outlineId,status:'ATTACHED'},take:101});
 if(anchors.length>100)fail('MEMO_ANCHOR_LIMIT',413);
 for(const a of anchors){
  const memo=await tx.cadMemo.findFirst({where:{id:a.memoId,versionId,deletedAt:null}});
  if(!memo||memo.sourceSha256!==a.sourceSha256)fail('MEMO_ANCHOR_INTEGRITY',409);
  const now=new Date().toISOString();
  const next=change==='transform'&&matrix&&a.localX!==null&&a.localY!==null
   ?projectAffine(matrix,{x:a.localX,y:a.localY}):null;
  if(change==='delete'){
   await tx.cadMemoAnchor.update({where:{memoId:a.memoId},data:{
    status:'BROKEN_ANCHOR',targetOrigin:null,targetId:null,localX:null,localY:null,updatedAt:now}});
  }
  const result=await tx.cadMemo.updateMany({where:{id:memo.id,versionId,revision:memo.revision,deletedAt:null},
   data:{...(next?{anchorX:next.x,anchorY:next.y}:{}),revision:memo.revision+1,
    updatedById:actor.actorId,updatedAt:now}});
  if(result.count!==1)fail('MEMO_ANCHOR_REVISION_CONFLICT',409);
  await audited(tx,proof,actor.actorId,actor.siteId,versionId,memo.id,memo.revision,memo.revision+1);
 }
}
