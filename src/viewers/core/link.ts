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
