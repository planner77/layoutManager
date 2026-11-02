import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { buildTypedOutlineRequest } from '../../domain/typed-outline-draft';
import type { AuthorizedOutlineCatalog } from '../../domain/typed-outline';
import { computeOutline } from '../../viewers/core/outline-compute';
import { parseDxfOutlineIndex } from '../../viewers/core/outline-geometry';
import { attestTransformedOutlineDraftAgainstImmutableDxf } from '../../server/outline/transform-attestation';

const versionId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const ids = ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const dxf = ['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES','0','LWPOLYLINE','5','1A','8','0','90','4','70','1',
  '10','0','20','0','10','10','20','0','10','10','20','10','10','0','20','10',
  '0','ENDSEC','0','EOF',''].join('\n');
const bytes = new TextEncoder().encode(dxf);
const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
const context = { actorId, versionId, sourceSha256, unitCode: 4 };
const catalog: AuthorizedOutlineCatalog = {
  actorId, versionId, sourceSha256, sceneRevision: 2, catalogScope: 'GLOBAL', canCreate: true,
  items: ids.map((id, i) => ({ id, name: '서버 타입 ' + i, active: true, sortOrder: i, revision: 1 })),
  total: 2, offset: 0, limit: 50,
};
const preview = (kind: 'CONVEX' | 'PRECISE' = 'CONVEX') =>
  computeOutline(kind, parseDxfOutlineIndex(dxf, versionId, sourceSha256).entities);

test('TC-R3-003: both kinds and two types yield immutable claims accepted by the real source attestor', () => {
  for (const kind of ['CONVEX', 'PRECISE'] as const) {
    const original = preview(kind), before = structuredClone(original);
    for (const typeId of ids) {
      const request = buildTypedOutlineRequest(original, catalog, context, typeId, '  구역 A  ', 1);
      expect(request.mode).toBe('SOURCE_CANONICAL');
      if (request.mode !== 'SOURCE_CANONICAL') throw new Error('wrong mode');
      const verified = attestTransformedOutlineDraftAgainstImmutableDxf(request.sourceExport, versionId, sourceSha256, bytes);
      expect(verified.outlines[0]).toMatchObject({ kind, outlineTypeId: typeId, name: '구역 A' });
      expect(verified.outlines[0].effectiveGeometry).toEqual(original.geometry);
      expect(original).toEqual(before);
    }
  }
});

test('render preview with persistable=false produces only independent APP_CREATED geometry and a detached snapshot', () => {
  const original = { ...preview(), geometryBasis: 'RENDER_WCS_2D' as const,
    persistable: false, sourceEntityIds: [], derivedFrom: ['render-selection'] };
  const request = buildTypedOutlineRequest(original, catalog, context, ids[0], '', 3);
  expect(request).toMatchObject({ mode: 'APP_CREATED', name: '외곽선 3', expectedSceneRevision: 2 });
  expect(request).not.toHaveProperty('sourceExport');
  if (request.mode !== 'APP_CREATED') throw new Error('wrong mode');
  const copied = structuredClone(request.geometry);
  original.geometry.coordinates.length = 0;
  original.derivedFrom.push('changed');
  expect(request.geometry).toEqual(copied);
  expect(request.derivedFrom).toEqual(['render-selection']);
});

test('authority/context mismatch, missing active choice and non-ready Scene cannot form a submission', () => {
  for (const invalid of [{ ...catalog, actorId: ids[0] }, { ...catalog, versionId: ids[0] },
    { ...catalog, sourceSha256: 'a'.repeat(64) }, { ...catalog, sceneRevision: null },
    { ...catalog, canCreate: false }, { ...catalog, items: [] }]) {
    expect(() => buildTypedOutlineRequest(preview(), invalid, context, ids[0], 'name', 1)).toThrow();
  }
});

test('a render preview cannot invent source references or change its attestation flag', () => {
  for (const invalid of [{ ...preview(), geometryBasis: 'RENDER_WCS_2D' as const },
    { ...preview(), geometryBasis: 'RENDER_WCS_2D' as const, persistable: false }]) {
    expect(() => buildTypedOutlineRequest(invalid, catalog, context, ids[0], 'name', 1)).toThrow('원본 출처');
  }
});
