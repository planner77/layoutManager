/**
 * #109 S3-1 — pure, non-routed release and operation preflight.
 * This is NOT a runtime switch or a deployment command. S3-2/3/4 must wire
 * trusted build/OCI and live DB evidence to a separate approved cutover.
 * It never reads cookies, HTTP headers or a user-supplied approval.
 */
export const G7_S3_CAPABILITY = 'G7-S3-AUTH-V1' as const;
export const G7_S3_SCHEMA_ID = '202610260002_g7_operational_auth' as const;
const sha = /^[a-f0-9]{40}$/;
const digest = /^sha256:[a-f0-9]{64}$/;
const version = /^\d+\.\d+\.\d+$/;
const id = /^(?:OWNER|CR|SNAP)-[A-Za-z0-9_-]{2,64}$/;
const time = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const validTime = (v: unknown): v is string =>
  typeof v === 'string' && time.test(v) &&
  Number.isFinite(Date.parse(v)) && new Date(v).toISOString().startsWith(v.replace(/Z$/, '').slice(0, 19));
const hexDigest = (v: unknown): v is string => typeof v === 'string' && digest.test(v);
const commit = (v: unknown): v is string => typeof v === 'string' && sha.test(v);
const validId = (v: unknown): v is string => typeof v === 'string' && id.test(v);

export type G7S3BuildIdentity = Readonly<{
  capability: string;
  sourceCommit: string;
  schemaId: string;
  app: { version: string; digest: string; sourceCommit: string };
  migrator: { version: string; digest: string; sourceCommit: string };
}>;

export type G7S3ReleaseEvidence = Readonly<{
  appDigestRegistryVerified: boolean;
  migratorDigestRegistryVerified: boolean;
  migrationSchemaVerified: boolean;
  sourceCommitVerified: boolean;
  foreignKeyViolations: number;
  rollbackPairVerified: boolean;
  snapshotRestoreVerified: boolean;
}>;

export type G7S3OperationApproval = Readonly<{
  decision: 'GO' | 'NO_GO';
  scope: string;
  ownerApprovalId: string;
  changeRequestId: string;
  notBeforeUtc: string;
  expiresAtUtc: string;
  sourceCommit: string;
  schemaId: string;
  appDigest: string;
  migratorDigest: string;
  rollbackAppDigest: string;
  rollbackMigratorDigest: string;
  snapshotId: string;
}>;

export type G7S3Preflight = Readonly<{
  state: 'OFF' | 'BLOCKED' | 'READY_FOR_RUNTIME_INTEGRATION';
  releaseReady: boolean;
  operationReady: boolean;
  authEligible: boolean;
  writeEligible: boolean;
  /** Always false: this module is not imported by any production route. */
  runtimeActivated: false;
  reasons: readonly string[];
}>;

/** Values must be supplied by trusted build/registry/DB verification. In S3-1
 * there is no such runtime binding; synthetic unit inputs are NOT evidence.
 */
export function evaluateG7S3Preflight(
  env: Readonly<Record<string, string | undefined>>,
  build: G7S3BuildIdentity | null,
  verification: G7S3ReleaseEvidence | null,
  owner: G7S3OperationApproval | null,
  now: number,
): G7S3Preflight {
  const reasons: string[] = [];
  const authRequested = env.G7_AUTH_ENABLED === 'true';
  const writeRequested = env.G7_CAD_WRITE_CUTOVER_ENABLED === 'true';
  if (env.G7_AUTH_ENABLED !== undefined &&
      env.G7_AUTH_ENABLED !== 'true' && env.G7_AUTH_ENABLED !== 'false')
    reasons.push('INVALID_AUTH_SWITCH');
  if (env.G7_CAD_WRITE_CUTOVER_ENABLED !== undefined &&
      env.G7_CAD_WRITE_CUTOVER_ENABLED !== 'true' &&
      env.G7_CAD_WRITE_CUTOVER_ENABLED !== 'false')
    reasons.push('INVALID_WRITE_SWITCH');
  if (writeRequested && !authRequested) reasons.push('WRITE_REQUIRES_AUTH');
  // Inert startup/default OFF never reads untrusted release approval data.
  if (!authRequested) return {
    state: 'OFF', releaseReady: false, operationReady: false, authEligible: false,
    writeEligible: false, runtimeActivated: false, reasons: [...new Set(reasons)],
  };

  let releaseReady = true;
  if (!build ||
      build.capability !== G7_S3_CAPABILITY ||
      build.schemaId !== G7_S3_SCHEMA_ID ||
      !commit(build.sourceCommit) ||
      !version.test(build.app.version) || !version.test(build.migrator.version) ||
      build.app.version !== build.migrator.version ||
      !hexDigest(build.app.digest) || !hexDigest(build.migrator.digest) ||
      build.app.sourceCommit !== build.sourceCommit ||
      build.migrator.sourceCommit !== build.sourceCommit ||
      env.G7_RELEASE_CAPABILITY !== G7_S3_CAPABILITY ||
      env.G7_RELEASE_SOURCE_COMMIT !== build.sourceCommit ||
      env.G7_RELEASE_SCHEMA_ID !== G7_S3_SCHEMA_ID ||
      env.G7_RELEASE_APP_DIGEST !== build.app.digest ||
      env.G7_RELEASE_MIGRATOR_DIGEST !== build.migrator.digest ||
      env.G7_RELEASE_VERSION !== build.app.version) {
    releaseReady = false;
    reasons.push('RELEASE_IDENTITY_MISMATCH');
  }
  if (!verification ||
      verification.appDigestRegistryVerified !== true ||
      verification.migratorDigestRegistryVerified !== true ||
      verification.sourceCommitVerified !== true ||
      verification.migrationSchemaVerified !== true ||
      verification.foreignKeyViolations !== 0 ||
      verification.rollbackPairVerified !== true ||
      verification.snapshotRestoreVerified !== true) {
    releaseReady = false;
    reasons.push('RELEASE_EVIDENCE_MISSING');
  }
  let operationReady = true;
  const validWindow = !!owner &&
    validTime(owner.notBeforeUtc) && validTime(owner.expiresAtUtc) &&
    Number.isSafeInteger(now) && now >= Date.parse(owner.notBeforeUtc) &&
    now <= Date.parse(owner.expiresAtUtc) &&
    Date.parse(owner.notBeforeUtc) < Date.parse(owner.expiresAtUtc);
  if (!owner ||
      owner.decision !== 'GO' ||
      owner.scope !== 'G7-S3-AUTH-CUTOVER' ||
      !validId(owner.ownerApprovalId) || !owner.ownerApprovalId.startsWith('OWNER-') ||
      !validId(owner.changeRequestId) || !owner.changeRequestId.startsWith('CR-') ||
      !validId(owner.snapshotId) || !owner.snapshotId.startsWith('SNAP-') ||
      !hexDigest(owner.rollbackAppDigest) ||
      !hexDigest(owner.rollbackMigratorDigest) ||
      !validWindow ||
      !build ||
      owner.sourceCommit !== build.sourceCommit ||
      owner.schemaId !== build.schemaId ||
      owner.appDigest !== build.app.digest ||
      owner.migratorDigest !== build.migrator.digest ||
      env.G7_OPERATION_APPROVAL_ID !== owner.ownerApprovalId ||
      env.G7_OPERATION_CHANGE_ID !== owner.changeRequestId) {
    operationReady = false;
    reasons.push('OWNER_RELEASE_SPECIFIC_GO_REQUIRED');
  }
  const authEligible = releaseReady && operationReady && reasons.length === 0;
  return {
    state: authEligible ? 'READY_FOR_RUNTIME_INTEGRATION' : 'BLOCKED',
    releaseReady, operationReady, authEligible,
    writeEligible: authEligible && writeRequested,
    runtimeActivated: false,
    reasons: [...new Set(reasons)],
  };
}
