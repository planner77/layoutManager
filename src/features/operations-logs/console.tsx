'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import type { LogEntryDto as LogEntry, OperationLogsResult as LogPage } from '@/domain/operations-logs';

type Filters = Record<'from' | 'to' | 'level' | 'event' | 'operation' | 'component' | 'source' | 'outcome' | 'requestId' | 'jobId' | 'errorCode', string>;
const tokenFields = [['event', '이벤트'], ['operation', '작업'], ['component', '컴포넌트'],
  ['requestId', '요청 ID'], ['jobId', '작업 ID'], ['errorCode', '오류 코드']] as const;
function localDate(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}
function initialFilters(): Filters {
  const now = new Date();
  return { from: localDate(new Date(now.getTime() - 3_600_000)), to: localDate(now),
    level: '', event: '', operation: '', component: '', source: '', outcome: '', requestId: '', jobId: '', errorCode: '' };
}
function params(filters: Filters) {
  const query = new URLSearchParams({ limit: '50' });
  for (const [key, value] of Object.entries(filters)) {
    if (!value.trim()) continue;
    if (key === 'from' || key === 'to') {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) throw new Error('INVALID_QUERY');
      query.set(key, date.toISOString());
    } else query.set(key, value.trim());
  }
  return query;
}
const errors: Record<string, string> = {
  UNAUTHENTICATED: '로그인이 필요하거나 세션이 만료되었습니다.',
  ACCESS_DENIED: '서버 로그 조회 권한이 없습니다.',
  G7_RUNTIME_BLOCKED: '운영 인증을 사용할 수 없습니다.',
  LOGS_UNAVAILABLE: '로그 저장소를 조회하지 못했습니다. 잠시 후 다시 검색하세요.',
  LOG_STORE_UNAVAILABLE: '로그 저장소를 조회하지 못했습니다. 잠시 후 다시 검색하세요.',
  LOG_CURSOR_EXPIRED: '페이지가 만료되었거나 로그가 순환 삭제되었습니다. 첫 페이지에서 다시 검색하세요.',
  CURSOR_EXPIRED: '페이지가 만료되었거나 로그가 순환 삭제되었습니다. 첫 페이지에서 다시 검색하세요.',
  LOG_RATE_LIMITED: '조회가 많습니다. 잠시 후 다시 검색하세요.',
  INVALID_QUERY: '기간과 검색 조건을 확인하세요. 종료 시각은 시작 시각 이후여야 합니다.',
  BAD_INPUT: '기간과 검색 조건을 확인하세요.',
  INVALID_LOG_QUERY: '기간과 검색 조건을 확인하세요. 조회 기간은 최대 24시간입니다.',
  G7_RUNTIME_UNAVAILABLE: '운영 인증을 사용할 수 없습니다.',
  LOG_QUERY_UNAVAILABLE: '로그 저장소를 조회하지 못했습니다. 잠시 후 다시 검색하세요.',
};
async function queryPage(query: URLSearchParams, signal: AbortSignal): Promise<LogPage> {
  const response = await fetch('/api/operations/logs?' + query, {
    credentials: 'same-origin', cache: 'no-store', signal,
  });
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 410) throw new Error(errors.CURSOR_EXPIRED);
    if (response.status === 401) throw new Error(errors.UNAUTHENTICATED);
    if (response.status === 403) throw new Error(errors.ACCESS_DENIED);
    if (response.status === 429) throw new Error(errors.LOG_RATE_LIMITED);
    throw new Error(errors[String(body?.error?.code)] ?? '요청을 처리하지 못했습니다. 검색 조건과 운영 상태를 확인하세요.');
  }
  if (!Array.isArray(body.items) || body.sourceCoverage !== 'app-structured-only' ||
    !['ok', 'disabled', 'partial'].includes(body.status)) throw new Error('로그 응답을 확인하지 못했습니다. 다시 검색하세요.');
  return body;
}
function Notice({ value }: { value: LogPage | null }) {
  if (!value) return null;
  if (value.status === 'disabled') return <p role="status" className="rounded-lg bg-slate-100 p-3">구조화 로그 보관이 비활성화되어 있습니다. 운영자가 서버 설정을 확인해야 합니다.</p>;
  if (value.status === 'partial' || value.scanTruncated || value.skippedLines > 0) return <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">일부 로그만 조회했습니다. 읽기 상한·순환 삭제·손상된 행으로 누락이 있을 수 있습니다. 기간이나 조건을 좁혀 다시 검색하세요. 제외된 행: {value.skippedLines}개.</p>;
  return null;
}
function Clock({ value }: { value: string }) {
  const date = new Date(value);
  return <time dateTime={value} title={value}>{Number.isFinite(date.getTime()) ? date.toLocaleString('ko-KR') : '시각 확인 불가'}<span className="block text-xs text-slate-500">UTC {value}</span></time>;
}
function Severity({ value }: { value: string }) {
  const style = value === 'error' ? 'bg-red-50 text-red-800' : value === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-slate-100 text-slate-700';
  return <span className={'rounded px-2 py-1 text-xs font-semibold ' + style}>{value.toUpperCase()}</span>;
}
function safeDetails(entry: LogEntry) {
  return Object.entries({ timestamp: entry.timestamp, level: entry.level, event: entry.event,
    source: entry.source, component: entry.component, operation: entry.operation,
    outcome: entry.outcome, elapsedMs: entry.elapsedMs, errorCode: entry.errorCode,
    httpStatus: entry.httpStatus, appVersion: entry.appVersion, stage: entry.stage,
    requestId: entry.requestId, jobId: entry.jobId }).filter(([, value]) => value !== undefined);
}

export function OperationsLogsConsole() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [page, setPage] = useState<LogPage | null>(null);
  const [rows, setRows] = useState<LogEntry[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [timeline, setTimeline] = useState<LogPage | null>(null);
  const [timelineRows, setTimelineRows] = useState<LogEntry[]>([]);
  const [timelineError, setTimelineError] = useState('');
  const [timelineBusy, setTimelineBusy] = useState(false);
  const [correlation, setCorrelation] = useState<{ kind: 'requestId' | 'jobId'; id: string } | null>(null);
  const [copied, setCopied] = useState('');
  const listRequest = useRef<AbortController | null>(null);
  const timelineRequest = useRef<AbortController | null>(null);
  const applied = useRef<URLSearchParams | null>(null);
  const timelineQuery = useRef<URLSearchParams | null>(null);
  const clearTimeline = useCallback(() => {
    timelineRequest.current?.abort(); setTimelineBusy(false); setTimeline(null);
    setTimelineRows([]); setTimelineError(''); setCorrelation(null); setSelected(null); setCopied('');
  }, []);
  const load = useCallback(async (query: URLSearchParams, append = false) => {
    listRequest.current?.abort();
    const controller = new AbortController(); listRequest.current = controller;
    setBusy(true); setError('');
    if (!append) { setRows([]); setPage(null); clearTimeline(); }
    try {
      const result = await queryPage(query, controller.signal);
      if (controller.signal.aborted) return;
      setPage(result); setRows(prior => append ? [...prior, ...result.items] : result.items);
    } catch (failure) {
      if (!controller.signal.aborted) {
        // Discard any previously authorized data after errors/revocation.
        setRows([]); setPage(null); clearTimeline();
        setError(failure instanceof Error ? failure.message : '로그 조회에 실패했습니다.');
      }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }, [clearTimeline]);
  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      const query = params(initialFilters()); applied.current = query; void load(query);
    });
    return () => { disposed = true; listRequest.current?.abort(); timelineRequest.current?.abort(); };
  }, [load]);
  useEffect(() => {
    let current: AbortController | undefined;
    const check = async () => {
      current?.abort(); const controller = new AbortController(); current = controller;
      try {
        const response = await fetch('/api/operations/logs/access', {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        });
        if (response.ok || controller.signal.aborted) return;
        throw new Error('ACCESS_RECHECK_FAILED');
      } catch {
        if (controller.signal.aborted) return;
        listRequest.current?.abort(); setBusy(false); setRows([]); setPage(null); clearTimeline();
        setError('로그 조회 권한과 세션을 다시 확인하세요. 계정 / 로그인에서 확인할 수 있습니다.');
      }
    };
    window.addEventListener('focus', check);
    return () => { current?.abort(); window.removeEventListener('focus', check); };
  }, [clearTimeline]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const query = params(filters); applied.current = query; await load(query);
    } catch { setError(errors.INVALID_QUERY); }
  }
  async function loadTimeline(query: URLSearchParams, append = false) {
    timelineRequest.current?.abort();
    const controller = new AbortController(); timelineRequest.current = controller;
    setTimelineBusy(true); setTimelineError('');
    if (!append) { setTimeline(null); setTimelineRows([]); }
    try {
      const result = await queryPage(query, controller.signal);
      if (controller.signal.aborted) return;
      setTimeline(result); setTimelineRows(prior => (append ? [...prior, ...result.items] : result.items)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.logId.localeCompare(b.logId)));
    } catch (failure) {
      if (!controller.signal.aborted) {
        setRows([]); setPage(null); clearTimeline();
        setError(failure instanceof Error ? failure.message : '타임라인 조회에 실패했습니다.');
      }
    } finally { if (!controller.signal.aborted) setTimelineBusy(false); }
  }
  function correlate(kind: 'requestId' | 'jobId', id: string) {
    const query = new URLSearchParams({ limit: '50', [kind]: id });
    for (const key of ['from', 'to']) {
      const value = applied.current?.get(key); if (value) query.set(key, value);
    }
    timelineQuery.current = query; setCorrelation({ kind, id }); void loadTimeline(query);
  }
  async function copyId(value: string) {
    try { await navigator.clipboard.writeText(value); setCopied('ID를 복사했습니다.'); }
    catch { setCopied('복사 권한이 없습니다. 표시된 ID를 직접 선택해 복사하세요.'); }
  }
  return <section className="space-y-5 text-sm" data-testid="operations-log-console">
    <div><h1 className="text-2xl font-semibold tracking-tight">서버 로그</h1>
      <p className="mt-2 text-slate-600">앱 구조화 로그만 표시 · app / maintenance · 현지 시각과 UTC를 함께 표시합니다.</p>
      <p className="mt-1 text-slate-500">Next.js·컨테이너·Nginx 원시 로그는 운영 절차의 docker compose logs로 확인하세요. 자동 갱신과 로그 파일 내보내기는 제공하지 않습니다.</p></div>
    <form onSubmit={submit} aria-label="서버 로그 검색" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label>시작 시각 (현지)<input required step="1" type="datetime-local" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })}/></label>
        <label>종료 시각 (현지)<input required step="1" type="datetime-local" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })}/></label>
        <label>레벨<select value={filters.level} onChange={event => setFilters({ ...filters, level: event.target.value })}><option value="">전체</option>{['debug', 'info', 'warn', 'error'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>결과<select value={filters.outcome} onChange={event => setFilters({ ...filters, outcome: event.target.value })}><option value="">전체</option>{['started', 'success', 'warning', 'failure'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>출처<select value={filters.source} onChange={event => setFilters({ ...filters, source: event.target.value })}><option value="">전체</option><option value="app">app</option><option value="maintenance">maintenance</option></select></label>
        {tokenFields.map(([key, label]) => <label key={key}>{label}<input value={filters[key]} maxLength={128} autoComplete="off" onChange={event => setFilters({ ...filters, [key]: event.target.value })}/></label>)}
      </div>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy} className="min-h-11">{busy ? '조회 중…' : '검색 적용 / 첫 페이지'}</Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => { const next = initialFilters(); setFilters(next); const query = params(next); applied.current = query; void load(query); }}>비우기</Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => { if (applied.current) void load(new URLSearchParams(applied.current)); }}>현재 조건 새로 조회</Button></div>
    </form>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>}
    <Notice value={page}/>
    <div aria-busy={busy} className="rounded-xl border border-slate-200 bg-white p-4">
      <p aria-live="polite" className="mb-3 text-slate-600">{busy ? '로그를 조회하고 있습니다.' : `조회된 이벤트 ${rows.length}개 · 최신순`}</p>
      {page?.status !== 'disabled' && !busy && page && rows.length === 0 && <p className="py-6 text-slate-500">검색 조건에 맞는 로그가 없습니다.</p>}
      {rows.length > 0 && <div role="region" aria-label="서버 로그 목록 가로 스크롤" tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-teal-700"><table className="w-full min-w-[960px] text-left"><caption className="sr-only">서버 로그 최신순 목록</caption><thead className="border-b text-slate-500"><tr>{['시각', '레벨', '이벤트 / 작업', '결과 / 지연', '출처 / 컴포넌트', '상관 ID', '상세'].map(label => <th key={label} scope="col" className="px-2 py-3">{label}</th>)}</tr></thead><tbody>{rows.map(entry => <tr key={entry.logId} className="border-b border-slate-100 align-top">
        <td className="min-w-44 px-2 py-3"><Clock value={entry.timestamp}/></td><td className="px-2 py-3"><Severity value={entry.level}/></td>
        <td className="max-w-64 break-all px-2 py-3">{entry.event}<span className="block text-slate-500">{entry.operation}</span></td>
        <td className="px-2 py-3">{entry.outcome ?? '—'}<span className="block text-slate-500">{entry.httpStatus ?? '—'} / {entry.elapsedMs === undefined ? '—' : `${entry.elapsedMs} ms`}</span></td>
        <td className="max-w-48 break-all px-2 py-3">{entry.source}<span className="block text-slate-500">{entry.component}</span></td>
        <td className="max-w-56 break-all px-2 py-3">{(['requestId', 'jobId'] as const).map(kind => entry[kind] && <button key={kind} type="button" className="block min-h-11 text-left text-teal-800 underline" title={entry[kind]} onClick={() => correlate(kind, entry[kind]!)}>{kind}: {entry[kind]!.slice(0, 8)}…</button>)}</td>
        <td className="px-2 py-3"><Button variant="outline" className="min-h-11" aria-label={`${entry.event} 상세`} onClick={() => { setSelected(entry); setCopied(''); }}>상세</Button></td>
      </tr>)}</tbody></table></div>}
      {page?.nextCursor && <Button variant="outline" disabled={busy} className="mt-4 min-h-11" onClick={() => { const query = new URLSearchParams(applied.current!); query.set('cursor', page.nextCursor!); void load(query, true); }}>더 보기</Button>}
    </div>
    {selected && <section aria-label="이벤트 상세" className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="text-lg font-semibold">이벤트 상세</h2><dl className="mt-3 grid gap-2 sm:grid-cols-2">{safeDetails(selected).map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-xs text-slate-500">{key}</dt><dd className="select-text break-all">{String(value)}</dd></div>)}</dl><div className="mt-3 flex flex-wrap gap-2">{(['requestId', 'jobId'] as const).map(kind => selected[kind] && <Button key={kind} variant="outline" className="min-h-11" onClick={() => void copyId(selected[kind]!)}>{kind} 복사</Button>)}<Button variant="outline" className="min-h-11" onClick={() => setSelected(null)}>상세 닫기</Button></div><p role="status" className="mt-2">{copied}</p></section>}
    {correlation && <section aria-label="요청 작업 타임라인" aria-busy={timelineBusy} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><h2 className="text-lg font-semibold">요청 / 작업 타임라인</h2><p className="break-all">{correlation.kind}: {correlation.id}</p><p className="text-slate-500">적용한 기간 안에서 시간순으로 표시합니다. 추가 페이지가 있으면 이전 단계가 더 있을 수 있습니다.</p>
      {timelineError && <p role="alert">{timelineError}</p>}<Notice value={timeline}/>{timelineBusy && <p role="status">타임라인 조회 중…</p>}
      <ol className="space-y-3 border-l-2 border-teal-200 pl-4">{timelineRows.map(entry => <li key={entry.logId} className="space-y-1 break-all"><Clock value={entry.timestamp}/><p><Severity value={entry.level}/> {entry.event} · {entry.stage ?? entry.operation} · {entry.outcome ?? '—'} {entry.errorCode ? `· ${entry.errorCode}` : ''}</p></li>)}</ol>
      {timeline && !timelineBusy && timelineRows.length === 0 && <p>같은 ID의 이벤트가 없습니다.</p>}
      <div className="flex flex-wrap gap-2">{timeline?.nextCursor && <Button variant="outline" className="min-h-11" disabled={timelineBusy} onClick={() => { const query = new URLSearchParams(timelineQuery.current!); query.set('cursor', timeline.nextCursor!); void loadTimeline(query, true); }}>타임라인 더 보기</Button>}<Button variant="outline" className="min-h-11" onClick={clearTimeline}>타임라인 닫기</Button></div>
    </section>}
  </section>;
}
