'use client';

import {useEffect,useRef,useState,type KeyboardEvent,type PointerEvent,type ReactNode,type RefObject} from 'react';
import {clampViewerPanelPosition,EDGE_PANEL_POSITION,type ViewerPanelPosition} from '@/domain/viewer-panel-position';

type Drag={
 pointerId:number;startClientX:number;startClientY:number;startX:number;startY:number;
 original:ViewerPanelPosition;moved:boolean;
};
export type ViewerMovableKind='layers'|'outlines'|'memos'|'tools'|'search';
type Props={
 kind?:ViewerMovableKind;
 id:string;name:string;open:boolean;mobile:boolean;active:boolean;raised:boolean;
 workspaceRef:RefObject<HTMLDivElement|null>;dialogRef?:RefObject<HTMLDivElement|null>;
 children:ReactNode;onRaise:()=>void;onClose:()=>void;
 onKeyDown?:(event:KeyboardEvent<HTMLDivElement>)=>void;
};
/** Reusable Viewer auxiliary panel: one DOM mount, docked by default, floating after drag.
 * Keep component mounted while closed, so same Viewer session retains its position.
 * Use a version/renderer key at the call site to reset on a new Viewer identity.
 */
export function MovableViewerPanel({kind='memos',id,name,open,mobile,active,raised,workspaceRef,dialogRef,
 children,onRaise,onClose,onKeyDown}:Props){
 const testPrefix=kind==='memos'?'viewer-memo-panel':`viewer-${kind}-panel`;
 const panelRef=useRef<HTMLDivElement|null>(null);
 const dragRef=useRef<Drag|null>(null);
 const [placement,setPlacement]=useState<ViewerPanelPosition>(EDGE_PANEL_POSITION);
 const [dragging,setDragging]=useState(false);
 const measure=()=>{
  const workspace=workspaceRef.current,panel=panelRef.current;
  if(!workspace||!panel)return null;
  const w=workspace.getBoundingClientRect(),p=panel.getBoundingClientRect();
  return {x:p.left-w.left,y:p.top-w.top,
   workspace:{width:w.width,height:w.height},panel:{width:p.width,height:p.height}};
 };
 const cancel=()=>{
  const current=dragRef.current;
  if(!current)return;
  dragRef.current=null;
  setDragging(false);
  setPlacement(current.original);
 };
 const reset=()=>{
  cancel();
  setPlacement(EDGE_PANEL_POSITION);
 };
 const onHandleDown=(event:PointerEvent<HTMLButtonElement>)=>{
  if(mobile||event.button!==0||(event.pointerType==='touch'&&!event.isPrimary))return;
  const m=measure();
  if(!m)return;
  onRaise();
  dragRef.current={pointerId:event.pointerId,startClientX:event.clientX,startClientY:event.clientY,
   startX:m.x,startY:m.y,original:placement,moved:false};
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.focus({preventScroll:true});
  event.currentTarget.setPointerCapture(event.pointerId);
  setDragging(true);
 };
 const onHandleMove=(event:PointerEvent<HTMLButtonElement>)=>{
  const drag=dragRef.current;
  if(!drag||drag.pointerId!==event.pointerId)return;
  event.stopPropagation();event.preventDefault();
  const dx=event.clientX-drag.startClientX,dy=event.clientY-drag.startClientY;
  if(!drag.moved&&Math.hypot(dx,dy)<5)return;
  drag.moved=true;
  const m=measure();
  if(!m)return;
  const next=clampViewerPanelPosition(drag.startX+dx,drag.startY+dy,m.workspace,m.panel);
  setPlacement({mode:'floating',...next});
 };
 const onHandleUp=(event:PointerEvent<HTMLButtonElement>)=>{
  const drag=dragRef.current;
  if(!drag||drag.pointerId!==event.pointerId)return;
  dragRef.current=null;setDragging(false);
  if(event.currentTarget.hasPointerCapture(event.pointerId))
   event.currentTarget.releasePointerCapture(event.pointerId);
  event.stopPropagation();
 };
 const moveKeyboard=(dx:number,dy:number)=>{
  const m=measure();
  if(!m)return;
  const next=clampViewerPanelPosition(m.x+dx,m.y+dy,m.workspace,m.panel);
  setPlacement({mode:'floating',...next});
  onRaise();
 };
 const onHandleKey=(event:KeyboardEvent<HTMLButtonElement>)=>{
  if(event.key==='Escape'&&dragRef.current){
   event.preventDefault();event.stopPropagation();cancel();return;
  }
  if(mobile)return;
  const step=event.shiftKey?32:8;
  const offsets:Record<string,[number,number]>={
   ArrowUp:[0,-step],ArrowDown:[0,step],ArrowLeft:[-step,0],ArrowRight:[step,0]
  };
  const offset=offsets[event.key];
  if(offset){event.preventDefault();event.stopPropagation();moveKeyboard(...offset);}
 };
 useEffect(()=>{
  if(!dragging)return;
  const cancelOnBlur=()=>cancel();
  window.addEventListener('blur',cancelOnBlur);
  return ()=>window.removeEventListener('blur',cancelOnBlur);
 // Only the active pointer gesture owns cancel-on-blur.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[dragging]);
 useEffect(()=>{
  if(!open||mobile)return;
  const workspace=workspaceRef.current,panel=panelRef.current;
  if(!workspace||!panel)return;
  const clamp=()=>{
   const w=workspace.getBoundingClientRect(),p=panel.getBoundingClientRect();
   setPlacement(old=>{
    if(old.mode!=='floating')return old;
    const next=clampViewerPanelPosition(old.x,old.y,
      {width:w.width,height:w.height},{width:p.width,height:p.height});
    return next.x===old.x&&next.y===old.y?old:{...old,...next};
   });
  };
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(clamp);
  observer?.observe(workspace);observer?.observe(panel);
  window.addEventListener('resize',clamp);
  return ()=>{observer?.disconnect();window.removeEventListener('resize',clamp);};
 },[open,mobile,workspaceRef]);
 if(!open||(mobile&&!active)||children==null)return null;
 const floating=placement.mode==='floating'&&!mobile;
 return <div
  ref={node=>{
   panelRef.current=node;
   if(mobile&&active&&dialogRef)dialogRef.current=node;
  }}
  id={id} role={mobile?'dialog':'region'}
  aria-modal={mobile?true:undefined}
  aria-label={name}
  data-testid={id} data-drawer={kind}
  data-viewer-panel-mode={floating?'floating':'edge'}
  data-viewer-panel-dragging={dragging?'true':'false'}
  data-canvas-edit-escape-layer={mobile?'drawer':undefined}
  onKeyDown={onKeyDown}
  onPointerDownCapture={onRaise}
  onFocusCapture={onRaise}
  className={`viewer-drawer viewer-drawer-${kind} pointer-events-auto`}
  style={floating?{left:placement.x,top:placement.y,right:'auto',bottom:'auto',
    transform:'none',zIndex:raised?36:30}:{zIndex:raised?36:30}}>
  {!mobile&&<div data-testid={testPrefix+'-toolbar'}
   className="flex shrink-0 items-center gap-1 border-b border-slate-300 bg-slate-50 px-2 py-1">
   <button type="button" data-testid={testPrefix+'-drag-handle'}
    aria-label={name+' 창 이동 (방향키 또는 드래그)'}
    aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
    onPointerDown={onHandleDown} onPointerMove={onHandleMove}
    onPointerUp={onHandleUp} onPointerCancel={cancel}
    onLostPointerCapture={cancel} onKeyDown={onHandleKey}
    className="viewer-drawer-grab min-w-0 flex-1 rounded border border-slate-400 px-2 py-1 text-left text-xs font-semibold">
    이동 ↕
   </button>
   <button type="button" data-testid={testPrefix+'-reset'} onClick={reset}
    className="shrink-0 rounded border border-slate-400 px-2 py-1 text-xs">위치 초기화</button>
   <button type="button" data-testid={testPrefix+'-close'} onClick={onClose}
    className="shrink-0 rounded border border-slate-400 px-2 py-1 text-xs">창 닫기</button>
  </div>}
  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
 </div>;
}
