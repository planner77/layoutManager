'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type CadListQuery, type DrawingListMode } from '@/domain/cad-list';

type Options = Record<'businessUnit' | 'product' | 'site' | 'building' | 'floor', string[]>;
export function ListFilters({ query, options, mode }: { query: CadListQuery; options: Options; mode: DrawingListMode }) {
  const advanced = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px), (max-height: 650px)');
    const update = () => { if (advanced.current) advanced.current.open = !media.matches; };
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return <div className="home-filters rounded-lg border border-slate-200 bg-white p-3">
    <form action="/" method="get" aria-label="도면 검색">
      {mode === "all" && <input type="hidden" name="versions" value="all"/>}
    <div className="mb-2 flex flex-wrap items-end gap-2">
      <label className="grow">파일명<input name="filename" defaultValue={query.filename} placeholder="파일명으로 검색" maxLength={255}/></label>
      <label className="grow">도면 설명<input name="description" defaultValue={query.description} placeholder="설명으로 검색" maxLength={2000}/></label>
      <Button type="submit"><Search size={16}/>검색</Button><Button variant="outline" asChild><Link href="/">초기화</Link></Button>
    </div>
    <details ref={advanced} open className="home-advanced"><summary>추가 필터</summary><div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
      {([['businessUnit','사업부'],['product','제품'],['site','사업장 / 법인'],['building','동'],['floor','층']] as const).map(([key,label]) => {
        const values = query[key] && !options[key].includes(query[key]) ? [...options[key], query[key]] : options[key];
        return <label key={key}>{label}<select name={key} defaultValue={query[key]}><option value="">전체</option>{values.map(value => <option key={value} value={value}>{value}</option>)}</select></label>;
      })}
      <label>파일 형식<select name="format" defaultValue={query.format}><option value="">전체</option><option value="DXF">DXF</option><option value="DWG">DWG</option></select></label>
      <label>페이지당 표시<select name="pageSize" defaultValue={query.pageSize}>{[...new Set([25,50,100,query.pageSize])].sort((a,b)=>a-b).map(size=><option key={size} value={size}>{size}개</option>)}</select></label>
    </div></details>
    </form>
    <form action="/" method="get" aria-label="버전 표시" className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
      {Object.entries(query).filter(([key, value]) => key !== "current" && key !== "page" && value !== "").map(([key, value]) =>
        <input key={key} type="hidden" name={key} value={String(value)}/>
      )}
      {mode === "current" && <input type="hidden" name="versions" value="all"/>}
      <Button type="submit" size="sm" variant={mode === "current" ? "default" : "outline"} aria-pressed={mode === "current"}>현재 버전만 표시</Button>
      <span className="text-xs text-slate-500">{mode === "current" ? "ON · 현재 지정된 버전만 표시" : "OFF · 현재 및 이전 버전 모두 표시·검색"}</span>
    </form>
  </div>;
}
