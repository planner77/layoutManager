import { describe, expect, it } from 'vitest';
import type { OutlineType } from '../../domain/outline-type';
import type { SavedOutline } from '../../viewers/core/adapter';
import {
  normalizeOutlineInstanceName, resolveOutlineAssignment, selectableOutlineTypes,
  type ScopedOutlineCatalog,
} from '../../domain/outline-assignment';
import { buildOutlineExport, parseOutlineExport } from '../../domain/outline-draft';

const versionId = '11111111-1111-4111-8111-111111111111';
const sha = 'a'.repeat(64);
const typeA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const typeB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const now = '2026-10-25T03:00:00.000Z';
const scopeKey = 'business:01/site:01';
const outlineType = (id: string, name: string): OutlineType => ({
  id, name, description: null, active: true, sortOrder: 0,
  scopeKey, revision: 1, createdAt: now, updatedAt: now,
});
const type1 = outlineType(typeA, '장비');
const type2 = outlineType(typeB, '동선');
const catalog: ScopedOutlineCatalog = {
  versionId, sourceSha256: sha, scopeKey, types: [type1, type2],
};
const saved = (id: string, kind: 'CONVEX' | 'PRECISE' = 'CONVEX'): SavedOutline => ({
  id, createdAt: now,
  result: {
    kind,
    algorithm: kind === 'CONVEX' ? 'monotone-chain-v1' : 'polygon-clipping-union-v1',
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] },
    sourceEntityIds: [versionId + ':' + sha + ':1A'],
    persistable: true, tolerance: 0.02, durationMs: 2, warnings: [],
  },
});

describe('Issue #42 U5 typed browser draft contract (no production catalog)', () => {
  it('TC-U5-UNIT-001: one algorithm supports different types and one type supports both algorithms', () => {
    const first = resolveOutlineAssignment(catalog, versionId, sha, typeA, ' 본체 ', 1);
    const second = resolveOutlineAssignment(catalog, versionId, sha, typeB, '본체', 2);
    const third = resolveOutlineAssignment(catalog, versionId, sha, typeA, '', 3);
    expect(first).toMatchObject({ outlineTypeId: typeA, outlineTypeName: '장비', name: '본체' });
    expect(second).toMatchObject({ outlineTypeId: typeB, name: '본체' }); // name collisions allowed
    expect(third.name).toBe('외곽선 3');
    const convex = saved('local-1');
    const precise = saved('local-2', 'PRECISE');
    const payload = buildOutlineExport(versionId, sha, 4, [
      { ...convex, ...first }, { ...saved('local-3'), ...second }, { ...precise, ...third },
    ]);
    expect(payload.schemaVersion).toBe(2);
    const parsed = parseOutlineExport(payload, versionId, sha);
    expect(parsed.outlines.map(item => [item.kind, item.outlineTypeId])).toEqual([
      ['CONVEX', typeA], ['CONVEX', typeB], ['PRECISE', typeA],
    ]);
    expect(parsed.outlines[0].geometry).toEqual(convex.result.geometry);
    expect(parsed.outlines[2].algorithm).toBe('polygon-clipping-union-v1');
    expect(convex.result.kind).toBe('CONVEX'); // no algorithm mutation
  });

  it('TC-U5-UNIT-002: missing/inactive/wrong-scope/version type and invalid name fail closed', () => {
    expect(selectableOutlineTypes(null, versionId, sha)).toEqual([]);
    expect(() => resolveOutlineAssignment(null, versionId, sha, typeA, '', 1)).toThrow(/서버/);
    expect(() => resolveOutlineAssignment(catalog, versionId, sha, '', '', 1)).toThrow(/선택/);
    expect(() => resolveOutlineAssignment(catalog, versionId, sha, 'not-an-id', '', 1)).toThrow(/선택/);
    expect(() => resolveOutlineAssignment(catalog, versionId, sha, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '', 1))
      .toThrow(/존재/);
    const inactive: ScopedOutlineCatalog = { ...catalog, types: [{ ...type1, active: false }] };
    expect(() => resolveOutlineAssignment(inactive, versionId, sha, typeA, '', 1)).toThrow(/비활성/);
    expect(selectableOutlineTypes(inactive, versionId, sha)).toEqual([]);
    const wrongScope: ScopedOutlineCatalog = { ...catalog, types: [{ ...type1, scopeKey: 'other' }] };
    expect(() => resolveOutlineAssignment(wrongScope, versionId, sha, typeA, '', 1)).toThrow(/범위 밖/);
    expect(selectableOutlineTypes(wrongScope, versionId, sha)).toEqual([]);
    const unapprovedLab = { ...catalog, types: [{ ...type1, scopeKey: null }] };
    expect(selectableOutlineTypes(unapprovedLab, versionId, sha)).toEqual([]);
    expect(selectableOutlineTypes(catalog, versionId, 'b'.repeat(64))).toEqual([]);
    expect(() => resolveOutlineAssignment(catalog, versionId, 'b'.repeat(64), typeA, '', 1))
      .toThrow(/Version/);
    for (const name of ['A\nB', 'A\u202eB', 'x'.repeat(101), 42]) {
      expect(() => normalizeOutlineInstanceName(name, 1)).toThrow();
    }
    expect(normalizeOutlineInstanceName(' Cafe\u0301 ', 1)).toBe('Café');
    expect(() => normalizeOutlineInstanceName('', 0)).toThrow(/순번/);
  });

  it('TC-U5-UNIT-003: v1 remains readable/exportable and a mixed v2 marks legacy unclassified', () => {
    const legacy = saved('local-1');
    const v1 = buildOutlineExport(versionId, sha, 4, [legacy]);
    expect(v1.schemaVersion).toBe(1);
    expect('outlineTypeId' in v1.outlines[0]).toBe(false);
    const old = parseOutlineExport(v1, versionId, sha);
    expect(old.schemaVersion).toBe(1);
    expect(old.outlines[0].outlineTypeId).toBeNull();
    const assignment = resolveOutlineAssignment(catalog, versionId, sha, typeA, '라인 A', 2);
    const v2 = buildOutlineExport(versionId, sha, 4, [legacy, { ...saved('local-2'), ...assignment }]);
    expect(v2.schemaVersion).toBe(2);
    const read = parseOutlineExport(v2, versionId, sha);
    expect(read.outlines[0]).toMatchObject({ outlineTypeId: null, outlineTypeName: null, name: null });
    expect(read.outlines[1]).toMatchObject({ outlineTypeId: typeA, outlineTypeName: '장비', name: '라인 A' });
    expect(() => parseOutlineExport({ ...v2, versionId: '22222222-2222-4222-8222-222222222222' }, versionId, sha))
      .toThrow(/Version/);
    const malformed = structuredClone(v2);
    malformed.outlines[1].outlineTypeId = 'fake';
    expect(() => parseOutlineExport(malformed, versionId, sha)).toThrow(/업무 타입/);
    const missing = structuredClone(v2);
    delete (missing.outlines[1] as {outlineTypeName?:string|null}).outlineTypeName;
    expect(() => parseOutlineExport(missing, versionId, sha)).toThrow(/메타데이터/);
    const mixed = structuredClone(v2);
    mixed.outlines[0].outlineTypeName = '가짜';
    expect(() => parseOutlineExport(mixed, versionId, sha)).toThrow(/업무 타입/);
  });
});
