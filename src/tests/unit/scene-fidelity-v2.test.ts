import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {sceneScope,tagImportedTree} from '../../viewers/three-dxf-viewer/scene-tags';
import {serializeSourceScene,restoreSourceScene,storedSceneViewerData} from '../../viewers/three-dxf-viewer/scene-serialization';
import {validateStoredScenePayload} from '../../domain/scene-payload';
import {sceneSha256} from '../../domain/scene-digest';
import {storedSceneFidelityProfile} from '../../viewers/three-dxf-viewer/scene-serialization';
import {writeShapeGeometry} from '../../viewers/three-dxf-viewer/scene-shape';
import type {SceneManifest} from '../../domain/cad-scene';

const scope=sceneScope('11111111-1111-4111-8111-111111111111','c'.repeat(64),'DXF_INSUNITS_4');
const enc=new TextEncoder();
function packet(dto:unknown,manifest:SceneManifest){const bytes=enc.encode(JSON.stringify(dto));return {bytes,manifest:{...manifest,byteLength:bytes.length,sha256:sceneSha256(bytes)}};}
function shape(){const s=new THREE.Shape();s.moveTo(0,0);s.lineTo(10,0);s.quadraticCurveTo(12,5,10,10);s.bezierCurveTo(5,12,1,12,0,10);s.lineTo(0,0);
 const h=new THREE.Path();h.moveTo(2,2);h.lineTo(3,2);h.lineTo(3,3);h.lineTo(2,2);s.holes.push(h);return s;}
async function scene(){
 const root=new THREE.Group();
 for(const side of [0,1,2] as const){
  const g=new THREE.ShapeGeometry(shape(),8);g.setDrawRange(1,12);
  const m=new THREE.MeshBasicMaterial({side,color:0x123456,depthTest:false,depthWrite:false,alphaTest:.25,blending:THREE.AdditiveBlending});
  root.add(new THREE.Mesh(g,m));
 }
 return serializeSourceScene(root,tagImportedTree(root,scope),'CUSTOM_DTO');
}
describe('FX01/FX02 v2 geometry and material fidelity',()=>{
 it('restores actual ShapeGeometry parameters, clone, buffers, groups, draw range and side slots',async()=>{
  const p=await scene();validateStoredScenePayload(p.bytes,p.manifest);
  const dto=JSON.parse(new TextDecoder().decode(p.bytes));
  const restored=await restoreSourceScene(p.bytes,p.manifest,p.manifest);
  expect(restored.children).toHaveLength(3);
  for(const [i,node] of restored.children.entries()){
   const mesh=node as THREE.Mesh;
   expect(mesh.geometry).toBeInstanceOf(THREE.ShapeGeometry);
   expect(mesh.geometry.clone()).toBeInstanceOf(THREE.ShapeGeometry);
   expect((mesh.geometry as THREE.ShapeGeometry).parameters.shapes).toHaveLength(1);
   expect(writeShapeGeometry(mesh.geometry as THREE.ShapeGeometry)).toEqual({
     shapes:dto.root.children[i].geometry.shapes,curveSegments:dto.root.children[i].geometry.curveSegments});
   const pshape=(mesh.geometry as THREE.ShapeGeometry).parameters.shapes as THREE.Shape[];
   expect(pshape[0].holes).toHaveLength(1);
   expect(pshape[0].curves.some(c=>c.type==='QuadraticBezierCurve')).toBe(true);
   expect(pshape[0].curves.some(c=>c.type==='CubicBezierCurve')).toBe(true);
   expect(mesh.geometry.drawRange).toEqual({start:1,count:12});
   expect(mesh.geometry.groups).toHaveLength(0);
   const encodedIndex=dto.root.children[i].geometry.index;
   expect(mesh.geometry.index?.array.constructor.name??null).toBe(encodedIndex?.arrayType??null);
   expect(mesh.geometry.index?Array.from(mesh.geometry.index.array):null).toEqual(encodedIndex?.array??null);
   for(const [name,attr] of Object.entries(dto.root.children[i].geometry.attributes)){
    const actual=mesh.geometry.getAttribute(name) as THREE.BufferAttribute;
    expect(actual.array.constructor.name).toBe((attr as {arrayType:string}).arrayType);
    expect(Array.from(actual.array)).toEqual((attr as {array:number[]}).array);
   }
   expect((mesh.material as THREE.MeshBasicMaterial).side).toBe(i);
   expect(mesh.material).toMatchObject({depthTest:false,depthWrite:false,alphaTest:.25,blending:THREE.AdditiveBlending});
  }
  expect((storedSceneViewerData(p.bytes) as unknown as {sourceIndex:{state:string}}).sourceIndex.state).toBe('UNAVAILABLE');
  expect(storedSceneFidelityProfile(p.bytes)).toEqual({render:'FULL_V2',sourceIndex:'UNAVAILABLE',action:'REBUILD_REQUIRED'});
 });
 it('keeps front/back/double sided raycast behavior',async()=>{
  const root=new THREE.Group();
  for(const side of [0,1,2]){
   const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0)]);
   root.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:side as THREE.Side})));
  }
  const p=await serializeSourceScene(root,tagImportedTree(root,scope),'CUSTOM_DTO');
  const restored=await restoreSourceScene(p.bytes,p.manifest,p.manifest);restored.updateWorldMatrix(true,true);
  const ray=(mesh:THREE.Object3D,z:number)=>new THREE.Raycaster(new THREE.Vector3(.2,.2,z),new THREE.Vector3(0,0,-Math.sign(z))).intersectObject(mesh).length>0;
  const [front,back,double]=restored.children;
  expect(ray(front,10)).toBe(true);expect(ray(front,-10)).toBe(false);
  expect(ray(back,10)).toBe(false);expect(ray(back,-10)).toBe(true);
  expect(ray(double,10)).toBe(true);expect(ray(double,-10)).toBe(true);
 });
 it('rejects missing v2 fields, coercions, custom blending, type spoof, bad draw range and index storage',async()=>{
  const p=await scene();const base=JSON.parse(new TextDecoder().decode(p.bytes));
  const mutations:Array<(x:typeof base)=>void>=[
   x=>{delete x.root.children[0].materials[0].side;},
   x=>{x.root.children[0].materials[0].side='2';},
   x=>{x.root.children[0].materials[0].blending=5;},
   x=>{x.root.children[0].materials[0].blending=null;},
   x=>{x.root.children[0].materials[0].type=['MeshBasicMaterial'];},
   x=>{x.root.children[0].geometry.drawRange.count=-1;},
   x=>{x.root.children[0].geometry.drawRange.count=1.5;},
   x=>{x.root.children[0].geometry.type='BoxGeometry';},
   x=>{x.root.children[0].geometry.type=['ShapeGeometry'];},
   x=>{x.root.children[0].geometry.shapes[0].curves[0].type='CatmullRomCurve3';},
   x=>{x.root.children[0].geometry.shapes[0].holes[0].currentPoint[0]=1e20;},
   x=>{x.root.children[0].geometry.shapes[0].holes[0].curves[0].v1=[NaN,1];},
   x=>{x.root.children[0].geometry.index={arrayType:'Uint16Array',array:[1.2]};},
   x=>{x.root.children[0].geometry.index.arrayType=['Uint16Array'];},
   x=>{delete x.viewerData.sourceIndex;},
   x=>{x.viewerData.sourceIndex.state=['READY'];},
   x=>{x.viewerData.sourceIndex.state=['UNAVAILABLE'];},
   x=>{x.viewerData.sourceIndex={state:'UNAVAILABLE',reason:['INDEX_ABSENT']};},
   x=>{x.viewerData.sourceIndex={state:'READY',scope, index:{},bindings:[]};},
  ];
  for(const mutate of mutations){const value=structuredClone(base);mutate(value);const changed=packet(value,p.manifest);
   expect(()=>validateStoredScenePayload(changed.bytes,changed.manifest)).toThrow();}
  const root=new THREE.Group();const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(1,0,0)]);
  (g as {type:string}).type='ShapeGeometry';root.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial()));
  await expect(serializeSourceScene(root,tagImportedTree(root,scope),'CUSTOM_DTO')).rejects.toThrow('CUSTOM_SHAPE_UNSUPPORTED');
 });
 it('keeps schema1 readable with explicit unknown fidelity and no source index',async()=>{
  const root=new THREE.Group();root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(1,1,0)]),new THREE.LineBasicMaterial()));
  const p=await serializeSourceScene(root,tagImportedTree(root,scope),'CUSTOM_DTO');
  const old=JSON.parse(new TextDecoder().decode(p.bytes));old.schema=1;delete old.viewerData.sourceIndex;
  for(const n of old.root.children){delete n.geometry.type;delete n.geometry.drawRange;delete n.geometry.shapes;delete n.geometry.curveSegments;
   for(const m of n.materials){delete m.side;delete m.depthTest;delete m.depthWrite;delete m.alphaTest;delete m.blending;}}
  const v1=packet(old,p.manifest);validateStoredScenePayload(v1.bytes,v1.manifest);
  expect((await restoreSourceScene(v1.bytes,v1.manifest,v1.manifest)).children).toHaveLength(1);
  expect(storedSceneViewerData(v1.bytes)).toHaveProperty('textIndex');
  expect(storedSceneViewerData(v1.bytes)).not.toHaveProperty('sourceIndex');
  const original=v1.bytes.slice();
  expect(storedSceneFidelityProfile(v1.bytes)).toEqual({render:'LEGACY_FIDELITY_UNKNOWN',sourceIndex:'UNAVAILABLE',action:'REBUILD_REQUIRED'});
  expect(v1.bytes).toEqual(original);
 });
 it('charges v2 index arrays against the same 2M scalar budget',async()=>{
  const p=await scene();const value=JSON.parse(new TextDecoder().decode(p.bytes));
  value.root.children[0].geometry.attributes.position.array=Array(1_100_001).fill(0);
  value.root.children[0].geometry.index={arrayType:'Uint16Array',array:Array(900_000).fill(0)};
  const changed=packet(value,p.manifest);
  expect(()=>validateStoredScenePayload(changed.bytes,changed.manifest)).toThrow();
 });
});
