import {expect,test,vi} from 'vitest';
import * as THREE from 'three';
import {sceneScope} from '../../domain/cad-scene';
import {captureExchangeBaseline,exchangeInventory} from '../../viewers/three-dxf-viewer/exchange-snapshot';
import {captureExchangeSnapshot} from '../../viewers/three-dxf-viewer/exchange-snapshot';
import {tagImportedTree} from '../../viewers/three-dxf-viewer/scene-tags';
import {restoreSourceScene,serializeSourceScene} from '../../viewers/three-dxf-viewer/scene-serialization';
import {buildExchangeArtifact} from '../../viewers/three-dxf-viewer/exchange-export';
import {inspectExchangeSnapshot} from '../../viewers/three-dxf-viewer/exchange-export';
import {exchangeOptionsFingerprint,type ExchangeSnapshot} from '../../domain/cad-exchange';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import type {GeoJSONOutline} from '../../viewers/core/outline-compute';

class TestFileReader{
  result:ArrayBuffer|string|null=null;onloadend:(()=>void)|null=null;
  readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(bytes=>{this.result=bytes;this.onloadend?.();});}
  readAsDataURL(blob:Blob){void blob.arrayBuffer().then(bytes=>{this.result=`data:${blob.type||'application/octet-stream'};base64,${Buffer.from(bytes).toString('base64')}`;this.onloadend?.();});}
}
Object.assign(globalThis,{FileReader:TestFileReader});
if(!('ProgressEvent' in globalThis))Object.assign(globalThis,{ProgressEvent:class ProgressEvent extends Event{lengthComputable=false;loaded=0;total=0;}});

function serverSnapshot(geometry:GeoJSONOutline):ExchangeSnapshot{
  const scope=sceneScope('v-qa-server','e'.repeat(64),'DXF_INSUNITS_4');
  const key='server:00000000-0000-4000-8000-000000000009';
  const vertices=(geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates)
    .reduce((sum,poly)=>sum+poly.reduce((n,ring)=>n+ring.length,0),0);
  return {inventory:{scope,snapshotToken:'qa-server',layers:[],objects:[{
    key,origin:'SERVER_OUTLINE',layer:'서버 외곽선',name:'QA',estimatedVertices:vertices,supported:true,
  }],warnings:[],sourceCoverage:'unknown',sourceEntityCount:null},
  selection:{dxf:{enabled:false,mode:'all',layers:[]},generated:{enabled:true,mode:'selected',keys:[key]},memos:{enabled:false,mode:'all',ids:[]}},
  primitives:[],generated:[{key,origin:'SERVER_OUTLINE',name:'QA',geometry}]};
}

test('unsupported imported Sprite remains visible as an excluded render object and layer',()=>{
  const root=new THREE.Group();
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({color:0xffffff}));
  sprite.userData.cadLayer='SPRITES';root.add(sprite);
  const scope=sceneScope('v-sprite','a'.repeat(64),'DXF_INSUNITS_4');
  tagImportedTree(root,scope);
  const inventory=exchangeInventory(root,captureExchangeBaseline(root),scope,[],1)!;

  expect(inventory.layers).toContain('SPRITES');
  expect(inventory.objects).toContainEqual(expect.objectContaining({
    origin:'DXF',layer:'SPRITES',supported:false,reason:'UNSUPPORTED_RENDER_TYPE',
  }));
});

test.each(['LEGACY_DXF','READY_SCENE'] as const)('%s baseline retains nested/repeated BLOCK transforms after live SceneWork changes',async(strategy)=>{
  const root=new THREE.Group();root.position.set(100_000,200_000,0);
  const block=new THREE.Group();block.position.set(10,0,0);root.add(block);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0],3));
  const repeated=(x:number)=>{const instance=new THREE.Group();instance.name='BLOCK_A';instance.position.set(x,20,0);
    const entity=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x456789}));entity.name='same handle';entity.userData.cadLayer='BLOCK_LAYER';instance.add(entity);return {instance,entity};};
  const first=repeated(1),second=repeated(5);block.add(first.instance,second.instance);
  const scope=sceneScope('v-blocks','c'.repeat(64),'DXF_INSUNITS_4');
  const asset=tagImportedTree(root,scope);
  const ready=strategy==='READY_SCENE'
    ?await serializeSourceScene(root,asset,'CUSTOM_DTO')
    :null;
  const sourceRoot=strategy==='READY_SCENE'
    ?await restoreSourceScene(ready!.bytes,ready!.manifest,ready!.manifest)
    :root;
  const baseline=captureExchangeBaseline(sourceRoot);
  const inventory=exchangeInventory(sourceRoot,baseline,scope,[],3)!;
  const before=inventory.objects.filter(o=>o.origin==='DXF');
  expect(before).toHaveLength(2);expect(new Set(before.map(o=>o.key)).size).toBe(2);

  // Simulate a SceneWork translation and visibility delta after baseline capture.
  const loadedBlock=sourceRoot.children[0],loadedFirst=loadedBlock.children[0],loadedFirstEntity=loadedFirst.children[0];
  sourceRoot.position.set(900,800,0);loadedBlock.position.set(-700,-600,0);loadedFirstEntity.visible=false;
  sourceRoot.updateWorldMatrix(true,true);
  const snap=captureExchangeSnapshot(sourceRoot,baseline,inventory,{
    dxf:{enabled:true,mode:'all',layers:[]},generated:{enabled:false,mode:'all',keys:[]},memos:{enabled:false,mode:'all',ids:[]},
  },[]);
  expect(snap.primitives).toHaveLength(2); // full imported baseline ignores hide
  const endpoints=snap.primitives.map(p=>[p.positions[0],p.positions[1]]).sort((a,b)=>a[0]-b[0]);
  expect(endpoints).toEqual([[100_011,200_020],[100_015,200_020]]);
});

test('material-group vertex expansion is rejected before copying the source positions',()=>{
  const root=new THREE.Group(),geometry=new THREE.BufferGeometry();
  const count=150_000,positions=new Float32Array(count*3);
  for(let i=0;i<count;i++)positions.set([i%500,Math.floor(i/500),0],i*3);
  const position=new THREE.BufferAttribute(positions,3);geometry.setAttribute('position',position);
  const oneGroup=Array.from({length:count},(_,i)=>i);
  geometry.setIndex([...oneGroup,...oneGroup]);geometry.addGroup(0,count,0);geometry.addGroup(count,count,1);
  const mesh=new THREE.Mesh(geometry,[new THREE.MeshBasicMaterial(),new THREE.MeshBasicMaterial()]);
  mesh.userData.cadLayer='GROUPS';root.add(mesh);
  const scope=sceneScope('v-expansion','b'.repeat(64),'DXF_INSUNITS_4');
  tagImportedTree(root,scope);const baseline=captureExchangeBaseline(root);
  const inventory=exchangeInventory(root,baseline,scope,[],2)!;
  expect(inventory.objects.find(o=>o.layer==='GROUPS')).toMatchObject({supported:true,estimatedVertices:count,estimatedIndices:count*2});
  const readPosition=vi.spyOn(position,'getX');

  expect(()=>captureExchangeSnapshot(root,baseline,inventory,{
    dxf:{enabled:true,mode:'all',layers:[]},generated:{enabled:false,mode:'all',keys:[]},memos:{enabled:false,mode:'all',ids:[]},
  },[])).toThrow('상한');
  expect(readPosition.mock.calls.length).toBe(0);
});

test('MultiPolygon with a hole round-trips both shells and preserves filled area',async()=>{
  const geometry:GeoJSONOutline={type:'MultiPolygon',coordinates:[
    [[[0,0],[10,0],[10,10],[0,10],[0,0]],[[2,2],[2,4],[4,4],[4,2],[2,2]]],
    [[[20,0],[25,0],[25,5],[20,5],[20,0]]],
  ]};
  const snapshot=serverSnapshot(geometry);
  const options={format:'gltf' as const,unit:'auto' as const,origin:{mode:'auto' as const},filenameBase:'multi'};
  const artifact=await buildExchangeArtifact(snapshot,{...options,partialAck:exchangeOptionsFingerprint(snapshot,options)});
  const restored=(await new GLTFLoader().parseAsync(new TextDecoder().decode(artifact.bytes),'')).scene;
  let area=0,meshCount=0;
  restored.traverse(node=>{if(!(node instanceof THREE.Mesh))return;meshCount++;
    const position=node.geometry.getAttribute('position'),index=node.geometry.getIndex();
    const ids=index?Array.from(index.array):Array.from({length:position.count},(_,i)=>i);
    for(let i=0;i<ids.length;i+=3){const a=ids[i],b=ids[i+1],c=ids[i+2];
      area+=Math.abs((position.getX(b)-position.getX(a))*(position.getZ(c)-position.getZ(a))-
        (position.getZ(b)-position.getZ(a))*(position.getX(c)-position.getX(a)))/2;}
    expect((node.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0xff8c00);
  });
  expect(meshCount).toBe(2);expect(area).toBeCloseTo(121e-6,9);
  expect(artifact.extension).toBe('gltf');
});

test('unknown DXF source coverage requires acknowledgement only when DXF is selected',()=>{
  const polygon:GeoJSONOutline={type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]};
  const snapshot=serverSnapshot(polygon);
  expect(inspectExchangeSnapshot(snapshot).partial).toBe(false);
  const withDxf={...snapshot,selection:{...snapshot.selection,dxf:{enabled:true,mode:'all' as const,layers:[]}}};
  expect(inspectExchangeSnapshot(withDxf).partial).toBe(true);
});

test('cancelling during the non-interruptible encoder disposes the owned scene after it settles',async()=>{
  const polygon:GeoJSONOutline={type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]};
  const snapshot=serverSnapshot(polygon),options={format:'glb' as const,unit:'auto' as const,
    origin:{mode:'auto' as const},filenameBase:'cancel'};
  let finish!: (result:ArrayBuffer|Record<string,unknown>)=>void;
  const encoded=new Promise<ArrayBuffer|Record<string,unknown>>(resolve=>{finish=resolve;});
  const encoder=vi.spyOn(GLTFExporter.prototype,'parseAsync').mockReturnValueOnce(encoded);
  const geometryDispose=vi.spyOn(THREE.BufferGeometry.prototype,'dispose');
  const materialDispose=vi.spyOn(THREE.Material.prototype,'dispose');
  const controller=new AbortController();
  try{
    const pending=buildExchangeArtifact(snapshot,{...options,partialAck:exchangeOptionsFingerprint(snapshot,options)},
      {signal:controller.signal});
    await vi.waitFor(()=>expect(encoder).toHaveBeenCalledTimes(1));
    controller.abort();finish(new ArrayBuffer(12));
    await expect(pending).rejects.toMatchObject({name:'AbortError'});
    expect(geometryDispose).toHaveBeenCalled();expect(materialDispose).toHaveBeenCalled();
  }finally{encoder.mockRestore();geometryDispose.mockRestore();materialDispose.mockRestore();}
});
