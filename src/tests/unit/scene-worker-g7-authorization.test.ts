import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {CAD_SCENE_BUILDER,CAD_SCENE_CPU_BUILDER} from '../../domain/cad-scene';
import {resolveG7RuntimeGate} from '../../server/g7-operational/runtime-gate';
import {authorizeG7CpuWorkerJobTx} from '../../server/scene/scene-worker-g7-authorization';

// Simulate a hypothetical future reviewed schema ONLY in this unit suite.
// The real current 0.60.0 constant deliberately blocks runtime activation.
vi.mock('../../server/g7-operational/greenfield-schema',()=>({
  G7_GREENFIELD_SCHEMA_ID:'G7-GREENFIELD-CPU-WORKER-20261104-1',
}));
vi.mock('../../server/g7-operational/runtime-gate',()=>({
  resolveG7RuntimeGate:vi.fn(),
}));
const mocked=vi.mocked(resolveG7RuntimeGate);
const sha='a'.repeat(64);
const job={id:'job-001',versionId:'version-001',sourceSha256:sha,
  builder:CAD_SCENE_CPU_BUILDER,payloadSchema:2,actorId:'user-001',
  siteId:'site-001',requestId:'request-001',status:'RUNNING',
  attempt:1,startedAt:new Date(1000)};
const version={id:'version-001',fileFormat:'DXF',sha256:sha,location:{
  active:true,building:{active:true,site:{id:'site-001',active:true}},
}};
const actor={id:'user-001',status:'ACTIVE',mustChangePassword:false,
  roles:[{role:'Editor'}],sites:[{siteId:'site-001'}]};
function fixture(changes?:{job?:Record<string,unknown>;version?:Record<string,unknown>;actor?:Record<string,unknown>}){
  const findJob=vi.fn(async()=>changes?.job?{...job,...changes.job}:job);
  const findVersion=vi.fn(async()=>changes?.version?{...version,...changes.version}:version);
  const findActor=vi.fn(async()=>changes?.actor?{...actor,...changes.actor}:actor);
  const tx={sceneBuildJob:{findUnique:findJob},
    cadFileVersion:{findUnique:findVersion},user:{findUnique:findActor}};
  return {tx,findJob,findVersion,findActor};
}
const active={
  state:'ACTIVE',cadWriteEnabled:true,siteIds:['site-001'],authEnabled:true,
  approvalId:'OWNER-test',databasePath:'/tmp/fake-db',cadStoragePath:'/tmp/fake-cad',
};
beforeEach(()=>{
  vi.stubEnv('SCENE_AUTO_BUILD_ENABLED','true');
  vi.stubEnv('SCENE_CPU_WORKER_ENABLED','true');
  mocked.mockReturnValue(active as never);
});
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
describe('#225 B2-B internal Worker live authorization (future release mock only)',()=>{
  it('loads current Actor/Site/Version and rechecks signed runtime without session secrets',async()=>{
    const f=fixture();
    await expect(authorizeG7CpuWorkerJobTx(f.tx as never,'job-001',1)).resolves.toEqual({
      jobId:'job-001',attempt:1,versionId:'version-001',sourceSha256:sha,
      actorId:'user-001',siteId:'site-001',requestId:'request-001',
    });
    expect(mocked).toHaveBeenCalledTimes(2);
    expect(f.findActor).toHaveBeenCalledTimes(1);
    expect(Object.keys(f.tx)).not.toContain('authSession');
  });
  it('is disabled by default or when explicit Auto Build is OFF',async()=>{
    for(const [key,value] of [
      ['SCENE_CPU_WORKER_ENABLED','false'],['SCENE_AUTO_BUILD_ENABLED','false'],
    ]){vi.stubEnv(key,value);
      const f=fixture();
      await expect(authorizeG7CpuWorkerJobTx(f.tx as never,'job-001',1))
        .rejects.toMatchObject({code:'SCENE_WORKER_RELEASE_NOT_APPROVED'});
      expect(f.findJob).not.toHaveBeenCalled();
      vi.stubEnv(key,'true');
    }
  });
  it('requires a signed ACTIVE write runtime and the current authorised Site',async()=>{
    mocked.mockReturnValueOnce({state:'OFF'} as never);
    await expect(authorizeG7CpuWorkerJobTx(fixture().tx as never,'job-001',1))
      .rejects.toMatchObject({code:'SCENE_WORKER_RUNTIME_DENIED'});
    mocked.mockReturnValue(active as never);
    mocked.mockReturnValueOnce(active as never)
      .mockReturnValueOnce({...active,siteIds:['other']} as never);
    await expect(authorizeG7CpuWorkerJobTx(fixture().tx as never,'job-001',1))
      .rejects.toMatchObject({code:'SCENE_WORKER_RUNTIME_DENIED'});
  });
  it('denies status/attempt/Builder/schema tampering',async()=>{
    for(const mutation of [
      {status:'QUEUED'},{status:'FAILED'},{attempt:2},
      {builder:CAD_SCENE_BUILDER},{payloadSchema:1},{startedAt:null},
    ]){
      await expect(authorizeG7CpuWorkerJobTx(fixture({job:mutation}).tx as never,'job-001',1))
        .rejects.toMatchObject({code:'SCENE_WORKER_JOB_INVALID'});
    }
  });
  it('denies changed Source, another Site, inactive hierarchy and an inactive Actor',async()=>{
    for(const changes of [
      {job:{sourceSha256:'b'.repeat(64)}},
      {job:{siteId:'another'}},
      {version:{fileFormat:'DWG'}},
      {version:{location:{...version.location,active:false}}},
      {version:{location:{...version.location,building:{...version.location.building,active:false}}}},
      {version:{location:{...version.location,building:{
        ...version.location.building,site:{...version.location.building.site,active:false}}}}},
      {actor:{status:'DISABLED'}},
      {actor:{mustChangePassword:true}},
      {actor:{roles:[{role:'Reader'}]}},
      {actor:{sites:[{siteId:'other'}]}},
    ]){
      await expect(authorizeG7CpuWorkerJobTx(fixture(changes).tx as never,'job-001',1))
        .rejects.toMatchObject({code:'SCENE_WORKER_ACCESS_REVOKED'});
    }
  });
});
