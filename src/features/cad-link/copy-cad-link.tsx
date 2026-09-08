'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cadViewerUrl } from '@/viewers/core/link';
import type { ViewerFormat, ViewerRenderer } from '@/viewers/core/selection';

export function CopyCadLink({
  versionId,
  format,
  renderer,
  label = '도면 링크 복사',
}: {
  versionId: string;
  format: ViewerFormat;
  renderer?: ViewerRenderer;
  label?: string;
}) {
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => '');
  const url = origin ? cadViewerUrl(origin, versionId, format, renderer) : '';
  const [feedback, setFeedback] = useState<{ url: string; message: string; fallback: boolean }>();
  const operation = useRef(0);
  const currentFeedback = feedback?.url === url ? feedback : undefined;

  async function copy() {
    const currentOperation = ++operation.current;
    if (!url || !navigator.clipboard?.writeText) {
      if (currentOperation === operation.current) {
        setFeedback({url, fallback:true, message:'클립보드를 사용할 수 없습니다. 아래 링크를 직접 복사하거나 도면을 열어주세요.'});
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      if (currentOperation === operation.current) setFeedback({url, fallback:false, message:'도면 링크를 복사했습니다.'});
    } catch {
      if (currentOperation === operation.current) {
        setFeedback({url, fallback:true, message:'링크를 복사하지 못했습니다. 아래 링크를 직접 복사하거나 도면을 열어주세요.'});
      }
    }
  }

  return <div className="inline-flex flex-col items-start gap-2">
    <Button type="button" variant="outline" size="sm" aria-label={label} onClick={copy}>
      <Copy size={15}/>링크 복사
    </Button>
    {currentFeedback && <span className="max-w-sm whitespace-normal text-xs text-slate-600" aria-live="polite">{currentFeedback.message}</span>}
    {currentFeedback?.fallback && url && <div className="flex max-w-sm flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs">
      <label className="sr-only" htmlFor={`cad-link-${versionId}`}>복사할 도면 링크</label>
      <input id={`cad-link-${versionId}`} className="min-w-48 flex-1 rounded border border-slate-300 bg-white px-2 py-1" readOnly value={url} onFocus={event => event.currentTarget.select()}/>
      <a className="font-medium text-teal-700 underline" href={url}>도면 열기</a>
    </div>}
  </div>;
}
