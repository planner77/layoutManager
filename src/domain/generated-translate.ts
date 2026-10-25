/** Issue #54 / E4: numeric and selection preflight for browser-only WCS XY moves.
 * These are not server write permissions; GeneratedDocument checks again on commit. */
import {canvasEditCapability,sameCanvasScope,type CanvasObjectRef,type CanvasObjectScope} from './canvas-object-selection';
import type {GeneratedOutlineObject} from '../viewers/core/adapter';

const NUMERIC=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
export const TRANSLATE_WCS_LIMIT=1e12;
export const TRANSLATE_DRAG_THRESHOLD_PX=5;

export function parseWcsTranslation(x:string,y:string):{dx:number;dy:number}{
  const parse=(value:string,label:string)=>{
    const raw=value.trim();
    if(!NUMERIC.test(raw))throw new Error(label+'에 유효한 WCS 수치를 입력하세요.');
    const number=Number(raw);
    if(!Number.isFinite(number)||Math.abs(number)>TRANSLATE_WCS_LIMIT)
      throw new Error(label+'가 WCS 이동 범위(±1e12)를 벗어났습니다.');
    return number;
  };
  const dx=parse(x,'ΔX'),dy=parse(y,'ΔY');
  if(dx===0&&dy===0)throw new Error('이동량 ΔX 또는 ΔY를 0 이외의 값으로 입력하세요.');
  return {dx,dy};
}

/** Do not silently reduce a SOURCE/mixed or stale selection to editable rows. */
export function selectedTranslationIds(
  selection:readonly CanvasObjectRef[],objects:readonly GeneratedOutlineObject[],scope:CanvasObjectScope,
):string[]{
  const capability=canvasEditCapability(selection,scope);
  if(!capability.canEdit)throw new Error(capability.reason);
  const byId=new Map(objects.map(object=>[object.ref.id,object]));
  if(byId.size!==objects.length)throw new Error('생성 개체 참조가 중복되었습니다.');
  for(const ref of selection){
    const object=byId.get(ref.id);
    if(!object||object.ref.origin!=='GENERATED'||!sameCanvasScope(object.ref,scope)||
      !sameCanvasScope(ref,scope)||!object.visible)
      throw new Error('선택한 생성 개체가 없거나 숨김/다른 버전입니다.');
  }
  return selection.map(item=>item.id);
}

/** Bounds may be checked per animation frame without recomputing every vertex. */
export function validTranslationPreview(
  dx:number,dy:number,bounds:Readonly<{minX:number;minY:number;maxX:number;maxY:number}>,
):boolean{
  if(![dx,dy,...Object.values(bounds)].every(Number.isFinite) ||
     Math.abs(dx)>TRANSLATE_WCS_LIMIT||Math.abs(dy)>TRANSLATE_WCS_LIMIT ||
     bounds.minX>=bounds.maxX||bounds.minY>=bounds.maxY)return false;
  return [bounds.minX+dx,bounds.maxX+dx,bounds.minY+dy,bounds.maxY+dy]
    .every(value=>Number.isFinite(value)&&Math.abs(value)<=TRANSLATE_WCS_LIMIT);
}
