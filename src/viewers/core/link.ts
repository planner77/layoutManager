import { selectRenderer, type ViewerFormat, type ViewerRenderer } from './selection';

export function cadViewerUrl(
  origin: string,
  versionId: string,
  format: ViewerFormat,
  requestedRenderer?: string,
): string {
  const base = new URL(origin);
  if (base.protocol !== 'http:' && base.protocol !== 'https:') throw new TypeError('HTTP(S) origin이 필요합니다.');
  const renderer: ViewerRenderer = selectRenderer(format, requestedRenderer);
  const url = new URL(`/cad/versions/${encodeURIComponent(versionId)}/viewer`, base.origin);
  url.searchParams.set('renderer', renderer);
  return url.toString();
}

// #88: sharing identifies only an immutable Version and persisted memo UUID.
// URL creation never includes WCS, content, actor, storage locator or credentials.
const MEMO_LINK_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseMemoLinkId(value:unknown):string|null {
  if(value===undefined)return null;
  if(typeof value!=='string'||!MEMO_LINK_UUID.test(value))
    throw new TypeError('메모 링크 ID가 올바르지 않습니다.');
  return value.toLowerCase();
}
export function cadMemoViewerPath(versionId:string,memoId:string):string{
  if(!MEMO_LINK_UUID.test(versionId)||!MEMO_LINK_UUID.test(memoId))
    throw new TypeError('영속 Version/메모 UUID가 필요합니다.');
  return '/cad/versions/'+encodeURIComponent(versionId)+'/viewer?renderer=three-dxf-viewer&memo='+encodeURIComponent(memoId.toLowerCase());
}
export function cadMemoViewerUrl(origin:string,versionId:string,memoId:string):string{
  if(!MEMO_LINK_UUID.test(versionId)||!MEMO_LINK_UUID.test(memoId))
    throw new TypeError('영속 Version/메모 UUID가 필요합니다.');
  const url=new URL(cadMemoViewerPath(versionId,memoId),new URL(cadViewerUrl(origin,versionId,'DXF','three-dxf-viewer')).origin);
  return url.toString();
}
