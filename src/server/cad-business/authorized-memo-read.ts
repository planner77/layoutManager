/** Memo GET envelope and rows from one authorized, bounded SQLite transaction. */
import type {Prisma} from '@/generated/prisma/client';
import {CadError} from '@/domain/cad';
import {writeTransaction,type Database} from '@/server/db';
import {requireSceneRead} from '@/server/scene/scene-context';
import {assertRuntimeApprovalCurrent} from '@/server/g7-operational/runtime-handler';
import type {G7RuntimeActiveGate} from '@/server/g7-operational/runtime-gate';
import {anchorDto} from './anchor-service';
import {memoDto,memoGroupDto} from './service';
import {isSiteMemoAdmin} from './memo-policy';

type Tx=Prisma.TransactionClient;
const denied=(code:string,status:number):never=>{throw new CadError(code,'메모 조회를 처리할 수 없습니다.',status);};
function approvalCurrent(gate:G7RuntimeActiveGate){
 try{assertRuntimeApprovalCurrent(gate);}catch{denied('G7_RUNTIME_BLOCKED',503);}
}
async function schema(tx:Tx){
 const tables=await tx.$queryRawUnsafe<{name:string}[]>(
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('CadMemo','CadBusinessAudit','CadOutline','CadMemoAnchor','CadMemoFeature','CadMemoGroup') ORDER BY name");
 const names=new Set(tables.map(row=>row.name));
 if(!names.has('CadMemo')||!names.has('CadBusinessAudit')||!names.has('CadOutline'))denied('BUSINESS_SCHEMA_UNAVAILABLE',503);
 const feature=names.has('CadMemoFeature'),group=names.has('CadMemoGroup');
 if(feature!==group)denied('MEMO_FEATURE_SCHEMA_PARTIAL',503);
 return {anchor:names.has('CadMemoAnchor'),featuresAvailable:feature};
}
export async function authorizedMemoList(db:Database,request:Request,versionId:string,gate:G7RuntimeActiveGate){
 return writeTransaction(db,async tx=>{
  approvalCurrent(gate);
  if(await tx.user.count()===0)denied('BOOTSTRAP_REQUIRED',503);
  const actor=await requireSceneRead(request,tx,versionId,gate,'memo:read');
  if(!actor)return denied('BUSINESS_AUTH_REQUIRED',401);
  const support=await schema(tx);
  const version=await tx.cadFileVersion.findUnique({where:{id:versionId},select:{sha256:true}});
  if(!version)return denied('BUSINESS_VERSION_NOT_FOUND',404);
  const scene=await tx.currentScene.findUnique({where:{versionId}});
  const rows=await tx.cadMemo.findMany({where:{versionId,deletedAt:null},orderBy:{createdAt:'asc'},take:101});
  if(rows.some(row=>row.sourceSha256.toLowerCase()!==version.sha256.toLowerCase()))denied('BUSINESS_SOURCE_CHANGED',409);
  const ids=rows.map(row=>row.id);
  const bound=support.anchor?await tx.cadMemoAnchor.findMany({where:{versionId,memoId:{in:ids}}}):[];
  const byId=new Map(bound.map(row=>[row.memoId,row]));
  const extra=support.featuresAvailable?await tx.cadMemoFeature.findMany({where:{versionId,memoId:{in:ids}}}):[];
  const byMemo=new Map(extra.map(row=>[row.memoId,row]));
  const groups=support.featuresAvailable?await tx.cadMemoGroup.findMany({where:{versionId,deletedAt:null},
   orderBy:[{sortOrder:'asc'},{createdAt:'asc'}],take:21}):[];
  if(groups.some(row=>row.sourceSha256.toLowerCase()!==version.sha256.toLowerCase())||
    extra.some(row=>row.sourceSha256.toLowerCase()!==version.sha256.toLowerCase()))denied('BUSINESS_SOURCE_CHANGED',409);
  approvalCurrent(gate);
  const current=await requireSceneRead(request,tx,versionId,gate,'memo:read');
  if(!current||current.actorId!==actor.actorId)denied('UNAUTHENTICATED',401);
  const canDeleteAny=gate.cadWriteEnabled ? await isSiteMemoAdmin(tx,actor.actorId) : false;
  approvalCurrent(gate);
  return {actorId:actor.actorId,canDeleteAny,versionId,sourceSha256:version.sha256,sceneRevision:scene?.revision??null,
   memos:rows.map(row=>memoDto(row,anchorDto(byId.get(row.id)??null),byMemo.get(row.id)??null)),
   groups:groups.map(memoGroupDto),featuresAvailable:support.featuresAvailable};
 });
}
