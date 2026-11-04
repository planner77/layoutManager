/** #225/B2-B internal single-Worker authority.
 *
 * Does NOT use a browser/session cookie or a persisted tokenHash. The current
 * 0.60.0 release is deliberately hard blocked: only a future registered G7
 * release with its reviewed CPU Worker schema and explicit OFF-by-default
 * switches can invoke this adapter.
 *
 * This check must be repeated inside the final pointer + Audit transaction:
 * it is NOT a reusable authorization token or a publisher by itself.
 */
import type {Prisma} from '@/generated/prisma/client';
import {CadError} from '@/domain/cad';
import {AuthorizationError,requireResolvedPermission,type Role,type UserAccess} from '@/domain/auth';
import {CAD_SCENE_CPU_BUILDER} from '@/domain/cad-scene';
import {G7_GREENFIELD_SCHEMA_ID} from '@/server/g7-operational/greenfield-schema';
import {resolveG7RuntimeGate} from '@/server/g7-operational/runtime-gate';
import {SCENE_JOB_PAYLOAD_SCHEMA,SCENE_CPU_WORKER_SCHEMA_ID} from './scene-build-job-queue';

type Tx=Prisma.TransactionClient;
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const deny=(code:string,status=403)=>new CadError(code,'Scene Worker 승인이 필요합니다.',status);

export type G7CpuWorkerIdentity=Readonly<{
  jobId:string;attempt:number;versionId:string;sourceSha256:string;
  actorId:string;siteId:string;requestId:string;
}>;
function currentRuntime(siteId?:string) {
  const gate=resolveG7RuntimeGate(process.env);
  if(gate.state!=='ACTIVE'||!gate.cadWriteEnabled||
     (siteId!==undefined&&!gate.siteIds.includes(siteId)))
    throw deny('SCENE_WORKER_RUNTIME_DENIED',503);
  return gate;
}

/** For a CURRENT job, check the actual DB actor/role/site and the signed
 * runtime binding without ever reusing the enqueue-time AuthSession proof.
 * DB queries and final gate re-read are inside the caller's transaction.
 */
export async function authorizeG7CpuWorkerJobTx(
  tx:Tx,jobId:string,attempt:number,
):Promise<G7CpuWorkerIdentity>{
  if(process.env.SCENE_AUTO_BUILD_ENABLED!=='true' ||
     process.env.SCENE_CPU_WORKER_ENABLED!=='true' ||
     G7_GREENFIELD_SCHEMA_ID!==SCENE_CPU_WORKER_SCHEMA_ID)
    throw deny('SCENE_WORKER_RELEASE_NOT_APPROVED',503);
  if(!ID.test(jobId)||!Number.isSafeInteger(attempt)||attempt<1||attempt>3)
    throw deny('SCENE_WORKER_JOB_INVALID');
  // First gate before any DB read. Never silently fall back to preview/OFF.
  currentRuntime();
  const job=await tx.sceneBuildJob.findUnique({where:{id:jobId}});
  if(!job||job.status!=='RUNNING'||job.attempt!==attempt||
     !(job.startedAt instanceof Date)||
     job.builder!==CAD_SCENE_CPU_BUILDER||
     job.payloadSchema!==SCENE_JOB_PAYLOAD_SCHEMA||!SHA.test(job.sourceSha256)||
     !ID.test(job.actorId)||!ID.test(job.siteId)||!ID.test(job.requestId))
    throw deny('SCENE_WORKER_JOB_INVALID');

  const version=await tx.cadFileVersion.findUnique({
    where:{id:job.versionId},
    include:{location:{include:{building:{include:{site:true}}}}},
  });
  const actor=await tx.user.findUnique({
    where:{id:job.actorId},
    include:{roles:true,sites:true},
  });
  const location=version?.location,building=location?.building,site=building?.site;
  if(!actor||!version||version.fileFormat!=='DXF'||
     version.sha256!==job.sourceSha256||!location?.active||
     !building?.active||!site?.active||site.id!==job.siteId)
    throw deny('SCENE_WORKER_ACCESS_REVOKED');

  // Fresh role and site grants, not a cached AuthSession or historical role.
  const user:UserAccess={
    id:actor.id,status:actor.status==='ACTIVE'?'ACTIVE':'DISABLED',
    mustChangePassword:actor.mustChangePassword,
    roles:actor.roles.map(row=>row.role as Role),
    siteGrants:actor.sites.map(row=>row.siteId),specialGrants:[],
  };
  try{
    requireResolvedPermission(user,'cad:upload',
      {kind:'version',versionId:job.versionId},site.id);
  }catch(error){
    if(!(error instanceof AuthorizationError))throw error;
    throw deny('SCENE_WORKER_ACCESS_REVOKED');
  }
  // Signer/runtime/site/migration hold may change while awaiting DB reads.
  currentRuntime(site.id);
  return Object.freeze({jobId:job.id,attempt:job.attempt,versionId:job.versionId,
    sourceSha256:job.sourceSha256,actorId:actor.id,siteId:site.id,requestId:job.requestId});
}
