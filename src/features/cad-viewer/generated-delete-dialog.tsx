'use client';

import {useEffect,useRef,type KeyboardEvent} from 'react';
import {Button} from '@/components/ui/button';
import type {GeneratedDeleteRequest} from '@/domain/generated-delete';

/** Confirmation lives inside the Viewer fullscreen subtree; Escape is handled
 * by the Viewer capture listener before the fullscreen/selection shortcuts. */
export function GeneratedDeleteDialog({
  request,onCancel,onConfirm,
}:{
  request:GeneratedDeleteRequest;
  onCancel:()=>void;
  onConfirm:()=>void;
}) {
  const cancelRef=useRef<HTMLButtonElement>(null);
  const confirmRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const previous=document.activeElement;
    cancelRef.current?.focus({preventScroll:true});
    return ()=>{
      const target=previous instanceof HTMLElement && previous.isConnected
        ?previous:document.querySelector<HTMLElement>('[data-testid="cad-viewer-shell"]');
      target?.focus({preventScroll:true});
    };
  },[]);
  const onDialogKey=(event:KeyboardEvent)=>{
    if(event.key!=='Tab')return;
    const first=cancelRef.current,last=confirmRef.current;
    if(!first||!last)return;
    if(event.shiftKey && document.activeElement===first){
      event.preventDefault();last.focus();
    } else if(!event.shiftKey && document.activeElement===last){
      event.preventDefault();first.focus();
    }
  };
  return (
    <div data-testid="generated-delete-dialog-backdrop" data-canvas-edit-escape-layer="dialog"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4"
      onPointerDown={event=>{if(event.target===event.currentTarget)onCancel();}}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="generated-delete-title"
        aria-describedby="generated-delete-description"
        data-testid="generated-delete-dialog"
        onKeyDown={onDialogKey}
        className="max-h-[80dvh] w-full max-w-md overflow-auto rounded-lg border border-slate-300 bg-white p-4 text-slate-900 shadow-xl">
        <h2 id="generated-delete-title" className="text-base font-semibold">
          생성 개체 {request.targets.length}개 삭제 확인
        </h2>
        <p id="generated-delete-description" className="my-2 text-sm">
          다음 임시 생성 개체만 삭제합니다. 원본 DXF는 변경되지 않으며 Undo로 복원할 수 있습니다.
        </p>
        <ul data-testid="generated-delete-targets"
          className="max-h-44 list-disc overflow-auto pl-5 text-sm">
          {request.targets.map(item=><li key={item.id} className="break-words">
            {item.name} ({item.savedOutlineId})
          </li>)}
        </ul>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button ref={cancelRef} size="sm" variant="outline" onClick={onCancel}>삭제 취소</Button>
          <Button ref={confirmRef} size="sm" data-testid="generated-delete-confirm"
            onClick={onConfirm}>선택한 {request.targets.length}개 삭제 확정</Button>
        </div>
      </section>
    </div>
  );
}
