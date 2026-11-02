'use client';

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import type {CanvasObjectRef} from '@/domain/canvas-object-selection';
import type {SceneWorkCommand,SceneWorkState} from '@/domain/scene-work';
import {parseWcsTranslation} from '@/domain/generated-translate';

/** Existing Tools Drawer content: work deltas never become Scene Asset bytes. */
export function SceneWorkTools({state,selection,enabled,error,onCommand,onUndo,onRedo}:{
  state:SceneWorkState;selection:readonly CanvasObjectRef[];enabled:boolean;error:string|null;
  onCommand:(command:SceneWorkCommand)=>void;onUndo:()=>void;onRedo:()=>void;
}) {
  const [dx,setDx]=useState('0'),[dy,setDy]=useState('0');
  const [angle,setAngle]=useState('0'),[px,setPx]=useState('0'),[py,setPy]=useState('0');
  const [inputError,setInputError]=useState<string|null>(null);
  const ids=selection.map(ref=>ref.id);
  const canChange=enabled&&selection.length>0&&selection.every(ref=>ref.origin==='RENDER');
  const hidden=state.objects.filter(object=>!object.visible).map(object=>object.ref.id);
  const number=(value:string)=>{
    if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))
      throw new Error('유효한 WCS 수치를 입력하세요.');
    const n=Number(value);if(!Number.isFinite(n)||Math.abs(n)>1e12)throw new Error('WCS 수치 범위를 벗어났습니다.');
    return n;
  };
  const submit=(build:()=>SceneWorkCommand)=>{
    try{const command=build();setInputError(null);onCommand(command);}
    catch(e){setInputError(e instanceof Error?e.message:'유효한 수치를 입력하세요.');}
  };
  const inputClass='w-20 rounded border border-slate-400 bg-white px-1.5 py-1 text-slate-900';
  return <fieldset data-testid="scene-work-tools" className="w-full space-y-2 rounded border border-slate-300 bg-white p-2">
    <legend className="px-1 font-medium">DXF_IMPORTED · 세션 작업 차분</legend>
    <p>렌더 객체만 선택하면 이동·회전·숨김을 적용합니다. 혼합 선택은 전체 거절하며 삭제는 지원하지 않습니다. Reload/Renderer/Version 변경 시 차분이 사라집니다.</p>
    <form className="flex flex-wrap items-center gap-2" onSubmit={e=>{e.preventDefault();submit(()=>({type:'Translate',ids,...parseWcsTranslation(dx,dy)}));}}>
      <label htmlFor="scene-work-dx">ΔX</label><input id="scene-work-dx" className={inputClass} value={dx} onChange={e=>setDx(e.target.value)} disabled={!canChange} inputMode="decimal" />
      <label htmlFor="scene-work-dy">ΔY</label><input id="scene-work-dy" className={inputClass} value={dy} onChange={e=>setDy(e.target.value)} disabled={!canChange} inputMode="decimal" />
      <Button type="submit" size="sm" data-testid="scene-work-translate" disabled={!canChange}>렌더 이동 적용</Button>
    </form>
    <form className="flex flex-wrap items-center gap-2" onSubmit={e=>{e.preventDefault();submit(()=>({type:'Rotate',ids,angleDegrees:number(angle),pivot:[number(px),number(py)]}));}}>
      <label htmlFor="scene-work-angle">회전 각도 °</label><input id="scene-work-angle" className={inputClass} value={angle} onChange={e=>setAngle(e.target.value)} disabled={!canChange} inputMode="decimal" />
      <label htmlFor="scene-work-px">중심 X</label><input id="scene-work-px" className={inputClass} value={px} onChange={e=>setPx(e.target.value)} disabled={!canChange} inputMode="decimal" />
      <label htmlFor="scene-work-py">중심 Y</label><input id="scene-work-py" className={inputClass} value={py} onChange={e=>setPy(e.target.value)} disabled={!canChange} inputMode="decimal" />
      <Button type="submit" size="sm" data-testid="scene-work-rotate" disabled={!canChange}>렌더 회전 적용</Button>
    </form>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" data-testid="scene-work-hide" disabled={!canChange} onClick={()=>onCommand({type:'Visibility',ids,visible:false})}>선택 렌더 숨김</Button>
      <Button size="sm" variant="outline" data-testid="scene-work-show" disabled={!enabled||!hidden.length} onClick={()=>onCommand({type:'Visibility',ids:hidden,visible:true})}>숨긴 렌더 복원 ({hidden.length})</Button>
      <Button size="sm" variant="outline" data-testid="scene-work-undo" disabled={!enabled||!state.undo} onClick={onUndo}>렌더 작업 취소 ({state.undo})</Button>
      <Button size="sm" variant="outline" data-testid="scene-work-redo" disabled={!enabled||!state.redo} onClick={onRedo}>렌더 작업 다시 실행 ({state.redo})</Button>
    </div>
    {(inputError||error)&&<p role="alert" className="text-red-700">{inputError||error}</p>}
  </fieldset>;
}
