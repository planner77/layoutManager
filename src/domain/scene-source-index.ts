import {validSceneScope,type SceneScope,type SceneAsset} from './cad-scene';
import type {DxfOutlineIndex} from '../viewers/core/outline-geometry';
export type SourceBinding={sceneObjectId:string;handle:string;entityType:string;layer:string|null};
export type SceneSourceIndex={state:'READY';scope:SceneScope;index:DxfOutlineIndex;bindings:SourceBinding[]}
 | {state:'UNAVAILABLE';reason:'WORKER_FAILED'|'INDEX_ABSENT'|'LEGACY_FIDELITY_UNKNOWN'};
const rec=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,names:string[])=>Object.keys(v).length===names.length&&Object.keys(v).every(k=>names.includes(k));
const str=(v:unknown,n:number)=>typeof v==='string'&&v.length>0&&v.length<=n&&!/[\u0000-\u001f\u007f]|(?:https?:\/\/|file:\/\/|data:)/i.test(v);
const coord=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e12;
function fail():never{throw new Error('SCENE_SOURCE_INDEX_INVALID');}
export function validateSceneSourceIndex(value:unknown,asset:SceneAsset,budget:{scalars:number}):SceneSourceIndex{
 if(!rec(value)||value.state!=='READY'&&value.state!=='UNAVAILABLE')fail();
 if(value.state==='UNAVAILABLE'){
  if(!exact(value,['state','reason'])||typeof value.reason!=='string'||
    !['WORKER_FAILED','INDEX_ABSENT','LEGACY_FIDELITY_UNKNOWN'].includes(value.reason))fail();
  return value as SceneSourceIndex;
 }
 if(!exact(value,['state','scope','index','bindings'])||!validSceneScope(value.scope)||JSON.stringify(value.scope)!==JSON.stringify(asset.scope)||!rec(value.index)||
  !exact(value.index,['versionId','sourceSha256','unitCode','entities','warnings']))fail();
 const idx=value.index;
 if(idx.versionId!==asset.scope.versionId||idx.sourceSha256!==asset.scope.sourceSha256||
  idx.unitCode!==null&&(!Number.isSafeInteger(idx.unitCode)||Number(idx.unitCode)<0||Number(idx.unitCode)>1000)||
  !Array.isArray(idx.entities)||idx.entities.length>100_000||!Array.isArray(idx.warnings)||idx.warnings.length>1000||
  idx.warnings.some(w=>!str(w,512))||!Array.isArray(value.bindings)||value.bindings.length>100_000)fail();
 const scopeUnit=/^DXF_INSUNITS_(\d+)$/.exec(asset.scope.sourceUnit);
 if(scopeUnit?idx.unitCode!==Number(scopeUnit[1]):idx.unitCode!==null)fail();
 const ids=new Set<string>(),stableHandles=new Set<string>();
 const entities=idx.entities as DxfOutlineIndex['entities'];
 for(const e of entities){
  if(!rec(e)||!exact(e,['id','handle','entityType','layer','instancePath','stable','paths','bounds'])||
   !str(e.id,1024)||typeof e.entityType!=='string'||!['LINE','LWPOLYLINE','POLYLINE','CIRCLE','ARC','INSERT'].includes(e.entityType)||!str(e.layer,256)||typeof e.stable!=='boolean'||
   e.handle!==null&&(!str(e.handle,256)||!/^[0-9A-F]+$/i.test(e.handle))||
   !Array.isArray(e.instancePath)||e.instancePath.length>32||e.instancePath.some(p=>!str(p,256))||
   !Array.isArray(e.paths)||e.paths.length>10_000||!Array.isArray(e.bounds)||e.bounds.length!==4||!e.bounds.every(coord)||
   e.bounds[0]>e.bounds[2]||e.bounds[1]>e.bounds[3]||ids.has(e.id))fail();
  ids.add(e.id);
  if(e.stable){
   const h=String(e.handle).toUpperCase();
   if(!e.handle||stableHandles.has(h)||e.instancePath.length||e.id!==`${asset.scope.versionId}:${asset.scope.sourceSha256.toLowerCase()}:${h}`)fail();
   stableHandles.add(h);
  }else if(!e.id.startsWith(`${asset.scope.versionId}:TEMP:`))fail();
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of e.paths){
   if(!rec(p)||!exact(p,['points','closed'])||typeof p.closed!=='boolean'||!Array.isArray(p.points)||p.points.length<2||p.points.length>100_000)fail();
   for(const xy of p.points){if(!Array.isArray(xy)||xy.length!==2||!xy.every(coord))fail();
    budget.scalars+=2;if(budget.scalars>2_000_000)fail();
    minX=Math.min(minX,xy[0]);minY=Math.min(minY,xy[1]);maxX=Math.max(maxX,xy[0]);maxY=Math.max(maxY,xy[1]);
   }
  }
  if(!e.paths.length||[minX,minY,maxX,maxY].some((n,i)=>Math.abs(n-e.bounds[i])>1e-6))fail();
 }
 const handles=new Map<string,number>();for(const e of entities)if(e.handle)handles.set(e.handle.toUpperCase(),(handles.get(e.handle.toUpperCase())??0)+1);
 for(const e of entities)if(e.stable&&handles.get(e.handle!.toUpperCase())!==1)fail();
 const refs=new Set(asset.objects.filter(o=>o.ref.origin==='DXF_IMPORTED').map(o=>o.ref.id)),bound=new Set<string>();
 for(const b of value.bindings as SourceBinding[]){
  if(!rec(b)||!exact(b,['sceneObjectId','handle','entityType','layer'])||!str(b.sceneObjectId,1024)||!refs.has(b.sceneObjectId)||bound.has(b.sceneObjectId)||
   !str(b.handle,256)||!/^[0-9A-F]+$/i.test(b.handle)||
   !['LINE','LWPOLYLINE','POLYLINE','CIRCLE','ARC','INSERT','TEXT','MTEXT'].includes(b.entityType)||
   b.layer!==null&&!str(b.layer,256)||!handles.has(b.handle.toUpperCase()))fail();
  bound.add(b.sceneObjectId);
 }
 return value as SceneSourceIndex;
}
