import * as THREE from 'three';
import type {SceneScope} from '../../domain/cad-scene';
import type {DxfOutlineIndex,OutlinePath,XY} from '../core/outline-geometry';

/** Render geometry projection, with no DXF Handle lookup or source attestation. */
export function sceneOutlineProjection(root:THREE.Object3D,scope:SceneScope):DxfOutlineIndex {
  const entities:DxfOutlineIndex['entities']=[];const warnings:string[]=[];
  let points=0;
  root.updateWorldMatrix(true,true);
  root.traverse(object=>{
    const geometry=(object as THREE.Mesh).geometry;
    const position=geometry?.getAttribute('position');const ref=object.userData.cadSceneRef;
    if(!position||!ref||!['Line','LineLoop','LineSegments','Mesh','Points'].includes(object.type))return;
    const indices=geometry.index?Array.from(geometry.index.array):Array.from({length:position.count},(_,i)=>i);
    if(points+indices.length>100_000){warnings.push('선택 투영 정점 한도 초과: 일부 렌더링 객체는 표시만 합니다.');return;}
    const v=new THREE.Vector3();const at=(i:number):XY=>{
      v.fromBufferAttribute(position,indices[i]).applyMatrix4(object.matrixWorld);
      return [v.x,v.y];
    };
    const paths:OutlinePath[]=[];
    if(object.type==='LineSegments'){
      for(let i=0;i+1<indices.length;i+=2)paths.push({points:[at(i),at(i+1)],closed:false});
    }else if(object.type==='Mesh'){
      for(let i=0;i+2<indices.length;i+=3)paths.push({points:[at(i),at(i+1),at(i+2),at(i)],closed:true});
    }else paths.push({points:indices.map((_,i)=>at(i)),closed:object.type==='LineLoop'});
    const all=paths.flatMap(p=>p.points);
    if(!all.length||all.some(p=>p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e12)))return;
    points+=indices.length;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const [x,y] of all){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    let layer='0';for(let node:THREE.Object3D|null=object;node;node=node.parent){if(typeof node.userData.cadLayer==='string'){layer=node.userData.cadLayer;break;}}
    entities.push({id:ref.id,handle:null,entityType:object.type,layer,instancePath:[],stable:false,paths,bounds:[minX,minY,maxX,maxY]});
  });
  const unit=/^DXF_INSUNITS_(\d+)$/.exec(scope.sourceUnit);
  return {versionId:scope.versionId,sourceSha256:scope.sourceSha256,unitCode:unit?Number(unit[1]):null,entities,
    warnings:[...new Set(warnings),'Scene 형상 기반 임시 외곽선입니다. DXF 원본 정밀 추적·서버 canonical 검증 자료가 아닙니다.']};
}
