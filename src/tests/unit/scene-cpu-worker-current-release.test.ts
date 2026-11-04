import {afterEach,describe,expect,it,vi} from 'vitest';
import {G7_GREENFIELD_SCHEMA_ID} from '../../server/g7-operational/greenfield-schema';
import {
  SCENE_CPU_WORKER_SCHEMA_ID,requireCpuSceneWorkerRelease,
  enqueueCpuSceneBuildTx,claimNextCpuSceneJob,
} from '../../server/scene/scene-build-job-queue';
import {authorizeG7CpuWorkerJobTx} from '../../server/scene/scene-worker-g7-authorization';

afterEach(()=>vi.unstubAllEnvs());
describe('#225/B2-B real v0.60.0 CPU Worker hard-off gate',()=>{
  it('never admits a CPU Job or touches the DB even with both environment switches ON',async()=>{
    vi.stubEnv('SCENE_AUTO_BUILD_ENABLED','true');
    vi.stubEnv('SCENE_CPU_WORKER_ENABLED','true');
    expect(G7_GREENFIELD_SCHEMA_ID).toBe('G7-GREENFIELD-SCENE-JOBS-20261104-1');
    expect(String(G7_GREENFIELD_SCHEMA_ID)).not.toBe(SCENE_CPU_WORKER_SCHEMA_ID);
    expect(()=>requireCpuSceneWorkerRelease())
      .toThrow('SCENE_CPU_QUEUE_RELEASE_NOT_APPROVED');
    const create=vi.fn();
    await expect(enqueueCpuSceneBuildTx({
      sceneBuildJob:{create},
    } as never,{versionId:'v',sourceSha256:'a'.repeat(64),
      actorId:'user',siteId:'site',requestId:'r'}))
      .rejects.toThrow('SCENE_CPU_QUEUE_RELEASE_NOT_APPROVED');
    const txCall=vi.fn();
    await expect(claimNextCpuSceneJob({$transaction:txCall} as never))
      .rejects.toThrow('SCENE_CPU_QUEUE_RELEASE_NOT_APPROVED');
    const findJob=vi.fn();
    await expect(authorizeG7CpuWorkerJobTx({
      sceneBuildJob:{findUnique:findJob},
    } as never,'job-1',1))
      .rejects.toMatchObject({code:'SCENE_WORKER_RELEASE_NOT_APPROVED'});
    expect(create).not.toHaveBeenCalled();
    expect(txCall).not.toHaveBeenCalled();
    expect(findJob).not.toHaveBeenCalled();
  });
});
