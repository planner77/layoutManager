import {expect,test} from 'vitest';
import {collectMemoSnapCandidates,type MemoSnapTarget} from '../../domain/memo-session-snap';
import {makeMemoSnapIntent,chooseMemoSnap,memoSnapIntentPoint,resolveMemoSnapIntent} from '../../domain/memo-snap-intent';

const scope={versionId:'123e4567-e89b-42d3-a456-426614174000',sourceSha256:'a'.repeat(64)};
const target:MemoSnapTarget={ref:{...scope,origin:'RENDER',id:'instance-a'},visible:true,
  transform:[1,0,0,1,0,0],points:[
    {kind:'ENDPOINT',world:{x:0,y:0}},{kind:'VERTEX',world:{x:0.5,y:0}},
  ]};
const collect=(targets:readonly MemoSnapTarget[]=[target])=>
  collectMemoSnapCandidates(scope,{x:0.1,y:0},targets,p=>({x:p.x*10,y:p.y*10}));

test('manual second candidate stays selected even when nearest is a different point',()=>{
  const choices=collect();
  const intent=chooseMemoSnap(makeMemoSnapIntent('viewer-a',1,{x:0.1,y:0},choices),choices.candidates[1].key);
  const resolved=resolveMemoSnapIntent(intent,'viewer-a',1,collect());
  expect(resolved.snap?.key).toBe(choices.candidates[1].key);
  expect(resolved.world).toEqual({x:0.5,y:0});
});

test('explicit OFF restores requested WCS rather than retaining the nearest snapped point',()=>{
  const intent=chooseMemoSnap(makeMemoSnapIntent('viewer-a',1,{x:0.1,y:0},collect()),null);
  expect(memoSnapIntentPoint(intent)).toEqual({x:0.1,y:0});
  expect(resolveMemoSnapIntent(intent,'viewer-a',1,collect([]))).toEqual({world:{x:0.1,y:0},snap:null});
});

test('a camera, Viewer, hidden target or same-key geometry change requires re-selection',()=>{
  const intent=makeMemoSnapIntent('viewer-a',1,{x:0.1,y:0},collect());
  expect(()=>resolveMemoSnapIntent(intent,'viewer-b',1,collect())).toThrow('다시 조회');
  expect(()=>resolveMemoSnapIntent(intent,'viewer-a',2,collect())).toThrow('다시 조회');
  expect(()=>resolveMemoSnapIntent(intent,'viewer-a',1,collect([{...target,visible:false}]))).toThrow('다시 조회');
  expect(()=>resolveMemoSnapIntent(intent,'viewer-a',1,collect([{...target,points:[
    {kind:'ENDPOINT',world:{x:0.2,y:0}},...target.points.slice(1),
  ]}]))).toThrow('다시 조회');
});

test('snapshot isolates adapter arrays and rejects a changed target matrix',()=>{
  const choices=collect(),intent=makeMemoSnapIntent('viewer-a',1,{x:0.1,y:0},choices);
  expect(intent.selected?.world).not.toBe(choices.candidates[0].world);
  expect(intent.selected?.transform).not.toBe(choices.candidates[0].transform);
  expect(()=>resolveMemoSnapIntent(intent,'viewer-a',1,collect([{...target,transform:[1,0,0,1,1,0]}]))).toThrow('다시 조회');
  expect(()=>chooseMemoSnap(intent,'not-a-candidate')).toThrow('다시 조회');
});

test('prepared authenticated choice cannot be confirmed by another current actor',()=>{
  const intent=makeMemoSnapIntent('same-viewer',1,{x:0.1,y:0},collect(),'actor-a');
  expect(()=>resolveMemoSnapIntent(intent,'same-viewer',1,collect(),'actor-b')).toThrow('계정');
  expect(resolveMemoSnapIntent(intent,'same-viewer',1,collect(),'actor-a').snap?.key).toBe(intent.selected?.key);
});
