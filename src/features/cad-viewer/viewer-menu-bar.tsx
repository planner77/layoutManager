'use client';

import { ViewerCommandMenus, type ViewerCommandGroup } from './viewer-command-menu';

/** Command groups are controlled by CadViewer; this component never owns CAD state. */
export function ViewerMenuBar({ commandGroups, onMenuOpen }: { commandGroups: ViewerCommandGroup[]; onMenuOpen?: () => void }) {
  return <nav aria-label="도면 앱 메뉴" data-testid="viewer-menu-bar"
    className="relative z-[70] flex min-w-0 items-center border-b border-slate-700 bg-slate-900 px-2 py-1 text-white">
    <ViewerCommandMenus groups={commandGroups} onMenuOpen={onMenuOpen} />
  </nav>;
}
