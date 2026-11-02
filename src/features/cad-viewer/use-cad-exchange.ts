'use client';
import {useCallback,useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {ExchangeInventory,ExchangeObject,ExchangeOptions,ExchangeSelection,ExchangeSnapshot,ExchangeArtifact,ExchangeMemoInput} from '@/domain/cad-exchange';
import {exchangeOptionsFingerprint} from '@/domain/cad-exchange';
import type {ViewerManager} from '@/viewers/core/adapter';
import type {inspectExchangeSnapshot} from '@/viewers/three-dxf-viewer/exchange-export';
import {readExchangeIdentity,assertExchangeIdentity,readExchangeOutlines,assertExchangeServerUnchanged,
  ExchangeAuthorityError,type ExchangeIdentity,type ExchangeServerRead} from './exchange-authority';
import {readExchangeMemos,assertExchangeServerMemosUnchanged,exchangeServerMemoFingerprint,
  ExchangeMemoAuthorityError,type ExchangeMemoServerRead} from './exchange-memo-authority';
import {composeExchangeMemos,exchangeMemoVisualFingerprint,ExchangeMemoVisualError,type ExchangeMemoVisualSnapshot} from './exchange-memo-visual';
import {defaultExchangeMemoHeight} from './exchange-defaults';

// One transient job per browser page, including across Viewer route unmounts.
// This gate holds no CAD data and is only acquired from client events.
let held=false;
const listeners=new Set<()=>void>();
const subscribe=(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};};
const busySnapshot=()=>held,serverSnapshot=()=>false;
function acquire(){
  if(held)throw new Error('진행 중인 내보내기 정리가 끝난 후 다시 시도하세요.');
  held=true;for(const listener of listeners)listener();let released=false;
  return ()=>{if(released)return;released=true;held=false;for(const listener of listeners)listener();};
}
type Preview=ReturnType<typeof inspectExchangeSnapshot>;
type Context={manager:ViewerManager;token:string;epoch:number;identity:ExchangeIdentity};
export type ExchangeDialogData=Readonly<{
  inventory:ExchangeInventory;serverAvailable:boolean;canLoadServer:boolean;serverReason:string|null;
  memoServerAvailable:boolean;canLoadMemos:boolean;memoServerReason:string|null;
}>;
type Loaded=ExchangeDialogData&{context:Context;serverMeta:string|null;memoMeta:string|null;memoVisual:ExchangeMemoVisualSnapshot};
type PreparedExchange=Readonly<{
  snapshot:ExchangeSnapshot;options:ExchangeOptions;preview:Preview;ack:string;context:Context;
  serverRead:ExchangeServerRead|null;serverIds:readonly string[]|undefined;
  memoRead:ExchangeMemoServerRead|null;memoServerKeys:readonly string[]|undefined;
  memoProof:Readonly<{keys:readonly string[];fingerprint:string}>|null;
}>;
type State={scope:string;session:number;open:boolean;loading:boolean;data:Loaded|null;prepared:PreparedExchange|null;
  error:string|null;stage:string;result:{filename:string;report:ExchangeArtifact['report']}|null};
const empty=(scope:string):State=>({scope,session:0,open:false,loading:false,data:null,prepared:null,error:null,stage:'',result:null});
const obsolete=()=>new ExchangeAuthorityError('도면·카메라·개체 또는 계정이 변경됐습니다. 새로 조회하고 포함 범위를 확인하세요.');
function withoutServer(data:Loaded,error:string):Loaded{
  return {...data,serverAvailable:false,canLoadServer:false,serverMeta:null,serverReason:error,
    inventory:{...data.inventory,objects:data.inventory.objects.filter(item=>item.origin!=='SERVER_OUTLINE')}};
}
function withoutServerMemos(data:Loaded,error:string):Loaded{
  return {...data,memoServerAvailable:false,canLoadMemos:false,memoMeta:null,memoServerReason:error,
    memoVisual:{...data.memoVisual,items:data.memoVisual.items.filter(item=>item.input.origin==='LOCAL_MEMO')},
    inventory:{...data.inventory,objects:data.inventory.objects.filter(item=>item.origin!=='SERVER_MEMO')}};
}
function failedData(data:Loaded,error:unknown):Loaded|null{
  if(error instanceof ExchangeAuthorityError)return error.kind==='identity'?null:
    error instanceof ExchangeMemoAuthorityError?withoutServerMemos(data,error.message):withoutServer(data,error.message);
  if(error instanceof ExchangeMemoVisualError)return withoutServerMemos(data,error.message);
  return data;
}
function memoObjects(memos:readonly ExchangeMemoInput[]):ExchangeObject[]{
  return memos.map(memo=>({key:memo.key,origin:memo.origin,layer:'메모',name:memo.title,estimatedVertices:10,supported:true}));
}
function serverMeta(read:ExchangeServerRead){
  return JSON.stringify([read.sceneRevision,read.rows.map(row=>[
    row.id,row.revision,row.name,row.kind,row.outlineTypeId,row.outlineType?.name??null,
  ]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))]);
}
function serverObjects(read:ExchangeServerRead):ExchangeObject[]{
  return read.rows.map(row=>({key:'server:'+row.id,origin:'SERVER_OUTLINE',layer:'서버 외곽선',name:row.name,
    estimatedVertices:(row.geometry.type==='Polygon'?[row.geometry.coordinates]:row.geometry.coordinates)
      .reduce((n,poly)=>n+poly.reduce((sum,ring)=>sum+ring.length,0),0),supported:true}));
}
export function exchangeFilename(base:string,extension:'glb'|'gltf'){
  const clean=base.normalize('NFC').trim().replace(/\.(?:dxf|dwg|glb|gltf)$/i,'')
    .replace(/[\p{Cc}<>:"/\\|?*]/gu,'_').replace(/^[. ]+|[. ]+$/g,'');
  return (Array.from(clean).slice(0,120).join('')||'cad-export')+'.'+extension;
}

export function useCadExchange({versionId,sourceSha256,renderer,format,attempt,ready,getManager,getEpoch,getMemoVisuals}:{
  versionId:string;sourceSha256:string;renderer:string;format:string;attempt:number;ready:boolean;
  getManager:()=>ViewerManager|null;getEpoch:()=>number;
  getMemoVisuals:()=>ExchangeMemoVisualSnapshot;
}){
  const scope=versionId+':'+sourceSha256+':'+renderer+':'+format+':'+attempt;
  const [state,setState]=useState<State>(()=>empty(scope));
  const current=state.scope===scope?state:empty(scope);
  const mounted=useRef(false),liveScope=useRef(scope),query=useRef(0);
  const read=useRef<AbortController|null>(null),job=useRef<AbortController|null>(null);
  const urls=useRef(new Map<string,ReturnType<typeof setTimeout>>());
  const busy=useSyncExternalStore(subscribe,busySnapshot,serverSnapshot);
  const cancelOwned=useCallback(()=>{query.current++;read.current?.abort();job.current?.abort();},[]);
  useLayoutEffect(()=>{
    liveScope.current=scope;
    return cancelOwned;
  },[scope,cancelOwned]);
  useEffect(()=>{
    mounted.current=true;
    const owned=urls.current;
    return ()=>{mounted.current=false;cancelOwned();
      for(const [url,timer]of owned){clearTimeout(timer);URL.revokeObjectURL(url);}owned.clear();};
  },[cancelOwned]);
  const owns=useCallback(()=>mounted.current&&liveScope.current===scope,[scope]);
  const assertContext=useCallback((context:Context)=>{
    if(!owns()||!ready||getManager()!==context.manager||getEpoch()!==context.epoch||
      context.manager.getExchangeInventory()?.snapshotToken!==context.token)throw obsolete();
  },[owns,ready,getManager,getEpoch]);
  const patch=useCallback((value:Partial<State>)=>{
    if(owns())setState(previous=>({...previous,...value,scope}));
  },[owns,scope]);
  const invalidate=useCallback(()=>{
    query.current++;read.current?.abort();patch({prepared:null,error:null,result:null});
  },[patch]);
  const close=useCallback(()=>{
    query.current++;read.current?.abort();job.current?.abort();
    patch({open:false,loading:false,data:null,prepared:null,error:null,result:null});
  },[patch]);

  const open=useCallback(async()=>{
    if(held)return;
    read.current?.abort();const controller=new AbortController();read.current=controller;
    const at=++query.current;
    patch({...empty(scope),session:at,open:true,loading:true});
    try{
      // Capture after modal presentation/focus and its viewport sizing settle.
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      if(at!==query.current||controller.signal.aborted)return;
      const manager=getManager(),inventory=manager?.getExchangeInventory(),epoch=getEpoch();
      if(!ready||format!=='DXF'||renderer!=='three-dxf-viewer'||!manager||!inventory||
        inventory.scope.versionId!==versionId||inventory.scope.sourceSha256!==sourceSha256)
        throw new Error('준비된 DXF three-dxf-viewer에서 내보낼 수 있습니다.');
      const identity=await readExchangeIdentity(controller.signal);
      const context={manager,token:inventory.snapshotToken,epoch,identity};assertContext(context);
      const canLoadServer=identity.runtime==='ACTIVE'&&!!identity.actorId;
      await assertExchangeIdentity(identity,controller.signal);assertContext(context);
      if(at!==query.current||controller.signal.aborted)return;
      const memoVisual=getMemoVisuals();
      const localMemos=memoVisual.items.filter(item=>item.input.origin==='LOCAL_MEMO').map(item=>item.input);
      patch({loading:false,data:{inventory:{...inventory,objects:[...inventory.objects,...memoObjects(localMemos)]},
        context,canLoadServer,serverAvailable:false,serverMeta:null,memoVisual,memoMeta:null,
        memoServerAvailable:false,canLoadMemos:canLoadServer,
        memoServerReason:canLoadServer?'서버 메모는 선택한 뒤 조회·포함합니다.':'서버 메모는 로그인 및 해당 도면의 조회 권한이 필요합니다.',
        serverReason:canLoadServer?'서버 외곽선은 선택한 뒤 조회·포함합니다.':'서버 외곽선은 로그인 및 해당 도면의 조회 권한이 필요합니다.'}});
    }catch(error){if(!controller.signal.aborted&&at===query.current)
      patch({loading:false,error:error instanceof Error?error.message:'내보내기를 준비하지 못했습니다.'});}
  },[scope,patch,getManager,getEpoch,getMemoVisuals,ready,format,renderer,versionId,sourceSha256,assertContext]);

  const loadServer=useCallback(async()=>{
    const data=current.data;if(!data||held||!data.canLoadServer)return false;
    const release=acquire(),controller=new AbortController();read.current?.abort();read.current=controller;
    const at=++query.current;patch({loading:true,prepared:null,error:null,result:null,stage:'서버 외곽선 조회 중'});
    try{
      assertContext(data.context);
      const value=await readExchangeOutlines(data.inventory.scope,data.context.identity,controller.signal);
      assertContext(data.context);
      if(at!==query.current||controller.signal.aborted)return false;
      patch({loading:false,stage:'',data:{...data,serverAvailable:true,serverReason:null,serverMeta:serverMeta(value),
        inventory:{...data.inventory,objects:[...data.inventory.objects.filter(item=>item.origin!=='SERVER_OUTLINE'),...serverObjects(value)]}}});
      return true;
    }catch(error){if(!controller.signal.aborted&&at===query.current)
      patch({loading:false,stage:'',prepared:null,error:error instanceof Error?error.message:'서버 외곽선을 조회하지 못했습니다.',
        data:failedData(data,error)});return false;}
    finally{release();if(owns()&&at===query.current)patch({loading:false});}
  },[current.data,assertContext,patch,owns]);
  const excludeServer=useCallback(()=>{
    const data=current.data;if(!data||held)return;
    invalidate();patch({data:{...data,serverAvailable:false,serverMeta:null,
      serverReason:'서버 외곽선은 선택한 뒤 조회·포함합니다.',
      inventory:{...data.inventory,objects:data.inventory.objects.filter(item=>item.origin!=='SERVER_OUTLINE')}}});
  },[current.data,invalidate,patch]);

  const loadServerMemos=useCallback(async()=>{
    const data=current.data;if(!data||held||!data.canLoadMemos)return false;
    const release=acquire(),controller=new AbortController();read.current?.abort();read.current=controller;
    const at=++query.current;patch({loading:true,prepared:null,error:null,result:null,stage:'서버 메모 조회 중'});
    try{
      assertContext(data.context);
      const value=await readExchangeMemos(data.inventory.scope,data.context.identity,controller.signal);
      assertContext(data.context);
      if(at!==query.current||controller.signal.aborted)return false;
      const memoVisual=getMemoVisuals();
      patch({loading:false,stage:'',data:{...data,memoVisual,memoServerAvailable:true,memoServerReason:null,
        memoMeta:exchangeServerMemoFingerprint(value),inventory:{...data.inventory,objects:[
          ...data.inventory.objects.filter(item=>item.origin!=='SERVER_MEMO'),
          ...value.rows.map(row=>({key:'memo-server:'+row.id,origin:'SERVER_MEMO' as const,layer:'메모',name:row.title,
            estimatedVertices:10,supported:true}))]}}});
      return true;
    }catch(error){if(!controller.signal.aborted&&at===query.current)
      patch({loading:false,stage:'',prepared:null,error:error instanceof Error?error.message:'서버 메모를 조회하지 못했습니다.',data:failedData(data,error)});return false;}
    finally{release();if(owns()&&at===query.current)patch({loading:false});}
  },[current.data,assertContext,getMemoVisuals,patch,owns]);
  const excludeServerMemos=useCallback(()=>{
    const data=current.data;if(!data||held)return;
    invalidate();patch({data:{...data,memoServerAvailable:false,memoMeta:null,
      memoServerReason:'서버 메모는 선택한 뒤 조회·포함합니다.',
      inventory:{...data.inventory,objects:data.inventory.objects.filter(item=>item.origin!=='SERVER_MEMO')}}});
  },[current.data,invalidate,patch]);

  const prepare=useCallback(async(selection:ExchangeSelection,options:ExchangeOptions)=>{
    const data=current.data;if(!data||held)return;
    const release=acquire(),controller=new AbortController();read.current?.abort();read.current=controller;
    const at=++query.current;patch({loading:true,prepared:null,error:null,result:null,stage:'포함 범위 확인 중'});
    try{
      assertContext(data.context);await assertExchangeIdentity(data.context.identity,controller.signal);
      const needsServer=selection.generated.enabled&&(selection.generated.mode==='all'?data.serverAvailable:
        selection.generated.keys.some(key=>key.startsWith('server:')));
      let serverRead:ExchangeServerRead|null=null;
      if(needsServer){
        if(!data.serverAvailable)throw new Error('서버 외곽선을 다시 조회한 후 선택하세요.');
        serverRead=await readExchangeOutlines(data.inventory.scope,data.context.identity,controller.signal);
        if(serverMeta(serverRead)!==data.serverMeta)throw obsolete();
      }
      const needsServerMemos=selection.memos.enabled&&(selection.memos.mode==='all'?data.memoServerAvailable:
        selection.memos.ids.some(key=>key.startsWith('memo-server:')));
      let memoRead:ExchangeMemoServerRead|null=null;
      if(needsServerMemos){
        if(!data.memoServerAvailable)throw new ExchangeMemoAuthorityError('서버 메모를 다시 조회한 뒤 선택하세요.');
        memoRead=await readExchangeMemos(data.inventory.scope,data.context.identity,controller.signal);
        if(exchangeServerMemoFingerprint(memoRead)!==data.memoMeta)throw obsolete();
      }
      assertContext(data.context);controller.signal.throwIfAborted();
      const localKeys=selection.generated.keys.filter(key=>key.startsWith('local:'));
      const localSelection:ExchangeSelection={...selection,memos:{enabled:false,mode:'all',ids:[]},generated:{...selection.generated,keys:localKeys,
        enabled:selection.generated.enabled&&(selection.generated.mode==='all'||localKeys.length>0)}};
      const captured=data.context.manager.captureExchangeSnapshot(localSelection);
      const chosen=serverRead?serverRead.rows.filter(row=>selection.generated.mode==='all'||selection.generated.keys.includes('server:'+row.id)):[];
      let memos:ExchangeMemoInput[]=[],memoProof:PreparedExchange['memoProof']=null;
      if(selection.memos.enabled){
        const visual=getMemoVisuals();
        const localMemoKeys=data.memoVisual.items.filter(item=>item.input.origin==='LOCAL_MEMO'&&
          (selection.memos.mode==='all'||selection.memos.ids.includes(item.input.key))).map(item=>item.input.key);
        if(exchangeMemoVisualFingerprint(data.memoVisual,localMemoKeys)!==exchangeMemoVisualFingerprint(visual,localMemoKeys))
          throw new ExchangeMemoVisualError('로컬 메모가 변경됐습니다. 포함 범위를 다시 조회하세요.');
        memos=composeExchangeMemos(visual,memoRead?.rows??[],selection.memos);
        const keys=memos.map(memo=>memo.key);
        memoProof={keys,fingerprint:exchangeMemoVisualFingerprint(visual,keys)};
      }
      const snapshot:ExchangeSnapshot={...captured,selection,inventory:{...captured.inventory,
        objects:[...captured.inventory.objects,...(serverRead?serverObjects(serverRead):[]),...memoObjects(memos)]},memos,
        generated:[...captured.generated,...chosen.map(row=>({key:'server:'+row.id,origin:'SERVER_OUTLINE' as const,
          name:row.name,geometry:row.geometry,revision:row.revision,kind:row.kind,
          outlineTypeId:row.outlineTypeId,outlineTypeName:row.outlineType?.name??null}))]};
      const resolvedOptions=selection.memos.enabled&&options.memoTextHeightMetres===undefined
        ?{...options,memoTextHeightMetres:defaultExchangeMemoHeight(snapshot,options.unit)}:options;
      const encoder=await import('@/viewers/three-dxf-viewer/exchange-export');
      const preview=encoder.inspectExchangeSnapshot(snapshot,resolvedOptions);
      assertContext(data.context);await assertExchangeIdentity(data.context.identity,controller.signal);
      if(at!==query.current||controller.signal.aborted)return;
      patch({loading:false,stage:'',error:snapshot.primitives.length+snapshot.generated.length+memos.length===0?
        '선택한 범위에 지원 형상이 없습니다. 아래 제외 사유를 확인하고 범위를 다시 선택하세요.':null,
        prepared:{snapshot,options:resolvedOptions,preview,context:data.context,
        ack:exchangeOptionsFingerprint(snapshot,resolvedOptions),serverRead,
        serverIds:selection.generated.mode==='all'?undefined:chosen.map(row=>row.id),memoRead,memoProof,
        memoServerKeys:selection.memos.mode==='all'?undefined:memos.filter(memo=>memo.origin==='SERVER_MEMO').map(memo=>memo.key)}});
    }catch(error){if(!controller.signal.aborted&&at===query.current)
      patch({loading:false,stage:'',prepared:null,data:failedData(data,error),
        error:error instanceof Error?error.message:'포함 범위를 확인하지 못했습니다.'});}
    finally{release();if(owns()&&at===query.current)patch({loading:false});}
  },[current.data,patch,assertContext,getMemoVisuals,owns]);

  const download=useCallback(async(acknowledged:boolean)=>{
    const prepared=current.prepared;if(!prepared||held)return;
    if(!prepared.snapshot.primitives.length&&!prepared.snapshot.generated.length&&!prepared.snapshot.memos?.length){
      patch({error:'지원 형상이 없는 범위는 다운로드할 수 없습니다.'});return;
    }
    if(prepared.preview.partial&&!acknowledged){patch({error:'제외·확인 불가 항목을 확인하고 부분 내보내기에 동의하세요.'});return;}
    const release=acquire(),controller=new AbortController();job.current=controller;
    patch({error:null,result:null,stage:'파일 준비 중'});
    try{
      assertContext(prepared.context);await assertExchangeIdentity(prepared.context.identity,controller.signal);
      if(prepared.serverRead)await assertExchangeServerUnchanged(prepared.serverRead,prepared.serverIds,controller.signal);
      if(prepared.memoRead)await assertExchangeServerMemosUnchanged(prepared.memoRead,prepared.memoServerKeys,controller.signal);
      if(prepared.memoProof&&exchangeMemoVisualFingerprint(getMemoVisuals(),prepared.memoProof.keys)!==prepared.memoProof.fingerprint)
        throw new ExchangeMemoVisualError('메모 또는 연결 대상이 변경됐습니다. 포함 범위를 다시 확인하세요.');
      assertContext(prepared.context);
      const {buildExchangeArtifact}=await import('@/viewers/three-dxf-viewer/exchange-export');
      const artifact=await buildExchangeArtifact(prepared.snapshot,{...prepared.options,
        ...(acknowledged?{partialAck:prepared.ack}:{})},{signal:controller.signal,onStage:stage=>
          patch({stage:stage==='serialize'?'파일 생성 중':stage==='font'?'한글 글꼴 준비 중':stage==='rasterize'?'메모 텍스처 생성 중':'형상 준비 중'})});
      patch({stage:'조회 권한과 내용 재확인 중'});
      await assertExchangeIdentity(prepared.context.identity,controller.signal);
      if(prepared.serverRead)await assertExchangeServerUnchanged(prepared.serverRead,prepared.serverIds,controller.signal);
      if(prepared.memoRead)await assertExchangeServerMemosUnchanged(prepared.memoRead,prepared.memoServerKeys,controller.signal);
      if(prepared.memoProof&&exchangeMemoVisualFingerprint(getMemoVisuals(),prepared.memoProof.keys)!==prepared.memoProof.fingerprint)
        throw new ExchangeMemoVisualError('메모 또는 연결 대상이 변경됐습니다. 포함 범위를 다시 확인하세요.');
      controller.signal.throwIfAborted();assertContext(prepared.context);
      const buffer=new ArrayBuffer(artifact.bytes.byteLength);new Uint8Array(buffer).set(artifact.bytes);
      const url=URL.createObjectURL(new Blob([buffer],{type:artifact.mime}));
      const timer=setTimeout(()=>{URL.revokeObjectURL(url);urls.current.delete(url);},1500);urls.current.set(url,timer);
      const filename=exchangeFilename(prepared.options.filenameBase,artifact.extension),link=document.createElement('a');
      link.href=url;link.download=filename;document.body.append(link);try{link.click();}finally{link.remove();}
      patch({prepared:null,stage:'',result:{filename,report:artifact.report}});
    }catch(error){if(!controller.signal.aborted)patch({stage:'',prepared:null,
      ...(current.data?{data:failedData(current.data,error)}:{}),
      error:error instanceof Error?error.message:'내보내기를 완료하지 못했습니다.'});}
    finally{if(job.current===controller)job.current=null;release();if(owns())patch({stage:''});}
  },[current.prepared,current.data,patch,assertContext,getMemoVisuals,owns]);

  const prepared=current.prepared;
  return {opened:current.open&&ready,sessionId:current.session,data:current.data?{inventory:current.data.inventory,
    serverAvailable:current.data.serverAvailable,canLoadServer:current.data.canLoadServer,serverReason:current.data.serverReason,
    memoServerAvailable:current.data.memoServerAvailable,canLoadMemos:current.data.canLoadMemos,memoServerReason:current.data.memoServerReason}:null,
    loading:current.loading,busy,
    prepared:prepared?{preview:prepared.preview,ack:prepared.ack,
      included:prepared.snapshot.primitives.length+prepared.snapshot.generated.length+(prepared.snapshot.memos?.length??0),
      generated:prepared.snapshot.generated.length,memos:prepared.snapshot.memos?.length??0,
      memoTextHeightMetres:prepared.options.memoTextHeightMetres}:null,
    error:current.error,stage:current.stage,result:current.result,
    open,close,invalidate,prepare,download,loadServer,excludeServer,loadServerMemos,excludeServerMemos};
}
