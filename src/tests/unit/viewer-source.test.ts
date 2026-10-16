import { test,expect,vi,afterEach } from 'vitest';
import { ViewerSource } from '../../viewers/core/source';
import { ViewerManager,type CadViewerAdapter } from '../../viewers/core/adapter';
afterEach(()=>vi.unstubAllGlobals());
test('TC-SWITCH-001: managers share download but adapters cannot mutate cached bytes',async()=>{
  const fetcher=vi.fn(async()=>new Response(new Uint8Array([1,2,3])));vi.stubGlobal('fetch',fetcher);
  const source=new ViewerSource();const received:number[][]=[];
  const factory=async():Promise<CadViewerAdapter>=>({load:async bytes=>{received.push([...new Uint8Array(bytes)]);new Uint8Array(bytes)[0]=99;return {empty:false};},dispose:vi.fn(),fitToView:vi.fn(),zoomIn:vi.fn(),zoomOut:vi.fn()});
  const a=new ViewerManager(factory,source);await a.load('/one','DXF');a.dispose();
  const b=new ViewerManager(factory,source);await b.load('/one','DXF');b.dispose();
  expect(fetcher).toHaveBeenCalledTimes(1);expect(received).toEqual([[1,2,3],[1,2,3]]);
  source.dispose();await new ViewerManager(factory,source).load('/one','DXF');expect(fetcher).toHaveBeenCalledTimes(2);
});
test('TC-SWITCH-002: switch while download pending only initializes latest manager',async()=>{
  let resolve!:(response:Response)=>void;const fetcher=vi.fn(()=>new Promise<Response>(r=>{resolve=r;}));vi.stubGlobal('fetch',fetcher);
  const source=new ViewerSource(),oldFactory=vi.fn(),nextFactory=vi.fn(async()=>({load:vi.fn(async()=>({empty:false})),dispose:vi.fn(),fitToView:vi.fn(),zoomIn:vi.fn(),zoomOut:vi.fn()}));
  const old=new ViewerManager(oldFactory,source);const pending=old.load('/one','DXF');const rejected=expect(pending).rejects.toThrow();old.dispose();
  const next=new ViewerManager(nextFactory,source).load('/one','DXF');resolve(new Response('bytes'));
  await rejected;await next;expect(oldFactory).not.toHaveBeenCalled();expect(nextFactory).toHaveBeenCalledOnce();expect(fetcher).toHaveBeenCalledOnce();
});
test('TC-SWITCH-002: failed fetch can retry and a different version never reuses bytes',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response('',{status:404})).mockResolvedValueOnce(new Response('a')).mockResolvedValueOnce(new Response('b'));vi.stubGlobal('fetch',fetcher);
  const source=new ViewerSource();await expect(source.read('/a')).rejects.toThrow('찾을 수');
  expect(new TextDecoder().decode(await source.read('/a'))).toBe('a');expect(new TextDecoder().decode(await source.read('/b'))).toBe('b');expect(fetcher).toHaveBeenCalledTimes(3);
});


test('TC-TEXT-008: index Worker is cancelled on renderer disposal, while shared source remains reusable', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n')));
  let spawned = 0, terminated = 0;
  vi.stubGlobal('Worker', class {
    onmessage = null;
    onerror = null;
    postMessage() { spawned++; }
    terminate() { terminated++; }
  });
  const source = new ViewerSource();
  const factory = async (): Promise<CadViewerAdapter> => ({
    load: async () => ({ empty: false }), dispose: vi.fn(), fitToView: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(),
  });
  const manager = new ViewerManager(factory, source);
  await manager.load('/one', 'DXF');
  const pending = manager.getTextIndex();
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(spawned).toBe(1));
  manager.dispose();
  await rejected;
  expect(terminated).toBe(1);
  expect(source.state('/one')).toBe('memory');
  expect(new TextDecoder().decode(await source.read('/one'))).toContain('ENTITIES');
  source.dispose();
});
