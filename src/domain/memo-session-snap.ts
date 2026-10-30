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
export type SessionSnapProjection=Readonly<{
 mode:'ATTACHED'|'BROKEN_ANCHOR';ref:SnapRef;
 kind:SnapKind;world:MemoWcsXY;local:MemoWcsXY;
 /** UI flag: never a server-persisted CadMemoAnchor. */
 persistence:'SESSION_ONLY';
}>;
type Binding={ref:SnapRef;kind:SnapKind;local:MemoWcsXY;lastWorld:MemoWcsXY;forcedBreak?:boolean};
const LIMIT=1e12;
const validRef=(ref:SnapRef,scope:MemoScope)=>
 ref.versionId===scope.versionId&&
 ref.sourceSha256.toLowerCase()===scope.sourceSha256.toLowerCase()&&
 (ref.origin==='GENERATED'||ref.origin==='RENDER')&&
 typeof ref.id==='string'&&ref.id.length>0&&ref.id.length<=2048;

function point(p:MemoWcsXY):MemoWcsXY{
 return assertMemoWcsXY(p);
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
 let nearest:MemoSnapCandidate|null=null;
 const priority:Record<SnapKind,number>={ENDPOINT:0,VERTEX:1,CENTER:2};
 let remaining=20000;
 for(const target of targets){
  if(!target.visible||!validRef(target.ref,scope))continue;
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
 /** S6 SOURCE_ONLY invalidates only DXF_IMPORTED session bindings, not APP_CREATED. */
 breakOrigin(origin:SessionSnapOrigin):void{
  for(const [id,entry] of this.connections)if(entry.ref.origin===origin)
   this.connections.set(id,{...entry,forcedBreak:true});
 }
 detach(memoId:string):void{this.connections.delete(memoId);}
 get(memoId:string):SessionSnapProjection|null{
  const b=this.connections.get(memoId);
  return b?{mode:'BROKEN_ANCHOR',ref:b.ref,kind:b.kind,local:b.local,world:b.lastWorld,
   persistence:'SESSION_ONLY'}:null;
 }
 reconcile(targets:readonly MemoSnapTarget[]):Readonly<Record<string,SessionSnapProjection>>{
  const live=new Map(targets.filter(t=>validRef(t.ref,this.scope))
   .map(t=>[t.ref.origin+':'+t.ref.id,t]));
  const projected:Record<string,SessionSnapProjection>={};
  for(const [memoId,b] of this.connections){
   const target=live.get(b.ref.origin+':'+b.ref.id);
   let mode:SessionSnapProjection['mode']='BROKEN_ANCHOR',world=b.lastWorld;
   if(target&&!b.forcedBreak){
    try{world=projectAffine(target.transform,b.local);mode='ATTACHED';}
    catch{/* keep last resolved world and never auto-snap to another target */}
   }
   this.connections.set(memoId,{...b,lastWorld:world});
   projected[memoId]={mode,ref:b.ref,local:b.local,world,kind:b.kind,persistence:'SESSION_ONLY'};
  }
  return projected;
 }
 clear(){this.connections.clear();}
}
