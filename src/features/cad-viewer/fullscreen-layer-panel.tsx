'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function FullscreenLayerPanel({
  layers,
  selected,
  onLayerChange,
  onAllChange,
}: {
  layers: string[];
  selected: ReadonlySet<string>;
  onLayerChange: (name: string, visible: boolean) => void;
  onAllChange: (visible: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label="레이어 패널 펼치기"
        aria-expanded="false"
        data-testid="fullscreen-layer-panel-toggle"
        className="absolute left-4 top-4 z-20 bg-white/95 shadow-lg"
        onClick={() => setCollapsed(false)}
      >
        <ChevronRight aria-hidden="true" className="size-4" />
        레이어
      </Button>
    );
  }

  return (
    <aside
      aria-label="전체 화면 레이어"
      data-testid="fullscreen-layer-panel"
      className="absolute bottom-4 left-4 top-4 z-20 flex w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white/95 text-slate-900 shadow-lg backdrop-blur-sm"
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
          onClick={() => setCollapsed(true)}
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
