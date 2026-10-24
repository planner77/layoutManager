'use client';

import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Controlled dock: closing it never changes CAD layer visibility. */
export function FullscreenLayerPanel({
  layers,
  selected,
  onLayerChange,
  onAllChange,
  onClose,
}: {
  layers: string[];
  selected: ReadonlySet<string>;
  onLayerChange: (name: string, visible: boolean) => void;
  onAllChange: (visible: boolean) => void;
  onClose: () => void;
}) {
  return (
    <aside
      aria-label="전체 화면 레이어"
      data-testid="fullscreen-layer-panel"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white text-slate-900"
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
        <strong className="mr-auto text-sm">레이어 {selected.size}/{layers.length}</strong>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="레이어 패널 접기"
          aria-expanded="true"
          data-testid="fullscreen-layer-panel-toggle"
          onClick={onClose}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <div className="flex gap-1 border-b border-slate-200 p-2">
        <Button type="button" size="sm" variant="outline" disabled={selected.size === layers.length} onClick={() => onAllChange(true)}>
          전체 선택
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={selected.size === 0} onClick={() => onAllChange(false)}>
          전체 해제
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {layers.map(name => (
          <label key={name} className="flex min-h-9 cursor-pointer items-start gap-2 rounded px-2 py-2 text-sm hover:bg-teal-50 focus-within:bg-teal-50">
            <input
              type="checkbox"
              checked={selected.has(name)}
              aria-label={name}
              onChange={event => onLayerChange(name, event.target.checked)}
              className="mt-0.5 size-4 shrink-0"
            />
            <span className="min-w-0 break-all">{name}</span>
          </label>
        ))}
      </div>
    </aside>
  );
}
