/** Issue #52: shortcuts only within the Viewer, never while editing text. */
export type HistoryShortcut='undo'|'redo';
type KeyInput=Pick<KeyboardEvent,
  'key'|'ctrlKey'|'metaKey'|'altKey'|'shiftKey'|'defaultPrevented'|'target'>;

export function isTextEditingTarget(target:EventTarget|null):boolean{
  if(!target||typeof target!=='object')return false;
  const el=target as HTMLElement;
  if(el.isContentEditable)return true;
  // A nested span inside a contenteditable host is also an editable target.
  if(typeof el.closest==='function')
    return !!el.closest('input,textarea,select,[contenteditable],[role="textbox"],[role="searchbox"]');
  return /^(INPUT|TEXTAREA|SELECT)$/i.test(el.tagName??'');
}
export function getGeneratedHistoryShortcut(event:KeyInput):HistoryShortcut|null{
  if(event.defaultPrevented||event.altKey||!(event.ctrlKey||event.metaKey)||
     isTextEditingTarget(event.target))return null;
  const key=event.key.toLowerCase();
  if(key==='z')return event.shiftKey?'redo':'undo';
  if(key==='y'&&event.ctrlKey&&!event.metaKey&&!event.shiftKey)return 'redo';
  return null;
}
