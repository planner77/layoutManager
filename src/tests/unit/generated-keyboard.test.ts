import {describe,expect,it} from 'vitest';
import {getGeneratedDeleteShortcut,getGeneratedHistoryShortcut,isTextEditingTarget} from '../../domain/generated-keyboard';
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

describe('TC-E3-UNIT-005: Delete/Backspace only with Canvas focus and no text input',()=>{
  const deletion=(key:string,modifiers:Partial<TestEvent>&{repeat?:boolean}={})=>
    ({...event(key),repeat:false,...modifiers});
  it('supports plain Delete/Backspace only in focused canvas',()=>{
    expect(getGeneratedDeleteShortcut(deletion('Delete'),true)).toBe(true);
    expect(getGeneratedDeleteShortcut(deletion('Backspace'),true)).toBe(true);
    expect(getGeneratedDeleteShortcut(deletion('Delete'),false)).toBe(false);
    expect(getGeneratedDeleteShortcut(deletion('a'),true)).toBe(false);
    expect(getGeneratedDeleteShortcut(deletion('Delete',{ctrlKey:true}),true)).toBe(false);
    expect(getGeneratedDeleteShortcut(deletion('Delete',{metaKey:true}),true)).toBe(false);
    expect(getGeneratedDeleteShortcut(deletion('Delete',{shiftKey:true}),true)).toBe(false);
    expect(getGeneratedDeleteShortcut(deletion('Backspace',{altKey:true}),true)).toBe(false);
    expect(getGeneratedDeleteShortcut(deletion('Delete',{repeat:true}),true)).toBe(false);
    expect(getGeneratedDeleteShortcut(deletion('Delete',{defaultPrevented:true}),true)).toBe(false);
  });
  it('never consumes input, textarea, role searchbox or contenteditable descendants',()=>{
    for(const tagName of ['INPUT','TEXTAREA','SELECT']){
      const target={tagName,closest:()=>({tagName})};
      expect(getGeneratedDeleteShortcut(deletion('Backspace',{target:target as unknown as EventTarget}),true)).toBe(false);
    }
    const search={tagName:'SPAN',closest:()=>({tagName:'DIV'})};
    expect(getGeneratedDeleteShortcut(deletion('Delete',{target:search as unknown as EventTarget}),true)).toBe(false);
  });
});
