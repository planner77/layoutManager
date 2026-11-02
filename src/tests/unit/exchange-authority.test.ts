import {afterEach,expect,it,vi} from 'vitest';
import {readExchangeIdentity,readExchangeOutlines,assertExchangeIdentity,assertExchangeServerUnchanged,
  exchangeServerFingerprint} from '../../features/cad-viewer/exchange-authority';
import type {StoredOutlineDto} from '../../domain/typed-outline';
const versionId='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222';
const scope={versionId,sourceSha256:'a'.repeat(64),sourceUnit:'DXF_INSUNITS_4'};
const signal=()=>new AbortController().signal;
function row(id='33333333-3333-4333-8333-333333333333'):StoredOutlineDto{
  const geometry:StoredOutlineDto['geometry']={type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,0]]]};
  return {id,versionId,sourceSha256:scope.sourceSha256,sceneRevision:0,origin:'APP_CREATED',
    validationMode:'APP_CREATED',kind:'CONVEX',name:'Selected',geometry,baseGeometry:geometry,
    sourceRefs:[],derivedFrom:[],operations:[],outlineTypeId:null,outlineType:null,
    createdById:actor,updatedById:actor,createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',revision:0};
}
afterEach(()=>vi.unstubAllGlobals());
it.each(['OFF','BLOCKED'] as const)('keeps %s local data usable without protected requests',async state=>{
  const fetcher=vi.fn(async()=>Response.json({state}));vi.stubGlobal('fetch',fetcher);
  const proof=await readExchangeIdentity(signal());expect(proof).toEqual({runtime:state,actorId:null});
  await expect(readExchangeOutlines(scope,proof,signal())).rejects.toThrow('조회 권한');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('keeps active anonymous Source/local work usable and never probes protected outlines',async()=>{
  const fetcher=vi.fn(async(url:string)=>url.endsWith('/status')?Response.json({state:'ACTIVE'}):Response.json({}, {status:401}));
  vi.stubGlobal('fetch',fetcher);
  const proof=await readExchangeIdentity(signal());expect(proof.actorId).toBeNull();
  await expect(readExchangeOutlines(scope,proof,signal())).rejects.toThrow('조회 권한');
  expect(fetcher.mock.calls.map(call=>call[0])).toEqual(['/api/g7-runtime/status','/api/g7-runtime/auth/session']);
});
it('proves the active account without a protected read until the server group is requested',async()=>{
  const fetcher=vi.fn(async(url:string)=>url.endsWith('/status')?Response.json({state:'ACTIVE'}):Response.json({actor:{id:actor}}));
  vi.stubGlobal('fetch',fetcher);
  expect(await readExchangeIdentity(signal())).toEqual({runtime:'ACTIVE',actorId:actor});
  expect(fetcher.mock.calls.map(call=>call[0])).toEqual(['/api/g7-runtime/status','/api/g7-runtime/auth/session']);
});
it('keeps a stable local identity when the selected server group is denied',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    if(url.endsWith('/status'))return Response.json({state:'ACTIVE'});
    if(url.endsWith('/session'))return Response.json({actor:{id:actor}});
    return Response.json({error:{code:'SITE_DENIED',message:'이 도면의 조회 권한이 없습니다.'}},{status:403});
  }));
  const identity=await readExchangeIdentity(signal());
  await expect(readExchangeOutlines(scope,identity,signal())).rejects.toMatchObject({kind:'server'});
  expect(await readExchangeIdentity(signal())).toEqual(identity);
});
it.each(['network','json'])('fails closed with an identity error after a %s session-proof failure',async failure=>{
  let broken=false;
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    if(url.endsWith('/status'))return Response.json({state:'ACTIVE'});
    if(broken){if(failure==='network')throw new TypeError('synthetic offline');return new Response('{');}
    return Response.json({actor:{id:actor}});
  }));
  const identity=await readExchangeIdentity(signal());broken=true;
  await expect(assertExchangeIdentity(identity,signal())).rejects.toMatchObject({kind:'identity'});
});
it('preserves cancellation without making a later identity request',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const controller=new AbortController();controller.abort();
  await expect(readExchangeIdentity(controller.signal)).rejects.toMatchObject({name:'AbortError'});
  expect(fetcher).not.toHaveBeenCalled();
});
it('rechecks selected content and current Scene with fresh GETs, including type/name changes',async()=>{
  let selected=row(),sceneRevision=0;
  const fetcher=vi.fn(async(url:string)=>{
    if(url.endsWith('/status'))return Response.json({state:'ACTIVE'});
    if(url.endsWith('/auth/session'))return Response.json({actor:{id:actor}});
    return Response.json({actorId:actor,versionId,sourceSha256:scope.sourceSha256,sceneRevision,
      canWrite:false,total:1,offset:0,limit:100,outlines:[selected]});
  });vi.stubGlobal('fetch',fetcher);
  const identity=await readExchangeIdentity(signal()),prepared=await readExchangeOutlines(scope,identity,signal());
  await expect(assertExchangeServerUnchanged(prepared,[selected.id],signal())).resolves.toBeUndefined();
  selected={...selected,name:'Renamed without a revision change'};
  await expect(assertExchangeServerUnchanged(prepared,[selected.id],signal())).rejects.toThrow('다시 확인');
  selected=row();sceneRevision=1;
  await expect(assertExchangeServerUnchanged(prepared,[selected.id],signal())).rejects.toThrow('다시 확인');
  for(const call of fetcher.mock.calls)expect(call[0]).not.toContain('/content');
});
it('discards an authorized row response when the account changed while it was in flight',async()=>{
  let current=actor;
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    if(url.endsWith('/status'))return Response.json({state:'ACTIVE'});
    if(url.endsWith('/session'))return Response.json({actor:{id:current}});
    current='44444444-4444-4444-8444-444444444444';
    return Response.json({actorId:actor,versionId,sourceSha256:scope.sourceSha256,sceneRevision:0,
      canWrite:false,total:1,offset:0,limit:100,outlines:[row()]});
  }));
  const identity=await readExchangeIdentity(signal());
  await expect(readExchangeOutlines(scope,identity,signal())).rejects.toThrow('다시 확인');
});
it('binds all-mode to the full row set and rejects missing or duplicate selected identifiers',()=>{
  const first=row(),second=row('55555555-5555-4555-8555-555555555555');
  const original={scope,identity:{runtime:'ACTIVE' as const,actorId:actor},sceneRevision:0,rows:[first,second]};
  const changed={...original,rows:[first,{...second,name:'Other row renamed'}]};
  expect(exchangeServerFingerprint(changed,[first.id])).toBe(exchangeServerFingerprint(original,[first.id]));
  expect(exchangeServerFingerprint(changed)).not.toBe(exchangeServerFingerprint(original));
  expect(()=>exchangeServerFingerprint(original,['missing'])).toThrow();
  expect(()=>exchangeServerFingerprint(original,[first.id,first.id])).toThrow();
});
