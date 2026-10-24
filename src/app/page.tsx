import Link from 'next/link';
import { FolderOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CadError } from '@/domain/cad';
import { currentOnlyListParams, listUrl } from '@/domain/cad-list';
import { context } from '@/server/context';
import { ListFilters } from '@/features/cad-list/list-filters';
import { CadTable } from '@/features/cad-list/cad-table';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, values] of Object.entries(await searchParams)) for (const value of Array.isArray(values) ? values : values === undefined ? [] : [values]) params.append(key, value);
  let scoped;
  try { scoped = currentOnlyListParams(params); }
  catch(error) { if (!(error instanceof CadError)) throw error; return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-6"><p>{error.message}</p><Link className="mt-3 inline-block underline" href="/">검색 조건 초기화</Link></div>; }
  const query = scoped.query;
  const service = context().list;
  const [result, options] = await Promise.all([service.search(scoped.params), service.options()]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const filtered = Boolean(query.filename || query.description || query.businessUnit || query.product || query.site || query.building || query.floor || query.format);
  return <section>
    <div className="mb-7 flex items-center justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.14em] text-teal-700">Drawing Library</p><h1 className="text-2xl font-bold">CAD 도면 목록</h1><p className="mt-2 text-sm text-slate-500">Current로 지정된 도면만 표시합니다. 이전 버전은 위치 기준정보에서 확인할 수 있습니다.</p></div><div className="flex flex-wrap items-center gap-2"><Button asChild variant="outline"><Link href="/masters">위치별 버전 관리</Link></Button><Button asChild><Link href="/cad/upload"><Plus size={17}/>파일 등록</Link></Button></div></div>
    <ListFilters query={query} options={options}/>
    <div className="mb-3 flex items-center justify-between text-sm"><p className="text-slate-500">{filtered ? '검색 결과' : '등록된 도면'} <strong className="ml-1 text-slate-800">{result.total.toLocaleString('ko-KR')}개</strong></p><p className="text-xs text-slate-400">등록일 최신순 · 현재 버전 도면</p></div>
    {result.items.length ? <CadTable items={result.items} manageCurrent/> : <div className="rounded-xl border border-slate-200 bg-white p-14 text-center"><FolderOpen className="mx-auto mb-4 text-slate-300" size={42}/><h2 className="font-semibold">{result.total > 0 ? '이 페이지에 도면이 없습니다.' : filtered ? '검색 조건에 맞는 현재 도면이 없습니다.' : '현재 지정된 도면이 없습니다.'}</h2><p className="mt-2 text-sm text-slate-500">{filtered || result.total > 0 ? '검색 조건이나 페이지를 변경해주세요.' : '기존 버전에서 Current를 지정하거나 새 도면을 등록해주세요.'}</p><Button variant="outline" asChild className="mt-5"><Link href={filtered || result.total > 0 ? '/' : '/masters'}>{filtered || result.total > 0 ? '검색 초기화' : '위치별 버전 관리'}</Link></Button></div>}
    <nav aria-label="목록 페이지" className="mt-5 flex items-center justify-end gap-3 text-sm"><span className="mr-2 text-slate-500">{result.page} / {pages} 페이지</span>{result.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={listUrl(query, result.page - 1)}>이전</Link></Button> : <Button variant="outline" size="sm" disabled>이전</Button>}{result.page < pages ? <Button variant="outline" size="sm" asChild><Link href={listUrl(query, result.page + 1)}>다음</Link></Button> : <Button variant="outline" size="sm" disabled>다음</Button>}</nav>
  </section>;
}
