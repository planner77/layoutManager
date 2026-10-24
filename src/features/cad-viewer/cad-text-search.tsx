'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ViewerManager } from '@/viewers/core/adapter';
import type { CadTextIndex } from '@/viewers/core/text-index';
import { searchKey } from '@/viewers/core/text-index';
import type { ViewerFormat } from '@/viewers/core/selection';

const PAGE_SIZE = 100;

/** A renderer-neutral overlay; works inside regular, CSS immersive and native fullscreen shells. */
export function CadTextSearch({
  getManager, format, ready, loading, layers, selectedLayers, open, onOpenChange,
}: {
  getManager: () => ViewerManager | null;
  format: ViewerFormat;
  ready: boolean;
  loading: boolean;
  layers: readonly string[];
  selectedLayers: ReadonlySet<string>;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const id = useId();
  const setOpen = onOpenChange;
  const [index, setIndex] = useState<CadTextIndex | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(-1);
  const [page, setPage] = useState(0);
  const [focusError, setFocusError] = useState('');

  useEffect(() => {
    if (!open || !ready || format !== 'DXF' || index) return;
    const manager = getManager();
    if (!manager) return;
    let active = true;
    // The viewer has already loaded the bytes. This creates only a cancellable Worker.
    manager.getTextIndex().then(value => {
      if (active) { setIndex(value); setError(''); setWorking(false); }
    }).catch(reason => {
      if (active) { setError(reason instanceof Error ? reason.message : '도면 텍스트 검색 준비에 실패했습니다.'); setWorking(false); }
    });
    return () => { active = false; };
  }, [open, ready, format, getManager, index]);

  const matches = useMemo(() => {
    const key = searchKey(query);
    if (!index || !key) return [];
    return index.hits.filter(hit =>
      (!layers.includes(hit.layer) || selectedLayers.has(hit.layer)) &&
      searchKey(hit.text).includes(key));
  }, [index, query, layers, selectedLayers]);

  const lastPage = Math.max(0, Math.ceil(matches.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const pageHits = matches.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  function selectResult(position: number) {
    const hit = matches[position];
    if (!hit) return;
    if (!getManager()?.focusBounds(hit.focus)) {
      setFocusError('이 검색 결과의 화면 좌표로 이동할 수 없습니다.');
      return;
    }
    setSelected(position);
    setPage(Math.floor(position / PAGE_SIZE));
    setFocusError('');
  }
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && ready && format === 'DXF' && !index) { setWorking(true); setError(''); }
  }

  return <div
    onKeyDown={event => {
      // SelectionController handles Escape during window capture and may consume it.
      // Never close this panel when another UI layer already used this keystroke.
      if (event.key === 'Escape' && open && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        onOpenChange(false);
      }
    }}
    className="pointer-events-none absolute inset-y-2 right-2 z-[40] flex max-w-[calc(100vw-1rem)] flex-col items-end"
  >
    <Button type="button" size="sm" variant="outline" onClick={toggle}
      aria-expanded={open} aria-controls={id} disabled={format === 'DXF' && (loading || !ready)}
      className="pointer-events-auto max-w-full border-slate-300 bg-white text-slate-900 shadow">
      도면 내 텍스트 검색
    </Button>
    {open && <aside id={id} aria-label="도면 내 텍스트 검색"
      data-testid="cad-text-search"
      className="pointer-events-auto mt-2 flex min-h-0 max-h-[min(64dvh,38rem)] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-3 text-slate-900 shadow-xl">
      <div className="mb-2 flex items-center justify-between gap-2">
        <strong className="text-sm">현재 도면 내 텍스트 검색</strong>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>닫기</Button>
      </div>
      {format === 'DWG' ? <p className="text-sm">DWG 검색은 현재 지원하지 않습니다. DWG Viewer는 평면 LINE만 표시하며 TEXT/MTEXT 추출·렌더링은 미검증입니다.</p> : <>
        <input type="search" aria-label="도면 텍스트 검색어" value={query}
          onChange={event => { setQuery(event.target.value); setSelected(-1); setPage(0); setFocusError(''); }}
          onKeyDown={event => {
            if (event.key === 'Enter' && matches.length) { event.preventDefault(); selectResult(0); }
            if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          }}
          placeholder="한글, 영문, 숫자 또는 일부 문자열"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-teal-600" />
        <p aria-live="polite" className="my-2 text-xs text-slate-600">
          {working ? '검색용 텍스트를 분석 중입니다…' : error ? '검색 준비 실패' :
            !index ? '검색 준비 전' : !searchKey(query) ?
              '검색어를 입력하세요. 검색 가능 텍스트 ' + index.hits.length + '개' :
              '검색 결과 ' + matches.length + '개' + (selected >= 0 && selected < matches.length ? ' · 현재 ' + (selected + 1) + '/' + matches.length : '')}
        </p>
        {error && <p role="alert" className="mb-2 text-xs text-red-700">{error}</p>}
        {focusError && <p role="alert" className="mb-2 text-xs text-red-700">{focusError}</p>}
        {index && Object.keys(index.skipped).length > 0 && <details className="mb-2 text-xs text-amber-800">
          <summary>검색에서 제외된 객체/변환</summary>
          <p>{Object.entries(index.skipped).map(([why, count]) => why + ' ' + count + '개').join(', ')}</p>
        </details>}
        {index?.truncated && <p className="mb-2 text-xs text-amber-800">성능 보호를 위해 첫 20,000개 텍스트만 색인했습니다.</p>}
        {layers.length > selectedLayers.size && <p className="mb-2 text-xs text-slate-500">숨겨진 레이어는 결과에서 제외됩니다. 기존 표시 설정은 변경하지 않습니다.</p>}
        {matches.length > 0 && <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => selectResult(selected <= 0 ? matches.length - 1 : selected - 1)}>이전 결과</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => selectResult((selected + 1) % matches.length)}>다음 결과</Button>
          </div>
          <ol aria-label="검색 결과 목록" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {pageHits.map((hit, offset) => {
              const position = currentPage * PAGE_SIZE + offset;
              return <li key={hit.id}>
                <button type="button" onClick={() => selectResult(position)}
                  aria-current={selected === position ? 'true' : undefined}
                  className={'w-full rounded border p-2 text-left text-xs hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-600 ' +
                    (selected === position ? 'border-teal-600 bg-teal-50' : 'border-slate-200')}>
                  <span className="block break-all text-sm font-medium">{hit.text}</span>
                  <span className="mt-1 block text-slate-500">{hit.type} · {hit.layer} · {hit.origin === 'INSERT' ? 'BLOCK 내부' : 'Model'}</span>
                </button>
              </li>;
            })}
          </ol>
          {lastPage > 0 && <div className="mt-2 flex items-center justify-between text-xs">
            <Button type="button" size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>이전 페이지</Button>
            <span>{currentPage + 1}/{lastPage + 1}</span>
            <Button type="button" size="sm" variant="outline" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>다음 페이지</Button>
          </div>}
        </>}
        {index && searchKey(query) && matches.length === 0 && <p className="text-xs text-slate-500">일치하는 도면 내 텍스트가 없습니다.</p>}
        <p className="mt-2 text-[11px] text-slate-500">부분 일치 · 대소문자 무시 · Unicode NFC · MTEXT 개행 공백화. 위치는 텍스트 삽입점을 기준으로 이동합니다.</p>
      </>}
    </aside>}
  </div>;
}
