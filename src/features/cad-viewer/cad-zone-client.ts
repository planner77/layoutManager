import {runtimeCadHeaders} from '@/features/g7-runtime/client';
import type {CadZoneDto,ZoneCategoryDto,ZoneListDto,ZoneMetadata,ZonePolygon} from '@/domain/cad-zone';

const root=(versionId:string)=>`/api/cad-files/${encodeURIComponent(versionId)}`;
export class ZoneRequestError extends Error{
 constructor(message:string,readonly status:number,readonly code:string){super(message);this.name='ZoneRequestError';}
}
/** Public capability only. ACTIVE still requires the protected Zone GET below. */
export async function probeZoneAvailability(signal?:AbortSignal):Promise<'ACTIVE'|'OFF'>{
 let response:Response;
 try{response=await fetch('/api/g7-runtime/status',{credentials:'same-origin',cache:'no-store',signal});}
 catch(error){if(signal?.aborted)throw error;throw new ZoneRequestError('구역 운영 상태를 확인하지 못했습니다. 다시 시도하세요.',503,'STATUS_UNAVAILABLE');}
 if(!response.ok)throw new ZoneRequestError('구역 운영 상태를 확인하지 못했습니다. 다시 시도하세요.',response.status,'STATUS_UNAVAILABLE');
 const body=await response.json().catch(()=>null);
 if(body?.state==='OFF'&&body?.authEnabled===false&&body?.cadWriteEnabled===false)return 'OFF';
 if(body?.state==='ACTIVE'&&body?.authEnabled===true)return 'ACTIVE';
 throw new ZoneRequestError('구역 운영 상태가 확인되지 않았습니다. 다시 시도하세요.',503,'STATUS_UNAVAILABLE');
}
async function result<T>(response:Response):Promise<T>{
 const body=await response.json().catch(()=>null);
 if(!response.ok)throw new ZoneRequestError(body?.error?.message||`구역 요청 실패 (${response.status})`,
  response.status,String(body?.error?.code||'UNKNOWN'));
 return body as T;
}
async function request<T>(url:string,method:'POST'|'PATCH'|'DELETE',payload:unknown,key?:string):Promise<T>{
 const headers=await runtimeCadHeaders({'Content-Type':'application/json'});
 if(key)headers.set('Idempotency-Key',key);
 return result<T>(await fetch(url,{method,headers,credentials:'same-origin',cache:'no-store',body:JSON.stringify(payload)}));
}
export async function readZones(versionId:string,signal?:AbortSignal):Promise<ZoneListDto>{
 return result<ZoneListDto>(await fetch(root(versionId)+'/zones',{credentials:'same-origin',cache:'no-store',signal}));
}
export async function createZone(versionId:string,metadata:ZoneMetadata,geometry:{sourceSha256:string;sceneRevision:number;polygon:ZonePolygon}|undefined,key:string):Promise<CadZoneDto>{
 const body=await request<{zone:CadZoneDto}>(root(versionId)+'/zones','POST',{...metadata,...(geometry?{geometry}:{})},key);
 return body.zone;
}
export async function patchZone(versionId:string,zone:CadZoneDto,metadata:ZoneMetadata,geometry?:{sourceSha256:string;sceneRevision:number;polygon:ZonePolygon}):Promise<CadZoneDto>{
 const body=await request<{zone:CadZoneDto}>(root(versionId)+'/zones/'+encodeURIComponent(zone.id),'PATCH',
  {expectedRevision:zone.revision,...metadata,...(geometry?{geometry}:{})});
 return body.zone;
}
export async function deleteZone(versionId:string,zone:CadZoneDto):Promise<void>{
 await request(root(versionId)+'/zones/'+encodeURIComponent(zone.id),'DELETE',{expectedRevision:zone.revision});
}
export async function createZoneCategory(versionId:string,name:string,sortOrder:number):Promise<ZoneCategoryDto>{
 return (await request<{category:ZoneCategoryDto}>(root(versionId)+'/zone-categories','POST',{name,sortOrder})).category;
}
export async function patchZoneCategory(versionId:string,category:ZoneCategoryDto,name:string,sortOrder:number,active:boolean):Promise<ZoneCategoryDto>{
 return (await request<{category:ZoneCategoryDto}>(root(versionId)+'/zone-categories/'+encodeURIComponent(category.id),'PATCH',
  {expectedRevision:category.revision,name,sortOrder,active})).category;
}
export async function deleteZoneCategory(versionId:string,category:ZoneCategoryDto):Promise<void>{
 await request(root(versionId)+'/zone-categories/'+encodeURIComponent(category.id),'DELETE',{expectedRevision:category.revision});
}
