'use client';
import type { PersistedMemoDraft } from '@/domain/cad-memo';
import { runtimeCadHeaders } from '@/features/g7-runtime/client';
export type MemoServerMode='checking'|'active'|'off'|'unavailable';
function url(versionId:string,id?:string){
 return '/api/cad-files/'+encodeURIComponent(versionId)+'/memos'+(id?'/'+encodeURIComponent(id):'');
}
async function json(response:Response):Promise<unknown>{
 let value:unknown;
 try{value=await response.json();}catch{throw new Error('메모 저장 서버 응답을 읽을 수 없습니다.');}
 if(!response.ok){
  const data=value as {error?:{code?:string;message?:string}};
  throw new Error(data?.error?.message??('메모 서버 오류 '+response.status));
 }
 return value;
}
export async function readPersistedMemos(versionId:string,signal:AbortSignal):Promise<
 {mode:'off';memos:[]} | {mode:'active';memos:PersistedMemoDraft[]}>{
 const status=await fetch('/api/g7-runtime/status',{credentials:'same-origin',cache:'no-store',signal});
 const state=await json(status) as {state?:string;authEnabled?:boolean;cadWriteEnabled?:boolean};
 if(state.state==='OFF'&&!state.authEnabled&&!state.cadWriteEnabled)return {mode:'off',memos:[]};
 if(state.state!=='ACTIVE'||!state.authEnabled)throw new Error('업무 메모 인증이 활성화되어 있지 않습니다.');
 const response=await fetch(url(versionId),{credentials:'same-origin',cache:'no-store',signal});
 const data=await json(response) as {memos?:PersistedMemoDraft[]};
 if(!Array.isArray(data?.memos)||data.memos.length>100)throw new Error('서버 메모 목록 형식이 올바르지 않습니다.');
 return {mode:'active',memos:data.memos};
}
export async function mutatePersistedMemo(method:'POST'|'PATCH'|'DELETE',versionId:string,
 payload:Record<string,unknown>,id?:string):Promise<unknown>{
 const headers=await runtimeCadHeaders({'Content-Type':'application/json'});
 const response=await fetch(url(versionId,id),{method,headers,credentials:'same-origin',
  cache:'no-store',body:JSON.stringify(payload)});
 return json(response);
}

/** #84: direct business-anchor route; accepts neither client actor nor arbitrary affine. */
export async function mutatePersistedMemoAnchor(versionId:string,memoId:string,payload:{
 expectedRevision:number;operation:'attach'|'detach';targetOrigin?:'APP_CREATED'|'DXF_IMPORTED';targetId?:string;
}):Promise<{revision:number;anchor:import('@/domain/cad-memo-anchor').MemoAnchorState}>{
 const headers=await runtimeCadHeaders({'Content-Type':'application/json'});
 const response=await fetch(url(versionId,memoId)+'/anchor',{
  method:'PATCH',headers,credentials:'same-origin',cache:'no-store',body:JSON.stringify(payload)});
 return await json(response) as {revision:number;anchor:import('@/domain/cad-memo-anchor').MemoAnchorState};
}
/** #167: one idempotent conflict-checked transaction, not repeated DELETE requests. */
export async function resetPersistedBusiness(versionId:string,payload:{
 mode:'SOURCE_ONLY'|'ALL';sourceSha256:string;expectedSceneRevision:number;
 outlines:readonly {id:string;revision:number}[];memos:readonly {id:string;revision:number}[];
}):Promise<{mode:'SOURCE_ONLY'|'ALL';broken:number;deletedOutlines:number;deletedMemos:number}>{
 const headers=await runtimeCadHeaders({'Content-Type':'application/json'});
 const response=await fetch('/api/cad-files/'+encodeURIComponent(versionId)+'/reset',{
  method:'POST',headers,credentials:'same-origin',cache:'no-store',body:JSON.stringify(payload)});
 return await json(response) as {mode:'SOURCE_ONLY'|'ALL';broken:number;deletedOutlines:number;deletedMemos:number};
}
