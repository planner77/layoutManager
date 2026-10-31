
'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { HomeSticky } from './home-sticky';
import { memoSearchParams,memoSearchUrl,type MemoSearchQuery,type MemoSearchResult } from '@/domain/cad-memo-search';
import { cadMemoViewerPath } from '@/viewers/core/link';

type State={status:'idle'|'loading'|'success'|'error';data?:MemoSearchResult;error?:string};
const textClass='w-full rounded border border-slate-400 bg-white px-2 py-1.5 text-sm';
export function MemoSearchPage({query}:{query:MemoSearchQuery}){
  const [state,setState]=useState<State>({status:'idle'});
  const serialized=memoSearchParams(query).toString();
  useEffect(()=>{
    if(!query.q){
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({status:'idle'});
      return;
    }
    const controller=new AbortController();
    setState({status:'loading'});
    void fetch('/api/cad-memos/search?'+serialized,{credentials:'same-origin',
      cache:'no-store',signal:controller.signal}).then(async response=>{
      const body=await response.json() as MemoSearchResult&{error?:{message?:string}};
      if(!response.ok)throw new Error(body.error?.message??('검색 서버 오류 '+response.status));
      if(!Array.isArray(body.items)||!Number.isSafeInteger(body.total))throw new Error('검색 결과 형식이 올바르지 않습니다.');
      if(!controller.signal.aborted)setState({status:'success',data:body});
    }).catch(error=>{
      if(!controller.signal.aborted)setState({status:'error',
        error:error instanceof Error?error.message:'검색 실패'});
    });
    return ()=>controller.abort();
  },[query.q,serialized]);
  const result=state.data;
  const pages=result?Math.max(1,Math.ceil(result.total/result.pageSize)):1;
  const advanced=Boolean(query.businessUnit||query.product||query.site||query.building||
    query.floor||query.group||query.author||query.completion!=='all'||query.dueFrom||query.dueTo);
  return <HomeSticky><section data-testid="cad-memo-global-search" className="text-slate-900">
    <div className="home-sticky-panel">
      <div className="home-title-row">
        <h1 className="text-xl font-bold">전체 도면 메모 검색</h1>
        <div className="flex flex-wrap gap-2"><Link className="rounded border border-slate-400 bg-white px-3 py-2 text-sm hover:bg-slate-50" href="/?target=memos">검색 초기화</Link><Link className="rounded border border-slate-400 bg-white px-3 py-2 text-sm hover:bg-slate-50" href="/">도면 목록으로</Link></div>
      </div>
      <p className="mb-2 text-xs text-slate-600">영속 메모만 검색 · 로그인·Reader 이상 및 Site 권한 필요 · 기본은 현재 도면 Version만 표시</p>
      <form action="/" method="get" role="search" aria-label="전체 메모 검색" className="space-y-2 rounded border border-slate-200 bg-white p-3">
        <input type="hidden" name="target" value="memos"/>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-48 flex-1 text-sm">메모 검색어 (제목·본문·그룹)
            <input name="q" type="search" required maxLength={100} defaultValue={query.q}
              data-testid="memo-search-query" className={textClass} placeholder="메모 제목 또는 내용"/>
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="includePast" value="true" defaultChecked={query.includePast}/>
            이전 버전 포함
          </label>
          <label className="text-sm">페이지 크기
            <select name="pageSize" className={textClass} defaultValue={String(query.pageSize)}>
              {[25,50,100].map(size=><option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <button type="submit" data-testid="memo-search-submit" className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white">검색</button>
        </div>
        <details open={advanced} className="rounded border border-slate-200 p-2 text-sm">
          <summary className="cursor-pointer font-semibold">위치·그룹·작성자·완료·마감일 필터</summary>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
            {([
              ['businessUnit','사업부'],['product','제품'],['site','사업장'],
              ['building','동'],['floor','층'],['group','메모 그룹'],['author','작성자 계정/ID']
            ] as const).map(([name,label])=><label key={name}>{label}
              <input name={name} defaultValue={query[name]} maxLength={100}
                className={textClass} placeholder={label}/>
            </label>)}
            <label>완료 상태
              <select name="completion" className={textClass} defaultValue={query.completion}>
                <option value="all">전체</option>
                <option value="unmanaged">미관리</option>
                <option value="progress">진행 중</option>
                <option value="completed">완료</option>
              </select>
            </label>
            <label>마감일 시작
              <input name="dueFrom" type="date" className={textClass} defaultValue={query.dueFrom}/>
            </label>
            <label>마감일 종료
              <input name="dueTo" type="date" className={textClass} defaultValue={query.dueTo}/>
            </label>
          </div>
        </details>
      </form>
      {state.status==='success'&&result&&<p data-testid="memo-search-count" className="mt-2 text-sm text-slate-600">
        검색 결과 <strong className="text-slate-900">{result.total.toLocaleString('ko-KR')}건</strong>
        {' · '} {query.includePast?'전체 버전':'현재 버전만'}
        {!result.featuresAvailable&&' · 그룹·일정 저장 스키마 미지원'}
      </p>}
    </div>
    {state.status==='idle'&&<p className="rounded bg-slate-50 p-8 text-center text-slate-600">검색어를 입력하면 권한이 있는 영속 메모만 조회합니다.</p>}
    {state.status==='loading'&&<p role="status" data-testid="memo-search-loading" className="p-5 text-slate-600">메모 검색 중…</p>}
    {state.status==='error'&&<p role="alert" data-testid="memo-search-error" className="rounded border border-red-300 bg-red-50 p-4 text-red-800">
      {state.error} · 로그인/권한과 시스템 상태를 확인하세요.
    </p>}
    {state.status==='success'&&result&&<>
      {result.items.length===0?<p data-testid="memo-search-empty" className="rounded bg-slate-50 p-8 text-center text-slate-600">일치하는 메모가 없습니다. 검색어와 버전·필터 조건을 확인하세요.</p>:
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] table-auto text-left text-xs">
            <thead className="bg-slate-100"><tr>
              <th className="p-2">메모</th><th className="p-2">도면 / Version</th>
              <th className="p-2">위치</th><th className="p-2">상태 / 작성자</th><th className="p-2">이동</th>
            </tr></thead>
            <tbody>{result.items.map(item=><tr key={item.memoId} className="border-t border-slate-200 align-top">
              <td className="max-w-64 p-2"><strong className="break-words">{item.title}</strong>
                <p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{item.snippet}</p>
                {item.groupName&&<p className="mt-1 text-slate-500">그룹: {item.groupName}</p>}
              </td>
              <td className="p-2">{item.displayName}<p className="text-slate-600">V{item.version} · {item.isCurrent?'현재':'이전'} 버전</p></td>
              <td className="p-2">{item.businessUnit} / {item.product} / {item.site}<p>{item.building} / {item.floor}</p></td>
              <td className="p-2">{item.completionEnabled?(item.isCompleted?'완료':'진행 중'):'미관리'}
                {!item.visible&&<p className="text-amber-700">숨김 (링크에서만 일시 강조)</p>}
                {item.dueDate&&<p>마감: {item.dueDate}</p>}
                <p className="text-slate-500">작성자: {item.authorName||item.createdById}</p>
                <p className="text-slate-500">수정: {new Date(item.updatedAt).toLocaleString("ko-KR")}</p>
              </td>
              <td className="p-2"><Link
                href={cadMemoViewerPath(item.versionId,item.memoId)}
                data-testid="memo-search-open" rel="noreferrer"
                className="inline-flex whitespace-nowrap rounded border border-teal-600 px-2 py-1.5 text-teal-800 hover:bg-teal-50">메모 위치로 이동</Link></td>
            </tr>)}</tbody>
          </table>
        </div>}
      <nav aria-label="메모 검색 페이지" className="mt-4 flex items-center justify-end gap-3 text-sm">
        {result.page>1?<Link className="underline" href={memoSearchUrl(query,result.page-1)}>이전</Link>:<span className="text-slate-400">이전</span>}
        {result.page} / {pages} 페이지
        {result.page<pages?<Link className="underline" href={memoSearchUrl(query,result.page+1)}>다음</Link>:<span className="text-slate-400">다음</span>}
      </nav>
    </>}
  </section></HomeSticky>;
}
