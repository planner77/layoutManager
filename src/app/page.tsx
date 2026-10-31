import Link from 'next/link';
import { redirect } from 'next/navigation';
import { resolveG7RuntimeGate } from '@/server/g7-operational/runtime-gate';
import { openG7RuntimeDb } from '@/server/g7-operational/runtime-db';
import { FolderOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CadError } from '@/domain/cad';
import { drawingListParams, drawingListUrl } from '@/domain/cad-list';
import { context } from '@/server/context';
import { ListFilters } from '@/features/cad-list/list-filters';
import { CadTable } from '@/features/cad-list/cad-table';
import { HomeSticky } from '@/features/cad-list/home-sticky';
import { MemoSearchPage } from '@/features/cad-list/memo-search-page';
import { memoSearchQuery } from '@/domain/cad-memo-search';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = resolveG7RuntimeGate();
  if (gate.state === 'ACTIVE' && gate.operationMode === 'SELF_HOSTED') {
    const db = openG7RuntimeDb(gate, true);
    try {
      if (Number(db.prepare('SELECT COUNT(*) AS n FROM "User"').get()?.n) === 0)
        redirect('/g7-runtime/setup');
    } finally { db.close(); }
  }
  const params = new URLSearchParams();
  for (const [key, values] of Object.entries(await searchParams)) for (const value of Array.isArray(values) ? values : values === undefined ? [] : [values]) params.append(key, value);
  if(params.has('target')){
    let memoQuery;
    try{memoQuery=memoSearchQuery(params);}
    catch(error){
      if(!(error instanceof CadError))throw error;
      return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <p>{error.message}</p><Link className="mt-3 inline-block underline" href="/?target=memos">메모 검색 초기화</Link>
      </div>;
    }
    return <MemoSearchPage query={memoQuery}/>;
  }
  let scoped;
  try { scoped = drawingListParams(params); }
  catch(error) { if (!(error instanceof CadError)) throw error; return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-6"><p>{error.message}</p><Link className="mt-3 inline-block underline" href="/">검색 조건 초기화</Link></div>; }
  const { query, mode } = scoped;
  const service = context().list;
  const [result, options] = await Promise.all([service.search(scoped.params), service.options()]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const filtered = Boolean(query.filename || query.description || query.businessUnit || query.product || query.site || query.building || query.floor || query.format);
  return <HomeSticky><section>
    <div className="home-sticky-panel">
    <div className="home-title-row"><div><h1 className="text-xl font-bold">CAD 도면 목록</h1></div><div className="flex flex-wrap items-center gap-2"><Button asChild variant="outline"><Link href="/masters">위치별 버전 관리</Link></Button><Button asChild><Link href="/cad/upload"><Plus size={17}/>파일 등록</Link></Button></div></div>
    <div className="mb-2 text-right text-sm"><Link className="inline-flex rounded border border-teal-600 bg-white px-3 py-1.5 font-semibold text-teal-800 hover:bg-teal-50" href="/?target=memos">메모 검색 (전체 도면)</Link></div>
    <ListFilters key={JSON.stringify({query,mode})} query={query} options={options} mode={mode}/>
    <div className="mb-3 flex items-center justify-between text-sm"><p className="text-slate-500">{filtered ? '검색 결과' : '등록된 도면'} <strong className="ml-1 text-slate-800">{result.total.toLocaleString('ko-KR')}개</strong></p><p className="text-xs text-slate-400">등록일 최신순 · {mode === 'current' ? '현재 버전 도면' : '전체 버전 도면'}</p></div>
    </div>
    {result.items.length ? <CadTable items={result.items} manageCurrent/> : <div className="rounded-xl border border-slate-200 bg-white p-14 text-center"><FolderOpen className="mx-auto mb-4 text-slate-300" size={42}/><h2 className="font-semibold">{result.total > 0 ? '이 페이지에 도면이 없습니다.' : filtered ? (mode === 'current' ? '검색 조건에 맞는 현재 도면이 없습니다.' : '검색 조건에 맞는 도면이 없습니다.') : (mode === 'current' ? '현재 지정된 도면이 없습니다.' : '등록된 도면이 없습니다.')}</h2><p className="mt-2 text-sm text-slate-500">{filtered || result.total > 0 ? '검색 조건이나 페이지를 변경해주세요.' : (mode === 'current' ? '전체 버전 표시로 전환하거나 Current를 지정해주세요.' : '새 도면을 등록하거나 위치별 버전 관리를 확인해주세요.')}</p><Button variant="outline" asChild className="mt-5"><Link href={filtered || result.total > 0 ? '/' : '/masters'}>{filtered || result.total > 0 ? '검색 초기화' : '위치별 버전 관리'}</Link></Button></div>}
    <nav aria-label="목록 페이지" className="mt-5 flex items-center justify-end gap-3 text-sm"><span className="mr-2 text-slate-500">{result.page} / {pages} 페이지</span>{result.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={drawingListUrl(query, result.page - 1, mode)}>이전</Link></Button> : <Button variant="outline" size="sm" disabled>이전</Button>}{result.page < pages ? <Button variant="outline" size="sm" asChild><Link href={drawingListUrl(query, result.page + 1, mode)}>다음</Link></Button> : <Button variant="outline" size="sm" disabled>다음</Button>}</nav>
  </section></HomeSticky>;
}
