import Link from 'next/link';
import { FolderOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CadError } from '@/domain/cad';
import { listQuery, listUrl } from '@/domain/cad-list';
import { context } from '@/server/context';
import { ListFilters } from '@/features/cad-list/list-filters';
import { CadTable } from '@/features/cad-list/cad-table';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, values] of Object.entries(await searchParams)) for (const value of Array.isArray(values) ? values : values === undefined ? [] : [values]) params.append(key, value);
  let query;
  try { query = listQuery(params); }
  catch(error) { if (!(error instanceof CadError)) throw error; return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-6"><p>{error.message}</p><Link className="mt-3 inline-block underline" href="/">검색 조건 초기화</Link></div>; }
  const service = context().list;
  const [result, options] = await Promise.all([service.search(params), service.options()]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const filtered = Boolean(query.filename || query.description || query.businessUnit || query.site || query.building || query.floor || query.format || query.current);
  return <section>
    <div className="mb-7 flex items-center justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.14em] text-teal-700">Drawing Library</p><h1 className="text-2xl font-bold">CAD 도면 목록</h1><p className="mt-2 text-sm text-slate-500">사업장과 설비 위치별 도면을 찾고 버전을 관리합니다.</p></div><Button asChild><Link href="/cad/upload"><Plus size={17}/>파일 등록</Link></Button></div>
    <ListFilters query={query} options={options}/>
    <div className="mb-3 flex items-center justify-between text-sm"><p className="text-slate-500">{filtered ? '검색 결과' : '등록된 도면'} <strong className="ml-1 text-slate-800">{result.total.toLocaleString('ko-KR')}개</strong></p><p className="text-xs text-slate-400">등록일 최신순 · 모든 버전</p></div>
    {result.items.length ? <CadTable items={result.items} manageCurrent/> : <div className="rounded-xl border border-slate-200 bg-white p-14 text-center"><FolderOpen className="mx-auto mb-4 text-slate-300" size={42}/><h2 className="font-semibold">{result.total > 0 ? '이 페이지에 도면이 없습니다.' : filtered ? '검색 조건에 맞는 도면이 없습니다.' : '등록된 도면이 없습니다.'}</h2><p className="mt-2 text-sm text-slate-500">{filtered || result.total > 0 ? '검색 조건이나 페이지를 변경해주세요.' : '첫 도면을 등록하면 이곳에서 확인할 수 있습니다.'}</p><Button variant="outline" asChild className="mt-5"><Link href={filtered || result.total > 0 ? '/' : '/cad/upload'}>{filtered || result.total > 0 ? '전체 목록 보기' : '첫 도면 등록'}</Link></Button></div>}
    <nav aria-label="목록 페이지" className="mt-5 flex items-center justify-end gap-3 text-sm"><span className="mr-2 text-slate-500">{result.page} / {pages} 페이지</span>{result.page > 1 ? <Button variant="outline" size="sm" asChild><Link href={listUrl(query, result.page - 1)}>이전</Link></Button> : <Button variant="outline" size="sm" disabled>이전</Button>}{result.page < pages ? <Button variant="outline" size="sm" asChild><Link href={listUrl(query, result.page + 1)}>다음</Link></Button> : <Button variant="outline" size="sm" disabled>다음</Button>}</nav>
  </section>;
}
