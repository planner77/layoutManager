'use client';

import {useState} from 'react';
import type {MemoDraft} from '@/domain/cad-memo';
import {dateOnly,type MemoSettingsInput} from '@/domain/memo-schedule';

export function CadMemoSettingsEditor({memo,busy,enabled,onSave}:{
 memo:MemoDraft;busy:boolean;enabled:boolean;onSave:(value:MemoSettingsInput)=>void;
}){
 const [settings,setSettings]=useState<MemoSettingsInput>({
  scheduleEnabled:memo.scheduleEnabled??false,startDate:memo.startDate??null,dueDate:memo.dueDate??null,
  completionEnabled:memo.completionEnabled??false,isCompleted:memo.isCompleted??false
 });
 const [error,setError]=useState<string|null>(null);
 const save=()=>{
  try{
   const start=dateOnly(settings.startDate),due=dateOnly(settings.dueDate);
   if(start&&due&&start>due)throw new Error('시작일은 마감일보다 늦을 수 없습니다.');
   if(!settings.scheduleEnabled&&(start||due))throw new Error('일정을 사용하지 않으면 날짜를 비워야 합니다.');
   setError(null);onSave({...settings,startDate:start,dueDate:due});
  }catch(error){setError(error instanceof Error?error.message:'일정 입력값이 올바르지 않습니다.');}
 };
 return <section data-testid="cad-memo-settings" aria-label="메모 일정과 완료"
  className="mt-2 border-t border-slate-300 bg-white p-2 text-xs">
  <div className="flex flex-wrap items-center gap-3">
   <strong>일정·완료 관리</strong>
   <label className="flex items-center gap-1">
    <input type="checkbox" data-testid="cad-memo-schedule-enabled" checked={settings.scheduleEnabled}
     onChange={event=>{
      if(!event.target.checked&&(settings.startDate||settings.dueDate)&&
       !window.confirm('일정 사용을 해제하면 시작일과 마감일이 삭제됩니다. 계속할까요?'))return;
      setSettings(old=>({...old,scheduleEnabled:event.target.checked,
       ...(event.target.checked?{}:{startDate:null,dueDate:null})}));
     }}/> 일정 사용
   </label>
   {settings.scheduleEnabled&&<>
    <label>시작일 (선택)
     <input data-testid="cad-memo-start-date" type="date" value={settings.startDate??''}
      onChange={e=>setSettings(old=>({...old,startDate:e.target.value||null}))}/>
    </label>
    <label>마감일 (선택)
     <input data-testid="cad-memo-due-date" type="date" value={settings.dueDate??''}
      onChange={e=>setSettings(old=>({...old,dueDate:e.target.value||null}))}/>
    </label>
   </>}
   <label className="flex items-center gap-1">
    <input data-testid="cad-memo-completion-enabled" type="checkbox" checked={settings.completionEnabled}
     onChange={event=>{
      if(!event.target.checked&&settings.isCompleted&&
       !window.confirm('완료 관리 해제 시 완료 상태와 완료 시각이 삭제됩니다. 계속할까요?'))return;
      setSettings(old=>({...old,completionEnabled:event.target.checked,
       isCompleted:event.target.checked?old.isCompleted:false}));
     }}/> 완료 관리
   </label>
   {settings.completionEnabled&&<label className="flex items-center gap-1">
    <input data-testid="cad-memo-is-completed" type="checkbox" checked={settings.isCompleted}
     onChange={e=>setSettings(old=>({...old,isCompleted:e.target.checked}))}/> 완료
   </label>}
   <button type="button" data-testid="cad-memo-save-settings" disabled={!enabled||busy}
    onClick={save} className="rounded bg-teal-700 px-2 py-1 text-white disabled:opacity-40">일정·완료 저장</button>
  </div>
  <p className="mt-1 text-slate-600">
   완료일시는 서버가 저장 시 UTC로 기록합니다. 체크 해제 시 완료일시는 삭제됩니다.
   {memo.completedAt?' · 저장된 완료: '+memo.completedAt:''}
  </p>
  {!enabled&&<p data-testid="cad-memo-feature-unavailable" className="text-amber-900">
    이 설치의 메모 확장 기능은 비활성입니다. 신규 Greenfield 설치에서만 서버 저장할 수 있습니다.</p>}
  {error&&<p role="alert" className="text-red-700">{error}</p>}
 </section>;
}
