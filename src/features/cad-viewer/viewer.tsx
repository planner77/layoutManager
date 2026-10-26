'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FullscreenLayerPanel } from '@/features/cad-viewer/fullscreen-layer-panel';
import { CadTextSearch } from '@/features/cad-viewer/cad-text-search';
import { ViewerAppShell } from '@/features/cad-viewer/viewer-app-shell';
import { ViewerMenuBar } from '@/features/cad-viewer/viewer-menu-bar';
import type { ViewerCommandGroup } from '@/features/cad-viewer/viewer-command-menu';
import { OutlineTreePanel } from '@/features/cad-viewer/outline-tree-panel';
import { GeneratedDeleteDialog } from '@/features/cad-viewer/generated-delete-dialog';
import {parseWcsTranslation,selectedTranslationIds} from '@/domain/generated-translate';
import { initialViewerAppState, viewerAppReducer } from '@/features/cad-viewer/viewer-app-state';
import { isLiveOutlineRequest, outlineToolUnavailableReason } from '@/features/cad-viewer/outline-tool-policy';
import { ViewerManager, type OutlineInfo, type SavedOutline, type SavedOutlineOverlayState } from '@/viewers/core/adapter';
import {buildOutlineExport} from '@/domain/outline-draft';
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
import { cadViewerUrl } from '@/viewers/core/link';
import { ViewerLoadError, isViewerCancellation } from '@/viewers/core/viewer-load-error';

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
}) {
  const [renderer, setRenderer] = useState(selectRenderer(format, initialRenderer));
  const [source] = useState(() => new ViewerSource());
  const container = useRef<HTMLDivElement>(null);
  const viewerShell = useRef<HTMLDivElement>(null);
  const manager = useRef<ViewerManager | null>(null);
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
  const [layers, setLayers] = useState<string[]>([]);
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(() => new Set());
  const [metric, setMetric] = useState<ViewerMetric | null>(null);
  // A direct URL, reload or list navigation always starts in CSS immersive mode.
  // Native fullscreen can only be requested after an explicit user gesture.
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [outlineInfo,setOutlineInfo]=useState<OutlineInfo|null>(null);
  const [outlineMode,setOutlineMode]=useState<'pan'|'select'>('pan');
  const [outlineSelection,setOutlineSelection]=useState<OutlineEntity[]>([]);
  const [canvasMode,setCanvasMode]=useState<'pan'|'objects'|'generated'>('pan');
  const [canvasSelection,setCanvasSelection]=useState<CanvasObjectRef[]>([]);
  const [preview,setPreview]=useState<OutlineResult|null>(null);
  const [previewError,setPreviewError]=useState<string|null>(null);
  const [savedCount,setSavedCount]=useState(0);
  const [savedOutlines,setSavedOutlines]=useState<SavedOutline[]>([]);
  const [savedOverlayStates,setSavedOverlayStates]=useState<SavedOutlineOverlayState[]>([]);
  const [generatedHistory,setGeneratedHistory]=useState({undo:0,redo:0,limit:100});
  const [deleteRequest,setDeleteRequest]=useState<GeneratedDeleteRequest|null>(null);
  const [deleteError,setDeleteError]=useState<string|null>(null);
  const [translateX,setTranslateX]=useState('0');
  const [translateY,setTranslateY]=useState('0');
  const [translateError,setTranslateError]=useState<string|null>(null);
  const [contextMenu,setContextMenu]=useState<{x:number;y:number}|null>(null);
  const [selectedOutlineTypeId,setSelectedOutlineTypeId]=useState('');
  const [outlineName,setOutlineName]=useState('');
  const [outlineNotice,setOutlineNotice]=useState<string|null>(null);
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
  }, []);
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
        if(current.getCanvasObjectSelection().some(ref=>ref.origin==='SOURCE'))
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
  },[renderer,format,state.ready,canvasMode,versionId,sourceSha256]);
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
        if(name==='layers')dispatchApp({type:'close-layers'});
        else if(name==='outlines')dispatchApp({type:'toggle-outline-tree'});
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
  },[syncSavedOutlines,deleteRequest,contextMenu,state.ready,canvasMode,openDelete,nameTipOpen,infoOpen]);
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
    setDeleteRequest(null);setDeleteError(null);setContextMenu(null);
    setTranslateX('0');setTranslateY('0');setTranslateError(null);
    setCanvasMode('pan');
    setCanvasSelection([]);
    setSelectedOutlineTypeId('');
    setOutlineName('');
    setOutlineNotice(null);
  }, [stopOutlineEditing]);
  function toggleOutlineTool() {
    if (!outlineAvailable) return;
    setDeleteRequest(null);setContextMenu(null);
    const enabled = !outlineEnabledRef.current;
    outlineEnabledRef.current = enabled;
    if (enabled) {
      outlineRequestRevisionRef.current++;
      manager.current?.clearCanvasObjectSelection();
      setCanvasMode('pan');
      manager.current?.setSelectionMode('select');
      setOutlineMode('select');
      setOutlineNotice(null);
    } else {
      stopOutlineEditing();
      setOutlineNotice('외곽선 생성 OFF: 비확정 선택·미리보기 및 진행 중 계산이 취소되었습니다. 임시 확정 결과와 JSON 내보내기는 유지됩니다.');
    }
    dispatchApp({ type: 'set-outline-tool', enabled });
    if(enabled && !appState.toolsOpen)dispatchApp({type:'toggle-tools',exclusive:isCompact});
  }
  /** General selection and generated-only targeting are independent of U3. */
  function changeCanvasMode(next:'pan'|'objects'|'generated') {
    if (!outlineAvailable) return;
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
    manager.current?.setSelectionMode(value);setOutlineMode(value);
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
    const hasWork=current.getSavedOutlines().length>0 || current.getGeneratedHistory().undo>0 ||
      current.getGeneratedHistory().redo>0 || current.getCanvasObjectSelection().length>0 ||
      current.getOutlineSelection().length>0;
    return !hasWork || window.confirm('임시 외곽선·실행 취소 이력·선택 상태가 사라집니다. 계속하시겠습니까?');
  }, []);
  const choose = useCallback((value: typeof renderer) => {
    if (value === renderer) return;
    if (!confirmDiscard()) return;
    loadSequenceRef.current++;
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
    const url = new URL(window.location.href);
    url.searchParams.set('renderer', value);
    window.history.replaceState(null, '', url);
  }, [loading, renderer, resetOutline, confirmDiscard, source, versionId]);

  function reload() {
    if (loading || !confirmDiscard()) return;
    loadSequenceRef.current++;
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
    setAttempt(value => value + 1);
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
            versionId,sourceSha256,
            onSelection:value=>{if(active && loadSequenceRef.current===sequence && outlineEnabledRef.current)setOutlineSelection(value);},
            onObjectSelection:refs=>{if(active && loadSequenceRef.current===sequence){setCanvasSelection(refs);syncSavedOutlines();}},
            onPreview:(value,error)=>{if(active && loadSequenceRef.current===sequence && outlineEnabledRef.current){setPreview(value);setPreviewError(error??null);}},
            onSaved:count=>{if(active && loadSequenceRef.current===sequence){setSavedCount(count);syncSavedOutlines();}},
            onEditError:message=>{if(active && loadSequenceRef.current===sequence)setTranslateError(message);},
          });
        }
        const { DxfViewerAdapter } = await import('@/viewers/dxf-viewer/adapter');
        if (!active || loadSequenceRef.current!==sequence || !container.current) throw new DOMException('취소됨', 'AbortError');
        return new DxfViewerAdapter(container.current);
      },
      source,
      { renderer, versionId, report: value => { if (active && loadSequenceRef.current===sequence) setMetric({ ...value, fallback: fallbackReason.current ? { reasonCode: fallbackReason.current, attempt: 1 } : undefined }); } },
      format,
    );
    manager.current = instance;
    instance.load(`/api/cad-files/${versionId}/content`, format).then(result => {
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
        if(fallbackReason.current && renderer==='dxf-viewer')setRecoveryNotice(`three-dxf-viewer 실패 (${fallbackReason.current}) 후 dxf-viewer로 표시했습니다. 일부 선택·외곽선 기능은 지원되지 않습니다.`);
      }
    }).catch(error => {
      if (active && loadSequenceRef.current===sequence && renderer === 'three-dxf-viewer' && format === 'DXF' &&
          error instanceof ViewerLoadError && error.stage !== 'source' && !fallbackTried.current) {
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
      instance.dispose();
      manager.current = null;
    };
  }, [versionId, sourceSha256, attempt, renderer, source, format, resetOutline, syncSavedOutlines]);

  const layerAvailable = renderer === 'three-dxf-viewer' && layers.length > 0 && state.ready;
  const outlineUnavailable = outlineToolUnavailableReason({
    renderer, format, loading, ready: state.ready,
    entityCount: outlineInfo?.entityCount, sourceSha256,
  });
  const outlineAvailable = outlineUnavailable === null;
  const selectableTypes=selectableOutlineTypes(outlineTypeCatalog,versionId,sourceSha256);
  const typedConfirmAvailable=!!preview?.persistable && selectableTypes.some(item=>item.id===selectedOutlineTypeId);
  const treeUnavailable =
    format !== 'DXF' || renderer !== 'three-dxf-viewer'
      ? '외곽선 목록은 DXF의 three-dxf-viewer에서만 사용할 수 있습니다.'
      : loading || !state.ready
        ? '도면 로딩이 완료된 뒤 외곽선 목록을 볼 수 있습니다.'
        : !/^[a-f0-9]{64}$/i.test(sourceSha256) || !outlineInfo || !outlineInfo.entityCount
          ? '검증된 원본 SHA-256 및 선택 가능한 외곽선 인덱스가 필요합니다.'
          : null;
  const treeAvailable=treeUnavailable===null;
  const editCapability=canvasEditCapability(canvasSelection,{versionId,sourceSha256});
  const sourceCount=canvasSelection.filter(ref=>ref.origin==='SOURCE').length;
  const generatedCount=canvasSelection.length-sourceCount;
  const deleteModeAvailable=outlineAvailable && !appState.outlineToolEnabled &&
    canvasMode!=='pan';
  const canDeleteSelection=deleteModeAvailable && editCapability.canEdit;
  const closeMetadataOverlays=useCallback(()=>{setNameTipOpen(false);setNameTipPinned(false);setInfoOpen(false);},[]);
  const commandGroups:ViewerCommandGroup[]=[
    {id:'drawing',label:'도면',commands:[
      {id:'info',label:'도면 정보',onSelect:()=>setInfoOpen(value=>!value)},
      {id:'versions',label:'버전 목록',kind:'link',href:`/cad/locations/${locationId}`},
      {id:'reload',label:'다시 불러오기',disabled:loading,reason:loading?'로딩이 끝난 뒤 다시 불러올 수 있습니다.':undefined,onSelect:reload},
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
      {id:'fullscreen',label:isFullscreen?'전체 화면 종료':'전체 화면',onSelect:isFullscreen?exitFullscreen:enterFullscreen},
      {id:'native',label:isNativeFullscreen?'브라우저 전체 화면 해제':'브라우저 전체 화면',disabled:loading,onSelect:toggleNativeFullscreen},
    ]},
    {id:'work',label:'작업',commands:[
      {id:'layers',label:'레이어 패널',testId:'viewer-menu-layers',kind:'checkbox',checked:appState.layerPanelOpen,expanded:layerAvailable&&appState.layerPanelOpen,controls:layerAvailable&&appState.layerPanelOpen?'viewer-layer-dock':undefined,disabled:!layerAvailable,reason:!layerAvailable?'레이어 패널은 로딩 완료된 three-dxf-viewer에서만 사용할 수 있습니다.':undefined,onSelect:()=>dispatchApp({type:'toggle-layers',exclusive:isCompact})},
      {id:'tools',label:'선택·편집 도구',testId:'viewer-menu-tools',kind:'checkbox',checked:appState.toolsOpen,expanded:outlineAvailable&&appState.toolsOpen,controls:outlineAvailable&&appState.toolsOpen?'viewer-tools-dock':undefined,disabled:!outlineAvailable,reason:outlineUnavailable??undefined,onSelect:()=>dispatchApp({type:'toggle-tools',exclusive:isCompact})},
      {id:'outline',label:'외곽선 생성',testId:'viewer-menu-outline-tool',kind:'checkbox',checked:appState.outlineToolEnabled,expanded:appState.outlineToolEnabled&&appState.toolsOpen,controls:appState.outlineToolEnabled&&appState.toolsOpen?'viewer-tools-dock':undefined,disabled:!outlineAvailable,reason:outlineUnavailable??undefined,onSelect:toggleOutlineTool},
      {id:'tree',label:'외곽선 목록',testId:'viewer-menu-outline-tree',kind:'checkbox',checked:appState.outlineTreeOpen,expanded:treeAvailable&&appState.outlineTreeOpen,controls:treeAvailable&&appState.outlineTreeOpen?'viewer-outline-tree-dock':undefined,disabled:!treeAvailable,reason:treeUnavailable??undefined,onSelect:()=>dispatchApp({type:'toggle-outline-tree',exclusive:isCompact})},
      {id:'search',label:'도면 내 텍스트 검색',kind:'checkbox',checked:searchOpen,disabled:format!=='DXF'||!state.ready,reason:format==='DWG'?'DWG 내부 텍스트 검색은 제공하지 않습니다.':!state.ready?'도면 표시 완료 후 검색할 수 있습니다.':undefined,onSelect:()=>setSearchOpen(value=>!value)},
      {id:'types',label:'외곽선 타입 관리',testId:'viewer-menu-outline-types',disabled:true,reason:'관리자 인증·인가 및 업무 타입 정책 승인 전에는 등록 기능을 제공하지 않습니다.'},
    ]},
  ];

  return <div className="space-y-3">
    <ViewerAppShell
      shellRef={viewerShell}
      isFullscreen={isFullscreen}
      isNativeFullscreen={isNativeFullscreen}
      menuBar={
        <ViewerMenuBar commandGroups={commandGroups} onMenuOpen={closeMetadataOverlays} />
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
      compactPanel={appState.compactPanel}
      toolsOpen={appState.toolsOpen}
      onClosePanel={panel=>{
        if(panel==='layers'){dispatchApp({type:'close-layers'});requestAnimationFrame(()=>viewerShell.current?.querySelector<HTMLButtonElement>('[data-viewer-group=work]')?.focus({preventScroll:true}));}
        else if(panel==='outlines'){dispatchApp({type:'toggle-outline-tree'});requestAnimationFrame(()=>viewerShell.current?.querySelector<HTMLButtonElement>('[data-viewer-group=work]')?.focus({preventScroll:true}));}
        else {dispatchApp({type:'close-tools'});requestAnimationFrame(()=>viewerShell.current?.querySelector<HTMLButtonElement>('[data-viewer-group=work]')?.focus({preventScroll:true}));}
      }}
      canvas={
        <>
          <CadTextSearch key={versionId + ':' + renderer + ':' + attempt}
            getManager={getManager} format={format} ready={state.ready} loading={loading}
            layers={layers} selectedLayers={selectedLayers}
            open={searchOpen} onOpenChange={setSearchOpen} />
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
        outlineAvailable || (renderer === 'three-dxf-viewer' && format === 'DXF' && state.ready && savedCount > 0) ? <>
          {outlineAvailable && <div data-testid="cad-object-selection-tools"
            className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
            <strong>객체 선택 · 생성 개체 로컬 편집 (E3/E4)</strong>
            <Button size="sm" variant={canvasMode==='pan'&&!appState.outlineToolEnabled?'default':'outline'}
              data-testid="canvas-mode-pan" aria-pressed={canvasMode==='pan'&&!appState.outlineToolEnabled}
              onClick={()=>changeCanvasMode('pan')}>탐색 (Pan)</Button>
            <Button size="sm" variant={canvasMode==='objects'&&!appState.outlineToolEnabled?'default':'outline'}
              data-testid="canvas-mode-objects" aria-pressed={canvasMode==='objects'&&!appState.outlineToolEnabled}
              onClick={()=>changeCanvasMode('objects')}>원본·생성 선택</Button>
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
              {editCapability.canEdit?'생성 개체 편집 대상':'편집 불가 · 읽기 전용'} — {editCapability.reason}
            </span>
            {canvasSelection.length>0 && <details>
              <summary>통합 선택 참조 ({canvasSelection.length}건)</summary>
              <ul className="max-h-24 overflow-y-auto pl-2">
                {canvasSelection.slice(0,25).map(ref=><li key={ref.origin+':'+ref.id}>
                  {ref.origin==='SOURCE'?'SOURCE · 원본 (읽기 전용)':'GENERATED · 생성 (로컬 편집 대상)'}
                  {' · '}{ref.id.slice(0,64)}
                </li>)}
              </ul>
            </details>}
          </div>}
          {appState.outlineToolEnabled && outlineAvailable && outlineInfo ? <div
        data-testid="cad-outline-tools"
        className="bg-white p-2 text-xs text-slate-800"
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <strong>객체 선택 · 외곽선</strong>
          <Button size="sm" variant={outlineMode==='pan'?'default':'outline'} aria-pressed={outlineMode==='pan'} onClick={()=>selectionMode('pan')}>탐색 모드</Button>
          <Button size="sm" variant={outlineMode==='select'?'default':'outline'} aria-pressed={outlineMode==='select'} disabled={!outlineInfo.entityCount} onClick={()=>selectionMode('select')}>선택 모드</Button>
          <Button size="sm" variant="outline" disabled={!outlineSelection.length} onClick={()=>manager.current?.clearOutlineSelection()}>선택 해제</Button>
          <span data-testid="outline-selection-count">선택 {outlineSelection.length}개 / 분석 {outlineInfo.entityCount}개</span>
          <span data-testid="outline-render-mapping">렌더 관측 {outlineInfo.renderedObjectCount??'—'}개 · 매핑 제외 {outlineInfo.excludedEntityCount??0}개 · 원본 인덱스 {outlineInfo.sourceIndexMs?.toFixed(1)??'—'} ms · 렌더 대조 {outlineInfo.renderAuditMs?.toFixed(1)??'—'} ms · 공간 인덱스 {outlineInfo.spatialIndexMs?.toFixed(1)??'—'} ms</span>
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
          <Button size="sm" disabled={!preview} title="기존 U3 미분류 브라우저 임시 확정 (schemaVersion 1 호환)" onClick={confirmOutline}>임시 확정</Button>
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
        {!selectableTypes.length && <p data-testid="outline-type-gate" className="mb-1 text-amber-800">서버에서 제공하는 활성·해당 Scope 업무 타입이 없습니다. 관리자 등록 및 보안 선행 이슈 #65 완료 전에는 타입 지정 확정을 사용할 수 없습니다. 기존 미분류 임시 확정은 서버에 저장되지 않습니다.</p>}
        <p className="text-slate-600">선택 모드: 클릭 한 개, Ctrl/⌘+클릭 토글, 좌→우 완전 포함, 우→좌 교차 선택 · Space+드래그 이동 · 휠 확대 · Esc 선택 취소.</p>
        <p className="mt-1 text-slate-600">좌표: WCS XY · 도면 단위: {outlineInfo.unitCode===4?'mm':outlineInfo.unitCode===1?'inch':outlineInfo.unitCode===6?'m':outlineInfo.unitCode===5?'cm':outlineInfo.unitCode===0||outlineInfo.unitCode===null?'미상':'INSUNITS '+outlineInfo.unitCode} · 서버 저장/다시 불러오기 미지원 (권한 정책 결정 전)</p>
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
          <div className="flex flex-wrap items-center gap-x-2"><p role="status" className="text-xs text-slate-700">{state.status}</p><span data-testid="viewer-active-renderer" className="text-xs text-slate-600">{renderer}</span></div>
          {state.warning && <p className="text-xs text-amber-800" data-testid="viewer-coverage">{state.warning}</p>}
          {linkFallbackUrl?.renderer===renderer && <label className="block text-xs">현재 Viewer 링크<input readOnly aria-label="복사할 Viewer 주소" value={linkFallbackUrl.url} onFocus={event=>event.currentTarget.select()} /></label>}
          {recoveryNotice && <p data-testid="viewer-recovery-notice" className="text-xs text-amber-800">{recoveryNotice}</p>}
          {state.error && <p role="alert" className="text-xs text-red-700">{state.error} <button type="button" className="underline" onClick={reload}>다시 시도</button> <a className="underline" href={`/api/cad-files/${versionId}/content`} download>원본 다운로드</a> {format==='DXF' && <a className="underline" href={`/cad/versions/${versionId}/viewer?renderer=dxf-viewer`}>dxf-viewer 링크</a>}</p>}
          {outlineNotice && <p data-testid="outline-tool-notice" className="text-xs text-teal-800">{outlineNotice}</p>}
           {deleteError && <p data-testid="generated-delete-error" role="alert" className="text-xs text-red-700">{deleteError}</p>}
           {translateError && <p data-testid="generated-translate-error" role="alert" className="text-xs text-red-700">{translateError}</p>}
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
