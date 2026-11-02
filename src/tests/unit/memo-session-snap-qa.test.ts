import {randomUUID} from 'node:crypto';
import {expect,test} from 'vitest';
import {MemoSessionSnapStore,collectMemoSnapCandidates,currentMemoSnapChoice,
 type MemoSnapTarget} from '../../domain/memo-session-snap';

const scope={versionId:'123e4567-e89b-42d3-a456-426614174000',sourceSha256:'f'.repeat(64)};
const project=(p:{x:number;y:number})=>p;
const target:MemoSnapTarget={ref:{...scope,origin:'GENERATED',id:'generated-1'},
 transform:[1,0,0,1,0,0],visible:true,
 points:[{kind:'VERTEX',world:{x:1,y:2}}]};

test('R4 QA: a selected candidate becomes stale when its point, immutable target or scope changes',()=>{
 const set=collectMemoSnapCandidates(scope,{x:1,y:2},[target],project);
 const choice=set.candidates[0];
 expect(currentMemoSnapChoice(scope,choice,[target])).toBe(true);
 expect(currentMemoSnapChoice(scope,choice,[{...target,
  points:[{kind:'VERTEX',world:{x:1,y:3}}]}])).toBe(false);
 expect(currentMemoSnapChoice(scope,choice,[{...target,ref:{...target.ref,id:'generated-replaced'}}])).toBe(false);
 expect(currentMemoSnapChoice({...scope,versionId:'223e4567-e89b-42d3-a456-426614174000'},choice,[target])).toBe(false);
 expect(currentMemoSnapChoice(scope,{...choice,key:'forged-choice-key'},[target])).toBe(false);
});

test('R4 QA: a session snap store rejects binding 101 without changing its first 100 bindings',()=>{
 const store=new MemoSessionSnapStore(scope),ids:string[]=[];
 for(let index=0;index<100;index++){
  const memoId=randomUUID();ids.push(memoId);
  store.attach(memoId,{ref:{...scope,origin:'GENERATED',id:'generated-'+index},
   transform:[1,0,0,1,0,0],kind:'VERTEX',world:{x:index,y:index},distancePx:0});
 }
 expect(store.hasBindings()).toBe(true);
 const lastBefore=store.get(ids[99]);
 const overLimit=randomUUID();
 expect(()=>store.attach(overLimit,{ref:{...scope,origin:'GENERATED',id:'generated-101'},
  transform:[1,0,0,1,0,0],kind:'VERTEX',world:{x:101,y:101},distancePx:0}))
  .toThrow('세션 스냅은 메모 최대 100개까지만 허용됩니다.');
 expect(store.get(overLimit)).toBeNull();
 expect(store.get(ids[99])).toEqual(lastBefore);
 expect(store.reconcile(ids.map((_,index)=>({...target,ref:{...scope,origin:'GENERATED',id:'generated-'+index},
  transform:[1,0,0,1,0,0],visible:true,points:[]})))[ids[99]]).toMatchObject({mode:'ATTACHED'});
});
