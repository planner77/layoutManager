import {describe,expect,it} from 'vitest';
import {getGeneratedHistoryShortcut,isTextEditingTarget} from '../../domain/generated-keyboard';
type TestEvent=Parameters<typeof getGeneratedHistoryShortcut>[0];
function event(key:string,modifiers:Partial<TestEvent>={}):TestEvent{
  return {key,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,
    defaultPrevented:false,target:null,...modifiers};
}
describe('TC-E2-UNIT-004: keyboard shortcut input isolation',()=>{
  it('maps primary modifier Z, Shift+Z and Windows Ctrl+Y without native conflict',()=>{
    expect(getGeneratedHistoryShortcut(event('z',{ctrlKey:true}))).toBe('undo');
    expect(getGeneratedHistoryShortcut(event('Z',{metaKey:true}))).toBe('undo');
    expect(getGeneratedHistoryShortcut(event('z',{metaKey:true,shiftKey:true}))).toBe('redo');
    expect(getGeneratedHistoryShortcut(event('z',{ctrlKey:true,shiftKey:true}))).toBe('redo');
    expect(getGeneratedHistoryShortcut(event('y',{ctrlKey:true}))).toBe('redo');
    expect(getGeneratedHistoryShortcut(event('y',{metaKey:true}))).toBeNull();
    expect(getGeneratedHistoryShortcut(event('z',{altKey:true,ctrlKey:true}))).toBeNull();
    expect(getGeneratedHistoryShortcut(event('z',{ctrlKey:true,defaultPrevented:true}))).toBeNull();
    expect(getGeneratedHistoryShortcut(event('z'))).toBeNull();
  });
  it('leaves input, textarea, select, contenteditable and nested editing elements untouched',()=>{
    for(const tag of ['INPUT','TEXTAREA','SELECT']){
      const target={tagName:tag,closest:(selector:string)=>selector.includes(tag.toLowerCase()) ? target:null};
      expect(isTextEditingTarget(target as unknown as EventTarget)).toBe(true);
      expect(getGeneratedHistoryShortcut(event('z',{metaKey:true,target:target as unknown as EventTarget}))).toBeNull();
    }
    const target={tagName:'SPAN',closest:()=>({tagName:'DIV'})};
    expect(isTextEditingTarget(target as unknown as EventTarget)).toBe(true);
    expect(getGeneratedHistoryShortcut(event('z',{ctrlKey:true,target:target as unknown as EventTarget}))).toBeNull();
    const roleInput={tagName:'DIV',closest:()=>({tagName:'DIV'})};
    expect(getGeneratedHistoryShortcut(event('y',{ctrlKey:true,target:roleInput as unknown as EventTarget}))).toBeNull();
    expect(isTextEditingTarget(null)).toBe(false);
  });
});
