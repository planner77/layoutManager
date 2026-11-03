import * as THREE from 'three';
import {validSceneRef,type SceneAsset} from '../../domain/cad-scene';
import {validateSceneSourceIndex,type SceneSourceIndex,type SourceBinding} from '../../domain/scene-source-index';
import {reconcileRenderCoverage,type RenderObservation} from './render-coverage';
import type {DxfOutlineIndex} from '../core/outline-geometry';

/** Captures only observed parser provenance before serializer removes userData.entity. */
export function captureSourceIndex(root:THREE.Object3D,asset:SceneAsset,index:DxfOutlineIndex):SceneSourceIndex{
 const handles=new Set(index.entities.filter(e=>e.handle).map(e=>e.handle!.toUpperCase()));
 const bindings:SourceBinding[]=[];
 root.traverse(o=>{
  const entity=o.userData.entity as Record<string,unknown>|undefined;
  const ref=o.userData.cadSceneRef;
  if(!entity||!validSceneRef(ref,asset.scope)||ref.origin!=='DXF_IMPORTED'||!o.visible||
    typeof entity.handle!=='string'||!handles.has(entity.handle.toUpperCase())||typeof entity.type!=='string')return;
  bindings.push({sceneObjectId:ref.id,handle:entity.handle,entityType:entity.type,
   layer:typeof entity.layer==='string'?entity.layer:null});
 });
 const snapshot:SceneSourceIndex={state:'READY',scope:asset.scope,index,bindings};
 return validateSceneSourceIndex(snapshot,asset,{scalars:0});
}
/** Recompute WCS bounds from restored geometry. Stored counts/bounds have no authority. */
export function auditRestoredSourceIndex(root:THREE.Object3D,asset:SceneAsset,snapshot:SceneSourceIndex){
 if(snapshot.state!=='READY')return null;
 validateSceneSourceIndex(snapshot,asset,{scalars:0});
 const objects=new Map<string,THREE.Object3D>();
 root.updateWorldMatrix(true,true);
 root.traverse(o=>{const ref=o.userData.cadSceneRef;if(validSceneRef(ref,asset.scope)&&ref.origin==='DXF_IMPORTED')objects.set(ref.id,o);});
 const observations:RenderObservation[]=snapshot.bindings.map(b=>{
  const o=objects.get(b.sceneObjectId);if(!o)throw new Error('SCENE_SOURCE_BINDING_MISSING');
  if(b.layer!==null&&o.userData.cadLayer!==b.layer)throw new Error('SCENE_SOURCE_BINDING_LAYER_MISMATCH');
  const box=new THREE.Box3().setFromObject(o);
  const values=[box.min.x,box.min.y,box.max.x,box.max.y];
  const valid=o.visible&&!box.isEmpty()&&values.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e12);
  return {handle:b.handle,entityType:b.entityType,layer:b.layer??undefined,
   bounds:valid?[box.min.x,box.min.y,box.max.x,box.max.y]:null};
 });
 return reconcileRenderCoverage(snapshot.index.entities,observations);
}
