import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {sceneSchemaAvailable} from '../../server/scene/scene-repository';
import {readSceneBuildBatch} from '../../server/scene/scene-build-status-batch';

vi.mock('../../server/scene/scene-repository',()=>({
  sceneSchemaAvailable:vi.fn(),
}));
const id='11111111-1111-4111-8111-111111111111';
const id2='22222222-2222-4222-8222-222222222222';
const sha='a'.repeat(64);
const makeVersion=(versionId:string,siteId:string,fileFormat='DXF')=>({
  id:versionId,sha256:sha,fileFormat,location:{building:{siteId}},
});
const job=(status:string,code:string|null=null,attempt=1)=>({
  versionId:id,status,stage:'SOURCE_VERIFY',attempt,lastCode:code,
  sourceSha256:sha,startedAt:null,
});
function fixture(options:Readonly<{
  versions?:ReturnType<typeof makeVersion>[];
  jobs?:ReturnType<typeof job>[];
  pointers?:unknown[];
  jobTable?:boolean;
}>={}){
  const db={
    cadFileVersion:{findMany:vi.fn(async()=>options.versions??[
      makeVersion(id,'site-1'),makeVersion(id2,'site-2'),
    ])},
    $queryRawUnsafe:vi.fn(async()=>options.jobTable===false?[]:[{name:'SceneBuildJob'}]),
    sceneBuildJob:{findMany:vi.fn(async()=>options.jobs??[job('RUNNING')])},
    currentScene:{findMany:vi.fn(async()=>options.pointers??[])},
  };
  const storage={owns:vi.fn(()=>true),readVerified:vi.fn(async()=>new Uint8Array([1]))};
  return {db,storage,
    run:(read:string[]=['site-1'],write:string[]=[])=>readSceneBuildBatch(
      db as never,storage as never,[id,id2],read,write),
  };
}
beforeEach(()=>{
  vi.resetAllMocks();
  vi.mocked(sceneSchemaAvailable).mockResolvedValue(true);
});
afterEach(()=>vi.unstubAllEnvs());
describe('#225/B3 scoped batch summary',()=>{
  it('omits unauthorized Site keys and reads jobs/pointers once for the page',async()=>{
    const f=fixture();
    const response=await f.run();
    expect(Object.keys(response.rows)).toEqual([id]);
    expect(response.rows[id]).toMatchObject({
      state:'RUNNING',polling:true,phase:'SOURCE_VERIFY',canRetry:false,
    });
    expect(f.db.cadFileVersion.findMany).toHaveBeenCalledTimes(1);
    expect(f.db.sceneBuildJob.findMany).toHaveBeenCalledTimes(1);
    expect(f.db.currentScene.findMany).toHaveBeenCalledTimes(1);
    expect(f.db.sceneBuildJob.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({versionId:{in:[id]}}),
    }));
  });
  it('does not infer verified READY from Job READY without pointer',async()=>{
    const f=fixture({jobs:[job('READY')]});
    expect((await f.run()).rows[id]).toMatchObject({
      state:'REBUILD_REQUIRED',polling:false,
    });
  });
  it('reports a corrupt immutable Scene pointer as REBUILD_REQUIRED',async()=>{
    const f=fixture({jobs:[job('FAILED','SCENE_STORAGE_FAILED')],
      pointers:[{versionId:id,asset:{
        id:'asset-1',versionId:id,sourceSha256:sha,
        manifestJson:'{}',format:'CUSTOM_DTO',byteLength:1,digest:sha,
        storageLocator:'asset-1',
      }}]});
    expect((await f.run(['site-1'],['site-1'])).rows[id]).toMatchObject({
      state:'REBUILD_REQUIRED',canRetry:false,errorCode:null,
    });
    expect(f.storage.readVerified).not.toHaveBeenCalled();
  });
  it('offers retries only to a signed writer for a transient failed CPU job',async()=>{
    vi.stubEnv('SCENE_AUTO_BUILD_ENABLED','true');
    vi.stubEnv('SCENE_CPU_WORKER_ENABLED','true');
    const f=fixture({jobs:[job('FAILED','SCENE_STORAGE_FAILED')]});
    expect((await f.run()).rows[id]).toMatchObject({state:'FAILED',canRetry:false});
    expect((await f.run(['site-1'],['site-1'])).rows[id]).toMatchObject({
      state:'FAILED',errorCode:'SCENE_STORAGE_FAILED',canRetry:true,
    });
  });
  it('projects only allowlisted BLOCKED and RETRY_WAIT reasons, and no historical reason on missing verified READY',async()=>{
    const blocked=fixture({jobs:[job('BLOCKED','SCENE_AUTH_REVOKED')]});
    expect((await blocked.run()).rows[id]).toMatchObject({
      state:'BLOCKED',errorCode:'SCENE_AUTH_REVOKED',canRetry:false,
    });
    const waiting=fixture({jobs:[job('RETRY_WAIT','private/path/token')]});
    expect((await waiting.run()).rows[id]).toMatchObject({
      state:'RETRY_WAIT',errorCode:'UNKNOWN',polling:true,
    });
    const historical=fixture({jobs:[job('READY','SCENE_AUTH_REVOKED')]});
    expect((await historical.run()).rows[id]).toMatchObject({
      state:'REBUILD_REQUIRED',errorCode:null,
    });
  });
  it('returns an unavailable state on legacy missing tables without SQL exceptions',async()=>{
    vi.mocked(sceneSchemaAvailable).mockResolvedValueOnce(false);
    const f=fixture({jobTable:false});
    const result=await f.run();
    expect(result.rows[id]).toMatchObject({state:'UNAVAILABLE',canRetry:false});
    expect(f.db.sceneBuildJob.findMany).not.toHaveBeenCalled();
    expect(f.db.currentScene.findMany).not.toHaveBeenCalled();
  });
  it('does not reveal versions when the requester has no signed Site grants',async()=>{
    const f=fixture();
    expect(await f.run([])).toEqual({rows:{}});
    expect(f.db.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});
