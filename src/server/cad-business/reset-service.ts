/** #167: fail-closed transaction covering business soft deletion and M3 anchor breaks.
 * The immutable DXF, READY SceneAsset, CurrentScene and source files are NEVER touched.
 */
import {randomUUID} from 'node:crypto';
import {CadError} from '@/domain/cad';
import {resetRows,sameRevisionSnapshot,type RevisionEntry} from '@/domain/cad-reset';
import {writeTransaction,type Database} from '@/server/db';
import {requireG7CadPermission,type G7CadWrite} from '@/server/g7-operational/cad-guard';
import {businessSchema} from './service';
import {hasAnchorSchema} from './anchor-service';
import {keys,revision,sourceSha} from './validation';
const reject=(code:string,status=409):never=>{throw new CadError(code,'현재 도면의 업무 객체가 변경되었습니다. 다시 조회한 후 확인하세요.',status);};
export async function resetBusinessVersion(db:Database,versionId:string,raw:unknown,proof:G7CadWrite){
 const b=keys(raw,['mode','sourceSha256','expectedSceneRevision','outlines','memos']);
 if(b.mode!=='SOURCE_ONLY'&&b.mode!=='ALL')reject('RESET_MODE_INVALID',400);
 const sha=sourceSha(b.sourceSha256),sceneRevision=revision(b.expectedSceneRevision);
 let outlines:RevisionEntry[],memos:RevisionEntry[];
 try{outlines=resetRows(b.outlines);memos=resetRows(b.memos);}
 catch{return reject('RESET_SNAPSHOT_INVALID',400);}
 await businessSchema(db);
 const hasAnchors=await hasAnchorSchema(db);
 return writeTransaction(db,async tx=>{
  // For A, authenticated access is still required before breaking shared Source anchors.
  const outlineActor=await requireG7CadPermission(tx,proof,'outline:write',{kind:'version',versionId});
  const memoActor=await requireG7CadPermission(tx,proof,'memo:write',{kind:'version',versionId});
  if(outlineActor.actorId!==memoActor.actorId||outlineActor.siteId!==memoActor.siteId)
    reject('RESET_ACTOR_CONFLICT',403);
  const version=await tx.cadFileVersion.findUnique({where:{id:versionId},select:{sha256:true,fileFormat:true}});
  if(!version||version.sha256.toLowerCase()!==sha||version.fileFormat!=='DXF')reject('RESET_VERSION_CONFLICT');
  const scene=await tx.currentScene.findUnique({where:{versionId}});
  if(!scene||scene.revision!==sceneRevision)reject('RESET_SCENE_CONFLICT');
  const activeOutlines=await tx.cadOutline.findMany({where:{versionId,deletedAt:null},
   select:{id:true,revision:true,sourceSha256:true},take:101});
  const activeMemos=await tx.cadMemo.findMany({where:{versionId,deletedAt:null},
   select:{id:true,revision:true,sourceSha256:true,createdById:true},take:101});
  if(activeOutlines.length>100||activeMemos.length>100||
     !sameRevisionSnapshot(outlines,activeOutlines)||!sameRevisionSnapshot(memos,activeMemos)||
     activeOutlines.some(x=>x.sourceSha256!==sha)||activeMemos.some(x=>x.sourceSha256!==sha))
    reject('RESET_REVISION_CONFLICT');
  const now=new Date().toISOString();
  let broken=0,deletedMemos=0,deletedOutlines=0;
  async function audit(kind:'MEMO'|'OUTLINE',id:string,before:number,action:'EDIT'|'DELETE'){
   await tx.cadBusinessAudit.create({data:{id:randomUUID(),actorUserId:outlineActor.actorId,
    siteId:outlineActor.siteId,versionId,targetKind:kind,targetId:id,action,
    beforeRevision:before,afterRevision:before+1,outcome:'SUCCESS',requestId:proof.requestId,
    timestampUtc:now}});
  }
  if(b.mode==='SOURCE_ONLY'){
   if(hasAnchors){
    const anchors=await tx.cadMemoAnchor.findMany({where:{
     versionId,status:'ATTACHED',targetOrigin:'DXF_IMPORTED'},take:101});
    if(anchors.length>100)reject('RESET_ANCHOR_LIMIT',413);
    for(const a of anchors){
     const memo=activeMemos.find(m=>m.id===a.memoId);
     if(!memo)reject('RESET_ANCHOR_INTEGRITY');
     // Do not silently bypass #172's author-only memo modification policy.
     if(memo.createdById!==memoActor.actorId)reject('RESET_MEMO_OWNER_REQUIRED',403);
     await tx.cadMemoAnchor.update({where:{memoId:a.memoId},data:{
      status:'BROKEN_ANCHOR',targetId:null,targetOrigin:null,localX:null,localY:null,updatedAt:now}});
     const changed=await tx.cadMemo.updateMany({
      where:{id:memo.id,versionId,revision:memo.revision,deletedAt:null},
      data:{revision:memo.revision+1,updatedById:memoActor.actorId,updatedAt:now}});
     if(changed.count!==1)reject('RESET_REVISION_CONFLICT');
     await audit('MEMO',memo.id,memo.revision,'EDIT');broken++;
    }
   }
  }else{
   // Privileged Outline writers cannot use this to delete other authors' Memos.
   if(activeMemos.some(m=>m.createdById!==memoActor.actorId))reject('RESET_MEMO_OWNER_REQUIRED',403);
   for(const m of activeMemos){
    const changed=await tx.cadMemo.updateMany({
     where:{id:m.id,versionId,revision:m.revision,deletedAt:null},
     data:{deletedAt:now,deletedById:memoActor.actorId,updatedAt:now,
      updatedById:memoActor.actorId,revision:m.revision+1}});
    if(changed.count!==1)reject('RESET_REVISION_CONFLICT');
    await audit('MEMO',m.id,m.revision,'DELETE');deletedMemos++;
   }
   for(const o of activeOutlines){
    const changed=await tx.cadOutline.updateMany({
     where:{id:o.id,versionId,revision:o.revision,deletedAt:null},
     data:{deletedAt:now,deletedById:outlineActor.actorId,updatedAt:now,
      updatedById:outlineActor.actorId,revision:o.revision+1}});
    if(changed.count!==1)reject('RESET_REVISION_CONFLICT');
    await audit('OUTLINE',o.id,o.revision,'DELETE');deletedOutlines++;
   }
  }
  return {mode:b.mode,sceneRevision,broken,deletedMemos,deletedOutlines,
    resetSceneWork:true,versionId};
 });
}
