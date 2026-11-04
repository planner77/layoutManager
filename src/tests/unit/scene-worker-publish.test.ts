import {beforeEach,describe,expect,it,vi} from 'vitest';
import {CadError} from '../../domain/cad';
import {sceneSha256} from '../../domain/scene-digest';
import {buildCpuLineCandidate} from '../../server/scene/cpu-line-candidate';
import {authorizeG7CpuWorkerJobTx} from '../../server/scene/scene-worker-g7-authorization';
import {publishVerifiedCpuSceneJob} from '../../server/scene/scene-worker-publish';

vi.mock('../../server/scene/scene-worker-g7-authorization',()=>({
  authorizeG7CpuWorkerJobTx:vi.fn(),
}));
const authorization=vi.mocked(authorizeG7CpuWorkerJobTx);
const versionId='11111111-1111-4111-8111-111111111111';
const source=new TextEncoder().encode(['0','SECTION','2','HEADER','9','$INSUNITS','70','4',
  '0','ENDSEC','0','SECTION','2','ENTITIES','0','LINE','8','0',
  '10','1','20','2','11','3','21','4','0','ENDSEC','0','EOF',''].join('\n'));
const sha=sceneSha256(source),assetId='00000000-0000-4000-8000-000000000001';
async function fixture(){
  const candidate=await buildCpuLineCandidate({source,versionId,sourceSha256:sha});
  const version={sha256:sha,fileSize:source.length,storagePath:'loc/version/original.dxf',
    fileFormat:'DXF'};
  const finds=vi.fn(async():Promise<{assetId:string}|null>=>null);
  const audit=vi.fn(async()=>({id:'audit'})),ready=vi.fn(async()=>({count:1}));
  const tx={
    cadFileVersion:{findUnique:vi.fn(async()=>version)},
    currentScene:{findUnique:finds,create:vi.fn(async()=>({}))},
    sceneAsset:{create:vi.fn(async()=>({}))},
    sceneBuildJob:{updateMany:ready},
    auditEvent:{create:audit},
    sceneOrphanJob:{delete:vi.fn(async()=>({}))},
  };
  const db={
    $transaction:vi.fn(async(fn:(arg:typeof tx)=>Promise<unknown>)=>fn(tx)),
    cadFileVersion:{findUnique:vi.fn(async()=>version)},
    sceneOrphanJob:{create:vi.fn(async()=>({})),
      update:vi.fn(async()=>({}))},
  };
  const originalStorage={content:vi.fn(async()=>({
    size:source.length,stream:new ReadableStream<Uint8Array>({
      start(controller){controller.enqueue(Uint8Array.from(source));controller.close();},
    }),
  }))};
  const sceneStorage={locator:vi.fn(()=> 'scenes/'+assetId+'.json'),
    putVerified:vi.fn(async()=>{})};
  const run=()=>publishVerifiedCpuSceneJob({
    db:db as never,originalStorage:originalStorage as never,
    sceneStorage:sceneStorage as never,jobId:'job-1',attempt:1,candidate,
  });
  return {candidate,version,tx,db,originalStorage,sceneStorage,run,finds,ready,audit};
}
beforeEach(()=>{
  authorization.mockReset();
  authorization.mockResolvedValue({
    jobId:'job-1',attempt:1,versionId,sourceSha256:sha,
    actorId:'user-1',siteId:'site-1',requestId:'request-1',
  });
});
describe('#225/B2-B internal CPU first publish (NOT operational Worker)',()=>{
  it('checks current authority before/after readback; commits Scene+pointer+job+Audit',async()=>{
    const f=await fixture(),result=await f.run();
    expect(result).toMatchObject({versionId,revision:0,
      payloadSha256:sceneSha256(f.candidate.bytes),immutableStorageVerified:true});
    expect(authorization).toHaveBeenCalledTimes(3);
    expect(f.originalStorage.content).toHaveBeenCalledWith(f.version.storagePath);
    expect(f.sceneStorage.putVerified).toHaveBeenCalledTimes(1);
    expect(f.tx.sceneAsset.create).toHaveBeenCalledTimes(1);
    expect(f.tx.currentScene.create).toHaveBeenCalledTimes(1);
    expect(f.ready).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({status:'RUNNING',attempt:1}),
      data:expect.objectContaining({status:'READY',stage:'READY'}),
    }));
    expect(f.audit).toHaveBeenCalledWith({data:expect.objectContaining({
      actorUserId:'user-1',siteId:'site-1',action:'SCENE_PUBLISHED',
      beforeRevision:null,afterRevision:0,
    })});
  });
  it('refuses any preexisting CurrentScene without touching storage',async()=>{
    const f=await fixture();
    f.finds.mockResolvedValue({assetId:'old'});
    await expect(f.run()).rejects.toMatchObject({code:'SCENE_WORKER_POINTER_EXISTS'});
    expect(f.sceneStorage.putVerified).not.toHaveBeenCalled();
    expect(f.ready).not.toHaveBeenCalled();
  });
  it('refuses an original-source file size or content change before publication',async()=>{
    const f=await fixture();
    f.originalStorage.content.mockResolvedValue({size:source.length+1,
      stream:new ReadableStream<Uint8Array>({start(controller){controller.close();}})});
    await expect(f.run()).rejects.toMatchObject({code:'SCENE_WORKER_SOURCE_CHANGED'});
    expect(f.sceneStorage.putVerified).not.toHaveBeenCalled();
    expect(f.ready).not.toHaveBeenCalled();
  });
  it('retains uncertain blob for review when PUT/readback fails; never commits READY',async()=>{
    const f=await fixture();
    f.sceneStorage.putVerified.mockRejectedValue(new Error('storage-down'));
    await expect(f.run()).rejects.toThrow('storage-down');
    expect(f.db.sceneOrphanJob.update).toHaveBeenCalledWith(
      expect.objectContaining({data:expect.objectContaining({state:'UNCERTAIN'})}));
    expect(f.ready).not.toHaveBeenCalled();
  });
  it('preserves previous READY and quarantines prepared blob on a pointer race',async()=>{
    const f=await fixture();
    f.finds.mockResolvedValueOnce(null).mockResolvedValueOnce({assetId:'another'});
    await expect(f.run()).rejects.toMatchObject({code:'SCENE_WORKER_POINTER_EXISTS'});
    expect(f.sceneStorage.putVerified).toHaveBeenCalledTimes(1);
    expect(f.db.sceneOrphanJob.update).toHaveBeenCalledWith(
      expect.objectContaining({data:expect.objectContaining({state:'CLEANUP'})}));
    expect(f.ready).not.toHaveBeenCalled();
  });
  it('rejects a stale attempt CAS rather than marking an unverified READY',async()=>{
    const f=await fixture();
    f.ready.mockResolvedValue({count:0});
    await expect(f.run()).rejects.toMatchObject({code:'SCENE_WORKER_JOB_RACE'});
    expect(f.audit).not.toHaveBeenCalled();
    expect(f.db.sceneOrphanJob.update).toHaveBeenCalledWith(
      expect.objectContaining({data:expect.objectContaining({state:'CLEANUP'})}));
  });
  it('denies a revoked Actor during the final commit after blob write',async()=>{
    const f=await fixture();
    authorization.mockResolvedValueOnce({
      jobId:'job-1',attempt:1,versionId,sourceSha256:sha,
      actorId:'user-1',siteId:'site-1',requestId:'request-1',
    }).mockResolvedValueOnce({
      jobId:'job-1',attempt:1,versionId,sourceSha256:sha,
      actorId:'user-1',siteId:'site-1',requestId:'request-1',
    }).mockRejectedValueOnce(new CadError('SCENE_WORKER_ACCESS_REVOKED','Scene Worker access denied.',403));
    await expect(f.run()).rejects.toMatchObject({code:'SCENE_WORKER_ACCESS_REVOKED'});
    expect(f.sceneStorage.putVerified).toHaveBeenCalledTimes(1);
    expect(f.ready).not.toHaveBeenCalled();
  });
});
