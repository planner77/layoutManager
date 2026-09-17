import Link from 'next/link';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { currentOnlyToggleUrl, type CadListQuery } from '@/domain/cad-list';
import { CurrentVersionToggle } from './current-version-toggle';

type Options = Record<'businessUnit' | 'site' | 'building' | 'floor', string[]>;
export function ListFilters({ query, options }: { query: CadListQuery; options: Options }) {
  return <form action="/" method="get" className="mb-6 rounded-xl border border-slate-200 bg-white p-5" aria-label="도면 검색">
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <label className="grow">파일명<input name="filename" defaultValue={query.filename} placeholder="파일명으로 검색" maxLength={255}/></label>
      <label className="grow">도면 설명<input name="description" defaultValue={query.description} placeholder="설명으로 검색" maxLength={2000}/></label>
      <CurrentVersionToggle active={query.current === 'true'} href={currentOnlyToggleUrl(query)}/>
      <Button type="submit"><Search size={16}/>검색</Button><Button variant="outline" asChild><Link href="/">초기화</Link></Button>
    </div>
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
      {([['businessUnit','사업부'],['site','사업장'],['building','동'],['floor','층']] as const).map(([key,label]) => {
        const values = query[key] && !options[key].includes(query[key]) ? [...options[key], query[key]] : options[key];
        return <label key={key}>{label}<select name={key} defaultValue={query[key]}><option value="">전체</option>{values.map(value => <option key={value} value={value}>{value}</option>)}</select></label>;
      })}
      <label>파일 형식<select name="format" defaultValue={query.format}><option value="">전체</option><option value="DXF">DXF</option><option value="DWG">DWG</option></select></label>
      <label>페이지당 표시<select name="pageSize" defaultValue={query.pageSize}>{[...new Set([25,50,100,query.pageSize])].sort((a,b)=>a-b).map(size=><option key={size} value={size}>{size}개</option>)}</select></label>
    </div>
  </form>;
}
