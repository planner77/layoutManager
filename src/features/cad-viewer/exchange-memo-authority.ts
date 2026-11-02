'use client';
import {MemoSession,type PersistedMemoDraft} from '@/domain/cad-memo';
import type {ExchangeScope} from '@/domain/cad-exchange';
import {assertExchangeIdentity,ExchangeAuthorityError,type ExchangeIdentity} from './exchange-authority';
import {memoRecordFingerprint} from './exchange-memo-visual';

export type ExchangeMemoServerRead=Readonly<{
  scope:ExchangeScope;identity:ExchangeIdentity;sceneRevision:number|null;rows:readonly PersistedMemoDraft[];
}>;
/** Marks stable Memo-group failures without discarding independent local groups. */
export class ExchangeMemoAuthorityError extends ExchangeAuthorityError{
  constructor(message:string){super(message,'server');}
}
const mismatch=()=>new ExchangeAuthorityError('계정·도면 또는 서버 메모가 변경됐습니다. 포함 범위를 다시 확인하세요.');
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
/** The actual GET envelope binds its actor; Session-before/after alone is insufficient. */
export function decodeExchangeMemos(value:unknown,scope:ExchangeScope,identity:ExchangeIdentity):ExchangeMemoServerRead{
  if(identity.runtime!=='ACTIVE'||!identity.actorId||!object(value)||value.actorId!==identity.actorId||value.versionId!==scope.versionId||value.sourceSha256!==scope.sourceSha256)throw mismatch();
  if(value.sceneRevision!==null&&(!Number.isSafeInteger(value.sceneRevision)||Number(value.sceneRevision)<0)||
    !Array.isArray(value.memos)||value.memos.length>100||!Array.isArray(value.groups)||value.groups.length>20||
    typeof value.featuresAvailable!=='boolean')throw new ExchangeMemoAuthorityError('서버 메모 응답 형식을 확인하지 못했습니다.');
  const session=new MemoSession(scope),ids=new Set<string>();
  try{
    for(const row of value.memos){
      if(!object(row)||typeof row.id!=='string'||ids.has(row.id)||row.versionId!==scope.versionId||row.sourceSha256!==scope.sourceSha256)throw new Error();
      ids.add(row.id);session.acceptPersisted(row as unknown as PersistedMemoDraft,scope);
    }
  }catch{throw new ExchangeMemoAuthorityError('서버 메모 형식 또는 범위가 올바르지 않습니다.');}
  return {scope:{...scope},identity:{...identity},sceneRevision:value.sceneRevision as number|null,
    rows:session.list() as PersistedMemoDraft[]};
}
export async function readExchangeMemos(scope:ExchangeScope,identity:ExchangeIdentity,signal:AbortSignal):Promise<ExchangeMemoServerRead>{
  if(identity.runtime!=='ACTIVE'||!identity.actorId)throw new ExchangeMemoAuthorityError('서버 메모는 로그인 및 해당 도면의 조회 권한이 필요합니다.');
  await assertExchangeIdentity(identity,signal);
  let data:unknown;
  try{
    const response=await fetch('/api/cad-files/'+encodeURIComponent(scope.versionId)+'/memos',{
      credentials:'same-origin',cache:'no-store',signal});
    if(!response.ok)throw new ExchangeMemoAuthorityError(response.status===401||response.status===403?
      '서버 메모를 조회할 권한이 없습니다.':'서버 메모를 조회하지 못했습니다. 다시 시도하세요.');
    data=await response.json();
  }catch(error){
    signal.throwIfAborted();await assertExchangeIdentity(identity,signal);
    if(error instanceof ExchangeMemoAuthorityError)throw error;
    throw new ExchangeMemoAuthorityError('서버 메모 응답을 확인하지 못했습니다. 다시 시도하세요.');
  }
  signal.throwIfAborted();await assertExchangeIdentity(identity,signal);
  return decodeExchangeMemos(data,scope,identity);
}
export function exchangeServerMemoFingerprint(read:ExchangeMemoServerRead,keys?:readonly string[]):string{
  if(keys&&new Set(keys).size!==keys.length)throw mismatch();
  const rows=keys?keys.map(key=>{
    const row=read.rows.find(row=>'memo-server:'+row.id===key);if(!row)throw mismatch();return row;
  }):read.rows;
  return JSON.stringify([read.identity,read.scope,read.sceneRevision,
    [...rows].sort((a,b)=>a.id.localeCompare(b.id)).map(memoRecordFingerprint)]);
}
export async function assertExchangeServerMemosUnchanged(expected:ExchangeMemoServerRead,keys:readonly string[]|undefined,signal:AbortSignal){
  const current=await readExchangeMemos(expected.scope,expected.identity,signal);
  if(exchangeServerMemoFingerprint(current,keys)!==exchangeServerMemoFingerprint(expected,keys))throw mismatch();
}
