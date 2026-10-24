'use client';

import type { ReactNode, RefObject } from 'react';
import type { ViewerCompactPanel } from './viewer-app-state';

/**
 * Single fullscreen subtree. Native fullscreen, CSS immersive and normal view
 * share the same canvas host so docking does not remount the active adapter.
 * Desktop docks occupy space; on narrow screens only one dock is in flow.
 */
export function ViewerAppShell({
  shellRef,
  isFullscreen,
  isNativeFullscreen,
  menuBar,
  toolbar,
  layerPanel,
  outlineTreePanel,
  compactPanel,
  canvas,
  tools,
  status,
  nativeLoadingOverlay,
}: {
  shellRef: RefObject<HTMLDivElement | null>;
  isFullscreen: boolean;
  isNativeFullscreen: boolean;
  menuBar: ReactNode;
  toolbar: ReactNode;
  layerPanel?: ReactNode;
  outlineTreePanel?: ReactNode;
  compactPanel: ViewerCompactPanel;
  canvas: ReactNode;
  tools?: ReactNode;
  status: ReactNode;
  nativeLoadingOverlay?: ReactNode;
}) {
  return (
    <div
      ref={shellRef}
      tabIndex={-1}
      data-testid="cad-viewer-shell"
      data-fullscreen={isFullscreen ? 'true' : 'false'}
      data-native-fullscreen={isNativeFullscreen ? 'true' : 'false'}
      className={isFullscreen
        ? 'fixed inset-0 z-[90] flex h-[100dvh] w-screen flex-col overflow-hidden bg-black'
        : 'relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white'}
    >
      <header className="relative z-50 shrink-0">{menuBar}{toolbar}</header>
      <div
        data-testid="viewer-workspace"
        className={isFullscreen
          ? 'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row'
          : 'relative flex h-[65vh] min-h-96 min-w-0 flex-col overflow-hidden md:flex-row'}
      >
        {layerPanel && (
          <div
            id="viewer-layer-dock"
            data-testid="viewer-layer-dock"
            className={'order-first flex max-h-[20dvh] min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-slate-300 bg-white md:order-none md:h-full md:max-h-none md:w-[min(17rem,28vw)] md:border-r md:border-b-0 ' +
              (compactPanel === 'layers' ? '' : 'hidden md:flex')}
          >
            {layerPanel}
          </div>
        )}
        <section
          aria-label="CAD 작업 캔버스"
          data-testid="viewer-canvas-region"
          className="relative order-2 min-h-0 min-w-0 flex-1 overflow-hidden"
        >
          {canvas}
        </section>
        {outlineTreePanel && (
          <div
            data-testid="viewer-outline-tree-dock"
            className={'order-first flex max-h-[20dvh] min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-slate-300 bg-white md:order-last md:h-full md:max-h-none md:w-[min(17rem,28vw)] md:border-l md:border-b-0 ' +
              (compactPanel === 'outlines' ? '' : 'hidden md:flex')}
          >
            {outlineTreePanel}
          </div>
        )}
      </div>
      {tools && (
        <section
          data-testid="viewer-tools-dock"
          aria-label="도면 선택 및 외곽선 도구"
          className="max-h-[22dvh] shrink-0 overflow-auto border-t border-slate-300 bg-white"
        >
          {tools}
        </section>
      )}
      <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-1 text-slate-700">{status}</footer>
      {nativeLoadingOverlay}
    </div>
  );
}
