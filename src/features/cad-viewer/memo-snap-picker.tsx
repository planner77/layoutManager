'use client';
import type {MemoSnapIntent} from '@/domain/memo-snap-intent';

export function MemoSnapPicker({intent,busy,onChoose,onRefresh}:{
  intent:MemoSnapIntent|null;busy:boolean;onChoose:(key:string|null)=>void;onRefresh:()=>void;
}){
  return <fieldset data-testid="cad-memo-snap-picker" className="mt-2 min-w-0 rounded border border-teal-400 bg-white p-2">
    <legend className="px-1 font-semibold">가까운 객체 스냅 · 12px</legend>
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-0 flex-1 flex-col gap-1">스냅 후보
        <select data-testid="cad-memo-snap-select" aria-label="메모 스냅 후보"
          className="min-h-11 w-full min-w-0 rounded border border-slate-400 bg-white px-2"
          disabled={busy||!intent} value={intent?.selected?.key??''}
          onChange={event=>onChoose(event.target.value||null)}>
          <option value="">스냅 안 함 · 입력한 WCS 사용</option>
          {intent?.choices.candidates.map((choice,index)=><option key={choice.key} value={choice.key}>
            {index+1}. {choice.ref.origin==='GENERATED'?'생성':'렌더'} {choice.ref.id.slice(-16)} · {choice.kind} ·
            ({choice.world.x.toPrecision(7)}, {choice.world.y.toPrecision(7)}) · {choice.distancePx.toFixed(1)}px
          </option>)}
        </select>
      </label>
      <button type="button" data-testid="cad-memo-snap-refresh" disabled={busy} onClick={onRefresh}
        className="min-h-11 rounded border border-slate-500 bg-white px-3">후보 다시 찾기</button>
    </div>
    <p role="status" className="mt-1 text-slate-700">{intent
      ?`${intent.choices.candidates.length}개 표시 / 검사 범위 내 ${intent.choices.total}개 후보 · ${intent.choices.scannedPoints}점 검사`
      :'입력한 좌표로 후보를 찾아 선택하세요.'}</p>
    {intent?.choices.limited&&<p data-testid="cad-memo-snap-limited" className="mt-1 text-amber-900">
      탐색 또는 표시 한도에 도달했습니다. 도면을 확대하거나 위치를 바꿔 다시 찾으세요.
    </p>}
    <p className="mt-1 text-slate-600">화살표·Enter 또는 터치로 선택할 수 있습니다. 이 연결은 현재 Viewer에서만 유지됩니다.</p>
  </fieldset>;
}
