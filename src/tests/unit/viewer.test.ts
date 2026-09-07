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
  await expect(new ViewerManager(async()=>bad).load('/file','DXF')).rejects.toThrow('parse');expect(bad.dispose).toHaveBeenCalledOnce();
});

test('TC-VIEW-003: completed stale load cannot replace the next result',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('bytes')));
  let resolve!: (value:{empty:boolean})=>void;
  const a=adapter();vi.mocked(a.load).mockImplementation(()=>new Promise(r=>{resolve=r;}));
  const manager=new ViewerManager(async()=>a);const pending=manager.load('/file','DXF');const rejected=expect(pending).rejects.toThrow();
  await vi.waitFor(()=>expect(a.load).toHaveBeenCalled());manager.dispose();resolve({empty:false});await rejected;
});
