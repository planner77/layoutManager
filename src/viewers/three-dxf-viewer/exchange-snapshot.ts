import * as THREE from 'three';
import type {ExchangeInventory,ExchangeObject,ExchangePrimitive,ExchangeSelection,ExchangeSnapshot,ExchangeScope} from '../../domain/cad-exchange';
import {EXCHANGE_LIMITS} from '../../domain/cad-exchange';
import type {GeneratedOutlineObject} from '../core/adapter';

export type ExchangeBaseline=ReadonlyMap<THREE.Object3D,THREE.Matrix4>;
/** Capture once, directly after either imported DXF or READY Scene restore. */
export function captureExchangeBaseline(root:THREE.Object3D):ExchangeBaseline{
 const map=new Map<THREE.Object3D,THREE.Matrix4>();
 root.updateWorldMatrix(true,true);
 root.traverse(o=>map.set(o,o.matrixWorld.clone()));
 return map;
}
/** three-dxf-viewer bundles its own Three constructor, so instanceof is invalid. */
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function exchangeAttribute(value:unknown):value is THREE.BufferAttribute{
 if(!record(value)||(value.isBufferAttribute!==true&&value.isInterleavedBufferAttribute!==true)||
   !Number.isSafeInteger(value.itemSize)||Number(value.itemSize)<1||!Number.isSafeInteger(value.count)||Number(value.count)<0||
   typeof value.getX!=='function'||typeof value.getY!=='function'||typeof value.getZ!=='function'||typeof value.getComponent!=='function')return false;
 const array=value.isBufferAttribute===true?value.array:record(value.data)?value.data.array:null;
 return ArrayBuffer.isView(array)&&typeof (array as ArrayBufferView).byteLength==='number';
}
function exchangeGeometry(value:unknown):value is THREE.BufferGeometry{
 if(!record(value)||value.isBufferGeometry!==true||typeof value.getAttribute!=='function'||
   !record(value.attributes)||!Array.isArray(value.groups)||!record(value.drawRange)||
   !Number.isSafeInteger(value.drawRange.start)||Number(value.drawRange.start)<0||
   !(value.drawRange.count===Infinity||Number.isSafeInteger(value.drawRange.count)&&Number(value.drawRange.count)>0))return false;
 if(value.index!==null&&value.index!==undefined&&(!exchangeAttribute(value.index)||value.index.itemSize!==1))return false;
 try{
  const position=value.getAttribute('position');
  return position===undefined||exchangeAttribute(position);
 }catch{return false;}
}
type Region={start:number;count:number;materialIndex:number};
function regions(g:THREE.BufferGeometry,materialCount:number,kind:string,materialIsArray:boolean):Region[]|string{
 if(g.groups.length>EXCHANGE_LIMITS.drawables||materialCount>EXCHANGE_LIMITS.drawables)return 'GROUP_BUDGET';
 const total=g.index?.count??g.getAttribute('position')?.count??0;
 const start=g.drawRange.start,end=Math.min(total,start+(Number.isFinite(g.drawRange.count)?g.drawRange.count:total));
 if(!Number.isSafeInteger(start)||start<0||start>=total||!Number.isSafeInteger(end)||end<=start)return 'INVALID_DRAW_RANGE';
 const groups=!materialIsArray?[{start,count:end-start,materialIndex:0}]:g.groups.map(q=>({start:q.start,count:q.count,materialIndex:q.materialIndex??0}));
 if(!groups.length)return 'AMBIGUOUS_MATERIAL_GROUP';
 const result:Region[]=[];
 for(const group of groups){
  if(!Number.isSafeInteger(group.start)||!Number.isSafeInteger(group.count)||group.start<0||group.count<=0||group.start+group.count>total||
   !Number.isSafeInteger(group.materialIndex)||group.materialIndex<0||group.materialIndex>=materialCount)return 'INVALID_MATERIAL_GROUP';
  const a=Math.max(start,group.start),b=Math.min(end,group.start+group.count);
  if(b<=a)continue;
  const count=b-a;
  if(kind==='Mesh'&&(a%3||count%3)||kind==='LineSegments'&&(a%2||count%2)||
   (kind==='Line'||kind==='LineLoop')&&count<2)return 'INVALID_PRIMITIVE_ARITY';
  result.push({start:a,count,materialIndex:group.materialIndex});
 }
 if(!result.length)return 'INVALID_DRAW_RANGE';
 const sorted=[...result].sort((a,b)=>a.start-b.start);
 if(sorted.some((r,i)=>i>0&&r.start<sorted[i-1].start+sorted[i-1].count))return 'OVERLAPPING_MATERIAL_GROUP';
 return result;
}
const reason=(o:THREE.Object3D,world:THREE.Matrix4|undefined):string|null=>{
 const d=o as THREE.Mesh;
 if((o as THREE.Sprite).isSprite)return 'UNSUPPORTED_RENDER_TYPE';
 if(!d.geometry)return null;
 if(!world)return 'MISSING_BASELINE';
 if(!exchangeGeometry(d.geometry))return 'UNSUPPORTED_GEOMETRY';
 if(!o.isObject3D||!['Line','LineLoop','LineSegments','Mesh','Points'].includes(o.type))return 'UNSUPPORTED_RENDER_TYPE';
 const p=d.geometry.getAttribute('position');
 if(!p||p.itemSize!==3||p.count===0||p.count>EXCHANGE_LIMITS.vertices)return 'INVALID_POSITION';
 if((d.geometry.index?.count??p.count)>EXCHANGE_LIMITS.indices)return 'INDEX_BUDGET';
 const vertex=new THREE.Vector3(),z0=new THREE.Vector3(p.getX(0),p.getY(0),p.getZ(0)).applyMatrix4(world).z;
 for(let i=0;i<p.count;i++){
  vertex.set(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(world);
  if(![vertex.x,vertex.y,vertex.z].every(Number.isFinite))return 'INVALID_WORLD_POSITION';
  if(Math.abs(vertex.z-z0)>1e-6)return 'NONPLANAR_GEOMETRY';
 }
 if(d.geometry.index)for(let i=0;i<d.geometry.index.count;i++){const v=d.geometry.index.getX(i);if(!Number.isSafeInteger(v)||v<0||v>=p.count)return 'INVALID_INDEX';}
 const materials=Array.isArray(d.material)?d.material:[d.material];
 if(!materials.length||materials.some(m=>!m||!['LineBasicMaterial','LineDashedMaterial','MeshBasicMaterial','PointsMaterial'].includes(m.type)))return 'UNSUPPORTED_MATERIAL';
 const family=o.type==='Mesh'?['MeshBasicMaterial']:o.type==='Points'?['PointsMaterial']:['LineBasicMaterial','LineDashedMaterial'];
 if(materials.some(m=>!family.includes(m.type)))return 'UNSUPPORTED_MATERIAL';
 if(materials.some(m=>Object.values(m).some(v=>v?.isTexture)))return 'UNSUPPORTED_TEXTURE';
 const region=regions(d.geometry,materials.length,o.type,Array.isArray(d.material));if(typeof region==='string')return region;
 for(const name of ['color','normal','uv']){
  const a=d.geometry.getAttribute(name);if(!a)continue;
  if(!exchangeAttribute(a)||a.count!==p.count||a.itemSize!==(name==='uv'?2:3))return 'INVALID_ATTRIBUTE';
  for(let i=0;i<a.count;i++)for(let j=0;j<a.itemSize;j++)if(!Number.isFinite(a.getComponent(i,j)))return 'INVALID_ATTRIBUTE';
 }
 return null;
};
function layerOf(o:THREE.Object3D):string{
 let cur:THREE.Object3D|null=o;
 while(cur){const l=cur.userData?.cadLayer??cur.userData?.entity?.layer;if(typeof l==='string')return l;cur=cur.parent;}
 return '(레이어 없음)';
}
function renderId(o:THREE.Object3D):string|null{
 const ref=o.userData?.cadSceneRef;
 return ref?.origin==='DXF_IMPORTED'&&typeof ref.id==='string'?ref.id:null;
}
export function exchangeInventory(root:THREE.Object3D|undefined,baseline:ExchangeBaseline|undefined,scope:ExchangeScope|undefined,generated:readonly GeneratedOutlineObject[],epoch:number):ExchangeInventory|null{
 if(!root||!baseline||!scope)return null;
 const objects:ExchangeObject[]=[];
 root.traverse(o=>{
  const d=o as THREE.Mesh;
  if(!d.geometry&&!(o as THREE.Sprite).isSprite)return;
  const id=renderId(o);if(!id)return;
  const error=reason(o,baseline.get(o)),layer=layerOf(o);
  const validGeometry=exchangeGeometry(d.geometry);
  const positionCount=validGeometry?d.geometry.getAttribute('position')?.count??0:0;
  const materials=Array.isArray(d.material)?d.material:[d.material];
  const ranges=!error&&validGeometry?regions(d.geometry,materials.length,o.type,Array.isArray(d.material)):null;
  objects.push({key:id,origin:'DXF',layer,name:o.name||o.type,estimatedVertices:positionCount,
   estimatedExpandedVertices:Array.isArray(ranges)?ranges.reduce((n,r)=>n+r.count,0):positionCount,
   estimatedIndices:validGeometry?d.geometry.index?.count??positionCount:0,supported:!error,...(error?{reason:error}:{})});
 });
 for(const item of generated){
  const geometry=item.geometry;const polys=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  objects.push({key:'local:'+item.ref.id,origin:'LOCAL_GENERATED',layer:'생성 개체',name:item.name,estimatedVertices:polys.reduce((n,p)=>n+p.reduce((m,r)=>m+r.length,0),0),supported:true});
 }
 if(objects.length>EXCHANGE_LIMITS.drawables+2*EXCHANGE_LIMITS.generatedPerOrigin)throw new Error('내보내기 객체 수 상한을 초과했습니다.');
 const layers=[...new Set(objects.filter(o=>o.origin==='DXF').map(o=>o.layer))].sort();
 return {scope,snapshotToken:JSON.stringify([scope.versionId,scope.sourceSha256,epoch,objects.map(o=>[o.key,o.supported,o.reason,o.estimatedVertices,o.estimatedExpandedVertices,o.estimatedIndices])]),layers,objects,warnings:['원본 Entity별 렌더 누락 범위는 확인할 수 없습니다.','BLOCK 내부 혼합 레이어는 표시 렌더 레이어로만 선택합니다.'],sourceCoverage:'unknown',sourceEntityCount:null};
}
function materialOf(m:THREE.Material){
 const basic=m as THREE.Material&{color?:THREE.Color;opacity:number;vertexColors?:boolean;linewidth?:number;dashSize?:number;size?:number};
 const styleLoss:string[]=[];
 if(m.type==='LineDashedMaterial'||basic.dashSize!==undefined)styleLoss.push('LINE_DASH');
 if((m.type==='LineBasicMaterial'||m.type==='LineDashedMaterial')&&basic.linewidth!==undefined&&basic.linewidth!==1)styleLoss.push('LINE_WIDTH');
 if(m.type==='PointsMaterial'&&basic.size!==undefined)styleLoss.push('POINT_SIZE');
 return {color:basic.color?.getHex()??0xffffff,opacity:basic.opacity??1,vertexColors:!!basic.vertexColors,styleLoss};
}
function captureObject(o:THREE.Object3D,world:THREE.Matrix4):ExchangePrimitive[]{
 const d=o as THREE.Mesh,g=d.geometry as THREE.BufferGeometry;
 const position=g.getAttribute('position');
 const index=g.index,materials=Array.isArray(d.material)?d.material:[d.material];
 const groups=regions(g,materials.length,o.type,Array.isArray(d.material));
 if(typeof groups==='string')throw new Error(groups);
 const transformed=new THREE.Vector3();
 const out:ExchangePrimitive[]=[];
 for(let n=0;n<groups.length;n++){
  const group=groups[n],m=materials[group.materialIndex];
  if(!m)throw new Error('INVALID_MATERIAL_GROUP');
  const oldIndices=Array.from({length:group.count},(_,i)=>index?index.getX(group.start+i):group.start+i);
  const remap=new Map<number,number>(),indices:number[]=[],positions:number[]=[],colors:number[]=[],uvs:number[]=[];
  const color=g.getAttribute('color'),uv=g.getAttribute('uv');
  for(const old of oldIndices){
   let next=remap.get(old);
   if(next===undefined){
    next=remap.size;remap.set(old,next);
    transformed.set(position.getX(old),position.getY(old),position.getZ(old)).applyMatrix4(world);
    if(![transformed.x,transformed.y,transformed.z].every(Number.isFinite))throw new Error('INVALID_WORLD_POSITION');
    positions.push(transformed.x,transformed.y,transformed.z);
    if(color)colors.push(color.getX(old),color.getY(old),color.getZ(old));
    if(uv)uvs.push(uv.getX(old),uv.getY(old));
   }
   indices.push(next);
  }
  out.push({key:renderId(o)!+(groups.length>1?':'+n:''),origin:'DXF',layer:layerOf(o),name:o.name||o.type,kind:o.type as ExchangePrimitive['kind'],positions,indices,material:materialOf(m),...(colors.length?{colors}:{}),...(uvs.length?{uvs}:{})});
 }
 return out;
}
export function captureExchangeSnapshot(root:THREE.Object3D|undefined,baseline:ExchangeBaseline|undefined,inventory:ExchangeInventory|null,selection:ExchangeSelection,generated:readonly GeneratedOutlineObject[]):ExchangeSnapshot{
 if(!root||!baseline||!inventory)throw new Error('내보내기 Scene이 준비되지 않았습니다.');
 if(selection.memos.enabled)throw new Error('Memo 내보내기는 다음 Unit에서 연결됩니다.');
 const validLayers=new Set(inventory.layers),validGenerated=new Set(inventory.objects.filter(o=>o.origin==='LOCAL_GENERATED').map(o=>o.key));
 if(new Set(selection.dxf.layers).size!==selection.dxf.layers.length||selection.dxf.layers.some(l=>!validLayers.has(l))||
   new Set(selection.generated.keys).size!==selection.generated.keys.length||selection.generated.keys.some(k=>!validGenerated.has(k))||
   (selection.dxf.enabled&&selection.dxf.mode==='layers'&&!selection.dxf.layers.length)||
   (selection.generated.enabled&&selection.generated.mode==='selected'&&!selection.generated.keys.length))throw new Error('내보내기 선택이 변경되었습니다.');
 const selectedLayers=new Set(selection.dxf.layers),selectedKeys=new Set(selection.generated.keys);
 const selectedSource=inventory.objects.filter(item=>item.origin==='DXF'&&item.supported&&selection.dxf.enabled&&(selection.dxf.mode==='all'||selectedLayers.has(item.layer)));
 const selectedLocal=inventory.objects.filter(item=>item.origin==='LOCAL_GENERATED'&&selection.generated.enabled&&(selection.generated.mode==='all'||selectedKeys.has(item.key)));
 const estimatedVertices=[...selectedSource,...selectedLocal].reduce((n,item)=>n+(item.estimatedExpandedVertices??item.estimatedVertices),0);
 const estimatedIndices=selectedSource.reduce((n,item)=>n+(item.estimatedIndices??item.estimatedVertices),0)+selectedLocal.reduce((n,item)=>n+item.estimatedVertices*6,0);
 if(selectedSource.length+selectedLocal.length>EXCHANGE_LIMITS.drawables||selectedLocal.length>EXCHANGE_LIMITS.generatedPerOrigin||estimatedVertices>EXCHANGE_LIMITS.vertices||estimatedIndices>EXCHANGE_LIMITS.indices||estimatedVertices*64+estimatedIndices*8>EXCHANGE_LIMITS.estimatedBytes)throw new Error('내보내기 정점/인덱스/메모리 상한을 초과했습니다.');
 const primitives:ExchangePrimitive[]=[];
 if(selection.dxf.enabled)root.traverse(o=>{
  const d=o as THREE.Mesh;if(!d.geometry||!renderId(o))return;
  if(selection.dxf.mode==='layers'&&!selectedLayers.has(layerOf(o)))return;
  const world=baseline.get(o);
  if(!world)throw new Error('MISSING_BASELINE');
  if(reason(o,world))return;
  primitives.push(...captureObject(o,world));
 });
 const chosen=selection.generated.enabled?generated.filter(g=>selection.generated.mode==='all'||selectedKeys.has('local:'+g.ref.id)).map(g=>({key:'local:'+g.ref.id,origin:'LOCAL_GENERATED' as const,name:g.name,geometry:structuredClone(g.geometry),kind:g.kind,outlineTypeId:g.outlineTypeId,outlineTypeName:g.outlineTypeName??null})):[];
 if(primitives.length+chosen.length>EXCHANGE_LIMITS.drawables||chosen.length>EXCHANGE_LIMITS.generatedPerOrigin)throw new Error('내보내기 객체 수 상한을 초과했습니다.');
 const vertices=primitives.reduce((n,p)=>n+p.positions.length/3,0)+chosen.reduce((n,g)=>n+(g.geometry.type==='Polygon'?[g.geometry.coordinates]:g.geometry.coordinates).reduce((a,p)=>a+p.reduce((b,r)=>b+r.length,0),0),0);
 const indices=primitives.reduce((n,p)=>n+(p.indices?.length??p.positions.length/3),0)+chosen.reduce((n,g)=>n+(g.geometry.type==='Polygon'?[g.geometry.coordinates]:g.geometry.coordinates).reduce((a,p)=>a+p.reduce((b,r)=>b+r.length*6,0),0),0);
 if(vertices>EXCHANGE_LIMITS.vertices||indices>EXCHANGE_LIMITS.indices||vertices*64+indices*8>EXCHANGE_LIMITS.estimatedBytes)throw new Error('내보내기 정점/인덱스/메모리 상한을 초과했습니다.');
 return {inventory,selection,primitives,generated:chosen};
}
