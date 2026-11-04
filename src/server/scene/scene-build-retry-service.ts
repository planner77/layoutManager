/** #225/B3 manual retry: trusted G7 Actor, scoped site, bounded attempt and
 * atomic CAS + Audit. Never changes a Scene pointer or an uploaded source.
 */
import {CadError,validateId} from '@/domain/cad';
import {CAD_SCENE_CPU_BUILDER} from '@/domain/cad-scene';
import {canManualRetrySceneJob} from '@/domain/scene-build-retry';
import {writeTransaction,type Database} from '@/server/db';
import {appendG7CadAudit,requireG7CadPermission,type G7CadWrite}
  from '@/server/g7-operational/cad-guard';
import {requireCpuSceneWorkerRelease} from './scene-build-job-queue';

export type SceneRetryResult=Readonly<{status:'QUEUED'|'RUNNING'|'RETRY_WAIT'}>;
export async function manualRetryCpuSceneJob(
  db:Database,versionId:string,proof:G7CadWrite,
):Promise<SceneRetryResult>{
  validateId(versionId);
  if(!proof.runtime)throw new CadError('G7_AUTH_CONTEXT_REQUIRED','로그인이 필요합니다.',403);
  try{requireCpuSceneWorkerRelease();}
  catch{throw new CadError('SCENE_CPU_QUEUE_RELEASE_NOT_APPROVED',
    'Scene 자동 생성 릴리스가 활성화되지 않았습니다.',503);}
  return writeTransaction(db,async tx=>{
    const version=await tx.cadFileVersion.findUnique({where:{id:versionId},
      select:{id:true,sha256:true,fileFormat:true}});
    if(!version||version.fileFormat!=='DXF')
      throw new CadError('SCENE_JOB_NOT_FOUND','해당 Scene 작업이 없습니다.',404);
    const approved=await requireG7CadPermission(tx,proof,'cad:upload',
      {kind:'version',versionId});
    const job=await tx.sceneBuildJob.findFirst({
      where:{versionId,builder:CAD_SCENE_CPU_BUILDER,payloadSchema:2},
      orderBy:[{createdAt:'desc'},{id:'desc'}],
    });
    if(!job||job.sourceSha256!==version.sha256||job.siteId!==approved.siteId)
      throw new CadError('SCENE_JOB_NOT_FOUND','재시도할 작업이 없습니다.',404);
    // A verified/invalid pre-existing pointer is never replaced through Retry.
    const pointer=await tx.currentScene.findUnique({where:{versionId},select:{versionId:true}});
    if(pointer)throw new CadError('SCENE_ALREADY_PUBLISHED',
      '기존 Scene이 있어 자동 재시도를 진행할 수 없습니다.',409);
    if(['QUEUED','RUNNING','RETRY_WAIT'].includes(job.status))
      return {status:job.status as SceneRetryResult['status']};
    if(!canManualRetrySceneJob(job))
      throw new CadError('SCENE_RETRY_NOT_ALLOWED','재시도 조건 또는 시도 횟수를 확인해주세요.',409);
    const now=new Date();
    const changed=await tx.sceneBuildJob.updateMany({
      where:{id:job.id,status:'FAILED',attempt:job.attempt,lastCode:job.lastCode,
        sourceSha256:version.sha256,builder:CAD_SCENE_CPU_BUILDER,payloadSchema:2},
      data:{status:'QUEUED',stage:'JOB_ENQUEUED',dueAt:now,startedAt:null,
        finishedAt:null,lastCode:null,actorId:approved.actorId,
        siteId:approved.siteId,requestId:proof.requestId},
    });
    if(changed.count!==1)throw new CadError('SCENE_RETRY_CONFLICT',
      '상태가 변경되었습니다. 목록을 새로고침해주세요.',409);
    await appendG7CadAudit(tx,proof,approved.actorId,approved.siteId,
      'SCENE_RETRY_REQUESTED',versionId,null,null);
    return {status:'QUEUED'};
  });
}
