'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type ViewerCommand = {
  id: string;
  label: string;
  kind?: 'action' | 'radio' | 'checkbox' | 'link';
  checked?: boolean;
  disabled?: boolean;
  reason?: string;
  href?: string;
  download?: boolean;
  controls?: string;
  expanded?: boolean;
  onSelect?: () => void;
  testId?: string;
};
export type ViewerCommandGroup = { id: string; label: string; commands: ViewerCommand[] };

export function ViewerCommandMenus({ groups, onMenuOpen }: { groups: ViewerCommandGroup[]; onMenuOpen?: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [menuOffset,setMenuOffset]=useState(0);
  const root = useRef<HTMLDivElement>(null);
  const lastTrigger = useRef<HTMLButtonElement>(null);
  const keyboardFocus = useRef<{group:string;which:'first'|'last'} | null>(null);
  const focusItem = (which: 'first'|'last'|number) => {
    const items=[...(root.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const item=which==='first'?items[0]:which==='last'?items[items.length-1]:items[which];
    item?.focus();
  };
  useLayoutEffect(()=>{
    const pending=keyboardFocus.current;
    if(!open || pending?.group!==open)return;
    keyboardFocus.current=null;
    focusItem(pending.which);
  },[open]);
  useEffect(() => {
    if (!open) return;
    onMenuOpen?.();
    const button=root.current?.querySelector<HTMLElement>(`[data-viewer-group=\"${open}\"]`);
    const shell=root.current?.closest<HTMLElement>('[data-testid=\"cad-viewer-shell\"]');
    if(button && shell){const x=button.getBoundingClientRect().left;const right=shell.getBoundingClientRect().right;setMenuOffset(Math.max(8-x,Math.min(0,right-x-264)));}
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(null); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open, onMenuOpen]);
  const close = () => { setOpen(null); requestAnimationFrame(() => {
    if (!root.current?.closest('[data-testid=\"cad-viewer-shell\"]')?.querySelector('[role=\"dialog\"][data-drawer]'))
      lastTrigger.current?.focus({preventScroll:true});
  }); };
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key==='ArrowRight'||event.key==='ArrowLeft') {
      const currentId=open || (event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-viewer-group]')?.dataset.viewerGroup : undefined);
      const index=groups.findIndex(group=>group.id===currentId);
      if(index>=0){
        event.preventDefault();
        const next=(index+(event.key==='ArrowRight'?1:groups.length-1))%groups.length;
        const button=root.current?.querySelector<HTMLButtonElement>(`[data-viewer-group=\"${groups[next].id}\"]`);
        if(button){
          lastTrigger.current=button;
          keyboardFocus.current={group:groups[next].id,which:'first'};
          setOpen(groups[next].id);
        }
      }
      return;
    }
    if (!open) return;
    if (event.key==='Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key==='Tab') {
      event.preventDefault();event.stopPropagation();
      const index=groups.findIndex(group=>group.id===open);
      const target=event.shiftKey ? (index>0 ? root.current?.querySelector<HTMLElement>(`[data-viewer-group=\"${groups[index-1].id}\"]`) : lastTrigger.current) :
        (index<groups.length-1 ? root.current?.querySelector<HTMLElement>(`[data-viewer-group=\"${groups[index+1].id}\"]`) : root.current?.closest('[data-testid=\"cad-viewer-shell\"]')?.querySelector<HTMLElement>('[data-testid=\"viewer-toolbar\"] button'));
      setOpen(null);requestAnimationFrame(()=>target?.focus({preventScroll:true}));return;
    }
    if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const items=[...(root.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    if (!items.length) return;
    const current=items.indexOf(document.activeElement as HTMLElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:
      event.key==='ArrowDown'?(current+1)%items.length:(current+items.length-1)%items.length;
    items[next]?.focus();
  };
  return <div ref={root} className="relative flex shrink-0 gap-1" onKeyDown={onKey}>
    {groups.map(group => <div key={group.id} className="relative">
      <button data-viewer-group={group.id} type="button" aria-haspopup="menu" aria-expanded={open===group.id}
        aria-controls={open===group.id?`viewer-menu-${group.id}`:undefined}
        className="viewer-command-trigger rounded px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:bg-slate-700"
        onClick={event => { lastTrigger.current=event.currentTarget; keyboardFocus.current=null; setOpen(open===group.id?null:group.id); }}
        onKeyDown={event => { if (['ArrowDown','ArrowUp','Enter',' '].includes(event.key)) {
          event.preventDefault();event.stopPropagation();lastTrigger.current=event.currentTarget;
          const which=event.key==='ArrowUp'?'last':'first';
          if(open===group.id)focusItem(which);
          else {keyboardFocus.current={group:group.id,which};setOpen(group.id);}
        } }}>
        {group.label}
      </button>
      {open===group.id && <div id={`viewer-menu-${group.id}`} role="menu" aria-label={`${group.label} 명령`} data-canvas-edit-escape-layer="menu"
        style={{left:menuOffset}} className="absolute top-full z-[120] max-h-[min(70dvh,560px)] w-64 overflow-y-auto rounded-lg border border-slate-500 bg-white p-1 text-slate-900 shadow-xl">
        {group.commands.map(command => {
          const role=command.kind==='radio'?'menuitemradio':command.kind==='checkbox'?'menuitemcheckbox':'menuitem';
          const common={role, tabIndex:-1, 'data-testid':command.testId, 'aria-controls':command.controls, 'aria-expanded':command.expanded, 'aria-describedby':command.disabled&&command.reason?`viewer-command-reason-${group.id}-${command.id}`:undefined, 'aria-disabled':command.disabled || undefined, 'aria-checked':command.kind==='radio'||command.kind==='checkbox'?Boolean(command.checked):undefined,
            title:command.reason, className:'viewer-command-item block w-full rounded px-3 py-2 text-left text-sm hover:bg-teal-50 focus:bg-teal-50 focus:outline focus:outline-2 focus:outline-teal-700 '+(command.disabled?'cursor-not-allowed text-slate-400':'')} as const;
          return <div key={command.id}>
            {command.kind==='link' && command.href ? <a href={command.href} download={command.download || undefined} {...common} onKeyDown={event=>{if(event.key===' '){event.preventDefault();event.currentTarget.click();}}} onClick={()=>close()}>{command.label}</a> :
              <button type="button" {...common} onClick={()=>{if(command.disabled)return;command.onSelect?.();close();}}>
                {(command.kind==='radio'||command.kind==='checkbox') && <span aria-hidden="true" className="mr-2 inline-block w-3">{command.checked?'✓':''}</span>}{command.label}
              </button>}
            {command.disabled && command.reason && <p id={`viewer-command-reason-${group.id}-${command.id}`} className="px-3 pb-1 text-xs text-slate-500">{command.reason}</p>}
          </div>;
        })}
      </div>}
    </div>)}
  </div>;
}
