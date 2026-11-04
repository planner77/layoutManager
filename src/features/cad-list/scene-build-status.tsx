'use client';

import {createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {runtimeCadHeaders} from '@/features/g7-runtime/client';
import {shouldPollSceneRows} from '@/domain/scene-build-display';
import type {SceneBatchRow,SceneBatchResponse} from '@/server/scene/scene-build-status-batch';

type SceneUiContext=Readonly<{rows:Record<string,SceneBatchRow>;enabled:boolean;
  loading:boolean;loadError:boolean;reload:()=>void}>;
const StatusContext=createContext<SceneUiContext|null>(null);
const POLL_MS=5000;
const MAX_IDS=100;
const labels:Record<SceneBatchRow['tone'],string>={
  neutral:'bg-slate-100 text-slate-600',pending:'bg-sky-50 text-sky-700',
  success:'bg-teal-50 text-teal-700',warning:'bg-amber-50 text-amber-700',
  error:'bg-red-50 text-red-700',
};
const errorNames:Readonly<Record<string,string>>={
  SCENE_STORAGE_FAILED:'Scene 저장 오류',SCENE_WORKER_UNAVAILABLE:'Worker 연결 오류',
  SCENE_BUILD_TIMEOUT:'Scene 생성 시간 초과',SCENE_DXF_PARSE_FAILED:'DXF 변환 오류',
  SCENE_AUTH_REVOKED:'작업 권한이 회수되었습니다',
  SCENE_SOURCE_DIGEST_MISMATCH:'원본 무결성 확인 실패',
  SCENE_SOURCE_UNAVAILABLE:'원본 파일을 확인할 수 없습니다',
  SCENE_VALIDATE_FAILED:'Scene 검증 오류',SCENE_PUBLISH_CONFLICT:'Scene 게시 충돌',
  SCENE_CONVERTER_UNAVAILABLE:'지원하지 않는 도면 형식',
  UNKNOWN:'자세한 내용은 관리자에게 문의해주세요',
};
export function SceneStatusProvider({versionIds,enabled,children}:{
  versionIds:readonly string[];enabled:boolean;children:React.ReactNode;
}){
  const idsKey=versionIds.join(',');
  const ids=useMemo(()=>idsKey?idsKey.split(',').slice(0,MAX_IDS):[],[idsKey]);
  const [rows,setRows]=useState<Record<string,SceneBatchRow>>({});
  const [loading,setLoading]=useState(false);
  const [loadError,setLoadError]=useState(false);
  const [revision,setRevision]=useState(0);
  const reload=useCallback(()=>setRevision(n=>n+1),[]);
  useEffect(()=>{
    if(!enabled||ids.length===0)return;
    let alive=true;
    let timer:ReturnType<typeof setTimeout>|undefined;
    let controller:AbortController|undefined;
    const request=async()=>{
      if(!alive||document.visibilityState==='hidden')return;
      controller?.abort();
      controller=new AbortController();
      setLoading(true);
      let retry=false;
      try{
        const query=new URLSearchParams();
        for(const id of ids)query.append('versionId',id);
        const response=await fetch('/api/scene-build-jobs?'+query.toString(),{
          cache:'no-store',credentials:'same-origin',signal:controller.signal,
        });
        if(!response.ok)throw new Error('SCENE_STATUS_UNAVAILABLE');
        const result=await response.json() as SceneBatchResponse;
        if(!alive||!result||!result.rows||Array.isArray(result.rows))return;
        setRows(result.rows);
        setLoadError(false);
        retry=shouldPollSceneRows(Object.values(result.rows),true,enabled);
      }catch(error){
        if(!alive||(error instanceof Error&&error.name==='AbortError'))return;
        // Never reinterpret a transport failure as a FAILED Job.
        setLoadError(true);
        retry=true;
      }finally{
        if(alive){
          setLoading(false);
          if(retry&&document.visibilityState==='visible')
            timer=setTimeout(request,POLL_MS);
        }
      }
    };
    const visibility=()=>{
      if(timer)clearTimeout(timer);
      controller?.abort();
      if(document.visibilityState==='visible')void request();
    };
    document.addEventListener('visibilitychange',visibility);
    void request();
    return ()=>{alive=false;if(timer)clearTimeout(timer);controller?.abort();
      document.removeEventListener('visibilitychange',visibility);};
  },[enabled,ids,revision]);
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
      setError(e instanceof Error?e.message:'재시도 요청에 실패했습니다.');
      ctx?.reload();
    }finally{setBusy(false);}
  }
  return <div className="max-w-52 whitespace-normal text-xs">
    {isDwg?<span className="text-slate-400">해당 없음 (DWG)</span>:
     !ctx?.enabled?<span className="text-slate-400">자동 Scene 조회 비활성</span>:
     row?<div className="flex flex-col items-start gap-1">
        <span role="status" className={'rounded-full px-2.5 py-1 font-semibold '+labels[row.tone]}>{row.label}</span>
        {row.phase&&<span className="text-slate-500">{row.phase}</span>}
        {row.state==='FAILED'&&<span className="text-red-700">{errorNames[row.errorCode??'UNKNOWN']??errorNames.UNKNOWN}</span>}
        {row.canRetry&&<button type="button" disabled={busy}
          className="rounded border border-slate-300 px-2 py-1 text-teal-700 hover:bg-slate-50 disabled:opacity-50"
          onClick={()=>void retry()}>{busy?'재시도 중…':'Scene 재시도'}</button>}
      </div>:
      <span className="text-slate-400">{ctx.loadError?'상태 조회 실패':ctx.loading?'상태 확인 중…':'조회 권한 확인 필요'}</span>}
    {ctx?.loadError&&row&&<span className="block text-amber-700">상태 갱신 지연</span>}
    {error&&<span role="alert" className="block text-red-700">{error}</span>}
  </div>;
}
