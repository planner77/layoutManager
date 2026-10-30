/** S0: identity and provenance for a DXF-derived render scene. No Three/DOM/DB imports. */
import type {CanvasObjectRef,CanvasObjectScope} from './canvas-object-selection';

export const CAD_SCENE_SCHEMA=1;
export const CAD_SCENE_BUILDER='three-dxf-viewer@1.0.44+explicitElevation-v1+cad-scene-1';
export const CAD_SCENE_RENDERER='three@0.171.0';
export type SceneOrigin='DXF_IMPORTED'|'APP_CREATED';
export type SceneScope=Readonly<CanvasObjectScope & {schema:1;builder:string;renderer:string;frame:'DXF_WCS_XY';sourceUnit:string}>;
export type CadSceneObjectRef=Readonly<SceneScope & {sceneId:string;id:string;origin:SceneOrigin;sourceRef?:string;derivedFrom?:string}>;
export type SceneObject=Readonly<{ref:CadSceneObjectRef;treePath:readonly number[];kind:string;visible:boolean;transform:readonly number[];revision:number}>;
export type AppObject=Readonly<{ref:CadSceneObjectRef;kind:string;geometry:unknown;visible:boolean;revision:number;outlineId?:string;outlineTypeId?:string}>;
export type SceneFormat='THREE_JSON'|'CUSTOM_DTO';
export type SceneManifest=Readonly<{scope:SceneScope;sceneId:string;format:SceneFormat;state:'READY';revision:number;byteLength:number;sha256:string}>;
export function validateSceneManifest(input:unknown,expected:Readonly<{scope:SceneScope;format:SceneFormat;byteLength:number;sha256:string}>):SceneManifest{
  if(!record(input)||!validSceneScope(expected.scope)||!['THREE_JSON','CUSTOM_DTO'].includes(expected.format)||!SHA.test(expected.sha256)||!Number.isSafeInteger(expected.byteLength)||expected.byteLength<1||
    !validSceneScope(input.scope)||JSON.stringify(input.scope)!==JSON.stringify(expected.scope)||input.sceneId!==sceneIdentity(expected.scope)||input.format!==expected.format||input.state!=='READY'||
    !Number.isSafeInteger(input.revision)||Number(input.revision)<0||input.byteLength!==expected.byteLength||input.sha256!==expected.sha256)throw new Error('SCENE_MANIFEST_MISMATCH');
  return input as SceneManifest;
}
export type SceneAsset=Readonly<{scope:SceneScope;sceneId:string;state:'BUILDING'|'READY'|'FAILED'|'REBUILD_REQUIRED';revision:number;objects:readonly SceneObject[]}>;
export function sceneScope(versionId:string,sourceSha256:string,sourceUnit='UNSPECIFIED'):SceneScope{
  const scope:SceneScope={versionId,sourceSha256:sourceSha256.toLowerCase(),schema:CAD_SCENE_SCHEMA,builder:CAD_SCENE_BUILDER,renderer:CAD_SCENE_RENDERER,frame:'DXF_WCS_XY',sourceUnit};
  if(!validSceneScope(scope))throw new Error('SCENE_SCOPE_INVALID');
  return scope;
}
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safe=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=256&&!/[\x00-\x1f]/.test(v);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function validImportedId(scope:SceneScope,id:unknown):id is string{
  if(typeof id!=='string')return false;const prefix='dxf:'+sceneIdentity(scope)+':';
  if(!id.startsWith(prefix))return false;const suffix=id.slice(prefix.length);
  if(!/^\d*(?:\.\d+)*$/.test(suffix))return false;
  const path=suffix===''?[]:suffix.split('.').map(Number);
  return path.length<=128&&path.every(n=>Number.isSafeInteger(n)&&n>=0)&&id===importedId(scope,path);
}
export function validSceneScope(v:unknown):v is SceneScope{
  return record(v)&&safe(v.versionId)&&typeof v.sourceSha256==='string'&&SHA.test(v.sourceSha256)&&
    v.schema===1&&v.builder===CAD_SCENE_BUILDER&&v.renderer===CAD_SCENE_RENDERER&&
    v.frame==='DXF_WCS_XY'&&safe(v.sourceUnit);
}
/** Tree occurrence, not a DXF Handle or Object3D.uuid. */
export function sceneIdentity(scope:SceneScope):string{
  if(!validSceneScope(scope))throw new Error('SCENE_SCOPE_INVALID');
  return [scope.versionId,scope.sourceSha256,scope.schema,scope.builder,scope.renderer,scope.frame,scope.sourceUnit].map(encodeURIComponent).join('|');
}
export function importedId(scope:SceneScope,path:readonly number[]):string{
  if(!Array.isArray(path)||path.length>128||path.some(n=>!Number.isSafeInteger(n)||n<0))throw new Error('SCENE_PATH_INVALID');
  return 'dxf:'+sceneIdentity(scope)+':'+path.join('.');
}
export function createSceneRef(scope:SceneScope,origin:SceneOrigin,id:string,options:{treePath?:readonly number[];sourceRef?:string;derivedFrom?:string}={}):CadSceneObjectRef{
  const sceneId=sceneIdentity(scope);
  if(origin==='DXF_IMPORTED'){
    if(!options.treePath||id!==importedId(scope,options.treePath)||options.derivedFrom)throw new Error('SCENE_IMPORTED_ID_INVALID');
  }else if(origin==='APP_CREATED'){
    if(!UUID.test(id)||options.treePath||options.sourceRef)throw new Error('SCENE_APP_ID_INVALID');
  }else throw new Error('SCENE_ORIGIN_INVALID');
  if(options.sourceRef!==undefined&&!safe(options.sourceRef))throw new Error('SCENE_SOURCE_REF_INVALID');
  if(options.derivedFrom!==undefined&&(!validImportedId(scope,options.derivedFrom)))throw new Error('SCENE_DERIVED_REF_INVALID');
  return Object.freeze({...scope,sceneId,id,origin,...(options.sourceRef?{sourceRef:options.sourceRef}:{}),...(options.derivedFrom?{derivedFrom:options.derivedFrom}:{})});
}
export function validSceneRef(v:unknown,scope:SceneScope):v is CadSceneObjectRef{
  if(!record(v)||!validSceneScope(scope)||v.versionId!==scope.versionId||v.sourceSha256!==scope.sourceSha256||
    v.schema!==scope.schema||v.builder!==scope.builder||v.renderer!==scope.renderer||v.frame!==scope.frame||v.sourceUnit!==scope.sourceUnit||v.sceneId!==sceneIdentity(scope)||
    (v.origin!=='DXF_IMPORTED'&&v.origin!=='APP_CREATED')||typeof v.id!=='string')return false;
  if(v.origin==='APP_CREATED'&&!UUID.test(v.id))return false;
  if(v.origin==='DXF_IMPORTED'&&!validImportedId(scope,v.id))return false;
  if(v.sourceRef!==undefined&&!safe(v.sourceRef)||v.derivedFrom!==undefined&&(!validImportedId(scope,v.derivedFrom)))return false;
  if(v.origin==='DXF_IMPORTED'&&v.derivedFrom!==undefined||v.origin==='APP_CREATED'&&v.sourceRef!==undefined)return false;
  return true;
}
const validMatrix=(a:unknown)=>Array.isArray(a)&&a.length===16&&a.every(n=>typeof n==='number'&&Number.isFinite(n));
export function validateSceneAsset(input:unknown):SceneAsset{
  if(!record(input)||!validSceneScope(input.scope)||input.sceneId!==sceneIdentity(input.scope)||
    (typeof input.state!=='string'||!['BUILDING','READY','FAILED','REBUILD_REQUIRED'].includes(input.state))||!Number.isSafeInteger(input.revision)||Number(input.revision)<0||!Array.isArray(input.objects))throw new Error('SCENE_ASSET_INVALID');
  const ids=new Set<string>(),paths=new Set<string>();
  for(const o of input.objects){
    if(!record(o)||!validSceneRef(o.ref,input.scope)||o.ref.origin!=='DXF_IMPORTED'||
      !Array.isArray(o.treePath)||o.ref.id!==importedId(input.scope,o.treePath)||!safe(o.kind)||
      typeof o.visible!=='boolean'||!validMatrix(o.transform)||!Number.isSafeInteger(o.revision)||Number(o.revision)<0||
      ids.has(o.ref.id)||paths.has(o.treePath.join('.')))throw new Error('SCENE_OBJECT_INVALID');
    ids.add(o.ref.id);paths.add(o.treePath.join('.'));
  }
  return input as SceneAsset;
}
function validWcsGeometry(value:unknown):boolean{
  if(!record(value)||(value.type!=='Polygon'&&value.type!=='MultiPolygon')||!Array.isArray(value.coordinates))return false;
  let count=0;
  const point=(v:unknown):v is [number,number]=>Array.isArray(v)&&v.length===2&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e12)&&++count<=100000;
  const ring=(v:unknown)=>Array.isArray(v)&&v.length>=4&&v.every(point)&&
    v[0][0]===v[v.length-1][0]&&v[0][1]===v[v.length-1][1];
  const polygon=(v:unknown)=>Array.isArray(v)&&v.length>0&&v.every(ring);
  return value.type==='Polygon'?polygon(value.coordinates):value.coordinates.length>0&&value.coordinates.every(polygon);
}
export function validateAppObject(input:unknown,scope:SceneScope):AppObject{
  if(!record(input)||!validSceneRef(input.ref,scope)||input.ref.origin!=='APP_CREATED'||!safe(input.kind)||
    typeof input.visible!=='boolean'||!Number.isSafeInteger(input.revision)||Number(input.revision)<0||
    !validWcsGeometry(input.geometry)||input.outlineId!==undefined&&!safe(input.outlineId)||
    input.outlineTypeId!==undefined&&!safe(input.outlineTypeId))throw new Error('SCENE_APP_OBJECT_INVALID');
  return input as AppObject;
}
/** Compatibility bridge only; existing SOURCE and GENERATED edit gates are unchanged. */
export function sceneRefFromCanvas(ref:CanvasObjectRef,scope:SceneScope,path?:readonly number[]):CadSceneObjectRef{
  if(ref.versionId!==scope.versionId||ref.sourceSha256!==scope.sourceSha256)throw new Error('SCENE_CANVAS_SCOPE_INVALID');
  if(ref.origin==='SOURCE'){
    if(!path)throw new Error('SCENE_SOURCE_PATH_REQUIRED');
    return createSceneRef(scope,'DXF_IMPORTED',importedId(scope,path),{treePath:path});
  }
  if(ref.origin==='GENERATED')return createSceneRef(scope,'APP_CREATED',ref.id);
  throw new Error('SCENE_CANVAS_ORIGIN_INVALID');
}
