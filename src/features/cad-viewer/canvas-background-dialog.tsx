'use client';
import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import {DEFAULT_CANVAS_BACKGROUND,normalizeCanvasBackground} from './canvas-background';

const palette=['#000000','#ffffff','#262626','#404040','#747474','#102a43','#173e35','#593d31'];
export function CanvasBackgroundDialog({color,saved,onSelect,onClose}:{color:string;saved:boolean;onSelect:(value:string)=>boolean;onClose:()=>void}){
  const [draft,setDraft]=useState<string|null>(null);
  const [error,setError]=useState('');
  const dialog=useRef<HTMLElement>(null),first=useRef<HTMLInputElement>(null);
  useEffect(()=>{const previous=document.activeElement;first.current?.focus({preventScroll:true});return()=>{
    const target=document.querySelector<HTMLElement>('[data-viewer-group="view"]')??
      (previous instanceof HTMLElement&&previous.isConnected?previous:document.querySelector<HTMLElement>('[data-testid="cad-viewer-shell"]'));
    requestAnimationFrame(()=>target?.focus({preventScroll:true}));
  };},[]);
  function choose(value:string){
    if(!onSelect(value))return;
    setDraft(null);setError('');
  }
  function changeDraft(value:string){
    if(normalizeCanvasBackground(value)){setDraft(null);onSelect(value);setError('');}
    else {setDraft(value);setError('HEX 색상은 # 뒤에 6자리 숫자 또는 a–f로 입력하세요. 마지막 유효색을 유지합니다.');}
  }
  function keyDown(event:KeyboardEvent<HTMLElement>){
    if(event.key!=='Tab')return;
    const items=[...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])')??[])];
    const firstItem=items[0],lastItem=items[items.length-1];
    if(event.shiftKey&&document.activeElement===firstItem){event.preventDefault();lastItem.focus();}
    else if(!event.shiftKey&&document.activeElement===lastItem){event.preventDefault();firstItem.focus();}
  }
  return <div data-testid="canvas-background-backdrop" data-canvas-edit-escape-layer="dialog"
    className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-3"
    onPointerDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="canvas-background-title" onKeyDown={keyDown}
      data-testid="canvas-background-dialog"
      className="max-h-[90dvh] w-full max-w-sm overflow-auto rounded-lg border border-slate-300 bg-white p-4 text-slate-900 shadow-xl">
      <h2 id="canvas-background-title" className="font-semibold">Canvas 배경색 설정</h2>
      <p className="mt-1 text-xs text-slate-600">모든 도면에 적용되는 이 브라우저의 표시 설정입니다.</p>
      <p className="mt-1 text-xs text-slate-600">선과 배경색이 비슷하면 선이 잘 보이지 않을 수 있습니다. 어두운 배경색으로 바꿔 보세요.</p>
      <label className="mt-4 flex items-center justify-between gap-3 text-sm">색상 선택
        <input ref={first} aria-label="Canvas 배경색 선택" type="color" value={color} onChange={event=>choose(event.target.value)}
          className="h-11 w-16 cursor-pointer rounded border" /></label>
      <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label="배경색 팔레트">
        {palette.map((value,index)=><button key={value} type="button" aria-label={`팔레트 ${index+1} ${value}`}
          aria-pressed={color===value} onClick={()=>choose(value)}
          className="min-h-11 rounded border-2 px-1 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
          style={{backgroundColor:value,color:index===1||index===4?'#111827':'#ffffff',borderColor:color===value?'#0d9488':'#94a3b8'}}>{color===value?'선택됨':' '}</button>)}
      </div>
      <label className="mt-4 block text-sm">HEX 색상
        <input aria-label="HEX 색상" value={draft??color} onChange={event=>changeDraft(event.target.value)} spellCheck={false}
          maxLength={7} className="mt-1 min-h-11 w-full rounded border border-slate-400 px-3 font-mono uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600" /></label>
      <p className="mt-2 text-xs">현재 색상: <output className="font-mono">{color}</output></p>
      {error&&<p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      {!saved&&<p role="alert" className="mt-2 text-xs text-amber-800">현재 색상은 적용됐지만 이 브라우저에 저장하지 못했습니다.</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={()=>choose(DEFAULT_CANVAS_BACKGROUND)} className="min-h-11 rounded border px-3 text-sm">기본 검정 복원</button>
        <button type="button" onClick={onClose} className="min-h-11 rounded bg-teal-700 px-3 text-sm text-white">닫기</button>
      </div>
    </section>
  </div>;
}
