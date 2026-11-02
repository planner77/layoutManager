'use client';
import type {ExchangeScope} from '@/domain/cad-exchange';
import type {StoredOutlineDto} from '@/domain/typed-outline';
import {loadStoredOutlines} from './persisted-outline-client';

/** Internal continuity proof. Never pass identity or full server rows to GLTF extras. */
export type ExchangeIdentity=Readonly<{runtime:'OFF'|'BLOCKED'|'ACTIVE';actorId:string|null}>;
export type ExchangeServerRead=Readonly<{
  scope:ExchangeScope;identity:ExchangeIdentity;sceneRevision:number|null;
  rows:readonly StoredOutlineDto[];
}>;
export class ExchangeAuthorityError extends Error {
  constructor(message:string,readonly kind:'identity'|'server'='identity'){super(message);}
}
const changed=()=>new ExchangeAuthorityError('계정·도면 또는 저장된 외곽선이 변경됐습니다. 포함 범위를 다시 확인하세요.');
export function sameExchangeIdentity(a:ExchangeIdentity,b:ExchangeIdentity){
  return a.runtime===b.runtime&&a.actorId===b.actorId;
}
async function requestExchangeIdentity(signal:AbortSignal):Promise<ExchangeIdentity>{
  signal.throwIfAborted();
  const statusResponse=await fetch('/api/g7-runtime/status',{credentials:'same-origin',cache:'no-store',signal});
  if(!statusResponse.ok)throw new ExchangeAuthorityError('현재 인증 상태를 확인하지 못했습니다. 다시 시도하세요.');
  const status=await statusResponse.json() as {state?:unknown};
  signal.throwIfAborted();
  if(status.state==='OFF'||status.state==='BLOCKED')return {runtime:status.state,actorId:null};
  if(status.state!=='ACTIVE')throw new ExchangeAuthorityError('현재 인증 상태를 확인하지 못했습니다. 다시 시도하세요.');
  const response=await fetch('/api/g7-runtime/auth/session',{credentials:'same-origin',cache:'no-store',signal});
  signal.throwIfAborted();
  // Anonymous public CAD/local work remains usable even when G7 is active.
  if(response.status===401)return {runtime:'ACTIVE',actorId:null};
  if(!response.ok)throw new ExchangeAuthorityError('현재 계정을 확인하지 못했습니다. 다시 시도하세요.');
  const session=await response.json() as {actor?:{id?:unknown}};
  signal.throwIfAborted();
  if(typeof session.actor?.id!=='string'||!session.actor.id)throw new ExchangeAuthorityError('현재 계정을 확인하지 못했습니다.');
  return {runtime:'ACTIVE',actorId:session.actor.id};
}
export async function readExchangeIdentity(signal:AbortSignal):Promise<ExchangeIdentity>{
  try{return await requestExchangeIdentity(signal);}
  catch(error){
    signal.throwIfAborted();
    if(error instanceof ExchangeAuthorityError)throw error;
    throw new ExchangeAuthorityError('현재 계정을 확인하지 못했습니다. 다시 조회하세요.');
  }
}
export async function assertExchangeIdentity(expected:ExchangeIdentity,signal:AbortSignal){
  const actual=await readExchangeIdentity(signal);
  if(!sameExchangeIdentity(expected,actual))throw changed();
}
/** Protected reads are only requested for the optional server group. */
export async function readExchangeOutlines(scope:ExchangeScope,identity:ExchangeIdentity,
  signal:AbortSignal):Promise<ExchangeServerRead>{
  if(identity.runtime!=='ACTIVE'||!identity.actorId)
    throw new ExchangeAuthorityError('서버 외곽선은 로그인 및 해당 도면의 조회 권한이 필요합니다.');
  await assertExchangeIdentity(identity,signal);
  let page:Awaited<ReturnType<typeof loadStoredOutlines>>;
  try{page=await loadStoredOutlines(scope.versionId,signal);}
  catch(error){
    signal.throwIfAborted();await assertExchangeIdentity(identity,signal);
    throw new ExchangeAuthorityError(error instanceof Error?error.message:'서버 외곽선을 조회하지 못했습니다.','server');
  }
  await assertExchangeIdentity(identity,signal);
  if(page.actorId!==identity.actorId||page.versionId!==scope.versionId||page.sourceSha256!==scope.sourceSha256)
    throw changed();
  return {scope,identity,sceneRevision:page.sceneRevision,rows:page.outlines};
}
/** Compare only information selected for export, plus the current Scene pointer. */
export function exchangeServerFingerprint(read:ExchangeServerRead,ids?:readonly string[]):string{
  if(ids&&new Set(ids).size!==ids.length)throw changed();
  const rows=ids?ids.map(id=>{
    const row=read.rows.find(item=>item.id===id);if(!row)throw changed();return row;
  }):read.rows;
  return JSON.stringify([read.identity,read.scope.versionId,read.scope.sourceSha256,read.sceneRevision,
    [...rows].sort((a,b)=>a.id.localeCompare(b.id)).map(row=>[
      row.id,row.revision,row.name,row.kind,row.validationMode,
      row.outlineTypeId,row.outlineType?.name??null,row.geometry.type,row.geometry.coordinates,
    ])]);
}
export async function assertExchangeServerUnchanged(expected:ExchangeServerRead,
  ids:readonly string[]|undefined,signal:AbortSignal){
  const current=await readExchangeOutlines(expected.scope,expected.identity,signal);
  if(exchangeServerFingerprint(current,ids)!==exchangeServerFingerprint(expected,ids))throw changed();
}
