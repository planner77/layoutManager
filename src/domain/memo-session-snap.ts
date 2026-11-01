/** #84 M3: browser-only WCS bindings for unsaved Generated and DXF_IMPORTED work.
 * Never serialize these associations to a CadMemo API, JSON export or global storage.
 * An opaque renderer ID is valid ONLY inside the current scoped Viewer session.
 */
import {assertMemoScope,assertMemoWcsXY,type MemoScope,type MemoWcsXY} from './cad-memo';
import {invertAffine,projectAffine} from './cad-memo-anchor';
import type {Affine2D} from './generated-document';

export type SessionSnapOrigin='GENERATED'|'RENDER';
export type SnapKind='ENDPOINT'|'VERTEX'|'CENTER';
export type SnapRef=Readonly<MemoScope & {origin:SessionSnapOrigin;id:string}>;
export type SnapPoint=Readonly<{kind:SnapKind;world:MemoWcsXY}>;
export type MemoSnapTarget=Readonly<{
 ref:SnapRef;transform:Affine2D;visible:boolean;points:readonly SnapPoint[];
}>;
export type MemoSnapCandidate=Readonly<{
 ref:SnapRef;transform:Affine2D;kind:SnapKind;world:MemoWcsXY;
 distancePx:number;
}>;
export type MemoSnapChoice=MemoSnapCandidate & Readonly<{key:string;pointIndex:number}>;
export type MemoSnapCandidateSet=Readonly<{
 candidates:readonly MemoSnapChoice[];total:number;scannedPoints:number;limited:boolean;
}>;
export type SessionSnapProjection=Readonly<{
 mode:'ATTACHED'|'BROKEN_ANCHOR';ref:SnapRef;
 kind:SnapKind;world:MemoWcsXY;local:MemoWcsXY;
 /** UI flag: never a server-persisted CadMemoAnchor. */
 persistence:'SESSION_ONLY';
}>;
type Binding={ref:SnapRef;kind:SnapKind;local:MemoWcsXY;lastWorld:MemoWcsXY;forcedBreak?:boolean};
const validRef=(ref:SnapRef,scope:MemoScope)=>
 ref.versionId===scope.versionId&&
 ref.sourceSha256.toLowerCase()===scope.sourceSha256.toLowerCase()&&
 (ref.origin==='GENERATED'||ref.origin==='RENDER')&&
 typeof ref.id==='string'&&ref.id.length>0&&ref.id.length<=2048;

/** Scene objects must have a unique (origin, ID) within one Viewer scope.
 * Never select an arbitrary first/last target when the renderer duplicates it.
 */
const targetKey=(ref:SnapRef)=>JSON.stringify([ref.origin,ref.id]);
function duplicateTargetKeys(scope:MemoScope,targets:readonly MemoSnapTarget[]):Set<string>{
 const seen=new Set<string>(),duplicates=new Set<string>();
 for(const target of targets){
  if(!validRef(target.ref,scope))continue;
  const key=targetKey(target.ref);
  if(seen.has(key))duplicates.add(key);
  else seen.add(key);
 }
 return duplicates;
}
function point(p:MemoWcsXY):MemoWcsXY{
 return assertMemoWcsXY(p);
}
const priority:Record<SnapKind,number>={ENDPOINT:0,VERTEX:1,CENTER:2};
const choiceKey=(ref:SnapRef,kind:SnapKind,index:number)=>
 JSON.stringify([ref.origin,ref.id,kind,index]);

/** Bounded candidates in current CSS viewport; project must return null offscreen. */
export function collectMemoSnapCandidates(scope:MemoScope,requestedWcs:MemoWcsXY,
 targets:readonly MemoSnapTarget[],project:(world:MemoWcsXY)=>MemoWcsXY|null,
 maxDistancePx=12):MemoSnapCandidateSet{
 assertMemoScope(scope);point(requestedWcs);
 const origin=project(requestedWcs);
 if(!origin||!Number.isFinite(origin.x)||!Number.isFinite(origin.y)||
    !Number.isFinite(maxDistancePx)||maxDistancePx<=0||maxDistancePx>64)
  return {candidates:[],total:0,scannedPoints:0,limited:false};
 const duplicated=duplicateTargetKeys(scope,targets);
 const found:MemoSnapChoice[]=[];
 let scannedPoints=0,limited=false;
 for(const target of targets){
  if(!target.visible||!validRef(target.ref,scope)||duplicated.has(targetKey(target.ref)))continue;
  const seen=new Set<string>();
  for(let index=0;index<target.points.length;index++){
   if(scannedPoints>=20000){limited=true;break;}
   scannedPoints++;
   const candidate=target.points[index];
   if(!Object.hasOwn(priority,candidate.kind))continue;
   let world:MemoWcsXY;
   try{world=point(candidate.world);}catch{continue;}
   const duplicate=JSON.stringify([candidate.kind,world.x,world.y]);
   if(seen.has(duplicate))continue;
   seen.add(duplicate);
   const screen=project(world);
   if(!screen||!Number.isFinite(screen.x)||!Number.isFinite(screen.y))continue;
   const distancePx=Math.hypot(screen.x-origin.x,screen.y-origin.y);
   if(distancePx>maxDistancePx)continue;
   try{invertAffine(target.transform,world);}catch{continue;}
   found.push({ref:{...target.ref},transform:[...target.transform] as Affine2D,kind:candidate.kind,world,
    distancePx,key:choiceKey(target.ref,candidate.kind,index),pointIndex:index});
  }
  if(limited)break;
 }
 found.sort((a,b)=>a.distancePx-b.distancePx||priority[a.kind]-priority[b.kind]||
  a.ref.origin.localeCompare(b.ref.origin)||a.ref.id.localeCompare(b.ref.id)||
  a.pointIndex-b.pointIndex);
 if(found.length>100||scannedPoints>=20000)limited=true;
 return {candidates:found.slice(0,100),total:found.length,scannedPoints,limited};
}

/** A selected key must still identify the same live target and point. */
export function currentMemoSnapChoice(scope:MemoScope,choice:MemoSnapChoice,
 targets:readonly MemoSnapTarget[]):boolean{
 if(!validRef(choice.ref,scope)||duplicateTargetKeys(scope,targets).has(targetKey(choice.ref)))return false;
 const target=targets.find(t=>t.visible&&validRef(t.ref,scope)&&
  t.ref.origin===choice.ref.origin&&t.ref.id===choice.ref.id);
 if(!target||choice.key!==choiceKey(choice.ref,choice.kind,choice.pointIndex))return false;
 const pointNow=target.points[choice.pointIndex];
 if(!pointNow||pointNow.kind!==choice.kind||pointNow.world.x!==choice.world.x||
    pointNow.world.y!==choice.world.y)return false;
 return target.transform.length===choice.transform.length&&
  target.transform.every((v,index)=>v===choice.transform[index]);
}
/** CSS pixel tolerance; ignores unsafe or offscreen geometry and respects visibility.
 * Candidates are computed from validated adapter-projected 2D geometry only.
 * Endpoint precedes vertex and center when distances coincide.
 */
export function nearestMemoSnap(
 scope:MemoScope,
 world:MemoWcsXY,
 targets:readonly MemoSnapTarget[],
 project:(world:MemoWcsXY)=>MemoWcsXY|null,
 maxDistancePx=12,
):MemoSnapCandidate|null{
 assertMemoScope(scope);point(world);
 const origin=project(world);
 if(!origin||!Number.isFinite(origin.x)||!Number.isFinite(origin.y)||
    !Number.isFinite(maxDistancePx)||maxDistancePx<=0||maxDistancePx>64)return null;
 const duplicated=duplicateTargetKeys(scope,targets);
 let nearest:MemoSnapCandidate|null=null;
 const priority:Record<SnapKind,number>={ENDPOINT:0,VERTEX:1,CENTER:2};
 let remaining=20000;
 for(const target of targets){
  if(!target.visible||!validRef(target.ref,scope)||duplicated.has(targetKey(target.ref)))continue;
  if(target.points.length>remaining)break;
  remaining-=target.points.length;
  for(const candidate of target.points){
   let w:MemoWcsXY;
   try{w=point(candidate.world);}catch{continue;}
   if(candidate.kind!=='ENDPOINT'&&candidate.kind!=='VERTEX'&&candidate.kind!=='CENTER')continue;
   const screen=project(w);
   if(!screen||!Number.isFinite(screen.x)||!Number.isFinite(screen.y))continue;
   const distancePx=Math.hypot(screen.x-origin.x,screen.y-origin.y);
   if(distancePx>maxDistancePx)continue;
   if(nearest && (distancePx>nearest.distancePx+1e-6||
      (Math.abs(distancePx-nearest.distancePx)<=1e-6 &&
       priority[candidate.kind]>=priority[nearest.kind])))continue;
   try{
    invertAffine(target.transform,w);
    nearest={ref:target.ref,transform:target.transform,kind:candidate.kind,world:w,distancePx};
   }catch{/* singular/overflowing matrix is never a snap target */}
  }
 }
 return nearest;
}

/** Scope-bound, bounded association store.
 * A deleted target becomes BROKEN at its last world WCS; Undo restoring the
 * same immutable object ID may restore that exact relationship, never a third ID.
 */
export class MemoSessionSnapStore {
 private readonly connections=new Map<string,Binding>();
 constructor(readonly scope:MemoScope){assertMemoScope(scope);}
 matches(scope:MemoScope):boolean{return this.scope.versionId===scope.versionId&&
  this.scope.sourceSha256.toLowerCase()===scope.sourceSha256.toLowerCase();}
 attach(memoId:string,candidate:MemoSnapCandidate):SessionSnapProjection{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(memoId)||
     !validRef(candidate.ref,this.scope))throw new Error('다른 버전의 임시 스냅을 연결할 수 없습니다.');
  const local=invertAffine(candidate.transform,point(candidate.world));
  if(!this.connections.has(memoId)&&this.connections.size>=100)
   throw new Error('세션 스냅은 메모 최대 100개까지만 허용됩니다.');
  this.connections.set(memoId,{ref:{...candidate.ref},kind:candidate.kind,local,lastWorld:point(candidate.world)});
  return {mode:'ATTACHED',ref:candidate.ref,kind:candidate.kind,local,world:point(candidate.world),
   persistence:'SESSION_ONLY'};
 }
 /** Move one existing binding using its current live target inverse, atomically in memory. */
 reposition(memoId:string,world:MemoWcsXY,targets:readonly MemoSnapTarget[]):SessionSnapProjection{
  const old=this.connections.get(memoId);
  if(!old||old.forcedBreak)throw new Error('유효한 세션 연결을 먼저 선택하세요.');
  if(duplicateTargetKeys(this.scope,targets).has(targetKey(old.ref)))
   throw new Error('같은 ID의 스냅 대상이 중복되었습니다.');
  const target=targets.find(t=>validRef(t.ref,this.scope)&&
   t.ref.origin===old.ref.origin&&t.ref.id===old.ref.id);
  if(!target)throw new Error('연결 대상이 현재 도면에 없습니다.');
  const nextWorld=point(world),local=invertAffine(target.transform,nextWorld);
  const next={...old,local,lastWorld:nextWorld};
  this.connections.set(memoId,next);
  return {mode:'ATTACHED',ref:next.ref,kind:next.kind,world:nextWorld,local,
   persistence:'SESSION_ONLY'};
 }
 /** S6 SOURCE_ONLY invalidates only DXF_IMPORTED session bindings, not APP_CREATED. */
 breakOrigin(origin:SessionSnapOrigin):void{
  for(const [id,entry] of this.connections)if(entry.ref.origin===origin)
   this.connections.set(id,{...entry,forcedBreak:true});
 }
 hasBindings():boolean{return this.connections.size>0;}
 detach(memoId:string):void{this.connections.delete(memoId);}
 get(memoId:string):SessionSnapProjection|null{
  const b=this.connections.get(memoId);
  return b?{mode:'BROKEN_ANCHOR',ref:b.ref,kind:b.kind,local:b.local,world:b.lastWorld,
   persistence:'SESSION_ONLY'}:null;
 }
 /** Read-only export projection: observing a target never advances lastWorld. */
 snapshot(targets:readonly MemoSnapTarget[]):Readonly<Record<string,SessionSnapProjection>>{
  const duplicated=duplicateTargetKeys(this.scope,targets);
  const live=new Map(targets.filter(t=>validRef(t.ref,this.scope)&&
   !duplicated.has(targetKey(t.ref))).map(t=>[targetKey(t.ref),t]));
  const projected:Record<string,SessionSnapProjection>={};
  for(const [memoId,b] of this.connections){
   const target=live.get(targetKey(b.ref));
   let mode:SessionSnapProjection['mode']='BROKEN_ANCHOR',world=b.lastWorld;
   if(target&&!b.forcedBreak){
    try{
     const next=projectAffine(target.transform,b.local);
     invertAffine(target.transform,next);
     world=next;mode='ATTACHED';
    }
    catch{/* keep last resolved world and never auto-snap to another target */}
   }
   projected[memoId]={mode,ref:{...b.ref},local:{...b.local},world:{...world},kind:b.kind,persistence:'SESSION_ONLY'};
  }
  return projected;
 }
 reconcile(targets:readonly MemoSnapTarget[]):Readonly<Record<string,SessionSnapProjection>>{
  const projected=this.snapshot(targets);
  for(const [memoId,projection]of Object.entries(projected)){
   const binding=this.connections.get(memoId);
   if(binding)this.connections.set(memoId,{...binding,lastWorld:projection.world});
  }
  return projected;
 }
 clear(){this.connections.clear();}
}
