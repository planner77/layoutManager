import * as THREE from 'three';
import type {ExchangeArtifact,ExchangeBuildContext,ExchangeGeneratedInput,ExchangeOptions,ExchangePrimitive,ExchangeReport,ExchangeSnapshot,ExchangeUnit} from '../../domain/cad-exchange';
import {EXCHANGE_LIMITS,EXCHANGE_UNIT_METRES,exchangeOptionsFingerprint,exchangeSourceUnit,selectedExchangeMemos} from '../../domain/cad-exchange';
import {validatedGeneratedGeometry} from '../../domain/generated-document';
import {loadExchangeMemoFont,type MemoFontLease} from './exchange-memo-font';
import {rasterizeExchangeMemos} from './exchange-memo-raster';
import {buildExchangeMemoAnnotation} from './exchange-memo-annotation';

const PRECISION_WARNING='좌표 오차는 renderer snapshot 대비 추가 Float32 오차입니다. 이미 잃은 원본 CAD 정밀도는 복구하지 못합니다.';

function abort(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('취소됨','AbortError');}
function unitFor(snapshot:ExchangeSnapshot,choice:ExchangeOptions['unit']):ExchangeUnit{
 const u=choice==='auto'?exchangeSourceUnit(snapshot.inventory.scope.sourceUnit):choice;
 if(!u)throw new Error('원본 단위가 미상 또는 미지원입니다. 단위를 명시적으로 선택하세요.');
 return u;
}
function boundsOf(snapshot:ExchangeSnapshot):THREE.Box3{
 const box=new THREE.Box3();const v=new THREE.Vector3();
 for(const p of snapshot.primitives)for(let i=0;i<p.positions.length;i+=3)box.expandByPoint(v.set(p.positions[i],p.positions[i+1],p.positions[i+2]));
 for(const g of snapshot.generated){const geo=validatedGeneratedGeometry(g.geometry),polys=geo.type==='Polygon'?[geo.coordinates]:geo.coordinates;
  for(const poly of polys)for(const ring of poly)for(const point of ring)box.expandByPoint(v.set(point[0],point[1],0));}
 for(const memo of snapshot.memos??[])box.expandByPoint(v.set(memo.anchorWcs.x,memo.anchorWcs.y,0));
 return box;
}
function transform(x:number,y:number,z:number,o:THREE.Vector3,s:number):readonly [number,number,number]{
 return [s*(x-o.x),s*(z-o.z),-s*(y-o.y)];
}
function objectFor(p:ExchangePrimitive,o:THREE.Vector3,s:number,precision:{max:number}):THREE.Object3D{
 if(p.positions.length%3!==0||!p.positions.length)throw new Error('INVALID_POSITION');
 if(p.indices?.some(i=>!Number.isSafeInteger(i)||i<0||i>=p.positions.length/3))throw new Error('INVALID_INDEX');
 if(p.colors&&p.colors.length!==p.positions.length)throw new Error('INVALID_COLOR');
 if(p.uvs&&p.uvs.length!==p.positions.length/3*2)throw new Error('INVALID_UV');
 if(p.normals&&p.normals.length!==p.positions.length)throw new Error('INVALID_NORMAL');
 for(const array of [p.positions,p.colors,p.uvs,p.normals])if(array?.some(n=>!Number.isFinite(n)))throw new Error('INVALID_ATTRIBUTE');
 const positions=new Float32Array(p.positions.length);
 for(let i=0;i<p.positions.length;i+=3){
  const raw=transform(p.positions[i],p.positions[i+1],p.positions[i+2],o,s);
  const q=raw.map(Math.fround);if(q.some(n=>!Number.isFinite(n)))throw new Error('INVALID_WORLD_POSITION');
  precision.max=Math.max(precision.max,Math.hypot(raw[0]-q[0],raw[1]-q[1],raw[2]-q[2]));
  positions.set(q,i);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));
 if(p.indices)g.setIndex([...p.indices]);
 if(p.colors)g.setAttribute('color',new THREE.Float32BufferAttribute([...p.colors],3));
 if(p.uvs)g.setAttribute('uv',new THREE.Float32BufferAttribute([...p.uvs],2));
 if(p.normals){
  const transformed:number[]=[];for(let i=0;i<p.normals.length;i+=3)transformed.push(p.normals[i],p.normals[i+2],-p.normals[i+1]);
  g.setAttribute('normal',new THREE.Float32BufferAttribute(transformed,3));}
 const common={color:p.material.color,transparent:p.material.opacity<1,opacity:p.material.opacity,vertexColors:p.material.vertexColors};
 // Export-only MeshBasicMaterial causes r171 GLTFExporter to emit KHR_materials_unlit
 // for line/point primitives as well. GLTFLoader restores their native materials.
 const mat=new THREE.MeshBasicMaterial({...common,side:THREE.DoubleSide});
 let obj:THREE.Object3D;
 if(p.kind==='Mesh')obj=new THREE.Mesh(g,mat);
 else if(p.kind==='Points')obj=new THREE.Points(g,mat);
 else obj=p.kind==='LineSegments'?new THREE.LineSegments(g,mat):p.kind==='LineLoop'?new THREE.LineLoop(g,mat):new THREE.Line(g,mat);
 obj.name=p.name.slice(0,128);obj.userData={key:p.key,origin:p.origin,renderLayer:p.layer,degradedStyle:[...p.material.styleLoss]};
 return obj;
}
function shapeObject(g:ExchangeGeneratedInput,o:THREE.Vector3,s:number,precision:{max:number}):THREE.Group{
 const geometry=validatedGeneratedGeometry(g.geometry),polys=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
 const group=new THREE.Group();group.name=g.name.slice(0,128);group.userData={key:g.key,origin:g.origin,name:g.name,outlineTypeId:g.outlineTypeId??null,outlineTypeName:g.outlineTypeName??null,...(g.kind?{kind:g.kind}:{}),...(g.revision!==undefined?{revision:g.revision}:{})};
 try{
  for(const poly of polys){
   const ring=(r:readonly (readonly number[])[])=>r.slice(0,-1).map(p=>new THREE.Vector2((p[0]-o.x)*s,-(p[1]-o.y)*s));
   const contour=ring(poly[0]),holes=poly.slice(1).map(ring);
   if(contour.length<3||holes.some(h=>h.length<3))throw new Error('INVALID_POLYGON');
   if(!THREE.ShapeUtils.isClockWise(contour))contour.reverse();
   for(const hole of holes)if(THREE.ShapeUtils.isClockWise(hole))hole.reverse();
   const triangles=THREE.ShapeUtils.triangulateShape(contour,holes),vertices=[...contour,...holes.flat()];
   if(!triangles.length)throw new Error('INVALID_POLYGON_TRIANGULATION');
   const position=new Float32Array(vertices.length*3),rawZ=(0-o.z)*s;
   for(let i=0;i<vertices.length;i++){
    const raw=[vertices[i].x,rawZ,vertices[i].y],q=raw.map(Math.fround);
    if(q.some(n=>!Number.isFinite(n)))throw new Error('INVALID_POLYGON_POSITION');
    precision.max=Math.max(precision.max,Math.hypot(raw[0]-q[0],raw[1]-q[1],raw[2]-q[2]));position.set(q,i*3);
   }
   const meshGeometry=new THREE.BufferGeometry();meshGeometry.setAttribute('position',new THREE.BufferAttribute(position,3));
   meshGeometry.setIndex(triangles.flat());meshGeometry.computeVertexNormals();
   group.add(new THREE.Mesh(meshGeometry,new THREE.MeshBasicMaterial({color:0xff8c00,side:THREE.DoubleSide})));
  }
  return group;
 }catch(error){group.traverse(node=>{const mesh=node as THREE.Mesh;mesh.geometry?.dispose();if(mesh.material)for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])m.dispose();});throw error;}
}
function validateSelection(snapshot:ExchangeSnapshot){
 const selectedDxf=snapshot.inventory.objects.filter(o=>o.origin==='DXF'&&o.supported&&snapshot.selection.dxf.enabled&&
  (snapshot.selection.dxf.mode==='all'||snapshot.selection.dxf.layers.includes(o.layer)));
 const expectedDxf=new Set(selectedDxf.map(o=>o.key)),seenDxf=new Set<string>();
 for(const p of snapshot.primitives){
  const base=expectedDxf.has(p.key)?p.key:p.key.replace(/:\d+$/,'');
  if(p.origin!=='DXF'||!expectedDxf.has(base))throw new Error('원본 렌더 선택이 변경되었습니다.');seenDxf.add(base);
 }
 if(selectedDxf.some(o=>!seenDxf.has(o.key)))throw new Error('원본 렌더 선택이 변경되었습니다.');
 if(new Set(snapshot.selection.dxf.layers).size!==snapshot.selection.dxf.layers.length||snapshot.selection.dxf.mode==='layers'&&snapshot.selection.dxf.enabled&&
  (!snapshot.selection.dxf.layers.length||snapshot.selection.dxf.layers.some(l=>!snapshot.inventory.layers.includes(l))))throw new Error('렌더 레이어 선택이 변경되었습니다.');
 const local=new Set(snapshot.inventory.objects.filter(o=>o.origin==='LOCAL_GENERATED'&&o.supported).map(o=>o.key));
 const server=new Set(snapshot.inventory.objects.filter(o=>o.origin==='SERVER_OUTLINE'&&o.supported).map(o=>o.key));
 const selected=new Set(snapshot.selection.generated.keys);
 if(new Set(snapshot.selection.generated.keys).size!==snapshot.selection.generated.keys.length||
  snapshot.selection.generated.enabled&&snapshot.selection.generated.mode==='selected'&&!snapshot.selection.generated.keys.length||
  snapshot.selection.generated.mode==='selected'&&snapshot.selection.generated.keys.some(k=>!local.has(k)&&!server.has(k)))throw new Error('생성 개체 선택이 변경되었습니다.');
 const keys=new Set<string>();for(const g of snapshot.generated){
  if(!snapshot.selection.generated.enabled||snapshot.selection.generated.mode==='selected'&&!selected.has(g.key)||
   keys.has(g.key)||!(g.origin==='LOCAL_GENERATED'?local:server).has(g.key)||!g.key.startsWith(g.origin==='LOCAL_GENERATED'?'local:':'server:'))throw new Error('내보내기 생성 개체가 변경되었습니다.');keys.add(g.key);
 }
 if(snapshot.selection.generated.enabled&&snapshot.selection.generated.mode==='selected'&&snapshot.selection.generated.keys.some(k=>!keys.has(k)))throw new Error('선택된 생성 개체가 누락되었습니다.');
 if(snapshot.selection.generated.enabled&&snapshot.selection.generated.mode==='all'&&[...local,...server].some(k=>!keys.has(k)))throw new Error('전체 생성 개체가 누락되었습니다.');
 if(snapshot.generated.filter(g=>g.origin==='LOCAL_GENERATED').length>EXCHANGE_LIMITS.generatedPerOrigin||snapshot.generated.filter(g=>g.origin==='SERVER_OUTLINE').length>EXCHANGE_LIMITS.generatedPerOrigin)throw new Error('생성 개체 수 상한을 초과했습니다.');
}
/** Exact preflight counts for the modal, before acknowledgement and serialization. */
export function inspectExchangeSnapshot(snapshot:ExchangeSnapshot,options?:ExchangeOptions){
 validateSelection(snapshot);
 const memos=selectedExchangeMemos(snapshot,options);
 const selected=snapshot.inventory.objects.filter(item=>item.origin==='DXF'&&snapshot.selection.dxf.enabled&&(snapshot.selection.dxf.mode==='all'||snapshot.selection.dxf.layers.includes(item.layer)));
 const layerMap=new Map<string,{accepted:number;excluded:number;reasons:Record<string,number>;styleLoss:Record<string,number>}>();
 const layer=(name:string)=>{let row=layerMap.get(name);if(!row){row={accepted:0,excluded:0,reasons:{},styleLoss:{}};layerMap.set(name,row);}return row;};
 for(const item of selected){const row=layer(item.layer);if(item.supported)row.accepted++;else {row.excluded++;const r=item.reason??'UNSUPPORTED_RENDER_TYPE';row.reasons[r]=(row.reasons[r]??0)+1;}}
 const selectedKeys=new Set(selected.map(o=>o.key)),seenStyle=new Set<string>();
 for(const p of snapshot.primitives)for(const style of p.material.styleLoss){
  const base=selectedKeys.has(p.key)?p.key:p.key.replace(/:\d+$/,'');const token=base+'\0'+style;
  if(seenStyle.has(token))continue;seenStyle.add(token);
  const row=layer(p.layer);row.styleLoss[style]=(row.styleLoss[style]??0)+1;
 }
 const excluded=[...layerMap.values()].reduce((n,r)=>n+r.excluded,0),styleLoss:Record<string,number>={};
 for(const row of layerMap.values())for(const [reason,count] of Object.entries(row.styleLoss))styleLoss[reason]=(styleLoss[reason]??0)+count;
 const broken=memos.filter(memo=>memo.broken).length;
 const partial=snapshot.selection.dxf.enabled&&snapshot.inventory.sourceCoverage==='unknown'||excluded>0||Object.keys(styleLoss).length>0||broken>0;
 return {excluded,styleLoss,partial,layers:[...layerMap].map(([name,row])=>({layer:name,...row})),memoCount:memos.length,
  memoWarnings:broken?[`연결이 끊긴 메모 ${broken}개는 마지막 WCS 위치로 포함합니다.`]:[]};
}
/** Browser event path only. No fetch, DB write, live Scene mutation, or Blob URL. */
export async function buildExchangeArtifact(snapshot:ExchangeSnapshot,options:ExchangeOptions,context:ExchangeBuildContext={}):Promise<ExchangeArtifact>{
 abort(context.signal);context.onStage?.('prepare');validateSelection(snapshot);
 const memos=selectedExchangeMemos(snapshot,options);
 const unit=unitFor(snapshot,options.unit),scale=EXCHANGE_UNIT_METRES[unit];
 const bounds=boundsOf(snapshot);if(bounds.isEmpty())throw new Error('선택한 지원 객체가 없습니다.');
 const origin=options.origin.mode==='auto'?bounds.getCenter(new THREE.Vector3()):new THREE.Vector3(options.origin.x,options.origin.y,options.origin.z);
 if(![origin.x,origin.y,origin.z].every(Number.isFinite)||[origin.x,origin.y,origin.z].some(n=>Math.abs(n)>1e12))throw new Error('유효하지 않은 원점입니다.');
 const {excluded,styleLoss,partial,layers,memoWarnings}=inspectExchangeSnapshot(snapshot,options);
 const fingerprint=exchangeOptionsFingerprint(snapshot,options);
 if(partial&&options.partialAck!==fingerprint)throw new Error('누락 또는 스타일 손실 가능성을 확인한 현재 선택 동의가 필요합니다.');
 const preVertices=snapshot.primitives.reduce((n,p)=>n+p.positions.length/3,0)+snapshot.generated.reduce((n,g)=>n+(g.geometry.type==='Polygon'?[g.geometry.coordinates]:g.geometry.coordinates).reduce((a,p)=>a+p.reduce((b,r)=>b+r.length,0),0),0)+memos.length*100;
 const preIndices=snapshot.primitives.reduce((n,p)=>n+(p.indices?.length??p.positions.length/3),0)+snapshot.generated.reduce((n,g)=>n+(g.geometry.type==='Polygon'?[g.geometry.coordinates]:g.geometry.coordinates).reduce((a,p)=>a+p.reduce((b,r)=>b+r.length*6,0),0),0)+memos.length*320;
 if(snapshot.primitives.length+snapshot.generated.length+memos.length*3>EXCHANGE_LIMITS.drawables||preVertices>EXCHANGE_LIMITS.vertices||preIndices>EXCHANGE_LIMITS.indices||preVertices*64+preIndices*8+(memos.length?EXCHANGE_LIMITS.texturePixels*4:0)>EXCHANGE_LIMITS.estimatedBytes)throw new Error('내보내기 정점/인덱스/메모리 상한을 초과했습니다.');
 const scene=new THREE.Scene(),precision={max:0};
 let font:MemoFontLease|undefined,raster:ReturnType<typeof rasterizeExchangeMemos>|undefined;
 try{
  const namespaces=new Map<string,THREE.Group>(),groups=new Map<string,THREE.Group>();
  const add=(origin:string,layer:string,obj:THREE.Object3D)=>{
   let ns=namespaces.get(origin);if(!ns){ns=new THREE.Group();ns.name=origin;namespaces.set(origin,ns);scene.add(ns);}
   const key=origin+'\0'+layer;let group=groups.get(key);if(!group){group=new THREE.Group();group.name=layer;groups.set(key,group);ns.add(group);}group.add(obj);
  };
  for(const p of snapshot.primitives){abort(context.signal);add('DXF',p.layer,objectFor(p,origin,scale,precision));}
  for(const g of snapshot.generated){abort(context.signal);add(g.origin,g.origin==='LOCAL_GENERATED'?'생성 개체':'서버 외곽선',shapeObject(g,origin,scale,precision));}
  if(memos.length){
   context.onStage?.('font');font=await loadExchangeMemoFont(context.signal);abort(context.signal);
   context.onStage?.('rasterize');raster=rasterizeExchangeMemos(memos,font,context.signal);abort(context.signal);
   for(const entry of raster.rasters){abort(context.signal);add(entry.memo.origin,'메모',buildExchangeMemoAnnotation(entry,origin,scale,options.memoTextHeightMetres!,precision));}
  }
  const included=layers.reduce((n,row)=>n+row.accepted,0)+snapshot.generated.length+memos.length;
  if(!included)throw new Error('선택한 지원 객체가 없습니다.');
  let actualBytes=(raster?.pixels??0)*4,actualIndices=0,vertices=0;scene.traverse(o=>{const g=(o as THREE.Mesh).geometry;if(!g)return;
   vertices+=g.getAttribute('position')?.count??0;
   for(const name of Object.keys(g.attributes))actualBytes+=g.getAttribute(name).array.byteLength;
   if(g.index){actualBytes+=g.index.array.byteLength;actualIndices+=g.index.count;}
  });
  if(included>EXCHANGE_LIMITS.drawables||vertices>EXCHANGE_LIMITS.vertices||actualIndices>EXCHANGE_LIMITS.indices||actualBytes>EXCHANGE_LIMITS.estimatedBytes)throw new Error('내보내기 정점/인덱스/메모리 상한을 초과했습니다.');
  if(precision.max>1e-4)throw new Error('원점 기준 Float32 좌표 오차가 0.1mm를 초과합니다.');
  scene.userData={versionId:snapshot.inventory.scope.versionId,sourceSha256:snapshot.inventory.scope.sourceSha256,
   sourceUnit:snapshot.inventory.scope.sourceUnit,selectedUnit:unit,metresPerUnit:scale,originWcs:origin.toArray(),axisMapping:'(x,y,z)->(x,z,-y)',
   maxQuantizationError:precision.max,precisionBasis:'RENDERER_SNAPSHOT_ADDITIONAL_FLOAT32',precisionWarning:PRECISION_WARNING,
   sourceCoverage:snapshot.inventory.sourceCoverage};
  const report:ExchangeReport={included,excluded,vertices,warnings:[...(snapshot.selection.dxf.enabled?[...snapshot.inventory.warnings]:[]),...memoWarnings,
   PRECISION_WARNING],maxQuantizationError:precision.max,sourceCoverage:snapshot.inventory.sourceCoverage,styleLoss,layers};
  abort(context.signal);context.onStage?.('serialize');
  const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
  abort(context.signal);
  const result=await new GLTFExporter().parseAsync(scene,{binary:options.format==='glb',onlyVisible:false,includeCustomExtensions:false,animations:[]});
  abort(context.signal);
  const bytes=options.format==='glb'?new Uint8Array(result as ArrayBuffer):new TextEncoder().encode(JSON.stringify(result));
  if(bytes.byteLength>EXCHANGE_LIMITS.artifactBytes)throw new Error('내보내기 파일 32MiB 상한을 초과했습니다.');
  if(options.format==='glb'){
   if(bytes.length<12||new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0,true)!==0x46546c67||new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(4,true)!==2)throw new Error('GLB 형식 검증에 실패했습니다.');
  }else{
   const gltf=JSON.parse(new TextDecoder().decode(bytes)) as {buffers?:{uri?:string}[];images?:{uri?:string}[]};
   if(gltf.buffers?.some(b=>!b.uri?.startsWith('data:'))||gltf.images?.some(i=>i.uri&&!i.uri.startsWith('data:')))throw new Error('외부 자원이 포함된 glTF는 내보낼 수 없습니다.');
  }
  context.onStage?.('complete');
  return {bytes,mime:options.format==='glb'?'model/gltf-binary':'model/gltf+json',extension:options.format,report};
 }finally{
  const textures=new Set<THREE.Texture>();scene.traverse(o=>{const d=o as THREE.Mesh;d.geometry?.dispose();if(d.material)for(const m of Array.isArray(d.material)?d.material:[d.material]){
   const map=(m as THREE.MeshBasicMaterial).map;if(map)textures.add(map);m.dispose();
  }});for(const texture of textures)texture.dispose();scene.clear();raster?.dispose();font?.dispose();
 }
}
