/** #225 / P1-B1: pure, fail-closed single-Worker scheduling contract.
 * Production queue ownership is established by a future atomic DB claim.
 * This module never creates a Scene, skips G7 authorization, or marks READY.
 */
import {sceneRetryDelayMs, type SceneBuildStatus} from './scene-build-job';

export type SceneJobIdentity = Readonly<{
  versionId:string;
  sourceSha256:string;
  builder:string;
  payloadSchema:2;
}>;

/** Canonical, collision-free tuple. Storage enforces the same four-part UNIQUE key. */
export function singleSceneJobKey(value:SceneJobIdentity):string{
  const clean=(input:unknown,max:number):input is string =>
    typeof input==='string' && input.length>0 && input.length<=max &&
    !/[\u0000-\u001f\u007f]/.test(input);
  if(!clean(value.versionId,128) || !clean(value.builder,128) ||
     typeof value.sourceSha256!=='string' || !/^[0-9a-fA-F]{64}$/.test(value.sourceSha256) ||
     value.payloadSchema!==2)throw new Error('SCENE_JOB_IDENTITY_INVALID');
  return JSON.stringify([value.versionId,value.sourceSha256.toLowerCase(),value.builder,2]);
}

export type SingleJobSnapshot=Readonly<{
  status:SceneBuildStatus;
  /** Number of attempts already claimed, not including the next attempt. */
  attempt:number;
  /** Null means immediately due for QUEUED; otherwise absolute epoch milliseconds. */
  dueAtMs:number|null;
  /** Set when RUNNING was claimed; null for all other states. */
  startedAtMs:number|null;
}>;

export type SingleWorkerDecision=
  | Readonly<{kind:'CLAIM'|'REQUEUE'|'WAIT'|'TERMINAL'|'FAIL_TIMEOUT'}>
  | Readonly<{kind:'SCHEDULE_RETRY';nextRunAtMs:number}>;

/** Pure decision only. A DB adapter must update status with CAS inside a transaction.
 * WAIT never starts another job; READY is authoritative only after SceneRepository.status().
 */
export function decideSingleWorkerAction(
  job:SingleJobSnapshot,
  nowMs:number,
  timeoutMs=180_000,
  maxAttempts=3,
):SingleWorkerDecision{
  const timestamp=(v:unknown):v is number =>
    typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
  if(!timestamp(nowMs)||!timestamp(timeoutMs)||timeoutMs===0||
     !Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>10||
     !Number.isSafeInteger(job.attempt)||job.attempt<0||job.attempt>maxAttempts||
     job.dueAtMs!==null&&!timestamp(job.dueAtMs)||
     job.startedAtMs!==null&&!timestamp(job.startedAtMs))
    throw new Error('SCENE_JOB_CLOCK_OR_ATTEMPT_INVALID');

  if(job.status==='READY'||job.status==='FAILED'||job.status==='BLOCKED')
    return {kind:'TERMINAL'};
  if(job.status==='RUNNING'){
    if(job.attempt<1||job.startedAtMs===null||job.startedAtMs>nowMs)
      throw new Error('SCENE_JOB_RUNNING_INVALID');
    if(nowMs-job.startedAtMs<timeoutMs)return {kind:'WAIT'};
    if(job.attempt>=maxAttempts)return {kind:'FAIL_TIMEOUT'};
    return {kind:'SCHEDULE_RETRY',nextRunAtMs:nowMs+sceneRetryDelayMs(job.attempt)};
  }
  if(job.startedAtMs!==null)
    throw new Error('SCENE_JOB_NONRUNNING_START_INVALID');
  if(job.attempt>=maxAttempts)return {kind:'FAIL_TIMEOUT'};
  if(job.dueAtMs!==null&&job.dueAtMs>nowMs)return {kind:'WAIT'};
  if(job.status==='RETRY_WAIT')return {kind:'REQUEUE'};
  if(job.status==='QUEUED')return {kind:'CLAIM'};
  throw new Error('SCENE_JOB_STATUS_INVALID');
}
