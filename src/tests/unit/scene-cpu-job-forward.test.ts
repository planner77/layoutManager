import {afterEach,describe,expect,it,vi} from 'vitest';
import {CAD_SCENE_BUILDER,CAD_SCENE_CPU_BUILDER} from '../../domain/cad-scene';
import {
  enqueueCpuSceneBuildTx,claimNextCpuSceneJob,requireCpuSceneWorkerRelease,
  selectSceneEnqueueMode,settleRunningCpuSceneJobError,
} from '../../server/scene/scene-build-job-queue';

// Mock ONLY the future schema review in unit tests; the real v0.60.0 schema
// stays unapproved and an operator .env cannot bypass that constant.
vi.mock('../../server/g7-operational/greenfield-schema',()=>({
  G7_GREENFIELD_SCHEMA_ID:'G7-GREENFIELD-CPU-WORKER-20261104-1',
}));
const sha='a'.repeat(64);
const intent={versionId:'version-1',sourceSha256:sha,actorId:'actor-1',siteId:'site-1',
  requestId:'request-1'};
afterEach(()=>{vi.unstubAllEnvs();});
function allow(){vi.stubEnv('SCENE_AUTO_BUILD_ENABLED','true');vi.stubEnv('SCENE_CPU_WORKER_ENABLED','true');}
function fixture(row?:Record<string,unknown>){
  const create=vi.fn(async(input:unknown)=>({id:'cpu-job-1',input}));
  const findFirst=vi.fn(async(input:{where?:{status?:string;builder?:string}})=>{
    if(!row||row.status!==input.where?.status)return null;
    if(input.where?.builder && input.where.builder!==row.builder)return null;
    return row;
  });
  const updateMany=vi.fn(async()=>({count:1}));
  const tx={sceneBuildJob:{create,findFirst,updateMany}};
  const db={$transaction:vi.fn(async(fn:(arg:typeof tx)=>Promise<unknown>)=>fn(tx))};
  return {tx,db,create,findFirst,updateMany};
}
describe('#225 B2-B CPU queued job transition in a future signed G7 release',()=>{
  it('remains disabled without both explicit feature switches',async()=>{
    const f=fixture();
    expect(()=>requireCpuSceneWorkerRelease()).toThrow('SCENE_CPU_QUEUE_RELEASE_NOT_APPROVED');
    await expect(enqueueCpuSceneBuildTx(f.tx as never,intent))
      .rejects.toThrow('SCENE_CPU_QUEUE_RELEASE_NOT_APPROVED');
    expect(f.create).not.toHaveBeenCalled();
    await expect(claimNextCpuSceneJob(f.db as never))
      .rejects.toThrow('SCENE_CPU_QUEUE_RELEASE_NOT_APPROVED');
  });
  it('selects CPU identity only under future G7 and both switches',()=>{
    expect(()=>selectSceneEnqueueMode()).toThrow('SCENE_CPU_QUEUE_RELEASE_NOT_APPROVED');
    allow();expect(selectSceneEnqueueMode()).toBe('CPU');
    vi.stubEnv('SCENE_CPU_WORKER_ENABLED','false');
    expect(()=>selectSceneEnqueueMode()).toThrow('SCENE_CPU_QUEUE_RELEASE_NOT_APPROVED');
  });
  it('retries transient storage failure with 30s backoff and CPU attempt CAS',async()=>{
    allow();const x=fixture();
    await expect(settleRunningCpuSceneJobError(x.db as never,'cpu-job-1',1,
      'SCENE_STORAGE_FAILED',new Date(2_000))).resolves.toBe('RETRY_WAIT');
    expect(x.updateMany).toHaveBeenCalledWith({
      where:{id:'cpu-job-1',status:'RUNNING',attempt:1,
        builder:CAD_SCENE_CPU_BUILDER,payloadSchema:2},
      data:{status:'RETRY_WAIT',dueAt:new Date(32_000),
        lastCode:'SCENE_STORAGE_FAILED',startedAt:null,finishedAt:null},
    });
  });
  it('terminates revoked grants and attempt3; ignores a lost CAS',async()=>{
    allow();const x=fixture();
    await expect(settleRunningCpuSceneJobError(x.db as never,'cpu-job-1',1,
      'SCENE_AUTH_REVOKED',new Date(2_000))).resolves.toBe('FAILED');
    expect(x.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data:expect.objectContaining({status:'FAILED',lastCode:'SCENE_AUTH_REVOKED'}),
    }));
    await expect(settleRunningCpuSceneJobError(x.db as never,'cpu-job-1',3,
      'SCENE_STORAGE_FAILED',new Date(2_000))).resolves.toBe('FAILED');
    x.updateMany.mockResolvedValue({count:0});
    await expect(settleRunningCpuSceneJobError(x.db as never,'cpu-job-1',1,
      'SCENE_STORAGE_FAILED')).resolves.toBeNull();
  });
  it('enqueues only exact CPU identity without any request/session credentials',async()=>{
    allow();const f=fixture();
    await expect(enqueueCpuSceneBuildTx(f.tx as never,intent))
      .resolves.toMatchObject({jobId:'cpu-job-1',status:'QUEUED'});
    const args=f.create.mock.calls[0][0] as {data:Record<string,unknown>};
    expect(args.data).toMatchObject({builder:CAD_SCENE_CPU_BUILDER,
      sourceSha256:sha,payloadSchema:2,status:'QUEUED',actorId:'actor-1',siteId:'site-1'});
    expect(Object.keys(args.data)).not.toContain('tokenHash');
    await expect(enqueueCpuSceneBuildTx(f.tx as never,{
      ...intent,tokenHash:'forged',
    } as never)).rejects.toThrow('SCENE_JOB_ENQUEUE_INVALID');
  });
  it('claims a matching due CPU Job and skips legacy Browser queued intents',async()=>{
    allow();
    const base={id:'cpu-job-1',builder:CAD_SCENE_CPU_BUILDER,payloadSchema:2,
      status:'QUEUED',attempt:0,dueAt:new Date(1000),
      createdAt:new Date(500),startedAt:null};
    const future=new Date(1100),allowed=fixture(base);
    await expect(claimNextCpuSceneJob(allowed.db as never,future))
      .resolves.toMatchObject({status:'RUNNING',attempt:1});
    expect(allowed.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({status:'QUEUED',
        builder:CAD_SCENE_CPU_BUILDER,payloadSchema:2}),
    }));
    const old=fixture({...base,builder:CAD_SCENE_BUILDER});
    await expect(claimNextCpuSceneJob(old.db as never,future)).resolves.toBeNull();
    expect(old.updateMany).not.toHaveBeenCalled();
  });
});
