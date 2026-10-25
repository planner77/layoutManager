'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { ViewerManager } from '@/viewers/core/adapter';
import {
  assertMemoWcsXY, type MemoDraft, type MemoWcsXY,
} from '@/domain/cad-memo';

type Gesture = {
  id: string; pointerId: number; clientX: number; clientY: number;
  world: MemoWcsXY; anchor: MemoWcsXY; epoch: number; moved: boolean;
};

/**
 * M1 overlay is a sibling, never a child, of the WebGL canvas.
 * Only the pin's 24px hit target accepts pointer events in normal mode;
 * labels and leader text pass events through to the Source/Generated canvas.
 * The placement plane is interactive only while the mutually exclusive add
 * tool is active. Camera projection is delegated to the active adapter.
 */
export function CadMemoOverlay({
  memos, selectedId, placing, getManager, viewRevision, getViewEpoch,
  cancelGestureSignal, onPlace, onSelect, onMove, onGestureActive,
}: {
  memos: readonly MemoDraft[];
  selectedId: string | null;
  placing: boolean;
  getManager: () => ViewerManager | null;
  viewRevision: number;
  getViewEpoch: () => number;
  cancelGestureSignal: number;
  onPlace: (point: MemoWcsXY) => void;
  onSelect: (id: string) => void;
  onMove: (id: string, point: MemoWcsXY) => void;
  onGestureActive: (active: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<{id: string; point: MemoWcsXY} | null>(null);
  const [screenPositions, setScreenPositions] = useState<Record<string,{x:number;y:number}>>({});
  // Camera projection reads a live adapter, so measure after commit rather than
  // reading refs or imperative WebGL state during React render.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const rect = root.current?.getBoundingClientRect();
      const manager = getManager();
      if (!rect || !manager) { setScreenPositions({}); return; }
      const positions:Record<string,{x:number;y:number}> = {};
      for (const memo of memos) {
        const point=preview?.id===memo.id?preview.point:memo.anchorWcsXY;
        const xy=manager.projectWcsToCanvas(point);
        if (!xy || xy.x<0 || xy.y<0 || xy.x>rect.width || xy.y>rect.height) continue;
        positions[memo.id]=xy;
      }
      setScreenPositions(positions);
    });
    return () => cancelAnimationFrame(frame);
  }, [memos, preview, getManager, viewRevision]);

  function cancelGesture() {
    gesture.current = null;
    setPreview(null);
    onGestureActive(false);
  }
  useEffect(() => {
    if (gesture.current) {
      gesture.current = null;
      setPreview(null);
      onGestureActive(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelGestureSignal, placing]);

  useEffect(() => {
    const onCancel = () => {
      if (gesture.current) {
        gesture.current = null;
        setPreview(null);
        onGestureActive(false);
      }
    };
    window.addEventListener('blur', onCancel);
    window.addEventListener('scroll', onCancel, true);
    return () => { window.removeEventListener('blur', onCancel);
      window.removeEventListener('scroll', onCancel, true); };
  }, [onGestureActive]);

  function start(event: ReactPointerEvent<HTMLButtonElement>, memo: MemoDraft) {
    if (event.button !== 0 || (event.pointerType === 'touch' && !event.isPrimary)) return;
    const point = getManager()?.clientToWcs(event.clientX, event.clientY);
    if (!point) return;
    gesture.current = {
      id: memo.id, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      world: point, anchor: memo.anchorWcsXY, epoch: getViewEpoch(), moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    onGestureActive(true);
    event.stopPropagation();
  }
  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = gesture.current;
    if (!start || event.pointerId !== start.pointerId) return;
    if (getViewEpoch() !== start.epoch || !memos.some(m => m.id === start.id)) {
      cancelGesture();
      return;
    }
    if (Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) < 5 &&
        !start.moved) return;
    start.moved = true;
    const now = getManager()?.clientToWcs(event.clientX, event.clientY);
    if (!now) { cancelGesture(); return; }
    try {
      setPreview({ id: start.id, point: assertMemoWcsXY({
        x: start.anchor.x + now.x - start.world.x,
        y: start.anchor.y + now.y - start.world.y,
      }) });
    } catch {
      cancelGesture();
    }
    event.stopPropagation();
  }
  function finish(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = gesture.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const valid = getViewEpoch() === start.epoch && memos.some(m => m.id === start.id);
    const now = valid && start.moved ? getManager()?.clientToWcs(event.clientX, event.clientY) : null;
    cancelGesture();
    if (!valid || !now) return;
    try {
      onMove(start.id, assertMemoWcsXY({
        x: start.anchor.x + now.x - start.world.x,
        y: start.anchor.y + now.y - start.world.y,
      }));
    } catch {
      // Invalid/out-of-range coordinates never become a committed position.
    }
    event.stopPropagation();
  }

  return <div ref={root} data-testid="cad-memo-overlay"
    className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
    onWheelCapture={() => { if (gesture.current) cancelGesture(); }}
    data-memo-count={memos.length}
    data-placing={placing?'true':'false'}>
    {placing && <div role="button" tabIndex={0}
      data-testid="cad-memo-placement-plane"
      aria-label="Canvas에서 임시 메모 위치 지정"
      title="클릭해서 도면 WCS 좌표 지정 · ESC 취소. 키보드는 하단 WCS 좌표 입력 사용."
      className="pointer-events-auto absolute inset-0 cursor-crosshair bg-transparent"
      onClick={event => {
        if (event.button !== 0) return;
        const point = getManager()?.clientToWcs(event.clientX, event.clientY);
        if (point) onPlace(point);
      }}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.preventDefault(); }}
    />}
    {memos.map(memo => {
      const point = preview?.id === memo.id ? preview.point : memo.anchorWcsXY;
      const screen = screenPositions[memo.id];
      if (!screen) return null;
      return <button type="button" key={memo.id} data-testid="cad-memo-pin"
        data-memo-id={memo.id} data-memo-preview={preview?.id===memo.id?'true':'false'}
        data-memo-wcs-x={point.x} data-memo-wcs-y={point.y}
        data-canvas-edit-escape-layer={gesture.current?.id === memo.id ? 'memo' : undefined}
        aria-label={`메모: ${memo.title}`}
        title="메모 선택 · 5px 이상 드래그 시 위치 변경 · ESC 취소"
        onPointerDown={event=>start(event,memo)}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={cancelGesture}
        onLostPointerCapture={cancelGesture}
        onClick={event=>{event.stopPropagation();onSelect(memo.id);}}
        className={'pointer-events-auto absolute flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold shadow-md ' +
          (selectedId===memo.id?'border-white bg-teal-700 text-white':'border-white bg-amber-500 text-black')}
        style={{ left:screen.x,top:screen.y,transform:'translate(-50%, -50%)' }}>
        <span aria-hidden="true">M</span>
        <span aria-hidden="true" className="pointer-events-none absolute z-10 max-h-20 w-max max-w-40 overflow-hidden rounded border border-slate-300 bg-white/95 px-1.5 py-1 text-left text-[11px] font-normal leading-tight text-slate-900 shadow-sm"
          style={{left:12+memo.labelOffset.x,top:memo.labelOffset.y,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>
          <strong className="block font-semibold">{memo.title}</strong>
          {memo.content && <span className="mt-0.5 block max-h-12 overflow-hidden whitespace-pre-wrap font-normal text-slate-700">{memo.content}</span>}
        </span>
      </button>;
    })}
  </div>;
}
