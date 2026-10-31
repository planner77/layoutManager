import {describe,expect,test,vi} from 'vitest';
import * as THREE from 'three';
import {exchangeOptionsFingerprint,exchangeSourceUnit,type ExchangeOptions,type ExchangeSelection} from '../../domain/cad-exchange';
import {sceneScope} from '../../domain/cad-scene';
import {tagImportedTree} from '../../viewers/three-dxf-viewer/scene-tags';
import {captureExchangeBaseline,captureExchangeSnapshot,exchangeInventory} from '../../viewers/three-dxf-viewer/exchange-snapshot';
import {buildExchangeArtifact,inspectExchangeSnapshot} from '../../viewers/three-dxf-viewer/exchange-export';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import type {GeoJSONOutline} from '../../viewers/core/outline-compute';

// Installed three r171 requires FileReader even for geometry-only exports.
class TestFileReader{
 result:ArrayBuffer|string|null=null;onloadend:(()=>void)|null=null;
 readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(bytes=>{this.result=bytes;this.onloadend?.();});}
 readAsDataURL(blob:Blob){void blob.arrayBuffer().then(bytes=>{this.result=`data:${blob.type||'application/octet-stream'};base64,${Buffer.from(bytes).toString('base64')}`;this.onloadend?.();});}
}
Object.assign(globalThis,{FileReader:TestFileReader});
if(!('ProgressEvent' in globalThis))Object.assign(globalThis,{ProgressEvent:class ProgressEvent extends Event{lengthComputable=false;loaded=0;total=0;}});

const source=sceneScope('v-exchange','a'.repeat(64),'DXF_INSUNITS_4');
const selection:ExchangeSelection={dxf:{enabled:true,mode:'all',layers:[]},generated:{enabled:false,mode:'all',keys:[]},memos:{enabled:false,mode:'all',ids:[]}};
const options:ExchangeOptions={format:'glb',unit:'auto',origin:{mode:'auto'},filenameBase:'drawing'};
function scene(){
 const root=new THREE.Group();root.position.set(1e9,2e9,0);
 const lineG=new THREE.BufferGeometry();lineG.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0],3));
 const line=new THREE.LineSegments(lineG,new THREE.LineDashedMaterial({color:0x12abef,linewidth:3,dashSize:2,gapSize:1}));line.userData.cadLayer='B';root.add(line);
 const meshG=new THREE.BufferGeometry();meshG.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,0,1,0,1,0,0],3));
 const mesh=new THREE.Mesh(meshG,new THREE.MeshBasicMaterial({color:0xff8800}));mesh.userData.cadLayer='A';root.add(mesh);
 tagImportedTree(root,source);const baseline=captureExchangeBaseline(root);
 return {root,baseline,line,mesh};
}
describe('R5 exchange core',()=>{
 test.each([['DXF_INSUNITS_1','inch'],['DXF_INSUNITS_2','foot'],['DXF_INSUNITS_4','mm'],['DXF_INSUNITS_5','cm'],['DXF_INSUNITS_6','m'],['DXF_INSUNITS_0',null],['DXF_INSUNITS_21',null],['UNSPECIFIED',null],['4',null]])('production source unit %s', (input,expected)=>{
  expect(exchangeSourceUnit(input)).toBe(expected);
 });
 test('baseline ignores live move/hide, layer subset and source coverage requires exact ack',async()=>{
  const {root,baseline,line}=scene();line.visible=false;root.position.set(0,0,0);root.updateWorldMatrix(true,true);
  const inventory=exchangeInventory(root,baseline,source,[],1)!;
  expect(inventory.layers).toEqual(['A','B']);expect(inventory.sourceCoverage).toBe('unknown');
  const snap=captureExchangeSnapshot(root,baseline,inventory,{...selection,dxf:{enabled:true,mode:'layers',layers:['B']}},[]);
  expect(snap.primitives).toHaveLength(1);expect(snap.primitives[0].positions[0]).toBe(1e9);
  expect(inspectExchangeSnapshot(snap)).toMatchObject({excluded:0,partial:true,styleLoss:{LINE_DASH:1,LINE_WIDTH:1}});
  await expect(buildExchangeArtifact(snap,options)).rejects.toThrow('동의');
  const ack=exchangeOptionsFingerprint(snap,options);
  expect(exchangeOptionsFingerprint(snap,{...options,partialAck:ack})).toBe(ack);
  const artifact=await buildExchangeArtifact(snap,{...options,partialAck:ack});
  expect(artifact.mime).toBe('model/gltf-binary');expect(artifact.extension).toBe('glb');
  expect(artifact.bytes.slice(0,4)).toEqual(new Uint8Array([0x67,0x6c,0x54,0x46]));
  const glbView=new DataView(artifact.bytes.buffer,artifact.bytes.byteOffset,artifact.bytes.byteLength);
  const glbJson=JSON.parse(new TextDecoder().decode(artifact.bytes.subarray(20,20+glbView.getUint32(12,true))));
  expect(glbJson.extensionsUsed).toContain('KHR_materials_unlit');
  expect(glbJson.materials.every((m:{extensions?:Record<string,unknown>})=>m.extensions?.KHR_materials_unlit)).toBe(true);
  const restored=(await new GLTFLoader().parseAsync(artifact.bytes.buffer.slice(artifact.bytes.byteOffset,artifact.bytes.byteOffset+artifact.bytes.byteLength) as ArrayBuffer,'')).scene;
  const names:string[]=[];restored.traverse(o=>{if(o.type==='LineSegments')names.push(o.type);});expect(names).toEqual(['LineSegments']);
  let loadedLine:THREE.LineSegments|undefined;restored.traverse(o=>{if(o instanceof THREE.LineSegments)loadedLine=o;});expect(loadedLine).toBeDefined();
  const pos=loadedLine!.geometry.getAttribute('position');expect(Math.hypot(pos.getX(0)-pos.getX(1),pos.getY(0)-pos.getY(1),pos.getZ(0)-pos.getZ(1))).toBeCloseTo(.001,7);
  expect((loadedLine!.material as THREE.LineBasicMaterial).color.getHex()).toBe(0x12abef);
  expect(restored.userData.originWcs[0]).toBeCloseTo(1e9+.5,5);expect(restored.userData.axisMapping).toBe('(x,y,z)->(x,z,-y)');
  expect(artifact.report.maxQuantizationError).toBeLessThan(1e-4);
 });
 test('single embedded glTF and server-only polygon with hole survive loader',async()=>{
  const {root,baseline}=scene();const inventory=exchangeInventory(root,baseline,source,[],2)!;
  const local=captureExchangeSnapshot(root,baseline,inventory,{...selection,dxf:{enabled:false,mode:'all',layers:[]}},[]);
  expect(local.primitives).toHaveLength(0);expect(local.generated).toHaveLength(0);
  const geometry:GeoJSONOutline={type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[2,2],[2,4],[4,4],[4,2],[2,2]]]};
  const serverKey='server:00000000-0000-4000-8000-000000000001';
  const snap={...local,selection:{...local.selection,generated:{enabled:true,mode:'selected' as const,keys:[serverKey]}},inventory:{...inventory,objects:[...inventory.objects,{key:serverKey,origin:'SERVER_OUTLINE' as const,layer:'서버 외곽선',name:'홀',estimatedVertices:10,supported:true}]},generated:[{key:serverKey,origin:'SERVER_OUTLINE' as const,name:'홀',geometry,revision:2,outlineTypeId:'type1',outlineTypeName:'작업'}]};
  expect(inspectExchangeSnapshot(snap).partial).toBe(false);
  await expect(buildExchangeArtifact({...snap,selection:local.selection},{...options,partialAck:exchangeOptionsFingerprint(snap,options)})).rejects.toThrow('생성 개체');
  const fmt={...options,format:'gltf' as const};const artifact=await buildExchangeArtifact(snap,{...fmt,partialAck:exchangeOptionsFingerprint(snap,fmt)});
  const json=JSON.parse(new TextDecoder().decode(artifact.bytes));
  expect(json.asset.version).toBe('2.0');expect(json.buffers.every((b:{uri:string})=>b.uri.startsWith('data:'))).toBe(true);
  expect(json.scenes[0].extras).toMatchObject({versionId:source.versionId,sourceSha256:source.sourceSha256,
   precisionBasis:'RENDERER_SNAPSHOT_ADDITIONAL_FLOAT32'});
  expect(json.scenes[0].extras.precisionWarning).toContain('복구하지 못합니다');
  const restored=(await new GLTFLoader().parseAsync(new TextDecoder().decode(artifact.bytes),'')).scene;
  expect(restored.userData.precisionWarning).toContain('복구하지 못합니다');
  let triangles=0,area=0;restored.traverse(o=>{if(!(o instanceof THREE.Mesh))return;
   const p=o.geometry.getAttribute('position'),idx=o.geometry.getIndex();const ids=idx?Array.from(idx.array):Array.from({length:p.count},(_,i)=>i);
   triangles+=ids.length/3;for(let i=0;i<ids.length;i+=3){const a=ids[i],b=ids[i+1],c=ids[i+2];area+=Math.abs((p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a))-(p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a)))/2;}
  });
  expect(triangles).toBeGreaterThan(0);expect(area).toBeCloseTo(96e-6,9);
  expect(JSON.stringify(json)).toContain('outlineTypeName');
  const binary={...options,format:'glb' as const};
  const glb=await buildExchangeArtifact(snap,{...binary,partialAck:exchangeOptionsFingerprint(snap,binary)});
  const glbView=new DataView(glb.bytes.buffer,glb.bytes.byteOffset,glb.bytes.byteLength);
  const glbJson=JSON.parse(new TextDecoder().decode(glb.bytes.subarray(20,20+glbView.getUint32(12,true))));
  expect(glbJson.scenes[0].extras).toMatchObject({versionId:source.versionId,sourceSha256:source.sourceSha256,
   precisionBasis:'RENDERER_SNAPSHOT_ADDITIONAL_FLOAT32'});
  expect(glbJson.scenes[0].extras.precisionWarning).toContain('복구하지 못합니다');
  const glbLoaded=(await new GLTFLoader().parseAsync(glb.bytes.buffer.slice(glb.bytes.byteOffset,glb.bytes.byteOffset+glb.bytes.byteLength) as ArrayBuffer,'')).scene;
  expect(glbLoaded.userData.precisionWarning).toContain('복구하지 못합니다');
 });
 test('drawRange and material groups export only rendered triangle with correct material',()=>{
  const {root,baseline,mesh}=scene();
  mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,2,0,0,3,0,0,2,1,0],3));
  mesh.geometry.clearGroups();mesh.geometry.addGroup(0,3,0);mesh.geometry.addGroup(3,3,1);mesh.geometry.setDrawRange(3,3);
  (mesh as THREE.Mesh<THREE.BufferGeometry,THREE.Material|THREE.Material[]>).material=[new THREE.MeshBasicMaterial({color:0x111111}),new THREE.MeshBasicMaterial({color:0xabcdef})];
  const inventory=exchangeInventory(root,baseline,source,[],7)!;
  const snap=captureExchangeSnapshot(root,baseline,inventory,{...selection,dxf:{enabled:true,mode:'layers',layers:['A']}},[]);
  expect(snap.primitives).toHaveLength(1);expect(snap.primitives[0].positions[0]).toBe(1e9+2);expect(snap.primitives[0].material.color).toBe(0xabcdef);
 });
 test('point material exports explicit unlit color/opacity and separate size-loss report',async()=>{
  const root=new THREE.Group(),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0],3));
  const points=new THREE.Points(geometry,new THREE.PointsMaterial({color:0x22aaff,opacity:.4,transparent:true,size:5}));points.userData.cadLayer='P';root.add(points);
  tagImportedTree(root,source);const baseline=captureExchangeBaseline(root),inventory=exchangeInventory(root,baseline,source,[],12)!;
  const snap=captureExchangeSnapshot(root,baseline,inventory,selection,[]);
  expect(inspectExchangeSnapshot(snap).styleLoss).toEqual({POINT_SIZE:1});
  const fmt={...options,format:'gltf' as const};const artifact=await buildExchangeArtifact(snap,{...fmt,partialAck:exchangeOptionsFingerprint(snap,fmt)});
  const json=JSON.parse(new TextDecoder().decode(artifact.bytes));expect(json.materials[0].extensions.KHR_materials_unlit).toEqual({});
  const loaded=(await new GLTFLoader().parseAsync(new TextDecoder().decode(artifact.bytes),'')).scene;
  let material:THREE.PointsMaterial|undefined;loaded.traverse(o=>{if(o instanceof THREE.Points)material=o.material as THREE.PointsMaterial;});
  expect(material?.color.getHex()).toBe(0x22aaff);expect(material?.opacity).toBeCloseTo(.4,5);
 });
 test('style loss counts one render object across material groups',()=>{
  const {root,baseline,line}=scene();
  line.geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,1,0,0,2,0,0],3));
  line.geometry.addGroup(0,2,0);line.geometry.addGroup(2,2,1);
  (line as THREE.LineSegments<THREE.BufferGeometry,THREE.Material|THREE.Material[]>).material=[new THREE.LineDashedMaterial({color:0x111111,dashSize:2}),new THREE.LineDashedMaterial({color:0x222222,dashSize:2})];
  const inventory=exchangeInventory(root,baseline,source,[],13)!;
  const snap=captureExchangeSnapshot(root,baseline,inventory,{...selection,dxf:{enabled:true,mode:'layers',layers:['B']}},[]);
  expect(snap.primitives).toHaveLength(2);expect(inspectExchangeSnapshot(snap).styleLoss.LINE_DASH).toBe(1);
 });
 test('actual bundled three-dxf-viewer LINE passes structural geometry guard across constructors',async()=>{
  vi.stubGlobal('window',{WMFJS:{loggingEnabled:()=>{}}});
  try{
   const {DXFViewer}=await import('three-dxf-viewer');
   const dxf=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
    '0','SECTION','2','ENTITIES','0','LINE','5','A1','8','B',
    '10','0','20','0','11','100','21','0','0','ENDSEC','0','EOF',''].join('\n');
   const viewer=new DXFViewer();(viewer as unknown as {_font:unknown})._font={};
   const root=await viewer.getFromPath('data:text/plain,'+encodeURIComponent(dxf),'');
   expect(root).toBeTruthy();let foreign:THREE.Object3D|undefined;
   root!.traverse(o=>{if(o.type==='Line')foreign=o;});
   expect(foreign).toBeTruthy();const geometry=(foreign as unknown as THREE.Line).geometry;
   expect(geometry instanceof THREE.BufferGeometry).toBe(false);expect(geometry.isBufferGeometry).toBe(true);
   tagImportedTree(root!,source);const baseline=captureExchangeBaseline(root!);
   const inventory=exchangeInventory(root!,baseline,source,[],14)!;
   expect(inventory.objects.find(o=>o.layer==='B')).toMatchObject({supported:true,estimatedVertices:2});
   const snap=captureExchangeSnapshot(root!,baseline,inventory,{...selection,dxf:{enabled:true,mode:'layers',layers:['B']}},[]);
   expect(snap.primitives).toHaveLength(1);expect(snap.primitives[0].positions).toHaveLength(6);
  }finally{vi.unstubAllGlobals();}
 });
 test('flag-only geometry impostor is excluded without invoking missing methods',()=>{
  const root=new THREE.Group(),line=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial());
  (line as unknown as {geometry:unknown}).geometry={isBufferGeometry:true};line.userData.cadLayer='FAKE';root.add(line);
  tagImportedTree(root,source);const baseline=captureExchangeBaseline(root),inventory=exchangeInventory(root,baseline,source,[],15)!;
  expect(inventory.objects.find(o=>o.layer==='FAKE')?.reason).toBe('UNSUPPORTED_GEOMETRY');
  const snap=captureExchangeSnapshot(root,baseline,inventory,selection,[]);expect(snap.primitives).toHaveLength(0);
 });
 test('aggregate vertex budget rejects before geometry copy',()=>{
  const root=new THREE.Group();for(let n=0;n<2;n++){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(130_000*3),3));const line=new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff}));line.userData.cadLayer='L';root.add(line);}
  tagImportedTree(root,source);const baseline=captureExchangeBaseline(root),inventory=exchangeInventory(root,baseline,source,[],8)!;
  expect(inventory.objects.filter(o=>o.supported)).toHaveLength(2);
  expect(()=>captureExchangeSnapshot(root,baseline,inventory,selection,[])).toThrow('상한');
 });
 test('index budget and pre-encoder budget reject oversized index arrays',async()=>{
  const {root,baseline,line}=scene();line.geometry.setIndex(new Array(750_001).fill(0));
  let inventory=exchangeInventory(root,baseline,source,[],10)!;
  expect(inventory.objects.find(o=>o.layer==='B')?.reason).toBe('INDEX_BUDGET');
  line.geometry.setIndex(null);inventory=exchangeInventory(root,baseline,source,[],10)!;
  const snap=captureExchangeSnapshot(root,baseline,inventory,{...selection,dxf:{enabled:true,mode:'layers',layers:['B']}},[]);
  const oversized={...snap,primitives:[{...snap.primitives[0],indices:new Array(750_001).fill(0)}]};
  await expect(buildExchangeArtifact(oversized,{...options,partialAck:exchangeOptionsFingerprint(oversized,options)})).rejects.toThrow('상한');
 });
 test('generated all requires every supported key, and namespace groups prevent layer collision',async()=>{
  const {root,baseline,line}=scene();line.userData.cadLayer='서버 외곽선';
  const inventory=exchangeInventory(root,baseline,source,[],11)!;
  const local=captureExchangeSnapshot(root,baseline,inventory,{...selection,dxf:{enabled:true,mode:'layers',layers:['서버 외곽선']}},[]);
  const key='server:00000000-0000-4000-8000-000000000003';
  const geometry:GeoJSONOutline={type:'Polygon',coordinates:[[[1e9,2e9],[1e9+10,2e9],[1e9+10,2e9+10],[1e9,2e9+10],[1e9,2e9]]]};
  const merged={...local,selection:{...local.selection,generated:{enabled:true,mode:'all' as const,keys:[]}},inventory:{...inventory,objects:[...inventory.objects,{key,origin:'SERVER_OUTLINE' as const,layer:'서버 외곽선',name:'poly',estimatedVertices:5,supported:true}]}};
  expect(()=>inspectExchangeSnapshot(merged)).toThrow('누락');
  const snap={...merged,generated:[{key,origin:'SERVER_OUTLINE' as const,name:'poly',geometry}]};
  const artifact=await buildExchangeArtifact(snap,{...options,partialAck:exchangeOptionsFingerprint(snap,options)});
  const restored=(await new GLTFLoader().parseAsync(artifact.bytes.buffer.slice(artifact.bytes.byteOffset,artifact.bytes.byteOffset+artifact.bytes.byteLength) as ArrayBuffer,'')).scene;
  expect(restored.children.map(o=>o.name).sort()).toEqual(['DXF','SERVER_OUTLINE']);
  expect(restored.children.find(o=>o.name==='DXF')?.children[0].name).toBe('서버_외곽선');
  expect(restored.children.find(o=>o.name==='SERVER_OUTLINE')?.children[0].name).toMatch(/^서버_외곽선/);
 });
 test('throwing exporter releases owned geometry/material and never returns artifact',async()=>{
  const {root,baseline}=scene(),inventory=exchangeInventory(root,baseline,source,[],9)!;
  const snap=captureExchangeSnapshot(root,baseline,inventory,{...selection,dxf:{enabled:true,mode:'layers',layers:['A']}},[]);
  const encoder=vi.spyOn(GLTFExporter.prototype,'parseAsync').mockRejectedValueOnce(new Error('encoder failed'));
  const geometryDispose=vi.spyOn(THREE.BufferGeometry.prototype,'dispose'),materialDispose=vi.spyOn(THREE.Material.prototype,'dispose');
  try{await expect(buildExchangeArtifact(snap,{...options,partialAck:exchangeOptionsFingerprint(snap,options)})).rejects.toThrow('encoder failed');
   expect(geometryDispose).toHaveBeenCalled();expect(materialDispose).toHaveBeenCalled();}
  finally{encoder.mockRestore();geometryDispose.mockRestore();materialDispose.mockRestore();}
 });
 test('single-element material array obeys groups and invalid indices are excluded',()=>{
  const {root,baseline,mesh}=scene();
  (mesh as THREE.Mesh<THREE.BufferGeometry,THREE.Material|THREE.Material[]>).material=[new THREE.MeshBasicMaterial({color:0xff8800})];mesh.geometry.clearGroups();mesh.geometry.addGroup(0,3,0);
  let inventory=exchangeInventory(root,baseline,source,[],4)!;
  expect(inventory.objects.find(o=>o.layer==='A')?.supported).toBe(true);
  mesh.geometry.clearGroups();inventory=exchangeInventory(root,baseline,source,[],4)!;
  expect(inventory.objects.find(o=>o.layer==='A')?.reason).toBe('AMBIGUOUS_MATERIAL_GROUP');
  mesh.geometry.setIndex([0,1,4]);inventory=exchangeInventory(root,baseline,source,[],4)!;
  expect(inventory.objects.find(o=>o.layer==='A')?.reason).toBe('INVALID_INDEX');
 });
 test('external texture and unsupported unit are explicit; selected keys are strict',async()=>{
  const {root,baseline,mesh}=scene();
  (mesh.material as THREE.MeshBasicMaterial).map=new THREE.Texture();
  let inventory=exchangeInventory(root,baseline,source,[],5)!;
  expect(inventory.objects.find(o=>o.layer==='A')?.reason).toBe('UNSUPPORTED_TEXTURE');
  expect(()=>captureExchangeSnapshot(root,baseline,inventory,{...selection,generated:{enabled:true,mode:'selected',keys:['server:unknown']}},[])).toThrow('선택');
  const survey=sceneScope('v-exchange','a'.repeat(64),'DXF_INSUNITS_21');
  inventory=exchangeInventory(root,baseline,survey,[],5)!;
  const snap=captureExchangeSnapshot(root,baseline,inventory,{...selection,dxf:{enabled:true,mode:'layers',layers:['B']}},[]);
  await expect(buildExchangeArtifact(snap,{...options,partialAck:exchangeOptionsFingerprint(snap,options)})).rejects.toThrow('단위');
 });
 test('custom origin precision over bound fails before output; cancelled job disposes owned scene',async()=>{
  const {root,baseline}=scene();const inventory=exchangeInventory(root,baseline,source,[],6)!;
  const local=captureExchangeSnapshot(root,baseline,inventory,{...selection,dxf:{enabled:false,mode:'all',layers:[]}},[]);
  const key='server:00000000-0000-4000-8000-000000000002';const base=1e9+.123;
  const geometry:GeoJSONOutline={type:'Polygon',coordinates:[[[base,0],[base+10,0],[base+10,10],[base,10],[base,0]]]};
  const snap={...local,selection:{...selection,dxf:{enabled:false,mode:'all' as const,layers:[]},generated:{enabled:true,mode:'selected' as const,keys:[key]}},inventory:{...inventory,objects:[...inventory.objects,{key,origin:'SERVER_OUTLINE' as const,layer:'서버 외곽선',name:'large',estimatedVertices:5,supported:true}]},generated:[{key,origin:'SERVER_OUTLINE' as const,name:'large',geometry}]};
  const bad={...options,origin:{mode:'custom' as const,x:0,y:0,z:0}};await expect(buildExchangeArtifact(snap,{...bad,partialAck:exchangeOptionsFingerprint(snap,bad)})).rejects.toThrow('Float32');
  const controller=new AbortController();const dispose=vi.spyOn(THREE.BufferGeometry.prototype,'dispose');
  const good={...options,origin:{mode:'auto' as const}};
  await expect(buildExchangeArtifact(snap,{...good,partialAck:exchangeOptionsFingerprint(snap,good)},{signal:controller.signal,onStage:stage=>{if(stage==='serialize')controller.abort();}})).rejects.toMatchObject({name:'AbortError'});
  expect(dispose).toHaveBeenCalled();dispose.mockRestore();
 });
 test('invalid draw range and nonplanar geometry receive per-layer reasons',()=>{
  const {root,baseline,line,mesh}=scene();line.geometry.setDrawRange(1,1);
  const p=mesh.geometry.getAttribute('position');p.setZ(1,2);p.needsUpdate=true;
  const inventory=exchangeInventory(root,baseline,source,[],3)!;
  expect(inventory.objects.find(o=>o.layer==='B')?.reason).toBe('INVALID_PRIMITIVE_ARITY');
  expect(inventory.objects.find(o=>o.layer==='A')?.reason).toBe('NONPLANAR_GEOMETRY');
  const snap=captureExchangeSnapshot(root,baseline,inventory,selection,[]);
  expect(inspectExchangeSnapshot(snap).layers).toEqual(expect.arrayContaining([
   expect.objectContaining({layer:'A',excluded:1,reasons:{NONPLANAR_GEOMETRY:1}}),
   expect.objectContaining({layer:'B',excluded:1,reasons:{INVALID_PRIMITIVE_ARITY:1}}),
  ]));
 });
});
