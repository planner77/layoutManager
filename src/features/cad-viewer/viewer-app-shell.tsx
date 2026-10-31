'use client';

import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from 'react';
import type { ViewerCompactPanel } from './viewer-app-state';
import {MovableViewerPanel} from './movable-viewer-panel';
import {CadTextSearch} from './cad-text-search';

// Data-only props: render CadTextSearch through React JSX, never invoke a render
// callback with refs while ViewerAppShell is rendering (react-hooks/refs).
type TextSearchProps=Omit<ComponentProps<typeof CadTextSearch>,
  'workspaceRef'|'dialogRef'|'mobile'|'active'|'raised'|'onRaise'|'onKeyDown'|'modalBlocked'>;

export function ViewerAppShell({ shellRef, panelScopeKey, isFullscreen, isNativeFullscreen, menuBar, toolbar,
  layerPanel, layerPanelOpen, outlineTreePanel, outlineTreeOpen, memoTreePanel, memoTreeOpen, compactPanel,
  canvas, tools, toolsOpen, toolsTitle = '선택 및 외곽선 도구', textSearch, textSearchOpen, onCloseTextSearch, onClosePanel, status, modalOverlay, nativeLoadingOverlay }: {
  shellRef: RefObject<HTMLDivElement | null>;
  panelScopeKey:string;
  isFullscreen: boolean; isNativeFullscreen: boolean;
  menuBar: ReactNode; toolbar: ReactNode;
  layerPanel?: ReactNode; layerPanelOpen: boolean;
  outlineTreePanel?: ReactNode; outlineTreeOpen: boolean;
  memoTreePanel?: ReactNode; memoTreeOpen: boolean;
  compactPanel: ViewerCompactPanel;
  canvas: ReactNode; tools?: ReactNode; toolsOpen: boolean; toolsTitle?: string;
  textSearch?: TextSearchProps; textSearchOpen:boolean; onCloseTextSearch:()=>void;
  onClosePanel: (panel: Exclude<ViewerCompactPanel, null>) => void;
  status: ReactNode; modalOverlay?: ReactNode; nativeLoadingOverlay?: ReactNode;
}) {
  const [mobile, setMobile] = useState(false);
  const [topDrawer,setTopDrawer]=useState<ViewerCompactPanel|'search'>(null);
  const raiseSearch=useCallback(()=>setTopDrawer('search'),[]);
  const workspaceRef=useRef<HTMLDivElement>(null);
  const modalOpen=!!modalOverlay;
  const active = mobile ? (textSearchOpen ? 'search' :
    compactPanel==='layers' && layerPanelOpen && layerPanel ? 'layers' :
    compactPanel==='outlines' && outlineTreeOpen && outlineTreePanel ? 'outlines' :
    compactPanel==='memos' && memoTreeOpen && memoTreePanel ? 'memos' :
    compactPanel==='tools' && toolsOpen && tools ? 'tools' : null) : null;
  const dialog = useRef<HTMLDivElement>(null);
  const headerRef=useRef<HTMLElement>(null);
  const footerRef=useRef<HTMLElement>(null);
  const canvasRef=useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const header=headerRef.current,footer=footerRef.current,canvasRegion=canvasRef.current;
    const shell=shellRef.current;
    const external=active ? [!isFullscreen ? document.querySelector<HTMLElement>('[data-app-header]') : null,
      ...Array.from(shell?.parentElement?.children??[]).filter(node=>node!==shell).map(node=>node as HTMLElement)] : [];
    const previous=external.filter((node):node is HTMLElement=>!!node).map(node=>({node,inert:node.inert}));
    if(header)header.inert=!!active;
    if(footer)footer.inert=!!active;
    if(canvasRegion)canvasRegion.inert=!!active;
    for(const item of previous)item.node.inert=true;
    return ()=>{if(header)header.inert=false;if(footer)footer.inert=false;if(canvasRegion)canvasRegion.inert=false;for(const item of previous)item.node.inert=item.inert;};
  },[active,isFullscreen,shellRef]);
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => dialog.current?.querySelector<HTMLElement>('button:not([disabled]),a[href],[tabindex="0"]')?.focus({preventScroll:true}));
    return () => cancelAnimationFrame(frame);
  }, [active]);
  useEffect(()=>{
    if(!modalOpen)return;
    const drawers=[...(shellRef.current?.querySelectorAll<HTMLElement>('[data-drawer]')??[])];
    const previous=drawers.map(node=>({node,inert:node.inert}));
    for(const item of previous)item.node.inert=true;
    return ()=>{for(const item of previous)item.node.inert=item.inert;};
  },[modalOpen,shellRef,active]);
  const trapTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (modalOpen || !mobile || event.key !== 'Tab') return;
    const items = [...(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex="0"]'))].filter(item=>item.getClientRects().length>0 && !item.closest('[inert]'));
    if (!items.length) { event.preventDefault(); return; }
    const first=items[0],last=items[items.length-1];
    if (event.shiftKey && document.activeElement===first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first.focus(); }
  };
  return <div ref={shellRef} tabIndex={-1} data-testid="cad-viewer-shell"
    data-fullscreen={isFullscreen ? 'true' : 'false'} data-native-fullscreen={isNativeFullscreen ? 'true' : 'false'}
    className={isFullscreen ? 'fixed inset-0 z-[90] flex h-[100dvh] w-screen flex-col overflow-hidden bg-black' : 'relative flex flex-col rounded-xl border border-slate-200 bg-white'}>
    <header ref={headerRef} className={isFullscreen?"relative z-50 shrink-0":"sticky top-0 z-50 shrink-0"}>{menuBar}{toolbar}</header>
    <div ref={workspaceRef} data-testid="viewer-workspace" className={isFullscreen ? 'relative min-h-0 flex-1 overflow-hidden' : 'relative h-[65vh] min-h-96 overflow-hidden'}>
      <section ref={canvasRef} aria-label="CAD 작업 캔버스" data-testid="viewer-canvas-region" className="absolute inset-0 z-0 overflow-hidden">{canvas}</section>
      {mobile && active && <button type="button" className="viewer-drawer-backdrop" aria-label="패널 닫기"
        onClick={()=>active==='search'?onCloseTextSearch():onClosePanel(active)} />}
      <MovableViewerPanel key={panelScopeKey+':layers'} kind="layers" id="viewer-layer-dock" name="레이어"
        workspaceRef={workspaceRef} dialogRef={dialog} open={layerPanelOpen&&!!layerPanel}
        mobile={mobile} modalBlocked={modalOpen} active={!mobile||active==='layers'} raised={topDrawer==='layers'}
        onRaise={()=>setTopDrawer('layers')} onClose={()=>onClosePanel('layers')} onKeyDown={trapTab}>
        {layerPanel}
      </MovableViewerPanel>
      <MovableViewerPanel key={panelScopeKey+':outlines'} kind="outlines" id="viewer-outline-tree-dock" name="외곽선 목록"
        workspaceRef={workspaceRef} dialogRef={dialog} open={outlineTreeOpen&&!!outlineTreePanel}
        mobile={mobile} modalBlocked={modalOpen} active={!mobile||active==='outlines'} raised={topDrawer==='outlines'}
        onRaise={()=>setTopDrawer('outlines')} onClose={()=>onClosePanel('outlines')} onKeyDown={trapTab}>
        {outlineTreePanel}
      </MovableViewerPanel>
      <MovableViewerPanel key={panelScopeKey} id="viewer-memo-tree-dock" name="메모 트리"
        workspaceRef={workspaceRef} dialogRef={dialog} open={memoTreeOpen&&!!memoTreePanel}
        mobile={mobile} modalBlocked={modalOpen} active={!mobile||active==='memos'} raised={topDrawer==='memos'}
        onRaise={()=>setTopDrawer('memos')} onClose={()=>onClosePanel('memos')} onKeyDown={trapTab}>
        {memoTreePanel}
      </MovableViewerPanel>
      <MovableViewerPanel key={panelScopeKey+':tools'} kind="tools" id="viewer-tools-dock" name={toolsTitle}
        workspaceRef={workspaceRef} dialogRef={dialog} open={toolsOpen&&!!tools}
        mobile={mobile} modalBlocked={modalOpen} active={!mobile||active==='tools'} raised={topDrawer==='tools'}
        onRaise={()=>setTopDrawer('tools')} onClose={()=>onClosePanel('tools')} onKeyDown={trapTab}>
        {tools && <>
          <button type="button" className="z-10 shrink-0 self-end rounded bg-white px-2 py-1 text-sm text-slate-800"
            onClick={()=>onClosePanel('tools')}>도구 닫기</button>
          <div data-testid="viewer-tools-scroll-viewport"
            className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain">
            {tools}
          </div>
        </>}
      </MovableViewerPanel>
      {textSearch && <CadTextSearch key={panelScopeKey+':search'} {...textSearch}
        workspaceRef={workspaceRef} dialogRef={dialog}
        mobile={mobile} modalBlocked={modalOpen} active={!mobile||active==='search'} raised={topDrawer==='search'}
        onRaise={raiseSearch} onKeyDown={trapTab} />}
    </div>
    <footer ref={footerRef} className="relative z-20 shrink-0 border-t border-slate-200 bg-white px-3 py-1 text-slate-700">{status}</footer>
    {modalOverlay}
    {nativeLoadingOverlay}
  </div>;
}
