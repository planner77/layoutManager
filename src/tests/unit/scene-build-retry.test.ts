import {describe,expect,it} from 'vitest';
import {canManualRetrySceneJob,MAX_CPU_SCENE_ATTEMPTS}
  from '../../domain/scene-build-retry';

describe('#225/B3 manual retry policy',()=>{
  const failed={status:'FAILED',attempt:1,
    lastCode:'SCENE_STORAGE_FAILED',startedAt:null};
  it('allows a safe manual retry without resetting consumed attempts',()=>{
    expect(canManualRetrySceneJob(failed)).toBe(true);
    expect(canManualRetrySceneJob({...failed,lastCode:'SCENE_WORKER_UNAVAILABLE'})).toBe(true);
    expect(canManualRetrySceneJob({...failed,lastCode:'SCENE_BUILD_TIMEOUT'})).toBe(true);
    expect(MAX_CPU_SCENE_ATTEMPTS).toBe(3);
  });
  it('refuses live/finished/unknown source and exhausted attempts',()=>{
    for(const status of ['QUEUED','RUNNING','RETRY_WAIT','BLOCKED','READY'])
      expect(canManualRetrySceneJob({...failed,status})).toBe(false);
    for(const lastCode of ['SCENE_AUTH_REVOKED','SCENE_DXF_PARSE_FAILED',
      'SCENE_SOURCE_DIGEST_MISMATCH','UNKNOWN','password=secret',null])
      expect(canManualRetrySceneJob({...failed,lastCode})).toBe(false);
    expect(canManualRetrySceneJob({...failed,attempt:0})).toBe(false);
    expect(canManualRetrySceneJob({...failed,attempt:3})).toBe(false);
    expect(canManualRetrySceneJob({...failed,startedAt:new Date()})).toBe(false);
  });
});
