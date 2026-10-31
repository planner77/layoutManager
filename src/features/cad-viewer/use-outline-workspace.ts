'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AuthorizedOutlineCatalog, StoredOutlineCreateDto, StoredOutlineCreateResultDto, StoredOutlineDto } from '@/domain/typed-outline';
import { createTypedStoredOutline, loadStoredOutlines, loadVersionOutlineTypes, mutateStoredOutline, OutlineClientError } from './persisted-outline-client';

type WorkspaceState = {
  identity: string; mode: 'checking'|'active'|'off'|'unavailable'; actorId: string|null;
  rows: StoredOutlineDto[]; catalog: AuthorizedOutlineCatalog|null;
  sceneRevision: number|null; canWrite: boolean;
  hidden: ReadonlySet<string>; selected: ReadonlySet<string>;
  error: string|null; busy: boolean; loading: boolean;
};
const empty = (identity:string):WorkspaceState => ({identity,mode:'checking',actorId:null,
  rows:[],catalog:null,sceneRevision:null,canWrite:false,hidden:new Set(),selected:new Set(),
  error:null,busy:false,loading:true});
const cancelled=()=>new DOMException('계정 또는 도면이 변경되어 이전 응답을 표시하지 않았습니다.','AbortError');
async function currentActor(signal?:AbortSignal):Promise<string>{
  const response=await fetch('/api/g7-runtime/auth/session',{credentials:'same-origin',cache:'no-store',signal});
  const value=await response.json();
  if(!response.ok)throw new OutlineClientError([401,403].includes(response.status)?response.status:503,
    'ACTOR_UNAVAILABLE','로그인 상태를 확인하지 못했습니다. 서버 외곽선을 다시 조회하세요.');
  if(typeof value.actor?.id!=='string')throw new Error('현재 계정 정보를 확인하지 못했습니다.');
  return value.actor.id;
}

/** Authenticated server snapshots never become GeneratedDocument/Undo entries. */
export function useOutlineWorkspace({versionId,sourceSha256,renderer,format,attempt}:{
  versionId:string;sourceSha256:string;renderer:string;format:string;attempt:number;
}) {
  const identity=versionId+':'+sourceSha256+':'+renderer+':'+attempt;
  const identityRef=useRef(identity),actorRef=useRef<string|null>(null),mounted=useRef(false);
  const epoch=useRef(0);
  const [state,setState]=useState<WorkspaceState>(()=>empty(identity));
  const [query,setQuery]=useState({q:'',offset:0});
  const read=useRef<AbortController|null>(null),mutation=useRef<AbortController|null>(null);
  const pending=useRef<Promise<StoredOutlineCreateResultDto>|null>(null);
  const latestRefresh=useRef<(()=>Promise<void>)|null>(null);
  const current=state.identity===identity?state:empty(identity);
  const live=useCallback(()=>mounted.current&&identityRef.current===identity,[identity]);
  const isCurrent=useCallback((actor:string|null)=>live()&&actor!==null&&actorRef.current===actor,[live]);
  const assertCurrentActor=useCallback(async(actor:string|null,signal?:AbortSignal)=>{
    if(!isCurrent(actor)||signal?.aborted)throw cancelled();
    const actual=await currentActor(signal);
    if(!isCurrent(actor)||actual!==actor||signal?.aborted)throw cancelled();
  },[isCurrent]);

  const refresh=useCallback(async()=>{
    read.current?.abort();
    const controller=new AbortController();read.current=controller;
    const atStart=epoch.current;
    const owns=()=>live()&&!controller.signal.aborted&&read.current===controller;
    const fresh=()=>owns()&&epoch.current===atStart;
    setState(previous=>previous.identity===identity?{...previous,loading:true}:empty(identity));
    try {
      if(format!=='DXF'||renderer!=='three-dxf-viewer'){
        if(fresh()){actorRef.current=null;setState({...empty(identity),mode:'off',loading:false});}
        return;
      }
      const response=await fetch('/api/g7-runtime/status',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
      const status=await response.json();
      if(!response.ok||status.state!=='ACTIVE'){
        if(status.state==='OFF'&&!status.authEnabled&&!status.cadWriteEnabled){
          if(fresh()){actorRef.current=null;setState({...empty(identity),mode:'off',loading:false});}
          return;
        }
        throw new OutlineClientError(503,'RUNTIME_UNAVAILABLE','서버 외곽선 인증이 활성화되어 있지 않습니다.');
      }
      const actor=await currentActor(controller.signal);
      if(!fresh())return;
      if(actorRef.current&&actorRef.current!==actor){
        mutation.current?.abort();pending.current=null;
        setState({...empty(identity),actorId:actor});
      }
      actorRef.current=actor;
      const [page,catalog]=await Promise.all([
        loadStoredOutlines(versionId,controller.signal),
        loadVersionOutlineTypes(versionId,query.q,query.offset,controller.signal),
      ]);
      if(!fresh())return;
      await assertCurrentActor(actor,controller.signal);
      if(!fresh())return;
      if(page.actorId!==actor||catalog.actorId!==actor||page.sourceSha256!==sourceSha256||catalog.sourceSha256!==sourceSha256||
        page.sceneRevision!==catalog.sceneRevision)throw new Error('계정 또는 Scene이 변경되었습니다. 목록을 다시 조회하세요.');
      setState(previous=>{
        const preserve=previous.identity===identity&&previous.actorId===actor;
        const ids=new Set(page.outlines.map(row=>row.id));
        return {identity,mode:'active',actorId:actor,rows:page.outlines,catalog,
          sceneRevision:page.sceneRevision,canWrite:page.canWrite,
          hidden:preserve?new Set([...previous.hidden].filter(id=>ids.has(id))):new Set(),
          selected:preserve?new Set([...previous.selected].filter(id=>ids.has(id))):new Set(),
          error:null,busy:preserve&&previous.busy,loading:false};
      });
    }catch(error){
      if(!fresh())return;
      actorRef.current=null;
      setState({...empty(identity),mode:'unavailable',loading:false,
        error:error instanceof Error?error.message:'서버 외곽선을 조회하지 못했습니다.'});
    }finally{
      if(owns()&&epoch.current!==atStart)setState(previous=>previous.identity===identity?{...previous,loading:false}:previous);
    }
  },[identity,format,renderer,versionId,sourceSha256,query,live,assertCurrentActor]);
  useLayoutEffect(()=>{latestRefresh.current=refresh;},[refresh]);

  useLayoutEffect(()=>{
    mounted.current=true;identityRef.current=identity;actorRef.current=null;epoch.current++;
    return ()=>{mounted.current=false;read.current?.abort();mutation.current?.abort();pending.current=null;};
  },[identity]);
  useEffect(()=>{
    let disposed=false;queueMicrotask(()=>{if(!disposed)void refresh();});
    const focus=()=>{void refresh();};window.addEventListener('focus',focus);
    return ()=>{disposed=true;read.current?.abort();window.removeEventListener('focus',focus);};
  },[refresh]);

  const upsert=useCallback((row:StoredOutlineDto,actor:string)=>{
    if(!isCurrent(actor)||row.versionId!==versionId||row.sourceSha256!==sourceSha256)throw cancelled();
    setState(previous=>previous.identity===identity&&previous.actorId===actor&&previous.mode==='active'?
      {...previous,rows:previous.rows.some(item=>item.id===row.id)?previous.rows.map(item=>item.id===row.id?row:item):[...previous.rows,row],error:null}:previous);
  },[identity,versionId,sourceSha256,isCurrent]);
  const remove=useCallback((id:string,actor:string)=>setState(previous=>previous.identity===identity&&previous.actorId===actor?
    {...previous,rows:previous.rows.filter(row=>row.id!==id),hidden:new Set([...previous.hidden].filter(value=>value!==id)),
      selected:new Set([...previous.selected].filter(value=>value!==id))}:previous),[identity]);
  const clear=useCallback(()=>{
    epoch.current++;read.current?.abort();actorRef.current=null;mutation.current?.abort();pending.current=null;
    setState({...empty(identity),mode:'off',loading:false});
  },[identity]);
  const setVisible=useCallback((ids:readonly string[],visible:boolean)=>setState(previous=>{
    if(previous.identity!==identity)return previous;
    const hidden=new Set(previous.hidden);for(const id of ids){if(visible)hidden.delete(id);else hidden.add(id);}
    return {...previous,hidden};
  }),[identity]);
  const select=useCallback((id:string,additive=false)=>setState(previous=>{
    if(previous.identity!==identity||previous.hidden.has(id))return previous;
    const selected=additive?new Set(previous.selected):new Set<string>();
    if(additive&&selected.has(id))selected.delete(id);else selected.add(id);
    return {...previous,selected};
  }),[identity]);
  const clearSelection=useCallback(()=>setState(previous=>previous.identity===identity?{...previous,selected:new Set()}:previous),[identity]);

  const perform=useCallback(async<T,>(action:(signal:AbortSignal)=>Promise<T>,commit:(value:T,actor:string)=>void):Promise<T>=>{
    const actor=current.actorId;
    if(current.mode!=='active'||!current.canWrite||!actor||!isCurrent(actor))throw cancelled();
    if(mutation.current)throw new Error('다른 외곽선 저장 요청의 결과를 확인 중입니다.');
    const controller=new AbortController();mutation.current=controller;epoch.current++;
    setState(previous=>previous.identity===identity?{...previous,busy:true,error:null}:previous);
    try{
      await assertCurrentActor(actor,controller.signal);
      const result=await action(controller.signal);
      await assertCurrentActor(actor,controller.signal);
      commit(result,actor);
      return result;
    }catch(error){
      if(!controller.signal.aborted&&live()&&(!actorRef.current||actorRef.current===actor)){
        const denied=error instanceof OutlineClientError&&[401,403,503].includes(error.status);
        if(denied)actorRef.current=null;
        if(!(error instanceof DOMException&&error.name==='AbortError'))setState(previous=>{
          if(previous.identity!==identity||previous.actorId&&previous.actorId!==actor)return previous;
          return {...(denied?{...empty(identity),mode:'unavailable' as const,loading:false}:previous),busy:false,
            error:error instanceof Error?error.message:'저장 응답을 확인하지 못했습니다. 같은 요청으로 다시 시도하세요.'};
        });
      }
      throw error;
    }finally{
      if(mutation.current===controller){
        mutation.current=null;pending.current=null;epoch.current++;
        if(live()){
          setState(previous=>previous.identity===identity?{...previous,busy:false,loading:false}:previous);
          queueMicrotask(()=>{if(live())void latestRefresh.current?.();});
        }
      }
    }
  },[current.mode,current.canWrite,current.actorId,identity,isCurrent,assertCurrentActor,live]);
  const submit=useCallback((body:StoredOutlineCreateDto,key:string)=>{
    if(pending.current)return pending.current;
    const request=perform(signal=>createTypedStoredOutline(versionId,body,key,signal),(result,actor)=>{
      if(result.createdById!==actor)throw cancelled();upsert(result,actor);
    }).finally(()=>{if(pending.current===request)pending.current=null;});
    pending.current=request;return request;
  },[perform,versionId,upsert]);
  const mutate=useCallback((method:'POST'|'PATCH'|'DELETE',body:Record<string,unknown>,id?:string)=>
    perform(signal=>mutateStoredOutline(method,versionId,body,id,{signal}),(result,actor)=>{
      if('deleted' in result){if(id)remove(id,actor);}
      else{
        if((method==='POST'?result.createdById:result.updatedById)!==actor)throw cancelled();
        upsert(result,actor);
      }
    }),[perform,versionId,remove,upsert]);

  return {...current,query,refresh,clear,setVisible,select,clearSelection,submit,mutate,isCurrent,assertCurrentActor,
    search:(q:string)=>setQuery({q:q.trim().normalize('NFC'),offset:0}),
    goTo:(offset:number)=>setQuery(previous=>({...previous,offset})),
  };
}
