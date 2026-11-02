import { describe, expect, it } from 'vitest';
import type { MemoDraft } from '../../domain/cad-memo';
import {
  assignMemoToGroup, createMemoGroup, emptyMemoTreeState, filterMemos, isMemoVisible,
  removeMemoGroup, removeMemoTreeEntry, renameMemoGroup, setMemoGroupVisible, setMemoVisible,
} from '../../domain/memo-tree';

const scope = { versionId: '00000000-0000-4000-8000-000000000001', sourceSha256: 'a'.repeat(64) };
const groupA = '00000000-0000-4000-8000-000000000002';
const groupB = '00000000-0000-4000-8000-000000000003';
const memo = (id: string, title: string, content = ''): MemoDraft => ({
  ...scope, id, anchorWcsXY: { x: 10, y: 20 }, labelOffset: { x: 14, y: -12 },
  title, content, textFormat: 'plain', createdAt: '2026-10-28T00:00:00Z',
  updatedAt: '2026-10-28T00:00:00Z',
});
const a = memo('00000000-0000-4000-8000-000000000011', '점검 메모', '모터 정상');
const b = memo('00000000-0000-4000-8000-000000000012', '확인 사항', 'CONVEYOR 이슈');
const c = memo('00000000-0000-4000-8000-000000000013', '메모 세 번째');

describe('Issue #85 session-only tree domain', () => {
  it('supports one-level groups, safe rename, reassignment and reparent-on-delete', () => {
    let state = createMemoGroup(emptyMemoTreeState, groupA, 'A 공정');
    state = createMemoGroup(state, groupB, 'B 공정');
    state = assignMemoToGroup(state, a.id, groupA, [a, b, c]);
    state = assignMemoToGroup(state, b.id, groupB, [a, b, c]);
    expect(state.groupByMemo).toEqual({ [a.id]: groupA, [b.id]: groupB });
    expect(() => assignMemoToGroup(state, c.id, 'wrong', [a, b, c])).toThrow();
    expect(() => assignMemoToGroup(state, 'missing', groupA, [a, b, c])).toThrow();
    expect(() => createMemoGroup(state, groupB, '복제')).toThrow();
    expect(() => createMemoGroup(state, 'bad', 'bad')).toThrow();
    expect(() => createMemoGroup(state, '00000000-0000-4000-8000-000000000004', '\n')).toThrow();
    state = renameMemoGroup(state, groupA, '공정 A');
    expect(state.groups[0].name).toBe('공정 A');
    expect(() => renameMemoGroup(state, groupA, 'B 공정')).toThrow();
    state = removeMemoGroup(state, groupA);
    expect(state.groupByMemo[a.id]).toBeUndefined();
    expect(state.groupByMemo[b.id]).toBe(groupB);
    expect(state.groups).toHaveLength(1);
  });
  it('keeps group, individual and global visibility independent of memo coordinates', () => {
    let state = createMemoGroup(emptyMemoTreeState, groupA, '그룹');
    state = assignMemoToGroup(state, a.id, groupA, [a, b, c]);
    state = setMemoVisible(state, b.id, false);
    expect(isMemoVisible(state, b.id)).toBe(false);
    state = setMemoGroupVisible(state, groupA, false, [a, b, c]);
    expect(isMemoVisible(state, a.id)).toBe(false);
    expect(isMemoVisible(state, c.id)).toBe(true);
    state = setMemoGroupVisible(state, groupA, true, [a, b, c]);
    expect(isMemoVisible(state, a.id)).toBe(true);
    expect(isMemoVisible(state, b.id)).toBe(false);
    state = removeMemoTreeEntry(state, b.id);
    expect(isMemoVisible(state, b.id)).toBe(true);
    expect(a.anchorWcsXY).toEqual({ x: 10, y: 20 });
  });
  it('filters Korean, English case and NFC without hiding hidden matches', () => {
    const all = [a, b, c];
    expect(filterMemos(all, ' 점검 ')).toEqual([a]);
    expect(filterMemos(all, 'conveyor')).toEqual([b]);
    expect(filterMemos(all, '정상')).toEqual([a]);
    expect(filterMemos(all, '   ')).toEqual(all);
    expect(filterMemos(all, 'missing')).toEqual([]);
    const decomposed = memo(a.id, '가나');
    expect(filterMemos([decomposed], '가나')).toHaveLength(1);
  });
});
