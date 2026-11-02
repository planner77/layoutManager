import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {sceneScope,tagImportedTree} from '../../viewers/three-dxf-viewer/scene-tags';
import {toCustomDto,fromCustomDto,type CustomSceneDto} from '../../viewers/three-dxf-viewer/scene-custom-dto';

const scope=sceneScope('normalized-test-version','c'.repeat(64),'DXF_INSUNITS_4');
function fixture(){
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(new Uint16Array([0,65535,32768,16384,65535,0]),3,true));
 geometry.setAttribute('color',new THREE.BufferAttribute(new Uint8Array([255,128,0,0,127,255]),3,true));
 geometry.setAttribute('uv',new THREE.BufferAttribute(new Int16Array([-32768,32767,0,-16384]),2,true));
 geometry.setAttribute('normal',new THREE.BufferAttribute(new Float64Array([0.125,0.0625,0.5,0.01,-0.125,3.5]),3,false));
 const root=new THREE.Group();root.add(new THREE.Line(geometry,new THREE.LineBasicMaterial()));
 const asset={...tagImportedTree(root,scope),state:'READY' as const};
 return {root,geometry,dto:toCustomDto(root,asset)};
}
function clone(value:CustomSceneDto):CustomSceneDto{return JSON.parse(JSON.stringify(value)) as CustomSceneDto;}
function positionOf(dto:CustomSceneDto):Record<string,unknown>{
 return dto.root.children[0].geometry!.attributes.position as unknown as Record<string,unknown>;
}

describe('SC-08 custom DTO BufferAttribute storage / normalized integer fidelity',()=>{
 it('preserves typed arrays, normalization and effective values through a JSON round-trip',()=>{
  const {geometry,dto}=fixture();
  const json=clone(dto);
  expect(json.root.children[0].geometry!.attributes.position.arrayType).toBe('Uint16Array');
  expect(json.root.children[0].geometry!.attributes.color.arrayType).toBe('Uint8Array');
  expect(json.root.children[0].geometry!.attributes.uv.arrayType).toBe('Int16Array');
  expect(json.root.children[0].geometry!.attributes.normal.arrayType).toBe('Float64Array');
  const restored=(fromCustomDto(json).children[0] as THREE.Line).geometry;
  for(const name of ['position','color','uv','normal']){
   const before=geometry.getAttribute(name) as THREE.BufferAttribute;
   const after=restored.getAttribute(name) as THREE.BufferAttribute;
   expect(after.array.constructor).toBe(before.array.constructor);
   expect(after.normalized).toBe(before.normalized);
   expect(Array.from(after.array)).toEqual(Array.from(before.array));
   for(let i=0;i<before.count;i++){
    expect(after.getX(i)).toBeCloseTo(before.getX(i),12);
    if(before.itemSize>1)expect(after.getY(i)).toBeCloseTo(before.getY(i),12);
    if(before.itemSize>2)expect(after.getZ(i)).toBeCloseTo(before.getZ(i),12);
   }
  }
  const pos=restored.getAttribute('position') as THREE.BufferAttribute;
  expect(pos.getY(0)).toBe(1); // raw 65535 is normalized to 1, not restored as 65535
  expect(pos.getZ(0)).toBeCloseTo(32768/65535,12);
  const uv=restored.getAttribute('uv') as THREE.BufferAttribute;
  expect(uv.getX(0)).toBe(-1);
  const color=restored.getAttribute('color') as THREE.BufferAttribute;
  expect(color.getY(0)).toBeCloseTo(128/255,12);
 });
 it('rejects missing/forged type, nonboolean normalization, fractional/overflow integer and Float32 overflow',()=>{
  const dto=fixture().dto;
  for(const patch of [
   {arrayType:undefined},
   {arrayType:'BigInt64Array'},
   {normalized:'true'},
   {array:[0.5,65535,32768,16384,65535,0]},
   {array:[65536,65535,32768,16384,65535,0]},
   {arrayType:'Float32Array',array:[1e100,65535,32768,16384,65535,0]},
  ]){
   const forged=clone(dto);Object.assign(positionOf(forged),patch);
   expect(()=>fromCustomDto(forged)).toThrow();
  }
 });
 it('rejects unsupported specialized half-float attribute rather than misdecoding it',()=>{
  const {root}=fixture();
  const line=root.children[0] as THREE.Line;
  line.geometry.setAttribute('position',new THREE.Float16BufferAttribute([1,2,3],3));
  expect(()=>toCustomDto(root,{...tagImportedTree(root,scope),state:'READY'})).toThrow('CUSTOM_ATTRIBUTE_STORAGE_UNSUPPORTED');
 });
});
