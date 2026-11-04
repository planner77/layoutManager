/** #225/B2-B dormant single-work-item CPU orchestration.
 *
 * This is an in-process FUNCTION for a FUTURE separately sandboxed Worker
 * executable. No Next route/cron/Docker entrypoint invokes it today.
 * The 0.60.0 schema is unapproved and prevents job claiming. An actual
 * production Worker still needs its own non-root CPU/RAM/PID/time/network
 * isolation, supervision, new immutable release and end-to-end acceptance.
 */
import {CadError} from '@/domain/cad';
import {safeBuildErrorCode,type SceneBuildErrorCode} from '@/domain/scene-build-job';
import {type Database,writeTransaction} from '@/server/db';
import type {CadStorage} from '@/server/storage/cad-storage';
import type {SceneBlobStorage} from '@/server/storage/scene-storage';
import {CpuLineCandidateError,buildCpuLineCandidate} from './cpu-line-candidate';
import {authorizeG7CpuWorkerJobTx} from './scene-worker-g7-authorization';
import {
  requireCpuSceneWorkerRelease,claimNextCpuSceneJob,recoverStaleCpuSceneJob,
  requeueDueCpuSceneJob,updateRunningCpuJobStage,failRunningSceneJob,
} from './scene-build-job-queue';
import {readVerifiedCpuOriginal,publishVerifiedCpuSceneJob} from './scene-worker-publish';

export type CpuWorkerTickResult=
  |Readonly<{outcome:'IDLE'}>
  |Readonly<{outcome:'PUBLISHED';jobId:string;assetId:string}>
  |Readonly<{outcome:'FAILED';jobId:string;code:SceneBuildErrorCode}>;

function classify(error:unknown):SceneBuildErrorCode{
  if(error instanceof CpuLineCandidateError)return safeBuildErrorCode(error.code);
  if(error instanceof CadError){
    if(['SCENE_WORKER_ACCESS_REVOKED','SCENE_WORKER_RUNTIME_DENIED',
       'SCENE_WORKER_RELEASE_NOT_APPROVED'].includes(error.code))
      return 'SCENE_AUTH_REVOKED';
    if(error.code==='FILE_NOT_FOUND')return 'SCENE_SOURCE_UNAVAILABLE';
    if(error.code==='SCENE_WORKER_SOURCE_CHANGED')return 'SCENE_SOURCE_DIGEST_MISMATCH';
    if(error.code==='SCENE_WORKER_SOURCE_LIMIT')return 'SCENE_ASSET_TOO_LARGE';
    if(error.code==='SCENE_WORKER_POINTER_EXISTS'||error.code==='SCENE_WORKER_JOB_RACE')
      return 'SCENE_PUBLISH_CONFLICT';
    if(error.code.startsWith('SCENE_STORAGE_'))return 'SCENE_STORAGE_FAILED';
  }
  return 'UNKNOWN';
}

/** No plaintext credentials accepted. Any failure is a bounded, allowlisted
 * Job code; the original CAD and previous CurrentScene are never deleted.
 * No loop, timer, worker startup, host-process isolation or external API here.
 */
export async function runOneCpuSceneJob(input:Readonly<{
  db:Database;originalStorage:CadStorage;sceneStorage:SceneBlobStorage;
  now?:Date;
}>):Promise<CpuWorkerTickResult>{
  requireCpuSceneWorkerRelease();
  const {db,originalStorage,sceneStorage}=input,now=input.now??new Date();
  await recoverStaleCpuSceneJob(db,now);
  await requeueDueCpuSceneJob(db,now);
  const claimed=await claimNextCpuSceneJob(db,now);
  if(!claimed)return {outcome:'IDLE'};
  try{
    const authorized=await writeTransaction(db,tx=>
      authorizeG7CpuWorkerJobTx(tx,claimed.id,claimed.attempt));
    const original=await db.cadFileVersion.findUnique({where:{id:authorized.versionId},
      select:{sha256:true,storagePath:true,fileSize:true,fileFormat:true}});
    if(!original||original.fileFormat!=='DXF'||original.sha256!==authorized.sourceSha256)
      throw new CadError('SCENE_WORKER_SOURCE_CHANGED','원본 정보를 확인할 수 없습니다.',409);
    if(!await updateRunningCpuJobStage(db,claimed.id,claimed.attempt,'SOURCE_VERIFY'))
      throw new CadError('SCENE_WORKER_JOB_RACE','Scene Job 상태가 변경됐습니다.',409);
    const source=await readVerifiedCpuOriginal(originalStorage,original.storagePath,
      original.fileSize,authorized.sourceSha256);
    if(!await updateRunningCpuJobStage(db,claimed.id,claimed.attempt,'DXF_PARSE'))
      throw new CadError('SCENE_WORKER_JOB_RACE','Scene Job 상태가 변경됐습니다.',409);
    const candidate=await buildCpuLineCandidate({source,versionId:authorized.versionId,
      sourceSha256:authorized.sourceSha256});
    if(!await updateRunningCpuJobStage(db,claimed.id,claimed.attempt,'STORAGE_VERIFY'))
      throw new CadError('SCENE_WORKER_JOB_RACE','Scene Job 상태가 변경됐습니다.',409);
    // Reopens the original bytes, revalidates the full v2 candidate, and
    // repeats fresh G7 checks in the final CurrentScene+READY+Audit transaction.
    const published=await publishVerifiedCpuSceneJob({db,originalStorage,sceneStorage,
      jobId:claimed.id,attempt:claimed.attempt,candidate});
    return {outcome:'PUBLISHED',jobId:claimed.id,assetId:published.assetId};
  }catch(error){
    const code=classify(error);
    // CAS prevents a concurrent success from being reclassified as failed.
    await failRunningSceneJob(db,claimed.id,claimed.attempt,code);
    return {outcome:'FAILED',jobId:claimed.id,code};
  }
}
