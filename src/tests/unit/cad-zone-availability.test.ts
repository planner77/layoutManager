import {afterEach,describe,expect,it,vi} from 'vitest';
import {probeZoneAvailability,readZones,ZoneRequestError} from '../../features/cad-viewer/cad-zone-client';

const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;vi.restoreAllMocks();});

describe('PR200 public Zone status preflight',()=>{
 it('recognizes the exact OFF envelope without protected Zone GET',async()=>{
  const fetch=vi.fn(async(url:string)=>{
   if(url!=='/api/g7-runtime/status')throw new Error('Protected Zone GET was attempted while OFF');
   return Response.json({state:'OFF',authEnabled:false,cadWriteEnabled:false});
  });
  globalThis.fetch=fetch as unknown as typeof globalThis.fetch;
  expect(await probeZoneAvailability()).toBe('OFF');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('/api/g7-runtime/status');
 });
 it('allows ACTIVE Reader metadata lookup with write disabled; GET still supplies authority',async()=>{
  const fetch=vi.fn(async(url:string)=>url==='/api/g7-runtime/status'
   ?Response.json({state:'ACTIVE',authEnabled:true,cadWriteEnabled:false})
   :Response.json({actorId:'reader',zones:[],categories:[],canEdit:false,versionId:'version'}));
  globalThis.fetch=fetch as unknown as typeof globalThis.fetch;
  expect(await probeZoneAvailability()).toBe('ACTIVE');
  expect((await readZones('version')).actorId).toBe('reader');
  expect(fetch.mock.calls.map(call=>call[0])).toEqual(['/api/g7-runtime/status','/api/cad-files/version/zones']);
 });
 it('rejects BLOCKED, ambiguous, and failed status instead of assuming OFF or authorization',async()=>{
  for(const body of [{state:'BLOCKED',authEnabled:false,cadWriteEnabled:false},{state:'OFF',authEnabled:true,cadWriteEnabled:false}]){
   globalThis.fetch=vi.fn(async()=>Response.json(body)) as unknown as typeof globalThis.fetch;
   await expect(probeZoneAvailability()).rejects.toBeInstanceOf(ZoneRequestError);
  }
  globalThis.fetch=vi.fn(async()=>new Response(null,{status:503})) as unknown as typeof globalThis.fetch;
  await expect(probeZoneAvailability()).rejects.toMatchObject({code:'STATUS_UNAVAILABLE',status:503});
 });
});
