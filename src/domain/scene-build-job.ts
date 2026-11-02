/**
 * #208 P1-A pure queue/state contract. Schema and Worker integration are gated
 * on Node CPU-only conversion fidelity. No authentication or DB writes here.
 */
export const SCENE_BUILD_CONTRACT = 'scene-build-v1' as const;
export const SCENE_BUILD_STAGES = [
  'UPLOAD_REGISTERED', 'JOB_ENQUEUED', 'SOURCE_READ', 'SOURCE_VERIFY',
  'FONT_PREPARE', 'DXF_PARSE', 'SCENE_BUILD', 'OPTIONAL_INDEX',
  'SERIALIZE', 'PAYLOAD_VALIDATE', 'STORAGE_VERIFY', 'POINTER_PUBLISH', 'READY',
] as const;
export type SceneBuildStage = typeof SCENE_BUILD_STAGES[number];
export type SceneBuildStatus = 'QUEUED' | 'RUNNING' | 'RETRY_WAIT' | 'READY' | 'FAILED' | 'BLOCKED';
export type SceneBuildErrorCode =
  'SCENE_SOURCE_UNAVAILABLE' | 'SCENE_SOURCE_DIGEST_MISMATCH' |
  'SCENE_FONT_UNAVAILABLE' | 'SCENE_DXF_PARSE_FAILED' | 'SCENE_CONVERTER_UNAVAILABLE' |
  'SCENE_BUILD_TIMEOUT' | 'SCENE_SERIALIZE_FAILED' | 'SCENE_ASSET_TOO_LARGE' |
  'SCENE_VALIDATE_FAILED' | 'SCENE_STORAGE_FAILED' | 'SCENE_PUBLISH_CONFLICT' |
  'SCENE_AUTH_REVOKED' | 'SCENE_WORKER_UNAVAILABLE' | 'UNKNOWN';

const codes = new Set<SceneBuildErrorCode>([
  'SCENE_SOURCE_UNAVAILABLE', 'SCENE_SOURCE_DIGEST_MISMATCH',
  'SCENE_FONT_UNAVAILABLE', 'SCENE_DXF_PARSE_FAILED', 'SCENE_CONVERTER_UNAVAILABLE',
  'SCENE_BUILD_TIMEOUT', 'SCENE_SERIALIZE_FAILED', 'SCENE_ASSET_TOO_LARGE',
  'SCENE_VALIDATE_FAILED', 'SCENE_STORAGE_FAILED', 'SCENE_PUBLISH_CONFLICT',
  'SCENE_AUTH_REVOKED', 'SCENE_WORKER_UNAVAILABLE', 'UNKNOWN',
]);
const stages = new Set<string>(SCENE_BUILD_STAGES);
export function safeBuildErrorCode(value: unknown): SceneBuildErrorCode {
  return typeof value === 'string' && codes.has(value as SceneBuildErrorCode)
    ? value as SceneBuildErrorCode : 'UNKNOWN';
}
export function safeBuildStage(value: unknown): SceneBuildStage | null {
  return typeof value === 'string' && stages.has(value) ? value as SceneBuildStage : null;
}
export function canTransitionJob(from: SceneBuildStatus, to: SceneBuildStatus,
  verifiedPointer = false): boolean {
  if (from === to) return false;
  if (to === 'READY' && !verifiedPointer) return false;
  const edges: Readonly<Record<SceneBuildStatus, readonly SceneBuildStatus[]>> = {
    QUEUED: ['RUNNING', 'BLOCKED', 'FAILED'],
    RUNNING: ['RETRY_WAIT', 'READY', 'FAILED', 'BLOCKED'],
    RETRY_WAIT: ['QUEUED', 'FAILED', 'BLOCKED'],
    READY: [], FAILED: [], BLOCKED: [],
  };
  return edges[from].includes(to);
}

/** Attempts are 1-based. A persisted dueAt and bounded retry count are mandatory. */
export function sceneRetryDelayMs(attempt: number): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 10)
    throw new Error('SCENE_ATTEMPT_INVALID');
  return Math.min(30_000 * 2 ** (attempt - 1), 30 * 60_000);
}
export type SceneBuildPublicState =
  'NOT_APPLICABLE' | 'MISSING' | 'REBUILD_REQUIRED' | 'QUEUED' |
  'RUNNING' | 'RETRY_WAIT' | 'READY' | 'FAILED' | 'BLOCKED' | 'UNAVAILABLE';
export type SceneBuildPublicSummary = Readonly<{
  scene: SceneBuildPublicState;
  build: SceneBuildStatus | null;
  phase: SceneBuildStage | null;
}>;
/**
 * Public list aggregation must not infer READY from job.status; only a
 * validated immutable pointer is authoritative. Private jobId/actor/source
 * SHA/error/locator/stack never enter this public DTO.
 */
export function sceneBuildPublicSummary(input: Readonly<{
  fileFormat: string;
  validatedScene: 'READY' | 'MISSING' | 'REBUILD_REQUIRED' | 'UNAVAILABLE';
  jobState?: SceneBuildStatus | null;
  stage?: unknown;
}>): SceneBuildPublicSummary {
  if (input.fileFormat !== 'DXF')
    return { scene: 'NOT_APPLICABLE', build: null, phase: null };
  const jobState = input.jobState ?? null;
  const status = input.validatedScene === 'READY' ? 'READY'
    : jobState === 'READY' ? 'REBUILD_REQUIRED' : jobState ?? input.validatedScene;
  return { scene: status, build: jobState, phase: jobState === 'RUNNING' ? safeBuildStage(input.stage) : null };
}
