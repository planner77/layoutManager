'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import type { MemoDraft } from '@/domain/cad-memo';
import { filterMemos, isMemoVisible, type MemoTreeState } from '@/domain/memo-tree';

type Props = {
  memos: readonly MemoDraft[];
  tree: MemoTreeState;
  selectedId: string | null;
  allVisible: boolean;
  transientFocusId: string | null;
  persistent: boolean;
  onPersistVisibility?: (id: string, visible: boolean) => void;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onVisibility: (id: string, visible: boolean) => void;
  onGroupVisibility: (groupId: string | null, visible: boolean) => void;
  onCreateGroup: (name: string) => boolean;
  onRenameGroup: (id: string, name: string) => boolean;
  onDeleteGroup: (id: string) => void;
  onAssignGroup: (id: string, groupId: string | null) => void;
  onClose: () => void;
};

export function CadMemoTreePanel({
  memos, tree, selectedId, allVisible, transientFocusId, persistent, onPersistVisibility, onSelect, onEdit, onVisibility,
  onGroupVisibility, onCreateGroup, onRenameGroup, onDeleteGroup, onAssignGroup, onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [statusFilter,setStatusFilter]=useState<'all'|'registered'|'progress'|'completed'>('all');
  const [groupName, setGroupName] = useState('');
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const refs = useRef<Map<string, HTMLDivElement>>(new Map());
  const term = query.normalize('NFC').trim();
  const textMatches = filterMemos(memos, term).filter(memo=>{
    if(statusFilter==='all')return true;
    if(statusFilter==='registered')return !memo.completionEnabled;
    if(statusFilter==='completed')return memo.completionEnabled&&memo.isCompleted;
    return memo.completionEnabled&&!memo.isCompleted;
  });
  const groups = [{ id: null, name: '미분류' }, ...tree.groups];
  const rows = groups.map(group => {
    const members = memos.filter(memo => (tree.groupByMemo[memo.id] ?? null) === group.id);
    const items = term && group.name.normalize('NFC').toLocaleLowerCase().includes(term.toLocaleLowerCase())
      ? members.filter(item=>statusFilter==='all'||textMatches.some(m=>m.id===item.id))
      : members.filter(item => textMatches.some(memo => memo.id === item.id));
    const expanded = Boolean(term) || !collapsed.includes(group.id ?? 'root');
    return { ...group, members, items, expanded, key: 'group:' + (group.id ?? 'root') };
  }).filter(group => (!term&&statusFilter==='all') || group.items.length > 0);
  const visibleKeys = rows.flatMap(group => [
    group.key, ...(group.expanded ? group.items.map(item => 'memo:' + item.id) : []),
  ]);
  const setRef = (key: string, node: HTMLDivElement | null) => {
    if (node) refs.current.set(key, node); else refs.current.delete(key);
  };
  const focusKey = (key: string) => {
    setFocusedKey(key);
    const node = refs.current.get(key);
    node?.focus({ preventScroll: true });
    const viewport = node?.closest<HTMLElement>('[role="tree"]');
    if (!viewport || !node) return;
    const rect = node.getBoundingClientRect();
    const area = viewport.getBoundingClientRect();
    if (rect.top < area.top) viewport.scrollTop -= area.top - rect.top;
    else if (rect.bottom > area.bottom) viewport.scrollTop += rect.bottom - area.bottom;
  };
  const toggleCollapse = (key: string) => {
    if (term) return;
    setCollapsed(current => current.includes(key) ? current.filter(value => value !== key) : [...current, key]);
  };
  const activateMemo = (id: string) => {
    // #85: hidden (per-item, group, or global) must require a specific
    // confirmation; a casual tree navigation cannot override visibility.
    if (!allVisible || !isMemoVisible(tree,id) || memos.find(m=>m.id===id)?.visible===false) {
      setPendingFocusId(id);
      return;
    }
    setPendingFocusId(null);
    onSelect(id);
  };
  const onTreeKeyDown = (event: KeyboardEvent<HTMLDivElement>,
    key: string, groupKey: string, memoId?: string) => {
    if (event.target !== event.currentTarget) return;
    const index = visibleKeys.indexOf(key);
    let next: string | undefined;
    switch (event.key) {
      case 'ArrowDown': next = visibleKeys[Math.min(index + 1, visibleKeys.length - 1)]; break;
      case 'ArrowUp': next = visibleKeys[Math.max(index - 1, 0)]; break;
      case 'Home': next = visibleKeys[0]; break;
      case 'End': next = visibleKeys[visibleKeys.length - 1]; break;
      case 'ArrowLeft':
        if (memoId) next = groupKey;
        else if (!collapsed.includes(groupKey.substring(6))) toggleCollapse(groupKey.substring(6));
        break;
      case 'ArrowRight':
        if (!memoId && collapsed.includes(groupKey.substring(6))) toggleCollapse(groupKey.substring(6));
        else if (!memoId) next = visibleKeys[index + 1];
        break;
      case 'Enter':
      case ' ':
        if (memoId) activateMemo(memoId);
        else toggleCollapse(groupKey.substring(6));
        break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (next) focusKey(next);
  };
  return <aside data-testid="cad-memo-tree" aria-label={persistent?'서버 메모 트리':'세션 메모 트리'}
    className="flex h-full min-h-0 min-w-0 flex-col text-xs text-slate-800"
    data-canvas-edit-escape-layer="memo-tree">
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
      <h2 className="font-semibold">메모 트리 ({memos.length})</h2>
      <button type="button" className="rounded border border-slate-400 bg-white px-2 py-1" onClick={onClose}>
        메모 트리 닫기
      </button>
    </div>
    <p data-testid="memo-tree-temporary" className="shrink-0 bg-amber-50 px-3 py-1 text-amber-900">
      {persistent ? '메모·그룹은 서버에 저장됩니다. 전체·그룹·개별 표시 토글은 이 Viewer 세션에만 적용됩니다.' : '세션 임시 · 그룹·표시상태·메모 모두 새로고침 시 소멸'}
    </p>
    <div className="shrink-0 space-y-2 border-b border-slate-200 p-2">
      <label className="block">메모 제목·본문/그룹 검색
        <input data-testid="cad-memo-tree-search" type="search" value={query} maxLength={100}
          onChange={event => setQuery(event.target.value)}
          className="mt-1 w-full rounded border border-slate-400 bg-white px-2 py-1.5"
          placeholder="현재 도면 Version의 메모 검색" />
      </label>
      <label>완료 상태 필터
        <select data-testid="cad-memo-tree-status-filter" value={statusFilter}
          onChange={e=>setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="all">전체</option><option value="registered">미관리</option>
          <option value="progress">진행 중</option><option value="completed">완료</option>
        </select>
      </label>
      <p data-testid="memo-tree-visibility-status" className="text-slate-600">
        Canvas 전체: {allVisible ? '표시' : '숨김'} · 숨김 메모도 목록/검색 가능
      </p>
      <form className="flex gap-1" onSubmit={event => {
        event.preventDefault();
        if (onCreateGroup(groupName)) setGroupName('');
      }}>
        <input data-testid="cad-memo-tree-group-name" aria-label="새 메모 그룹 이름"
          value={groupName} onChange={event => setGroupName(event.target.value)}
          maxLength={80} className="min-w-0 flex-1 rounded border border-slate-400 px-2 py-1.5"
          placeholder="새 그룹 이름 (선택)" />
        <button type="submit" data-testid="cad-memo-tree-add-group" className="shrink-0 rounded border border-slate-400 px-2">
          그룹 추가
        </button>
      </form>
    </div>
    {rows.length === 0 ? <p data-testid="cad-memo-tree-empty" className="p-3 text-slate-600">
      검색 결과가 없습니다. 숨겨진 메모도 검색 대상에 포함됩니다.
    </p> :
    <div role="tree" aria-label="메모 그룹과 메모" data-testid="cad-memo-tree-items"
      className="min-h-0 flex-1 overflow-auto p-2">
      {rows.map((group, index) => {
        const groupKey = group.id ?? 'root';
        const allGroupVisible = group.members.every(memo => isMemoVisible(tree, memo.id));
        return <div key={groupKey} data-testid="cad-memo-tree-group" className="mb-2">
          <div role="treeitem" aria-level={1} aria-expanded={group.expanded}
            aria-label={group.name + ', ' + group.members.length + '개'}
            ref={node => setRef(group.key, node)}
            tabIndex={focusedKey === group.key || (!focusedKey && index === 0) ? 0 : -1}
            onFocus={() => setFocusedKey(group.key)}
            onKeyDown={event => onTreeKeyDown(event, group.key, group.key)}
            onClick={() => toggleCollapse(groupKey)}
            className="flex cursor-pointer items-center gap-1 rounded bg-slate-100 p-1 focus-visible:outline-2 focus-visible:outline-teal-700">
            <span aria-hidden="true">{group.expanded ? '▾' : '▸'}</span>
            <strong className="min-w-0 flex-1 truncate">{group.name} ({group.members.length})</strong>
            <button type="button" disabled={group.members.length===0}
              aria-label={group.name + (allGroupVisible ? ' 전체 숨김' : ' 전체 표시')}
              onClick={event => { event.stopPropagation(); onGroupVisibility(group.id, !allGroupVisible); }}
              className="shrink-0 rounded border border-slate-400 px-1 disabled:opacity-40">
              {allGroupVisible ? '모두 숨김' : '모두 표시'}
            </button>
          </div>
          {group.id && <div className="my-1 flex flex-wrap items-center gap-1 pl-2">
            {editingGroup === group.id ? <>
              <input aria-label="변경할 그룹 이름" data-testid="cad-memo-tree-rename-input"
                maxLength={80} value={renameName} onChange={event => setRenameName(event.target.value)}
                className="min-w-0 flex-1 rounded border border-slate-400 px-1 py-1" />
              <button type="button" className="rounded border px-1" onClick={() => {
                if (onRenameGroup(group.id!, renameName)) setEditingGroup(null);
              }}>이름 적용</button>
              <button type="button" className="rounded border px-1" onClick={() => setEditingGroup(null)}>취소</button>
            </> : <>
              <button type="button" className="rounded border px-1" onClick={() => {
                setEditingGroup(group.id); setRenameName(group.name);
              }}>이름 변경</button>
              <button type="button" className="rounded border px-1"
                title="그룹만 삭제하고 포함된 메모는 미분류로 이동합니다."
                onClick={() => onDeleteGroup(group.id!)}>그룹 삭제</button>
            </>}
          </div>}
          {group.expanded && <div role="group" aria-label={group.name + ' 메모'}
            className="ml-2 border-l border-slate-300 pl-1">
            {group.items.length === 0 && <p className="p-1 text-slate-500">그룹 메모 없음</p>}
            {group.items.map(memo => {
              const key='memo:' + memo.id;
              const visible=isMemoVisible(tree, memo.id);
              const actuallyVisible=allVisible && visible && memo.visible!==false;
              return <div key={memo.id} role="treeitem" aria-level={2}
                data-testid="cad-memo-tree-item" data-memo-id={memo.id}
                aria-label={memo.title + (actuallyVisible ? ', 표시됨' : ', 숨겨짐')}
                aria-selected={selectedId===memo.id}
                tabIndex={focusedKey===key ? 0 : -1}
                ref={node => setRef(key, node)}
                onFocus={() => setFocusedKey(key)}
                onKeyDown={event => onTreeKeyDown(event,key,group.key,memo.id)}
                onClick={() => activateMemo(memo.id)}
                className={'my-1 rounded p-1 focus-visible:outline-2 focus-visible:outline-teal-700 ' +
                  (selectedId===memo.id ? 'bg-teal-100' : 'hover:bg-slate-100')}>
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 break-words font-semibold">{memo.title}</span>
                  <button type="button" aria-label={memo.title + (visible ? ' 숨기기' : ' 표시')}
                    data-testid="cad-memo-tree-visibility" aria-pressed={visible}
                    onClick={event => { event.stopPropagation(); setPendingFocusId(null); onVisibility(memo.id, !visible); }}
                    className="shrink-0 rounded border border-slate-400 px-1">{visible ? '숨김' : '표시'}</button>
                  {persistent && <button type="button" data-testid="cad-memo-tree-saved-visibility" aria-label={memo.title+' 저장 표시상태 변경'} disabled={!onPersistVisibility} onClick={event=>{event.stopPropagation();onPersistVisibility?.(memo.id,memo.visible===false);}} className="shrink-0 rounded border border-teal-700 px-1 disabled:opacity-40">{memo.visible===false?'저장 표시':'저장 숨김'}</button>}
                  <button type="button" onClick={event => { event.stopPropagation(); onEdit(memo.id); }}
                    className="shrink-0 rounded border border-slate-400 px-1">편집</button>
                </div>
                {pendingFocusId===memo.id && <div role="group" data-testid="cad-memo-tree-reveal-confirm"
                  aria-label="숨김 메모 일시 표시 확인" className="my-1 rounded border border-amber-500 bg-amber-50 p-1 text-amber-950"
                  onClick={event=>event.stopPropagation()}>
                  <p>현재 숨긴 메모입니다. 공유 표시상태는 바꾸지 않고 이 메모만 임시 표시·이동할까요?</p>
                  <button type="button" data-testid="cad-memo-tree-reveal-confirm-button"
                    className="mr-2 mt-1 rounded bg-amber-600 px-2 py-1 text-white"
                    onClick={()=>{setPendingFocusId(null);onSelect(memo.id);}}>임시 표시·이동</button>
                  <button type="button" className="rounded border border-slate-500 px-2 py-1"
                    onClick={()=>setPendingFocusId(null)}>취소</button>
                </div>}
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-slate-600">{memo.content}</p>
                {(memo.scheduleEnabled || memo.completionEnabled) && <p data-testid="cad-memo-tree-metadata" className="text-[10px] text-indigo-800">{memo.scheduleEnabled ? '일정: '+[memo.startDate,memo.dueDate].filter(Boolean).join(' ~ ') : ''}{memo.completionEnabled ? (memo.isCompleted ? ' · 완료' : ' · 미완료') : ''}</p>}
                <p className="text-[10px] text-slate-500">
                  {memo.createdById ? '작성자 '+memo.createdById.slice(0,8) : '작성자 미확정'} · 수정 {new Date(memo.updatedAt).toLocaleString('ko-KR')}
                  {transientFocusId===memo.id && !actuallyVisible ? ' · 선택 위치 임시 표시' : ''}
                </p>
                <label className="mt-1 flex items-center gap-1">그룹
                  <select value={tree.groupByMemo[memo.id] ?? ''} aria-label={memo.title + ' 그룹 이동'}
                    data-testid="cad-memo-tree-assign-group"
                    onClick={event => event.stopPropagation()}
                    onChange={event => onAssignGroup(memo.id, event.target.value || null)}
                    className="min-w-0 flex-1 rounded border border-slate-400 bg-white px-1 py-1">
                    <option value="">미분류</option>
                    {tree.groups.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
                  </select>
                </label>
              </div>;
            })}
          </div>}
        </div>;
      })}
    </div>}
  </aside>;
}
