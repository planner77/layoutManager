import { afterEach, describe, expect, test, vi } from 'vitest';
import { g7CadWriteHeaders } from '../../features/g7-operational/write-auth';

afterEach(()=>vi.unstubAllGlobals());
describe('#109 S2 gated CAD browser session/CSRF',()=>{
  test('default OFF never calls an Auth endpoint or adds a header',async()=>{
    const call=vi.fn();
    vi.stubGlobal('fetch',call);
    vi.stubGlobal('document',{documentElement:{dataset:{g7Operational:'false'}}});
    expect(await g7CadWriteHeaders()).toEqual({});
    expect(call).not.toHaveBeenCalled();
  });
  test('valid private S3 UI flag reads session and binds only CSRF proof',async()=>{
    const csrf='a'.repeat(43);
    const call=vi.fn().mockResolvedValue({
      ok:true,json:async()=>({actor:{id:'user-local'},csrfToken:csrf}),
    });
    vi.stubGlobal('document',{documentElement:{dataset:{g7Operational:'true'}}});
    vi.stubGlobal('fetch',call);
    expect(await g7CadWriteHeaders()).toEqual({'x-csrf-token':csrf});
    expect(call.mock.calls[0][0]).toBe('/api/g7-operation/auth/session');
  });
  test('missing/invalid session never silently falls back to anonymous CAD write',async()=>{
    vi.stubGlobal('document',{documentElement:{dataset:{g7Operational:'true'}}});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:401}));
    await expect(g7CadWriteHeaders()).rejects.toThrow();
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({
      ok:true,json:async()=>({csrfToken:'bad-token'}),
    }));
    await expect(g7CadWriteHeaders()).rejects.toThrow();
  });
});
