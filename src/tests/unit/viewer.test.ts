import { test, expect, vi, afterEach } from 'vitest';
import { ViewerManager, type CadViewerAdapter } from '../../viewers/core/adapter';
afterEach(()=>vi.unstubAllGlobals());
function adapter(): CadViewerAdapter { return {load:vi.fn(async()=>({empty:false})),dispose:vi.fn(),fitToView:vi.fn(),zoomIn:vi.fn(),zoomOut:vi.fn()}; }
test('TC-VIEW-001: unsupported format never creates a DXF adapter',async()=>{
  const factory = vi.fn(); const manager = new ViewerManager(factory);
  await expect(manager.load('/file','DWG')).rejects.toThrow('제공하지'); expect(factory).not.toHaveBeenCalled();
});
test('TC-VIEW-003: dispose late initialization and never start stale load',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('bytes')));
  const a = adapter(); let resolve!: (v:CadViewerAdapter)=>void;
  const factory = vi.fn(()=>new Promise<CadViewerAdapter>(r=>{resolve=r;}));
  const manager = new ViewerManager(factory); const pending = manager.load('/file','DXF');
  const rejected = expect(pending).rejects.toThrow();
  await vi.waitFor(()=>expect(factory).toHaveBeenCalled()); manager.dispose(); resolve(a);
  await rejected; expect(a.dispose).toHaveBeenCalledOnce(); expect(a.load).not.toHaveBeenCalled();
});
test('TC-VIEW-003: load failure cleans resources and controls delegate',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('bytes')));
  const a = adapter(); const manager = new ViewerManager(async()=>a);
  await manager.load('/file','DXF');manager.zoomIn();manager.zoomOut();manager.fitToView();
  expect(a.zoomIn).toHaveBeenCalledOnce(); expect(a.zoomOut).toHaveBeenCalledOnce();expect(a.fitToView).toHaveBeenCalledOnce();
  manager.dispose();manager.dispose();expect(a.dispose).toHaveBeenCalledOnce();
  const bad = adapter(); vi.mocked(bad.load).mockRejectedValue(new Error('parse'));
  await expect(new ViewerManager(async()=>bad).load('/file','DXF')).rejects.toMatchObject({stage:'adapter-load',reasonCode:'LOAD'});expect(bad.dispose).toHaveBeenCalledOnce();
});

test('TC-VIEW-003: completed stale load cannot replace the next result',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('bytes')));
  let resolve!: (value:{empty:boolean})=>void;
  const a=adapter();vi.mocked(a.load).mockImplementation(()=>new Promise(r=>{resolve=r;}));
  const manager=new ViewerManager(async()=>a);const pending=manager.load('/file','DXF');const rejected=expect(pending).rejects.toThrow();
  await vi.waitFor(()=>expect(a.load).toHaveBeenCalled());manager.dispose();resolve({empty:false});await rejected;
});


test('TC-TEXT-007: world-space focus delegates once, rejects invalid bounds and stops on dispose', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('DXF bytes')));
  const a = adapter();
  a.focusBounds = vi.fn();
  const manager = new ViewerManager(async () => a);
  await manager.load('/drawing', 'DXF');
  const valid = { minX: 100, minY: 20, maxX: 500, maxY: 30 };
  expect(manager.focusBounds(valid)).toBe(true);
  expect(a.focusBounds).toHaveBeenCalledWith(valid);
  expect(manager.focusBounds({ ...valid, maxX: 100 })).toBe(false);
  expect(manager.focusBounds({ ...valid, maxY: Number.POSITIVE_INFINITY })).toBe(false);
  expect(a.focusBounds).toHaveBeenCalledTimes(1);
  manager.dispose();
  expect(manager.focusBounds(valid)).toBe(false);
});


test('TC-U6-UNIT-003: manager safely delegates only confirmed outlines without altering CAD layers', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('DXF bytes')));
  const a = adapter();
  const rectangle = {type:'Polygon' as const,coordinates:[[[0,0],[10,0],[10,10],[0,0]] as [number,number][]]};
  a.getSavedOutlines = () => [{
    id:'local-1',createdAt:'2026-10-25T00:00:00Z',
    result:{kind:'CONVEX',algorithm:'monotone-chain-v1',geometry:rectangle,
      persistable:true,tolerance:0.02,durationMs:1,warnings:[],sourceEntityIds:['ref']},
  }];
  a.getSavedOutlineStates = () => [{id:'local-1',visible:true,selected:false}];
  a.focusBounds = vi.fn();
  a.selectSavedOutline = vi.fn(()=>true);
  a.setSavedOutlineVisibility = vi.fn(()=>true);
  a.showLayer = vi.fn();
  const manager = new ViewerManager(async()=>a);
  await manager.load('/drawing','DXF');
  expect(manager.getSavedOutlineStates()).toEqual([{id:'local-1',visible:true,selected:false}]);
  expect(manager.focusSavedOutline('missing')).toBe(false);
  expect(manager.focusSavedOutline('local-1')).toBe(true);
  expect(a.focusBounds).toHaveBeenCalledWith({minX:0,minY:0,maxX:10,maxY:10});
  expect(a.selectSavedOutline).toHaveBeenCalledWith('local-1');
  expect(manager.setSavedOutlineVisibility('local-1',false)).toBe(true);
  expect(manager.selectSavedOutline('local-1')).toBe(true);
  expect(a.showLayer).not.toHaveBeenCalled();
  manager.dispose();
  expect(manager.focusSavedOutline('local-1')).toBe(false);
  expect(manager.setSavedOutlineVisibility('local-1',true)).toBe(false);
});
