'use client';
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {invalidateSessionStatus,useSessionIdentitySnapshot} from '@/features/g7-runtime/session-status';
import {runtimeCadHeaders,RuntimeClientError} from '@/features/g7-runtime/client';
import {denyProtectedViewerScope,onProtectedViewerScopeDenied,retryProtectedViewerScope,sameProtectedScope} from './protected-scope-invalidation';
export type TreeFolder={id:string;versionId:string;parentFolderId:string|null;name:string;sortOrder:number;revision:number;createdById:string};
export type TreeMembership={id:string;versionId:string;kind:'OUTLINE'|'ZONE';objectId:string;folderId:string|null;sortOrder:number;revision:number};
export type TreeOutline={id:string;name:string;kind:string;outlineTypeId:string|null;bounds:{minX:number;minY:number;maxX:number;maxY:number}|null};
export type TreeZone={id:string;name:string;code:string;categoryId:string|null;parentZoneId:string|null;sortOrder:number;geometryState:'MAPPED'|'UNMAPPED'|null};
export type VersionTree={versionId:string;sourceSha256:string;locationId:string;siteId:string;actorId:string;canEdit:boolean;folders:TreeFolder[];memberships:TreeMembership[];outlines:TreeOutline[];zones:TreeZone[];categories:{id:string;name:string}[];types:{id:string;name:string;active:boolean}[]};
type State={data:VersionTree|null;loading:boolean;error:string|null;busy:boolean};
const empty:State={data:null,loading:false,error:null,busy:false};
const cancelled=()=>new DOMException('계정 또는 도면이 변경되었습니다.','AbortError');
const path=(versionId:string)=>`/api/cad-files/${encodeURIComponent(versionId)}/tree`;
async function json(response:Response){const body=await response.json().catch(()=>null);
 if(!response.ok){const error=new Error(body?.error?.message||`트리 요청 실패 (${response.status})`) as Error&{status:number};error.status=response.status;throw error;}return body;}
export function useVersionTree(versionId:string,sourceSha256:string,enabled:boolean){
 const identity=useSessionIdentitySnapshot();
 const key=versionId+':'+sourceSha256+':'+identity.actorId+':'+identity.epoch;
 const resourceKey=versionId+':'+sourceSha256+':'+identity.actorId;
 const currentRef=useRef(key),generation=useRef(0),request=useRef<AbortController|null>(null);
 const deniedResource=useRef<string|null>(null);
 const lastActiveResource=useRef<string|null>(null);
 const cancelRequest=useCallback(()=>{generation.current++;request.current?.abort();},[]);
 const [snapshot,setSnapshot]=useState<{key:string;state:State}>({key,state:empty});
 const [denialEpoch,setDenialEpoch]=useState(0);
 const current=snapshot.key===key?snapshot.state:empty;
 useLayoutEffect(()=>{if(identity.actorId&&lastActiveResource.current!==resourceKey){deniedResource.current=null;lastActiveResource.current=resourceKey;}
  currentRef.current=key;generation.current++;request.current?.abort();},[key,resourceKey,identity.actorId]);
 const refresh=useCallback(async()=>{
  const actor=identity.actorId;
  if(currentRef.current!==key||!enabled||identity.kind!=='signed-in'||!actor||deniedResource.current===resourceKey)return;
  request.current?.abort();const controller=new AbortController();request.current=controller;
  const generationAtStart=++generation.current;
  const live=()=>currentRef.current===key&&generation.current===generationAtStart&&!controller.signal.aborted;
  setSnapshot(previous=>({key,state:{...(previous.key===key?previous.state:empty),loading:true,error:null}}));
  try{
   const result=await json(await fetch(path(versionId),{credentials:'same-origin',cache:'no-store',signal:controller.signal})) as VersionTree;
   if(!live())return;
   if(result.versionId!==versionId||result.sourceSha256!==sourceSha256)throw cancelled();
   if(result.actorId!==actor){
    denyProtectedViewerScope({actorId:actor,sessionEpoch:identity.epoch,versionId,sourceSha256});
    invalidateSessionStatus();return;
   }
   setSnapshot({key,state:{data:result,loading:false,error:null,busy:false}});
  }catch(error){if(!live())return;
   const status=(error as {status?:number}).status;
   if((status===401||status===403)&&actor)denyProtectedViewerScope({actorId:actor,sessionEpoch:identity.epoch,versionId,sourceSha256});
   else setSnapshot({key,state:{...empty,error:error instanceof Error?error.message:'트리를 조회하지 못했습니다.'}});
  }
 },[enabled,identity.actorId,identity.epoch,identity.kind,key,resourceKey,sourceSha256,versionId]);
 useEffect(()=>{if(enabled&&identity.kind==='signed-in')queueMicrotask(()=>void refresh());
  return cancelRequest;
 },[refresh,enabled,identity.kind,cancelRequest]);
 useEffect(()=>{const invalidate=()=>{generation.current++;request.current?.abort();setSnapshot({key,state:empty});};
  window.addEventListener('layoutManager:session-invalidated',invalidate);
  return()=>window.removeEventListener('layoutManager:session-invalidated',invalidate);
 },[key]);
 useEffect(()=>onProtectedViewerScopeDenied(denied=>{
  const scope={actorId:identity.actorId??'',sessionEpoch:identity.epoch,versionId,sourceSha256};
  if(identity.kind!=='signed-in'||!identity.actorId||currentRef.current!==key||!sameProtectedScope(denied,scope))return;
  deniedResource.current=resourceKey;cancelRequest();setSnapshot({key,state:{...empty,error:'이 도면의 권한을 다시 확인하세요.'}});
  setDenialEpoch(value=>value+1);
 }),[identity.kind,identity.actorId,identity.epoch,key,resourceKey,versionId,sourceSha256,cancelRequest]);
 const mutate=useCallback(async(method:'POST'|'PATCH'|'DELETE',body:Record<string,unknown>)=>{
  const actor=identity.actorId,atStart=generation.current;
  if(!actor||identity.kind!=='signed-in'||currentRef.current!==key||deniedResource.current===resourceKey)throw cancelled();
  setSnapshot(previous=>({key,state:{...(previous.key===key?previous.state:empty),busy:true,error:null}}));
  try{
   const headers=await runtimeCadHeaders({'Content-Type':'application/json'},actor);
   if(currentRef.current!==key||generation.current!==atStart)throw cancelled();
   const result=await json(await fetch(path(versionId),{method,headers,credentials:'same-origin',cache:'no-store',body:JSON.stringify(body)}));
   if(currentRef.current!==key||generation.current!==atStart)throw cancelled();
   await refresh();return result;
  }catch(error){if(currentRef.current===key&&generation.current===atStart){const status=(error as {status?:number}).status;
   if(error instanceof RuntimeClientError&&error.code==='SESSION_ACTOR_CHANGED'){
    denyProtectedViewerScope({actorId:actor,sessionEpoch:identity.epoch,versionId,sourceSha256});
    invalidateSessionStatus();
   }else if((status===401||status===403)&&actor)denyProtectedViewerScope({actorId:actor,sessionEpoch:identity.epoch,versionId,sourceSha256});
   else setSnapshot({key,state:{...current,busy:false,error:error instanceof Error?error.message:'변경에 실패했습니다.'}});
  }throw error;}
 },[identity.actorId,identity.epoch,identity.kind,key,resourceKey,versionId,sourceSha256,refresh,current]);
 const retry=()=>{if(identity.actorId){deniedResource.current=null;
  retryProtectedViewerScope({actorId:identity.actorId,versionId,sourceSha256});}invalidateSessionStatus();};
 const data=enabled&&identity.kind==='signed-in'&&identity.actorId===current.data?.actorId?current.data:null;
 return {mode:identity.kind==='off'?'off':identity.kind==='blocked'?'blocked':identity.kind==='signed-in'?'active':'unavailable',
  data,loading:current.loading,error:current.error,busy:current.busy,refresh,retry,mutate,actorId:identity.actorId,sessionEpoch:identity.epoch,denialEpoch};
}
