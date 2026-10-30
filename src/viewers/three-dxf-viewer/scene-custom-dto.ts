/** Explicit S2 candidate: supported render primitives as numeric buffers and simple material records. */
import * as THREE from 'three';
import {validateSceneAsset,validSceneRef,type SceneAsset} from '../../domain/cad-scene';
// Preserve the storage type: Three.js applies integer normalization from the typed array.
const attributeConstructors={
 Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array,
} as const;
type AttributeArrayType=keyof typeof attributeConstructors;
type Attribute=Readonly<{itemSize:number;array:number[];normalized:boolean;arrayType:AttributeArrayType}>;
const integerRanges:Partial<Record<AttributeArrayType,readonly [number,number]>>={
 Int8Array:[-128,127],Uint8Array:[0,255],Uint8ClampedArray:[0,255],
 Int16Array:[-32768,32767],Uint16Array:[0,65535],
 Int32Array:[-2147483648,2147483647],Uint32Array:[0,4294967295],
};
function isAttributeArrayType(value:unknown):value is AttributeArrayType{
 return typeof value==='string'&&Object.prototype.hasOwnProperty.call(attributeConstructors,value);
}
function restoreAttribute(attribute:Attribute):THREE.BufferAttribute{
 if(!attribute||typeof attribute!=='object'||!Number.isSafeInteger(attribute.itemSize)||
    attribute.itemSize<1||attribute.itemSize>4||!Array.isArray(attribute.array)||
    attribute.array.length%attribute.itemSize!==0||typeof attribute.normalized!=='boolean'||
    !isAttributeArrayType(attribute.arrayType))throw new Error('CUSTOM_ATTRIBUTE_INVALID');
 finiteArray(attribute.array);
 const limits=integerRanges[attribute.arrayType];
 if(limits&&attribute.array.some(value=>!Number.isInteger(value)||value<limits[0]||value>limits[1]))
  throw new Error('CUSTOM_ATTRIBUTE_INTEGER_RANGE');
 const Ctor=attributeConstructors[attribute.arrayType];
 const array=new Ctor(attribute.array);
 if(Array.from(array).some(value=>!Number.isFinite(value)))throw new Error('CUSTOM_ATTRIBUTE_OVERFLOW');
 return new THREE.BufferAttribute(array,attribute.itemSize,attribute.normalized);
}
type Geometry=Readonly<{attributes:Record<string,Attribute>;index:number[]|null;groups:{start:number;count:number;materialIndex:number}[]}>;
type Material=Readonly<{type:'LineBasicMaterial'|'LineDashedMaterial'|'MeshBasicMaterial'|'PointsMaterial'|'SpriteMaterial';color:number;opacity:number;transparent:boolean;linewidth:number;dashSize:number;gapSize:number}>;
export type CustomNode=Readonly<{type:string;name:string;visible:boolean;matrix:number[];ref:unknown;layer?:string;geometry?:Geometry;materials?:Material[];children:CustomNode[]}>;
export type CustomSceneDto=Readonly<{schema:1;asset:SceneAsset;root:CustomNode}>;
const nodeTypes=new Set(['Group','Object3D','Line','LineSegments','LineLoop','Mesh','Points','Sprite']);
const materialTypes=new Set<Material['type']>(['LineBasicMaterial','LineDashedMaterial','MeshBasicMaterial','PointsMaterial','SpriteMaterial']);
const attributeNames=new Set(['position','normal','color','uv']);
function finiteArray(values:readonly number[]){if(values.some(v=>!Number.isFinite(v)))throw new Error('CUSTOM_NONFINITE');}
function writeNode(o:THREE.Object3D):CustomNode{
 if(!nodeTypes.has(o.type))throw new Error('CUSTOM_NODE_UNSUPPORTED:'+o.type);
 o.updateMatrix();const mesh=o as THREE.Mesh;let geometry:Geometry|undefined;
 if(mesh.geometry){if(!((mesh.geometry as THREE.BufferGeometry).isBufferGeometry))throw new Error('CUSTOM_GEOMETRY_UNSUPPORTED');
  const attrs:Record<string,Attribute>={};for(const [name,attribute] of Object.entries(mesh.geometry.attributes)){
   if(!attributeNames.has(name)||!((attribute as THREE.BufferAttribute).isBufferAttribute))throw new Error('CUSTOM_ATTRIBUTE_UNSUPPORTED:'+name);
   // Float16BufferAttribute decodes half floats via a specialized accessor; do not
   // silently serialize it as an ordinary Uint16 buffer.
   const special=attribute as THREE.BufferAttribute & {isFloat16BufferAttribute?:boolean;isInstancedBufferAttribute?:boolean};
   const arrayType=attribute.array.constructor.name;
   if(special.isFloat16BufferAttribute||special.isInstancedBufferAttribute||!isAttributeArrayType(arrayType))
    throw new Error('CUSTOM_ATTRIBUTE_STORAGE_UNSUPPORTED:'+name);
   const array=Array.from(attribute.array);finiteArray(array);
   attrs[name]={itemSize:attribute.itemSize,array,normalized:attribute.normalized,arrayType};
  }
  const index=mesh.geometry.index?Array.from(mesh.geometry.index.array):null;if(index)finiteArray(index);
  geometry={attributes:attrs,index,groups:mesh.geometry.groups.map(g=>({start:g.start,count:g.count,materialIndex:g.materialIndex??0}))};
 }
 const materials=mesh.material?(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>{
  if(!materialTypes.has(m.type as Material['type']))throw new Error('CUSTOM_MATERIAL_UNSUPPORTED:'+m.type);
  const v=m as THREE.LineDashedMaterial;return {type:m.type as Material['type'],color:v.color?.getHex()??0xffffff,opacity:m.opacity,transparent:m.transparent,
   linewidth:v.linewidth??1,dashSize:v.dashSize??0,gapSize:v.gapSize??0};
 }):undefined;
 return {type:o.type,name:o.name,visible:o.visible,matrix:o.matrix.toArray(),ref:o.userData.cadSceneRef,
   ...(typeof o.userData.cadLayer==='string'?{layer:o.userData.cadLayer}:{}),
   ...(geometry?{geometry}:{}),...(materials?{materials}:{}),children:o.children.map(writeNode)};
}
export function toCustomDto(root:THREE.Object3D,asset:SceneAsset):CustomSceneDto{
 return {schema:1,asset,root:writeNode(root)};
}
export function fromCustomDto(dto:CustomSceneDto):THREE.Object3D{
 if(dto.schema!==1)throw new Error('CUSTOM_SCHEMA_INVALID');
 const asset=validateSceneAsset(dto.asset);let index=0;
 const check=(n:CustomNode,path:number[])=>{
   const expected=asset.objects[index++];
   if(!expected||!validSceneRef(n.ref,asset.scope)||n.ref.origin!=='DXF_IMPORTED'||
      n.ref.id!==expected.ref.id||JSON.stringify(path)!==JSON.stringify(expected.treePath)||
      n.type!==expected.kind||JSON.stringify(n.matrix)!==JSON.stringify(expected.transform)||
      typeof n.visible!=='boolean'||n.visible!==expected.visible||!Array.isArray(n.children))throw new Error('CUSTOM_ID_INVALID');
   n.children.forEach((child,i)=>check(child,[...path,i]));
 };check(dto.root,[]);if(index!==asset.objects.length)throw new Error('CUSTOM_COUNT_INVALID');
 const read=(n:CustomNode):THREE.Object3D=>{
  if(!nodeTypes.has(n.type)||!Array.isArray(n.matrix)||n.matrix.length!==16)throw new Error('CUSTOM_NODE_INVALID');
  finiteArray(n.matrix);let geometry:THREE.BufferGeometry|undefined;
  if(n.geometry){geometry=new THREE.BufferGeometry();for(const [name,a] of Object.entries(n.geometry.attributes)){
   if(!attributeNames.has(name))throw new Error('CUSTOM_ATTRIBUTE_INVALID');
   geometry.setAttribute(name,restoreAttribute(a));
  }
  if(n.geometry.index){finiteArray(n.geometry.index);geometry.setIndex(n.geometry.index);}
  for(const g of n.geometry.groups)geometry.addGroup(g.start,g.count,g.materialIndex);
  }
  const materials=n.materials?.map(m=>{
   if(!materialTypes.has(m.type)||![m.color,m.opacity,m.linewidth,m.dashSize,m.gapSize].every(Number.isFinite)||
      !Number.isSafeInteger(m.color)||m.color<0||m.color>0xffffff||typeof m.transparent!=='boolean')throw new Error('CUSTOM_MATERIAL_INVALID');
   const params={color:m.color,opacity:m.opacity,transparent:m.transparent,linewidth:m.linewidth,dashSize:m.dashSize,gapSize:m.gapSize};
   switch(m.type){case 'LineDashedMaterial':return new THREE.LineDashedMaterial(params);case 'LineBasicMaterial':return new THREE.LineBasicMaterial(params);
    case 'MeshBasicMaterial':return new THREE.MeshBasicMaterial(params);case 'PointsMaterial':return new THREE.PointsMaterial(params);
    case 'SpriteMaterial':return new THREE.SpriteMaterial(params);}
  });
  const material=materials?.length===1?materials[0]:materials;
  let o:THREE.Object3D;
  switch(n.type){case 'Group':o=new THREE.Group();break;case 'Object3D':o=new THREE.Object3D();break;
   case 'Line':o=new THREE.Line(geometry,material as THREE.Material);break;case 'LineSegments':o=new THREE.LineSegments(geometry,material as THREE.Material);break;
   case 'LineLoop':o=new THREE.LineLoop(geometry,material as THREE.Material);break;case 'Mesh':o=new THREE.Mesh(geometry,material);break;
   case 'Points':o=new THREE.Points(geometry,material as THREE.Material);break;case 'Sprite':o=new THREE.Sprite(material as THREE.SpriteMaterial);break;
   default:throw new Error('CUSTOM_NODE_UNSUPPORTED');}
  o.name=n.name;o.visible=n.visible;o.matrix.fromArray(n.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);
  o.userData={cadSceneRef:n.ref,...(n.layer?{cadLayer:n.layer}:{})};for(const child of n.children)o.add(read(child));return o;
 };
 return read(dto.root);
}
