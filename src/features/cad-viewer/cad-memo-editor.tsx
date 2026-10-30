'use client';

import type { MemoWcsXY } from '@/domain/cad-memo';

export type MemoEditorFields = { title: string; content: string; x: string; y: string };

export function CadMemoEditor({
  fields, onFieldsChange, placing, newAnchor, selectedId, count, error, confirmDelete,
  onConfirmCoordinate, onCreate, onSaveText, onApplyPosition, onArmDelete,
  onDelete, onCancel, persistent, busy,
}: {
  fields: MemoEditorFields;
  onFieldsChange: (fields: MemoEditorFields) => void;
  placing: boolean;
  newAnchor: MemoWcsXY | null;
  selectedId: string | null;
  count: number;
  persistent:boolean;
  busy:boolean;
  error: string | null;
  confirmDelete: boolean;
  onConfirmCoordinate: () => void;
  onCreate: () => void;
  onSaveText: () => void;
  onApplyPosition: () => void;
  onArmDelete: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const creating = placing || !!newAnchor;
  return <section data-testid="cad-memo-editor" data-canvas-edit-escape-layer="memo"
    aria-label={persistent?'서버 메모 편집':'임시 메모 편집'} className="border-b border-slate-300 bg-amber-50 px-3 py-2 text-xs text-slate-900">
    <div className="flex flex-wrap items-center gap-2">
      <strong>{creating ? '메모 신규 배치' : '메모 내용·위치 편집'}</strong>
      <span className="text-amber-800">{persistent?'서버 영속 · 재접속 복원 · 작성자 기반 수정/삭제':'브라우저 세션 임시 · 저장/공유 불가'} · {count}/100개 {busy?'· 저장 중':''}</span>
      {placing && <span data-testid="cad-memo-place-hint">
        Canvas 클릭 또는 아래 WCS 좌표 입력 후 [좌표로 배치] (ESC 취소)
      </span>}
      {newAnchor && <span data-testid="cad-memo-candidate-wcs">
        미확정 앵커: ({newAnchor.x.toPrecision(8)}, {newAnchor.y.toPrecision(8)}) WCS
      </span>}
      {selectedId && <span className="text-slate-600">UUID: {selectedId.slice(0,8)}… {persistent?'(서버 ID)':'(로컬 ID)'}</span>}
    </div>
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
        제목 (필수, 최대 100자)
        <input data-testid="cad-memo-title" value={fields.title} maxLength={100}
          onChange={event=>onFieldsChange({...fields,title:event.target.value})}
          className="w-full rounded border border-slate-400 bg-white px-2 py-1.5" />
      </label>
      <label className="flex min-w-40 flex-[2] flex-col gap-1">
        본문 (일반 텍스트, 최대 2,000자)
        <textarea data-testid="cad-memo-content" value={fields.content} rows={2} maxLength={2000}
          onChange={event=>onFieldsChange({...fields,content:event.target.value})}
          className="w-full resize-y rounded border border-slate-400 bg-white px-2 py-1.5" />
      </label>
      <label className="flex flex-col gap-1">WCS X
        <input data-testid="cad-memo-x" inputMode="decimal" autoComplete="off"
          className="w-32 rounded border border-slate-400 bg-white px-2 py-1.5"
          value={fields.x} onChange={event=>onFieldsChange({...fields,x:event.target.value})} />
      </label>
      <label className="flex flex-col gap-1">WCS Y
        <input data-testid="cad-memo-y" inputMode="decimal" autoComplete="off"
          className="w-32 rounded border border-slate-400 bg-white px-2 py-1.5"
          value={fields.y} onChange={event=>onFieldsChange({...fields,y:event.target.value})} />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {placing && <button type="button" data-testid="cad-memo-coordinate-place"
          onClick={onConfirmCoordinate} className="rounded bg-slate-700 px-2 py-1.5 text-white">
          좌표로 배치
        </button>}
        {newAnchor && <button type="button" data-testid="cad-memo-create"
          onClick={onCreate} disabled={busy} className="rounded bg-teal-700 px-2 py-1.5 text-white">
          메모 작성 확정
        </button>}
        {selectedId && !creating && <>
          <button type="button" data-testid="cad-memo-save-text" onClick={onSaveText} disabled={busy}
            className="rounded bg-teal-700 px-2 py-1.5 text-white">텍스트 저장 (좌표 불변)</button>
          <button type="button" data-testid="cad-memo-apply-position" onClick={onApplyPosition} disabled={busy}
            className="rounded bg-slate-700 px-2 py-1.5 text-white">위치 이동 적용</button>
          <button type="button" data-testid="cad-memo-delete" onClick={confirmDelete?onDelete:onArmDelete} disabled={busy}
            className="rounded border border-red-400 bg-white px-2 py-1.5 text-red-800">
            {confirmDelete?'삭제 확정':persistent?'메모 논리 삭제':'로컬 메모 삭제'}
          </button>
        </>}
        <button type="button" data-testid="cad-memo-cancel" onClick={onCancel}
          className="rounded border border-slate-500 bg-white px-2 py-1.5">취소/닫기</button>
      </div>
    </div>
    {confirmDelete && <p className="mt-1 text-red-800">선택한 메모를 삭제 처리합니다. 취소 시 데이터는 유지됩니다.</p>}
    {error && <p data-testid="cad-memo-error" role="alert" className="mt-1 text-red-800">{error}</p>}
    <p className="mt-1 text-slate-600">
      텍스트 저장은 앵커를 변경하지 않습니다. 위치는 [위치 이동 적용] 또는 핀 드래그가 완료될 때만 바뀝니다.
      메모 핀은 도면 WCS 좌표에 고정되며 본문은 HTML/Markdown으로 실행하지 않습니다.
    </p>
  </section>;
}
