import {describe,expect,it} from 'vitest';
import {decideSingleWorkerAction,singleSceneJobKey} from '../../domain/scene-single-worker-admission';

const sha='AB'.repeat(32);
const identity={versionId:'version-001',sourceSha256:sha,builder:'cpu-dxf-v2',payloadSchema:2 as const};
const row=(overrides:Record<string,unknown>={})=>({
 status:'QUEUED' as const,attempt:0,dueAtMs:null,startedAtMs:null,...overrides
});

describe('#225/P1-B1 single CPU Worker admission and recovery policy',()=>{
 it('creates a canonical idempotency tuple and rejects malformed/ambiguous identifiers',()=>{
   expect(singleSceneJobKey(identity))
     .toBe(JSON.stringify(['version-001',sha.toLowerCase(),'cpu-dxf-v2',2]));
   expect(singleSceneJobKey({...identity,sourceSha256:sha.toLowerCase()})).toBe(singleSceneJobKey(identity));
   expect(singleSceneJobKey({...identity,builder:'builder:with:separator'}))
     .not.toBe(singleSceneJobKey(identity));
   expect(()=>singleSceneJobKey({...identity,sourceSha256:'bad'})).toThrow('SCENE_JOB_IDENTITY_INVALID');
   expect(()=>singleSceneJobKey({...identity,versionId:'bad\nline'})).toThrow();
   expect(()=>singleSceneJobKey({...identity,payloadSchema:1 as 2})).toThrow();
 });
 it('admits exactly due QUEUED jobs and never claims a non-due item',()=>{
   expect(decideSingleWorkerAction(row(),1_000)).toEqual({kind:'CLAIM'});
   expect(decideSingleWorkerAction(row({dueAtMs:1_001}),1_000)).toEqual({kind:'WAIT'});
   expect(decideSingleWorkerAction(row({dueAtMs:1_000}),1_000)).toEqual({kind:'CLAIM'});
 });
 it('requeues eligible retry jobs but rejects exhausted claims',()=>{
   expect(decideSingleWorkerAction(row({status:'RETRY_WAIT',attempt:1,dueAtMs:1_000}),1_000))
     .toEqual({kind:'REQUEUE'});
   expect(decideSingleWorkerAction(row({status:'RETRY_WAIT',attempt:3}),2_000))
     .toEqual({kind:'FAIL_TIMEOUT'});
 });
 it('detects a stale active job and schedules bounded retry, not duplicate execution',()=>{
   expect(decideSingleWorkerAction(row({status:'RUNNING',attempt:1,startedAtMs:100}),200,100))
     .toEqual({kind:'SCHEDULE_RETRY',nextRunAtMs:30_200});
   expect(decideSingleWorkerAction(row({status:'RUNNING',attempt:1,startedAtMs:100}),199,100))
     .toEqual({kind:'WAIT'});
   expect(decideSingleWorkerAction(row({status:'RUNNING',attempt:3,startedAtMs:100}),200,100))
     .toEqual({kind:'FAIL_TIMEOUT'});
 });
 it('cannot revive completed jobs or infer verified Scene READY',()=>{
   for(const status of ['READY','FAILED','BLOCKED'] as const)
     expect(decideSingleWorkerAction(row({status}),1_000)).toEqual({kind:'TERMINAL'});
 });
 it('rejects corrupt timestamps, attempts and RUNNING states before any claim',()=>{
   expect(()=>decideSingleWorkerAction(row({attempt:-1}),1_000)).toThrow();
   expect(()=>decideSingleWorkerAction(row({dueAtMs:NaN}),1_000)).toThrow();
   expect(()=>decideSingleWorkerAction(row({startedAtMs:1}),1_000)).toThrow();
   expect(()=>decideSingleWorkerAction(row({status:'RUNNING',attempt:0,startedAtMs:1}),1_000)).toThrow();
   expect(()=>decideSingleWorkerAction(row({status:'RUNNING',attempt:1,startedAtMs:1_001}),1_000)).toThrow();
   expect(()=>decideSingleWorkerAction(row(),-1)).toThrow();
   expect(()=>decideSingleWorkerAction(row(),1_000,0)).toThrow();
 });
});
