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


test('TC-TEXT-009: text index is cached by drawing URL and is removed on source change/reload', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('DXF bytes')));
  const source = new ViewerSource();
  const index = { hits: [], skipped: {}, truncated: false };
  await source.read('/first');
  source.setTextIndex('/first', index);
  expect(source.getTextIndex('/first')).toBe(index);
  await source.read('/second');
  expect(source.getTextIndex('/first')).toBeUndefined();
  expect(source.getTextIndex('/second')).toBeUndefined();
  source.setTextIndex('/second', index);
  source.dispose();
  expect(source.getTextIndex('/second')).toBeUndefined();
});

test('TC-126-RECOVERY: source HTTP failure stays distinct from adapter failure',async()=>{
  const factory=vi.fn(async():Promise<CadViewerAdapter>=>({load:vi.fn(),dispose:vi.fn(),fitToView:vi.fn(),zoomIn:vi.fn(),zoomOut:vi.fn()}));
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:404})));
  const source=new ViewerSource();
  await expect(new ViewerManager(factory,source).load('/missing','DXF')).rejects.toMatchObject({stage:'source',reasonCode:'HTTP_404'});
  expect(factory).not.toHaveBeenCalled();
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('bytes')));
  const failInit=new ViewerManager(async()=>{throw new Error('GPU unavailable');},source);
  await expect(failInit.load('/same','DXF')).rejects.toMatchObject({stage:'adapter-init',reasonCode:'INITIALIZE'});
  const failLoad=new ViewerManager(async()=>({load:async()=>{throw new Error('Worker failed');},dispose:vi.fn(),fitToView:vi.fn(),zoomIn:vi.fn(),zoomOut:vi.fn()}),source);
  await expect(failLoad.load('/same','DXF')).rejects.toMatchObject({stage:'adapter-load',reasonCode:'LOAD'});
  expect(source.state('/same')).toBe('memory');
});

test('TC-126-RECOVERY: disposed late factory cannot attach as active adapter',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('bytes')));
  let release!:(adapter:CadViewerAdapter)=>void;
  const late=new Promise<CadViewerAdapter>(resolve=>{release=resolve;});
  const factory=vi.fn(()=>late);
  const manager=new ViewerManager(factory);
  const pending=manager.load('/one','DXF');
  await vi.waitFor(()=>expect(factory).toHaveBeenCalledOnce());
  manager.dispose();
  const adapter:CadViewerAdapter={load:vi.fn(),dispose:vi.fn(),fitToView:vi.fn(),zoomIn:vi.fn(),zoomOut:vi.fn()};
  release(adapter);
  await expect(pending).rejects.toMatchObject({name:'AbortError'});
  expect(adapter.dispose).toHaveBeenCalledOnce();
  expect(adapter.load).not.toHaveBeenCalled();
});

test('TC-126-RECOVERY: abort while reading response body remains cancellation',async()=>{
  let rejectBody!:(error:Error)=>void;
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:()=>new Promise<ArrayBuffer>((_,reject)=>{rejectBody=reject;})})));
  const source=new ViewerSource();
  const pending=source.read('/slow-body');
  await vi.waitFor(()=>expect(rejectBody).toBeTypeOf('function'));
  source.dispose();
  rejectBody(new Error('body stream interrupted'));
  await expect(pending).rejects.toMatchObject({name:'AbortError'});
  expect(source.state('/slow-body')).toBe('miss');
});

test('TC-126-RECOVERY: every source transport/read failure is typed before adapter creation',async()=>{
  const cases: {reasonCode:string;fetcher:()=>Promise<Response>}[]=[
    {reasonCode:'NETWORK',fetcher:async()=>{throw new TypeError('offline');}},
    {reasonCode:'HTTP_ERROR',fetcher:async()=>new Response('',{status:500})},
    {reasonCode:'BODY_READ',fetcher:async()=>{
      const response=new Response('bytes');
      Object.defineProperty(response,'arrayBuffer',{value:async()=>{throw new Error('stream failed');}});
      return response;
    }},
  ];
  for(const item of cases){
    vi.stubGlobal('fetch',vi.fn(item.fetcher));
    const factory=vi.fn(async():Promise<CadViewerAdapter>=>({load:vi.fn(),dispose:vi.fn(),fitToView:vi.fn(),zoomIn:vi.fn(),zoomOut:vi.fn()}));
    const source=new ViewerSource();
    await expect(new ViewerManager(factory,source).load('/source','DXF')).rejects.toMatchObject({stage:'source',reasonCode:item.reasonCode});
    expect(factory).not.toHaveBeenCalled();
    expect(source.state('/source')).toBe('miss');
  }
});
