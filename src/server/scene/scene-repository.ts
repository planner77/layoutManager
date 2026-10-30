import { randomUUID } from 'node:crypto';
import { CadError } from '@/domain/cad';
import { sceneScope, validateSceneManifest, type SceneManifest } from '@/domain/cad-scene';
import { validateStoredScenePayload } from '@/domain/scene-payload';
import { type Database, writeTransaction } from '@/server/db';
import { appendG7CadAudit, requireG7CadPermission, type G7CadWrite } from '@/server/g7-operational/cad-guard';
import { SceneBlobStorage, SCENE_MAX_BYTES } from '@/server/storage/scene-storage';

export type ReadyScene=Readonly<{status:'READY';assetId:string;revision:number;manifest:SceneManifest;contentUrl:string}>;
export type SceneStatus=ReadyScene|Readonly<{status:'MISSING'|'LEGACY_DISABLED'}>|Readonly<{status:'REBUILD_REQUIRED';revision:number}>;
const malformed=()=>new CadError('SCENE_INVALID','Scene 데이터가 올바르지 않습니다.',400);
const conflict=()=>new CadError('SCENE_REVISION_CONFLICT','Scene revision이 변경되었습니다.',409);
const exact=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>
  value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const contentUrl=(versionId:string,assetId:string)=>`/api/cad-files/${encodeURIComponent(versionId)}/scene/content?assetId=${encodeURIComponent(assetId)}`;

/** This is a feature discriminator, never a schema upgrade or drift bypass. */
export async function sceneSchemaAvailable(db:Database):Promise<boolean>{
  const rows=await db.$queryRawUnsafe<{name:string}[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('SceneAsset','CurrentScene','SceneOrphanJob') ORDER BY name");
  if(rows.length===0)return false;
  if(rows.length!==3||rows.map(row=>row.name).join(',')!=='CurrentScene,SceneAsset,SceneOrphanJob')
    throw new CadError('SCENE_SCHEMA_UNAVAILABLE','Scene 저장 스키마를 확인할 수 없습니다.',503);
  return true;
}

export class SceneRepository {
  constructor(readonly db:Database,readonly storage:SceneBlobStorage){}
  private async version(id:string){
    const file=await this.db.cadFileVersion.findUnique({where:{id},select:{id:true,sha256:true,fileFormat:true}});
    if(!file)throw new CadError('FILE_NOT_FOUND','도면 버전을 찾을 수 없습니다.',404);
    if(file.fileFormat!=='DXF')throw new CadError('SCENE_FORMAT_UNSUPPORTED','DXF Scene만 지원합니다.',415);
    return file;
  }
  async status(versionId:string):Promise<SceneStatus>{
    await this.version(versionId);
    if(!await sceneSchemaAvailable(this.db))return {status:'LEGACY_DISABLED'};
    const pointer=await this.db.currentScene.findUnique({where:{versionId},include:{asset:true}});
    if(!pointer)return {status:'MISSING'};
    try{
      const version=await this.version(versionId),asset=pointer.asset;
      const parsed:unknown=JSON.parse(asset.manifestJson);
      const expected=sceneScope(versionId,version.sha256,(parsed as SceneManifest).scope.sourceUnit);
      const manifest=validateSceneManifest(parsed,{scope:expected,format:'CUSTOM_DTO',
        byteLength:asset.byteLength,sha256:asset.digest});
      if(asset.sourceSha256!==version.sha256||asset.format!=='CUSTOM_DTO'||
        !this.storage.owns(asset.storageLocator,asset.id))throw malformed();
      const bytes=await this.storage.readVerified(asset.storageLocator,asset.byteLength,asset.digest);
      validateStoredScenePayload(bytes,manifest);
      return {status:'READY',assetId:asset.id,revision:pointer.revision,manifest,
        contentUrl:contentUrl(versionId,asset.id)};
    }catch(error){
      if(error instanceof CadError&&error.code==='SCENE_STORAGE_UNAVAILABLE')throw error;
      return {status:'REBUILD_REQUIRED',revision:pointer.revision};
    }
  }
  async content(versionId:string,assetId:string):Promise<Uint8Array>{
    const version=await this.version(versionId);
    if(!await sceneSchemaAvailable(this.db))throw new CadError('SCENE_SCHEMA_UNAVAILABLE','Scene을 사용할 수 없습니다.',404);
    const asset=await this.db.sceneAsset.findUnique({where:{id:assetId}});
    if(!asset||asset.versionId!==versionId)throw new CadError('SCENE_NOT_FOUND','Scene을 찾을 수 없습니다.',404);
    try{
      const parsed:unknown=JSON.parse(asset.manifestJson);
      const scope=sceneScope(versionId,version.sha256,(parsed as SceneManifest).scope.sourceUnit);
      const manifest=validateSceneManifest(parsed,{scope,format:'CUSTOM_DTO',byteLength:asset.byteLength,sha256:asset.digest});
      if(asset.sourceSha256!==version.sha256||!this.storage.owns(asset.storageLocator,asset.id))throw malformed();
      const bytes=await this.storage.readVerified(asset.storageLocator,asset.byteLength,asset.digest);
      validateStoredScenePayload(bytes,manifest);
      return bytes;
    }catch(error){
      if(error instanceof CadError&&error.code==='SCENE_STORAGE_UNAVAILABLE')throw error;
      throw new CadError('SCENE_REBUILD_REQUIRED','Scene이 손상되었거나 호환되지 않습니다.',503);
    }
  }
  async publish(versionId:string,rawManifest:unknown,bytes:Uint8Array,expectedRevision:number|null,
    proof:G7CadWrite|undefined):Promise<ReadyScene>{
    if(!proof)throw new CadError('G7_AUTH_CONTEXT_REQUIRED','Scene 게시 승인이 필요합니다.',403);
    if(!await sceneSchemaAvailable(this.db))throw new CadError('SCENE_SCHEMA_UNAVAILABLE','Scene 저장 스키마를 사용할 수 없습니다.',503);
    if(!Number.isSafeInteger(expectedRevision)&&expectedRevision!==null||
       typeof expectedRevision==='number'&&expectedRevision<0||bytes.length<1||bytes.length>SCENE_MAX_BYTES)throw malformed();
    const version=await this.version(versionId);
    let manifest:SceneManifest;
    try{
      if(!exact(rawManifest,['scope','sceneId','format','state','revision','byteLength','sha256'])||
        !exact(rawManifest.scope,['versionId','sourceSha256','schema','builder','renderer','frame','sourceUnit']))
        throw malformed();
      const candidate=rawManifest as SceneManifest;
      const scope=sceneScope(versionId,version.sha256,candidate.scope.sourceUnit);
      manifest=validateSceneManifest(candidate,{scope,format:'CUSTOM_DTO',byteLength:bytes.length,sha256:candidate.sha256});
      validateStoredScenePayload(bytes,manifest);
    }catch{throw malformed();}
    const manifestJson=JSON.stringify(manifest);
    const existing=await writeTransaction(this.db,async tx=>{
      await requireG7CadPermission(tx,proof,'cad:upload',{kind:'version',versionId});
      const pointer=await tx.currentScene.findUnique({where:{versionId},include:{asset:true}});
      if(pointer){
        const same=pointer.asset.digest===manifest.sha256&&pointer.asset.manifestJson===manifestJson;
        if(same&&(expectedRevision===pointer.revision||expectedRevision===pointer.revision-1||
          expectedRevision===null&&pointer.revision===0))
          return {status:'READY' as const,assetId:pointer.asset.id,revision:pointer.revision,manifest,
            contentUrl:contentUrl(versionId,pointer.asset.id)};
        if(expectedRevision!==pointer.revision)throw conflict();
      }else if(expectedRevision!==null)throw conflict();
      return null;
    });
    if(existing){
      try{await this.content(versionId,existing.assetId);return existing;}
      catch(error){
        // A retry cannot bless a missing/corrupt old blob. An explicit rebuild
        // with the current revision may publish a new immutable candidate.
        if(expectedRevision!==existing.revision)throw error;
      }
    }
    const assetId=randomUUID(),locator=this.storage.locator(assetId);
    await this.db.sceneOrphanJob.create({data:{id:randomUUID(),assetId,storageLocator:locator,state:'PREPARING'}});
    try{
      await this.storage.putVerified(locator,bytes,manifest.sha256);
      await this.db.sceneOrphanJob.update({where:{assetId},data:{state:'VERIFIED'}});
    }catch(error){
      await this.db.sceneOrphanJob.update({where:{assetId},data:{state:'UNCERTAIN',attempts:{increment:1}}}).catch(()=>{});
      throw error;
    }
    try{
      return await writeTransaction(this.db,async tx=>{
        const current=await tx.cadFileVersion.findUnique({where:{id:versionId},select:{sha256:true,fileFormat:true}});
        if(!current||current.sha256!==version.sha256||current.fileFormat!=='DXF')throw conflict();
        const allowed=await requireG7CadPermission(tx,proof,'cad:upload',{kind:'version',versionId});
        const pointer=await tx.currentScene.findUnique({where:{versionId}});
        if(pointer?.revision!==expectedRevision && !(pointer===null&&expectedRevision===null))throw conflict();
        await tx.sceneAsset.create({data:{id:assetId,versionId,sourceSha256:version.sha256,
          manifestJson,digest:manifest.sha256,byteLength:bytes.length,format:'CUSTOM_DTO',storageLocator:locator}});
        const revision=pointer?pointer.revision+1:0;
        if(pointer){
          const cas=await tx.currentScene.updateMany({where:{versionId,revision:pointer.revision},
            data:{assetId,revision}});
          if(cas.count!==1)throw conflict();
        }else await tx.currentScene.create({data:{versionId,assetId,revision}});
        await appendG7CadAudit(tx,proof,allowed.actorId,allowed.siteId,'SCENE_PUBLISHED',versionId,
          pointer?.revision??null,revision);
        await tx.sceneOrphanJob.delete({where:{assetId}});
        return {status:'READY',assetId,revision,manifest,contentUrl:contentUrl(versionId,assetId)};
      });
    }catch(error){
      // Verified but unreferenced candidate is retained for delayed, explicit
      // cleanup. A failed DB transaction cannot erase the prior READY pointer.
      await this.db.sceneOrphanJob.update({where:{assetId},data:{state:'CLEANUP',attempts:{increment:1}}}).catch(()=>{});
      throw error;
    }
  }
}

/** Manual retry only. Eligibility is recorded after a failed publish; the
 * caller supplies a grace period and no live request performs automatic GC.
 */
export async function cleanupSceneOrphans(db:Database,storage:SceneBlobStorage,
  now=Date.now(),graceMs=24*60*60*1000):Promise<{removed:number;pending:number}>{
  if(graceMs<60_000)throw new Error('SCENE_CLEANUP_GRACE_INVALID');
  const jobs=await db.sceneOrphanJob.findMany({where:{state:'CLEANUP',createdAt:{lte:new Date(now-graceMs)}}});
  let removed=0,pending=0;
  for(const job of jobs){
    try{
      const referenced=await db.sceneAsset.count({where:{OR:[{id:job.assetId},{storageLocator:job.storageLocator}]}});
      if(referenced){pending++;continue;}
      await storage.removeOrphan(job.storageLocator);
      await db.sceneOrphanJob.delete({where:{id:job.id}});
      removed++;
    }catch{
      pending++;
      await db.sceneOrphanJob.update({where:{id:job.id},data:{attempts:{increment:1}}}).catch(()=>{});
    }
  }
  return {removed,pending};
}
