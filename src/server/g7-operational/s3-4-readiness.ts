/**
 * Issue #109 G7 S3-4-A: OFFLINE evidence-packet completeness check.
 * PASS fields are independent operator attestations, NOT OCI registry or
 * restore observations made by this function. No production runtime import.
 * Never turns a release or operation flag ON.
 */
import { G7_S3_CAPABILITY, G7_S3_SCHEMA_ID } from './preflight';

export const S3_4_REQUIRED_CHECKS = [
  'REGISTRY_APP_DIGEST', 'REGISTRY_MIGRATOR_DIGEST',
  'OCI_PAIR_SOURCE_VERSION', 'REGISTRY_ROLLBACK_APP_DIGEST',
  'REGISTRY_ROLLBACK_MIGRATOR_DIGEST',
  'CAD_SIX_MIGRATIONS_BYTE_EQUAL', 'AUTH_CANDIDATE_ISOLATED',
  'DISPOSABLE_MIGRATION_DRY_RUN',
  'DB_CAD_S3_SAME_SNAPSHOT', 'DB_RESTORE_FK_ZERO',
  'DB_RESTORE_VERSION_CURRENT_SHA', 'CAD_LOCAL_RESTORE_SHA',
  'S3_OBJECT_RESTORE_SHA', 'ROLLBACK_APP_DB_COMPATIBILITY',
  'ROLLBACK_MIGRATOR_COMPATIBILITY', 'ADMIN_RECOVERY_SECRET_SOP',
  'AUDIT_365D_RETENTION_SOP',
] as const;
export type S34Check = typeof S3_4_REQUIRED_CHECKS[number];
export type S34Status = 'PASS' | 'FAIL' | 'NOT_RUN' | 'CANCELLED';
export type S34Image = Readonly<{
  version: string; sourceCommit: string; digest: string;
}>;
export type S34CheckEvidence = Readonly<{
  status: S34Status; evidenceId?: string; reviewerId?: string;
  testedAtUtc?: string; snapshotId?: string;
}>;
export type S34Packet = Readonly<{
  schemaVersion: 1; scope: 'G7_S3_4_READINESS';
  capability: string; schemaId: string; sourceCommit: string;
  snapshotId: string; operationalActivationOff: true;
  activeMigrationUnchanged: true;
  app: S34Image; migrator: S34Image;
  rollbackApp: S34Image; rollbackMigrator: S34Image;
  checks: Partial<Record<S34Check, S34CheckEvidence>>;
}>;
export type S34Assessment = Readonly<{
  state: 'BLOCKED' | 'PENDING' | 'EVIDENCE_PACKET_COMPLETE_NOT_GO';
  completed: number; required: number; reasons: readonly string[];
  /** Never approval. Operator PASS attestations still need private independent verification. */
  operationalGo: false;
  runtimeActivated: false;
}>;
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const SNAP = /^SNAP-[a-zA-Z0-9_-]{2,64}$/;
const EV = /^EV-[a-zA-Z0-9_-]{2,64}$/;
const REVIEWER = /^QA-[a-zA-Z0-9_-]{2,64}$/;
const DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
function plain(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype;
}
function fieldsOnly(v: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(v).every(k => allowed.includes(k));
}
function validTime(v: unknown): v is string {
  return typeof v === 'string' && DATE.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString() === (v.includes('.') ? v : v.replace('Z', '.000Z'));
}
function parseImage(v: unknown): S34Image | null {
  if (!plain(v) || !fieldsOnly(v, ['version', 'sourceCommit', 'digest']) ||
      typeof v.version !== 'string' || !VERSION.test(v.version) ||
      typeof v.sourceCommit !== 'string' || !SHA.test(v.sourceCommit) ||
      typeof v.digest !== 'string' || !DIGEST.test(v.digest)) return null;
  return { version: v.version, sourceCommit: v.sourceCommit, digest: v.digest };
}
function assessment(reasons: string[], count: number): S34Assessment {
  const unique = [...new Set(reasons)].sort();
  return {
    state: unique.some(s => !s.startsWith('NOT_RUN:')) ? 'BLOCKED' :
      unique.length ? 'PENDING' : 'EVIDENCE_PACKET_COMPLETE_NOT_GO',
    completed: count, required: S3_4_REQUIRED_CHECKS.length,
    reasons: unique, operationalGo: false, runtimeActivated: false,
  };
}

/** A completed *attestation packet* is not a successful physical rollback.
 * No OCI network, DB, CAD or S3 evidence is independently accessed here.
 */
export function assessS34Readiness(value: unknown): S34Assessment {
  if (!plain(value)) return assessment(['INVALID_PACKET'], 0);
  const reasons: string[] = [];
  if (!fieldsOnly(value, [
    'schemaVersion', 'scope', 'capability', 'schemaId', 'sourceCommit',
    'snapshotId', 'operationalActivationOff', 'activeMigrationUnchanged',
    'app', 'migrator', 'rollbackApp', 'rollbackMigrator', 'checks',
  ])) reasons.push('UNKNOWN_PACKET_FIELD');
  if (value.schemaVersion !== 1 || value.scope !== 'G7_S3_4_READINESS' ||
      value.capability !== G7_S3_CAPABILITY ||
      value.schemaId !== G7_S3_SCHEMA_ID) reasons.push('INVALID_RELEASE_SCOPE');
  if (value.operationalActivationOff !== true ||
      value.activeMigrationUnchanged !== true) reasons.push('OPERATING_GATE_NOT_OFF');
  if (typeof value.sourceCommit !== 'string' || !SHA.test(value.sourceCommit) ||
      typeof value.snapshotId !== 'string' || !SNAP.test(value.snapshotId))
    reasons.push('INVALID_RELEASE_OR_SNAPSHOT_ID');
  const app = parseImage(value.app), mig = parseImage(value.migrator);
  const backApp = parseImage(value.rollbackApp), backMig = parseImage(value.rollbackMigrator);
  if (!app || !mig || !backApp || !backMig) {
    reasons.push('INVALID_OCI_REFERENCE');
  } else {
    if (app.version !== mig.version ||
        app.sourceCommit !== mig.sourceCommit ||
        app.sourceCommit !== value.sourceCommit)
      reasons.push('PAIR_BUILD_IDENTITY_MISMATCH');
    if (backApp.version !== backMig.version ||
        backApp.sourceCommit !== backMig.sourceCommit ||
        (backApp.digest === app.digest && backMig.digest === mig.digest))
      reasons.push('ROLLBACK_PAIR_MISMATCH');
  }
  let completed = 0;
  if (!plain(value.checks)) return assessment([...reasons, 'INVALID_CHECKS'], completed);
  if (!fieldsOnly(value.checks, S3_4_REQUIRED_CHECKS)) reasons.push('UNKNOWN_CHECK');
  const snapshotChecks: readonly S34Check[] = [
    'DB_CAD_S3_SAME_SNAPSHOT', 'DB_RESTORE_FK_ZERO',
    'DB_RESTORE_VERSION_CURRENT_SHA', 'CAD_LOCAL_RESTORE_SHA',
    'S3_OBJECT_RESTORE_SHA',
  ];
  for (const key of S3_4_REQUIRED_CHECKS) {
    const record = value.checks[key];
    if (record === undefined) { reasons.push('NOT_RUN:' + key); continue; }
    if (!plain(record) ||
        !fieldsOnly(record, ['status', 'evidenceId', 'reviewerId', 'testedAtUtc', 'snapshotId']) ||
        !['PASS', 'FAIL', 'NOT_RUN', 'CANCELLED'].includes(String(record.status))) {
      reasons.push('INVALID_CHECK:' + key); continue;
    }
    if (record.snapshotId !== undefined &&
        (typeof record.snapshotId !== 'string' || record.snapshotId !== value.snapshotId))
      reasons.push('SNAPSHOT_ID_MISMATCH:' + key);
    if (record.status === 'PASS') {
      if (typeof record.evidenceId !== 'string' || !EV.test(record.evidenceId) ||
          typeof record.reviewerId !== 'string' || !REVIEWER.test(record.reviewerId) ||
          !validTime(record.testedAtUtc) ||
          (snapshotChecks.includes(key) && record.snapshotId !== value.snapshotId))
        reasons.push('PASS_WITHOUT_PRIVATE_EVIDENCE:' + key);
      else completed++;
    } else if (record.status === 'NOT_RUN') reasons.push('NOT_RUN:' + key);
    else reasons.push(record.status + ':' + key);
  }
  return assessment(reasons, completed);
}
