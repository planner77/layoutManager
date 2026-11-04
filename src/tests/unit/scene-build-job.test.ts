import { describe, expect, it } from 'vitest';
import {
  SCENE_BUILD_CONTRACT, SCENE_BUILD_STAGES, canTransitionJob,
  safeBuildErrorCode, safeBuildStage, sceneBuildPublicSummary, sceneRetryDelayMs,
} from '../../domain/scene-build-job';

describe('#208 P1-A durable job state safety contract', () => {
  it('versions the ordered stages and classifies unknown/untrusted data safely', () => {
    expect(SCENE_BUILD_CONTRACT).toBe('scene-build-v1');
    expect(SCENE_BUILD_STAGES).toEqual([
      'UPLOAD_REGISTERED', 'JOB_ENQUEUED', 'SOURCE_READ', 'SOURCE_VERIFY',
      'FONT_PREPARE', 'DXF_PARSE', 'SCENE_BUILD', 'OPTIONAL_INDEX',
      'SERIALIZE', 'PAYLOAD_VALIDATE', 'STORAGE_VERIFY', 'POINTER_PUBLISH', 'READY',
    ]);
    expect(safeBuildStage('DXF_PARSE')).toBe('DXF_PARSE');
    expect(safeBuildStage('private/source/hidden')).toBeNull();
    expect(safeBuildErrorCode('SCENE_CONVERTER_UNAVAILABLE')).toBe('SCENE_CONVERTER_UNAVAILABLE');
    expect(safeBuildErrorCode('private/source/hidden')).toBe('UNKNOWN');
  });
  it('does not allow READY without verified CurrentScene, nor terminal-state revival', () => {
    expect(canTransitionJob('QUEUED', 'RUNNING')).toBe(true);
    expect(canTransitionJob('RUNNING', 'READY')).toBe(false);
    expect(canTransitionJob('RUNNING', 'READY', true)).toBe(true);
    expect(canTransitionJob('RUNNING', 'RETRY_WAIT')).toBe(true);
    expect(canTransitionJob('RETRY_WAIT', 'QUEUED')).toBe(true);
    expect(canTransitionJob('FAILED', 'RUNNING')).toBe(false);
    expect(canTransitionJob('BLOCKED', 'RUNNING')).toBe(false);
    expect(canTransitionJob('READY', 'RUNNING')).toBe(false);
    expect(canTransitionJob('READY', 'READY', true)).toBe(false);
  });
  it('uses bounded exponential retry delays', () => {
    expect([1, 2, 3, 4, 5, 10].map(sceneRetryDelayMs))
      .toEqual([30_000, 60_000, 120_000, 240_000, 480_000, 1_800_000]);
    expect(() => sceneRetryDelayMs(0)).toThrow();
    expect(() => sceneRetryDelayMs(NaN)).toThrow();
  });
  it('never confuses successful job or Viewer fallback with validated server READY', () => {
    expect(sceneBuildPublicSummary({ fileFormat: 'DWG', validatedScene: 'READY',
      jobState: 'RUNNING', stage: 'DXF_PARSE' }))
      .toEqual({ scene: 'NOT_APPLICABLE', build: null, phase: null });
    expect(sceneBuildPublicSummary({ fileFormat: 'DXF', validatedScene: 'MISSING',
      jobState: 'RUNNING', stage: 'DXF_PARSE' }))
      .toEqual({ scene: 'RUNNING', build: 'RUNNING', phase: 'DXF_PARSE' });
    expect(sceneBuildPublicSummary({ fileFormat: 'DXF', validatedScene: 'MISSING',
      jobState: 'READY', stage: 'READY' })).toMatchObject({ scene: 'REBUILD_REQUIRED' });
    // Infrastructure outage is not proof of Scene corruption or Worker failure.
    expect(sceneBuildPublicSummary({ fileFormat: 'DXF', validatedScene: 'UNAVAILABLE',
      jobState: 'READY' })).toMatchObject({ scene: 'UNAVAILABLE' });
    // A stale BLOCKED job is also not evidence of the Scene pointer's health.
    expect(sceneBuildPublicSummary({ fileFormat: 'DXF', validatedScene: 'UNAVAILABLE',
      jobState: 'BLOCKED', stage: 'private/source' }))
      .toEqual({ scene: 'UNAVAILABLE', build: 'BLOCKED', phase: null });
    // A job saying READY without a verified CurrentScene must never display completion.
    expect(sceneBuildPublicSummary({ fileFormat: 'DXF', validatedScene: 'READY',
      jobState: 'RUNNING', stage: 'DXF_PARSE' }))
      .toEqual({ scene: 'READY', build: 'RUNNING', phase: 'DXF_PARSE' });
    // Verified corrupt immutable pointer outranks historical Worker FAILED;
    // the Job status remains available to the server but is not Scene health.
    expect(sceneBuildPublicSummary({ fileFormat: 'DXF', validatedScene: 'REBUILD_REQUIRED',
      jobState: 'FAILED', stage: 'private/stack' }))
      .toEqual({ scene: 'REBUILD_REQUIRED', build: 'FAILED', phase: null });
  });
});
