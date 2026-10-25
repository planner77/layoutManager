'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { GlobalLoadingOverlay, useGlobalLoading } from '@/components/global-loading';
import { CopyCadLink } from '@/features/cad-link/copy-cad-link';
import { FullscreenLayerPanel } from '@/features/cad-viewer/fullscreen-layer-panel';
import { CadTextSearch } from '@/features/cad-viewer/cad-text-search';
import { LayerDropdown } from '@/features/cad-viewer/layer-dropdown';
import { ViewerAppShell } from '@/features/cad-viewer/viewer-app-shell';
import { ViewerMenuBar } from '@/features/cad-viewer/viewer-menu-bar';
import { OutlineTreePanel } from '@/features/cad-viewer/outline-tree-panel';
import { initialViewerAppState, viewerAppReducer } from '@/features/cad-viewer/viewer-app-state';
import { isLiveOutlineRequest, outlineToolUnavailableReason } from '@/features/cad-viewer/outline-tool-policy';
import { ViewerManager, type OutlineInfo, type SavedOutline, type SavedOutlineOverlayState } from '@/viewers/core/adapter';
import {buildOutlineExport} from '@/domain/outline-draft';
import {resolveOutlineAssignment,selectableOutlineTypes,type ScopedOutlineCatalog} from '@/domain/outline-assignment';
import type {OutlineKind,OutlineEntity} from '@/viewers/core/outline-geometry';
import type {OutlineResult} from '@/viewers/core/outline-compute';
import type { ViewerMetric } from '@/viewers/core/metrics';
import { selectRenderer, type ViewerFormat, type ViewerRenderer } from '@/viewers/core/selection';
import { ViewerSource } from '@/viewers/core/source';

export function CadViewer({
  versionId,
  sourceSha256 = '',
  renderer: initialRenderer = 'dxf-viewer',
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
  const layerMenuButton = useRef<HTMLButtonElement>(null);
  const outlineTreeMenuButton = useRef<HTMLButtonElement>(null);
  const manager = useRef<ViewerManager | null>(null);
  // Synchronously gate events before React's reducer has rendered the next frame.
  const outlineEnabledRef = useRef(false);
  const outlineRequestRevisionRef = useRef(0);
  const getManager = useCallback(() => manager.current, []);
  const loadSequenceRef = useRef(0);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const { isLoading, beginLoading, endLoading } = useGlobalLoading();
  const [loading, setLoading] = useState(true);
  const [appState, dispatchApp] = useReducer(viewerAppReducer, initialViewerAppState);
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
  const [preview,setPreview]=useState<OutlineResult|null>(null);
  const [previewError,setPreviewError]=useState<string|null>(null);
  const [savedCount,setSavedCount]=useState(0);
  const [savedOutlines,setSavedOutlines]=useState<SavedOutline[]>([]);
  const [savedOverlayStates,setSavedOverlayStates]=useState<SavedOutlineOverlayState[]>([]);
  const [selectedOutlineTypeId,setSelectedOutlineTypeId]=useState('');
  const [outlineName,setOutlineName]=useState('');
  const [outlineNotice,setOutlineNotice]=useState<string|null>(null);
  const [state, setState] = useState<{ status: string; ready: boolean; error?: string; warning?: string }>({
    status: '도면 로딩 중…',
    ready: false,
  });

  useEffect(() => () => source.dispose(), [source, versionId]);

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


  /** Pull tree state from the active adapter only when an overlay changes. */
  const syncSavedOutlines = useCallback(() => {
    setSavedOutlines(manager.current?.getSavedOutlines() ?? []);
    setSavedOverlayStates(manager.current?.getSavedOutlineStates() ?? []);
  }, []);
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
    setSelectedOutlineTypeId('');
    setOutlineName('');
    setOutlineNotice(null);
  }, [stopOutlineEditing]);
  function toggleOutlineTool() {
    if (!outlineAvailable) return;
    const enabled = !outlineEnabledRef.current;
    outlineEnabledRef.current = enabled;
    if (enabled) {
      outlineRequestRevisionRef.current++;
      manager.current?.setSelectionMode('select');
      setOutlineMode('select');
      setOutlineNotice(null);
    } else {
      stopOutlineEditing();
      setOutlineNotice('외곽선 생성 OFF: 비확정 선택·미리보기 및 진행 중 계산이 취소되었습니다. 임시 확정 결과와 JSON 내보내기는 유지됩니다.');
    }
    dispatchApp({ type: 'set-outline-tool', enabled });
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
  function focusSavedOutline(id:string) {
    if(!treeAvailable)return;
    if(!manager.current?.focusSavedOutline(id)){
      setOutlineNotice('해당 외곽선의 WCS 경계를 계산할 수 없어 이동하지 않았습니다.');
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
  function deleteSavedOutline(id:string) {
    if(!outlineEnabledRef.current || !outlineAvailable)return;
    if(manager.current?.deleteSavedOutline(id))syncSavedOutlines();
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
  const choose = useCallback((value: typeof renderer) => {
    if (loading || value === renderer) return;
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
  }, [loading, renderer, resetOutline]);

  function reload() {
    if (loading) return;
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
    const loadingTaskId = beginLoading('도면을 여는 중입니다...');
    const instance = new ViewerManager(
      async () => {
        if (renderer === 'libredwg-web') {
          const { LibreDwgWebAdapter } = await import('@/viewers/libredwg-web/adapter');
          if (!active || !container.current) throw new DOMException('취소됨', 'AbortError');
          return new LibreDwgWebAdapter(container.current);
        }
        if (renderer === 'three-dxf-viewer') {
          const { ThreeDxfViewerAdapter } = await import('@/viewers/three-dxf-viewer/adapter');
          if (!active || !container.current) throw new DOMException('취소됨', 'AbortError');
          return new ThreeDxfViewerAdapter(container.current,{
            versionId,sourceSha256,
            onSelection:value=>{if(active && outlineEnabledRef.current)setOutlineSelection(value);},
            onPreview:(value,error)=>{if(active && outlineEnabledRef.current){setPreview(value);setPreviewError(error??null);}},
            onSaved:count=>{if(active){setSavedCount(count);syncSavedOutlines();}},
          });
        }
        const { DxfViewerAdapter } = await import('@/viewers/dxf-viewer/adapter');
        if (!active || !container.current) throw new DOMException('취소됨', 'AbortError');
        return new DxfViewerAdapter(container.current);
      },
      source,
      { renderer, versionId, report: value => { if (active) setMetric(value); } },
      format,
    );
    manager.current = instance;
    instance.load(`/api/cad-files/${versionId}/content`, format).then(result => {
      if (active) {
        const nextLayers = instance.getLayers();
        setOutlineInfo(instance.getOutlineInfo());
        setState({
          status: result.empty ? '표시할 도형이 없습니다.' : result.warning ? '도면 일부 표시 완료' : '도면 표시 완료',
          ready: !result.empty,
          warning: result.warning,
        });
        setLayers(nextLayers);
        setSelectedLayers(new Set(nextLayers));
      }
    }).catch(error => {
      if (active) {
        setLayers([]);
        setSelectedLayers(new Set());
        resetOutline();
        dispatchApp({ type: 'set-outline-tool', enabled: false });
        setState({
          status: '표시 실패',
          ready: false,
          error: error instanceof Error ? error.message : 'Viewer 초기화에 실패했습니다.',
        });
      }
    }).finally(() => {
      endLoading(loadingTaskId);
      if (loadSequenceRef.current === sequence) setLoading(false);
    });
    return () => {
      active = false;
      endLoading(loadingTaskId);
      instance.dispose();
      manager.current = null;
    };
  }, [versionId, sourceSha256, attempt, renderer, source, format, beginLoading, endLoading, resetOutline, syncSavedOutlines]);

  const layerAvailable = isFullscreen && renderer === 'three-dxf-viewer' && layers.length > 0 && state.ready;
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

  return <div className="space-y-3">
    <ViewerAppShell
      shellRef={viewerShell}
      isFullscreen={isFullscreen}
      isNativeFullscreen={isNativeFullscreen}
      menuBar={
        <ViewerMenuBar
          layerAvailable={layerAvailable}
          layerPanelOpen={appState.layerPanelOpen}
          layerToggleRef={layerMenuButton}
          onToggleLayerPanel={() => dispatchApp({ type: 'toggle-layers' })}
          outlineAvailable={outlineAvailable}
          outlineUnavailableReason={outlineUnavailable}
          outlineToolEnabled={appState.outlineToolEnabled}
          onToggleOutlineTool={toggleOutlineTool}
          outlineTreeOpen={appState.outlineTreeOpen}
          outlineTreeAvailable={treeAvailable}
          outlineTreeUnavailableReason={treeUnavailable}
          outlineTreeToggleRef={outlineTreeMenuButton}
          onToggleOutlineTree={() => dispatchApp({ type: 'toggle-outline-tree' })}
        />
      }
      toolbar={
        <>

      <div data-testid="viewer-toolbar" className="relative z-50 shrink-0 border-b border-slate-700 bg-slate-950 p-2 text-white sm:p-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="min-w-0 flex-1 break-all text-base font-bold line-clamp-2" title={displayName}>{displayName}</h1>
          <span className="shrink-0 text-xs font-semibold">V{version}</span>
          <Link href={`/cad/locations/${locationId}`} className="shrink-0 text-sm text-teal-200 underline">← 버전 목록</Link>
        </div>
        <p className="truncate text-xs text-slate-200" title={originalFilename}>원본: {originalFilename}</p>
        {description && <p aria-label="도면 설명" className="mt-1 max-h-12 overflow-y-auto whitespace-pre-wrap break-all text-xs text-slate-200">{description}</p>}
        <div role="toolbar" aria-label="도면 조작" className="mt-2 flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
          <span className="shrink-0 rounded bg-teal-50 px-2 py-1 text-xs text-teal-800">{renderer}</span>
          {format === 'DXF' && <>
            <Button size="sm" variant={renderer === 'dxf-viewer' ? 'default' : 'outline'}
              aria-pressed={renderer === 'dxf-viewer'} disabled={loading || renderer === 'dxf-viewer'}
              onClick={() => choose('dxf-viewer')}>dxf-viewer</Button>
            <Button size="sm" variant={renderer === 'three-dxf-viewer' ? 'default' : 'outline'}
              aria-pressed={renderer === 'three-dxf-viewer'} disabled={loading || renderer === 'three-dxf-viewer'}
              onClick={() => choose('three-dxf-viewer')}>three-dxf-viewer</Button>
          </>}
          <Button size="sm" variant="outline" disabled={loading || !state.ready} onClick={() => manager.current?.zoomIn()}>{isFullscreen ? '전체 화면 확대' : '확대'}</Button>
          <Button size="sm" variant="outline" disabled={loading || !state.ready} onClick={() => manager.current?.zoomOut()}>{isFullscreen ? '전체 화면 축소' : '축소'}</Button>
          <Button size="sm" variant="outline" disabled={loading || !state.ready} onClick={() => manager.current?.fitToView()}>{isFullscreen ? '전체 화면 맞춤' : '화면 맞춤'}</Button>
          {isFullscreen ? <>
            <Button size="sm" variant="outline" disabled={loading} onClick={toggleNativeFullscreen}>{isNativeFullscreen ? '브라우저 전체 화면 해제' : '브라우저 전체 화면'}</Button>
            <Button size="sm" onClick={exitFullscreen}>전체 화면 종료</Button>
          </> : <Button size="sm" variant="outline" data-viewer-enter-fullscreen="true" onClick={enterFullscreen}>전체 화면</Button>}
          <Button size="sm" variant="outline" disabled={loading} onClick={reload}>다시 불러오기</Button>
          <a href={`/api/cad-files/${versionId}/content`} download className="shrink-0 rounded border border-white/50 px-3 py-1.5 text-xs text-white hover:bg-slate-700">원본 다운로드</a>
          <div className="shrink-0 rounded bg-white p-1 text-slate-900">
            <CopyCadLink key={`${versionId}-${renderer}`} versionId={versionId} format={format} renderer={renderer} />
          </div>
        </div>
        <details className="text-xs text-slate-200">
          <summary className="cursor-pointer">도면 정보 · {locationDescription}</summary>
          <div className="max-h-24 overflow-y-auto py-2">
            <p>등록일: {registeredAt} · 크기: {(fileSize / 1024 / 1024).toFixed(2)} MB</p>
            <p>기본 모드는 브라우저 전체 화면 API가 아닌 뷰포트 전체 사용입니다. &apos;브라우저 전체 화면&apos;은 직접 클릭해야 합니다.</p>
          </div>
        </details>
        {!isFullscreen && renderer === 'three-dxf-viewer' && layers.length > 0 && state.ready && <div className="mt-2 rounded bg-white p-1 text-slate-900">
          <LayerDropdown layers={layers} selected={selectedLayers} onLayerChange={setLayerVisibility} onAllChange={setAllLayersVisibility} />
        </div>}
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
            layerMenuButton.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
      layerPanelOpen={appState.layerPanelOpen}
      outlineTreePanel={treeAvailable ? (
        <OutlineTreePanel
          outlines={savedOutlines}
          overlayStates={savedOverlayStates}
          types={selectableTypes}
          allowDelete={appState.outlineToolEnabled && outlineAvailable}
          onSelect={focusSavedOutline}
          onVisibility={setSavedVisibility}
          onGroupVisibility={setGroupSavedVisibility}
          onDelete={deleteSavedOutline}
          onClose={() => {
            dispatchApp({ type: 'toggle-outline-tree' });
            outlineTreeMenuButton.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
      outlineTreeOpen={treeAvailable && appState.outlineTreeOpen}
      compactPanel={appState.compactPanel}
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
          />
        </>
      }
      tools={
        appState.outlineToolEnabled && outlineAvailable && outlineInfo ? <div
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
      ) : null
      }
      status={
        <>
          <p role="status" className="text-xs text-slate-700">{state.status}</p>
          {state.warning && <p className="text-xs text-amber-800" data-testid="viewer-coverage">{state.warning}</p>}
          {state.error && <p role="alert" className="text-xs text-red-700">{state.error}</p>}
          {outlineNotice && <p data-testid="outline-tool-notice" className="text-xs text-teal-800">{outlineNotice}</p>}
          {outlineUnavailable && <p data-testid="outline-tool-unavailable" className="text-xs text-slate-500">{outlineUnavailable}</p>}
        </>
      }
      nativeLoadingOverlay={isNativeFullscreen && isLoading
        ? <GlobalLoadingOverlay message="도면을 여는 중입니다..." testId="viewer-native-loading-overlay" />
        : null}
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
