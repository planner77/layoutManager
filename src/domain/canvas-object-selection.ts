/** Issue #51 / E1: session-local canvas object identity and a fail-closed edit gate.
 * SOURCE identity comes from the verified #31 render mapping; GENERATED identity
 * is a separate CSPRNG UUID, never the legacy local-N JSON export ordinal.
 * This is a *capability* contract, not authorization to write to the server. */
export type CanvasObjectOrigin = 'SOURCE' | 'GENERATED';
export type CanvasObjectRef = Readonly<{
  origin: CanvasObjectOrigin;
  id: string;
  versionId: string;
  sourceSha256: string;
}>;
export type CanvasObjectScope = Readonly<{versionId:string;sourceSha256:string}>;
export type CanvasSelectionMode = 'pan' | 'select' | 'objects' | 'generated';
export type CanvasEditCapability = Readonly<{canSelect:boolean;canEdit:boolean;reason:string}>;

const SHA256 = /^[a-f0-9]{64}$/i;
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function validCanvasScope(scope:CanvasObjectScope):boolean {
  return !!scope.versionId && SHA256.test(scope.sourceSha256);
}
export function canvasObjectRef(
  origin:CanvasObjectOrigin,id:string,scope:CanvasObjectScope,
):CanvasObjectRef {
  if(!validCanvasScope(scope) || !id ||
    (origin==='GENERATED' && !UUID_V4.test(id)))throw new Error('객체 참조 범위 또는 ID가 유효하지 않습니다.');
  return {origin,id,versionId:scope.versionId,sourceSha256:scope.sourceSha256.toLowerCase()};
}
export function sameCanvasScope(ref:CanvasObjectRef,scope:CanvasObjectScope):boolean {
  return validCanvasScope(scope) && ref.versionId===scope.versionId &&
    ref.sourceSha256.toLowerCase()===scope.sourceSha256.toLowerCase();
}
/** No partial edits. Empty, SOURCE, mixed, forged or duplicate selections are denied. */
export function canvasEditCapability(
  selection:readonly CanvasObjectRef[],scope:CanvasObjectScope,
):CanvasEditCapability {
  if(!validCanvasScope(scope))return {canSelect:false,canEdit:false,reason:'검증된 도면 버전/SHA가 없습니다.'};
  if(!selection.length)return {canSelect:true,canEdit:false,reason:'생성 개체를 선택하세요.'};
  const keys=new Set<string>();
  for(const ref of selection){
    if(!sameCanvasScope(ref,scope) || !ref.id ||
      (ref.origin==='GENERATED' && !UUID_V4.test(ref.id)) ||
      (ref.origin!=='SOURCE' && ref.origin!=='GENERATED'))
      return {canSelect:false,canEdit:false,reason:'다른 도면 또는 유효하지 않은 객체 참조입니다.'};
    const key=ref.origin+':'+ref.id;
    if(keys.has(key))return {canSelect:false,canEdit:false,reason:'중복 객체 참조를 사용할 수 없습니다.'};
    keys.add(key);
  }
  if(selection.some(ref=>ref.origin==='SOURCE'))
    return {canSelect:true,canEdit:false,reason:'원본 DXF 또는 원본·생성 혼합 선택은 읽기 전용입니다. 생성 개체만 다시 선택하세요.'};
  return {canSelect:true,canEdit:true,reason:'생성 개체만 선택됨 (변경 명령은 E2~E5에서 제공)'};
}
