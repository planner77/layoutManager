'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { ViewerCompactPanel } from './viewer-app-state';
import {MovableViewerPanel} from './movable-viewer-panel';

export function ViewerAppShell({ shellRef, panelScopeKey, isFullscreen, isNativeFullscreen, menuBar, toolbar,
  layerPanel, layerPanelOpen, outlineTreePanel, outlineTreeOpen, memoTreePanel, memoTreeOpen, compactPanel,
  canvas, tools, toolsOpen, onClosePanel, status, modalOverlay, nativeLoadingOverlay }: {
  shellRef: RefObject<HTMLDivElement | null>;
  panelScopeKey:string;
  isFullscreen: boolean; isNativeFullscreen: boolean;
  menuBar: ReactNode; toolbar: ReactNode;
  layerPanel?: ReactNode; layerPanelOpen: boolean;
  outlineTreePanel?: ReactNode; outlineTreeOpen: boolean;
  memoTreePanel?: ReactNode; memoTreeOpen: boolean;
  compactPanel: ViewerCompactPanel;
  canvas: ReactNode; tools?: ReactNode; toolsOpen: boolean;
  onClosePanel: (panel: Exclude<ViewerCompactPanel, null>) => void;
  status: ReactNode; modalOverlay?: ReactNode; nativeLoadingOverlay?: ReactNode;
}) {
  const [mobile, setMobile] = useState(false);
  const [topDrawer,setTopDrawer]=useState<ViewerCompactPanel>(null);
  const workspaceRef=useRef<HTMLDivElement>(null);
  const modalOpen=!!modalOverlay;
  const active = mobile ? (compactPanel==='layers' && layerPanelOpen && layerPanel ? 'layers' :
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
  const drawer = (name: Exclude<ViewerCompactPanel,null>, open:boolean, content:ReactNode, id:string) =>
    open && content && (!mobile || active===name) ? <div key={name} id={id} ref={active===name?dialog:undefined}
      role={mobile ? 'dialog' : 'region'} aria-modal={mobile && active===name && !modalOpen ? true : undefined}
      aria-label={name==='layers'?'레이어':name==='outlines'?'외곽선 목록':name==='memos'?'메모 트리':'선택 및 외곽선 도구'}
      data-testid={id} data-drawer={name} data-canvas-edit-escape-layer={mobile && active===name ? 'drawer' : undefined}
      onKeyDown={trapTab} onPointerDownCapture={()=>setTopDrawer(name)} onFocusCapture={()=>setTopDrawer(name)}
      style={{zIndex:topDrawer===name?36:30}}
      className={`viewer-drawer viewer-drawer-${name} ${mobile && active!==name?'viewer-drawer-hidden':''}`}>
      {name==='tools' && <button type="button" className="sticky top-0 z-10 float-right rounded bg-white px-2 py-1 text-sm text-slate-800" onClick={()=>onClosePanel('tools')}>도구 닫기</button>}
      {content}
    </div> : null;
  return <div ref={shellRef} tabIndex={-1} data-testid="cad-viewer-shell"
    data-fullscreen={isFullscreen ? 'true' : 'false'} data-native-fullscreen={isNativeFullscreen ? 'true' : 'false'}
    className={isFullscreen ? 'fixed inset-0 z-[90] flex h-[100dvh] w-screen flex-col overflow-hidden bg-black' : 'relative flex flex-col rounded-xl border border-slate-200 bg-white'}>
    <header ref={headerRef} className={isFullscreen?"relative z-50 shrink-0":"sticky top-0 z-50 shrink-0"}>{menuBar}{toolbar}</header>
    <div ref={workspaceRef} data-testid="viewer-workspace" className={isFullscreen ? 'relative min-h-0 flex-1 overflow-hidden' : 'relative h-[65vh] min-h-96 overflow-hidden'}>
      <section ref={canvasRef} aria-label="CAD 작업 캔버스" data-testid="viewer-canvas-region" className="absolute inset-0 z-0 overflow-hidden">{canvas}</section>
      {mobile && active && <button type="button" className="viewer-drawer-backdrop" aria-label="패널 닫기" onClick={()=>onClosePanel(active)} />}
      {drawer('layers',layerPanelOpen,layerPanel,'viewer-layer-dock')}
      {drawer('outlines',outlineTreeOpen,outlineTreePanel,'viewer-outline-tree-dock')}
      <MovableViewerPanel key={panelScopeKey} id="viewer-memo-tree-dock" name="메모 트리"
        workspaceRef={workspaceRef} dialogRef={dialog} open={memoTreeOpen&&!!memoTreePanel}
        mobile={mobile} active={!mobile||active==='memos'} raised={topDrawer==='memos'}
        onRaise={()=>setTopDrawer('memos')} onClose={()=>onClosePanel('memos')} onKeyDown={trapTab}>
        {memoTreePanel}
      </MovableViewerPanel>
      {drawer('tools',toolsOpen,tools,'viewer-tools-dock')}
    </div>
    <footer ref={footerRef} className="relative z-20 shrink-0 border-t border-slate-200 bg-white px-3 py-1 text-slate-700">{status}</footer>
    {modalOverlay}
    {nativeLoadingOverlay}
  </div>;
}
