import * as THREE from 'three';
import {validSceneRef,type SceneScope} from '../../domain/cad-scene';
import type {DxfOutlineIndex,OutlinePath,XY} from '../core/outline-geometry';

/** Projects only validated, coplanar draw primitives. A merged object stays one selectable unit. */
export function sceneOutlineProjection(root:THREE.Object3D,scope:SceneScope):DxfOutlineIndex {
  const entities:DxfOutlineIndex['entities']=[],warnings:string[]=[];
  let used=0;
  root.updateWorldMatrix(true,true);
  root.traverse(object=>{
    if(!['Line','LineLoop','LineSegments','Mesh'].includes(object.type))return;
    // A drawable ancestor and descendant would make WCS work composition ambiguous.
    // The visible descendant is the selectable unit; the ancestor remains display-only.
    let nestedDrawable=false;
    for(const child of object.children)child.traverse(node=>{
      if(['Line','LineLoop','LineSegments','Mesh'].includes(node.type)&&
         (node as THREE.Mesh).geometry?.getAttribute('position'))nestedDrawable=true;
    });
    if(nestedDrawable){warnings.push('중첩 렌더 객체의 상위 geometry는 선택에서 제외');return;}
    const geometry=(object as THREE.Mesh).geometry,position=geometry?.getAttribute('position');
    const material=(object as THREE.Mesh).material;
    if(Array.isArray(material)){warnings.push('다중 Material 렌더 객체는 선택에서 제외');return;}
    if(material?.visible===false)return;
    const ref:unknown=object.userData.cadSceneRef;
    if(!position||!validSceneRef(ref,scope)||ref.origin!=='DXF_IMPORTED')return;
    const total=geometry.index?.count??position.count;
    const start=geometry.drawRange.start,rangeCount=geometry.drawRange.count,end=Math.min(total,start+rangeCount);
    if(!Number.isSafeInteger(start)||start<0||start>=total||
       !(rangeCount===Infinity||Number.isSafeInteger(rangeCount)&&rangeCount>=0)||
       !Number.isSafeInteger(end)||end<=start)return;
    const count=end-start;
    if(used+count>100_000){warnings.push('렌더 선택 투영 정점 한도 초과');return;}
    const indices:number[]=[];
    for(let i=start;i<end;i++){
      const index=geometry.index?geometry.index.getX(i):i;
      if(!Number.isSafeInteger(index)||index<0||index>=position.count){warnings.push('잘못된 렌더 index 제외');return;}
      indices.push(index);
    }
    if(object.type==='LineSegments'&&count%2 || object.type==='Mesh'&&count%3 || count<2)return;
    const vec=new THREE.Vector3(),points:XY[]=[],z:number[]=[];
    for(const index of indices){
      vec.fromBufferAttribute(position,index).applyMatrix4(object.matrixWorld);
      if(![vec.x,vec.y,vec.z].every(n=>Number.isFinite(n)&&Math.abs(n)<=1e12))return;
      points.push([vec.x,vec.y]);z.push(vec.z);
    }
    const plane=z[0];
    if(z.some(value=>Math.abs(value-plane)>1e-6)){warnings.push('비평면 렌더 객체 제외');return;}
    const paths:OutlinePath[]=[];
    if(object.type==='LineSegments'){
      for(let i=0;i<count;i+=2)paths.push({points:[points[i],points[i+1]],closed:false});
    }else if(object.type==='Mesh'){
      for(let i=0;i<count;i+=3)paths.push({points:[points[i],points[i+1],points[i+2],points[i]],closed:true});
    }else paths.push({points,closed:object.type==='LineLoop'});
    if(paths.some(path=>path.points.length<2||
       (path.points.length===2&&Math.hypot(path.points[1][0]-path.points[0][0],path.points[1][1]-path.points[0][1])<=1e-9)||
       (object.type==='Mesh'&&Math.abs((path.points[1][0]-path.points[0][0])*(path.points[2][1]-path.points[0][1])-
       (path.points[1][1]-path.points[0][1])*(path.points[2][0]-path.points[0][0]))<=1e-12)))return;
    used+=count;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const [x,y] of points){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    let layer='0';for(let node:THREE.Object3D|null=object;node;node=node.parent){
      if(typeof node.userData.cadLayer==='string'){layer=node.userData.cadLayer;break;}
      // Upstream three-dxf-viewer retains DXF metadata here. Use only its
      // layer label; an Entity handle is never inferred from this field.
      if(typeof node.userData.entity?.layer==='string'){layer=node.userData.entity.layer;break;}
    }
    entities.push({id:ref.id,handle:null,entityType:object.type,layer,instancePath:[],stable:false,paths,bounds:[minX,minY,maxX,maxY]});
  });
  const unit=/^DXF_INSUNITS_(\d+)$/.exec(scope.sourceUnit);
  return {versionId:scope.versionId,sourceSha256:scope.sourceSha256,unitCode:unit?Number(unit[1]):null,
    entities,warnings:[...new Set(warnings),'렌더 형상은 원본 DXF Entity 정밀 검증 자료가 아닙니다.']};
}
