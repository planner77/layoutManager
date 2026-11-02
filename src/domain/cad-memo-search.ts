
/** #90: allowlisted, bounded, Unicode-normalized query for authenticated cross-Version memo search. */
import { CadError } from './cad';
import { dateOnly } from './memo-schedule';

export type MemoCompletion='all'|'unmanaged'|'progress'|'completed';
export type MemoSearchQuery=Readonly<{
  q:string;includePast:boolean;businessUnit:string;product:string;site:string;
  building:string;floor:string;group:string;author:string;
  completion:MemoCompletion;dueFrom:string;dueTo:string;page:number;pageSize:25|50|100;
}>;
export type MemoSearchItem=Readonly<{
  memoId:string;versionId:string;title:string;snippet:string;displayName:string;
  version:number;isCurrent:boolean;businessUnit:string;product:string;site:string;siteKind:string;
  building:string;floor:string;createdById:string;authorName:string;updatedAt:string;
  groupName:string|null;visible:boolean;completionEnabled:boolean;isCompleted:boolean;dueDate:string|null;
}>;
export type MemoSearchResult=Readonly<{items:MemoSearchItem[];total:number;page:number;pageSize:number;featuresAvailable:boolean}>;

const allowed=new Set(['target','q','includePast','businessUnit','product','site','building','floor',
  'group','author','completion','dueFrom','dueTo','page','pageSize']);
const invalid=()=>new CadError('INVALID_MEMO_SEARCH','메모 검색 조건을 확인해주세요.');
export function memoSearchQuery(params:URLSearchParams):MemoSearchQuery{
  for(const key of params.keys())if(!allowed.has(key)||params.getAll(key).length>1)throw invalid();
  const value=(key:string,max=100)=>{
    const text=(params.get(key)??'').trim().normalize('NFC');
    if(text.length>max||/[\x00-\x1f\x7f-\x9f]/u.test(text))throw invalid();
    return text;
  };
  if(value('target',10)!=='memos')throw invalid();
  const includePast=value('includePast',5);
  if(includePast&&!['true','false'].includes(includePast))throw invalid();
  const completion=value('completion',10)||'all';
  if(!['all','unmanaged','progress','completed'].includes(completion))throw invalid();
  const integer=(key:string,fallback:number,max:number)=>{
    const raw=value(key,9);
    if(!raw)return fallback;
    if(!/^[1-9]\d*$/.test(raw)||Number(raw)>max||!Number.isSafeInteger(Number(raw)))throw invalid();
    return Number(raw);
  };
  const page=integer('page',1,1000000);
  const pageSize=integer('pageSize',25,100);
  if(![25,50,100].includes(pageSize))throw invalid();
  const date=(key:string)=>{
    const raw=value(key,10);
    if(!raw)return '';
    try{return dateOnly(raw)??'';}catch{throw invalid();}
  };
  const dueFrom=date('dueFrom'),dueTo=date('dueTo');
  if(dueFrom&&dueTo&&dueFrom>dueTo)throw invalid();
  return {q:value('q',100),includePast:includePast==='true',
    businessUnit:value('businessUnit'),product:value('product'),site:value('site'),
    building:value('building'),floor:value('floor'),group:value('group'),
    author:value('author'),completion:completion as MemoCompletion,
    dueFrom,dueTo,page,pageSize:pageSize as 25|50|100};
}
export function memoSearchParams(query:MemoSearchQuery,page=query.page):URLSearchParams{
  const params=new URLSearchParams([['target','memos']]);
  const fields:Record<string,string>={
    q:query.q,businessUnit:query.businessUnit,product:query.product,site:query.site,
    building:query.building,floor:query.floor,group:query.group,author:query.author,
    completion:query.completion==='all'?'':query.completion,
    dueFrom:query.dueFrom,dueTo:query.dueTo,
  };
  for(const [key,value] of Object.entries(fields))if(value)params.set(key,value);
  if(query.includePast)params.set('includePast','true');
  if(page>1)params.set('page',String(page));
  if(query.pageSize!==25)params.set('pageSize',String(query.pageSize));
  return params;
}
export const memoSearchUrl=(query:MemoSearchQuery,page=query.page)=>'/?'+memoSearchParams(query,page).toString();
/** Plain text only. Never write untrusted memo content using innerHTML. */
export function memoSearchSnippet(content:string,keyword:string):string{
  const matched=content.toLocaleLowerCase().indexOf(keyword.toLocaleLowerCase());
  const start=Math.max(0,matched<0?0:matched-48);
  const slice=content.slice(start,start+160).replace(/\s+/g,' ');
  return (start?'…':'')+slice+(start+160<content.length?'…':'');
}
