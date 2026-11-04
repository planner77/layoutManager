/** #225/B3 G7-scoped, bounded batch. READY requires the same blob, manifest and
 * full DTO validation as SceneRepository.status; no job.status is trusted.
 */
import {CadError} from '@/domain/cad';
import {CAD_SCENE_CPU_BUILDER,storedSceneScope,validateSceneManifest,
  type SceneManifest} from '@/domain/cad-scene';
import {safeBuildErrorCode} from '@/domain/scene-build-job';
import {sceneStatusBadge,type SceneStatusBadge} from '@/domain/scene-build-display';
import {canManualRetrySceneJob} from '@/domain/scene-build-retry';
import {validateStoredScenePayload} from '@/domain/scene-payload';
import type {Database} from '@/server/db';
import {sceneSchemaAvailable} from './scene-repository';
import type {SceneBlobStorage} from '@/server/storage/scene-storage';

export type SceneBatchRow=SceneStatusBadge & Readonly<{
  errorCode:ReturnType<typeof safeBuildErrorCode>|null;
  canRetry:boolean;
}>;
export type SceneBatchResponse=Readonly<{rows:Record<string,SceneBatchRow>}>;
export const SCENE_BATCH_LIMIT=100;

/** No client-supplied site, actor, builder or path is trusted. Returned keys
 * are ONLY server-resolved versions under signed, active G7 Site grants.
 */
export async function readSceneBuildBatch(db:Database,storage:SceneBlobStorage,
  versionIds:readonly string[],readSites:readonly string[],writeSites:readonly string[]=[]):
  Promise<SceneBatchResponse>{
  if(versionIds.length<1||versionIds.length>SCENE_BATCH_LIMIT||
     new Set(versionIds).size!==versionIds.length)
    throw new CadError('SCENE_BATCH_INVALID','조회할 도면 개수를 확인해주세요.',400);
  const versions=await db.cadFileVersion.findMany({
    where:{id:{in:[...versionIds]}},
    select:{id:true,fileFormat:true,sha256:true,
      location:{select:{building:{select:{siteId:true}}}}},
  });
  const allowed=versions.filter(v=>readSites.includes(v.location.building.siteId));
  if(!allowed.length)return {rows:{}};
  const ids=allowed.map(x=>x.id);
  const schema=await sceneSchemaAvailable(db);
  const jobTable=await db.$queryRawUnsafe<{name:string}[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='SceneBuildJob'");
  const jobs=jobTable.length===1?await db.sceneBuildJob.findMany({
    where:{versionId:{in:ids},builder:CAD_SCENE_CPU_BUILDER,payloadSchema:2},
    orderBy:[{createdAt:'desc'},{id:'desc'}],
    select:{versionId:true,status:true,stage:true,attempt:true,lastCode:true,
      sourceSha256:true,startedAt:true},
  }):[];
  const latest=new Map<string,(typeof jobs)[number]>();
  for(const job of jobs)if(!latest.has(job.versionId))latest.set(job.versionId,job);
  const pointers=schema?await db.currentScene.findMany({
    where:{versionId:{in:ids}},include:{asset:true},
  }):[];
  const byPointer=new Map(pointers.map(x=>[x.versionId,x]));
  const rows:Record<string,SceneBatchRow>={};
  // Bounded to at most 100 per request; no per-row SQL queries. Blob reads
  // are necessary to prove READY. They are serial to bound memory pressure.
  for(const version of allowed){
    const pointer=byPointer.get(version.id);
    let validated:'READY'|'MISSING'|'REBUILD_REQUIRED'|'UNAVAILABLE'=schema?'MISSING':'UNAVAILABLE';
    if(pointer){
      try{
        const asset=pointer.asset;
        const parsed:unknown=JSON.parse(asset.manifestJson);
        const scope=storedSceneScope(version.id,version.sha256,(parsed as SceneManifest).scope);
        const manifest=validateSceneManifest(parsed,{scope,format:'CUSTOM_DTO',
          byteLength:asset.byteLength,sha256:asset.digest});
        if(asset.versionId!==version.id||asset.sourceSha256!==version.sha256||
           asset.format!=='CUSTOM_DTO'||!storage.owns(asset.storageLocator,asset.id))
          throw new Error('SCENE_INVALID');
        const bytes=await storage.readVerified(asset.storageLocator,asset.byteLength,asset.digest);
        validateStoredScenePayload(bytes,manifest);
        validated='READY';
      }catch(error){
        // Infrastructure unavailability must not be reported as corrupt CAD.
        validated=error instanceof CadError&&error.code==='SCENE_STORAGE_UNAVAILABLE'?
          'UNAVAILABLE':'REBUILD_REQUIRED';
      }
    }
    const job=latest.get(version.id);
    const status=job?.status;
    const jobState=status&&['QUEUED','RUNNING','RETRY_WAIT','READY','FAILED','BLOCKED'].includes(status)
      ? status as 'QUEUED'|'RUNNING'|'RETRY_WAIT'|'READY'|'FAILED'|'BLOCKED':null;
    const badge=sceneStatusBadge({fileFormat:version.fileFormat,
      validatedScene:validated,jobState,stage:job?.stage});
    rows[version.id]={...badge,
      errorCode:jobState==='FAILED'?safeBuildErrorCode(job?.lastCode):null,
      canRetry:version.fileFormat==='DXF'&&!pointer&&
        writeSites.includes(version.location.building.siteId)&&!!job&&
        job.sourceSha256===version.sha256&&canManualRetrySceneJob(job),
    };
  }
  return {rows};
}
