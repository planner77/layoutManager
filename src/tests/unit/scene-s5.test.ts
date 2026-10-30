import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {sceneScope,tagImportedTree} from '../../viewers/three-dxf-viewer/scene-tags';
import {sceneOutlineProjection} from '../../viewers/three-dxf-viewer/scene-projection';
import {SelectionSpatialIndex} from '../../viewers/three-dxf-viewer/selection-spatial-index';
import {SceneWorkDocument} from '../../domain/scene-work';
import {computeRenderOutline} from '../../viewers/core/outline-compute';
import {GeneratedDocument} from '../../domain/generated-document';
import {buildOutlineExport,parseOutlineExport,parseAppOutlineExport} from '../../domain/outline-draft';
const scope=sceneScope('11111111-1111-4111-8111-111111111111','a'.repeat(64));
function geometry(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,10,0,0,10,10,0,0,10,0],3));g.setIndex([0,1,2,0,2,3]);return g;}
function fixture(){const root=new THREE.Group(),parent=new THREE.Group(),mesh=new THREE.Mesh(geometry());parent.position.set(100,200,0);root.add(parent);parent.add(mesh);const asset=tagImportedTree(root,scope);return {root,mesh,asset};}
describe('S5 render identity, projection, work, provenance',()=>{
 it('uses stable imported refs, drawRange and matrixWorld; rejects nonplanar and bad index',()=>{
  const {root,mesh}=fixture();mesh.geometry.setDrawRange(0,3);
  const projected=sceneOutlineProjection(root,scope);expect(projected.entities).toHaveLength(1);
  expect(projected.entities[0].bounds).toEqual([100,200,110,210]);
  const id=projected.entities[0].id;mesh.uuid='renderer-rebuilt';
  expect(sceneOutlineProjection(root,scope).entities[0].id).toBe(id);
  mesh.geometry.setDrawRange(0,6);mesh.geometry.getAttribute('position').setZ(2,1);
  expect(sceneOutlineProjection(root,scope).entities).toHaveLength(0);
  mesh.geometry.getAttribute('position').setZ(2,0);mesh.geometry.setIndex([0,1,99]);
  expect(sceneOutlineProjection(root,scope).entities).toHaveLength(0);
 });
 it('uses a drawable child as the selectable unit when its parent also has geometry',()=>{
  const root=new THREE.Group(),parent=new THREE.Line(geometry()),child=new THREE.Line(geometry());
  root.add(parent);parent.add(child);tagImportedTree(root,scope);
  const projected=sceneOutlineProjection(root,scope);
  expect(projected.entities).toHaveLength(1);
  expect(projected.entities[0].id).toBe(child.userData.cadSceneRef.id);
 });
 it('reads converter entity.layer for render candidates without treating its Handle as source attestation',()=>{
  const {root,mesh}=fixture();
  mesh.userData.entity={type:'LINE',handle:'FAKE',layer:'WORK'};
  const projected=sceneOutlineProjection(root,scope);
  expect(projected.entities).toHaveLength(1);
  expect(projected.entities[0]).toMatchObject({layer:'WORK',handle:null,stable:false});
  const visible=new Set(['WORK']);
  const spatial=new SelectionSpatialIndex(projected.entities);
  expect(spatial.query([104,204,106,206]).filter(e=>visible.has(e.layer)).map(e=>e.id))
    .toEqual([mesh.userData.cadSceneRef.id]);
  expect(spatial.query([104,204,106,206]).filter(e=>new Set(['OTHER']).has(e.layer))).toEqual([]);
 });
 it('keeps immutable baseline, validates selection atomically and restores hidden objects',()=>{
  const {root,mesh,asset}=fixture();const before=JSON.stringify(asset),vertices=Array.from(mesh.geometry.getAttribute('position').array);
  const refs=sceneOutlineProjection(root,scope).entities.map(()=>mesh.userData.cadSceneRef);
  const doc=new SceneWorkDocument(scope,refs);const id=refs[0].id,selected=[doc.getState().objects[0].ref];
  doc.execute({type:'Translate',ids:[id],dx:5,dy:0},selected);
  doc.execute({type:'Rotate',ids:[id],angleDegrees:90,pivot:[0,0]},selected);
  doc.execute({type:'Visibility',ids:[id],visible:false},selected);
  expect(doc.getState().objects[0].visible).toBe(false);
  expect(()=>doc.execute({type:'Translate',ids:[id],dx:1,dy:1},selected)).toThrow();
  expect(()=>doc.execute({type:'Visibility',ids:[id,'unknown'],visible:true},selected)).toThrow();
  doc.execute({type:'Visibility',ids:[id],visible:true},[]);
  expect(doc.getState().objects[0].visible).toBe(true);
  expect(doc.undo()).toBe(true);expect(doc.getState().objects[0].visible).toBe(false);
  expect(doc.redo()).toBe(true);expect(doc.getState().objects[0].visible).toBe(true);
  expect(JSON.stringify(asset)).toBe(before);expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual(vertices);
  expect(root.children[0].position.x).toBe(100);
 });
 it('creates browser-only render result without source handles and strict parser rejects its JSON',()=>{
  const {root}=fixture();const entity=sceneOutlineProjection(root,scope).entities[0];
  const result=computeRenderOutline('PRECISE',[entity]);
  expect(result).toMatchObject({geometryBasis:'RENDER_WCS_2D',persistable:false,sourceEntityIds:[],derivedFrom:[entity.id]});
  const doc=new GeneratedDocument(scope);const entry=doc.append({id:'527c8d99-435c-4ccf-991a-648a27b8a2d1',savedOutlineId:'local-1',createdAt:'2026-10-30T00:00:00Z',result});
  const payload=buildOutlineExport(scope.versionId,scope.sourceSha256,null,[{id:'local-1',createdAt:entry.createdAt,result,sceneRef:entry.sceneRef}]);
  expect(payload.schemaVersion).toBe(3);
  expect(()=>parseOutlineExport(payload,scope.versionId,scope.sourceSha256)).toThrow();
  expect(parseAppOutlineExport(payload,scope.versionId,scope.sourceSha256).outlines[0].sceneRef.id).toBe(entry.ref.id);
  expect(()=>parseAppOutlineExport({...payload,sourceAttestable:true},scope.versionId,scope.sourceSha256)).toThrow();
  expect(()=>parseAppOutlineExport({...payload,outlines:[{...payload.outlines[0],origin:'DXF_IMPORTED'}]},scope.versionId,scope.sourceSha256)).toThrow();
  const noProvenance={...payload,outlines:[{...payload.outlines[0],result:{...result,derivedFrom:undefined}}]};
  expect(parseAppOutlineExport(noProvenance,scope.versionId,scope.sourceSha256).outlines).toHaveLength(1);
  expect(()=>parseAppOutlineExport({...payload,outlines:[{...payload.outlines[0],result:{...result,derivedFrom:['foreign']}}]},scope.versionId,scope.sourceSha256)).toThrow();
  expect(()=>parseAppOutlineExport({...payload,unitCode:4},scope.versionId,scope.sourceSha256)).toThrow();
  expect(()=>parseAppOutlineExport({...payload,unitCode:25},scope.versionId,scope.sourceSha256)).toThrow();
  expect(()=>parseAppOutlineExport({...payload,outlines:[payload.outlines[0],{
    ...payload.outlines[0],id:'local-2',objectId:'527c8d99-435c-4ccf-991a-648a27b8a2d2',
    sceneRef:{...entry.sceneRef,id:'527c8d99-435c-4ccf-991a-648a27b8a2d2',sourceUnit:'DXF_INSUNITS_4'},
  }]},scope.versionId,scope.sourceSha256)).toThrow();
 });
});
