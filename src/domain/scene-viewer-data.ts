import type { CadTextIndex } from '../viewers/core/text-index';

/** Display-only derivative metadata. Never an attestation of source geometry. */
export type SceneViewerData = Readonly<{ textIndex: CadTextIndex }>;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, limit: number): v is string => typeof v === 'string' && v.length <= limit;
export function validateSceneViewerData(value: unknown): SceneViewerData {
  if (!record(value) || Object.keys(value).join() !== 'textIndex' || !record(value.textIndex))
    throw new Error('SCENE_VIEWER_DATA_INVALID');
  const index = value.textIndex;
  if (Object.keys(index).some(k => !['hits', 'skipped', 'truncated'].includes(k)) ||
      !Array.isArray(index.hits) || index.hits.length > 20_000 || !record(index.skipped) ||
      Object.keys(index.skipped).length > 100 || typeof index.truncated !== 'boolean')
    throw new Error('SCENE_TEXT_INDEX_INVALID');
  const ids = new Set<string>();
  for (const hit of index.hits) {
    if (!record(hit) || Object.keys(hit).some(k => !['id','handle','type','raw','text','layer','focus','origin'].includes(k)) ||
        !text(hit.id, 1024) || !hit.id || ids.has(hit.id) || !text(hit.raw, 65_536) || !text(hit.text, 65_536) ||
        !text(hit.layer, 256) || !['TEXT','MTEXT'].includes(String(hit.type)) ||
        !['MODEL','INSERT'].includes(String(hit.origin)) ||
        hit.handle !== undefined && !text(hit.handle, 256) || !record(hit.focus) ||
        Object.keys(hit.focus).sort().join() !== 'maxX,maxY,minX,minY' ||
        !Object.values(hit.focus).every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e12) ||
        Number(hit.focus.minX) >= Number(hit.focus.maxX) || Number(hit.focus.minY) >= Number(hit.focus.maxY))
      throw new Error('SCENE_TEXT_HIT_INVALID');
    ids.add(hit.id);
  }
  for (const [key, n] of Object.entries(index.skipped)) {
    if (!text(key, 256) || !Number.isSafeInteger(n) || Number(n) < 0) throw new Error('SCENE_TEXT_INDEX_INVALID');
  }
  return value as SceneViewerData;
}
