/** #225/B1 — forward-only, gated single-Worker persistence contract.
 * This module does NOT activate migration, start a Worker, publish Scene or
 * authenticate a background job. Enabled only after reviewed G7 schema release.
 */
import {randomUUID} from 'node:crypto';
import type {Prisma} from '@/generated/prisma/client';
import type {Database} from '@/server/db';
import {writeTransaction} from '@/server/db';
import {CAD_SCENE_BUILDER,CAD_SCENE_CPU_BUILDER} from '@/domain/cad-scene';
import {G7_GREENFIELD_SCHEMA_ID} from '@/server/g7-operational/greenfield-schema';
import {safeBuildErrorCode,type SceneBuildErrorCode} from '@/domain/scene-build-job';
import {decideSingleWorkerAction,singleSceneJobKey} from '@/domain/scene-single-worker-admission';

export const SCENE_JOB_PAYLOAD_SCHEMA=2 as const;
// Reserved for a future reviewed G7 forward release. Current 0.60.0 stays
// hard-OFF regardless of an operator-supplied environment variable.
export const SCENE_CPU_WORKER_SCHEMA_ID='G7-GREENFIELD-CPU-WORKER-20261104-1' as const;
export function requireCpuSceneWorkerRelease():void{
  if(process.env.SCENE_AUTO_BUILD_ENABLED!=='true'||
     process.env.SCENE_CPU_WORKER_ENABLED!=='true'||
     G7_GREENFIELD_SCHEMA_ID!==SCENE_CPU_WORKER_SCHEMA_ID)
    throw new Error('SCENE_CPU_QUEUE_RELEASE_NOT_APPROVED');
}
const MAX_ATTEMPTS=3;
const STALE_AFTER_MS=180_000;
type Tx=Prisma.TransactionClient;

export type SceneEnqueueIntent=Readonly<{
  versionId:string;sourceSha256:string;actorId:string;siteId:string;requestId:string;
}>;
const isId=(v:unknown):v is string =>
  typeof v==='string'&&v.length>0&&v.length<=128&&!/[\u0000-\u001f\u007f]/.test(v);
const validTime=(v:Date)=>v instanceof Date&&Number.isFinite(v.getTime())&&v.getTime()>=0;

/** Existing v0.60.0 upload identity remains legacy and immutable. */
export async function enqueueSceneBuildTx(tx:Tx,input:SceneEnqueueIntent){
  return enqueueWithBuilderTx(tx,input,CAD_SCENE_BUILDER);
}
/** Only a FUTURE registered CPU Worker release may create CPU-specific jobs.
 * Not yet wired to CadRepository.register in v0.60.0.
 */
export async function enqueueCpuSceneBuildTx(tx:Tx,input:SceneEnqueueIntent){
  requireCpuSceneWorkerRelease();
  return enqueueWithBuilderTx(tx,input,CAD_SCENE_CPU_BUILDER);
}
async function enqueueWithBuilderTx(tx:Tx,input:SceneEnqueueIntent,builder:string){
  // Reject accidental tokenHash/cookie/password propagation into persisted jobs.
  if(Object.keys(input).sort().join()!=='actorId,requestId,siteId,sourceSha256,versionId'||
    !isId(input.actorId)||!isId(input.siteId)||!isId(input.requestId))
    throw new Error('SCENE_JOB_ENQUEUE_INVALID');
  singleSceneJobKey({versionId:input.versionId,sourceSha256:input.sourceSha256,
    builder,payloadSchema:SCENE_JOB_PAYLOAD_SCHEMA});
  const created=await tx.sceneBuildJob.create({data:{
    id:randomUUID(),versionId:input.versionId,sourceSha256:input.sourceSha256.toLowerCase(),
    builder,payloadSchema:SCENE_JOB_PAYLOAD_SCHEMA,
    actorId:input.actorId,siteId:input.siteId,requestId:input.requestId,
    status:'QUEUED',stage:'JOB_ENQUEUED',attempt:0,dueAt:new Date(),
  }});
  return {jobId:created.id,status:'QUEUED' as const};
}

/** One pending job is claimable at a time. A transactional CAS protects against
 * two callers observing the same queue item, but this is NOT a distributed
 * two-worker lease and must be deployed as a single Worker instance.
 */
export async function claimNextSceneJob(db:Database,now=new Date()){
  return claimWithBuilder(db,now);
}
/** Do not run a queued legacy Browser Builder intent as a CPU Job. */
export async function claimNextCpuSceneJob(db:Database,now=new Date()){
  requireCpuSceneWorkerRelease();
  return claimWithBuilder(db,now,CAD_SCENE_CPU_BUILDER);
}
async function claimWithBuilder(db:Database,now:Date,builder?:string){
  if(!validTime(now))throw new Error('SCENE_JOB_TIME_INVALID');
  return writeTransaction(db,async tx=>{
    // Initial supported deployment is one Worker with concurrency=1.
    // Database partial unique index is the final defense if another process
    // races this check. Never run a second job while any RUNNING exists.
    const running=await tx.sceneBuildJob.findFirst({
      where:{status:'RUNNING'},select:{id:true},
    });
    if(running)return null;
    const picked=await tx.sceneBuildJob.findFirst({
      where:{status:'QUEUED',dueAt:{lte:now},
        ...(builder?{builder,payloadSchema:SCENE_JOB_PAYLOAD_SCHEMA}:{})},
      orderBy:[{dueAt:'asc'},{createdAt:'asc'},{id:'asc'}],
    });
    if(!picked)return null;
    const decision=decideSingleWorkerAction({
      status:'QUEUED',attempt:picked.attempt,dueAtMs:picked.dueAt.getTime(),startedAtMs:null,
    },now.getTime(),STALE_AFTER_MS,MAX_ATTEMPTS);
    if(decision.kind==='FAIL_TIMEOUT'){
      await tx.sceneBuildJob.updateMany({where:{id:picked.id,status:'QUEUED',attempt:picked.attempt},
        data:{status:'FAILED',lastCode:'SCENE_BUILD_TIMEOUT',finishedAt:now}});
      return null;
    }
    if(decision.kind!=='CLAIM')return null;
    const updated=await tx.sceneBuildJob.updateMany({
      where:{id:picked.id,status:'QUEUED',attempt:picked.attempt,startedAt:null},
      data:{status:'RUNNING',stage:'SOURCE_READ',attempt:{increment:1},startedAt:now},
    });
    return updated.count===1?{...picked,status:'RUNNING' as const,attempt:picked.attempt+1,startedAt:now}:null;
  });
}

/** Crash recovery inspects a stale RUNNING record but never changes a
 * CurrentScene pointer. Timeout classification is safe and persisted.
 */
export async function recoverStaleSceneJob(db:Database,now=new Date()){
  if(!validTime(now))throw new Error('SCENE_JOB_TIME_INVALID');
  return writeTransaction(db,async tx=>{
    const stale=await tx.sceneBuildJob.findFirst({
      where:{status:'RUNNING',startedAt:{lte:new Date(now.getTime()-STALE_AFTER_MS)}},
      orderBy:[{startedAt:'asc'},{id:'asc'}],
    });
    if(!stale)return null;
    const decision=decideSingleWorkerAction({
      status:'RUNNING',attempt:stale.attempt,
      dueAtMs:stale.dueAt.getTime(),
      startedAtMs:stale.startedAt?.getTime()??null,
    },now.getTime(),STALE_AFTER_MS,MAX_ATTEMPTS);
    if(decision.kind==='SCHEDULE_RETRY'){
      const changed=await tx.sceneBuildJob.updateMany({
        where:{id:stale.id,status:'RUNNING',attempt:stale.attempt,startedAt:stale.startedAt},
        data:{status:'RETRY_WAIT',dueAt:new Date(decision.nextRunAtMs),
          lastCode:'SCENE_BUILD_TIMEOUT',startedAt:null},
      });
      return changed.count===1?{id:stale.id,status:'RETRY_WAIT' as const}:null;
    }
    if(decision.kind==='FAIL_TIMEOUT'){
      const changed=await tx.sceneBuildJob.updateMany({
        where:{id:stale.id,status:'RUNNING',attempt:stale.attempt,startedAt:stale.startedAt},
        data:{status:'FAILED',lastCode:'SCENE_BUILD_TIMEOUT',finishedAt:now,startedAt:null},
      });
      return changed.count===1?{id:stale.id,status:'FAILED' as const}:null;
    }
    return null;
  });
}

/** Moves a due retry back into the claim queue without consuming an attempt. */
export async function requeueDueSceneJob(db:Database,now=new Date()){
  if(!validTime(now))throw new Error('SCENE_JOB_TIME_INVALID');
  return writeTransaction(db,async tx=>{
    const waiting=await tx.sceneBuildJob.findFirst({
      where:{status:'RETRY_WAIT',dueAt:{lte:now}},
      orderBy:[{dueAt:'asc'},{id:'asc'}],
    });
    if(!waiting)return null;
    const decision=decideSingleWorkerAction({
      status:'RETRY_WAIT',attempt:waiting.attempt,dueAtMs:waiting.dueAt.getTime(),startedAtMs:null,
    },now.getTime(),STALE_AFTER_MS,MAX_ATTEMPTS);
    if(decision.kind!=='REQUEUE'&&decision.kind!=='FAIL_TIMEOUT')return null;
    const changed=await tx.sceneBuildJob.updateMany({
      where:{id:waiting.id,status:'RETRY_WAIT',attempt:waiting.attempt},
      data:decision.kind==='REQUEUE'?{status:'QUEUED'}:
        {status:'FAILED',lastCode:'SCENE_BUILD_TIMEOUT',finishedAt:now},
    });
    return changed.count===1?{id:waiting.id,status:decision.kind==='REQUEUE'?'QUEUED' as const:'FAILED' as const}:null;
  });
}

/** Failure only. READY is deliberately absent until the authorized,
 * fully validated SceneRepository CurrentScene CAS is performed in B2.
 */
export async function failRunningSceneJob(db:Database,id:string,attempt:number,
  code:SceneBuildErrorCode,now=new Date()){
  if(!isId(id)||!Number.isSafeInteger(attempt)||attempt<1||!validTime(now))
    throw new Error('SCENE_JOB_FAILURE_INVALID');
  return writeTransaction(db,async tx=>{
    const changed=await tx.sceneBuildJob.updateMany({
      where:{id,status:'RUNNING',attempt},
      data:{status:'FAILED',lastCode:safeBuildErrorCode(code),startedAt:null,finishedAt:now},
    });
    return changed.count===1;
  });
}
