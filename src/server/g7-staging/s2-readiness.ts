/** G7 S2: offline-only readiness assessment. Never opens an operating DB/API.
 * The input is an operator attestation containing IDs, statuses and checks ONLY.
 * No secrets, hashes of CAD content, addresses or full log payloads are accepted.
 */
export const S2_CHECKS = [
  'S1_OWNER_ACCEPTANCE', 'G6_OWNER_EVIDENCE_RECONCILED',
  'STAGING_PC1_API', 'STAGING_PC2_API', 'STAGING_PUBLIC_CAD_GET',
  'STAGING_AUTH_SESSION', 'STAGING_EDITOR_SITE', 'STAGING_DELETE_PASSWORD',
  'STAGING_AUDIT_ATOMIC', 'STAGING_BACKUP_RESTORE',
  'PRODUCTION_MULTIPART_AUTH_CONTRACT', 'PRODUCTION_CURRENT_AUTH_CONTRACT',
  'PRODUCTION_DELETE_AUTH_CONTRACT', 'PRODUCTION_SCHEMA_MIGRATION_DRY_RUN',
  'CANDIDATE_APP_DIGEST_VERIFIED', 'CANDIDATE_MIGRATOR_DIGEST_VERIFIED',
  'ROLLBACK_PAIR_COMPATIBLE', 'DB_CAD_S3_SAME_SNAPSHOT_RESTORE',
  'ADMIN_SECRET_RECOVERY_SOP', 'AUDIT_365D_RETENTION_SOP',
  'OPERATIONS_CHANGE_WINDOW', 'OWNER_SCOPE_ACCEPTANCE',
] as const;
export type S2Check = typeof S2_CHECKS[number];
export type S2Status = 'PASS' | 'FAIL' | 'NOT_RUN' | 'CANCELLED';
export type Evidence = Readonly<{
  status: S2Status; evidenceId?: string; snapshotId?: string;
  reviewerId?: string; testedAtUtc?: string;
}>;
export type S2Attestation = Readonly<{
  schemaVersion: 1; scope: 'G7_S2_READINESS'; operationalActivationOff: true;
  sourceCommit: string; schemaId: string; appDigest: string; migratorDigest: string;
  rollbackAppDigest: string; rollbackMigratorDigest: string;
  changeRequestId: string; proposedWindowUtc: string;
  ownerDecision: 'GO' | 'NO_GO' | 'PENDING';
  ownerApprovalId?: string; ownerApprovedAtUtc?: string;
  checks: Partial<Record<S2Check, Evidence>>;
}>;
export type S2Assessment = Readonly<{
  state: 'BLOCKED' | 'PENDING' | 'READY_FOR_OWNER_REVIEW';
  completed: number; required: number; reasons: readonly string[];
  operationalGo: false;
}>;
const IDs = /^(?:EV|SNAP|QA|CR|OWNER)-[A-Za-z0-9_-]{2,64}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SCHEMA = /^[0-9]{12,14}_[a-z0-9_]{2,72}$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const plain = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x) &&
  Object.getPrototypeOf(x) === Object.prototype;
const safeId = (x: unknown): x is string => typeof x === 'string' && IDs.test(x);
const safeTime = (x: unknown): x is string => typeof x === 'string' &&
  TIME.test(x) && !Number.isNaN(Date.parse(x)) &&
  new Date(x).getTime() > 0;
function report(reasons: string[], completed: number): S2Assessment {
  const blockers = reasons.some(x => !x.startsWith('NOT_RUN:'));
  return {
    state: blockers ? 'BLOCKED' : reasons.length ? 'PENDING' : 'READY_FOR_OWNER_REVIEW',
    completed, required: S2_CHECKS.length,
    reasons: [...new Set(reasons)].sort(),
    operationalGo: false,
  };
}
/** READY_FOR_OWNER_REVIEW is never GO. A private human release-specific
 * attestation and a separate manual cutover command are always required.
 */
export function assessS2Readiness(value: unknown): S2Assessment {
  if (!plain(value)) return report(['INVALID_ATTESTATION'], 0);
  const reasons: string[] = [];
  const allowed = [
    'schemaVersion','scope','operationalActivationOff',
    'sourceCommit','schemaId','appDigest','migratorDigest',
    'rollbackAppDigest','rollbackMigratorDigest','changeRequestId',
    'proposedWindowUtc','ownerDecision','ownerApprovalId',
    'ownerApprovedAtUtc','checks',
  ];
  if (Object.keys(value).some(k => !allowed.includes(k)))
    reasons.push('UNKNOWN_ATTESTATION_FIELD');
  if (value.schemaVersion !== 1 || value.scope !== 'G7_S2_READINESS')
    reasons.push('INVALID_SCOPE');
  if (value.operationalActivationOff !== true)
    reasons.push('OPERATIONAL_GATE_MUST_REMAIN_OFF');
  if (typeof value.sourceCommit !== 'string' || !COMMIT.test(value.sourceCommit))
    reasons.push('INVALID_SOURCE_COMMIT');
  if (typeof value.schemaId !== 'string' || !SCHEMA.test(value.schemaId))
    reasons.push('INVALID_SCHEMA_ID');
  for (const k of ['appDigest','migratorDigest','rollbackAppDigest','rollbackMigratorDigest'] as const)
    if (typeof value[k] !== 'string' || !DIGEST.test(value[k]))
      reasons.push('INVALID_DIGEST_REFERENCE:' + k);
  if (!safeId(value.changeRequestId) || !safeTime(value.proposedWindowUtc))
    reasons.push('CHANGE_SCOPE_UNSPECIFIED');
  if (!['GO','NO_GO','PENDING'].includes(String(value.ownerDecision)))
    reasons.push('INVALID_OWNER_DECISION');
  // No approval / rejected approval is not treated as a successful release.
  if (value.ownerDecision === 'NO_GO') reasons.push('OWNER_NO_GO');
  if (value.ownerDecision !== 'GO' ||
      !safeId(value.ownerApprovalId) || !safeTime(value.ownerApprovedAtUtc))
    reasons.push('RELEASE_SPECIFIC_OWNER_GO_NOT_ATTESTED');
  if (!plain(value.checks)) return report([...reasons,'INVALID_CHECKS'],0);
  if (Object.keys(value.checks).some(k => !S2_CHECKS.includes(k as S2Check)))
    reasons.push('UNKNOWN_CHECK');
  let completed=0;
  const snapshots: string[] = [];
  for(const key of S2_CHECKS) {
    const item=value.checks[key];
    if (item === undefined || plain(item) && item.status === 'NOT_RUN') {
      reasons.push('NOT_RUN:'+key);
      continue;
    }
    if (!plain(item) ||
        Object.keys(item).some(k=>!['status','evidenceId','snapshotId','reviewerId','testedAtUtc'].includes(k))) {
      reasons.push('INVALID_CHECK:'+key);continue;
    }
    if (item.status !== 'PASS') { reasons.push('CHECK_NOT_PASSED:'+key);continue; }
    if (!safeId(item.evidenceId) || !safeId(item.reviewerId) || !safeTime(item.testedAtUtc)) {
      reasons.push('UNVERIFIED_CHECK:'+key);continue;
    }
    if (['STAGING_BACKUP_RESTORE','DB_CAD_S3_SAME_SNAPSHOT_RESTORE'].includes(key)) {
      if (!safeId(item.snapshotId) || !String(item.snapshotId).startsWith('SNAP-')) {
        reasons.push('INVALID_SNAPSHOT:'+key);continue;
      }
      snapshots.push(String(item.snapshotId));
    }
    completed++;
  }
  if(snapshots.length===2 && snapshots[0]!==snapshots[1]) reasons.push('SNAPSHOT_MISMATCH');
  return report(reasons,completed);
}
