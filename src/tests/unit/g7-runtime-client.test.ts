import { afterEach, describe, expect, test, vi } from 'vitest';
import { runtimeCadHeaders, runtimeJson, RuntimeClientError } from '../../features/g7-runtime/client';
afterEach(() => vi.unstubAllGlobals());
describe('runtime CAD browser request integration', () => {
  test('OFF preserves legacy mutation headers and discards any stale supplied CSRF', async () => {
    const fetcher=vi.fn().mockResolvedValue(Response.json({state:'OFF',authEnabled:false,cadWriteEnabled:false}));
    vi.stubGlobal('fetch',fetcher);
    const headers=await runtimeCadHeaders({'Content-Type':'application/json','x-csrf-token':'stale'});
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.has('x-csrf-token')).toBe(false);
    expect(fetcher).toHaveBeenCalledWith('/api/g7-runtime/status',expect.objectContaining({cache:'no-store',credentials:'same-origin'}));
  });
  test('each mutation refreshes proof, so a revoked session cannot reuse earlier success', async () => {
    const fetcher=vi.fn()
      .mockResolvedValueOnce(Response.json({state:'ACTIVE',authEnabled:true,cadWriteEnabled:true}))
      .mockResolvedValueOnce(Response.json({csrfToken:'current-proof',runtime:{cadWriteEnabled:true}}))
      .mockResolvedValueOnce(Response.json({state:'ACTIVE',authEnabled:true,cadWriteEnabled:true}))
      .mockResolvedValueOnce(new Response('{}',{status:401}));
    vi.stubGlobal('fetch',fetcher);
    expect((await runtimeCadHeaders()).get('x-csrf-token')).toBe('current-proof');
    await expect(runtimeCadHeaders()).rejects.toMatchObject({code:'UNAUTHENTICATED',status:401});
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  test('Auth-only approval and malformed session cannot dispatch writes', async () => {
    const fetcher=vi.fn()
      .mockResolvedValueOnce(Response.json({state:'ACTIVE',authEnabled:true,cadWriteEnabled:false}))
      .mockResolvedValueOnce(Response.json({state:'ACTIVE',authEnabled:true,cadWriteEnabled:true}))
      .mockResolvedValueOnce(Response.json({runtime:{cadWriteEnabled:true}}));
    vi.stubGlobal('fetch',fetcher);
    await expect(runtimeCadHeaders()).rejects.toThrow('비활성화');
    await expect(runtimeCadHeaders()).rejects.toThrow('세션');
  });
  test('blocked gate and network failure do not fall back to legacy', async () => {
    const fetcher=vi.fn().mockResolvedValueOnce(new Response('{}',{status:503})).mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch',fetcher);
    await expect(runtimeCadHeaders()).rejects.toThrow('운영 인증');
    await expect(runtimeCadHeaders()).rejects.toThrow('운영 인증 상태');
  });
  test('management JSON requests use fresh proof without placing credentials into URL', async () => {
    const fetcher=vi.fn().mockResolvedValue(Response.json({ok:true}));vi.stubGlobal('fetch',fetcher);
    await runtimeJson('access/grant',{kind:'role',value:'Reader'},'proof');
    const [url,init]=fetcher.mock.calls[0];
    expect(url).toBe('/api/g7-runtime/access/grant');
    expect(init.method).toBe('POST');
    expect(init.headers.get('x-csrf-token')).toBe('proof');
    expect(JSON.parse(init.body)).toEqual({kind:'role',value:'Reader'});
    expect(init.cache).toBe('no-store');
  });
  test('server errors are rendered by safe code rather than server-provided sensitive message', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({error:{code:'ACCESS_DENIED',message:'private metadata'}},{status:403})));
    await expect(runtimeJson('users/create',{})).rejects.toBeInstanceOf(RuntimeClientError);
    await expect(runtimeJson('users/create',{})).rejects.not.toThrow('private metadata');
  });
});
