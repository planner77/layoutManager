/** Issue #55 E5: WCS XY CCW numeric and common-pivot selection policy. */
import type {CanvasObjectRef,CanvasObjectScope} from './canvas-object-selection';
import type {GeneratedOutlineObject} from '../viewers/core/adapter';
import {selectedTranslationIds} from './generated-translate';
import {outlineGeometryBounds} from './outline-tree';

const NUMBER=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
export const ROTATE_DEGREES_LIMIT=360_000;
export function parseRotateNumber(text:string,label:string,max:number):number{
 const value=text.trim();
 if(!NUMBER.test(value))throw new Error(label+'에 유효한 수치를 입력하세요.');
 const n=Number(value);
 if(!Number.isFinite(n)||Math.abs(n)>max)throw new Error(label+'가 범위를 벗어났습니다.');
 return n;
}
export function parseWcsRotation(angle:string,x:string,y:string){
 return {angleDegrees:parseRotateNumber(angle,'회전 각도',ROTATE_DEGREES_LIMIT),
   pivot:[parseRotateNumber(x,'Pivot X',1e12),parseRotateNumber(y,'Pivot Y',1e12)] as [number,number]};
}
export function selectedRotation(
 selection:readonly CanvasObjectRef[],objects:readonly GeneratedOutlineObject[],scope:CanvasObjectScope,
){
 const ids=selectedTranslationIds(selection,objects,scope);
 const selected=objects.filter(o=>ids.includes(o.ref.id));
 const bounds=selected.map(o=>outlineGeometryBounds(o.geometry));
 if(!bounds.length||bounds.some(b=>!b||![b.minX,b.minY,b.maxX,b.maxY].every(Number.isFinite)))
   throw new Error('회전 대상의 WCS 범위가 유효하지 않습니다.');
 const minX=Math.min(...bounds.map(b=>b!.minX)),minY=Math.min(...bounds.map(b=>b!.minY));
 const maxX=Math.max(...bounds.map(b=>b!.maxX)),maxY=Math.max(...bounds.map(b=>b!.maxY));
 if(maxX<=minX||maxY<=minY)throw new Error('회전 대상의 면적이 없습니다.');
 const pivot:[number,number]=[minX+(maxX-minX)/2,minY+(maxY-minY)/2];
 if(!pivot.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e12))
   throw new Error('공통 Pivot이 유효한 WCS 범위를 벗어났습니다.');
 return {ids,pivot,bounds:{minX,minY,maxX,maxY}};
}
/** atan2 uses WCS XY (not screen Y-down); normalize across +/-180. */
export function dragRotationDegrees(start:readonly [number,number],current:readonly [number,number],
 pivot:readonly [number,number]):number{
 const a=Math.atan2(start[1]-pivot[1],start[0]-pivot[0]);
 const b=Math.atan2(current[1]-pivot[1],current[0]-pivot[0]);
 let deg=(b-a)*180/Math.PI;
 if(!Number.isFinite(deg)||Math.hypot(start[0]-pivot[0],start[1]-pivot[1])<1e-9||
    Math.hypot(current[0]-pivot[0],current[1]-pivot[1])<1e-9)
   throw new Error('Pivot과 다른 위치에서 회전 핸들을 드래그하세요.');
 if(deg>180)deg-=360;
 if(deg< -180)deg+=360;
 return deg;
}
