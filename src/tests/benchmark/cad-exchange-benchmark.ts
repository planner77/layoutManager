/** R5a synthetic Node-only exchange measurements. No browser/GPU/field claims. */
import * as THREE from 'three';
import {performance} from 'node:perf_hooks';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {sceneScope} from '../../domain/cad-scene';
import {exchangeOptionsFingerprint,type ExchangeOptions,type ExchangeSelection} from '../../domain/cad-exchange';
import {tagImportedTree} from '../../viewers/three-dxf-viewer/scene-tags';
import {captureExchangeBaseline,captureExchangeSnapshot,exchangeInventory} from '../../viewers/three-dxf-viewer/exchange-snapshot';
import {buildExchangeArtifact,inspectExchangeSnapshot} from '../../viewers/three-dxf-viewer/exchange-export';

class NodeFileReader{
 result:ArrayBuffer|string|null=null;onloadend:(()=>void)|null=null;
 readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(bytes=>{this.result=bytes;this.onloadend?.();});}
 readAsDataURL(blob:Blob){void blob.arrayBuffer().then(bytes=>{this.result=`data:${blob.type||'application/octet-stream'};base64,${Buffer.from(bytes).toString('base64')}`;this.onloadend?.();});}
}
Object.assign(globalThis,{FileReader:NodeFileReader});
if(!('ProgressEvent' in globalThis))Object.assign(globalThis,{ProgressEvent:class ProgressEvent extends Event{lengthComputable=false;loaded=0;total=0;}});
const scope=sceneScope('synthetic-exchange-benchmark','f'.repeat(64),'DXF_INSUNITS_4');
const selection:ExchangeSelection={dxf:{enabled:true,mode:'all',layers:[]},generated:{enabled:false,mode:'all',keys:[]},memos:{enabled:false,mode:'all',ids:[]}};
function fixture(lines:number,separateObjects=false){
 const root=new THREE.Group();
 if(separateObjects){
  for(let i=0;i<lines;i++){
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([i,0,0,i,1,0],3));
   const line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x446688}));line.userData.cadLayer=i%2?'A':'B';root.add(line);
  }
 }else{
  const positions=new Float32Array(lines*6);
  for(let i=0;i<lines;i++)positions.set([i,0,0,i,1,0],i*6);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x446688}));line.userData.cadLayer='A';root.add(line);
 }
 tagImportedTree(root,scope);return root;
}
async function measure(lines:number,format:'glb'|'gltf'){
 const root=fixture(lines),start=performance.now(),baseline=captureExchangeBaseline(root);
 const inventory=exchangeInventory(root,baseline,scope,[],lines)!;const inventoried=performance.now();
 const snapshot=captureExchangeSnapshot(root,baseline,inventory,selection,[]);const captured=performance.now();
 const options:ExchangeOptions={format,unit:'auto',origin:{mode:'auto'},filenameBase:'synthetic'};
 const artifact=await buildExchangeArtifact(snapshot,{...options,partialAck:exchangeOptionsFingerprint(snapshot,options)});const encoded=performance.now();
 const input=format==='glb'?artifact.bytes.buffer.slice(artifact.bytes.byteOffset,artifact.bytes.byteOffset+artifact.bytes.byteLength) as ArrayBuffer:new TextDecoder().decode(artifact.bytes);
 const loaded=(await new GLTFLoader().parseAsync(input,'')).scene;const restored=performance.now();
 let segments=0;loaded.traverse(o=>{if(o instanceof THREE.LineSegments)segments+=(o.geometry.getIndex()?.count??o.geometry.getAttribute('position').count)/2;});
 if(segments!==lines)throw new Error(`LOADER_SEGMENT_MISMATCH:${segments}/${lines}`);
 return {lines,format,bytes:artifact.bytes.byteLength,inventoryMs:inventoried-start,captureMs:captured-inventoried,serializeMs:encoded-captured,loaderMs:restored-encoded,segments};
}
async function selectionScale(){
 const root=fixture(10_000,true),baseline=captureExchangeBaseline(root),inventory=exchangeInventory(root,baseline,scope,[],20_000)!;
 const start=performance.now(),snapshot=captureExchangeSnapshot(root,baseline,inventory,selection,[]),captured=performance.now();
 const inspected=inspectExchangeSnapshot(snapshot),end=performance.now();
 if(snapshot.primitives.length!==10_000||inspected.layers.reduce((n,l)=>n+l.accepted,0)!==10_000)throw new Error('SELECTION_SCALE_MISMATCH');
 return {renderObjects:10_000,captureMs:captured-start,inspectMs:end-captured};
}
for(const lines of [100,10_000])for(const format of ['glb','gltf'] as const)console.log(JSON.stringify(await measure(lines,format)));
console.log(JSON.stringify(await selectionScale()));
