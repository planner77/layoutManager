'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useGlobalLoading } from '@/components/global-loading';
import { CopyCadLink } from '@/features/cad-link/copy-cad-link';
import { FullscreenLayerPanel } from '@/features/cad-viewer/fullscreen-layer-panel';
import { LayerDropdown } from '@/features/cad-viewer/layer-dropdown';
import { ViewerManager } from '@/viewers/core/adapter';
import type { ViewerMetric } from '@/viewers/core/metrics';
import { selectRenderer, type ViewerFormat, type ViewerRenderer } from '@/viewers/core/selection';
import { ViewerSource } from '@/viewers/core/source';

export function CadViewer({
  versionId,
  renderer: initialRenderer = 'dxf-viewer',
  format = 'DXF',
}: {
  versionId: string;
  renderer?: ViewerRenderer;
  format?: ViewerFormat;
}) {
  const [renderer, setRenderer] = useState(selectRenderer(format, initialRenderer));
  const [source] = useState(() => new ViewerSource());
  const container = useRef<HTMLDivElement>(null);
  const viewerShell = useRef<HTMLDivElement>(null);
  const manager = useRef<ViewerManager | null>(null);
  const loadSequenceRef = useRef(0);
  const nativeFullscreenRef = useRef(false);
  const fullscreenRequestedRef = useRef(false);
  const { beginLoading, endLoading } = useGlobalLoading();
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [layers, setLayers] = useState<string[]>([]);
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(() => new Set());
  const [metric, setMetric] = useState<ViewerMetric | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [state, setState] = useState<{ status: string; ready: boolean; error?: string; warning?: string }>({
    status: '도면 로딩 중…',
    ready: false,
  });

  useEffect(() => () => source.dispose(), [source, versionId]);

  useEffect(() => {
    const shell = viewerShell.current;
    const handleFullscreenChange = () => {
      const nativeFullscreen = document.fullscreenElement === shell;
      if (nativeFullscreen) {
        nativeFullscreenRef.current = true;
        if (!fullscreenRequestedRef.current) {
          void document.exitFullscreen?.().catch(() => undefined);
          return;
        }
        setIsFullscreen(true);
        return;
      }
      if (nativeFullscreenRef.current) {
        nativeFullscreenRef.current = false;
        fullscreenRequestedRef.current = false;
        setIsFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      fullscreenRequestedRef.current = false;
      if (document.fullscreenElement === shell) void document.exitFullscreen?.().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const shell = viewerShell.current;
      fullscreenRequestedRef.current = false;
      setIsFullscreen(false);
      if (document.fullscreenElement === shell) void document.exitFullscreen?.().catch(() => undefined);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return () => window.cancelAnimationFrame(frame);
  }, [isFullscreen]);

  function choose(value: typeof renderer) {
    if (loading || value === renderer) return;
    setLoading(true);
    setState({ status: '도면 로딩 중…', ready: false });
    setMetric(null);
    setLayers([]);
    setSelectedLayers(new Set());
    setRenderer(value);
    const url = new URL(window.location.href);
    url.searchParams.set('renderer', value);
    window.history.replaceState(null, '', url);
  }

  function reload() {
    if (loading) return;
    setLoading(true);
    source.dispose();
    setMetric(null);
    setLayers([]);
    setSelectedLayers(new Set());
    setState({ status: '도면 로딩 중…', ready: false });
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
    const shell = viewerShell.current;
    if (!shell || loading || !state.ready) return;
    fullscreenRequestedRef.current = true;
    setIsFullscreen(true);
    if (shell.requestFullscreen && document.fullscreenElement !== shell) {
      void shell.requestFullscreen().catch(() => undefined);
    }
  }

  function exitFullscreen() {
    const shell = viewerShell.current;
    fullscreenRequestedRef.current = false;
    setIsFullscreen(false);
    if (document.fullscreenElement === shell) void document.exitFullscreen?.().catch(() => undefined);
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
          return new ThreeDxfViewerAdapter(container.current);
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
  }, [versionId, attempt, renderer, source, format, beginLoading, endLoading]);

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3">
      <span className="mr-auto rounded bg-teal-50 px-3 py-2 text-sm text-teal-800">{renderer}</span>
      {format === 'DXF' && (['dxf-viewer', 'three-dxf-viewer'] as const).map(value =>
        <Button key={value} variant={renderer === value ? 'default' : 'outline'} aria-pressed={renderer === value} disabled={loading || renderer === value} onClick={() => choose(value)}>{value}</Button>,
      )}
      <Button variant="outline" disabled={loading || !state.ready} onClick={() => manager.current?.zoomIn()}>확대</Button>
      <Button variant="outline" disabled={loading || !state.ready} onClick={() => manager.current?.zoomOut()}>축소</Button>
      <Button variant="outline" disabled={loading || !state.ready} onClick={() => manager.current?.fitToView()}>화면 맞춤</Button>
      <Button variant="outline" aria-pressed={isFullscreen} disabled={loading || !state.ready} onClick={enterFullscreen}>전체 화면</Button>
      <Button variant="outline" disabled={loading} onClick={reload}>다시 불러오기</Button>
      <CopyCadLink key={`${versionId}-${renderer}`} versionId={versionId} format={format} renderer={renderer} />
    </div>

    {renderer === 'three-dxf-viewer' && layers.length > 0 && state.ready && <LayerDropdown
      layers={layers}
      selected={selectedLayers}
      onLayerChange={setLayerVisibility}
      onAllChange={setAllLayersVisibility}
    />}

    <div
      ref={viewerShell}
      data-testid="cad-viewer-shell"
      data-fullscreen={isFullscreen ? 'true' : 'false'}
      className={isFullscreen ? 'fixed inset-0 z-[90] flex h-screen w-screen flex-col bg-black p-3' : 'relative'}
    >
      {isFullscreen && renderer === 'three-dxf-viewer' && layers.length > 0 && state.ready && <FullscreenLayerPanel
        layers={layers}
        selected={selectedLayers}
        onLayerChange={setLayerVisibility}
        onAllChange={setAllLayersVisibility}
      />}
      {isFullscreen && <div className="absolute right-4 top-4 z-20 flex flex-wrap gap-2 rounded-lg bg-white/95 p-2 shadow-lg">
        <Button variant="outline" size="sm" onClick={() => manager.current?.zoomIn()}>전체 화면 확대</Button>
        <Button variant="outline" size="sm" onClick={() => manager.current?.zoomOut()}>전체 화면 축소</Button>
        <Button variant="outline" size="sm" onClick={() => manager.current?.fitToView()}>전체 화면 맞춤</Button>
        <Button size="sm" onClick={exitFullscreen}>전체 화면 종료</Button>
      </div>}
      <div
        ref={container}
        data-testid="cad-canvas"
        className={isFullscreen ? 'min-h-0 flex-1 overflow-hidden bg-black' : 'h-[65vh] min-h-96 overflow-hidden rounded-xl bg-black'}
        aria-label={`${format} 도면`}
      />
    </div>

    <p role="status" className="text-sm text-slate-600">{state.status}</p>
    {state.warning && <p className="text-sm text-amber-800" data-testid="viewer-coverage">{state.warning}</p>}
    {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
    {metric && <div className="rounded border border-slate-200 bg-white p-4 text-sm">
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
    <p className="text-xs text-slate-500">마우스 드래그로 이동 · 휠로 확대/축소. {format === 'DWG' ? 'DWG는 현재 20 MiB 이하의 평면 LINE만 직접 표시합니다. TEXT/BLOCK/곡선 등은 지원하지 않습니다.' : '한글 기본 글꼴을 사용합니다.'} 원본 글꼴·문자 인코딩·일부 Entity·선종·치수에 따라 CAD 원본과 다르게 표시될 수 있습니다.</p>
  </div>;
}
