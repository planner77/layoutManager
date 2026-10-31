'use client';
import { runtimeCadHeaders, RuntimeClientError } from '@/features/g7-runtime/client';
import type { AuthorizedOutlineCatalog, StoredOutlineDto, StoredOutlinePageDto,
 StoredOutlineCreateDto, StoredOutlineCreateResultDto } from '@/domain/typed-outline';
import { validatedGeneratedGeometry } from '@/domain/generated-document';
export type StoredOutline=StoredOutlineDto;
export class OutlineClientError extends Error {
 constructor(readonly status:number,readonly code:string,message:string){super(message);}
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const object=(value:unknown):Record<string,unknown>=>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('서버 외곽선 응답 형식이 올바르지 않습니다.');
 return value as Record<string,unknown>;
};
const integer=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const label=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=100&&
 value.trim().normalize('NFC')===value&&!/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value);
function context(value:Record<string,unknown>,versionId:string){
 if(value.versionId!==versionId||typeof value.actorId!=='string'||!uuid.test(value.actorId)||
   typeof value.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(value.sourceSha256)||
   !(value.sceneRevision===null||integer(value.sceneRevision)))throw new Error('다른 계정·도면 범위의 응답을 표시할 수 없습니다.');
}
function page(value:Record<string,unknown>,items:unknown[],offset:number,limit:number){
 if(!integer(value.total)||value.offset!==offset||value.limit!==limit||items.length>limit||
   Number(value.total)<offset+items.length&&items.length>0)throw new Error('서버 외곽선 페이지가 완전하지 않습니다.');
}
function outline(value:unknown,versionId:string,sha:string):StoredOutlineDto{
 const item=object(value);
 if(typeof item.id!=='string'||!uuid.test(item.id)||item.versionId!==versionId||item.sourceSha256!==sha||
   item.origin!=='APP_CREATED'||!['APP_CREATED','SOURCE_CANONICAL'].includes(String(item.validationMode))||
   !['CONVEX','PRECISE'].includes(String(item.kind))||!integer(item.sceneRevision)||!integer(item.revision)||!label(item.name)||
   !Array.isArray(item.sourceRefs)||!Array.isArray(item.derivedFrom)||!Array.isArray(item.operations))
  throw new Error('서버 외곽선의 식별자·범위·기하 정보가 올바르지 않습니다.');
 if(item.outlineTypeId!==null){
  const type=object(item.outlineType);
  if(typeof item.outlineTypeId!=='string'||!uuid.test(item.outlineTypeId)||type.id!==item.outlineTypeId||
    !label(type.name)||typeof type.active!=='boolean'||!integer(type.sortOrder)||!integer(type.revision))
   throw new Error('서버 외곽선의 업무 타입 참조가 올바르지 않습니다.');
 }else if(item.outlineType!==null)throw new Error('미분류 외곽선의 타입 정보가 올바르지 않습니다.');
 validatedGeneratedGeometry(item.geometry as StoredOutlineDto['geometry']);
 validatedGeneratedGeometry(item.baseGeometry as StoredOutlineDto['geometry']);
 return item as unknown as StoredOutlineDto;
}
const url=(versionId:string,id?:string)=>'/api/cad-files/'+encodeURIComponent(versionId)+'/outlines'+
 (id?'/'+encodeURIComponent(id):'');
async function parse(response:Response):Promise<unknown>{
 let data:unknown;
 try{data=await response.json();}catch{throw new OutlineClientError(response.status,'INVALID_RESPONSE','외곽선 서버 응답이 올바르지 않습니다.');}
 if(!response.ok){const e=data as {error?:{code?:string;message?:string}};
  throw new OutlineClientError(response.status,e?.error?.code??'OUTLINE_UNAVAILABLE',e?.error?.message??('외곽선 요청 실패 '+response.status));}
 return data;
}
export async function loadStoredOutlines(versionId:string,signal:AbortSignal):Promise<StoredOutlinePageDto>{
 const value=object(await parse(await fetch(url(versionId),{credentials:'same-origin',cache:'no-store',signal})));
 context(value,versionId);
 if(!Array.isArray(value.outlines)||typeof value.canWrite!=='boolean')throw new Error('저장 외곽선 목록이 유효하지 않습니다.');
 page(value,value.outlines,0,100);
 if(value.total!==value.outlines.length||Number(value.total)>100)throw new Error('외곽선 전체 목록을 확인하지 못했습니다. 일부만 표시하지 않습니다.');
 const rows=value.outlines.map(item=>outline(item,versionId,String(value.sourceSha256)));
 if(new Set(rows.map(item=>item.id)).size!==rows.length)throw new Error('외곽선 목록에 중복 식별자가 있습니다.');
 return {...value,outlines:rows} as StoredOutlinePageDto;
}
export async function loadVersionOutlineTypes(versionId:string,q:string,offset:number,signal:AbortSignal):Promise<AuthorizedOutlineCatalog>{
 const params=new URLSearchParams({offset:String(offset),limit:'50'});if(q)params.set('q',q);
 const value=object(await parse(await fetch('/api/cad-files/'+encodeURIComponent(versionId)+'/outline-types?'+params,
  {credentials:'same-origin',cache:'no-store',signal})));
 context(value,versionId);
 if(!Array.isArray(value.items)||value.catalogScope!=='GLOBAL'||typeof value.canCreate!=='boolean')throw new Error('업무 타입 목록 형식이 올바르지 않습니다.');
 page(value,value.items,offset,50);
 const seen=new Set<string>();
 for(const raw of value.items){const item=object(raw);
  if(typeof item.id!=='string'||!uuid.test(item.id)||seen.has(item.id)||!label(item.name)||
    item.active!==true||!integer(item.sortOrder)||!integer(item.revision))throw new Error('활성 업무 타입 정보가 올바르지 않습니다.');
  seen.add(item.id);
 }
 return value as unknown as AuthorizedOutlineCatalog;
}
export async function mutateStoredOutline(method:'POST'|'PATCH'|'DELETE',versionId:string,
 payload:Record<string,unknown>,id?:string,options?:{signal?:AbortSignal;idempotencyKey?:string}):Promise<StoredOutline|{deleted:true;revision:number}>{
 const headers=await runtimeCadHeaders({'Content-Type':'application/json'});
 if(options?.idempotencyKey)headers.set('Idempotency-Key',options.idempotencyKey);
 const response=await fetch(url(versionId,id),{method,headers,credentials:'same-origin',
  cache:'no-store',body:JSON.stringify(payload),signal:options?.signal});
 return await parse(response) as StoredOutline|{deleted:true;revision:number};
}
export async function createTypedStoredOutline(versionId:string,payload:StoredOutlineCreateDto,
 idempotencyKey:string,signal:AbortSignal):Promise<StoredOutlineCreateResultDto>{
 try{
  const result=await mutateStoredOutline('POST',versionId,payload,undefined,{signal,idempotencyKey});
  if('deleted' in result)throw new Error('외곽선 확정 결과가 올바르지 않습니다.');
  const checked=outline(result,versionId,payload.sourceSha256);
  if(typeof (result as StoredOutlineCreateResultDto).replayed!=='boolean')throw new Error('외곽선 재시도 결과를 확인하지 못했습니다.');
  return {...checked,replayed:(result as StoredOutlineCreateResultDto).replayed};
 }catch(error){
  if(error instanceof DOMException&&error.name==='AbortError'||error instanceof OutlineClientError)throw error;
  if(error instanceof RuntimeClientError)throw new OutlineClientError(error.status,error.code,error.message);
  throw new OutlineClientError(0,'NETWORK_UNCERTAIN','저장 응답을 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.');
 }
}
