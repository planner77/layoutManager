'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { buildOutlineTree, type OutlineTreeType } from '@/domain/outline-tree';
import type { SavedOutline, SavedOutlineOverlayState } from '@/viewers/core/adapter';

type Props = {
  outlines: readonly SavedOutline[];
  overlayStates: readonly SavedOutlineOverlayState[];
  types: readonly OutlineTreeType[];
  allowDelete: boolean;
  onSelect: (id: string) => void;
  onVisibility: (id: string, visible: boolean) => void;
  onGroupVisibility: (ids: string[], visible: boolean) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

/** Only confirmed browser-session overlay objects appear in the tree.
 * Buttons control overlays, never Source layers or ViewerManager.load().
 * Keyboard navigation is on the treeitems, independent of action buttons. */
export function OutlineTreePanel({
  outlines, overlayStates, types, allowDelete,
  onSelect, onVisibility, onGroupVisibility, onDelete, onClose,
}: Props) {
  const groups = buildOutlineTree(outlines, overlayStates, types);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const refs = useRef<Map<string, HTMLDivElement>>(new Map());
  const visibleKeys = groups.flatMap(group => [
    'group:' + group.id,
    ...(collapsed.has(group.id) ? [] : group.items.map(item => 'outline:' + item.id)),
  ]);
  const focusKey = (key: string) => {
    setFocusedKey(key);
    const node = refs.current.get(key);
    if (!node) return;
    // Prevent the browser from scrolling the surrounding CAD workspace.
    // Scroll only the tree's own viewport, including on compact 20dvh docks.
    node.focus({ preventScroll: true });
    const viewport = node.closest<HTMLElement>('[role="tree"]');
    if (!viewport) return;
    const itemRect = node.getBoundingClientRect();
    const viewRect = viewport.getBoundingClientRect();
    if (itemRect.top < viewRect.top) {
      viewport.scrollTop -= viewRect.top - itemRect.top;
    } else if (itemRect.bottom > viewRect.bottom) {
      viewport.scrollTop += itemRect.bottom - viewRect.bottom;
    }
  };
  const toggle = (id: string) => {
    setCollapsed(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const handleKey = (event: KeyboardEvent<HTMLDivElement>, key: string, groupId: string, leafId?: string) => {
    if (event.target !== event.currentTarget) return;
    let nextKey: string | null = null;
    const index = visibleKeys.indexOf(key);
    switch (event.key) {
      case 'ArrowDown': nextKey = visibleKeys[Math.min(index + 1, visibleKeys.length - 1)]; break;
      case 'ArrowUp': nextKey = visibleKeys[Math.max(index - 1, 0)]; break;
      case 'Home': nextKey = visibleKeys[0]; break;
      case 'End': nextKey = visibleKeys[visibleKeys.length - 1]; break;
      case 'ArrowRight':
        if (!leafId && collapsed.has(groupId)) toggle(groupId);
        else if (!leafId) nextKey = visibleKeys[index + 1] || null;
        break;
      case 'ArrowLeft':
        if (leafId) nextKey = 'group:' + groupId;
        else if (!collapsed.has(groupId)) toggle(groupId);
        break;
      case 'Enter':
      case ' ':
        if (leafId) onSelect(leafId);
        else toggle(groupId);
        break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (nextKey) focusKey(nextKey);
  };
  const setRef = (key: string, node: HTMLDivElement | null) => {
    if (node) refs.current.set(key, node);
    else refs.current.delete(key);
  };
  return (
    <aside aria-label="외곽선 목록" data-testid="viewer-outline-tree"
      className="flex h-full min-h-0 min-w-0 flex-col text-xs text-slate-800">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <h2 className="font-semibold">외곽선 목록 ({outlines.length})</h2>
        <Button size="sm" variant="outline" onClick={onClose}>외곽선 목록 닫기</Button>
      </div>
      <p data-testid="outline-tree-temporary" className="shrink-0 bg-amber-50 px-3 py-1 text-amber-900">
        임시·재접속 시 소멸 · 서버에 저장되지 않습니다.
      </p>
      {!groups.length ? (
        <p data-testid="outline-tree-empty" className="px-3 py-3 text-slate-500">
          아직 확정된 외곽선이 없습니다. 외곽선 생성 도구에서 임시 확정하면 표시됩니다.
        </p>
      ) : (
        <div role="tree" aria-label="업무 타입별 외곽선"
          data-testid="outline-tree-items" className="min-h-0 flex-1 overflow-auto p-2">
          {groups.map((group, index) => {
            const open = !collapsed.has(group.id);
            const allVisible = group.items.length > 0 && group.items.every(item => item.visible);
            const groupKey = 'group:' + group.id;
            return (
              <div key={group.id} className="mb-1" data-testid="outline-tree-group">
                <div role="treeitem" aria-level={1} aria-expanded={open}
                  aria-label={group.name + ', ' + group.items.length + '개'}
                  ref={node => setRef(groupKey, node)}
                  tabIndex={focusedKey === groupKey || (!focusedKey && index === 0) ? 0 : -1}
                  onFocus={() => setFocusedKey(groupKey)}
                  onKeyDown={event => handleKey(event, groupKey, group.id)}
                  onClick={() => toggle(group.id)}
                  className="flex cursor-pointer items-center gap-1 rounded bg-slate-100 p-1 focus-visible:outline-2 focus-visible:outline-teal-600">
                  <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold" title={group.name}>
                    {group.name} ({group.items.length})
                  </span>
                  <button type="button" disabled={!group.items.length}
                    aria-label={group.name + (allVisible ? ' 전체 숨기기' : ' 전체 표시')}
                    onClick={event => { event.stopPropagation(); onGroupVisibility(group.items.map(item => item.id), !allVisible); }}
                    className="shrink-0 rounded border border-slate-400 px-1 disabled:opacity-40">
                    {allVisible ? '모두 숨김' : '모두 표시'}
                  </button>
                </div>
                {open && (
                  <div role="group" aria-label={group.name + ' 외곽선'} className="ml-2 border-l border-slate-200 pl-1">
                    {group.items.map(item => {
                      const key = 'outline:' + item.id;
                      return (
                        <div key={item.id} role="treeitem" aria-level={2}
                          aria-selected={item.selected} aria-label={item.name + ', ' + item.kind}
                          ref={node => setRef(key, node)}
                          data-testid="outline-tree-item" data-outline-id={item.id}
                          tabIndex={focusedKey === key ? 0 : -1}
                          onFocus={() => setFocusedKey(key)}
                          onKeyDown={event => handleKey(event, key, group.id, item.id)}
                          onClick={() => onSelect(item.id)}
                          className={'my-1 flex cursor-pointer items-center gap-1 rounded px-1 py-1 focus-visible:outline-2 focus-visible:outline-teal-600 ' +
                            (item.selected ? 'bg-teal-100' : 'hover:bg-slate-100')}>
                          <span className="min-w-0 flex-1 truncate" title={item.name}>
                            {item.name}
                            <span className="block text-[10px] text-slate-500">{item.kind === 'CONVEX' ? '볼록' : '정밀'} · 임시</span>
                          </span>
                          <button type="button"
                            aria-label={item.name + (item.visible ? ' 숨기기' : ' 표시')}
                            aria-pressed={item.visible}
                            onClick={event => { event.stopPropagation(); onVisibility(item.id, !item.visible); }}
                            className="shrink-0 rounded border border-slate-400 px-1">
                            {item.visible ? '숨김' : '표시'}
                          </button>
                          <button type="button" disabled={!allowDelete}
                            title={allowDelete ? '이 임시 외곽선 삭제' : '삭제하려면 외곽선 생성 도구를 켜세요.'}
                            aria-label={item.name + ' 삭제'}
                            onClick={event => { event.stopPropagation(); onDelete(item.id); }}
                            className="shrink-0 rounded border border-slate-400 px-1 disabled:opacity-40">
                            삭제
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
