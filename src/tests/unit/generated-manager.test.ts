import {afterEach,expect,it,vi} from 'vitest';
import {ViewerManager,type CadViewerAdapter} from '../../viewers/core/adapter';
import type {GeneratedCommand} from '../../domain/generated-document';

afterEach(()=>vi.unstubAllGlobals());
it('TC-E2-UNIT-005: Manager forwards commands, history, cancel and dispose without browser API or source writes',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('test')));
  const execute=vi.fn<(command:GeneratedCommand)=>void>();
  const undo=vi.fn(()=>true),redo=vi.fn(()=>true);
  const cancel=vi.fn(()=>true),dispose=vi.fn();
  const adapter:CadViewerAdapter={
    load:vi.fn(async()=>({empty:false})),fitToView:vi.fn(),zoomIn:vi.fn(),zoomOut:vi.fn(),
    executeGeneratedCommand:execute,undoGeneratedEdit:undo,redoGeneratedEdit:redo,
    cancelGeneratedCommand:cancel,commitGeneratedCommand:vi.fn(()=>true),
    getGeneratedHistory:()=>({undo:3,redo:1,limit:100}),dispose,
  };
  const manager=new ViewerManager(async()=>adapter);
  await manager.load('/file','DXF');
  const command:GeneratedCommand={type:'Delete',ids:['a']};
  manager.executeGeneratedCommand(command);
  expect(execute).toHaveBeenCalledOnce();
  expect(execute).toHaveBeenCalledWith(command);
  expect(manager.getGeneratedHistory()).toEqual({undo:3,redo:1,limit:100});
  expect(manager.undoGeneratedEdit()).toBe(true);
  expect(manager.redoGeneratedEdit()).toBe(true);
  expect(manager.cancelGeneratedCommand()).toBe(true);
  expect(undo).toHaveBeenCalledOnce();
  expect(redo).toHaveBeenCalledOnce();
  manager.dispose();
  expect(dispose).toHaveBeenCalledOnce();
  expect(manager.getGeneratedHistory()).toEqual({undo:0,redo:0,limit:100});
  expect(manager.undoGeneratedEdit()).toBe(false);
  expect(()=>manager.executeGeneratedCommand(command)).toThrow('지원되지');
});
