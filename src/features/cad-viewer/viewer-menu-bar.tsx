'use client';

import Link from 'next/link';
import { List } from 'lucide-react';
import { ViewerCommandMenus, type ViewerCommandGroup } from './viewer-command-menu';

/** Command groups are controlled by CadViewer; this component never owns CAD state. */
export function ViewerMenuBar({ commandGroups, onMenuOpen, onBeforeListNavigation }: { commandGroups: ViewerCommandGroup[]; onMenuOpen?: () => void; onBeforeListNavigation?: () => boolean }) {
  return <nav aria-label="도면 앱 메뉴" data-testid="viewer-menu-bar"
    className="relative z-[70] flex min-w-0 items-center border-b border-slate-700 bg-slate-900 px-2 py-1 text-white">
    <Link href="/" title="도면 목록으로 이동" aria-label="도면 목록으로 이동"
      data-testid="viewer-back-to-list"
      className="mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded border border-slate-500 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
      onClick={event=>{if(onBeforeListNavigation&&!onBeforeListNavigation())event.preventDefault();}}
      onKeyDown={event=>{if(event.key===' '){event.preventDefault();event.currentTarget.click();}}}>
      <List aria-hidden="true" className="size-5" />
    </Link>
    <ViewerCommandMenus groups={commandGroups} onMenuOpen={onMenuOpen} />
  </nav>;
}
