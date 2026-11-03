import * as THREE from 'three';
import type {CadTextIndex} from '../../viewers/core/text-index';
import {writeShapeGeometry} from '../../viewers/three-dxf-viewer/scene-shape';

/** JSON safe, complete render inventory for the synthetic parity fixture. */
export function parityInventory(root:THREE.Object3D,textIndex?:CadTextIndex){
  root.updateWorldMatrix(true,true);
  const nodes:unknown[]=[];
  const finiteOrToken=(n:number)=>Number.isFinite(n)?n:n===Infinity?'Infinity':n===-Infinity?'-Infinity':'NaN';
  const box=(object:THREE.Object3D)=>{
    const b=new THREE.Box3().setFromObject(object);
    return [...b.min.toArray(),...b.max.toArray()].map(finiteOrToken);
  };
  const walk=(object:THREE.Object3D,path:number[],parent:string|null)=>{
    const mesh=object as THREE.Mesh;
    const g=mesh.geometry as THREE.BufferGeometry|undefined;
    const ref=object.userData.cadSceneRef;
    nodes.push({path,parent,ref:ref??null,type:object.type,name:object.name,visible:object.visible,
      layer:object.userData.cadLayer??object.userData.layer??object.userData.entity?.layer??null,
      matrix:object.matrix.toArray(),matrixWorld:object.matrixWorld.toArray(),worldBBox:box(object),
      geometry:g?{
        type:g.type,
        shape:g.type==='ShapeGeometry'?writeShapeGeometry(g as THREE.ShapeGeometry):null,
        shapeConstructor:g.type==='ShapeGeometry'&&Boolean((g as THREE.ShapeGeometry).parameters?.shapes),
        shapeClone:g.type==='ShapeGeometry'&&g.clone().type==='ShapeGeometry',
        attributes:Object.fromEntries(Object.entries(g.attributes).map(([name,a])=>[name,{
          itemSize:a.itemSize,normalized:a.normalized,arrayType:a.array.constructor.name,
          array:Array.from(a.array),
        }])),
        index:g.index?{itemSize:g.index.itemSize,normalized:g.index.normalized,arrayType:g.index.array.constructor.name,array:Array.from(g.index.array)}:null,
        groups:g.groups.map(x=>({start:x.start,count:x.count,materialIndex:x.materialIndex})),
        drawRange:{start:finiteOrToken(g.drawRange.start),count:finiteOrToken(g.drawRange.count)},
      }:null,
      materials:mesh.material?(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>{
        const x=m as THREE.LineDashedMaterial;
        return {type:m.type,color:x.color?.getHex()??null,opacity:m.opacity,transparent:m.transparent,
          linewidth:x.linewidth??null,dashSize:x.dashSize??null,gapSize:x.gapSize??null,
          side:m.side,depthTest:m.depthTest,depthWrite:m.depthWrite,alphaTest:m.alphaTest,blending:m.blending};
      }):[],
    });
    object.children.forEach((child,i)=>walk(child,[...path,i],ref?.id??null));
  };
  walk(root,[],null);
  return {nodes,rootBBox:box(root),textIndex:textIndex??null};
}
export type ParityInventory=ReturnType<typeof parityInventory>;
