import type { MemoDraft } from './cad-memo';

/**
 * Issue #85 M4-A: all state is browser-session-only and scoped by its owner
 * MemoSession (Version + source SHA). Not an authorization/persistence schema.
 * Groups have one level; no parent cycle or cross-version identifiers exist.
 */
export type MemoGroup = Readonly<{ id: string; name: string }>;
export type MemoTreeState = Readonly<{
  groups: readonly MemoGroup[];
  groupByMemo: Readonly<Record<string, string>>;
  hiddenMemoIds: readonly string[];
  hiddenGroupIds: readonly string[];
}>;
export const emptyMemoTreeState: MemoTreeState = {
  groups: [], groupByMemo: {}, hiddenMemoIds: [], hiddenGroupIds: [],
};
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unsafeGroupName = /[\u0000-\u001f\u007f-\u009f]/u;
export const MEMO_GROUP_LIMIT = 20;
export const MEMO_GROUP_DEPTH = 1;

function normalizeGroupName(name: string): string {
  if (typeof name !== 'string') throw new Error('메모 그룹 이름이 필요합니다.');
  const normalized = name.normalize('NFC').trim();
  if (!normalized || normalized.length > 80 || unsafeGroupName.test(normalized)) {
    throw new Error('메모 그룹 이름은 한 줄 1~80자의 일반 텍스트여야 합니다.');
  }
  return normalized;
}
function toggleId(list: readonly string[], id: string, visible: boolean): string[] {
  return visible ? list.filter(value => value !== id) :
    list.includes(id) ? [...list] : [...list, id];
}
export function createMemoGroup(state: MemoTreeState, id: string, name: string): MemoTreeState {
  if (!uuidV4.test(id) || state.groups.some(group => group.id === id)) {
    throw new Error('유효하지 않거나 중복된 임시 그룹 ID입니다.');
  }
  if (state.groups.length >= MEMO_GROUP_LIMIT) throw new Error('임시 그룹은 최대 20개입니다.');
  const normalized = normalizeGroupName(name);
  if (state.groups.some(group => group.name === normalized)) {
    throw new Error('동일한 이름의 그룹이 이미 존재합니다.');
  }
  return { ...state, groups: [...state.groups, { id, name: normalized }] };
}
export function renameMemoGroup(state: MemoTreeState, id: string, name: string): MemoTreeState {
  if (!state.groups.some(group => group.id === id)) throw new Error('그룹을 찾지 못했습니다.');
  const normalized = normalizeGroupName(name);
  if (state.groups.some(group => group.id !== id && group.name === normalized)) {
    throw new Error('동일한 이름의 그룹이 이미 존재합니다.');
  }
  return { ...state, groups: state.groups.map(group => group.id === id ?
    { ...group, name: normalized } : group) };
}
export function removeMemoGroup(state: MemoTreeState, id: string): MemoTreeState {
  if (!state.groups.some(group => group.id === id)) throw new Error('그룹을 찾지 못했습니다.');
  return {
    ...state,
    groups: state.groups.filter(group => group.id !== id),
    groupByMemo: Object.fromEntries(Object.entries(state.groupByMemo).filter(([, groupId]) => groupId !== id)),
    hiddenGroupIds: state.hiddenGroupIds.filter(groupId => groupId !== id),
  };
}
/** Caller supplies only memos from the active, verified M1 session. */
export function assignMemoToGroup(
  state: MemoTreeState, id: string, groupId: string | null, memos: readonly MemoDraft[],
): MemoTreeState {
  if (!memos.some(memo => memo.id === id)) throw new Error('현재 Version의 메모가 아닙니다.');
  if (groupId !== null && !state.groups.some(group => group.id === groupId)) {
    throw new Error('현재 Version의 그룹이 아닙니다.');
  }
  const assignments = { ...state.groupByMemo };
  if (groupId === null) delete assignments[id];
  else assignments[id] = groupId;
  return { ...state, groupByMemo: assignments };
}
export function removeMemoTreeEntry(state: MemoTreeState, id: string): MemoTreeState {
  const assignments = { ...state.groupByMemo };
  delete assignments[id];
  return {
    ...state, groupByMemo: assignments,
    hiddenMemoIds: state.hiddenMemoIds.filter(item => item !== id),
  };
}
export function setMemoVisible(state: MemoTreeState, id: string, visible: boolean): MemoTreeState {
  return { ...state, hiddenMemoIds: toggleId(state.hiddenMemoIds, id, visible) };
}
export function setMemoGroupVisible(
  state: MemoTreeState, groupId: string | null, visible: boolean, memos: readonly MemoDraft[],
): MemoTreeState {
  if (groupId !== null && !state.groups.some(group => group.id === groupId)) {
    throw new Error('현재 Version의 그룹이 아닙니다.');
  }
  const ids = new Set(memos.filter(memo => (state.groupByMemo[memo.id] ?? null) === groupId).map(memo => memo.id));
  return {
    ...state,
    hiddenGroupIds: groupId === null ? state.hiddenGroupIds :
      toggleId(state.hiddenGroupIds, groupId, visible),
    hiddenMemoIds: visible ? state.hiddenMemoIds.filter(id => !ids.has(id)) :
      [...new Set([...state.hiddenMemoIds, ...ids])],
  };
}
export function isMemoVisible(state: MemoTreeState, id: string): boolean {
  const groupId = state.groupByMemo[id];
  return !state.hiddenMemoIds.includes(id) && (!groupId || !state.hiddenGroupIds.includes(groupId));
}
/** The filter never reads DXF data and includes hidden memos intentionally. */
export function filterMemos(memos: readonly MemoDraft[], query: string): MemoDraft[] {
  const normalized = query.normalize('NFC').trim().toLocaleLowerCase();
  if (!normalized) return [...memos];
  return memos.filter(memo =>
    (memo.title + '\n' + memo.content).normalize('NFC').toLocaleLowerCase().includes(normalized));
}
