'use client';
import { runtimeCadHeaders } from '@/features/g7-runtime/client';
import type { GeoJSONOutline } from '@/viewers/core/outline-compute';
export type StoredOutline={
 id:string;versionId:string;sourceSha256:string;sceneRevision:number;origin:'APP_CREATED';
 validationMode:'APP_CREATED'|'SOURCE_CANONICAL';kind:'CONVEX'|'PRECISE';name:string;
 geometry:GeoJSONOutline;baseGeometry:GeoJSONOutline;
 sourceRefs:string[];derivedFrom:string[];operations:readonly unknown[];
 outlineTypeId:string|null;createdById:string;updatedById:string;revision:number;
 createdAt:string;updatedAt:string;
};
const url=(versionId:string,id?:string)=>'/api/cad-files/'+encodeURIComponent(versionId)+'/outlines'+
 (id?'/'+encodeURIComponent(id):'');
async function parse(response:Response):Promise<unknown>{
 let data:unknown;
 try{data=await response.json();}catch{throw new Error('외곽선 서버 응답이 올바르지 않습니다.');}
 if(!response.ok){const e=data as {error?:{message?:string}};throw new Error(e?.error?.message??('외곽선 요청 실패 '+response.status));}
 return data;
}
export async function loadStoredOutlines(versionId:string,signal:AbortSignal):Promise<{
 outlines:StoredOutline[];sceneRevision:number|null
}>{
 const [rows,scene]=await Promise.all([
  fetch(url(versionId),{credentials:'same-origin',cache:'no-store',signal}),
  fetch('/api/cad-files/'+encodeURIComponent(versionId)+'/scene',{credentials:'same-origin',cache:'no-store',signal})
 ]);
 const data=await parse(rows) as {outlines?:StoredOutline[]};
 const sceneData=await parse(scene) as {revision?:number|null};
 if(!Array.isArray(data.outlines)||data.outlines.length>100)throw new Error('저장 외곽선 목록이 유효하지 않습니다.');
 return {outlines:data.outlines,sceneRevision:typeof sceneData.revision==='number'?sceneData.revision:null};
}
export async function mutateStoredOutline(method:'POST'|'PATCH'|'DELETE',versionId:string,
 payload:Record<string,unknown>,id?:string):Promise<StoredOutline|{deleted:true;revision:number}>{
 const headers=await runtimeCadHeaders({'Content-Type':'application/json'});
 const response=await fetch(url(versionId,id),{method,headers,credentials:'same-origin',
  cache:'no-store',body:JSON.stringify(payload)});
 return await parse(response) as StoredOutline|{deleted:true;revision:number};
}
