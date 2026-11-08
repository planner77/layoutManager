'use client';

import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {runtimeCadHeaders} from '@/features/g7-runtime/client';
import {safeBuildErrorCode} from '@/domain/scene-build-job';
import {SceneStatusController,uniqueSceneVersionIds,type SceneStatusSnapshot} from './scene-status-controller';
import type {SceneBatchRow} from '@/server/scene/scene-build-status-batch';

type SceneUiContext=Readonly<{rows:Record<string,SceneBatchRow>;enabled:boolean;
  loading:boolean;loadError:boolean;reload:()=>void}>;
const StatusContext=createContext<SceneUiContext|null>(null);
const labels:Record<SceneBatchRow['tone'],string>={
  neutral:'bg-slate-100 text-slate-600',pending:'bg-sky-50 text-sky-700',
  success:'bg-teal-50 text-teal-700',warning:'bg-amber-50 text-amber-700',
  error:'bg-red-50 text-red-700',
};
const phaseNames:Readonly<Record<string,string>>={
  UPLOAD_REGISTERED:'등록 완료',JOB_ENQUEUED:'작업 대기',SOURCE_READ:'원본 읽기',
  SOURCE_VERIFY:'원본 확인',FONT_PREPARE:'글꼴 준비',DXF_PARSE:'도면 해석',
  SCENE_BUILD:'Scene 생성',OPTIONAL_INDEX:'검색 정보 준비',SERIALIZE:'데이터 저장 준비',
  PAYLOAD_VALIDATE:'Scene 검증',STORAGE_VERIFY:'저장 확인',POINTER_PUBLISH:'Scene 게시',READY:'완료',
};
const errorNames:Readonly<Record<string,string>>={
  SCENE_STORAGE_FAILED:'Scene 저장 오류',SCENE_WORKER_UNAVAILABLE:'Worker 연결 오류',
  SCENE_BUILD_TIMEOUT:'Scene 생성 시간 초과',SCENE_DXF_PARSE_FAILED:'DXF 변환 오류',
  SCENE_AUTH_REVOKED:'작업 권한이 회수되었습니다',
  SCENE_SOURCE_DIGEST_MISMATCH:'원본 무결성 확인 실패',
  SCENE_SOURCE_UNAVAILABLE:'원본 파일을 확인할 수 없습니다',
  SCENE_VALIDATE_FAILED:'Scene 검증 오류',SCENE_PUBLISH_CONFLICT:'Scene 게시 충돌',
  SCENE_CONVERTER_UNAVAILABLE:'지원하지 않는 도면 형식',
  SCENE_FONT_UNAVAILABLE:'도면 글꼴을 준비하지 못했습니다',
  SCENE_SERIALIZE_FAILED:'Scene 데이터 생성 오류',
  SCENE_ASSET_TOO_LARGE:'Scene 데이터 크기 제한 초과',
  UNKNOWN:'자세한 내용은 관리자에게 문의해주세요',
};
export function SceneStatusProvider({versionIds,enabled,children}:{
  versionIds:readonly string[];enabled:boolean;children:React.ReactNode;
}){
  const idsKey=JSON.stringify(uniqueSceneVersionIds(versionIds));
  // A committed scope transition must start with empty state before effects run.
  // In particular, false→true and A→B→A cannot reuse an older Retry snapshot.
  return <SceneStatusProviderInner key={`${enabled}:${idsKey}`}
    versionIds={versionIds} enabled={enabled}>{children}</SceneStatusProviderInner>;
}
function SceneStatusProviderInner({versionIds,enabled,children}:{
  versionIds:readonly string[];enabled:boolean;children:React.ReactNode;
}){
  const idsKey=JSON.stringify(uniqueSceneVersionIds(versionIds));
  const ids=useMemo(()=>JSON.parse(idsKey) as string[],[idsKey]);
  const scopeKey=enabled?idsKey:'disabled';
  const [state,setState]=useState<{key:string;snapshot:SceneStatusSnapshot}>(()=>({
    key:scopeKey,snapshot:{rows:{},loading:false,loadError:false},
  }));
  const controllerRef=useRef<SceneStatusController|null>(null);
  const reload=useCallback(()=>controllerRef.current?.refresh(),[]);
  useEffect(()=>{
    if(!enabled||ids.length===0){controllerRef.current=null;return;}
    const controller=new SceneStatusController(ids,snapshot=>setState({key:scopeKey,snapshot}),
      ()=>document.visibilityState==='visible');
    controllerRef.current=controller;
    const visibility=()=>controller.visibilityChanged();
    document.addEventListener('visibilitychange',visibility);
    controller.start();
    return ()=>{
      controller.dispose();
      if(controllerRef.current===controller)controllerRef.current=null;
      document.removeEventListener('visibilitychange',visibility);
    };
  },[enabled,ids,scopeKey]);
  const visible=state.key===scopeKey&&enabled?state.snapshot:{
    rows:{},loading:false,loadError:false,
  };
  const {rows,loading,loadError}=visible;
  return <StatusContext.Provider value={{rows,enabled,loading,loadError,reload}}>
    {children}
  </StatusContext.Provider>;
}
export function SceneBuildStatusCell({versionId,fileFormat}:{
  versionId:string;fileFormat:string;
}){
  const ctx=useContext(StatusContext);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const row=ctx?.rows[versionId];
  const isDwg=fileFormat!=='DXF';
  async function retry(){
    if(busy||!row?.canRetry)return;
    setBusy(true);setError('');
    try{
      const headers=await runtimeCadHeaders({'Content-Type':'application/json'});
      const response=await fetch('/api/cad-files/'+encodeURIComponent(versionId)+'/scene-retry',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers,body:'{}',
      });
      if(!response.ok){
        if(response.status===401||response.status===403)
          throw new Error('로그인 또는 해당 사업장의 편집 권한을 확인해주세요.');
        if(response.status===409)
          throw new Error('재시도 조건이 변경되었습니다. 상태를 다시 확인해주세요.');
        throw new Error('재시도 요청을 처리하지 못했습니다.');
      }
      ctx?.reload();
    }catch(e){
      setError(e instanceof Error&&['로그인 또는 해당 사업장의 편집 권한을 확인해주세요.',
        '재시도 조건이 변경되었습니다. 상태를 다시 확인해주세요.',
        '재시도 요청을 처리하지 못했습니다.'].includes(e.message)?e.message:
        '재시도 요청에 실패했습니다.');
      ctx?.reload();
    }finally{setBusy(false);}
  }
  return <div aria-busy={ctx?.loading||busy} className="max-w-52 whitespace-normal text-xs">
    {isDwg?<span className="text-slate-400">해당 없음 (DWG)</span>:
     !ctx?.enabled?<span className="text-slate-400">자동 Scene 조회 비활성</span>:
     row?<div className="flex flex-col items-start gap-1">
        <span role="status" className={'rounded-full px-2.5 py-1 font-semibold '+labels[row.tone]}>{row.label}</span>
        {row.phase&&<span className="text-slate-500">{phaseNames[row.phase]??'작업 진행 중'}</span>}
        {['FAILED','BLOCKED','RETRY_WAIT'].includes(row.state)&&<span className="text-red-700">{errorNames[safeBuildErrorCode(row.errorCode)]}</span>}
        {row.canRetry&&<button type="button" disabled={busy||ctx.loading||ctx.loadError}
          className="rounded border border-slate-300 px-2 py-1 text-teal-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50"
          onClick={()=>void retry()}>{busy?'재시도 중…':'Scene 재시도'}</button>}
      </div>:
      <span role="status" className="text-slate-400">{ctx.loadError?'상태 조회 실패':ctx.loading?'상태 확인 중…':'조회 권한 확인 필요'}</span>}
    {!isDwg&&ctx?.enabled&&ctx.loadError&&<div className="mt-1 space-y-1"><span role="alert" className="block text-amber-700">Scene 상태를 확인하지 못했습니다.</span><button type="button" onClick={ctx.reload} disabled={ctx.loading}
      className="rounded border border-slate-300 px-2 py-1 text-teal-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50">상태 다시 확인</button></div>}
    {error&&<span role="alert" className="block text-red-700">{error}</span>}
  </div>;
}
