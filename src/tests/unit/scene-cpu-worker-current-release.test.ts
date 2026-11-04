import {afterEach,describe,expect,it,vi} from 'vitest';
import {G7_GREENFIELD_SCHEMA_ID,G7_PREVIOUS_SCENE_JOB_SCHEMA_ID} from
  '../../server/g7-operational/greenfield-schema';
import {
  SCENE_CPU_WORKER_SCHEMA_ID,requireCpuSceneWorkerRelease,selectSceneEnqueueMode,
  claimNextCpuSceneJob,
} from '../../server/scene/scene-build-job-queue';

afterEach(()=>vi.unstubAllEnvs());
describe('#225/B2-B v0.61.0 explicit-off CPU Worker gate',()=>{
  it('retains the exact old 0.60.0 identity but requires both explicit flags',async()=>{
    expect(G7_PREVIOUS_SCENE_JOB_SCHEMA_ID)
      .toBe('G7-GREENFIELD-SCENE-JOBS-20261104-1');
    expect(G7_GREENFIELD_SCHEMA_ID).toBe(SCENE_CPU_WORKER_SCHEMA_ID);
    vi.stubEnv('SCENE_AUTO_BUILD_ENABLED','false');
    vi.stubEnv('SCENE_CPU_WORKER_ENABLED','false');
    expect(()=>requireCpuSceneWorkerRelease())
      .toThrow('SCENE_CPU_QUEUE_RELEASE_NOT_APPROVED');
    vi.stubEnv('SCENE_AUTO_BUILD_ENABLED','true');
    expect(()=>requireCpuSceneWorkerRelease())
      .toThrow('SCENE_CPU_QUEUE_RELEASE_NOT_APPROVED');
    expect(()=>selectSceneEnqueueMode())
      .toThrow('SCENE_CPU_QUEUE_RELEASE_NOT_APPROVED');
    vi.stubEnv('SCENE_CPU_WORKER_ENABLED','true');
    expect(()=>requireCpuSceneWorkerRelease()).not.toThrow();
    expect(selectSceneEnqueueMode()).toBe('CPU');
    vi.stubEnv('SCENE_CPU_WORKER_ENABLED','false');
    const txCall=vi.fn();
    await expect(claimNextCpuSceneJob({$transaction:txCall} as never))
      .rejects.toThrow('SCENE_CPU_QUEUE_RELEASE_NOT_APPROVED');
    expect(txCall).not.toHaveBeenCalled();
  });
});
