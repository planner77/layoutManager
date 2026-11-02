import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {sceneScope,sourceUnitFromDxf,tagImportedTree,tagAppTree} from '../../viewers/three-dxf-viewer/scene-tags';
import {createSceneRef,importedId,sceneIdentity,validSceneRef,validateSceneAsset,validateAppObject,sceneRefFromCanvas} from '../../domain/cad-scene';
import {canvasObjectRef} from '../../domain/canvas-object-selection';
const scope=sceneScope('version-1','a'.repeat(64),'DXF_INSUNITS_4');
const uuid='527c8d99-435c-4ccf-991a-648a27b8a2d1';
const geometry={type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]};
describe('SC-01/03 scene identity',()=>{
 it('binds original source, builder, frame and occurrence path, independent of renderer UUID',()=>{
  const a=new THREE.Group();a.add(new THREE.Group(),new THREE.Group());
  const asset=tagImportedTree(a,scope);expect(validateSceneAsset(asset).objects).toHaveLength(3);
  const ids=asset.objects.map(o=>o.ref.id);expect(new Set(ids).size).toBe(3);
  a.traverse(o=>o.uuid='changed-'+o.uuid);
  expect(tagImportedTree(a,scope).objects.map(o=>o.ref.id)).toEqual(ids);
  expect(sourceUnitFromDxf('9\n$INSUNITS\n70\n4\n')).toBe('DXF_INSUNITS_4');
  expect(sourceUnitFromDxf('')).toBe('UNSPECIFIED');
  expect(importedId(scope,[0])).not.toBe(importedId({...scope,versionId:'v2'},[0]));
  expect(importedId(scope,[0])).not.toBe(importedId({...scope,sourceSha256:'b'.repeat(64)},[0]));
  expect(importedId(scope,[0])).not.toBe(importedId({...scope,sourceUnit:'UNSPECIFIED'},[0]));
 });
 it('rejects forged origin, ID, scope, path, source and duplicate while preserving immutable origin',()=>{
  const ref=createSceneRef(scope,'DXF_IMPORTED',importedId(scope,[1]),{treePath:[1]});
  expect(Object.isFrozen(ref)).toBe(true);
  for(const change of [{origin:'APP_CREATED'},{id:ref.id+'evil'},{versionId:'v2'},{sourceSha256:'b'.repeat(64)},{schema:2},{builder:'other'},{renderer:'other'},{frame:'other'},{sourceUnit:'other'},{sceneId:'forged'},{derivedFrom:'bad'}])
   expect(validSceneRef({...ref,...change},scope)).toBe(false);
  expect(()=>createSceneRef(scope,'APP_CREATED','bad')).toThrow();
  expect(()=>createSceneRef(scope,'DXF_IMPORTED',ref.id,{treePath:[2]})).toThrow();
  expect(()=>createSceneRef(scope,'APP_CREATED',uuid,{derivedFrom:'unscoped'})).toThrow();
  const group=new THREE.Group();group.add(new THREE.Group());const asset=tagImportedTree(group,scope);
  expect(()=>validateSceneAsset({...asset,objects:[asset.objects[0],asset.objects[0]]})).toThrow();
  expect(()=>validateSceneAsset({...asset,state:'UNKNOWN'})).toThrow();
  expect(()=>validateSceneAsset({...asset,state:['READY']})).toThrow();
  expect(()=>validateSceneAsset({...asset,objects:[{...asset.objects[0],transform:[Infinity]}]})).toThrow();
 });
 it('keeps canvas compatibility and APP_CREATED WCS independent',()=>{
  const old=canvasObjectRef('GENERATED',uuid,scope),ref=sceneRefFromCanvas(old,scope);
  expect(ref.origin).toBe('APP_CREATED');expect(ref.id).toBe(uuid);
  const app={ref,kind:'OUTLINE',geometry,visible:true,revision:0};
  expect(validateAppObject(app,scope)).toBe(app);
  expect(()=>validateAppObject({...app,geometry:{type:'Polygon',coordinates:[[[0,0],[Infinity,1]]]}},scope)).toThrow();
  expect(()=>validateAppObject({...app,revision:-1},scope)).toThrow();
  const source=sceneRefFromCanvas(canvasObjectRef('SOURCE','source:A1',scope),scope,[0]);
  expect(source.origin).toBe('DXF_IMPORTED');expect(source.sceneId).toBe(sceneIdentity(scope));
  const o=new THREE.Group();tagAppTree(o,ref);expect(o.userData.cadSceneRef).toBe(ref);
 });
});
