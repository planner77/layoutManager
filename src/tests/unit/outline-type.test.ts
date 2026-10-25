import { describe, expect, it } from 'vitest';
import {
  addPreviewOutlineType, normalizeOutlineTypeInput, outlineTypeNameKey,
  sortedPreviewOutlineTypes, updatePreviewOutlineType,
} from '../../domain/outline-type';

const id1 = '11111111-1111-4111-8111-111111111111';
const id2 = '22222222-2222-4222-8222-222222222222';
const now = '2026-10-25T02:00:00.000Z';
const draft = (name: unknown, sortOrder: unknown = 0) => ({ name, description: ' 설명 ', sortOrder });

describe('Issue #41 U4 design-only catalog invariants', () => {
  it('TC-U4-UNIT-001: NFC, trim, case-insensitive duplicate and inactive name reservation', () => {
    expect(normalizeOutlineTypeInput(draft('  Cafe\u0301 ')).name).toBe('Café');
    expect(outlineTypeNameKey('CAFÉ')).toBe(outlineTypeNameKey('Cafe\u0301'));
    const first = addPreviewOutlineType([], draft(' Cafe\u0301 '), id1, now);
    expect(first[0]).toMatchObject({
      id: id1, name: 'Café', description: '설명', active: true,
      scopeKey: null, revision: 1, createdAt: now,
    });
    expect(() => addPreviewOutlineType(first, draft('CAFÉ'), id2, now)).toThrow(/같은 이름/);
    const inactive = updatePreviewOutlineType(first, id1, 1, { active: false }, now);
    expect(() => addPreviewOutlineType(inactive, draft('café'), id2, now)).toThrow(/같은 이름/);
  });

  it('TC-U4-UNIT-002: reject empty, control/invisible, excessive, invalid sort and IDs', () => {
    for (const name of ['', '   ', 'A\nB', 'A\u202eB', 'X'.repeat(101), null]) {
      expect(() => normalizeOutlineTypeInput(draft(name))).toThrow();
    }
    for (const sortOrder of [-1, 1.5, 10000, Number.NaN, '3', null]) {
      expect(() => normalizeOutlineTypeInput(draft('A', sortOrder))).toThrow(/정렬/);
    }
    expect(() => normalizeOutlineTypeInput({ name: 'OK', description: 'x'.repeat(501), sortOrder: 0 }))
      .toThrow(/설명/);
    expect(() => addPreviewOutlineType([], draft('A'), 'attacker', now)).toThrow(/ID/);
    const saved = addPreviewOutlineType([], draft('A'), id1, now);
    expect(() => addPreviewOutlineType(saved, draft('B'), id1, now)).toThrow(/ID/);
  });

  it('TC-U4-UNIT-003: stable ID, soft deactivation, rename and optimistic revision guard', () => {
    const existing = addPreviewOutlineType([], draft('공정'), id1, now);
    const renamed = updatePreviewOutlineType(existing, id1, 1, {
      name: '설비', sortOrder: 2, description: null,
    }, '2026-10-25T03:00:00.000Z');
    expect(renamed[0]).toMatchObject({
      id: id1, name: '설비', description: null, active: true, sortOrder: 2,
      revision: 2, createdAt: now, updatedAt: '2026-10-25T03:00:00.000Z',
    });
    expect(existing[0].name).toBe('공정'); // immutable command semantics
    const inactive = updatePreviewOutlineType(renamed, id1, 2, { active: false }, now);
    expect(inactive[0]).toMatchObject({ id: id1, active: false, revision: 3 });
    const restored = updatePreviewOutlineType(inactive, id1, 3, { active: true }, now);
    expect(restored[0]).toMatchObject({ id: id1, active: true, revision: 4 });
    expect(() => updatePreviewOutlineType(restored, id1, 1, { name: 'old' }, now))
      .toThrow(/충돌/);
    expect(() => updatePreviewOutlineType(restored, id2, 1, { name: 'unknown' }, now))
      .toThrow(/존재하지/);
    expect(() => updatePreviewOutlineType(restored, id1, 4, { active: 'yes' }, now))
      .toThrow(/활성/);
  });

  it('TC-U4-UNIT-004: duplicate rename fails; sort is deterministic, IDs remain stable', () => {
    const first = addPreviewOutlineType([], draft('Z', 5), id1, now);
    const second = addPreviewOutlineType(first, draft('A', 1), id2, now);
    expect(sortedPreviewOutlineTypes(second).map(x => x.id)).toEqual([id2, id1]);
    expect(() => updatePreviewOutlineType(second, id2, 1, { name: 'z' }, now))
      .toThrow(/같은 이름/);
    expect(second).toHaveLength(2);
    expect(second[1].id).toBe(id2);
  });
});
