'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import type { GlobalOutlineTypeDto, OutlineTypeAccessDto } from '@/domain/outline-type-catalog';
import { OutlineTypeClientError, readOutlineTypeAccess, readOutlineTypes, writeOutlineType } from './outline-type-client';

const empty = { name: '', description: '', sortOrder: '0' };
export function OutlineTypeManager({ access, refreshAccess, onChanged }: {
  access: OutlineTypeAccessDto | null; refreshAccess: () => Promise<void>;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<GlobalOutlineTypeDto[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ q: '', offset: 0 });
  const [selected, setSelected] = useState<GlobalOutlineTypeDto | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const readRequest = useRef<AbortController | null>(null);
  const writeRequest = useRef<AbortController | null>(null);
  const resetEditor = () => { setSelected(null); setForm(empty); };
  const load = useCallback(async () => {
    readRequest.current?.abort();
    const controller = new AbortController(); readRequest.current = controller;
    setLoading(true); setError('');
    try {
      const capability = await readOutlineTypeAccess(controller.signal);
      if (!capability.canManage) throw new OutlineTypeClientError(403, 'ACCESS_DENIED');
      const page = await readOutlineTypes(query.q, query.offset, controller.signal);
      if (controller.signal.aborted) return;
      setItems(page.items); setTotal(page.total); setBlocked(false);
    } catch (failure) {
      if (!controller.signal.aborted) {
        setItems([]); setTotal(0);
        setError(failure instanceof OutlineTypeClientError ? failure.message : '업무 타입 목록을 조회하지 못했습니다.');
        if (!(failure instanceof OutlineTypeClientError) || [401, 403, 503].includes(failure.status)) {
          setBlocked(true); setSelected(null); setForm(empty); setNotice(''); void refreshAccess();
        }
      }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [query, refreshAccess]);
  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => { if (!disposed) void load(); });
    const focus = () => { void load(); };
    window.addEventListener('focus', focus);
    return () => { disposed = true; readRequest.current?.abort(); window.removeEventListener('focus', focus); };
  }, [load]);
  useEffect(() => () => { writeRequest.current?.abort(); }, []);
  const canWrite = !!access?.canManage && access.writeEnabled && !blocked;
  async function change(id: string | null, body: object, message: string) {
    if (!canWrite || busy) return;
    const controller = new AbortController(); writeRequest.current = controller;
    setBusy(true); setError(''); setNotice('');
    try {
      await writeOutlineType(id, body, controller.signal);
      if (controller.signal.aborted) return;
      setNotice(message); resetEditor(); setQuery(current => ({ ...current, offset: 0 }));
      onChanged?.();
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : '타입을 저장하지 못했습니다.');
        if (failure instanceof OutlineTypeClientError && [401, 403, 503].includes(failure.status)) {
          setBlocked(true); setItems([]); setTotal(0); resetEditor(); void refreshAccess();
        }
      }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    const input = { name: form.name, description: form.description,
      sortOrder: form.sortOrder.trim() ? Number(form.sortOrder) : Number.NaN,
      ...(selected ? { expectedRevision: selected.revision } : {}) };
    void change(selected?.id ?? null, input, selected ? '타입 변경을 서버에 저장했습니다.' : '새 업무 타입을 서버에 저장했습니다.');
  }
  return <section data-testid="outline-type-manager" data-persistence="server" className="space-y-4 p-3 text-sm text-slate-800">
    <div><h2 className="text-lg font-semibold">외곽선 업무 타입 · 전역 관리</h2>
      <p className="mt-1 text-slate-600">전체 앱에서 사용하는 업무 분류입니다. 비활성화해도 기존 외곽선의 타입 참조는 유지됩니다.</p></div>
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded bg-teal-50 p-3 text-teal-900">{notice}</p>}
    {!canWrite && <p className="rounded bg-amber-50 p-3 text-amber-900">현재 타입을 변경할 수 없습니다. 관리자 권한과 서버 쓰기 승인을 확인하세요.</p>}
    <form aria-label="업무 타입 편집" onSubmit={save} className="space-y-3 rounded-lg border border-slate-200 p-3">
      <h3 className="font-semibold">{selected ? `타입 수정 · 변경 버전 ${selected.revision}` : '새 타입 등록'}</h3>
      <fieldset disabled={!canWrite || busy} className="grid gap-3 sm:grid-cols-2">
        <label>타입 이름 (1~100자)<input required maxLength={100} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label>
        <label>정렬 순서 (0~9999)<input required type="number" min={0} max={9999} step={1} value={form.sortOrder} onChange={event => setForm({ ...form, sortOrder: event.target.value })}/></label>
        <label className="sm:col-span-2">설명 (최대 500자)<textarea maxLength={500} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} className="mt-2 block min-h-20 w-full rounded-lg border border-slate-300 p-2 focus:outline-2 focus:outline-teal-700"/></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" className="min-h-11">{busy ? '저장 중…' : selected ? '변경 저장' : '타입 등록'}</Button>
          <Button type="button" variant="outline" className="min-h-11" onClick={resetEditor}>새 타입 / 선택 해제</Button></div>
      </fieldset>
    </form>
    <form aria-label="업무 타입 검색" className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); resetEditor(); setQuery({ q: search.trim(), offset: 0 }); }}>
      <label className="min-w-0 flex-1">이름 검색<input maxLength={100} value={search} onChange={event => setSearch(event.target.value)}/></label>
      <Button type="submit" variant="outline" className="min-h-11" disabled={busy || loading}>검색</Button>
      <Button type="button" variant="outline" className="min-h-11" disabled={busy || loading} onClick={() => { resetEditor(); setQuery(current => ({ ...current, offset: 0 })); }}>목록 다시 조회</Button>
    </form>
    <div aria-busy={loading}><p aria-live="polite" className="mb-2 text-slate-600">{loading ? '서버 목록 조회 중…' : `활성·비활성 포함 ${total}개`}</p>
      {!loading && items.length === 0 && !error && <p className="py-3 text-slate-500">등록된 업무 타입이 없습니다.</p>}
      <ul className="space-y-2">{items.map(item => <li key={item.id} className="rounded-lg border border-slate-200 bg-white p-3" data-type-id={item.id}>
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="min-w-0 break-all">{item.name}</strong><span>{item.active ? '활성' : '비활성'} · 변경 버전 {item.revision}</span></div>
        {item.description && <p className="mt-1 break-words text-slate-600">{item.description}</p>}
        <p className="mt-1 break-all text-xs text-slate-500">정렬 {item.sortOrder} · ID {item.id}</p>
        <div className="mt-2 flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={!canWrite || busy} aria-label={`${item.name} 수정`} onClick={() => { setSelected(item); setForm({ name: item.name, description: item.description ?? '', sortOrder: String(item.sortOrder) }); setError(''); setNotice(''); }}>수정</Button>
          <Button type="button" variant="outline" className="min-h-11" disabled={!canWrite || busy} aria-label={`${item.name} ${item.active ? '비활성화' : '복구'}`} onClick={() => void change(item.id, { expectedRevision: item.revision, active: !item.active }, item.active ? '타입을 비활성화했습니다. 기존 참조는 유지됩니다.' : '타입을 복구했습니다.')}>{item.active ? '비활성화' : '복구'}</Button></div>
      </li>)}</ul>
      <div className="mt-3 flex flex-wrap items-center gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={busy || loading || query.offset === 0} onClick={() => setQuery(current => ({ ...current, offset: Math.max(0, current.offset - 50) }))}>이전 타입</Button>
        <span>{total ? query.offset + 1 : 0}–{Math.min(query.offset + items.length, total)} / {total}</span>
        <Button type="button" variant="outline" className="min-h-11" disabled={busy || loading || query.offset + items.length >= total} onClick={() => setQuery(current => ({ ...current, offset: current.offset + 50 }))}>다음 타입</Button></div>
    </div>
  </section>;
}
