'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FullscreenLayerPanel } from '@/features/cad-viewer/fullscreen-layer-panel';
import { ViewerAppShell } from '@/features/cad-viewer/viewer-app-shell';
import { ViewerMenuBar } from '@/features/cad-viewer/viewer-menu-bar';
import type { ViewerCommandGroup } from '@/features/cad-viewer/viewer-command-menu';
import { OutlineTreePanel } from '@/features/cad-viewer/outline-tree-panel';
import { GeneratedDeleteDialog } from '@/features/cad-viewer/generated-delete-dialog';
import { CadMemoOverlay } from '@/features/cad-viewer/cad-memo-overlay';
import { CadMemoTreePanel } from '@/features/cad-viewer/cad-memo-tree-panel';
import {CadMemoSettingsEditor} from '@/features/cad-viewer/cad-memo-settings-editor';
import {assignMemoToGroup,createMemoGroup,emptyMemoTreeState,isMemoVisible,removeMemoGroup,removeMemoTreeEntry,
 renameMemoGroup,setMemoGroupVisible,setMemoVisible,type MemoTreeState} from '@/domain/memo-tree';
import type {MemoSettingsInput} from '@/domain/memo-schedule';
import { CadMemoEditor, type MemoEditorFields } from '@/features/cad-viewer/cad-memo-editor';
import { createPreviewUuid } from '@/features/cad-viewer/preview-uuid';
import { MemoSession, parseMemoWcsXY, assertMemoWcsXY, type MemoDraft, type MemoWcsXY, type PersistedMemoDraft } from '@/domain/cad-memo';
import { readPersistedMemos, mutatePersistedMemo,mutatePersistedMemoGroup,mutatePersistedMemoAnchor,resetPersistedBusiness,type MemoServerMode,type PersistedMemoGroup } from './cad-business-client';
import { loadStoredOutlines, mutateStoredOutline, type StoredOutline } from './persisted-outline-client';
import { PersistedOutlineOverlay } from './persisted-outline-overlay';
import {parseWcsTranslation,selectedTranslationIds} from '@/domain/generated-translate';
import { initialViewerAppState, viewerAppReducer } from '@/features/cad-viewer/viewer-app-state';
import { isLiveOutlineRequest, outlineToolUnavailableReason, effectiveOutlineBasis } from '@/features/cad-viewer/outline-tool-policy';
import { ViewerManager, type OutlineInfo, type SavedOutline, type SavedOutlineOverlayState } from '@/viewers/core/adapter';
import {buildOutlineExport,buildServerSourceOutlineExport} from '@/domain/outline-draft';
import {canvasEditCapability,type CanvasObjectRef} from '@/domain/canvas-object-selection';
import {getGeneratedDeleteShortcut,getGeneratedHistoryShortcut} from '@/domain/generated-keyboard';
import {
  prepareGeneratedDelete,assertGeneratedDeleteCurrent,type GeneratedDeleteRequest,
} from '@/domain/generated-delete';
import {resolveOutlineAssignment,selectableOutlineTypes,type ScopedOutlineCatalog} from '@/domain/outline-assignment';
import type {OutlineKind,OutlineEntity} from '@/viewers/core/outline-geometry';
import type {OutlineResult} from '@/viewers/core/outline-compute';
import type { ViewerMetric } from '@/viewers/core/metrics';
import { selectRenderer, type ViewerFormat, type ViewerRenderer } from '@/viewers/core/selection';
import { ViewerSource } from '@/viewers/core/source';
import { cadViewerUrl, cadMemoViewerUrl } from '@/viewers/core/link';
import { ViewerLoadError, isViewerCancellation } from '@/viewers/core/viewer-load-error';
import {runtimeCadHeaders} from '@/features/g7-runtime/client';
import type {SceneWorkCommand,SceneWorkState} from '@/domain/scene-work';
import type {ResetMode} from '@/domain/cad-reset';
import {MemoSessionSnapStore,nearestMemoSnap,
  type MemoSnapCandidate,type SessionSnapProjection} from '@/domain/memo-session-snap';
import {SceneWorkTools} from './scene-work-tools';

export function CadViewer({
  versionId,
  sourceSha256 = '',
  renderer: initialRenderer = 'three-dxf-viewer',
  format = 'DXF',
  displayName,
  originalFilename,
  version,
  locationId,
  locationDescription,
  registeredAt,
  fileSize,
  description,
  outlineTypeCatalog = null,
  sourceMode = 'scene-first',
  requestedMemoId = null,
  memoLinkInvalid = false,
}: {
  versionId: string;
  sourceSha256?: string;
  renderer?: ViewerRenderer;
  format?: ViewerFormat;
  displayName: string;
  originalFilename: string;
  version: number;
  locationId: string;
  locationDescription: string;
  registeredAt: string;
  fileSize: number;
  description?: string | null;
  /** Must be loaded only through #65's verified session/server scope; no browser lab fallback. */
  outlineTypeCatalog?: ScopedOutlineCatalog | null;
  sourceMode?:'scene-first'|'build';
  requestedMemoId?:string|null;
  memoLinkInvalid?:boolean;
}) {
  const [renderer, setRenderer] = useState(selectRenderer(format, initialRenderer));
  const [source] = useState(() => new ViewerSource());
  const [sceneMode,setSceneMode]=useState(sourceMode);
  const [sceneCandidate,setSceneCandidate]=useState(false);
  const [sceneBusy,setSceneBusy]=useState(false);
  const [resetBusy,setResetBusy]=useState(false);
  const [sceneNotice,setSceneNotice]=useState<string|null>(null);
  const expectedSceneRevision=useRef<number|null>(null);
  const sceneRequest=useRef<AbortController|null>(null);
  useEffect(()=>()=>sceneRequest.current?.abort(),[]);
  const container = useRef<HTMLDivElement>(null);
  const viewerShell = useRef<HTMLDivElement>(null);
  const manager = useRef<ViewerManager | null>(null);
  const memoSession = useRef<MemoSession | null>(null);
  // Browser-only associations. No localStorage, server DTO or unsaved target UUID promotion.
  const sessionSnaps=useRef<MemoSessionSnapStore|null>(null);
  const [sessionSnapProjection,setSessionSnapProjection]=useState<Record<string,SessionSnapProjection>>({});
  const [pendingSnap,setPendingSnap]=useState<MemoSnapCandidate|null>(null);
  const memoDragActive = useRef(false);
  const viewEpoch = useRef(0);
  const viewFrame = useRef(0);
  const [viewRevision, setViewRevision] = useState(0);
  const [memoCancelSignal, setMemoCancelSignal] = useState(0);
  const [memoLifecycleKey, setMemoLifecycleKey] = useState(() => versionId + ':' + sourceSha256);
  const [memos, setMemos] = useState<MemoDraft[]>([]);
  const [memoTree,setMemoTree]=useState<MemoTreeState>(emptyMemoTreeState);
  const [memoGroupRecords,setMemoGroupRecords]=useState<PersistedMemoGroup[]>([]);
  const [memoFeaturesAvailable,setMemoFeaturesAvailable]=useState(false);
  const [memoAllVisible,setMemoAllVisible]=useState(true);
  const [memoTransientFocusId,setMemoTransientFocusId]=useState<string|null>(null);
  const [memoTreeError,setMemoTreeError]=useState<string|null>(null);
  const [memoPlacing, setMemoPlacing] = useState(false);
  const [memoCandidate, setMemoCandidate] = useState<MemoWcsXY | null>(null);
  const [memoSelectedId, setMemoSelectedId] = useState<string | null>(null);
  const [memoAnchorTarget,setMemoAnchorTarget]=useState('');
  const [memoFields, setMemoFields] = useState<MemoEditorFields>({title:'',content:'',x:'0',y:'0'});
  const [memoError, setMemoError] = useState<string|null>(null);
  const [memoDeleteArmed, setMemoDeleteArmed] = useState(false);
  const [memoServerMode,setMemoServerMode]=useState<MemoServerMode>('checking');
  const memoDeepLinkApplied=useRef<string|null>(null);
  const [memoLinkNotice,setMemoLinkNotice]=useState<{message:string;retryable:boolean}|null>(null);
  // Memo HTTP retries must not advance the CAD source/renderer 'attempt' epoch.
  const [memoDetailRetry,setMemoDetailRetry]=useState(0);
  const [memoListRetry,setMemoListRetry]=useState(0);
  const [memoBusy,setMemoBusy]=useState(false);
  const memoSavingRef=useRef(false);
  const getViewEpoch = useCallback(() => viewEpoch.current, []);
  const onMemoGestureActive = useCallback((active:boolean) => { memoDragActive.current = active; }, []);
  const onAdapterViewChange = useCallback(() => {
    viewEpoch.current++;
    if (memoDragActive.current) {
      memoDragActive.current = false;
      setMemoCancelSignal(previous => previous + 1);
    }
    if (!viewFrame.current) {
      viewFrame.current = requestAnimationFrame(() => {
        viewFrame.current = 0;
        setViewRevision(previous => previous + 1);
      });
    }
  }, []);
  useEffect(() => () => { if(viewFrame.current) cancelAnimationFrame(viewFrame.current); }, []);
  const memoScope = { versionId, sourceSha256 };
  // Only a visual projection. Persisted MemoDraft remains server-owned and unchanged.
  // Session snapshots disappear on renderer/Version reload.
  const memoScoped = memoLifecycleKey === versionId + ':' + sourceSha256;
  const scopedMemos = memoScoped ? memos.map(m=>{
    const projection=sessionSnapProjection[m.id];
    return projection?{...m,anchorWcsXY:projection.world}:m;
  }) : [];
  const canvasMemos=scopedMemos.filter(m=>
    (memoAllVisible&&m.visible!==false&&isMemoVisible(memoTree,m.id))||
    memoTransientFocusId===m.id);
  const getSessionSnapStore=useCallback(()=>{
    if(!sessionSnaps.current||!sessionSnaps.current.matches({versionId,sourceSha256}))
      sessionSnaps.current=new MemoSessionSnapStore({versionId,sourceSha256});
    return sessionSnaps.current;
  },[versionId,sourceSha256]);
  const syncSessionSnaps=useCallback(()=>{
    const store=sessionSnaps.current;
    if(store?.matches({versionId,sourceSha256}))
      setSessionSnapProjection(store.reconcile(manager.current?.getMemoSnapTargets()??[]));
  },[versionId,sourceSha256]);
  const nearestSessionSnap=useCallback((point:MemoWcsXY):MemoSnapCandidate|null=>{
    const current=manager.current;
    if(!current||renderer!=='three-dxf-viewer'||format!=='DXF')return null;
    return nearestMemoSnap({versionId,sourceSha256},point,current.getMemoSnapTargets(true),
      p=>current.projectWcsToCanvas(p),12);
  },[versionId,sourceSha256,renderer,format]);
  const getMemoSession = () => {
    if (!memoSession.current || !memoSession.current.matches(memoScope)) {
      memoSession.current = new MemoSession(memoScope);
    }
    return memoSession.current;
  };
  const resetMemos = useCallback(() => {
    memoSession.current?.clear();
    memoSession.current = null;
    sessionSnaps.current?.clear();sessionSnaps.current=null;
    setSessionSnapProjection({});setPendingSnap(null);
    setMemoLifecycleKey(versionId + ':' + sourceSha256);
    memoDragActive.current = false;
    setMemoCancelSignal(previous => previous + 1);
    setMemos([]);
    setMemoTree(emptyMemoTreeState);
    setMemoGroupRecords([]);
    setMemoFeaturesAvailable(false);
    setMemoAllVisible(true);
    setMemoTransientFocusId(null);
    setMemoTreeError(null);
    setMemoServerMode('checking');
    setMemoPlacing(false);
    setMemoCandidate(null);
    setMemoSelectedId(null);
    setMemoAnchorTarget('');
    setMemoFields({title:'',content:'',x:'0',y:'0'});
    setMemoError(null);
    setMemoDeleteArmed(false);
  }, [versionId,sourceSha256]);
  useEffect(() => {
    // Version/SHA changes are an explicit destructive M1 session boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetMemos();
  }, [versionId, sourceSha256, resetMemos]);
  // Synchronously gate events before React's reducer has rendered the next frame.
  const outlineEnabledRef = useRef(false);
  const outlineRequestRevisionRef = useRef(0);
  const getManager = useCallback(() => manager.current, []);
  const loadSequenceRef = useRef(0);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const fallbackTried = useRef(false);
  const fallbackReason = useRef<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [infoOpen,setInfoOpen]=useState(false);
  const [nameTipOpen,setNameTipOpen]=useState(false);
  const [nameTipPinned,setNameTipPinned]=useState(false);
  const nameTipRef=useRef<HTMLDivElement>(null);
  const nameButtonRef=useRef<HTMLButtonElement>(null);
  const suppressNameFocus=useRef(false);
  const [linkFallbackUrl,setLinkFallbackUrl]=useState<{renderer:ViewerRenderer;url:string}|null>(null);
  const [appState, dispatchApp] = useReducer(viewerAppReducer, initialViewerAppState);
  const [isCompact,setIsCompact]=useState(false);
  useEffect(()=>{
    const media=window.matchMedia('(max-width: 767px)');
    const update=()=>{setIsCompact(media.matches);if(media.matches)dispatchApp({type:'compact-exclusive'});};
    media.addEventListener('change',update);
    const frame=requestAnimationFrame(update);
    return ()=>{cancelAnimationFrame(frame);media.removeEventListener('change',update);};
  },[]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // No server/anonymous fallback: OFF keeps #82 session-only; ACTIVE reloads #83 persisted data.
  useEffect(()=>{
    if(format!=='DXF'||renderer!=='three-dxf-viewer'||!/^[a-f0-9]{64}$/i.test(sourceSha256))return;
    const controller=new AbortController();
    void readPersistedMemos(versionId,controller.signal).then(result=>{
      if(controller.signal.aborted)return;
      if(result.mode==='active'){
        const session=new MemoSession({versionId,sourceSha256});
        for(const item of result.memos)session.acceptPersisted(item,{versionId,sourceSha256});
        memoSession.current=session;
        setMemoLifecycleKey(versionId+':'+sourceSha256);
        setMemos(session.list());
        setMemoGroupRecords(result.groups);
        setMemoFeaturesAvailable(result.featuresAvailable);
        setMemoTree({...emptyMemoTreeState,
          groups:result.groups.map(g=>({id:g.id,name:g.name})),
          groupByMemo:Object.fromEntries(result.memos.filter(m=>m.groupId).map(m=>[m.id,m.groupId!]))});
      }else{
        setMemoFeaturesAvailable(false);setMemoGroupRecords([]);
      }
      setMemoServerMode(result.mode);
      setMemoError(null);
    }).catch(error=>{
      if(controller.signal.aborted)return;
      memoSession.current=null;setMemos([]);setMemoGroupRecords([]);setMemoFeaturesAvailable(false);
      setMemoServerMode('unavailable');
      setMemoError(error instanceof Error?error.message:'메모 목록을 읽지 못했습니다.');
    });
    return ()=>controller.abort();
  },[versionId,sourceSha256,renderer,format,attempt,memoListRetry]);

  const [layers, setLayers] = useState<string[]>([]);
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(() => new Set());
  const [metric, setMetric] = useState<ViewerMetric | null>(null);
  // A direct URL, reload or list navigation always starts in CSS immersive mode.
  // Native fullscreen can only be requested after an explicit user gesture.
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [outlineInfo,setOutlineInfo]=useState<OutlineInfo|null>(null);
  const [outlineMode,setOutlineMode]=useState<'pan'|'select'>('pan');
  const [outlineBasis,setOutlineBasis]=useState<'render'|'source'>('render');
  const [outlineSelection,setOutlineSelection]=useState<OutlineEntity[]>([]);
  const [canvasMode,setCanvasMode]=useState<'pan'|'objects'|'generated'>('pan');
  const [canvasSelection,setCanvasSelection]=useState<CanvasObjectRef[]>([]);
  const [preview,setPreview]=useState<OutlineResult|null>(null);
  const [previewError,setPreviewError]=useState<string|null>(null);
  const [savedCount,setSavedCount]=useState(0);
  const [savedOutlines,setSavedOutlines]=useState<SavedOutline[]>([]);
  const [savedOverlayStates,setSavedOverlayStates]=useState<SavedOutlineOverlayState[]>([]);
  const [generatedHistory,setGeneratedHistory]=useState({undo:0,redo:0,limit:100});
  const [sceneWork,setSceneWork]=useState<SceneWorkState>({objects:[],undo:0,redo:0,limit:100});
  const [sceneWorkError,setSceneWorkError]=useState<string|null>(null);
  const [deleteRequest,setDeleteRequest]=useState<GeneratedDeleteRequest|null>(null);
  const [deleteError,setDeleteError]=useState<string|null>(null);
  const [translateX,setTranslateX]=useState('0');
  const [translateY,setTranslateY]=useState('0');
  const [translateError,setTranslateError]=useState<string|null>(null);
  const [contextMenu,setContextMenu]=useState<{x:number;y:number}|null>(null);
  const [selectedOutlineTypeId,setSelectedOutlineTypeId]=useState('');
  const [outlineName,setOutlineName]=useState('');
  const [outlineNotice,setOutlineNotice]=useState<string|null>(null);
  const [storedOutlines,setStoredOutlines]=useState<StoredOutline[]>([]);
  const [storedSceneRevision,setStoredSceneRevision]=useState<number|null>(null);
  const [storedOutlineHidden,setStoredOutlineHidden]=useState<ReadonlySet<string>>(()=>new Set());
  const [storedOutlineBusy,setStoredOutlineBusy]=useState(false);
  const [storedOutlineError,setStoredOutlineError]=useState<string|null>(null);
  const [savedServerIds,setSavedServerIds]=useState<ReadonlySet<string>>(()=>new Set());
  useEffect(()=>{
    if(memoServerMode!=='active'||format!=='DXF'||renderer!=='three-dxf-viewer')return;
    const controller=new AbortController();
    void loadStoredOutlines(versionId,controller.signal).then(result=>{
      if(controller.signal.aborted)return;
      setStoredOutlines(result.outlines.filter(x=>x.versionId===versionId&&x.sourceSha256===sourceSha256));
      setStoredSceneRevision(result.sceneRevision);
      setStoredOutlineHidden(new Set());
      setStoredOutlineError(null);
    }).catch(error=>{
      if(controller.signal.aborted)return;
      setStoredOutlines([]);setStoredSceneRevision(null);
      setStoredOutlineError(error instanceof Error?error.message:'서버 외곽선을 불러오지 못했습니다.');
    });
    return ()=>controller.abort();
  },[memoServerMode,versionId,sourceSha256,renderer,format,attempt]);

  const [state, setState] = useState<{ status: string; ready: boolean; error?: string; warning?: string }>({
    status: '도면 로딩 중…',
    ready: false,
  });

  useEffect(() => () => source.dispose(), [source, versionId]);
  useEffect(()=>{
    const url=new URL(window.location.href);
    if(url.searchParams.get('renderer')!==renderer){url.searchParams.set('renderer',renderer);window.history.replaceState(null,'',url);}
  },[renderer]);
  useEffect(()=>{
    if(!nameTipPinned)return;
    const outside=(event:PointerEvent)=>{if(!nameTipRef.current?.contains(event.target as Node)){setNameTipPinned(false);setNameTipOpen(false);}};
    document.addEventListener('pointerdown',outside,true);
    return ()=>document.removeEventListener('pointerdown',outside,true);
  },[nameTipPinned]);

  useEffect(() => {
    const shell = viewerShell.current;
    const handleFullscreenChange = () => setIsNativeFullscreen(document.fullscreenElement === shell);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (document.fullscreenElement === shell) void document.exitFullscreen?.().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const root = document.documentElement;
    const appHeader = document.querySelector<HTMLElement>('[data-app-header]');
    const headerWasInert = appHeader?.inert ?? false;
    const previousFocus = document.activeElement;
    root.classList.add('cad-viewer-immersive');
    if (appHeader) appHeader.inert = true;
    viewerShell.current?.focus({ preventScroll: true });
    return () => {
      root.classList.remove('cad-viewer-immersive');
      if (appHeader) appHeader.inert = headerWasInert;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Highest priority is a pending selection/tool cancellation in the adapter.
      // An open search pane consumes the next Escape; only then exit native/CSS.
      if (searchOpen) {
        event.preventDefault();
        setSearchOpen(false);
        return;
      }
      if (document.fullscreenElement === viewerShell.current) {
        event.preventDefault();
        void document.exitFullscreen?.().catch(() => undefined);
        return;
      }
      setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, searchOpen]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return () => window.cancelAnimationFrame(frame);
  }, [isFullscreen]);

  // The canvas host does not remount when a dock is opened/closed.
  // All adapters observe size directly or subscribe to the window resize event.
  useEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);


  /** Both Tree/Export and history are projections of one generated document. */
  const syncSavedOutlines = useCallback(() => {
    setSavedOutlines(manager.current?.getSavedOutlines() ?? []);
    setSavedOverlayStates(manager.current?.getSavedOutlineStates() ?? []);
    setGeneratedHistory(manager.current?.getGeneratedHistory() ?? {undo:0,redo:0,limit:100});
    setSceneWork(manager.current?.getSceneWorkState() ?? {objects:[],undo:0,redo:0,limit:100});
    syncSessionSnaps();
  }, [syncSessionSnaps]);
  /** Snapshot intent before confirmation, revalidate against the live Version on commit. */
  const openDelete = useCallback((savedOutlineId?:string) => {
    const current=manager.current;
    if(!current || renderer!=='three-dxf-viewer' || format!=='DXF' ||
       !state.ready || canvasMode==='pan' || outlineEnabledRef.current){
      setDeleteError('생성 개체 편집 모드에서만 삭제할 수 있습니다. 먼저 생성 개체만 선택하세요.');
      return;
    }
    try {
      // A Tree action must never strip SOURCE silently from a mixed selection.
      if(savedOutlineId){
        if(current.getCanvasObjectSelection().some(ref=>ref.origin!=='GENERATED'))
          throw new Error('SOURCE/혼합 선택은 읽기 전용입니다. 생성 개체만 다시 선택하세요.');
        if(!current.selectSavedOutline(savedOutlineId))
          throw new Error('삭제할 생성 개체가 없거나 숨김 상태입니다.');
      }
      const request=prepareGeneratedDelete(current.getCanvasObjectSelection(),
        current.getGeneratedObjects(),{versionId,sourceSha256});
      current.cancelGeneratedCommand();
      setContextMenu(null);
      setDeleteError(null);
      setDeleteRequest(request);
    }catch(error){
      setDeleteError(error instanceof Error?error.message:'삭제 대상을 확인하지 못했습니다.');
      setContextMenu(null);
    }
  },[renderer,format,state.ready,canvasMode,versionId,sourceSha256,setDeleteRequest]);
  const confirmDelete = useCallback(() => {
    if(!deleteRequest)return;
    try {
      const current=manager.current;
      if(!current || renderer!=='three-dxf-viewer'||format!=='DXF'||
         !state.ready||canvasMode==='pan'||outlineEnabledRef.current)
        throw new Error('편집 모드 또는 도면이 변경되어 삭제하지 않았습니다.');
      assertGeneratedDeleteCurrent(deleteRequest,current.getCanvasObjectSelection(),
        current.getGeneratedObjects(),{versionId,sourceSha256});
      current.executeGeneratedCommand({type:'Delete',ids:deleteRequest.targets.map(t=>t.id)});
      setDeleteError(null);
      syncSavedOutlines();
    }catch(error){
      setDeleteError(error instanceof Error?error.message:'삭제가 거부되었습니다.');
    }finally{
      setDeleteRequest(null);
    }
  },[deleteRequest,renderer,format,state.ready,canvasMode,versionId,sourceSha256,syncSavedOutlines]);
  const applyTranslation=useCallback(()=>{
    try{
      const current=manager.current;
      if(!current||renderer!=='three-dxf-viewer'||format!=='DXF'||
         !state.ready||canvasMode==='pan'||outlineEnabledRef.current)
        throw new Error('생성 개체 편집 모드에서 현재 도면을 연 뒤 이동하세요.');
      const {dx,dy}=parseWcsTranslation(translateX,translateY);
      const ids=selectedTranslationIds(
        current.getCanvasObjectSelection(),current.getGeneratedObjects(),{versionId,sourceSha256});
      current.executeGeneratedCommand({type:'Translate',ids,dx,dy});
      setTranslateError(null);
      syncSavedOutlines();
    }catch(error){
      setTranslateError(error instanceof Error?error.message:'이동이 거부되었습니다.');
    }
  },[renderer,format,state.ready,canvasMode,translateX,translateY,versionId,sourceSha256,syncSavedOutlines]);
  useEffect(()=>{
    if(!contextMenu)return;
    const close=(event:PointerEvent)=>{
      const target=event.target as HTMLElement|null;
      if(!target?.closest?.('[data-testid="generated-context-menu"]'))setContextMenu(null);
    };
    window.addEventListener('pointerdown',close,true);
    return ()=>window.removeEventListener('pointerdown',close,true);
  },[contextMenu]);
  const closeMemoEditor = useCallback(() => {
    memoDragActive.current = false;
    setMemoCancelSignal(previous => previous + 1);
    setMemoPlacing(false);
    setMemoCandidate(null);
    setPendingSnap(null);
    setMemoSelectedId(null);
    setMemoDeleteArmed(false);
    setMemoError(null);
  }, []);
  useEffect(() => {
    const handleKeyDown = (event:KeyboardEvent) => {
      if(event.key==='Escape' && deleteRequest){
        event.preventDefault();event.stopImmediatePropagation();
        setDeleteRequest(null);return;
      }
      if(event.key==='Escape' && contextMenu){
        event.preventDefault();event.stopImmediatePropagation();
        setContextMenu(null);return;
      }
      if(event.key==='Escape' && viewerShell.current?.querySelector('[role=menu]'))return;
      // A floating Viewer panel drag owns ESC before memo/canvas/fullscreen layers.
      if(event.key==='Escape' && viewerShell.current?.querySelector('[data-viewer-panel-dragging="true"]'))return;
      if(event.key==='Escape' && memoDragActive.current){
        event.preventDefault();event.stopImmediatePropagation();
        memoDragActive.current=false;
        setMemoCancelSignal(previous=>previous+1);
        return;
      }
      if(event.key==='Escape' && (memoPlacing || memoCandidate || memoSelectedId)){
        event.preventDefault();event.stopImmediatePropagation();
        closeMemoEditor();return;
      }
      if(event.key==='Escape' && nameTipOpen){
        event.preventDefault();event.stopImmediatePropagation();setNameTipOpen(false);setNameTipPinned(false);suppressNameFocus.current=true;requestAnimationFrame(()=>nameButtonRef.current?.focus({preventScroll:true}));return;
      }
      if(event.key==='Escape' && infoOpen){
        event.preventDefault();event.stopImmediatePropagation();setInfoOpen(false);return;
      }
      const mobileDrawer=viewerShell.current?.querySelector<HTMLElement>('[role=dialog][data-drawer]');
      const focusedDrawer=event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-drawer]') : null;
      const drawer=mobileDrawer??focusedDrawer;
      if(event.key==='Escape' && drawer){
        event.preventDefault();event.stopImmediatePropagation();
        const name=drawer.dataset.drawer;
        if(name==='search'){
          setSearchOpen(false);
          requestAnimationFrame(()=>viewerShell.current?.querySelector<HTMLButtonElement>('[data-testid="cad-text-search-trigger"]')?.focus({preventScroll:true}));
          return;
        }
        if(name==='layers')dispatchApp({type:'close-layers'});
        else if(name==='outlines')dispatchApp({type:'toggle-outline-tree'});
        else if(name==='memos')dispatchApp({type:'toggle-memo-tree'});
        else if(name==='tools')dispatchApp({type:'close-tools'});
        requestAnimationFrame(()=>viewerShell.current?.querySelector<HTMLButtonElement>('[data-viewer-group=work]')?.focus({preventScroll:true}));
        return;
      }
      if(event.key==='Escape' && manager.current?.cancelGeneratedCommand()){
        event.preventDefault();event.stopImmediatePropagation();return;
      }
      // A real WebGL canvas focus (never search/forms/tree/buttons) is required.
      const canvasFocused=event.target instanceof HTMLCanvasElement &&
        !!container.current?.contains(event.target);
      if(!deleteRequest && getGeneratedDeleteShortcut(event,canvasFocused) &&
         state.ready && canvasMode!=='pan' && !outlineEnabledRef.current){
        event.preventDefault();event.stopImmediatePropagation();
        openDelete();return;
      }
      if(deleteRequest)return;
      const action=getGeneratedHistoryShortcut(event);
      if(!action || !viewerShell.current?.contains(document.activeElement))return;
      const history=manager.current?.getGeneratedHistory();
      if(!history || (action==='undo'?history.undo:history.redo)===0)return;
      event.preventDefault();
      if(action==='undo')manager.current?.undoGeneratedEdit();
      else manager.current?.redoGeneratedEdit();
      syncSavedOutlines();
    };
    // Capture ahead of native fullscreen/selection handling for staged edit ESC.
    window.addEventListener('keydown',handleKeyDown,true);
    return ()=>window.removeEventListener('keydown',handleKeyDown,true);
  },[syncSavedOutlines,deleteRequest,contextMenu,state.ready,canvasMode,openDelete,nameTipOpen,infoOpen,memoPlacing,memoCandidate,memoSelectedId,closeMemoEditor]);
  const stopOutlineEditing = useCallback(() => {
    // Must cancel the Worker BEFORE clearing selection: selection callbacks can
    // otherwise enqueue a new compute job for the previous previewKind.
    outlineRequestRevisionRef.current++;
    manager.current?.cancelOutlinePreview();
    manager.current?.clearOutlineSelection();
    manager.current?.setSelectionMode('pan');
    setOutlineMode('pan');
    setOutlineSelection([]);
    setPreview(null);
    setPreviewError(null);
  }, []);
  const resetOutline = useCallback(() => {
    outlineEnabledRef.current = false;
    stopOutlineEditing();
    setOutlineInfo(null);
    setSavedCount(0);
    setSavedOutlines([]);
    setSavedOverlayStates([]);
    setGeneratedHistory({undo:0,redo:0,limit:100});
    setSceneWork({objects:[],undo:0,redo:0,limit:100});setSceneWorkError(null);
    setOutlineBasis('render');
    setDeleteRequest(null);setDeleteError(null);setContextMenu(null);
    setTranslateX('0');setTranslateY('0');setTranslateError(null);
    setCanvasMode('pan');
    setCanvasSelection([]);
    setSelectedOutlineTypeId('');
    setOutlineName('');
    setOutlineNotice(null);
  }, [stopOutlineEditing,setDeleteRequest]);
  /** One transition for new-memo placement, existing pin press, and recent-list selection.
   * Cancel outline Worker before clearing Source selection, so stale previews cannot restart.
   * Do not call this from render or synthesize an authorization/DB update. */
  const beginMemoInteraction = useCallback((id?:string):boolean => {
    if (!memoScoped || renderer!=='three-dxf-viewer' || format!=='DXF' ||
        loading || !state.ready || !/^[a-f0-9]{64}$/i.test(sourceSha256)) return false;
    if (id && (!memoSession.current?.matches({versionId,sourceSha256}) ||
               !memoSession.current.get(id))) return false;
    if (outlineEnabledRef.current) {
      outlineEnabledRef.current=false;
      stopOutlineEditing();
      dispatchApp({type:'set-outline-tool',enabled:false});
    }
    manager.current?.cancelGeneratedCommand();
    manager.current?.clearCanvasObjectSelection();
    manager.current?.setSelectionMode('pan');
    setCanvasMode('pan');
    setDeleteRequest(null);
    setContextMenu(null);
    return true;
  },[memoScoped,renderer,format,loading,state.ready,versionId,sourceSha256,stopOutlineEditing]);

  const selectMemo = useCallback((id:string,fromTree=false) => {
    const item = memoSession.current?.matches({versionId,sourceSha256})
      ? memoSession.current.get(id) : undefined;
    if (!item || !beginMemoInteraction(id)) return;
    setMemoPlacing(false);
    setMemoCandidate(null);
    setMemoSelectedId(id);
    setMemoAnchorTarget(item.anchor?.mode==='ATTACHED'&&item.anchor.targetRef
      ?item.anchor.targetRef.origin+':'+item.anchor.targetRef.id:'');
    if (!fromTree && !appState.toolsOpen) dispatchApp({type:'toggle-tools',exclusive:isCompact});
    setMemoDeleteArmed(false);
    setMemoError(null);
    // Re-selecting an already open memo is a focus action, not a discard-draft command.
    if (memoSelectedId !== id) {
      setMemoFields({
        title:item.title,content:item.content,
        x:String(sessionSnapProjection[id]?.world.x??item.anchorWcsXY.x),
        y:String(sessionSnapProjection[id]?.world.y??item.anchorWcsXY.y),
      });
    }
  }, [beginMemoInteraction,memoSelectedId,versionId,sourceSha256,appState.toolsOpen,isCompact,sessionSnapProjection]);
  const settingsFrom=(m:MemoDraft):MemoSettingsInput=>({
    scheduleEnabled:m.scheduleEnabled??false,startDate:m.startDate??null,dueDate:m.dueDate??null,
    completionEnabled:m.completionEnabled??false,isCompleted:m.isCompleted??false
  });
  const focusMemoFromTree=(id:string)=>{
    const m=scopedMemos.find(x=>x.id===id);
    if(!m)return;
    selectMemo(id,true);
    setMemoTransientFocusId((!memoAllVisible||m.visible===false||!isMemoVisible(memoTree,id))?id:null);
    if(!manager.current?.focusBounds({minX:m.anchorWcsXY.x-3,maxX:m.anchorWcsXY.x+3,
      minY:m.anchorWcsXY.y-3,maxY:m.anchorWcsXY.y+3}))
      setMemoTreeError('메모 WCS로 이동할 수 없습니다.');
  };
  // Render the link input/capability errors directly, without synchronously
  // setting React state in an effect. A copy success is not a retryable error.
  const memoLinkGateNotice = memoLinkInvalid
    ? '메모 링크 형식이 올바르지 않습니다. 일반 도면 보기만 가능합니다.'
    : requestedMemoId && (format!=='DXF'||renderer!=='three-dxf-viewer')
      ? '이 렌더러에서는 메모 위치 이동을 지원하지 않습니다. three-dxf-viewer로 열어주세요.'
      : requestedMemoId && (memoServerMode==='off'||memoServerMode==='unavailable')
        ? '영속 메모를 조회할 수 없습니다. 로그인 및 메모 읽기 권한을 확인하세요.'
        : null;
  // #88: revalidate exact memo through the server-side G7 Permission check,
  // only after the same Version/SHA renderer has finished loading.
  useEffect(()=>{
    if(!requestedMemoId||format!=='DXF'||renderer!=='three-dxf-viewer'||
       memoServerMode!=='active'||loading||!state.ready)return;
    const key=[versionId,sourceSha256,renderer,attempt,requestedMemoId,memoDetailRetry].join(':');
    if(memoDeepLinkApplied.current===key)return;
    const controller=new AbortController();
    const url='/api/cad-files/'+encodeURIComponent(versionId)+'/memos/'+encodeURIComponent(requestedMemoId);
    void fetch(url,{credentials:'same-origin',cache:'no-store',signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error(response.status===401?'로그인이 필요합니다.':
        response.status===403?'메모 조회 권한이 없습니다.':
        response.status===404?'메모가 삭제되었거나 해당 Version에 존재하지 않습니다.':
        '메모 조회에 실패했습니다 ('+response.status+').');
      return await response.json() as PersistedMemoDraft;
    }).then(item=>{
      if(controller.signal.aborted||memoDeepLinkApplied.current===key)return;
      if(item.id!==requestedMemoId||item.versionId!==versionId||
         item.sourceSha256.toLowerCase()!==sourceSha256.toLowerCase()||!item.persisted)
        throw new Error('메모의 Version 또는 원본 SHA가 일치하지 않습니다.');
      if(item.anchor?.mode==='BROKEN_ANCHOR')
        throw new Error('연결된 메모 앵커가 손상되어 자동 위치 이동을 중단했습니다.');
      const point=assertMemoWcsXY(item.anchorWcsXY);
      const doc=memoSession.current;
      if(!doc?.matches({versionId,sourceSha256}))
        throw new Error('다른 도면의 메모를 표시할 수 없습니다.');
      doc.acceptPersisted(item,{versionId,sourceSha256});
      if(!manager.current?.focusBounds({minX:point.x-3,maxX:point.x+3,
        minY:point.y-3,maxY:point.y+3}))
        throw new Error('메모 좌표를 표시할 수 없습니다. CAD 로딩 상태를 확인하세요.');
      memoDeepLinkApplied.current=key;
      setMemos(doc.list());
      selectMemo(item.id,true);
      setMemoTransientFocusId((!memoAllVisible||item.visible===false||
        !isMemoVisible(memoTree,item.id))?item.id:null);
      if(!appState.memoTreeOpen)dispatchApp({type:'toggle-memo-tree',exclusive:isCompact});
      setMemoLinkNotice({message:'공유된 메모 위치로 이동했습니다. 숨김 상태는 서버에 변경하지 않았습니다.',
        retryable:false});
    }).catch(error=>{
      if(controller.signal.aborted)return;
      setMemoLinkNotice({message:error instanceof Error?error.message:'메모 위치 이동에 실패했습니다.',
        retryable:true});
    });
    return ()=>controller.abort();
  },[requestedMemoId,versionId,sourceSha256,renderer,format,attempt,memoDetailRetry,
    memoServerMode,loading,state.ready,selectMemo,memoAllVisible,memoTree,
    appState.memoTreeOpen,isCompact]);

  function copyMemoLink(id:string){
    const item=memoSession.current?.matches({versionId,sourceSha256})
      ?memoSession.current.get(id):undefined;
    if(memoServerMode!=='active'||!item?.persisted||!memoAvailable)return;
    const url=cadMemoViewerUrl(window.location.origin,versionId,item.id);
    if(!navigator.clipboard?.writeText){
      setLinkFallbackUrl({renderer,url});
      setMemoLinkNotice({message:'클립보드를 사용할 수 없습니다. 아래 메모 링크를 직접 복사하세요.',retryable:false});
      return;
    }
    void navigator.clipboard.writeText(url).then(()=>{
      setLinkFallbackUrl(null);
      setMemoLinkNotice({message:'메모 링크를 복사했습니다.',retryable:false});
    }).catch(()=>{
      setLinkFallbackUrl({renderer,url});
      setMemoLinkNotice({message:'메모 링크를 복사하지 못했습니다. 아래 링크를 직접 복사하세요.',retryable:false});
    });
  }
  async function changeMemoMeta(id:string,update:{groupId?:string|null;visible?:boolean;settings?:MemoSettingsInput}){
    if(memoSavingRef.current)return;
    memoSavingRef.current=true;setMemoBusy(true);
    try{
      const doc=getMemoSession(),old=doc.get(id);
      if(!old)throw new Error('메모가 없습니다.');
      const groupId=update.groupId===undefined?(old.groupId??null):update.groupId;
      const visible=update.visible??old.visible??true;
      const settings=update.settings??settingsFrom(old);
      if(memoServerMode==='active'){
        if(!memoFeaturesAvailable)throw new Error('기존 설치에서는 M4/M5 영속 메타데이터를 쓸 수 없습니다. 신규 설치가 필요합니다.');
        if(old.revision===undefined)throw new Error('Revision을 확인할 수 없습니다.');
        doc.acceptPersisted(await mutatePersistedMemo('PATCH',versionId,{
          expectedRevision:old.revision,operation:'metadata',groupId,visible,...settings
        },id) as PersistedMemoDraft,{versionId,sourceSha256});
      }else if(memoServerMode==='off'){
        doc.updateMetadata(id,{groupId,visible,settings},{versionId,sourceSha256});
      }else throw new Error('서버가 준비되지 않았습니다.');
      setMemos(doc.list());
      setMemoTree(current=>{
        const groupByMemo={...current.groupByMemo};
        if(groupId===null)delete groupByMemo[id];else groupByMemo[id]=groupId;
        return {...current,groupByMemo};
      });
      setMemoTreeError(null);setMemoError(null);
    }catch(error){const msg=error instanceof Error?error.message:'메모 속성 변경 실패';
      setMemoTreeError(msg);setMemoError(msg);
    }finally{memoSavingRef.current=false;setMemoBusy(false);}
  }
  const localTree=(fn:()=>MemoTreeState):boolean=>{
    try{setMemoTree(fn());setMemoTreeError(null);return true;}
    catch(error){setMemoTreeError(error instanceof Error?error.message:'그룹 작업 오류');return false;}
  };
  const reloadMemoGroups=async()=>{
    const result=await readPersistedMemos(versionId,new AbortController().signal);
    if(result.mode!=='active')throw new Error('메모 조회를 완료하지 못했습니다.');
    const doc=new MemoSession({versionId,sourceSha256});
    for(const m of result.memos)doc.acceptPersisted(m,{versionId,sourceSha256});
    memoSession.current=doc;setMemos(doc.list());
    setMemoGroupRecords(result.groups);setMemoFeaturesAvailable(result.featuresAvailable);
    setMemoTree({...emptyMemoTreeState,groups:result.groups.map(g=>({id:g.id,name:g.name})),
      groupByMemo:Object.fromEntries(result.memos.filter(m=>m.groupId).map(m=>[m.id,m.groupId!]))});
    setMemoTransientFocusId(null);
  };
  const createTreeGroup=(name:string):boolean=>{
    if(memoServerMode!=='active')return localTree(()=>createMemoGroup(memoTree,createPreviewUuid(),name));
    if(!memoFeaturesAvailable){setMemoTreeError('신규 Greenfield 설치에서만 메모 그룹을 저장할 수 있습니다.');return false;}
    void mutatePersistedMemoGroup('POST',versionId,{sourceSha256,name})
      .then(g=>{if('deleted' in g)throw new Error('그룹 생성 응답 오류');
        setMemoGroupRecords(a=>[...a,g]);setMemoTree(a=>({...a,groups:[...a.groups,{id:g.id,name:g.name}]}));})
      .catch(e=>setMemoTreeError(e instanceof Error?e.message:'그룹 생성 실패'));
    return true;
  };
  const renameTreeGroup=(id:string,name:string):boolean=>{
    if(memoServerMode!=='active')return localTree(()=>renameMemoGroup(memoTree,id,name));
    const old=memoGroupRecords.find(g=>g.id===id);
    if(!old)return false;
    void mutatePersistedMemoGroup('PATCH',versionId,{expectedRevision:old.revision,operation:'rename',name},id)
      .then(g=>{if('deleted' in g)throw new Error('그룹 변경 응답 오류');
        setMemoGroupRecords(a=>a.map(x=>x.id===id?g:x));
        setMemoTree(a=>renameMemoGroup(a,id,g.name));})
      .catch(e=>setMemoTreeError(e instanceof Error?e.message:'그룹 이름 변경 실패'));
    return true;
  };
  const deleteTreeGroup=(id:string)=>{
    if(memoServerMode==='off'){
      if(!localTree(()=>removeMemoGroup(memoTree,id)))return;
      // M1 session tree and canonical MemoSession metadata must agree when
      // schedule/completion is subsequently saved (Codex P2 #4429007642).
      const doc=getMemoSession();
      for(const memo of doc.list().filter(m=>memoTree.groupByMemo[m.id]===id)){
        doc.updateMetadata(memo.id,{groupId:null,visible:memo.visible??true,
          settings:settingsFrom(memo)},{versionId,sourceSha256});
      }
      setMemos(doc.list());
      return;
    }
    if(memoServerMode!=='active')return;
    const old=memoGroupRecords.find(g=>g.id===id);
    if(!old||!window.confirm('그룹을 삭제하고 메모를 미분류로 이동할까요?'))return;
    void mutatePersistedMemoGroup('DELETE',versionId,{expectedRevision:old.revision},id)
      .then(()=>reloadMemoGroups())
      .catch(e=>setMemoTreeError(e instanceof Error?e.message:'그룹 삭제 실패'));
  };
  const assignTreeGroup=(id:string,groupId:string|null)=>{
    if(memoServerMode==='off'&&!localTree(()=>
      assignMemoToGroup(memoTree,id,groupId,scopedMemos)))return;
    if(memoServerMode!=='off'&&memoServerMode!=='active')return;
    // Persisted path is CAS; M1 path updates MemoSession, not merely Tree UI.
    void changeMemoMeta(id,{groupId});
  };
  const placeMemo = useCallback((point:MemoWcsXY) => {
    // 12 CSS px threshold; closed polygon vertices and visible 2D render
    // endpoints/centers only. Never promotes the session target to a DB ref.
    const candidate=nearestSessionSnap(point);
    const snapped=candidate?.world??point;
    setPendingSnap(candidate);
    setMemoCandidate(snapped);
    setMemoPlacing(false);
    setMemoDeleteArmed(false);
    setMemoError(null);
    setMemoFields(previous=>({...previous,x:String(snapped.x),y:String(snapped.y)}));
  }, [nearestSessionSnap]);
  const moveMemoFromCanvas = useCallback((id:string,point:MemoWcsXY) => {
    if(memoSavingRef.current)return;
    void (async()=>{
      memoSavingRef.current=true;setMemoBusy(true);
      try {
        const doc=getMemoSession();
        const old=doc.get(id);
        if(!old)throw new Error('메모를 찾을 수 없습니다.');
        const snap=nearestSessionSnap(point),to=snap?.world??point;
        let item:MemoDraft;
        if(memoServerMode==='active'){
          if(!old.persisted||old.revision===undefined)throw new Error('저장된 메모의 revision이 없습니다.');
          item=doc.acceptPersisted(await mutatePersistedMemo('PATCH',versionId,{
            expectedRevision:old.revision,operation:'move',anchorWcsXY:to
          },id) as PersistedMemoDraft,{versionId,sourceSha256});
        }else if(memoServerMode==='off'){
          item=doc.move(id,to,{versionId,sourceSha256});
        }else throw new Error('메모 서버 확인이 완료되지 않았습니다.');
        if(snap)getSessionSnapStore().attach(id,snap);
        else sessionSnaps.current?.detach(id);
        syncSessionSnaps();
        setMemos(doc.list());setMemoError(null);setMemoSelectedId(id);
        setMemoFields(previous=>({...previous,
          ...(id===memoSelectedId?{}:{title:item.title,content:item.content}),
          x:String(item.anchorWcsXY.x),y:String(item.anchorWcsXY.y)}));
      }catch(error){setMemoError(error instanceof Error?error.message:'메모 이동이 취소되었습니다.');}
      finally{memoSavingRef.current=false;setMemoBusy(false);}
    })();
  // Only a committed pointer-up invokes this callback.
  // The session binding stays private; the server receives only a free WCS coordinate.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[versionId,sourceSha256,memoSelectedId,memoServerMode,nearestSessionSnap,getSessionSnapStore,syncSessionSnaps]);
  function startMemoPlacement() {
    if (!memoAvailable) return;
    if (memoPlacing) { closeMemoEditor(); return; }
    if (!beginMemoInteraction()) return;
    if (!appState.toolsOpen) dispatchApp({type:'toggle-tools',exclusive:isCompact});
    setMemoSelectedId(null);
    setMemoCandidate(null);
    setPendingSnap(null);
    setMemoFields({title:'',content:'',x:'0',y:'0'});
    setMemoDeleteArmed(false);
    setMemoError(null);
    setMemoPlacing(true);
  }
  function placeMemoAtEnteredWcs() {
    try { placeMemo(parseMemoWcsXY(memoFields.x,memoFields.y)); }
    catch(error){ setMemoError(error instanceof Error?error.message:'WCS 좌표가 유효하지 않습니다.'); }
  }
  async function createMemo() {
    if(!memoCandidate||!memoAvailable||memoSavingRef.current)return;
    memoSavingRef.current=true;setMemoBusy(true);
    try{
      const doc=getMemoSession();
      const requested=parseMemoWcsXY(memoFields.x,memoFields.y);
      // Revalidate against live geometry at commit: an old candidate is never
      // authoritative after a camera or target transform change.
      const candidate=nearestSessionSnap(requested);
      const location=candidate?.world??requested;
      let created:MemoDraft;
      if(memoServerMode==='active'){
        created=doc.acceptPersisted(await mutatePersistedMemo('POST',versionId,{
          sourceSha256,title:memoFields.title,content:memoFields.content,anchorWcsXY:location
        }) as PersistedMemoDraft,{versionId,sourceSha256});
      }else if(memoServerMode==='off'){
        created=doc.create({id:createPreviewUuid(),anchorWcsXY:location,
          title:memoFields.title,content:memoFields.content},{versionId,sourceSha256});
      }else throw new Error('메모 저장 서버 확인이 필요합니다.');
      if(candidate){getSessionSnapStore().attach(created.id,candidate);syncSessionSnaps();}
      setPendingSnap(null);
      setMemos(doc.list());selectMemo(created.id);setMemoError(null);
    }catch(error){setMemoError(error instanceof Error?error.message:'메모를 작성할 수 없습니다.');}
    finally{memoSavingRef.current=false;setMemoBusy(false);}
  }
  async function saveMemoText() {
    if(!memoSelectedId||!memoAvailable||memoSavingRef.current)return;
    memoSavingRef.current=true;setMemoBusy(true);
    try{
      const doc=getMemoSession();
      if(memoServerMode==='active'){
        const old=doc.get(memoSelectedId);
        if(!old?.persisted||old.revision===undefined)throw new Error('메모 revision이 없습니다.');
        doc.acceptPersisted(await mutatePersistedMemo('PATCH',versionId,{
          expectedRevision:old.revision,operation:'text',
          title:memoFields.title,content:memoFields.content
        },memoSelectedId) as PersistedMemoDraft,{versionId,sourceSha256});
      }else if(memoServerMode==='off'){
        doc.editText(memoSelectedId,memoFields.title,memoFields.content,{versionId,sourceSha256});
      }else throw new Error('메모 저장 서버 확인이 필요합니다.');
      setMemos(doc.list());setMemoError(null);
    }catch(error){setMemoError(error instanceof Error?error.message:'메모 텍스트를 저장할 수 없습니다.');}
    finally{memoSavingRef.current=false;setMemoBusy(false);}
  }
  async function moveMemoFromFields() {
    if(!memoSelectedId||!memoAvailable||memoSavingRef.current)return;
    memoSavingRef.current=true;setMemoBusy(true);
    try{
      const doc=getMemoSession(),requested=parseMemoWcsXY(memoFields.x,memoFields.y);
      const snap=nearestSessionSnap(requested),to=snap?.world??requested;
      let item:MemoDraft;
      if(memoServerMode==='active'){
        const old=doc.get(memoSelectedId);
        if(!old?.persisted||old.revision===undefined)throw new Error('메모 revision이 없습니다.');
        item=doc.acceptPersisted(await mutatePersistedMemo('PATCH',versionId,{
          expectedRevision:old.revision,operation:'move',anchorWcsXY:to
        },memoSelectedId) as PersistedMemoDraft,{versionId,sourceSha256});
      }else if(memoServerMode==='off'){
        item=doc.move(memoSelectedId,to,{versionId,sourceSha256});
      }else throw new Error('메모 저장 서버 확인이 필요합니다.');
      if(snap)getSessionSnapStore().attach(item.id,snap);
      else sessionSnaps.current?.detach(item.id);
      syncSessionSnaps();
      setMemos(doc.list());
      setMemoFields(previous=>({...previous,x:String(item.anchorWcsXY.x),y:String(item.anchorWcsXY.y)}));
      setMemoError(null);
    }catch(error){setMemoError(error instanceof Error?error.message:'메모 좌표를 이동할 수 없습니다.');}
    finally{memoSavingRef.current=false;setMemoBusy(false);}
  }
  async function deleteMemo() {
    if(!memoSelectedId||!memoDeleteArmed||!memoAvailable||memoSavingRef.current)return;
    memoSavingRef.current=true;setMemoBusy(true);
    try{
      const doc=getMemoSession();
      if(memoServerMode==='active'){
        const old=doc.get(memoSelectedId);
        if(!old?.persisted||old.revision===undefined)throw new Error('메모 revision이 없습니다.');
        await mutatePersistedMemo('DELETE',versionId,{expectedRevision:old.revision},memoSelectedId);
      }else if(memoServerMode!=='off')throw new Error('메모 저장 서버 확인이 필요합니다.');
      doc.remove(memoSelectedId,{versionId,sourceSha256});
      setMemoTree(current=>removeMemoTreeEntry(current,memoSelectedId));
      setMemoTransientFocusId(null);
      sessionSnaps.current?.detach(memoSelectedId);syncSessionSnaps();
      setMemos(doc.list());closeMemoEditor();
    }catch(error){setMemoError(error instanceof Error?error.message:'메모 삭제가 취소되었습니다.');}
    finally{memoSavingRef.current=false;setMemoBusy(false);}
  }
  /** #84: keep actual server ownership, source provenance and revision as authority. */
  async function changeMemoAnchor(operation:'attach'|'detach'){
    if(!memoSelectedId||memoServerMode!=='active'||memoSavingRef.current)return;
    memoSavingRef.current=true;setMemoBusy(true);
    try{
      const doc=getMemoSession(),old=doc.get(memoSelectedId);
      if(!old?.persisted||old.revision===undefined)throw new Error('영속 메모만 스냅할 수 있습니다.');
      const colon=memoAnchorTarget.indexOf(':');
      const origin=colon<0?'':memoAnchorTarget.slice(0,colon),id=colon<0?'':memoAnchorTarget.slice(colon+1);
      if(operation==='attach'&&
         ((origin!=='APP_CREATED'&&origin!=='DXF_IMPORTED')||!id))
        throw new Error('유효한 영속 객체를 먼저 선택하세요.');
      await mutatePersistedMemoAnchor(versionId,memoSelectedId,{
        expectedRevision:old.revision,operation,
        ...(operation==='attach'?{targetOrigin:origin as 'APP_CREATED'|'DXF_IMPORTED',targetId:id}:{})
      });
      const response=await fetch('/api/cad-files/'+encodeURIComponent(versionId)+'/memos/'+encodeURIComponent(memoSelectedId),{
        credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw new Error('변경된 메모 재조회가 필요합니다.');
      doc.acceptPersisted(await response.json() as PersistedMemoDraft,{versionId,sourceSha256});
      // Explicit server link always supersedes a temporary viewer-only binding.
      sessionSnaps.current?.detach(memoSelectedId);syncSessionSnaps();
      setMemos(doc.list());setMemoError(null);
    }catch(error){setMemoError(error instanceof Error?error.message:'메모 연결을 변경할 수 없습니다. 재조회하세요.');}
    finally{memoSavingRef.current=false;setMemoBusy(false);}
  }
  /** Explicitly commit the last displayed WCS on disconnect.
   * For a persisted Memo, this is an authenticated PATCH (and detaches any
   * persisted anchor); the transient relationship itself is never persisted.
   */
  async function detachSessionSnap(){
    if(!memoSelectedId||memoSavingRef.current)return;
    const currentProjection=sessionSnapProjection[memoSelectedId];
    if(!currentProjection)return;
    memoSavingRef.current=true;setMemoBusy(true);
    try{
      const doc=getMemoSession(),old=doc.get(memoSelectedId);
      if(!old)throw new Error('메모가 현재 Version에 없습니다.');
      let updated:MemoDraft;
      if(memoServerMode==='active'){
        if(!old.persisted||old.revision===undefined)throw new Error('메모 revision이 없습니다.');
        updated=doc.acceptPersisted(await mutatePersistedMemo('PATCH',versionId,{
          expectedRevision:old.revision,operation:'move',anchorWcsXY:currentProjection.world,
        },memoSelectedId) as PersistedMemoDraft,{versionId,sourceSha256});
      }else if(memoServerMode==='off'){
        updated=doc.move(memoSelectedId,currentProjection.world,{versionId,sourceSha256});
      }else throw new Error('메모 저장 상태를 확인할 수 없습니다.');
      sessionSnaps.current?.detach(memoSelectedId);syncSessionSnaps();
      setMemoFields(previous=>({...previous,
        x:String(updated.anchorWcsXY.x),y:String(updated.anchorWcsXY.y)}));
      setMemos(doc.list());setMemoError(null);
    }catch(error){setMemoError(error instanceof Error?error.message:'임시 연결 해제 및 좌표 확정이 실패했습니다.');}
    finally{memoSavingRef.current=false;setMemoBusy(false);}
  }
  /** #167: server CAS + soft-delete audit before any session SceneWork reset. */
  async function resetOrigin(mode:ResetMode){
    if(resetBusy||sceneBusy||loading||!state.ready||renderer!=='three-dxf-viewer'||format!=='DXF')return;
    const current=manager.current;
    if(!current||memoServerMode==='unavailable'||memoServerMode==='checking'){
      setSceneNotice('초기화 전에 인증·메모 상태를 확인해야 합니다.');return;
    }
    const permanentMemos=scopedMemos.filter(m=>m.persisted&&m.revision!==undefined);
    const title=mode==='SOURCE_ONLY'?'DXF 기반 객체만 초기화':'전체 객체 초기화';
    const editedScene=sceneWork.objects.filter(o=>!o.visible||
      o.transform.some((n,i)=>n!==[1,0,0,1,0,0][i])).length;
    const warning=mode==='ALL'
      ?'해당 Version의 APP_CREATED와 영속 메모를 논리 삭제하고 감사는 유지합니다.'
      :'APP_CREATED와 FREE 메모는 유지합니다. SOURCE 연결은 마지막 WCS를 보존하고 끊습니다.';
    if(!window.confirm(title+'\\nVersion: '+version+'\\n원본 객체 작업 변경: '+editedScene+
        '건\\n영속 외곽선: '+storedOutlines.length+'건\\n영속 메모: '+permanentMemos.length+
        '건\\n'+warning+'\\n이 작업을 실행하시겠습니까?'))return;
    setResetBusy(true);setSceneNotice(null);
    try{
      if(memoServerMode==='active'){
        const response=await fetch('/api/cad-files/'+encodeURIComponent(versionId)+'/scene',{
          credentials:'same-origin',cache:'no-store'});
        const scene=await response.json() as {revision?:number};
        if(!response.ok||!Number.isSafeInteger(scene.revision))
          throw new Error('기준 Scene Revision을 확인할 수 없습니다.');
        await resetPersistedBusiness(versionId,{
          mode,sourceSha256,expectedSceneRevision:scene.revision as number,
          outlines:storedOutlines.map(o=>({id:o.id,revision:o.revision})),
          memos:permanentMemos.map(m=>({id:m.id,revision:m.revision!})),
        });
      }
      if(manager.current!==current)throw new Error('초기화 중 Viewer가 변경되었습니다. 서버 상태를 재조회하세요.');
      current.cancelGeneratedCommand();current.cancelOutlinePreview();
      current.resetSceneWork();
      if(mode==='ALL'){
        sessionSnaps.current?.clear();setSessionSnapProjection({});
        current.clearSavedOutlines();
        memoSession.current?.clear();setMemos([]);
        setStoredOutlines([]);setSavedServerIds(new Set());setStoredOutlineHidden(new Set());
        closeMemoEditor();
      }else if(memoServerMode==='active'){
        // S6-A must preserve the *last* transient world WCS and break the
        // imported target, not jump the memo to an uncommitted new position.
        sessionSnaps.current?.breakOrigin('RENDER');syncSessionSnaps();
        const loaded=await readPersistedMemos(versionId,new AbortController().signal);
        if(loaded.mode==='active'){
          const doc=new MemoSession({versionId,sourceSha256});
          for(const memo of loaded.memos)doc.acceptPersisted(memo,{versionId,sourceSha256});
          memoSession.current=doc;setMemos(doc.list());setMemoSelectedId(null);
        }
      }
      if(mode==='SOURCE_ONLY'&&memoServerMode==='off'){
        sessionSnaps.current?.breakOrigin('RENDER');syncSessionSnaps();
      }
      current.clearCanvasObjectSelection();setCanvasSelection([]);
      setDeleteRequest(null);setContextMenu(null);
      syncSavedOutlines();setOutlineInfo(current.getOutlineInfo());
      setSceneNotice(title+' 완료: 원본 Scene/Version은 변경하지 않았습니다.');
    }catch(error){setSceneNotice(error instanceof Error?error.message:'초기화가 거절됐습니다. 다시 조회하세요.');}
    finally{setResetBusy(false);}
  }
  function toggleOutlineTool() {
    if (!outlineAvailable) return;
    const enabled = !outlineEnabledRef.current;
    if (enabled) {
      const current=manager.current;
      if(!current)return;
      // Exact SOURCE may become unavailable after a render edit; use the live
      // adapter gate, not the previously saved React outlineBasis snapshot.
      const liveInfo=current.getOutlineInfo();
      const nextBasis=effectiveOutlineBasis(outlineBasis,liveInfo);
      try {
        // Select the mode before publishing enabled=true so a rejected
        // transition cannot leave the panel closed with a stale enabled ref.
        current.setSelectionMode(nextBasis==='source'?'select':'render');
      }catch(error){
        setOutlineNotice(error instanceof Error?error.message:'외곽선 선택 모드를 열 수 없습니다.');
        return;
      }
      closeMemoEditor();
      setDeleteRequest(null);setContextMenu(null);
      outlineRequestRevisionRef.current++;
      current.clearCanvasObjectSelection();
      outlineEnabledRef.current=true;
      setCanvasMode('pan');
      setOutlineBasis(nextBasis);
      setOutlineInfo(liveInfo);
      setOutlineMode('select');
      setOutlineNotice(nextBasis!==outlineBasis
        ? '원본 정밀 선택을 사용할 수 없어 렌더 형상 기준으로 전환했습니다. 원본 작업 차분을 되돌리기 전에는 정밀 모드를 사용할 수 없습니다.'
        : null);
    } else {
      outlineEnabledRef.current=false;
      closeMemoEditor();
      setDeleteRequest(null);setContextMenu(null);
      stopOutlineEditing();
      setOutlineNotice('외곽선 생성 OFF: 비확정 선택·미리보기 및 진행 중 계산이 취소되었습니다. 임시 확정 결과와 JSON 내보내기는 유지됩니다.');
    }
    dispatchApp({ type: 'set-outline-tool', enabled });
    if(enabled && !appState.toolsOpen)dispatchApp({type:'toggle-tools',exclusive:isCompact});
  }
  /** General selection and generated-only targeting are independent of U3. */
  function changeCanvasMode(next:'pan'|'objects'|'generated') {
    if (!treeAvailable) return;
    closeMemoEditor();
    setDeleteRequest(null);setContextMenu(null);
    if (outlineEnabledRef.current) {
      outlineEnabledRef.current=false;
      stopOutlineEditing();
      dispatchApp({type:'set-outline-tool',enabled:false});
      setOutlineNotice('외곽선 생성을 종료하고 일반 객체 선택으로 전환했습니다. 미확정 결과는 취소되었습니다.');
    }
    manager.current?.setSelectionMode(next);
    setCanvasMode(next);
  }
  function selectionMode(value:'pan'|'select') {
    if (!outlineEnabledRef.current || !outlineAvailable) return;
    manager.current?.setSelectionMode(value==='select'&&outlineBasis==='render'?'render':value);setOutlineMode(value);
  }
  function changeOutlineBasis(value:'render'|'source') {
    if(value==='source'&&(!outlineInfo?.entityCount||outlineInfo.sourceUnavailableReason))return;
    outlineRequestRevisionRef.current++;
    manager.current?.cancelOutlinePreview();
    manager.current?.clearCanvasObjectSelection();
    setOutlineSelection([]);setPreview(null);setPreviewError(null);
    setOutlineBasis(value);
    if(outlineEnabledRef.current){manager.current?.setSelectionMode(value==='render'?'render':'select');setOutlineMode('select');}
  }
  function runSceneWork(command:SceneWorkCommand) {
    try {
      manager.current?.executeSceneWorkCommand(command);
      setSceneWorkError(null);syncSavedOutlines();
      setOutlineInfo(manager.current?.getOutlineInfo()??null);
    }catch(error){setSceneWorkError(error instanceof Error?error.message:'Scene 작업을 적용하지 못했습니다.');}
  }
  function requestOutline(kind:OutlineKind) {
    if (!outlineEnabledRef.current || !outlineAvailable || !outlineSelection.length) return;
    const revision = ++outlineRequestRevisionRef.current;
    setPreviewError(null);
    try {
      void manager.current?.previewOutline(kind).catch(error => {
        if (isLiveOutlineRequest(revision, outlineRequestRevisionRef.current, outlineEnabledRef.current, error)) {
          setPreviewError(error instanceof Error ? error.message : '외곽선을 만들 수 없습니다.');
        }
      });
    } catch (error) {
      if (isLiveOutlineRequest(revision, outlineRequestRevisionRef.current, outlineEnabledRef.current, error)) {
        setPreviewError(error instanceof Error ? error.message : '외곽선을 만들 수 없습니다.');
      }
    }
  }
  function focusSavedOutline(id:string,additive=false) {
    if(!treeAvailable)return;
    if(!manager.current?.focusSavedOutline(id,additive)){
      setOutlineNotice('숨김 처리된 외곽선이거나 유효한 WCS 경계가 없어 선택·이동하지 않았습니다.');
      return;
    }
    syncSavedOutlines();
    setOutlineNotice(null);
  }
  function setSavedVisibility(id:string,visible:boolean) {
    if(!treeAvailable)return;
    if(manager.current?.setSavedOutlineVisibility(id,visible))syncSavedOutlines();
  }
  function setGroupSavedVisibility(ids:string[],visible:boolean) {
    if(!treeAvailable)return;
    let changed=false;
    for(const id of ids)changed=(manager.current?.setSavedOutlineVisibility(id,visible)??false)||changed;
    if(changed)syncSavedOutlines();
  }
  function confirmOutline() {
    if (!outlineEnabledRef.current || !outlineAvailable || !preview) return;
    try { manager.current?.confirmOutline(); }
    catch (error) { setPreviewError(error instanceof Error ? error.message : '외곽선을 확정하지 못했습니다.'); }
  }
  function confirmTypedOutline() {
    if (!outlineEnabledRef.current || !outlineAvailable || !preview || !preview.persistable) return;
    try {
      const assignment=resolveOutlineAssignment(outlineTypeCatalog,versionId,sourceSha256,
        selectedOutlineTypeId,outlineName,savedCount+1);
      manager.current?.confirmOutline(assignment);
      setOutlineName('');
    } catch (error) {
      setPreviewError(error instanceof Error?error.message:'업무 타입을 확인할 수 없습니다.');
    }
  }
  function cancelOutline() {
    if (!outlineEnabledRef.current || !outlineAvailable) return;
    outlineRequestRevisionRef.current++;
    manager.current?.cancelOutlinePreview();
  }
  async function saveSelectedOutline(savedId:string){
    if(memoServerMode!=='active'||storedOutlineBusy)return;
    setStoredOutlineBusy(true);setStoredOutlineError(null);
    try{
      const item=manager.current?.getSavedOutlines().find(x=>x.id===savedId);
      if(!item)throw new Error('선택한 임시 외곽선이 없습니다.');
      if(item.outlineTypeId)throw new Error('업무 타입 연계는 #65 승인 전까지 서버에 저장할 수 없습니다.');
      // Fresh Scene GET: do not reuse a stale revision from a previous viewing session.
      const sceneResponse=await fetch('/api/cad-files/'+versionId+'/scene',{credentials:'same-origin',cache:'no-store'});
      const sceneData=await sceneResponse.json();
      if(!sceneResponse.ok||!Number.isSafeInteger(sceneData.revision))
        throw new Error('서버 Scene READY가 필요합니다. 먼저 Scene을 생성·저장하세요.');
      const exportOne=buildOutlineExport(versionId,sourceSha256,outlineInfo?.unitCode??null,[item]);
      const source=exportOne.schemaVersion===1||exportOne.schemaVersion===2;
      const payload:Record<string,unknown>={
        mode:source?'SOURCE_CANONICAL':'APP_CREATED',
        sourceSha256,expectedSceneRevision:sceneData.revision,
        kind:item.result.kind,name:item.name?.trim()||'외곽선 '+(savedServerIds.size+1),
        outlineTypeId:null,
        ...(source?{sourceExport:buildServerSourceOutlineExport(
          versionId,sourceSha256,outlineInfo?.unitCode??null,item,
          manager.current?.getGeneratedObjects().find(o=>o.savedOutlineId===savedId)
        )}:{geometry:item.result.geometry,derivedFrom:item.result.derivedFrom??[]}),
      };
      const created=await mutateStoredOutline('POST',versionId,payload);
      if('deleted' in created)throw new Error('외곽선 저장 결과가 유효하지 않습니다.');
      setStoredOutlines(list=>[...list,created]);
      setStoredSceneRevision(sceneData.revision);
      setSavedServerIds(previous=>new Set(previous).add(savedId));
      setOutlineNotice('외곽선 영속 저장 완료 · '+created.id.slice(0,8));
    }catch(error){setStoredOutlineError(error instanceof Error?error.message:'외곽선을 저장하지 못했습니다.');}
    finally{setStoredOutlineBusy(false);}
  }
  async function updateStoredOutline(item:StoredOutline,operation:'rename'|'delete'|'move'|'rotate'){
    if(memoServerMode!=='active'||storedOutlineBusy)return;
    let payload:Record<string,unknown>={expectedRevision:item.revision};
    if(operation==='rename'){
      const changed=window.prompt('외곽선 새 이름 (1~100자)',item.name);
      if(changed===null)return;
      payload={...payload,operation:'rename',name:changed};
    }else if(operation==='delete'){
      if(!window.confirm(item.name+' 외곽선을 목록에서 삭제 처리할까요?'))return;
    }else{
      const typed=window.prompt(operation==='move'?'이동할 WCS X,Y (예: 10,20)':'회전 각도(도, 원점 중심)',operation==='move'?'0,0':'0');
      if(typed===null)return;
      const numbers=typed.split(',').map(v=>Number(v.trim()));
      if(!numbers.length||numbers.some(x=>!Number.isFinite(x)))return setStoredOutlineError('숫자 좌표/각도를 확인하세요.');
      if(operation==='move'&&numbers.length!==2||operation==='rotate'&&numbers.length!==1)
        return setStoredOutlineError('입력값 형식을 확인하세요.');
      const next=operation==='move'?{type:'Translate',dx:numbers[0],dy:numbers[1]}:
       {type:'Rotate',angleDegrees:numbers[0],pivot:[0,0]};
      payload={...payload,operation:'transform',operations:[...item.operations,next]};
    }
    setStoredOutlineBusy(true);setStoredOutlineError(null);
    try{
      const result=await mutateStoredOutline(operation==='delete'?'DELETE':'PATCH',versionId,payload,item.id);
      if('deleted' in result){
        setStoredOutlines(rows=>rows.filter(r=>r.id!==item.id));
        setStoredOutlineHidden(previous=>{const updated=new Set(previous);updated.delete(item.id);return updated;});
      }else setStoredOutlines(rows=>rows.map(r=>r.id===item.id?result:r));
      // #84: the same server CAS transaction also updates affected memo WCS/revisions.
      // Refresh these immediately; retaining stale draft revisions can silently break later edits.
      if(operation==='move'||operation==='rotate'||operation==='delete'){
        const loaded=await readPersistedMemos(versionId,new AbortController().signal);
        if(loaded.mode==='active'){
          const doc=new MemoSession({versionId,sourceSha256});
          for(const memo of loaded.memos)doc.acceptPersisted(memo,{versionId,sourceSha256});
          memoSession.current=doc;setMemos(doc.list());
        }
      }
    }catch(error){setStoredOutlineError(error instanceof Error?error.message:'외곽선 변경이 거부되었습니다.');}
    finally{setStoredOutlineBusy(false);}
  }
  function toggleStoredOutline(id:string){
    setStoredOutlineHidden(previous=>{
      const updated=new Set(previous);if(updated.has(id))updated.delete(id);else updated.add(id);return updated;
    });
  }
  function exportOutlines() {
    const outlines=manager.current?.getSavedOutlines()??[];
    if(!outlines.length)return;
    const payload=buildOutlineExport(versionId,sourceSha256,outlineInfo?.unitCode??null,outlines);
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download='cad-outlines-'+versionId.slice(0,8)+'.json';anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),0);
  }
  const confirmDiscard = useCallback(() => {
    const current=manager.current;
    if (!current) return true;
    const hasWork=(sessionSnaps.current?.hasBindings()??false) ||
      current.getSavedOutlines().length>0 || current.getGeneratedHistory().undo>0 ||
      current.getSceneWorkState().undo>0 || current.getSceneWorkState().redo>0 ||
      current.getGeneratedHistory().redo>0 || current.getCanvasObjectSelection().length>0 ||
      current.getOutlineSelection().length>0;
    return !hasWork || window.confirm('임시 외곽선·실행 취소 이력·선택 상태가 사라집니다. 계속하시겠습니까?');
  }, []);
  const choose = useCallback((value: typeof renderer) => {
    if (value === renderer) return;
    if (!confirmDiscard()) return;
    loadSequenceRef.current++;
    sceneRequest.current?.abort();setSceneBusy(false);setSceneCandidate(false);setSceneMode('scene-first');
    if (loading && source.state(`/api/cad-files/${versionId}/content`) === 'pending') source.dispose();
    fallbackTried.current = false; fallbackReason.current = null; setRecoveryNotice(null); setLinkFallbackUrl(null);
    manager.current?.dispose();
    setLoading(true);
    setState({ status: '도면 로딩 중…', ready: false });
    setMetric(null);
    setLayers([]);
    setSelectedLayers(new Set());
    setRenderer(value);
    dispatchApp({ type: 'reset' });
    setSearchOpen(false);
    resetOutline();
    resetMemos();
    const url = new URL(window.location.href);
    url.searchParams.set('renderer', value);
    window.history.replaceState(null, '', url);
  }, [loading, renderer, resetOutline, confirmDiscard, source, versionId, resetMemos]);

  function reload() {
    if (loading || !confirmDiscard()) return;
    loadSequenceRef.current++;
    sceneRequest.current?.abort();setSceneBusy(false);setSceneCandidate(false);setSceneMode('scene-first');
    manager.current?.dispose();
    fallbackTried.current=false; fallbackReason.current=null; setRecoveryNotice(null); setLinkFallbackUrl(null);
    setLoading(true);
    source.dispose();
    setMetric(null);
    setLayers([]);
    setSelectedLayers(new Set());
    setState({ status: '도면 로딩 중…', ready: false });
    dispatchApp({ type: 'reset' });
    setSearchOpen(false);
    resetOutline();
    resetMemos();
    setAttempt(value => value + 1);
  }

  function buildScene() {
    if(loading||sceneBusy||!confirmDiscard())return;
    sceneRequest.current?.abort();
    loadSequenceRef.current++;manager.current?.dispose();source.dispose();
    fallbackTried.current=false;fallbackReason.current=null;
    // Keep direct/reopened links Scene-first even when conversion starts in
    // the legacy ?renderer=dxf-viewer mode.
    const url=new URL(window.location.href);
    url.searchParams.set('renderer','three-dxf-viewer');
    window.history.replaceState(null,'',url);
    setRenderer('three-dxf-viewer');setSceneMode('build');setSceneCandidate(false);setSceneNotice(null);
    setLoading(true);setState({status:'원본 DXF 최초 변환·Scene 생성 중…',ready:false});
    resetOutline();resetMemos();setAttempt(value=>value+1);
  }
  async function saveScene() {
    const artifact=manager.current?.getSceneArtifact();if(!artifact||sceneBusy)return;
    const request=new AbortController();sceneRequest.current?.abort();sceneRequest.current=request;
    const sequence=loadSequenceRef.current;
    setSceneBusy(true);setSceneNotice('Scene Asset 저장·검증 중…');
    try{
      const headers=await runtimeCadHeaders({'Content-Type':'application/json'});
      if(request.signal.aborted)throw new DOMException('취소됨','AbortError');
      // Chunk conversion avoids argument-count limits on large assets.
      let binary='';for(let i=0;i<artifact.bytes.length;i+=8192)binary+=String.fromCharCode(...artifact.bytes.subarray(i,i+8192));
      const response=await fetch(`/api/cad-files/${versionId}/scene`,{method:'POST',headers,credentials:'same-origin',cache:'no-store',signal:request.signal,
        body:JSON.stringify({manifest:artifact.manifest,bytesBase64:btoa(binary),expectedRevision:expectedSceneRevision.current})});
      const result=await response.json();
      if(!response.ok)throw new Error(result?.error?.code==='SCENE_REVISION_CONFLICT'?'다른 저장과 충돌했습니다. 기존 Scene은 유지됩니다. 다시 조회하세요.':`Scene 저장 실패 (${response.status}). 로그인·사업장 권한·승인된 저장 기능을 확인하세요.`);
      if(result.status!=='READY'||!Number.isSafeInteger(result.revision))throw new Error('Scene 저장 응답을 확인하지 못했습니다. 다시 조회하여 상태를 확인하세요.');
      if(sequence===loadSequenceRef.current){expectedSceneRevision.current=result.revision;setSceneNotice('Scene Asset 저장 완료. 다시 불러오기 또는 재접속하면 원본 DXF 없이 복원합니다.');setSceneCandidate(false);}
    }catch(error){if(!request.signal.aborted&&sequence===loadSequenceRef.current)setSceneNotice(error instanceof Error?error.message:'Scene Asset 저장에 실패했습니다.');}
    finally{if(sceneRequest.current===request){sceneRequest.current=null;setSceneBusy(false);}}
  }

  function setLayerVisibility(name: string, visible: boolean) {
    manager.current?.showLayer(name, visible);
    setSelectedLayers(current => {
      const next = new Set(current);
      if (visible) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  function setAllLayersVisibility(visible: boolean) {
    for (const name of layers) manager.current?.showLayer(name, visible);
    setSelectedLayers(visible ? new Set(layers) : new Set());
  }

  function enterFullscreen() {
    setIsFullscreen(true);
  }

  function toggleNativeFullscreen() {
    const shell = viewerShell.current;
    if (!shell) return;
    if (document.fullscreenElement === shell) {
      void document.exitFullscreen?.().catch(() => undefined);
    } else {
      // This function is called only by the user's explicit button click.
      void shell.requestFullscreen?.().catch(() => undefined);
    }
  }

  function exitFullscreen() {
    const shell = viewerShell.current;
    setIsFullscreen(false);
    if (document.fullscreenElement === shell) void document.exitFullscreen?.().catch(() => undefined);
    window.requestAnimationFrame(() => {
      shell?.querySelector<HTMLButtonElement>('[data-viewer-enter-fullscreen]')?.focus({ preventScroll: true });
    });
  }

  useEffect(() => {
    let active = true;
    const sceneController=new AbortController();
    const sequence = ++loadSequenceRef.current;
    const instance = new ViewerManager(
      async () => {
        if (renderer === 'libredwg-web') {
          const { LibreDwgWebAdapter } = await import('@/viewers/libredwg-web/adapter');
          if (!active || loadSequenceRef.current!==sequence || !container.current) throw new DOMException('취소됨', 'AbortError');
          return new LibreDwgWebAdapter(container.current);
        }
        if (renderer === 'three-dxf-viewer') {
          const { ThreeDxfViewerAdapter } = await import('@/viewers/three-dxf-viewer/adapter');
          if (!active || loadSequenceRef.current!==sequence || !container.current) throw new DOMException('취소됨', 'AbortError');
          return new ThreeDxfViewerAdapter(container.current,{
            versionId,sourceSha256,prepareScene:sceneMode==='build',
            onSelection:value=>{if(active && loadSequenceRef.current===sequence && outlineEnabledRef.current)setOutlineSelection(value);},
            onObjectSelection:refs=>{if(active && loadSequenceRef.current===sequence){setCanvasSelection(refs);syncSavedOutlines();}},
            onPreview:(value,error)=>{if(active && loadSequenceRef.current===sequence && outlineEnabledRef.current){setPreview(value);setPreviewError(error??null);}},
            onSaved:count=>{if(active && loadSequenceRef.current===sequence){setSavedCount(count);syncSavedOutlines();}},
            onEditError:message=>{if(active && loadSequenceRef.current===sequence)setTranslateError(message);},
            onViewChange:()=>{if(active)onAdapterViewChange();},
          });
        }
        const { DxfViewerAdapter } = await import('@/viewers/dxf-viewer/adapter');
        if (!active || loadSequenceRef.current!==sequence || !container.current) throw new DOMException('취소됨', 'AbortError');
        return new DxfViewerAdapter(container.current);
      },
      source,
      { renderer, versionId, report: value => { if (active && loadSequenceRef.current===sequence) setMetric({ ...value, fallback: fallbackReason.current ? { reasonCode: fallbackReason.current, attempt: 1 } : undefined }); } },
      format,
      format==='DXF'&&renderer==='three-dxf-viewer'?{versionId,sourceSha256,mode:sceneMode}:undefined,
    );
    manager.current = instance;
    const run=async()=>{
      if(sceneMode==='build'&&renderer==='three-dxf-viewer'){
        const response=await fetch(`/api/cad-files/${versionId}/scene`,{credentials:'same-origin',cache:'no-store',signal:sceneController.signal});
        if(!response.ok)throw new ViewerLoadError('scene','UNAVAILABLE','Scene 생성 전 Version·권한 상태를 확인하지 못했습니다.');
        const value=await response.json();
        expectedSceneRevision.current=Number.isSafeInteger(value.revision)?value.revision:null;
      }
      if(!active)throw new DOMException('취소됨','AbortError');
      return instance.load(`/api/cad-files/${versionId}/content`,format);
    };
    run().then(result => {
      if (active && loadSequenceRef.current===sequence) {
        const nextLayers = instance.getLayers();
        setOutlineInfo(instance.getOutlineInfo());
        setState({
          status: result.empty ? '표시할 도형이 없습니다.' : result.warning ? '도면 일부 표시 완료' : '도면 표시 완료',
          ready: !result.empty,
          warning: result.warning,
        });
        setLayers(nextLayers);
        setSelectedLayers(new Set(nextLayers));
        setSceneCandidate(!!instance.getSceneArtifact());
        syncSavedOutlines();
        if(sceneMode==='build'){
          const url=new URL(window.location.href);url.searchParams.delete('source');window.history.replaceState(null,'',url);
        }
        if(format==='DXF')setSceneNotice(instance.getLoadStrategy()==='READY_SCENE'?'저장된 Scene Asset 복원 · DXF 원본 조회·재파싱 없음':sceneMode==='build'?'원본 DXF 변환 완료. Scene Asset 저장은 로그인·권한·서버 승인 후 가능합니다.':'레거시 DXF 로딩 · 원본을 사용합니다.');
        if(fallbackReason.current && renderer==='dxf-viewer')setRecoveryNotice(`three-dxf-viewer 실패 (${fallbackReason.current}) 후 dxf-viewer로 표시했습니다. 일부 선택·외곽선 기능은 지원되지 않습니다.`);
      }
    }).catch(error => {
      if (active && loadSequenceRef.current===sequence && renderer === 'three-dxf-viewer' && format === 'DXF' &&
          error instanceof ViewerLoadError && error.stage !== 'source' && error.stage!=='scene' && !fallbackTried.current) {
        fallbackTried.current=true; fallbackReason.current=`${error.stage}:${error.reasonCode}`;
        setRecoveryNotice(`three-dxf-viewer 처리 실패 (${fallbackReason.current}). dxf-viewer로 한 번 다시 엽니다.`);
        setRenderer('dxf-viewer');
        const url=new URL(window.location.href);url.searchParams.set('renderer','dxf-viewer');
        window.history.replaceState(null,'',url);
        return;
      }
      if (active && loadSequenceRef.current===sequence && !isViewerCancellation(error)) {
        setLayers([]);
        setSelectedLayers(new Set());
        resetOutline();
        dispatchApp({ type: 'set-outline-tool', enabled: false });
        setState({
          status: '표시 실패',
          ready: false,
          error: `${fallbackReason.current ? `첫 시도 ${fallbackReason.current}; ` : ''}${error instanceof ViewerLoadError ? `${error.stage}:${error.reasonCode} — ${error.message}` : 'Viewer 초기화에 실패했습니다.'}`,
        });
      }
    }).finally(() => {
      if (loadSequenceRef.current === sequence && active && (!fallbackTried.current || renderer === 'dxf-viewer')) setLoading(false);
    });
    return () => {
      active = false;
      sceneController.abort();
      instance.dispose();
      manager.current = null;
    };
  }, [versionId, sourceSha256, attempt, renderer, source, format, sceneMode, resetOutline, syncSavedOutlines, onAdapterViewChange]);

  const layerAvailable = renderer === 'three-dxf-viewer' && layers.length > 0 && state.ready;
  const outlineUnavailable = outlineToolUnavailableReason({
    renderer, format, loading, ready: state.ready,
    entityCount: outlineInfo?.entityCount, sourceSha256,
    renderEntityCount:outlineInfo?.renderEntityCount,
  });
  const outlineAvailable = outlineUnavailable === null;
  const memoUnavailable =
    format !== 'DXF' || renderer !== 'three-dxf-viewer'
      ? '메모 M1은 현재 DXF three-dxf-viewer에서만 지원합니다.'
      : loading || !state.ready
        ? '도면 표시 완료 후 메모를 배치할 수 있습니다.'
        : !/^[0-9a-f]{64}$/i.test(sourceSha256) ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(versionId)
          ? '검증된 도면 Version UUID와 원본 SHA-256이 필요합니다.'
          : null;
  const memoAvailable=memoUnavailable===null && memoScoped && (memoServerMode==='off'||memoServerMode==='active');
  const selectableTypes=selectableOutlineTypes(outlineTypeCatalog,versionId,sourceSha256);
  const typedConfirmAvailable=!!preview?.persistable && selectableTypes.some(item=>item.id===selectedOutlineTypeId);
  const treeUnavailable =
    format !== 'DXF' || renderer !== 'three-dxf-viewer'
      ? '외곽선 목록은 DXF의 three-dxf-viewer에서만 사용할 수 있습니다.'
      : loading || !state.ready
        ? '도면 로딩이 완료된 뒤 외곽선 목록을 볼 수 있습니다.'
        : !/^[a-f0-9]{64}$/i.test(sourceSha256)
          ? '검증된 도면 Version/SHA 범위가 필요합니다.'
          : null;
  const treeAvailable=treeUnavailable===null;
  const editCapability=canvasEditCapability(canvasSelection,{versionId,sourceSha256});
  const sourceCount=canvasSelection.filter(ref=>ref.origin!=='GENERATED').length;
  const generatedCount=canvasSelection.filter(ref=>ref.origin==='GENERATED').length;
  const renderCount=canvasSelection.filter(ref=>ref.origin==='RENDER').length;
  const deleteModeAvailable=treeAvailable && !appState.outlineToolEnabled &&
    canvasMode!=='pan';
  const canDeleteSelection=deleteModeAvailable && editCapability.canEdit;
  const closeMetadataOverlays=useCallback(()=>{setNameTipOpen(false);setNameTipPinned(false);setInfoOpen(false);},[]);
  const selectedPersistedMemo=memoServerMode==='active'&&scopedMemos.find(m=>m.id===memoSelectedId)?.persisted===true;
  const commandGroups:ViewerCommandGroup[]=[
    {id:'drawing',label:'도면',commands:[
      {id:'info',label:'도면 정보',onSelect:()=>setInfoOpen(value=>!value)},
      {id:'versions',label:'버전 목록',kind:'link',href:`/cad/locations/${locationId}`},
      {id:'reload',label:'다시 불러오기',disabled:loading,reason:loading?'로딩이 끝난 뒤 다시 불러올 수 있습니다.':undefined,onSelect:reload},
      ...(format==='DXF'?[{id:'build-scene',label:'원본 DXF로 Scene 생성/재생성',disabled:loading||sceneBusy,reason:'명시적으로 원본을 읽고 변환합니다. 기존 저장 Scene은 저장 성공 전 유지됩니다.',onSelect:buildScene},
        {id:'save-scene',label:'Scene Asset 저장',disabled:!sceneCandidate||sceneBusy||loading,reason:'명시 변환 완료 후 승인된 로그인·사업장 쓰기 권한으로 저장합니다.',onSelect:()=>void saveScene()}]:[]),
      {id:'download',label:'원본 다운로드',kind:'link',download:true,href:`/api/cad-files/${versionId}/content`},
      {id:'copy',label:'도면 링크 복사',onSelect:()=>{const url=cadViewerUrl(window.location.origin,versionId,format,renderer);if(!navigator.clipboard?.writeText){setLinkFallbackUrl({renderer,url});return;}void navigator.clipboard.writeText(url).catch(()=>setLinkFallbackUrl({renderer,url}));}},
    ]},
    {id:'view',label:'보기',commands:[
      ...(format==='DXF' ? [
        {id:'three',label:'three-dxf-viewer',kind:'radio' as const,checked:renderer==='three-dxf-viewer',disabled:renderer==='three-dxf-viewer',onSelect:()=>choose('three-dxf-viewer')},
        {id:'dxf',label:'dxf-viewer',kind:'radio' as const,checked:renderer==='dxf-viewer',disabled:renderer==='dxf-viewer',onSelect:()=>choose('dxf-viewer')},
      ]:[]),
      {id:'zoom-in',label:'확대',disabled:loading||!state.ready,onSelect:()=>manager.current?.zoomIn()},
      {id:'zoom-out',label:'축소',disabled:loading||!state.ready,onSelect:()=>manager.current?.zoomOut()},
      {id:'fit',label:'화면 맞춤',disabled:loading||!state.ready,onSelect:()=>manager.current?.fitToView()},
      {id:'memo-visible',label:'메모 전체 표시',testId:'viewer-menu-memo-visible',kind:'checkbox',
       checked:memoAllVisible,disabled:!memoAvailable,reason:memoUnavailable??undefined,
       onSelect:()=>{setMemoAllVisible(v=>!v);setMemoTransientFocusId(null);}},
      {id:'fullscreen',label:isFullscreen?'전체 화면 종료':'전체 화면',onSelect:isFullscreen?exitFullscreen:enterFullscreen},
      {id:'native',label:isNativeFullscreen?'브라우저 전체 화면 해제':'브라우저 전체 화면',disabled:loading,onSelect:toggleNativeFullscreen},
    ]},
    {id:'work',label:'작업',commands:[
      {id:'layers',label:'레이어 패널',testId:'viewer-menu-layers',kind:'checkbox',checked:appState.layerPanelOpen,expanded:layerAvailable&&appState.layerPanelOpen,controls:layerAvailable&&appState.layerPanelOpen?'viewer-layer-dock':undefined,disabled:!layerAvailable,reason:!layerAvailable?'레이어 패널은 로딩 완료된 three-dxf-viewer에서만 사용할 수 있습니다.':undefined,onSelect:()=>dispatchApp({type:'toggle-layers',exclusive:isCompact})},
      {id:'tools',label:'선택·편집 도구',testId:'viewer-menu-tools',kind:'checkbox',checked:appState.toolsOpen,expanded:(outlineAvailable||memoAvailable)&&appState.toolsOpen,controls:(outlineAvailable||memoAvailable)&&appState.toolsOpen?'viewer-tools-dock':undefined,disabled:!(outlineAvailable||memoAvailable),reason:!(outlineAvailable||memoAvailable)?(outlineUnavailable??memoUnavailable??undefined):undefined,onSelect:()=>{if(appState.toolsOpen)closeMemoEditor();dispatchApp({type:'toggle-tools',exclusive:isCompact});}},
      {id:'outline',label:'외곽선 생성',testId:'viewer-menu-outline-tool',kind:'checkbox',checked:appState.outlineToolEnabled,expanded:appState.outlineToolEnabled&&appState.toolsOpen,controls:appState.outlineToolEnabled&&appState.toolsOpen?'viewer-tools-dock':undefined,disabled:!outlineAvailable,reason:outlineUnavailable??undefined,onSelect:toggleOutlineTool},
      {id:'tree',label:'외곽선 목록',testId:'viewer-menu-outline-tree',kind:'checkbox',checked:appState.outlineTreeOpen,expanded:treeAvailable&&appState.outlineTreeOpen,controls:treeAvailable&&appState.outlineTreeOpen?'viewer-outline-tree-dock':undefined,disabled:!treeAvailable,reason:treeUnavailable??undefined,onSelect:()=>dispatchApp({type:'toggle-outline-tree',exclusive:isCompact})},
      {id:'memo-tree',label:'메모 트리',testId:'viewer-menu-memo-tree',kind:'checkbox',
       checked:appState.memoTreeOpen,expanded:memoAvailable&&appState.memoTreeOpen,
       controls:memoAvailable&&appState.memoTreeOpen?'viewer-memo-tree-dock':undefined,
       disabled:!memoAvailable,reason:memoUnavailable??undefined,
       onSelect:()=>dispatchApp({type:'toggle-memo-tree',exclusive:isCompact})},
      {id:'memo-search',label:'메모 검색',testId:'viewer-menu-memo-search',
       disabled:!memoAvailable,reason:memoUnavailable??'로그인 및 영속 메모 조회 후 이용할 수 있습니다.',
       onSelect:()=>{
         if(!appState.memoTreeOpen)dispatchApp({type:'toggle-memo-tree',exclusive:isCompact});
         requestAnimationFrame(()=>requestAnimationFrame(()=>viewerShell.current?.querySelector<HTMLInputElement>('[data-testid="cad-memo-tree-search"]')?.focus()));
       }},
      {id:'memo-copy',label:'선택 메모 링크 복사',testId:'viewer-menu-memo-copy',
       disabled:!selectedPersistedMemo,reason:'영속 저장된 단일 메모 선택 및 인증된 조회 권한이 필요합니다.',
       onSelect:()=>{if(memoSelectedId)copyMemoLink(memoSelectedId);}},
      {id:'search',label:'도면 내 텍스트 검색',kind:'checkbox',checked:searchOpen,disabled:format!=='DXF'||!state.ready,reason:format==='DWG'?'DWG 내부 텍스트 검색은 제공하지 않습니다.':!state.ready?'도면 표시 완료 후 검색할 수 있습니다.':undefined,onSelect:()=>setSearchOpen(value=>!value)},
      {id:'memo',label:'메모 추가/편집',testId:'viewer-menu-memo-add',kind:'checkbox' as const,checked:memoPlacing || !!memoSelectedId,expanded:appState.toolsOpen,controls:appState.toolsOpen?'viewer-tools-dock':undefined,disabled:!memoAvailable,reason:memoUnavailable??undefined,onSelect:startMemoPlacement},
      {id:'reset-source',label:'DXF 기반 객체만 초기화 (자체 생성 유지)',
        testId:'viewer-menu-reset-source',disabled:!treeAvailable||resetBusy||sceneBusy,
        reason:'기준 Scene 작업만 초기화합니다. SOURCE 연결은 인증 후 해제됩니다.',
        onSelect:()=>{void resetOrigin('SOURCE_ONLY');}},
      {id:'reset-all',label:'전체 객체 초기화 (자체 생성 포함)',
        testId:'viewer-menu-reset-all',disabled:!treeAvailable||resetBusy||sceneBusy||memoServerMode==='checking',
        reason:'확인 후 해당 Version의 영속 외곽선·메모를 하나의 거래에서 논리 삭제합니다.',
        onSelect:()=>{void resetOrigin('ALL');}},
      {id:'types',label:'외곽선 타입 관리',testId:'viewer-menu-outline-types',disabled:true,reason:'관리자 인증·인가 및 업무 타입 정책 승인 전에는 등록 기능을 제공하지 않습니다.'},
    ]},
  ];

  return <div className="space-y-3">
    <ViewerAppShell
      shellRef={viewerShell}
      panelScopeKey={versionId+':'+sourceSha256+':'+renderer+':'+attempt}
      isFullscreen={isFullscreen}
      isNativeFullscreen={isNativeFullscreen}
      menuBar={
        <ViewerMenuBar commandGroups={commandGroups} onMenuOpen={closeMetadataOverlays} onBeforeListNavigation={confirmDiscard} />
      }
      toolbar={
        <>

      <div data-testid="viewer-toolbar" className="relative z-40 shrink-0 border-b border-slate-700 bg-slate-950 p-2 text-white sm:p-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <div ref={nameTipRef} className="relative min-w-0 flex-[1_1_45%]" onMouseEnter={()=>description&&setNameTipOpen(true)} onMouseLeave={()=>{if(!nameTipPinned && !nameTipRef.current?.contains(document.activeElement))setNameTipOpen(false);}}>
            <h1><button ref={nameButtonRef} type="button" className="max-w-full truncate text-left text-base font-bold underline decoration-dotted underline-offset-4" title={displayName} aria-expanded={description?nameTipOpen:undefined} aria-describedby={nameTipOpen&&description?'viewer-name-description':undefined}
              onFocus={()=>{if(suppressNameFocus.current){suppressNameFocus.current=false;return;}if(description)setNameTipOpen(true);}} onBlur={event=>{if(!nameTipPinned && !nameTipRef.current?.contains(event.relatedTarget as Node))setNameTipOpen(false);}} onClick={()=>{if(!description)return;setNameTipPinned(value=>!value);setNameTipOpen(!nameTipPinned);}}>{displayName}</button></h1>
            {nameTipOpen && description && <div id="viewer-name-description" role="tooltip" data-canvas-edit-escape-layer="tooltip" tabIndex={0} onBlur={event=>{if(!nameTipPinned && !nameTipRef.current?.contains(event.relatedTarget as Node))setNameTipOpen(false);}} className="absolute left-0 top-full z-[130] max-h-[35dvh] w-[min(28rem,85vw)] overflow-auto rounded border border-slate-400 bg-white p-3 text-sm font-normal whitespace-pre-wrap break-words text-slate-900 shadow-xl">{description}</div>}
          </div>
          <p className="min-w-0 flex-[1_1_45%] truncate text-xs text-slate-200" title={originalFilename}>원본: {originalFilename}</p>
        </div>

        {infoOpen && <div role="region" aria-label="도면 정보" data-canvas-edit-escape-layer="info" className="absolute right-2 z-[120] max-h-[40dvh] max-w-[min(26rem,90vw)] overflow-auto rounded border border-slate-400 bg-white p-3 text-xs text-slate-900 shadow-xl"><p>Version {version} · {locationDescription}</p><p>등록일: {registeredAt} · 크기: {(fileSize / 1024 / 1024).toFixed(2)} MB</p><button type="button" className="mt-2 underline" onClick={()=>setInfoOpen(false)}>닫기</button></div>}
      </div>

        </>
      }
      layerPanel={layerAvailable ? (
        <FullscreenLayerPanel
          layers={layers}
          selected={selectedLayers}
          onLayerChange={setLayerVisibility}
          onAllChange={setAllLayersVisibility}
          onClose={() => {
            dispatchApp({ type: 'close-layers' });
            // The close button disappears: return keyboard focus to its persistent menu toggle.
            requestAnimationFrame(()=>viewerShell.current?.querySelector<HTMLButtonElement>('[data-viewer-group=work]')?.focus({preventScroll:true}));
          }}
        />
      ) : null}
      layerPanelOpen={appState.layerPanelOpen}
      outlineTreePanel={treeAvailable ? (
        <OutlineTreePanel
          outlines={savedOutlines}
          overlayStates={savedOverlayStates}
          types={selectableTypes}
          allowDelete={deleteModeAvailable && sourceCount===0}
          deleteUnavailableReason={sourceCount>0 ? editCapability.reason :
            '생성 개체 편집 모드(원본·생성 또는 생성 개체만 선택)로 전환하세요.'}
          onSelect={focusSavedOutline}
          onVisibility={setSavedVisibility}
          onGroupVisibility={setGroupSavedVisibility}
          onDelete={id=>openDelete(id)}
          onClose={() => {
            dispatchApp({ type: 'toggle-outline-tree' });
            requestAnimationFrame(()=>viewerShell.current?.querySelector<HTMLButtonElement>('[data-viewer-group=work]')?.focus({preventScroll:true}));
          }}
        />
      ) : null}
      outlineTreeOpen={treeAvailable && appState.outlineTreeOpen}
      memoTreePanel={memoAvailable ? <div className="flex h-full min-h-0 flex-col">
        <CadMemoTreePanel
          memos={scopedMemos} tree={memoTree} selectedId={memoSelectedId}
          allVisible={memoAllVisible} transientFocusId={memoTransientFocusId}
          persistent={memoServerMode==='active'&&memoFeaturesAvailable}
          onPersistVisibility={memoServerMode==='active'&&memoFeaturesAvailable?
            (id,visible)=>{void changeMemoMeta(id,{visible});}:undefined}
          onSelect={focusMemoFromTree} onEdit={id=>selectMemo(id)}
          onCopyLink={memoServerMode==='active'?copyMemoLink:undefined}
          onVisibility={(id,visible)=>{
            if(!scopedMemos.some(m=>m.id===id))return;
            setMemoTree(current=>setMemoVisible(current,id,visible));
            setMemoTransientFocusId(null);
          }}
          onGroupVisibility={(id,visible)=>setMemoTree(current=>setMemoGroupVisible(current,id,visible,scopedMemos))}
          onCreateGroup={createTreeGroup}
          onRenameGroup={renameTreeGroup}
          onDeleteGroup={deleteTreeGroup}
          onAssignGroup={assignTreeGroup}
          onClose={()=>dispatchApp({type:'toggle-memo-tree'})}
        />
        {memoTreeError&&<p role="alert" data-testid="memo-tree-error"
          className="border-t border-red-300 bg-red-50 p-2 text-xs text-red-800">{memoTreeError}</p>}
      </div> : null}
      memoTreeOpen={memoAvailable&&appState.memoTreeOpen}
      compactPanel={appState.compactPanel}
      toolsOpen={appState.toolsOpen}
      onClosePanel={panel=>{
        if(panel==='layers'){dispatchApp({type:'close-layers'});requestAnimationFrame(()=>viewerShell.current?.querySelector<HTMLButtonElement>('[data-viewer-group=work]')?.focus({preventScroll:true}));}
        else if(panel==='outlines'){dispatchApp({type:'toggle-outline-tree'});requestAnimationFrame(()=>viewerShell.current?.querySelector<HTMLButtonElement>('[data-viewer-group=work]')?.focus({preventScroll:true}));}
        else if(panel==='memos'){dispatchApp({type:'toggle-memo-tree'});requestAnimationFrame(()=>viewerShell.current?.querySelector<HTMLButtonElement>('[data-viewer-group=work]')?.focus({preventScroll:true}));}
        else {closeMemoEditor();dispatchApp({type:'close-tools'});requestAnimationFrame(()=>viewerShell.current?.querySelector<HTMLButtonElement>('[data-viewer-group=work]')?.focus({preventScroll:true}));}
      }}
      textSearchOpen={searchOpen}
      onCloseTextSearch={()=>{setSearchOpen(false);requestAnimationFrame(()=>viewerShell.current?.querySelector<HTMLButtonElement>('[data-testid="cad-text-search-trigger"]')?.focus({preventScroll:true}));}}
      textSearch={{getManager,format,ready:state.ready,loading,layers,selectedLayers,
        open:searchOpen,onOpenChange:setSearchOpen}}
      canvas={
        <>
          <div
            ref={container}
            data-testid="cad-canvas"
            className="absolute inset-0 h-full min-h-0 w-full overflow-hidden bg-black"
            aria-label={`${format} 도면`}
            onContextMenu={event=>{
              if(event.target instanceof HTMLCanvasElement && deleteModeAvailable &&
                 manager.current?.isSelectedGeneratedAt(event.clientX,event.clientY)){
                event.preventDefault();
                setContextMenu({
                  x:Math.min(event.clientX,Math.max(0,window.innerWidth-230)),
                  y:Math.min(event.clientY,Math.max(0,window.innerHeight-100)),
                });
              }
            }}
          />
          {memoServerMode==='active' && storedSceneRevision!==null && <PersistedOutlineOverlay
            outlines={storedOutlines.filter(o=>o.sceneRevision===storedSceneRevision)}
            hidden={storedOutlineHidden} getManager={getManager} viewRevision={viewRevision} />}
          {memoAvailable && <CadMemoOverlay
            memos={canvasMemos}
            selectedId={memoScoped?memoSelectedId:null}
            placing={memoScoped && memoPlacing}
            candidate={memoScoped?memoCandidate:null}
            getManager={getManager}
            viewRevision={viewRevision}
            getViewEpoch={getViewEpoch}
            cancelGestureSignal={memoCancelSignal}
            onPlace={placeMemo}
            onSelect={selectMemo}
            onStartInteraction={id=>beginMemoInteraction(id)}
            onMove={moveMemoFromCanvas}
            onGestureActive={onMemoGestureActive}
          />}
          {contextMenu && <div data-testid="generated-context-menu" data-canvas-edit-escape-layer="context" role="menu"
            aria-label="생성 개체 컨텍스트 작업"
            className="fixed z-[70] rounded border border-slate-300 bg-white p-2 text-slate-800 shadow-lg"
            style={{left:contextMenu.x,top:contextMenu.y}}>
            <button type="button" role="menuitem" data-testid="generated-context-delete"
              disabled={!canDeleteSelection}
              title={canDeleteSelection?'현재 선택된 생성 개체 삭제':editCapability.reason}
              onClick={()=>openDelete()}
              className="rounded px-2 py-1 text-sm hover:bg-slate-100 disabled:opacity-50">
              선택한 생성 개체 {generatedCount}개 삭제
            </button>
            {!canDeleteSelection && <p className="max-w-56 text-xs text-amber-800">{editCapability.reason}</p>}
          </div>}
        </>
      }
      tools={
        outlineAvailable || memoAvailable || (renderer === 'three-dxf-viewer' && format === 'DXF' && state.ready && savedCount > 0) ? <>
          {memoAvailable && <div data-testid="cad-memo-status"
            className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1 text-xs text-slate-800">
            <strong>CAD 메모 {memoServerMode==='active'?'M2 영속':'M1 임시'} · {scopedMemos.length}/100</strong>
            <span>{memoServerMode==='active'?'WCS 고정 · 서버 저장/다시 열기 · 작성자/Revision/CAS/감사 · 명시적 좌표 이동':'WCS 고정 · 임시 세션만 · Reload/Renderer/Version 변경 시 소실'}</span>
            {scopedMemos.length>0 && <span data-testid="cad-memo-latest">
              {scopedMemos.slice(-5).map(item=><button key={item.id} type="button"
                className="mr-1 rounded border border-amber-500 bg-white px-1.5 py-0.5 hover:bg-amber-100"
                onClick={()=>selectMemo(item.id)}>{item.title.slice(0,24)}</button>)}
            </span>}
          </div>}
          {memoAvailable && (memoPlacing || memoCandidate || memoSelectedId) && <CadMemoEditor
            fields={memoFields} onFieldsChange={setMemoFields}
            placing={memoPlacing} newAnchor={memoCandidate} selectedId={memoSelectedId}
            count={memos.length} error={memoError} confirmDelete={memoDeleteArmed}
            persistent={memoServerMode==='active'} busy={memoBusy}
            onConfirmCoordinate={placeMemoAtEnteredWcs} onCreate={createMemo}
            onSaveText={saveMemoText} onApplyPosition={moveMemoFromFields}
            onArmDelete={()=>setMemoDeleteArmed(true)} onDelete={deleteMemo}
            onCancel={closeMemoEditor}
            anchor={memoSelectedId?scopedMemos.find(m=>m.id===memoSelectedId)?.anchor:undefined}
            anchorOptions={[
              ...storedOutlines.map(o=>({value:'APP_CREATED:'+o.id,label:o.name+' (서버 객체)'})),
              ...storedOutlines.filter(o=>o.validationMode==='SOURCE_CANONICAL').flatMap(o=>
                o.sourceRefs.map(id=>({value:'DXF_IMPORTED:'+id,label:o.name+' · 인증 DXF '+id.slice(-8)})))
            ]}
            anchorTarget={memoAnchorTarget} onAnchorTargetChange={setMemoAnchorTarget}
            onAttach={()=>{void changeMemoAnchor('attach');}}
            onDetach={()=>{void changeMemoAnchor('detach');}}
            pendingSnapKind={pendingSnap?.kind}
            sessionSnap={memoSelectedId?sessionSnapProjection[memoSelectedId]:undefined}
            onSessionDetach={()=>{void detachSessionSnap();}}
          />}
          {memoAvailable&&memoSelectedId&&scopedMemos.filter(m=>m.id===memoSelectedId).map(m=>
            <CadMemoSettingsEditor key={m.id+':'+(m.revision??m.updatedAt)}
              memo={m} busy={memoBusy}
              enabled={memoServerMode==='off'||(memoServerMode==='active'&&memoFeaturesAvailable)}
              onSave={settings=>{void changeMemoMeta(m.id,{settings});}} />)}
          {outlineAvailable&&memoServerMode==='active'&&<section data-testid="cad-stored-outline-tools"
            className="border-b border-cyan-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
            <strong>영속 외곽선 {storedOutlines.length}개 (서버 조회/수정·CAS)</strong>
            {savedOutlines.length>0&&<div className="mt-1 flex flex-wrap gap-1">
              {savedOutlines.map(item=><button key={item.id} type="button"
                className="rounded border border-cyan-600 bg-white px-2 py-1 disabled:opacity-50"
                disabled={storedOutlineBusy||savedServerIds.has(item.id)}
                onClick={()=>{void saveSelectedOutline(item.id);}}>
                {item.name||item.id.slice(0,8)} · {savedServerIds.has(item.id)?'저장됨':'서버 저장'}
              </button>)}
            </div>}
            {storedOutlines.map(item=><div key={item.id} className="mt-1 flex flex-wrap items-center gap-1">
              <span title={item.id}>{item.name} (r{item.revision})</span>
              {item.sceneRevision!==storedSceneRevision&&<span className="text-red-800">Scene 변경·앵커 검토 필요</span>}
              <button type="button" className="rounded border px-2 py-1" onClick={()=>toggleStoredOutline(item.id)}>
                {storedOutlineHidden.has(item.id)?'보기':'숨기기'}</button>
              <button type="button" disabled={storedOutlineBusy} className="rounded border px-2 py-1"
                onClick={()=>{void updateStoredOutline(item,'rename');}}>이름</button>
              <button type="button" disabled={storedOutlineBusy||item.sceneRevision!==storedSceneRevision}
                className="rounded border px-2 py-1" onClick={()=>{void updateStoredOutline(item,'move');}}>이동</button>
              <button type="button" disabled={storedOutlineBusy||item.sceneRevision!==storedSceneRevision}
                className="rounded border px-2 py-1" onClick={()=>{void updateStoredOutline(item,'rotate');}}>회전</button>
              <button type="button" disabled={storedOutlineBusy||item.sceneRevision!==storedSceneRevision}
                className="rounded border border-red-500 px-2 py-1 text-red-800"
                onClick={()=>{void updateStoredOutline(item,'delete');}}>논리 삭제</button>
            </div>)}
            {storedOutlineError&&<p role="alert" className="mt-1 text-red-800">{storedOutlineError}</p>}
            <p className="text-slate-500">Show/Hide는 세션 한정 · 업무 타입 미승인 · Scene 변경 시 기존 앵커 자동 이동 금지</p>
          </section>}
          {treeAvailable && <div data-testid="cad-object-selection-tools"
            className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
            <strong>객체 선택 · 생성 개체 로컬 편집 (E3/E4)</strong>
            <Button size="sm" variant={canvasMode==='pan'&&!appState.outlineToolEnabled?'default':'outline'}
              data-testid="canvas-mode-pan" aria-pressed={canvasMode==='pan'&&!appState.outlineToolEnabled}
              onClick={()=>changeCanvasMode('pan')}>탐색 (Pan)</Button>
            <Button size="sm" variant={canvasMode==='objects'&&!appState.outlineToolEnabled?'default':'outline'}
              data-testid="canvas-mode-objects" aria-pressed={canvasMode==='objects'&&!appState.outlineToolEnabled}
              onClick={()=>changeCanvasMode('objects')}>렌더·생성 선택</Button>
            <Button size="sm" variant={canvasMode==='generated'&&!appState.outlineToolEnabled?'default':'outline'}
              data-testid="canvas-mode-generated" aria-pressed={canvasMode==='generated'&&!appState.outlineToolEnabled}
              onClick={()=>changeCanvasMode('generated')}>생성 개체만 선택</Button>
            <Button size="sm" variant="outline" disabled={!canvasSelection.length}
              onClick={()=>manager.current?.clearCanvasObjectSelection()}>통합 선택 해제</Button>
            <Button size="sm" variant="outline" data-testid="generated-delete-selected"
              disabled={!canDeleteSelection}
              title={canDeleteSelection ? '현재 선택된 생성 개체 삭제' :
                (deleteModeAvailable ? editCapability.reason : '생성 개체 편집 모드가 필요합니다.')}
              onClick={()=>openDelete()}>선택 삭제 ({generatedCount})</Button>
            <form data-testid="generated-translate-form" className="flex flex-wrap items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1"
              onSubmit={event=>{event.preventDefault();applyTranslation();}}>
              <span className="font-medium">WCS 평행이동</span>
              <label htmlFor="generated-translate-x">ΔX</label>
              <input id="generated-translate-x" data-testid="generated-translate-x" type="text" inputMode="decimal"
                autoComplete="off" className="w-24 rounded border border-slate-300 bg-white px-1.5 py-1 text-slate-900"
                value={translateX} onChange={event=>setTranslateX(event.target.value)}
                aria-label="이동량 ΔX" disabled={!deleteModeAvailable}/>
              <label htmlFor="generated-translate-y">ΔY</label>
              <input id="generated-translate-y" data-testid="generated-translate-y" type="text" inputMode="decimal"
                autoComplete="off" className="w-24 rounded border border-slate-300 bg-white px-1.5 py-1 text-slate-900"
                value={translateY} onChange={event=>setTranslateY(event.target.value)}
                aria-label="이동량 ΔY" disabled={!deleteModeAvailable}/>
              <span data-testid="generated-translate-unit" className="text-slate-600">
                {outlineInfo?.unitCode===4?'mm':outlineInfo?.unitCode===1?'inch':
                  outlineInfo?.unitCode===6?'m':outlineInfo?.unitCode===5?'cm':
                  outlineInfo?.unitCode==null||outlineInfo?.unitCode===0?'단위 미상':'INSUNITS '+outlineInfo.unitCode}
              </span>
              <button type="submit" data-testid="generated-translate-apply" disabled={!canDeleteSelection}
                title={canDeleteSelection?'선택한 모든 생성 개체에 동일 ΔX/ΔY 적용':editCapability.reason}
                className="rounded bg-teal-700 px-2.5 py-1 text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-400">
                이동 적용 ({generatedCount})
              </button>
              <span className="text-slate-500">선택된 생성 개체 경계를 5px 이상 드래그하면 미리보기 후 확정 · Esc 취소</span>
            </form>
            <Button size="sm" variant="outline" data-testid="generated-undo"
              disabled={generatedHistory.undo===0} title="생성 개체 편집 취소 (Ctrl/⌘+Z)"
              onClick={()=>manager.current?.undoGeneratedEdit()}>실행 취소 ({generatedHistory.undo})</Button>
            <Button size="sm" variant="outline" data-testid="generated-redo"
              disabled={generatedHistory.redo===0} title="생성 개체 편집 다시 실행 (Ctrl/⌘+Shift+Z / Ctrl+Y)"
              onClick={()=>manager.current?.redoGeneratedEdit()}>다시 실행 ({generatedHistory.redo})</Button>
            <span data-testid="generated-history-status" className="text-slate-600">
              최대 {generatedHistory.limit}단계 · 세션 임시 · 편집 결과는 서버에 저장되지 않음
              {' · '}Canvas 초점 Delete/Backspace 삭제 · Ctrl/⌘+Z 실행 취소
            </span>
            <span data-testid="canvas-selection-count">
              선택 {canvasSelection.length}개 · 원본 {sourceCount}개 · 생성 {generatedCount}개
            </span>
            <span data-testid="canvas-edit-gate" data-edit-enabled={editCapability.canEdit ? 'true' : 'false'}
              className={editCapability.canEdit?'font-medium text-teal-800':'font-medium text-amber-800'}>
              {editCapability.canEdit?'APP_CREATED 편집 대상':'APP_CREATED 변경 불가'} — {editCapability.reason}
            </span>
            {canvasSelection.length>0 && <details>
              <summary>통합 선택 참조 ({canvasSelection.length}건)</summary>
              <ul className="max-h-24 overflow-y-auto pl-2">
                {canvasSelection.slice(0,25).map(ref=><li key={ref.origin+':'+ref.id}>
                  {ref.origin==='SOURCE'?'SOURCE · 정밀 원본 (읽기 전용)':ref.origin==='RENDER'?'RENDER · DXF_IMPORTED (세션 작업 차분)':'GENERATED · APP_CREATED (로컬 편집 대상)'}
                  {' · '}<span title={ref.id}>{ref.origin==='RENDER'?ref.id.slice(-48):ref.id.slice(0,64)}</span>
                </li>)}
              </ul>
            </details>}
            <p className="w-full text-slate-600" data-testid="render-selection-scope">렌더 선택 단위: Object3D 전체. 평면 선과 단일 재질의 삼각형 표면을 지원합니다. 비평면·점·다중 재질·중첩 상위 기하는 표시만 합니다. 병합 BLOCK·Mesh·LineSegments의 개별 CAD Entity/Handle 선택을 보장하지 않습니다. 원본 {sourceCount}개 중 렌더 {renderCount}개.</p>
            <SceneWorkTools state={sceneWork} selection={canvasSelection}
              enabled={!appState.outlineToolEnabled&&canvasMode!=='pan'} error={sceneWorkError}
              onCommand={runSceneWork}
              onUndo={()=>{manager.current?.undoSceneWork();syncSavedOutlines();setOutlineInfo(manager.current?.getOutlineInfo()??null);}}
              onRedo={()=>{manager.current?.redoSceneWork();syncSavedOutlines();setOutlineInfo(manager.current?.getOutlineInfo()??null);}} />
          </div>}
          {appState.outlineToolEnabled && outlineAvailable && outlineInfo ? <div
        data-testid="cad-outline-tools"
        className="bg-white p-2 text-xs text-slate-800"
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <strong>객체 선택 · 외곽선</strong>
          <label htmlFor="outline-basis">기하 기준</label>
          <select id="outline-basis" data-testid="outline-basis" value={outlineBasis}
            className="rounded border border-slate-400 bg-white p-1 text-slate-900"
            onChange={event=>changeOutlineBasis(event.target.value as 'render'|'source')}>
            <option value="render">렌더 WCS 2D · APP_CREATED</option>
            <option value="source" disabled={!outlineInfo.entityCount||!!outlineInfo.sourceUnavailableReason}>정밀 원본 · 검증된 DXF Entity</option>
          </select>
          <Button size="sm" variant={outlineMode==='pan'?'default':'outline'} aria-pressed={outlineMode==='pan'} onClick={()=>selectionMode('pan')}>탐색 모드</Button>
          <Button size="sm" variant={outlineMode==='select'?'default':'outline'} aria-pressed={outlineMode==='select'} disabled={outlineBasis==='source'?(!outlineInfo.entityCount||!!outlineInfo.sourceUnavailableReason):!outlineInfo.renderEntityCount} onClick={()=>selectionMode('select')}>선택 모드</Button>
          <Button size="sm" variant="outline" disabled={!outlineSelection.length} onClick={()=>manager.current?.clearOutlineSelection()}>선택 해제</Button>
          <span data-testid="outline-selection-count">선택 {outlineSelection.length}개 / 분석 {outlineBasis==='source'?outlineInfo.entityCount:outlineInfo.renderEntityCount??0}개</span>
          <span data-testid="outline-render-mapping">렌더 대상 {outlineInfo.renderEntityCount??0}개 · 정밀 원본 매핑 {outlineInfo.entityCount}개 · 렌더 관측 {outlineInfo.renderedObjectCount??'—'}개 · 매핑 제외 {outlineInfo.excludedEntityCount??0}개</span>
          {outlineSelection.length>0 && <details>
            <summary>선택 객체 정보 ({outlineSelection.length}건)</summary>
            <ul className="max-h-24 overflow-y-auto pl-2">
              {outlineSelection.slice(0,25).map(entity=><li key={entity.id}>{entity.entityType} · {entity.layer} · Handle {entity.handle??'없음'} · {entity.stable?'고유 참조':'임시 참조'}</li>)}
            </ul>
          </details>}
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={!outlineSelection.length} onClick={()=>requestOutline('CONVEX')}>볼록 외곽선 미리보기</Button>
          <Button size="sm" variant="outline" disabled={!outlineSelection.length} onClick={()=>requestOutline('PRECISE')}>정밀 외곽선 미리보기</Button>
          <Button size="sm" disabled={!preview} title="현재 기하 기준의 APP_CREATED 외곽선을 브라우저 세션에 확정합니다." onClick={confirmOutline}>임시 확정</Button>
          <label htmlFor="outline-type-select" className="font-medium">업무 타입</label>
          <select id="outline-type-select" data-testid="outline-type-select"
            className="max-w-48 rounded border border-slate-400 bg-white p-1 text-slate-900"
            value={selectedOutlineTypeId}
            onChange={event=>setSelectedOutlineTypeId(event.target.value)}
            disabled={selectableTypes.length===0}>
            <option value="">업무 타입 선택</option>
            {selectableTypes.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <label htmlFor="outline-instance-name" className="font-medium">외곽선 이름</label>
          <input id="outline-instance-name" data-testid="outline-instance-name" type="text" maxLength={100}
            className="max-w-40 rounded border border-slate-400 bg-white p-1 text-slate-900"
            value={outlineName} onChange={event=>setOutlineName(event.target.value)}
            placeholder="기본: 외곽선 N" />
          <Button size="sm" data-testid="outline-typed-confirm"
            disabled={!typedConfirmAvailable} onClick={confirmTypedOutline}>타입 지정 후 확정</Button>
          <Button size="sm" variant="outline" disabled={!preview} onClick={cancelOutline}>미리보기 취소</Button>
          <Button size="sm" variant="outline" disabled={!savedCount} onClick={exportOutlines}>JSON 내보내기 ({savedCount})</Button>
          <Button size="sm" variant="outline" disabled={!savedCount} onClick={()=>manager.current?.clearSavedOutlines()}>임시 결과 삭제</Button>
        </div>
        {!selectableTypes.length && <p data-testid="outline-type-gate" className="mb-1 text-amber-800">서버에서 제공하는 활성·해당 Scope 업무 타입이 없습니다. #65 승인 전 타입 지정 저장은 차단되며 미분류 외곽선만 영속 저장할 수 있습니다.</p>}
        {outlineInfo.sourceUnavailableReason && <p data-testid="exact-source-unavailable" className="text-amber-800">정밀 원본: {outlineInfo.sourceUnavailableReason} · 일반 렌더 작업과 독립 메모는 사용 가능합니다.</p>}
        {outlineBasis==='render' && <p className="text-slate-600">화면에 표시된 지원 geometry의 WCS XY 기하를 사용합니다. 볼록 경계는 근사 포락선이며 폐영역 검증은 화면 기하 기준입니다. 원본 CAD 정밀성·서버 canonical 검증을 의미하지 않습니다.</p>}
        <p className="text-slate-600">선택 모드: 클릭 한 개, Ctrl/⌘+클릭 토글, 좌→우 완전 포함, 우→좌 교차 선택 · Space+드래그 이동 · 휠 확대 · Esc 선택 취소.</p>
        <p className="mt-1 text-slate-600">좌표: WCS XY · 도면 단위: {outlineInfo.unitCode===4?'mm':outlineInfo.unitCode===1?'inch':outlineInfo.unitCode===6?'m':outlineInfo.unitCode===5?'cm':outlineInfo.unitCode===0||outlineInfo.unitCode===null?'미상':'INSUNITS '+outlineInfo.unitCode} · 서버 저장은 아래 영속 외곽선 패널을 사용</p>
        {preview && <p data-testid="outline-preview" className="mt-1 text-cyan-800">{preview.kind==='CONVEX'?'볼록 경계':'실제 폐곡선 Union'} · {preview.geometry.type} · {preview.durationMs.toFixed(1)}ms · {preview.persistable?'안정적 Handle':'임시 참조 포함'}</p>}
        {preview?.warnings.map((message,i)=><p key={i} className="text-amber-800">{message}</p>)}
        {previewError && <p role="alert" className="text-red-700">{previewError}</p>}
        {outlineInfo.warnings.length>0 && <details className="mt-2 text-amber-800">
          <summary>미지원/불안정 Entity 안내 ({outlineInfo.warnings.length}건, 최대 200건 표시)</summary>
          <ul className="max-h-28 list-disc overflow-y-auto pl-4">{outlineInfo.warnings.slice(0,30).map((warning,i)=><li key={i}>{warning}</li>)}</ul>
        </details>}
      </div> : renderer === 'three-dxf-viewer' && format === 'DXF' && state.ready && savedCount > 0 ? (
        <div data-testid="outline-saved-tools" className="flex flex-wrap items-center gap-3 bg-white p-2 text-xs text-slate-800">
          <strong>임시 확정 외곽선 {savedCount}건</strong>
          <span>생성 도구 OFF · 확정된 Overlay는 계속 표시됩니다.</span>
          <Button size="sm" variant="outline" onClick={exportOutlines}>JSON 내보내기 ({savedCount})</Button>
        </div>
      ) : null}
        </> : null
      }
      status={
        <>
          {memoServerMode==='unavailable'&&<p role="alert" className="text-xs text-red-800">메모 서버에 연결할 수 없어 메모 변경을 차단했습니다. {memoError}</p>}
          {(memoLinkGateNotice||memoLinkNotice)&&<p data-testid="memo-link-notice" role="status" className="text-xs text-amber-700">
            {memoLinkGateNotice??memoLinkNotice?.message}
            {requestedMemoId&&(memoLinkGateNotice?.includes('로그인 및')||(!memoLinkGateNotice&&memoLinkNotice?.retryable))&&
              <button type="button" className="ml-2 underline" data-testid="memo-link-retry"
                onClick={()=>{
                  setMemoLinkNotice(null);
                  if(memoServerMode==='unavailable'||memoServerMode==='off')setMemoListRetry(n=>n+1);
                  else setMemoDetailRetry(n=>n+1);
                }}>메모만 다시 조회</button>}
          </p>}
          <div className="flex flex-wrap items-center gap-x-2"><p role="status" className="text-xs text-slate-700">{state.status}</p><span data-testid="viewer-active-renderer" className="text-xs text-slate-600">{renderer}</span></div>
          {state.warning && <p className="text-xs text-amber-800" data-testid="viewer-coverage">{state.warning}</p>}
          {linkFallbackUrl?.renderer===renderer && <label className="block text-xs">{linkFallbackUrl.url.includes('&memo=')?'메모 링크':'현재 Viewer 링크'}<input readOnly aria-label={linkFallbackUrl.url.includes('&memo=')?'복사할 메모 링크':'복사할 Viewer 주소'} value={linkFallbackUrl.url} onFocus={event=>event.currentTarget.select()} /> <a className="underline" href={linkFallbackUrl.url} target="_blank" rel="noopener noreferrer">링크 열기</a></label>}
          {recoveryNotice && <p data-testid="viewer-recovery-notice" className="text-xs text-amber-800">{recoveryNotice}</p>}
          {sceneNotice&&<p aria-live="polite" data-testid="scene-status" className="text-xs text-slate-700">{sceneNotice}</p>}
          {state.error && <p role="alert" className="text-xs text-red-700">{state.error} <button type="button" className="underline" onClick={reload}>다시 시도</button> <a className="underline" href={`/api/cad-files/${versionId}/content`} download>원본 다운로드</a> {format==='DXF' && <a className="underline" href={`/cad/versions/${versionId}/viewer?renderer=dxf-viewer`}>dxf-viewer 링크 (원본 사용)</a>}</p>}
          {outlineNotice && <p data-testid="outline-tool-notice" className="text-xs text-teal-800">{outlineNotice}</p>}
           {deleteError && <p data-testid="generated-delete-error" role="alert" className="text-xs text-red-700">{deleteError}</p>}
           {translateError && <p data-testid="generated-translate-error" role="alert" className="text-xs text-red-700">{translateError}</p>}
          {memoError && !memoPlacing && !memoCandidate && !memoSelectedId &&
            <p data-testid="cad-memo-status-error" role="alert" className="text-xs text-red-700">{memoError}</p>}
          {outlineUnavailable && <p data-testid="outline-tool-unavailable" className="text-xs text-slate-500">{outlineUnavailable}</p>}
        </>
      }
      modalOverlay={deleteRequest ? <GeneratedDeleteDialog request={deleteRequest}
        onCancel={()=>setDeleteRequest(null)} onConfirm={confirmDelete} /> : null}
      nativeLoadingOverlay={loading ? <div data-testid="viewer-loading-overlay" role="progressbar" aria-label="도면 로딩 중" className="pointer-events-none absolute inset-0 z-[65] flex items-center justify-center bg-slate-950/45"><div className="pointer-events-auto max-w-sm rounded-lg bg-white p-4 text-sm text-slate-900 shadow-xl"><p>도면을 여는 중입니다…</p>{format==='DXF' && <button type="button" className="mt-3 rounded bg-teal-700 px-3 py-2 text-white" onClick={()=>choose(renderer==='three-dxf-viewer'?'dxf-viewer':'three-dxf-viewer')}>로딩 중단 후 {renderer==='three-dxf-viewer'?'dxf-viewer':'three-dxf-viewer'}로 열기</button>}<a className="mt-2 block underline" href={`/api/cad-files/${versionId}/content`} download>원본 다운로드</a></div></div> : null}
    />

    {!isFullscreen && metric && <div className="rounded border border-slate-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center gap-4">
        <span>전체 {metric.totalMs.toFixed(1)} ms</span>
        <span>도면 처리 {metric.adapterLoadMs?.toFixed(1) ?? '—'} ms</span>
        <span>첫 화면 관찰 {metric.firstDisplayMs?.toFixed(1) ?? '—'} ms</span>
        <span>원본 {metric.sourceMode === 'memory' ? '메모리 재사용' : metric.sourceMode === 'pending' ? '다운로드 공유' : '새로 받음'}</span>
        <Button variant="outline" size="sm" onClick={() => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(metric, null, 2)], { type: 'application/json' }));
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `cad-metrics-${renderer}.json`;
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 0);
        }}>측정 JSON 저장</Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">DWG는 WASM 초기화·파싱 시간을 별도 표시합니다. GPU/WASM 메모리와 변환 시간은 별도 계측하지 않습니다.</p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs">측정 상세</summary>
        <pre data-testid="viewer-metric" className="mt-2 overflow-auto text-xs">{JSON.stringify(metric, null, 2)}</pre>
      </details>
    </div>}
    {!isFullscreen && <p className="text-xs text-slate-500">탐색 모드: 마우스 드래그로 이동 · 휠로 확대/축소. {format === 'DWG' ? 'DWG는 현재 20 MiB 이하의 평면 LINE만 직접 표시합니다. TEXT/BLOCK/곡선 등은 지원하지 않습니다.' : '한글 기본 글꼴을 사용합니다.'} 원본 글꼴·문자 인코딩·일부 Entity·선종·치수에 따라 CAD 원본과 다르게 표시될 수 있습니다.</p>}
  </div>;
}
