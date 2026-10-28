/**
 * #142 S3-4-B2-5 — disposable/private evidence-reference reconciliation.
 *
 * Every supplied record is UNTRUSTED. Matching EV/QA/SNAP claims do not
 * authenticate a private witness, registry, source DB/CAD/S3 or rollback.
 * No file, network, Docker, Prisma, mutable service state or operating GO.
 */
import {
  assessS34Readiness, S3_4_REQUIRED_CHECKS,
  type S34Check, type S34Packet, type S34Status,
} from './s3-4-readiness';
import { G7_S3_SCHEMA_ID } from './preflight';

export const S34_B25_SCOPE = 'G7-S3-4B2-5-DISPOSABLE-EVIDENCE' as const;

type ImageBinding = Readonly<{
  sourceCommit: string; rollbackSourceCommit: string;
  sourceEpoch: string; changeRequestId: string;
  schemaId: string; snapshotId: string;
  appDigest: string; migratorDigest: string;
  rollbackAppDigest: string; rollbackMigratorDigest: string;
}>;
type EvidenceRecord = Readonly<{
  name: S34Check; status: S34Status;
  evidenceId?: string; reviewerId?: string; observedAtUtc?: string;
  snapshotId?: string; sourceEpoch?: string; changeRequestId?: string;
  sourceCommit?: string; schemaId?: string;
}>;
type EvidencePacket = Readonly<{
  scope: typeof S34_B25_SCOPE; schemaVersion: 1;
  snapshotId: string; sourceEpoch: string; changeRequestId: string;
  operatorId: string; reviewerId: string;
  submittedAtUtc: string; reviewedAtUtc: string;
  binding: ImageBinding; readiness: S34Packet;
  records: readonly EvidenceRecord[];
}>;

export type S34B25Result = Readonly<{
  state: 'BLOCKED' | 'PENDING' | 'DISPOSABLE_EVIDENCE_RECONCILED_NOT_SITE_PROOF';
  reasons: readonly string[];
  claimedPassCount: number; requiredCount: number; recordsCompared: number;
  readinessPacketComplete: boolean;
  privateEvidenceAuthenticated: false; independentReviewerVerified: false;
  registryVerified: false; writerQuiescenceVerified: false;
  sameSnapshotVerified: false; sevenMigrationsExecuted: false;
  restoreExecuted: false; rollbackExecuted: false;
  operationalGo: false; runtimeActivated: false;
}>;

const SNAP = /^SNAP-[A-Za-z0-9_-]{2,64}$/;
const EPOCH = /^E-[A-Za-z0-9_-]{2,64}$/;
const CHANGE = /^CR-[A-Za-z0-9_-]{2,64}$/;
const OP = /^OP-[A-Za-z0-9_-]{2,64}$/;
const QA = /^QA-[A-Za-z0-9_-]{2,64}$/;
const EV = /^EV-[A-Za-z0-9_-]{2,64}$/;
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
const CHECKS: ReadonlySet<string> = new Set(S3_4_REQUIRED_CHECKS);

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key));
}
function time(value: unknown): value is string {
  if (typeof value !== 'string' || !TIME.test(value)) return false;
  const millis = Date.parse(value);
  return Number.isFinite(millis) &&
    new Date(millis).toISOString() ===
      (value.includes('.') ? value : value.replace('Z', '.000Z'));
}
function answer(reasons: string[], pending: boolean, count: number,
                compared: number, complete: boolean): S34B25Result {
  const unique = [...new Set(reasons)].sort();
  return {
    state: unique.length ? 'BLOCKED' : pending ? 'PENDING' :
      'DISPOSABLE_EVIDENCE_RECONCILED_NOT_SITE_PROOF',
    reasons: unique, claimedPassCount: count,
    requiredCount: S3_4_REQUIRED_CHECKS.length, recordsCompared: compared,
    readinessPacketComplete: complete,
    privateEvidenceAuthenticated: false, independentReviewerVerified: false,
    registryVerified: false, writerQuiescenceVerified: false,
    sameSnapshotVerified: false, sevenMigrationsExecuted: false,
    restoreExecuted: false, rollbackExecuted: false,
    operationalGo: false, runtimeActivated: false,
  };
}
function bindingMatches(binding: unknown, readiness: S34Packet,
                        sourceEpoch: string, changeRequestId: string): boolean {
  const keys = [
    'sourceCommit', 'rollbackSourceCommit', 'sourceEpoch', 'changeRequestId',
    'schemaId', 'snapshotId',
    'appDigest', 'migratorDigest', 'rollbackAppDigest', 'rollbackMigratorDigest',
  ];
  if (!exact(binding, keys) ||
      typeof binding.sourceCommit !== 'string' || !SHA.test(binding.sourceCommit) ||
      typeof binding.rollbackSourceCommit !== 'string' ||
      !SHA.test(binding.rollbackSourceCommit) ||
      typeof binding.sourceEpoch !== 'string' || !EPOCH.test(binding.sourceEpoch) ||
      typeof binding.changeRequestId !== 'string' || !CHANGE.test(binding.changeRequestId) ||
      typeof binding.schemaId !== 'string' || binding.schemaId !== G7_S3_SCHEMA_ID ||
      typeof binding.snapshotId !== 'string' || !SNAP.test(binding.snapshotId)) return false;
  const digests = [
    binding.appDigest, binding.migratorDigest,
    binding.rollbackAppDigest, binding.rollbackMigratorDigest,
  ];
  if (!digests.every(d => typeof d === 'string' && DIGEST.test(d)) ||
      new Set(digests).size !== 4) return false;
  return binding.sourceEpoch === sourceEpoch &&
    binding.changeRequestId === changeRequestId &&
    binding.sourceCommit === readiness.sourceCommit &&
    binding.rollbackSourceCommit === readiness.rollbackApp.sourceCommit &&
    binding.rollbackSourceCommit === readiness.rollbackMigrator.sourceCommit &&
    binding.schemaId === readiness.schemaId &&
    binding.snapshotId === readiness.snapshotId &&
    binding.appDigest === readiness.app.digest &&
    binding.migratorDigest === readiness.migrator.digest &&
    binding.rollbackAppDigest === readiness.rollbackApp.digest &&
    binding.rollbackMigratorDigest === readiness.rollbackMigrator.digest;
}
function recordValid(raw: unknown): raw is EvidenceRecord {
  if (!plain(raw) || typeof raw.name !== 'string' || !CHECKS.has(raw.name) ||
      typeof raw.status !== 'string') return false;
  if (raw.status === 'PASS') {
    return exact(raw, ['name', 'status', 'evidenceId', 'reviewerId',
      'observedAtUtc', 'snapshotId', 'sourceEpoch', 'changeRequestId',
      'sourceCommit', 'schemaId']) &&
      typeof raw.evidenceId === 'string' && EV.test(raw.evidenceId) &&
      typeof raw.reviewerId === 'string' && QA.test(raw.reviewerId) &&
      time(raw.observedAtUtc) &&
      typeof raw.snapshotId === 'string' && SNAP.test(raw.snapshotId) &&
      typeof raw.sourceEpoch === 'string' && EPOCH.test(raw.sourceEpoch) &&
      typeof raw.changeRequestId === 'string' && CHANGE.test(raw.changeRequestId) &&
      typeof raw.sourceCommit === 'string' && SHA.test(raw.sourceCommit) &&
      raw.schemaId === G7_S3_SCHEMA_ID;
  }
  return ['NOT_RUN', 'FAIL', 'CANCELLED'].includes(raw.status) &&
    exact(raw, ['name', 'status']);
}

/**
 * Correlates two self-declared, separately supplied check inventories and an
 * immutable release identity. The two inventories are not cryptographic
 * evidence, a verified QA signature, or a confirmation of physical execution.
 * Returns only fixed reason codes (never caller-supplied IDs or secret data).
 */
export function assessS34B25DisposableEvidence(raw: unknown): S34B25Result {
  const envelope = [
    'scope', 'schemaVersion', 'snapshotId', 'sourceEpoch', 'changeRequestId',
    'operatorId', 'reviewerId', 'submittedAtUtc', 'reviewedAtUtc',
    'binding', 'readiness', 'records',
  ];
  if (!exact(raw, envelope) || raw.scope !== S34_B25_SCOPE ||
      raw.schemaVersion !== 1 ||
      typeof raw.snapshotId !== 'string' || !SNAP.test(raw.snapshotId) ||
      typeof raw.sourceEpoch !== 'string' || !EPOCH.test(raw.sourceEpoch) ||
      typeof raw.changeRequestId !== 'string' || !CHANGE.test(raw.changeRequestId) ||
      typeof raw.operatorId !== 'string' || !OP.test(raw.operatorId) ||
      typeof raw.reviewerId !== 'string' || !QA.test(raw.reviewerId) ||
      !time(raw.submittedAtUtc) || !time(raw.reviewedAtUtc) ||
      Date.parse(raw.reviewedAtUtc) < Date.parse(raw.submittedAtUtc) ||
      !Array.isArray(raw.records) ||
      raw.records.length !== S3_4_REQUIRED_CHECKS.length ||
      !plain(raw.readiness)) {
    return answer(['INVALID_EVIDENCE_PACKET'], false, 0, 0, false);
  }

  // S3-4-A is a shape/attestation checker, never an independent verifier.
  const assessment = assessS34Readiness(raw.readiness);
  if (assessment.state === 'BLOCKED') {
    return answer(['READINESS_PACKET_BLOCKED'], false, 0, 0, false);
  }
  const readiness = raw.readiness as S34Packet;
  if (raw.snapshotId !== readiness.snapshotId ||
      !bindingMatches(raw.binding, readiness, raw.sourceEpoch, raw.changeRequestId)) {
    return answer(['RELEASE_OR_SNAPSHOT_BINDING_MISMATCH'], false, 0, 0, false);
  }

  const reasons: string[] = [];
  let pending = assessment.state === 'PENDING';
  let count = 0;
  const seenChecks = new Set<string>(), seenEvidence = new Set<string>();
  for (const record of raw.records) {
    if (!recordValid(record)) {
      reasons.push('INVALID_EVIDENCE_RECORD');
      continue;
    }
    if (seenChecks.has(record.name)) {
      reasons.push('DUPLICATE_CHECK_RECORD');
      continue;
    }
    seenChecks.add(record.name);
    const declared = readiness.checks[record.name];
    if (!declared || declared.status !== record.status) {
      reasons.push('OPERATOR_REVIEW_STATUS_MISMATCH');
      continue;
    }
    if (record.status === 'FAIL') {
      reasons.push('FAILURE_REPORTED');
      continue;
    }
    if (record.status === 'CANCELLED') {
      reasons.push('CANCELLED_REPORTED');
      continue;
    }
    if (record.status === 'NOT_RUN') {
      pending = true;
      continue;
    }
    // PASS is a pair of untrusted claims; it must never set a trust/GO flag.
    if (record.reviewerId !== raw.reviewerId ||
        record.snapshotId !== raw.snapshotId ||
        record.sourceEpoch !== raw.sourceEpoch ||
        record.changeRequestId !== raw.changeRequestId ||
        record.sourceCommit !== readiness.sourceCommit ||
        record.schemaId !== readiness.schemaId ||
        record.evidenceId !== declared.evidenceId ||
        record.reviewerId !== declared.reviewerId ||
        record.snapshotId !== declared.snapshotId ||
        !time(declared.testedAtUtc) ||
        Date.parse(declared.testedAtUtc) > Date.parse(record.observedAtUtc!) ||
        Date.parse(record.observedAtUtc!) > Date.parse(raw.reviewedAtUtc) ||
        Date.parse(declared.testedAtUtc) > Date.parse(raw.submittedAtUtc)) {
      reasons.push('UNTRUSTED_CLAIM_BINDING_MISMATCH');
      continue;
    }
    if (seenEvidence.has(record.evidenceId!)) {
      reasons.push('DUPLICATE_EVIDENCE_REFERENCE');
      continue;
    }
    seenEvidence.add(record.evidenceId!);
    count++;
  }
  if (seenChecks.size !== S3_4_REQUIRED_CHECKS.length ||
      S3_4_REQUIRED_CHECKS.some(key => !seenChecks.has(key))) {
    reasons.push('INCOMPLETE_CHECK_COVERAGE');
  }
  if (!pending && count !== S3_4_REQUIRED_CHECKS.length) {
    reasons.push('INCOMPLETE_PASS_CORRELATION');
  }
  return answer(reasons, pending, count, seenChecks.size,
    assessment.state === 'EVIDENCE_PACKET_COMPLETE_NOT_GO');
}
