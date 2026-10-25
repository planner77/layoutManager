/** Issue #53 E3: immutable deletion intent, never a source/preview or server mutation. */
import {
  canvasEditCapability,sameCanvasScope,validCanvasScope,
  type CanvasObjectRef,type CanvasObjectScope,
} from './canvas-object-selection';
import type {GeneratedOutlineObject} from '../viewers/core/adapter';

export type GeneratedDeleteRequest=Readonly<{
  scope:CanvasObjectScope;
  targets:readonly Readonly<{id:string;savedOutlineId:string;name:string}>[];
}>;

export function prepareGeneratedDelete(
  selection:readonly CanvasObjectRef[],
  objects:readonly GeneratedOutlineObject[],
  scope:CanvasObjectScope,
):GeneratedDeleteRequest {
  const gate=canvasEditCapability(selection,scope);
  if(!gate.canEdit)throw new Error(gate.reason);
  const byId=new Map(objects.map(object=>[object.ref.id,object]));
  if(byId.size!==objects.length)throw new Error('생성 개체 ID가 중복되었습니다.');
  const targets=selection.map(ref=>{
    const object=byId.get(ref.id);
    if(!object || !sameCanvasScope(object.ref,scope) || !object.visible ||
       object.ref.origin!=='GENERATED')
      throw new Error('삭제할 생성 개체가 없거나 다른 도면/숨김 상태입니다.');
    return Object.freeze({
      id:ref.id,savedOutlineId:object.savedOutlineId,
      name:object.name.trim() || '외곽선 '+object.savedOutlineId.replace(/^local-/,''),
    });
  });
  if(!validCanvasScope(scope))throw new Error('검증된 Version/SHA가 없습니다.');
  return Object.freeze({scope:Object.freeze({...scope}),
    targets:Object.freeze(targets)});
}

/** A confirmation never applies to a different selection, Version or object list. */
export function assertGeneratedDeleteCurrent(
  request:GeneratedDeleteRequest,
  selection:readonly CanvasObjectRef[],
  objects:readonly GeneratedOutlineObject[],
  scope:CanvasObjectScope,
):void {
  if(request.scope.versionId!==scope.versionId ||
     request.scope.sourceSha256.toLowerCase()!==scope.sourceSha256.toLowerCase())
    throw new Error('도면 버전이 변경되어 삭제를 취소했습니다.');
  const live=prepareGeneratedDelete(selection,objects,scope);
  // Names are part of the text the user confirmed; a renamed target requires
  // renewed consent rather than silently deleting a different label.
  const key=(values:readonly {id:string;savedOutlineId:string;name:string}[])=>
    JSON.stringify(values.map(item=>[item.id,item.savedOutlineId,item.name] as const)
      .sort(([left],[right])=>left.localeCompare(right)));
  if(request.targets.length!==live.targets.length ||
     key(request.targets)!==key(live.targets))
    throw new Error('삭제 확인 중 선택 대상이 변경되었습니다. 다시 선택하세요.');
}
