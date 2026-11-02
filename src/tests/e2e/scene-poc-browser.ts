import * as THREE from 'three';
import {DXFViewer} from 'three-dxf-viewer';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {explicitElevation} from '../../viewers/three-dxf-viewer/normalize';
import {sceneScope,sourceUnitFromDxf,tagImportedTree} from '../../viewers/three-dxf-viewer/scene-tags';
import {serializeSourceScene,restoreSourceScene,type SceneFormat,type SceneManifest} from '../../viewers/three-dxf-viewer/scene-serialization';

type Packet={format:string;bytes:number[];manifest?:SceneManifest;stats:Record<string,unknown>};
const t=()=>performance.now();
function describe(root:THREE.Object3D){
 const kinds:Record<string,number>={},layers:Record<string,number>={},ids:string[]=[];
 let nodes=0,vertices=0,materials=0;const geometryTrace:number[][]=[],materialTrace:unknown[]=[],visibilityTrace:boolean[]=[],nameTrace:string[]=[];const geometryById:Record<string,number[]>={},materialById:Record<string,unknown>={};
 root.traverse(o=>{nodes++;visibilityTrace.push(o.visible);nameTrace.push(o.name);kinds[o.type]=(kinds[o.type]??0)+1;
   const layer=String(o.userData?.cadLayer??o.userData?.layer??o.userData?.entity?.layer??'UNSPECIFIED');layers[layer]=(layers[layer]??0)+1;
   if(o.userData?.cadSceneRef?.id)ids.push(o.userData.cadSceneRef.id);
   const mesh=o as THREE.Mesh;const geometry=mesh.geometry as THREE.BufferGeometry|undefined;
   vertices+=geometry?.getAttribute('position')?.count??0;const positions=geometry?.getAttribute('position')?Array.from(geometry.getAttribute('position').array):[];geometryTrace.push(positions);if(o.userData?.cadSceneRef?.id)geometryById[o.userData.cadSceneRef.id]=positions;
   if(mesh.material){const ms=Array.isArray(mesh.material)?mesh.material:[mesh.material];materials+=ms.length;const descriptions=ms.map(m=>{const line=m as THREE.LineDashedMaterial;return {type:m.type,color:line.color?.getHex()??null,opacity:m.opacity,linewidth:line.linewidth??null,dashSize:line.dashSize??null,gapSize:line.gapSize??null};});materialTrace.push(descriptions);if(o.userData?.cadSceneRef?.id)materialById[o.userData.cadSceneRef.id]=descriptions;}else materialTrace.push([]);
 });
 const bbox=new THREE.Box3().setFromObject(root);
 return {nodes,vertices,materials,kinds,layers,ids,geometryTrace,materialTrace,visibilityTrace,nameTrace,geometryById,materialById,bbox:[...bbox.min.toArray(),...bbox.max.toArray()]};
}
async function gzipSize(bytes:Uint8Array){const stream=new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));return (await new Response(stream).arrayBuffer()).byteLength;}
async function produce(dxf:string,sourceSha256:string):Promise<Packet[]>{
 const url=URL.createObjectURL(new Blob([explicitElevation(dxf)],{type:'text/plain'}));
 try{
 const viewer=new DXFViewer();viewer.useCache=false;const started=t();
 const root=await viewer.getFromPath(url,'/fonts/CadKorean.typeface.json');if(!root)throw new Error('CONVERTER_EMPTY');
 const parseMs=t()-started;const upstreamData:Record<string,number>={},entityKeys:Record<string,number>={};root.traverse(o=>{for(const key of Object.keys(o.userData??{}))upstreamData[key]=(upstreamData[key]??0)+1;for(const key of Object.keys(o.userData?.entity??{}))entityKeys[key]=(entityKeys[key]??0)+1;});
 const rawConverter={...describe(root),ids:undefined};
 let styleProbe=false;root.traverse(o=>{if(styleProbe||o.type!=='Line')return;const line=o as THREE.Line;line.material=new THREE.LineDashedMaterial({color:0x12abef,linewidth:3,dashSize:2,gapSize:1});line.visible=false;styleProbe=true;});
 const scope=sceneScope('synthetic-version',sourceSha256,sourceUnitFromDxf(dxf));const asset=tagImportedTree(root,scope);
 const original={...describe(root),upstreamData,entityKeys,rawConverter:{nodes:rawConverter.nodes,vertices:rawConverter.vertices,kinds:rawConverter.kinds,layers:rawConverter.layers,bbox:rawConverter.bbox},styleProbe};const bad:string[]=[];root.traverse(o=>{const g=(o as THREE.Mesh).geometry as THREE.BufferGeometry|undefined;const pos=g?.getAttribute("position");if(pos&&Array.from(pos.array).some(n=>!Number.isFinite(n)))bad.push(o.type+":"+o.userData.cadSceneRef?.id);});if(bad.length)throw new Error("UPSTREAM_NONFINITE_GEOMETRY:"+bad.join(","));const packets:Packet[]=[];
 for(const format of ['THREE_JSON','CUSTOM_DTO'] as SceneFormat[]){const a=t();const {bytes,manifest}=await serializeSourceScene(root,asset,format);
  packets.push({format,bytes:[...bytes],manifest,stats:{parseMs,serializeMs:t()-a,gzipBytes:await gzipSize(bytes),original}});}
 try{const a=t();const glb=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:false});
   const bytes=new Uint8Array(glb as ArrayBuffer);packets.push({format:'GLB',bytes:[...bytes],stats:{parseMs,serializeMs:t()-a,gzipBytes:await gzipSize(bytes),original}});
 }catch(e){packets.push({format:'GLB',bytes:[],stats:{error:String(e),original}});}
 return packets;
 }finally{URL.revokeObjectURL(url);}
}
async function restore(packet:Packet,expected?:SceneManifest){const bytes=new Uint8Array(packet.bytes);const a=t();let root:THREE.Object3D;
 if(packet.format==='GLB')root=(await new GLTFLoader().parseAsync(bytes.buffer,'')).scene;
 else if(packet.manifest&&expected)root=await restoreSourceScene(bytes,packet.manifest,{scope:expected.scope,format:expected.format,byteLength:expected.byteLength,sha256:expected.sha256});
 else throw new Error('MANIFEST_MISSING');
 const elapsed=t()-a;const canvas=document.createElement('canvas');document.body.append(canvas);
 const renderer=new THREE.WebGLRenderer({canvas});renderer.setSize(320,240);
 const scene=new THREE.Scene();scene.add(root);const camera=new THREE.OrthographicCamera(-100,100,100,-100,0.1,10000);camera.position.z=1000;renderer.render(scene,camera);
 const result={restoreMs:elapsed,restored:describe(root),rendered:true};renderer.dispose();canvas.remove();return result;
}
Object.assign(window,{scenePoc:{produce,restore}});
