import {runtimeCadHeaders} from '@/features/g7-runtime/client';
import type {CadZoneDto,ZoneCategoryDto,ZoneListDto,ZoneMetadata,ZonePolygon} from '@/domain/cad-zone';

const root=(versionId:string)=>`/api/cad-files/${encodeURIComponent(versionId)}`;
export class ZoneRequestError extends Error{
 constructor(message:string,readonly status:number,readonly code:string){super(message);this.name='ZoneRequestError';}
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
