import {beforeEach,describe,expect,it,vi} from 'vitest';
import {CadError} from '../../domain/cad';
import {CpuLineCandidateError,buildCpuLineCandidate} from '../../server/scene/cpu-line-candidate';
import {authorizeG7CpuWorkerJobTx} from '../../server/scene/scene-worker-g7-authorization';
import {publishVerifiedCpuSceneJob,readVerifiedCpuOriginal} from '../../server/scene/scene-worker-publish';
import {
  claimNextCpuSceneJob,recoverStaleCpuSceneJob,requeueDueCpuSceneJob,
  updateRunningCpuJobStage,failRunningSceneJob,requireCpuSceneWorkerRelease,
} from '../../server/scene/scene-build-job-queue';
import {runOneCpuSceneJob} from '../../server/scene/scene-cpu-worker-once';

vi.mock('../../server/scene/scene-build-job-queue',()=>({
  claimNextCpuSceneJob:vi.fn(),recoverStaleCpuSceneJob:vi.fn(),
  requeueDueCpuSceneJob:vi.fn(),updateRunningCpuJobStage:vi.fn(),
  failRunningSceneJob:vi.fn(),requireCpuSceneWorkerRelease:vi.fn(),
}));
vi.mock('../../server/scene/scene-worker-g7-authorization',()=>({
  authorizeG7CpuWorkerJobTx:vi.fn(),
}));
vi.mock('../../server/scene/scene-worker-publish',()=>({
  readVerifiedCpuOriginal:vi.fn(),publishVerifiedCpuSceneJob:vi.fn(),
}));
vi.mock('../../server/scene/cpu-line-candidate',()=>({
  CpuLineCandidateError:class CpuLineCandidateError extends Error{
    constructor(public readonly code:string){super(code);}
  },buildCpuLineCandidate:vi.fn(),
}));
const sha='a'.repeat(64);
const claimed={id:'job-1',status:'RUNNING',attempt:1,versionId:'version-1',
  sourceSha256:sha,actorId:'user-1',siteId:'site-1'};
const identity={jobId:'job-1',attempt:1,versionId:'version-1',
  sourceSha256:sha,actorId:'user-1',siteId:'site-1',requestId:'request-1'};
function fixture(){
  const tx={};
  const db={
    $transaction:vi.fn(async(fn:(arg:typeof tx)=>Promise<unknown>)=>fn(tx)),
    cadFileVersion:{findUnique:vi.fn(async()=>({
      fileFormat:'DXF',sha256:sha,storagePath:'loc/ver/original.dxf',
      fileSize:10,
    }))},
  };
  const storage={};
  const sceneStorage={};
  const run=()=>runOneCpuSceneJob({db:db as never,
    originalStorage:storage as never,sceneStorage:sceneStorage as never,
    now:new Date(2_000)});
  return {run,db};
}
beforeEach(()=>{
  vi.resetAllMocks();
  vi.mocked(claimNextCpuSceneJob).mockResolvedValue(claimed as never);
  vi.mocked(recoverStaleCpuSceneJob).mockResolvedValue(null);
  vi.mocked(requeueDueCpuSceneJob).mockResolvedValue(null);
  vi.mocked(updateRunningCpuJobStage).mockResolvedValue(true);
  vi.mocked(failRunningSceneJob).mockResolvedValue(true);
  vi.mocked(authorizeG7CpuWorkerJobTx).mockResolvedValue(identity);
  vi.mocked(readVerifiedCpuOriginal).mockResolvedValue(Buffer.from([1,2,3]));
  vi.mocked(buildCpuLineCandidate).mockResolvedValue({
    bytes:Uint8Array.from([4]),manifest:{},
  } as never);
  vi.mocked(publishVerifiedCpuSceneJob).mockResolvedValue({
    versionId:'version-1',assetId:'asset-1',revision:0,
    payloadSha256:'b'.repeat(64),immutableStorageVerified:true,
  });
});
describe('#225/B2-B dormant one-tick CPU runner',()=>{
  it('returns IDLE without accessing source or running the converter',async()=>{
    vi.mocked(claimNextCpuSceneJob).mockResolvedValueOnce(null);
    await expect(fixture().run()).resolves.toEqual({outcome:'IDLE'});
    expect(buildCpuLineCandidate).not.toHaveBeenCalled();
  });
  it('validates authority before source load, then persists only verified READY result',async()=>{
    await expect(fixture().run()).resolves.toEqual({
      outcome:'PUBLISHED',jobId:'job-1',assetId:'asset-1',
    });
    expect(authorizeG7CpuWorkerJobTx).toHaveBeenCalledTimes(1);
    expect(readVerifiedCpuOriginal).toHaveBeenCalledWith(
      expect.anything(),'loc/ver/original.dxf',10,sha);
    expect(updateRunningCpuJobStage).toHaveBeenCalledTimes(3);
    expect(publishVerifiedCpuSceneJob).toHaveBeenCalledTimes(1);
    expect(failRunningSceneJob).not.toHaveBeenCalled();
  });
  it('persists an allowlisted converter failure and never calls publisher',async()=>{
    vi.mocked(buildCpuLineCandidate).mockRejectedValueOnce(
      new CpuLineCandidateError('SCENE_CONVERTER_UNAVAILABLE'));
    await expect(fixture().run()).resolves.toEqual({
      outcome:'FAILED',jobId:'job-1',code:'SCENE_CONVERTER_UNAVAILABLE',
    });
    expect(publishVerifiedCpuSceneJob).not.toHaveBeenCalled();
    expect(failRunningSceneJob).toHaveBeenCalledWith(expect.anything(),
      'job-1',1,'SCENE_CONVERTER_UNAVAILABLE');
  });
  it('classifies revoked G7 authorization without exposing any session data',async()=>{
    vi.mocked(authorizeG7CpuWorkerJobTx).mockRejectedValueOnce(
      new CadError('SCENE_WORKER_ACCESS_REVOKED','revoked',403));
    await expect(fixture().run()).resolves.toEqual({
      outcome:'FAILED',jobId:'job-1',code:'SCENE_AUTH_REVOKED',
    });
    expect(readVerifiedCpuOriginal).not.toHaveBeenCalled();
    expect(publishVerifiedCpuSceneJob).not.toHaveBeenCalled();
  });
  it('refuses stage CAS loss before publication',async()=>{
    vi.mocked(updateRunningCpuJobStage).mockResolvedValueOnce(false);
    await expect(fixture().run()).resolves.toMatchObject({
      outcome:'FAILED',code:'SCENE_PUBLISH_CONFLICT',
    });
    expect(publishVerifiedCpuSceneJob).not.toHaveBeenCalled();
  });
  it('never claims work if the future release gate rejects',async()=>{
    vi.mocked(requireCpuSceneWorkerRelease).mockImplementationOnce(()=>{
      throw new Error('SCENE_CPU_QUEUE_RELEASE_NOT_APPROVED');
    });
    await expect(fixture().run()).rejects.toThrow('SCENE_CPU_QUEUE_RELEASE_NOT_APPROVED');
    expect(claimNextCpuSceneJob).not.toHaveBeenCalled();
    expect(failRunningSceneJob).not.toHaveBeenCalled();
  });
});
