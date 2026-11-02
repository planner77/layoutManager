import {afterEach,expect,it,vi} from 'vitest';
import {MemoSessionSnapStore,type MemoSnapTarget} from '../../domain/memo-session-snap';
import {EMPTY_MEMO_SETTINGS} from '../../domain/memo-schedule';
import type {PersistedMemoDraft} from '../../domain/cad-memo';
import {captureExchangeMemoVisuals,composeExchangeMemos,exchangeMemoVisualFingerprint} from '../../features/cad-viewer/exchange-memo-visual';
import {decodeExchangeMemos,readExchangeMemos,exchangeServerMemoFingerprint,assertExchangeServerMemosUnchanged} from '../../features/cad-viewer/exchange-memo-authority';
import {defaultExchangeMemoHeight} from '../../features/cad-viewer/exchange-defaults';
import type {ExchangeSnapshot} from '../../domain/cad-exchange';
const versionId='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222';
const id='33333333-3333-4333-8333-333333333333',otherId='44444444-4444-4444-8444-444444444444';
const scope={versionId,sourceSha256:'a'.repeat(64),sourceUnit:'DXF_INSUNITS_4'};
const identity={runtime:'ACTIVE' as const,actorId:actor};
const key='memo-server:'+id;
const selection={enabled:true,mode:'selected' as const,ids:[key]};
function row(memoId=id):PersistedMemoDraft{return {id:memoId,...scope,anchorWcsXY:{x:1,y:2},labelOffset:{x:14,y:-12},
  title:'한글 메모',content:'Line one\n둘째 줄',textFormat:'plain',createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',
  persisted:true,revision:0,createdById:actor,updatedById:actor,anchor:{mode:'FREE'},...EMPTY_MEMO_SETTINGS};}
function packet(memos=[row()]){return {actorId:actor,versionId,sourceSha256:scope.sourceSha256,sceneRevision:0,
  memos,groups:[],featuresAvailable:true};}
function store(){
  const value=new MemoSessionSnapStore(scope),ref={...scope,origin:'RENDER' as const,id:'render-target'};
  value.attach(id,{ref,transform:[1,0,0,1,0,0],kind:'ENDPOINT',world:{x:1,y:2},distancePx:0});
  const target:MemoSnapTarget={ref,transform:[1,0,0,1,10,20],visible:true,points:[]};
  return {value,target};
}
afterEach(()=>vi.unstubAllGlobals());
it('automatic text height uses selected double-precision metre extent, bounds and an explicit memo-only fallback',()=>{
  const empty:ExchangeSnapshot={inventory:{scope,snapshotToken:'token',layers:[],objects:[],warnings:[],sourceCoverage:'unknown',sourceEntityCount:null},
    selection:{dxf:{enabled:false,mode:'all',layers:[]},generated:{enabled:false,mode:'all',keys:[]},memos:{enabled:true,mode:'all',ids:[]}},primitives:[],generated:[]};
  expect(defaultExchangeMemoHeight(empty,'mm')).toBe(0.1);
  const withPolygon=(extent:number):ExchangeSnapshot=>({...empty,generated:[{key:'local:shape',origin:'LOCAL_GENERATED',name:'Selected',
    geometry:{type:'Polygon',coordinates:[[[1e9,2e9],[1e9+extent,2e9],[1e9+extent,2e9+extent],[1e9,2e9]]]}}]});
  expect(defaultExchangeMemoHeight(withPolygon(100),'auto')).toBe(0.01);
  expect(defaultExchangeMemoHeight(withPolygon(30),'m')).toBe(0.5);
  expect(defaultExchangeMemoHeight(withPolygon(1000),'inch')).toBeCloseTo(25.4/60,12);
  expect(defaultExchangeMemoHeight(withPolygon(1e6),'mm')).toBe(1);
  expect(()=>defaultExchangeMemoHeight({...empty,inventory:{...empty.inventory,scope:{...scope,sourceUnit:'DXF_INSUNITS_0'}}},'auto')).toThrow('단위');
});
it('export snapshots never advance lastWorld, share mutable bindings, or alter later BROKEN behavior',()=>{
  const {value,target}=store(),before=JSON.stringify(value.get(id));
  for(let n=0;n<3;n++)expect(value.snapshot([target])[id]).toMatchObject({mode:'ATTACHED',world:{x:11,y:22}});
  expect(JSON.stringify(value.get(id))).toBe(before);
  expect(value.snapshot([])[id]).toMatchObject({mode:'BROKEN_ANCHOR',world:{x:1,y:2}});
  expect(value.snapshot([{...target,transform:[0,0,0,0,10,20]}])[id].world).toEqual({x:1,y:2});
  const observed=value.snapshot([target])[id];
  Object.assign(observed.ref,{id:'mutated'});Object.assign(observed.local,{x:999});Object.assign(observed.world,{x:999});
  expect(JSON.stringify(value.get(id))).toBe(before);
  value.reconcile([target]);expect(value.snapshot([])[id].world).toEqual({x:11,y:22});
  value.breakOrigin('RENDER');const broken=JSON.stringify(value.get(id));
  expect(value.snapshot([target])[id]).toMatchObject({mode:'BROKEN_ANCHOR',world:{x:11,y:22}});
  expect(JSON.stringify(value.get(id))).toBe(broken);
});
it('a server revision0 exports the same-revision current session projection through an explicit whitelist',()=>{
  const {value,target}=store(),record=row();
  const visual=captureExchangeMemoVisuals(scope,[record],value.snapshot([target]),'generation',1);
  const result=composeExchangeMemos(visual,[record],selection);
  expect(result[0]).toMatchObject({key,revision:0,anchorMode:'SESSION',anchorWcs:{x:11,y:22,z:0}});
  const json=JSON.stringify(result);
  for(const forbidden of ['createdById','updatedById','labelOffset','targetRef','render-target','SESSION_ONLY',actor])expect(json).not.toContain(forbidden);
  expect(value.get(id)?.world).toEqual({x:1,y:2});
});
it.each(['revision','content'] as const)('a changed fresh %s cannot be attached to an old session projection',field=>{
  const {value,target}=store(),record=row(),visual=captureExchangeMemoVisuals(scope,[record],value.snapshot([target]),'generation',1);
  const changed=field==='revision'?{...record,revision:1}:{...record,content:'Edited without revision'};
  expect(()=>composeExchangeMemos(visual,[changed],selection)).toThrow('새로 조회');
});
it('fresh unbound server rows use canonical WCS and explicitly selected hidden rows are retained',()=>{
  const visual=captureExchangeMemoVisuals(scope,[],{},'generation',1),record={...row(),visible:false};
  expect(composeExchangeMemos(visual,[record],selection)[0]).toMatchObject({anchorMode:'CANONICAL',anchorWcs:{x:1,y:2,z:0}});
  expect(()=>composeExchangeMemos(visual,[record],{...selection,ids:[key,key]})).toThrow();
  expect(()=>composeExchangeMemos(visual,[record],{...selection,ids:['memo-server:'+otherId]})).toThrow();
});
it('BROKEN session bindings retain the last committed world without silently returning to canonical',()=>{
  const {value,target}=store(),record=row();value.reconcile([target]);
  const visual=captureExchangeMemoVisuals(scope,[record],value.snapshot([]),'generation',1);
  expect(composeExchangeMemos(visual,[record],selection)[0]).toMatchObject({anchorMode:'BROKEN',broken:true,anchorWcs:{x:11,y:22,z:0}});
});
it('selected visual proof ignores unrelated Memo changes but detects selected world and generation changes',()=>{
  const first=row(),other=row(otherId);
  const before=captureExchangeMemoVisuals(scope,[first,other],{},'generation',1);
  const unrelated=captureExchangeMemoVisuals(scope,[first,{...other,title:'Unselected edit'}],{},'generation',1);
  expect(exchangeMemoVisualFingerprint(before,[key])).toBe(exchangeMemoVisualFingerprint(unrelated,[key]));
  const moved=captureExchangeMemoVisuals(scope,[{...first,anchorWcsXY:{x:3,y:4}},other],{},'generation',1);
  expect(exchangeMemoVisualFingerprint(before,[key])).not.toBe(exchangeMemoVisualFingerprint(moved,[key]));
  expect(exchangeMemoVisualFingerprint(before,[key])).not.toBe(exchangeMemoVisualFingerprint({...before,targetEpoch:2},[key]));
  expect(composeExchangeMemos(before,[],{enabled:false,mode:'all',ids:[]})).toEqual([]);
});
it('Memo GET actual actor and scope envelopes reject A-to-B-to-A substitution and legacy missing proof',()=>{
  expect(decodeExchangeMemos(packet(),scope,identity).rows[0].revision).toBe(0);
  expect(()=>decodeExchangeMemos({...packet(),actorId:otherId},scope,identity)).toThrow('변경');
  expect(()=>decodeExchangeMemos({...packet(),actorId:undefined},scope,identity)).toThrow('변경');
  expect(()=>decodeExchangeMemos({...packet(),sourceSha256:'b'.repeat(64)},scope,identity)).toThrow('변경');
  expect(()=>decodeExchangeMemos(packet(),scope,{runtime:'ACTIVE',actorId:null})).toThrow('변경');
});
it('Memo decoder rejects duplicate IDs, foreign rows, unbounded pages, and invalid revisions',()=>{
  for(const value of [packet([row(),row()]),packet([{...row(),versionId:otherId}]),
    packet([{...row(),revision:-1}]),packet(Array.from({length:101},()=>row())),{...packet(),sceneRevision:undefined}])
    expect(()=>decodeExchangeMemos(value,scope,identity)).toThrow();
});
function fetcher(memoResponse:()=>Response|Promise<Response>,actorAfter=actor){
  let memoRequested=false;
  return vi.fn(async(url:string)=>{
    if(url.endsWith('/status'))return Response.json({state:'ACTIVE'});
    if(url.endsWith('/session'))return Response.json({actor:{id:memoRequested?actorAfter:actor}});
    memoRequested=true;return memoResponse();
  });
}
it('stable denied Memo group is an explicit group error while actor continuity remains known',async()=>{
  const get=fetcher(()=>Response.json({},{status:403}));vi.stubGlobal('fetch',get);
  await expect(readExchangeMemos(scope,identity,new AbortController().signal)).rejects.toMatchObject({kind:'server'});
  expect(get.mock.calls.filter(call=>call[0].endsWith('/memos'))).toHaveLength(1);
});
it('actor changes while Memo GET is pending invalidate the whole private proof',async()=>{
  vi.stubGlobal('fetch',fetcher(()=>Response.json(packet()),otherId));
  await expect(readExchangeMemos(scope,identity,new AbortController().signal)).rejects.toMatchObject({kind:'identity'});
});
it.each(['network','json'])('a failed %s Memo response never becomes a cached or empty success',async failure=>{
  vi.stubGlobal('fetch',fetcher(()=>{
    if(failure==='network')throw new TypeError('Network failed');
    return new Response('{',{status:200});
  }));
  await expect(readExchangeMemos(scope,identity,new AbortController().signal)).rejects.toMatchObject({kind:'server'});
});
it('final selected server recheck detects changed row content and respects selected-only versus all scope',async()=>{
  const before=decodeExchangeMemos(packet([row(),row(otherId)]),scope,identity);
  const changed=decodeExchangeMemos(packet([row(),{...row(otherId),revision:1}]),scope,identity);
  expect(exchangeServerMemoFingerprint(before,[key])).toBe(exchangeServerMemoFingerprint(changed,[key]));
  expect(exchangeServerMemoFingerprint(before)).not.toBe(exchangeServerMemoFingerprint(changed));
  vi.stubGlobal('fetch',fetcher(()=>Response.json(packet([{...row(),content:'Changed'}]))));
  await expect(assertExchangeServerMemosUnchanged(before,[key],new AbortController().signal)).rejects.toThrow('변경');
});
