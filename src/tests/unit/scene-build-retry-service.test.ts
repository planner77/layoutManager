import {beforeEach,describe,expect,it,vi} from 'vitest';
import {CadError} from '../../domain/cad';
import {manualRetryCpuSceneJob} from '../../server/scene/scene-build-retry-service';
import {requireCpuSceneWorkerRelease} from '../../server/scene/scene-build-job-queue';
import {requireG7CadPermission,appendG7SceneRetryAuthorizationAudit} from '../../server/g7-operational/cad-guard';

vi.mock('../../server/db',()=>({
  writeTransaction:vi.fn(async(db:{tx:unknown},fn:(tx:unknown)=>Promise<unknown>)=>fn(db.tx)),
}));
vi.mock('../../server/scene/scene-build-job-queue',()=>({
  requireCpuSceneWorkerRelease:vi.fn(),
}));
vi.mock('../../server/g7-operational/cad-guard',()=>({
  requireG7CadPermission:vi.fn(),appendG7SceneRetryAuthorizationAudit:vi.fn(),
}));
const versionId='11111111-1111-4111-8111-111111111111';
const sha='a'.repeat(64);
const proof={tokenHash:'hidden',requestId:'retry-request',now:Date.now(),
  runtime:{databasePath:'/safe/runtime.db',cadStoragePath:'/safe/cad',
    approvalId:'approval-1',siteIds:['site-1'],expiresAt:Date.now()+60000}};
function fixture(overrides:Record<string,unknown>={}){
  const job={id:'job-1',versionId,builder:'node-cpu-line@1.0.0+cad-scene-1',
    payloadSchema:2,sourceSha256:sha,siteId:'site-1',actorId:'actor-1',
    status:'FAILED',attempt:1,lastCode:'SCENE_STORAGE_FAILED',startedAt:null,
    finishedAt:new Date(),...overrides};
  const tx={cadFileVersion:{findUnique:vi.fn(async()=>({id:versionId,
    sha256:sha,fileFormat:'DXF'}))},
    sceneBuildJob:{findFirst:vi.fn(async()=>job),
      updateMany:vi.fn(async(_input?:unknown)=>({count:1}))},
    currentScene:{findUnique:vi.fn(async()=>null)}};
  return {db:{tx},tx,job};
}
beforeEach(()=>{
  vi.resetAllMocks();
  vi.mocked(requireG7CadPermission).mockResolvedValue({actorId:'editor-2',siteId:'site-1'});
  vi.mocked(appendG7SceneRetryAuthorizationAudit).mockResolvedValue();
});
describe('#225/B3 signed and audited retry CAS',()=>{
  it('requeues eligible FAILED job, updates actor without cookie, preserves attempt',async()=>{
    const f=fixture();
    await expect(manualRetryCpuSceneJob(f.db as never,versionId,proof as never))
      .resolves.toEqual({status:'QUEUED'});
    expect(requireG7CadPermission).toHaveBeenCalledWith(f.tx,proof,'cad:upload',
      {kind:'version',versionId});
    expect(f.tx.sceneBuildJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({status:'FAILED',attempt:1,sourceSha256:sha}),
      data:expect.objectContaining({status:'QUEUED'}),
    }));
    const update=f.tx.sceneBuildJob.updateMany.mock.calls[0][0] as {data:Record<string,unknown>};
    expect(update.data).toMatchObject({actorId:'editor-2',siteId:'site-1',
      requestId:'retry-request',lastCode:null,startedAt:null});
    expect(JSON.stringify(update.data)).not.toContain('hidden');
    expect(appendG7SceneRetryAuthorizationAudit).toHaveBeenCalledWith(
      f.tx,proof,'editor-2','site-1',versionId);
  });
  it('makes duplicate retry idempotent without duplicate audit',async()=>{
    const f=fixture({status:'QUEUED'});
    await expect(manualRetryCpuSceneJob(f.db as never,versionId,proof as never))
      .resolves.toEqual({status:'QUEUED'});
    expect(f.tx.sceneBuildJob.updateMany).not.toHaveBeenCalled();
    expect(appendG7SceneRetryAuthorizationAudit).not.toHaveBeenCalled();
  });
  it('refuses an existing READY pointer, foreign Site and exhausted attempts',async()=>{
    const f=fixture();
    f.tx.currentScene.findUnique.mockResolvedValueOnce({versionId} as never);
    await expect(manualRetryCpuSceneJob(f.db as never,versionId,proof as never))
      .rejects.toMatchObject({code:'SCENE_ALREADY_PUBLISHED'});
    const foreign=fixture({siteId:'other-site'});
    await expect(manualRetryCpuSceneJob(foreign.db as never,versionId,proof as never))
      .rejects.toMatchObject({code:'SCENE_JOB_NOT_FOUND'});
    const finished=fixture({attempt:3});
    await expect(manualRetryCpuSceneJob(finished.db as never,versionId,proof as never))
      .rejects.toMatchObject({code:'SCENE_RETRY_NOT_ALLOWED'});
    expect(appendG7SceneRetryAuthorizationAudit).not.toHaveBeenCalled();
  });
  it('denies revoked Site authorization and CAS-lost mutation',async()=>{
    const f=fixture();
    vi.mocked(requireG7CadPermission).mockRejectedValueOnce(new CadError(
      'ACCESS_DENIED','no permission',403));
    await expect(manualRetryCpuSceneJob(f.db as never,versionId,proof as never))
      .rejects.toMatchObject({code:'ACCESS_DENIED'});
    expect(f.tx.sceneBuildJob.updateMany).not.toHaveBeenCalled();
    vi.mocked(requireG7CadPermission).mockResolvedValue({actorId:'editor-2',siteId:'site-1'});
    const retry=fixture();
    retry.tx.sceneBuildJob.updateMany.mockResolvedValueOnce({count:0});
    await expect(manualRetryCpuSceneJob(retry.db as never,versionId,proof as never))
      .rejects.toMatchObject({code:'SCENE_RETRY_CONFLICT'});
    expect(appendG7SceneRetryAuthorizationAudit).not.toHaveBeenCalled();
  });
  it('fails closed when CPU release is not approved',async()=>{
    vi.mocked(requireCpuSceneWorkerRelease).mockImplementationOnce(()=>{
      throw new Error('SCENE_CPU_QUEUE_RELEASE_NOT_APPROVED');
    });
    const f=fixture();
    await expect(manualRetryCpuSceneJob(f.db as never,versionId,proof as never))
      .rejects.toMatchObject({code:'SCENE_CPU_QUEUE_RELEASE_NOT_APPROVED'});
    expect(requireG7CadPermission).not.toHaveBeenCalled();
  });
});
