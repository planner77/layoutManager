/** #225 B2-B: detached, fail-closed CPU Scene publication.
 *
 * Not a public API. Only a future approved single-Worker release may invoke
 * this function, and even then it MUST be supplied by an isolated CPU process
 * supervisor. Current 0.60.0 G7 schema fails authorizeG7CpuWorkerJobTx.
 * A verified storage write and a CurrentScene/Job/Audit transaction are distinct
 * steps; failure never overwrites an existing READY Scene pointer.
 */
import {randomUUID} from 'node:crypto';
import {CadError} from '@/domain/cad';
import {cpuSceneScope,validateSceneManifest} from '@/domain/cad-scene';
import {sceneSha256} from '@/domain/scene-digest';
import {validateStoredScenePayload} from '@/domain/scene-payload';
import {type Database,writeTransaction} from '@/server/db';
import type {CadStorage} from '@/server/storage/cad-storage';
import type {SceneBlobStorage} from '@/server/storage/scene-storage';
import {CPU_LINE_LIMITS} from './cpu-line-candidate';
import {inspectCpuCandidateForJob,type CpuCandidateEnvelope} from './cpu-candidate-admission';
import {authorizeG7CpuWorkerJobTx} from './scene-worker-g7-authorization';

const fail=(code:string,status=409)=>
  new CadError(code,'CPU Scene 작업을 검증할 수 없습니다.',status);

/** Bounded read of the database-authoritative original locator. The caller
 * must independently authorize its owning Job before using these bytes. */
export async function readVerifiedCpuOriginal(storage:CadStorage,key:string,fileSize:number,sourceSha256:string){
  if(!Number.isSafeInteger(fileSize)||fileSize<1||fileSize>CPU_LINE_LIMITS.sourceBytes)
    throw fail('SCENE_WORKER_SOURCE_LIMIT',413);
  const result=await storage.content(key);
  if(result.size!==fileSize)throw fail('SCENE_WORKER_SOURCE_CHANGED');
  const reader=result.stream.getReader(),chunks:Uint8Array[]=[];
  let received=0,finished=false;
  try{
    for(;;){
      const part=await reader.read();
      if(part.done){finished=true;break;}
      received+=part.value.byteLength;
      if(received>fileSize||received>CPU_LINE_LIMITS.sourceBytes)
        throw fail('SCENE_WORKER_SOURCE_CHANGED');
      chunks.push(part.value);
    }
  }finally{
    if(!finished)await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
  if(received!==fileSize)throw fail('SCENE_WORKER_SOURCE_CHANGED');
  const bytes=Buffer.concat(chunks.map(chunk=>Buffer.from(chunk)),received);
  if(sceneSha256(bytes)!==sourceSha256)throw fail('SCENE_WORKER_SOURCE_CHANGED');
  return bytes;
}

export type PublishedCpuWorkerScene=Readonly<{
  versionId:string;assetId:string;revision:0;payloadSha256:string;
  /** This is a verified DB+blob candidate, not browser-restoration acceptance. */
  immutableStorageVerified:true;
}>;

/** Applies a fully checked isolated candidate. The original DXF is ALWAYS
 * read from the authoritative CadStorage locator, never trusted from a job
 * payload/request. No session token, cookie, password or login is consulted.
 */
export async function publishVerifiedCpuSceneJob(input:Readonly<{
  db:Database;originalStorage:CadStorage;sceneStorage:SceneBlobStorage;
  jobId:string;attempt:number;candidate:CpuCandidateEnvelope;
}>):Promise<PublishedCpuWorkerScene>{
  const {db,originalStorage,sceneStorage,jobId,attempt,candidate}=input;
  // Each signed runtime/role/site/Job check is transactional; no durable proof
  // object is accepted from a caller.
  const identity=await writeTransaction(db,tx=>
    authorizeG7CpuWorkerJobTx(tx,jobId,attempt));
  const original=await db.cadFileVersion.findUnique({where:{id:identity.versionId},
    select:{sha256:true,fileSize:true,storagePath:true,fileFormat:true}});
  if(!original||original.fileFormat!=='DXF'||original.sha256!==identity.sourceSha256)
    throw fail('SCENE_WORKER_SOURCE_CHANGED');
  const bytes=await readVerifiedCpuOriginal(originalStorage,original.storagePath,
    original.fileSize,identity.sourceSha256);
  // This is a full payload/manifest/source check, not an auth context.
  const receipt=inspectCpuCandidateForJob({job:{
    versionId:identity.versionId,sourceSha256:identity.sourceSha256,
    builder:cpuSceneScope(identity.versionId,identity.sourceSha256).builder,
    payloadSchema:2,status:'RUNNING',attempt,
  },source:bytes,candidate});
  const manifest=validateSceneManifest(candidate.manifest,{
    scope:cpuSceneScope(identity.versionId,identity.sourceSha256,'DXF_INSUNITS_4'),
    format:'CUSTOM_DTO',byteLength:receipt.byteLength,sha256:receipt.payloadSha256,
  });
  validateStoredScenePayload(candidate.bytes,manifest);

  // Fail closed before remote storage I/O if any READY pointer already exists.
  // This first rollout NEVER overwrites a prior Scene.
  await writeTransaction(db,async tx=>{
    await authorizeG7CpuWorkerJobTx(tx,jobId,attempt);
    const old=await tx.currentScene.findUnique({where:{versionId:identity.versionId}});
    if(old)throw fail('SCENE_WORKER_POINTER_EXISTS');
  });
  const assetId=randomUUID(),locator=sceneStorage.locator(assetId);
  await db.sceneOrphanJob.create({data:{
    id:randomUUID(),assetId,storageLocator:locator,state:'PREPARING',
  }});
  try{
    await sceneStorage.putVerified(locator,candidate.bytes,receipt.payloadSha256);
    // putVerified performs an actual readback; an acknowledgement alone
    // is not enough to publish a CurrentScene pointer.
    await db.sceneOrphanJob.update({where:{assetId},data:{state:'VERIFIED'}});
  }catch(error){
    await db.sceneOrphanJob.update({where:{assetId},
      data:{state:'UNCERTAIN',attempts:{increment:1}}}).catch(()=>{});
    throw error;
  }
  try{
    return await writeTransaction(db,async tx=>{
      const latest=await authorizeG7CpuWorkerJobTx(tx,jobId,attempt);
      if(latest.versionId!==identity.versionId||
         latest.sourceSha256!==identity.sourceSha256||
         latest.actorId!==identity.actorId||latest.siteId!==identity.siteId||
         latest.requestId!==identity.requestId)
        throw fail('SCENE_WORKER_IDENTITY_CHANGED');
      const version=await tx.cadFileVersion.findUnique({where:{id:latest.versionId},
        select:{sha256:true,storagePath:true,fileSize:true,fileFormat:true}});
      if(!version||version.sha256!==latest.sourceSha256||
         version.storagePath!==original.storagePath||
         version.fileSize!==original.fileSize||version.fileFormat!=='DXF')
        throw fail('SCENE_WORKER_SOURCE_CHANGED');
      if(await tx.currentScene.findUnique({where:{versionId:latest.versionId}}))
        throw fail('SCENE_WORKER_POINTER_EXISTS');
      await tx.sceneAsset.create({data:{id:assetId,versionId:latest.versionId,
        sourceSha256:latest.sourceSha256,manifestJson:JSON.stringify(manifest),
        digest:receipt.payloadSha256,byteLength:receipt.byteLength,
        format:'CUSTOM_DTO',storageLocator:locator}});
      // This is deliberately only a first-publish path, never a replacement.
      await tx.currentScene.create({data:{versionId:latest.versionId,assetId,revision:0}});
      const changed=await tx.sceneBuildJob.updateMany({where:{
        id:jobId,status:'RUNNING',attempt,
        builder:receipt.builder,payloadSchema:receipt.payloadSchema,
        sourceSha256:latest.sourceSha256,versionId:latest.versionId,
      },data:{status:'READY',stage:'READY',startedAt:null,
        finishedAt:new Date(),lastCode:null}});
      if(changed.count!==1)throw fail('SCENE_WORKER_JOB_RACE');
      // Internal Worker audit is bound to current Actor/Site and fresh G7 grant;
      // never mint G7CadWrite or reuse a session tokenHash.
      await tx.auditEvent.create({data:{id:randomUUID(),
        actorUserId:latest.actorId,affectedUserId:latest.actorId,siteId:latest.siteId,
        action:'SCENE_PUBLISHED',targetKind:'VERSION',targetId:latest.versionId,
        outcome:'SUCCESS',beforeRevision:null,afterRevision:0,
        timestampUtc:new Date().toISOString(),requestId:latest.requestId}});
      await tx.sceneOrphanJob.delete({where:{assetId}});
      return {versionId:latest.versionId,assetId,revision:0 as const,
        payloadSha256:receipt.payloadSha256,immutableStorageVerified:true as const};
    });
  }catch(error){
    // Explicit cleanup only after a known transaction rollback. Cleanup itself
    // checks reference counts, so uncertain commit never destroys a live blob.
    await db.sceneOrphanJob.update({where:{assetId},
      data:{state:'CLEANUP',attempts:{increment:1}}}).catch(()=>{});
    throw error;
  }
}
