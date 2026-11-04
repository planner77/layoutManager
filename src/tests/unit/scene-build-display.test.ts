import {describe,expect,it} from 'vitest';
import {sceneStatusBadge,shouldPollSceneRows} from '../../domain/scene-build-display';

describe('#225/B3 safe Scene status presentation',()=>{
  it('never treats a job READY flag as a verified Scene pointer',()=>{
    expect(sceneStatusBadge({fileFormat:'DXF',validatedScene:'MISSING',
      jobState:'READY'})).toMatchObject({
      state:'REBUILD_REQUIRED',label:'Scene 재생성 필요',polling:false,
    });
    expect(sceneStatusBadge({fileFormat:'DXF',validatedScene:'READY',
      jobState:'FAILED'})).toMatchObject({
      state:'READY',label:'Scene 완료',polling:false,
    });
  });
  it('omits job status for unsupported DWG',()=>{
    expect(sceneStatusBadge({fileFormat:'DWG',validatedScene:'READY',
      jobState:'RUNNING',stage:'SOURCE_READ'})).toEqual({
      state:'NOT_APPLICABLE',label:'해당 없음',tone:'neutral',polling:false,phase:null,
    });
  });
  it('only exposes allowlisted running stages and never arbitrary stage input',()=>{
    expect(sceneStatusBadge({fileFormat:'DXF',validatedScene:'MISSING',
      jobState:'RUNNING',stage:'SOURCE_VERIFY'}).phase).toBe('SOURCE_VERIFY');
    expect(sceneStatusBadge({fileFormat:'DXF',validatedScene:'MISSING',
      jobState:'RUNNING',stage:'secret-token-dump'}).phase).toBeNull();
    expect(sceneStatusBadge({fileFormat:'DXF',validatedScene:'MISSING',
      jobState:'FAILED',stage:'SOURCE_VERIFY'}).phase).toBeNull();
  });
  it('polls only a visible pending row with feature enabled',()=>{
    const queued=sceneStatusBadge({fileFormat:'DXF',validatedScene:'MISSING',
      jobState:'QUEUED'});
    const failed=sceneStatusBadge({fileFormat:'DXF',validatedScene:'MISSING',
      jobState:'FAILED'});
    const retry=sceneStatusBadge({fileFormat:'DXF',validatedScene:'MISSING',
      jobState:'RETRY_WAIT'});
    expect(shouldPollSceneRows([failed,queued],true,true)).toBe(true);
    expect(shouldPollSceneRows([retry],true,true)).toBe(true);
    expect(shouldPollSceneRows([queued],false,true)).toBe(false);
    expect(shouldPollSceneRows([queued],true,false)).toBe(false);
    expect(shouldPollSceneRows([failed],true,true)).toBe(false);
  });
  it('does not leak arbitrary diagnostic strings into the public label',()=>{
    const view=sceneStatusBadge({fileFormat:'DXF',validatedScene:'UNAVAILABLE',
      jobState:'BLOCKED',stage:'password=secret'});
    // Scene verification is unavailable; a historical blocked Job does not
    // prove the immutable pointer's health. Preserve the safe public label.
    expect(view).toMatchObject({state:'UNAVAILABLE',label:'상태 확인 불가',
      tone:'warning',polling:false,phase:null});
    expect(JSON.stringify(view)).not.toContain('secret');
  });
});
