/**
 * #154 S3-5-R0 — OFFLINE release-specific Owner decision consistency ONLY.
 *
 * Not a production route or release authority. The release packet, witness
 * signatures, and locally provisioned keys are only meaningful on-site.
 * Never reads files, network, registry, DB, environment or changes operation.
 */
import { createHash, verify, type KeyObject } from 'node:crypto';
import { assessS34COwnerManagedBinding, s34CSigningBytes } from './s3-4-c';
import { G7_S3_CAPABILITY, G7_S3_SCHEMA_ID } from './preflight';

export const G7_S35_R0_SCOPE = 'G7-S3-5-R0-OWNER-LOCAL' as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const SITE = /^SCOPE-[A-Za-z0-9_-]{2,64}$/;
const SNAP = /^SNAP-[A-Za-z0-9_-]{2,64}$/;
const EPOCH = /^E-[A-Za-z0-9_-]{2,64}$/;
const CR = /^CR-[A-Za-z0-9_-]{2,64}$/;
const OWNER = /^OWNER-[A-Za-z0-9_-]{2,64}$/;
const OP = /^OP-[A-Za-z0-9_-]{2,64}$/;
const DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;

const releaseKeys = [
  'capability', 'schemaId', 'sourceCommit', 'rollbackSourceCommit',
  'siteScope', 'snapshotId', 'sourceEpoch', 'changeRequestId',
  'appVersion', 'migratorVersion', 'rollbackAppVersion',
  'rollbackMigratorVersion', 'appDigest', 'migratorDigest',
  'rollbackAppDigest', 'rollbackMigratorDigest',
] as const;
const operationKeys = [
  'ownerApprovalId', 'operatorId', 'rollbackOperatorId',
  'approvedAtUtc', 'notBeforeUtc', 'expiresAtUtc',
] as const;
type ReleaseKey = typeof releaseKeys[number];
export type S35ReleaseIdentity = Readonly<Record<ReleaseKey, string>>;
export type S35OwnerTrustAnchors = Readonly<{ owner: KeyObject; qa: KeyObject }>;

export type S35OwnerDecisionResult = Readonly<{
  state: 'BLOCKED' | 'PENDING' | 'LOCAL_RELEASE_DECISION_CONSISTENT_NOT_ACTIVATED';
  reasons: readonly string[];
  privateEvidenceAuthenticated: false;
  productionReleaseVerified: false;
  actualDeploymentAuthorized: false;
  operationalGo: false;
  authEligible: false;
  writeEligible: false;
  runtimeActivated: false;
}>;

function plain(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype;
}
function exact(v: unknown, keys: readonly string[]): v is Record<string, unknown> {
  return plain(v) && Object.keys(v).length === keys.length &&
    keys.every(k => Object.hasOwn(v, k));
}
function utc(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE.test(v)) return false;
  const ms = Date.parse(v);
  return Number.isFinite(ms) &&
    new Date(ms).toISOString() === (v.includes('.') ? v : v.replace('Z', '.000Z'));
}
function response(state: S35OwnerDecisionResult['state'], reasons: string[]): S35OwnerDecisionResult {
  return {
    state, reasons: [...new Set(reasons)].sort(),
    privateEvidenceAuthenticated: false, productionReleaseVerified: false,
    actualDeploymentAuthorized: false, operationalGo: false,
    authEligible: false, writeEligible: false, runtimeActivated: false,
  };
}
function signature(raw: unknown): Buffer | null {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(raw)) return null;
  const bytes = Buffer.from(raw, 'base64');
  return bytes.length === 64 && bytes.toString('base64') === raw ? bytes : null;
}
function validRelease(value: unknown): value is S35ReleaseIdentity {
  if (!exact(value, releaseKeys)) return false;
  const r = value as Record<ReleaseKey, unknown>;
  const digests = [r.appDigest, r.migratorDigest, r.rollbackAppDigest,
    r.rollbackMigratorDigest];
  return r.capability === G7_S3_CAPABILITY && r.schemaId === G7_S3_SCHEMA_ID &&
    typeof r.sourceCommit === 'string' && SHA.test(r.sourceCommit) &&
    typeof r.rollbackSourceCommit === 'string' && SHA.test(r.rollbackSourceCommit) &&
    r.sourceCommit !== r.rollbackSourceCommit &&
    typeof r.siteScope === 'string' && SITE.test(r.siteScope) &&
    typeof r.snapshotId === 'string' && SNAP.test(r.snapshotId) &&
    typeof r.sourceEpoch === 'string' && EPOCH.test(r.sourceEpoch) &&
    typeof r.changeRequestId === 'string' && CR.test(r.changeRequestId) &&
    [r.appVersion, r.migratorVersion, r.rollbackAppVersion,
      r.rollbackMigratorVersion].every(x => typeof x === 'string' && VERSION.test(x)) &&
    r.appVersion === r.migratorVersion &&
    r.rollbackAppVersion === r.rollbackMigratorVersion &&
    digests.every(x => typeof x === 'string' && DIGEST.test(x)) &&
    new Set(digests).size === 4;
}

/**
 * Deterministic bytes for a new release-specific Owner GO/NO_GO signature.
 * IMPORTANT: this is a cryptographic formatting helper, NOT a validation of
 * source authenticity. Signing must occur inside the restricted site.
 */
export function s35OwnerDecisionSigningBytes(raw: unknown): Buffer | null {
  if (!exact(raw, [
    'scope', 'schemaVersion', 'decision', 'release', 'operation',
    'c0ReceiptPacket', 'ownerSignature',
  ]) || raw.scope !== G7_S35_R0_SCOPE || raw.schemaVersion !== 1 ||
    !['GO', 'NO_GO'].includes(raw.decision as string) ||
    !validRelease(raw.release) || !exact(raw.operation, operationKeys) ||
    typeof raw.ownerSignature !== 'string') return null;

  const receiptStatement = s34CSigningBytes(raw.c0ReceiptPacket);
  if (!receiptStatement || !plain(raw.c0ReceiptPacket) ||
    !plain(raw.c0ReceiptPacket.signatures)) return null;
  const oldSignatures = raw.c0ReceiptPacket.signatures;
  if (typeof oldSignatures.owner !== 'string' || typeof oldSignatures.qa !== 'string')
    return null;
  // Domain-separated hash binds the exact C0 statement AND its signatures.
  const receiptHash = createHash('sha256')
    .update('G7-S3-5-C0-RECEIPT-V1\0')
    .update(receiptStatement)
    .update(oldSignatures.owner, 'utf8')
    .update(oldSignatures.qa, 'utf8').digest('hex');
  const release = raw.release as S35ReleaseIdentity;
  const operation = raw.operation as Record<string, unknown>;
  return Buffer.from(JSON.stringify([
    G7_S35_R0_SCOPE, 1, raw.decision, receiptHash,
    releaseKeys.map(key => release[key]),
    operationKeys.map(key => operation[key]),
  ]), 'utf8');
}

/**
 * A locally verified, release-specific *claimed decision* is never GO.
 * trustedKeys, trustedExpectedRelease and nowUtc must be provisioned by
 * the on-site authority, separately from the untrusted release packet.
 * NO env, runtime route, Prisma, Docker, S3, OS or network side effects.
 */
export function assessS35OwnerReleaseDecision(
  raw: unknown,
  trustedKeys: unknown,
  trustedExpectedRelease: unknown,
  nowUtc: unknown,
): S35OwnerDecisionResult {
  if (!utc(nowUtc) || !plain(raw) || !plain(raw.c0ReceiptPacket))
    return response('BLOCKED', ['INVALID_DECISION_PACKET']);
  const c0 = assessS34COwnerManagedBinding(raw.c0ReceiptPacket, trustedKeys, nowUtc);
  if (c0.state === 'PENDING') return response('PENDING', ['C0_RECEIPTS_PENDING']);
  if (c0.state !== 'LOCAL_SIGNED_RECEIPTS_CONSISTENT_NOT_SITE_GO')
    return response('BLOCKED', ['C0_RECEIPTS_INVALID']);
  const bytes = s35OwnerDecisionSigningBytes(raw);
  if (!bytes || !validRelease(trustedExpectedRelease))
    return response('BLOCKED', ['INVALID_RELEASE_DECISION']);
  if (raw.decision !== 'GO') return response('BLOCKED', ['OWNER_NO_GO']);

  const release = raw.release as S35ReleaseIdentity;
  if (releaseKeys.some(key => release[key] !== trustedExpectedRelease[key]))
    return response('BLOCKED', ['TRUSTED_RELEASE_MISMATCH']);
  // The on-site C0 packet must be bound to the *same* immutable release.
  const c0raw = raw.c0ReceiptPacket as Record<string, unknown>;
  if (!plain(c0raw.evidence)) return response('BLOCKED', ['C0_RELEASE_MISMATCH']);
  const evidence = c0raw.evidence;
  if (!plain(evidence.binding) || !plain(evidence.readiness))
    return response('BLOCKED', ['C0_RELEASE_MISMATCH']);
  const b = evidence.binding, rd = evidence.readiness;
  if (release.snapshotId !== evidence.snapshotId ||
    release.sourceEpoch !== evidence.sourceEpoch ||
    release.changeRequestId !== evidence.changeRequestId ||
    release.sourceCommit !== b.sourceCommit ||
    release.rollbackSourceCommit !== b.rollbackSourceCommit ||
    release.schemaId !== b.schemaId ||
    release.appDigest !== b.appDigest || release.migratorDigest !== b.migratorDigest ||
    release.rollbackAppDigest !== b.rollbackAppDigest ||
    release.rollbackMigratorDigest !== b.rollbackMigratorDigest ||
    !plain(rd.app) || !plain(rd.migrator) ||
    !plain(rd.rollbackApp) || !plain(rd.rollbackMigrator) ||
    release.appVersion !== rd.app.version ||
    release.migratorVersion !== rd.migrator.version ||
    release.rollbackAppVersion !== rd.rollbackApp.version ||
    release.rollbackMigratorVersion !== rd.rollbackMigrator.version)
    return response('BLOCKED', ['C0_RELEASE_MISMATCH']);

  const op = raw.operation as Record<string, unknown>;
  if (!exact(op, operationKeys) || typeof op.ownerApprovalId !== 'string' ||
    !OWNER.test(op.ownerApprovalId) ||
    typeof op.operatorId !== 'string' || !OP.test(op.operatorId) ||
    typeof op.rollbackOperatorId !== 'string' || !OP.test(op.rollbackOperatorId) ||
    op.operatorId === op.rollbackOperatorId ||
    !utc(op.approvedAtUtc) || !utc(op.notBeforeUtc) || !utc(op.expiresAtUtc))
    return response('BLOCKED', ['INVALID_OPERATION_APPROVAL']);

  const approved = Date.parse(op.approvedAtUtc);
  const start = Date.parse(op.notBeforeUtc);
  const expiry = Date.parse(op.expiresAtUtc);
  const now = Date.parse(nowUtc);
  const c0Approval = c0raw.ownerApproval;
  const c0QA = c0raw.qaApproval;
  if (!plain(c0Approval) || !plain(c0QA) ||
    !utc(c0Approval.signedAtUtc) || !utc(c0QA.signedAtUtc) ||
    approved < Date.parse(c0Approval.signedAtUtc) ||
    approved < Date.parse(c0QA.signedAtUtc) ||
    approved > start || start > now || now >= expiry ||
    expiry - start > DAY_MS || expiry <= start)
    return response('BLOCKED', ['OPERATION_WINDOW_INVALID']);
  if (!plain(trustedKeys) || !Object.hasOwn(trustedKeys, 'owner'))
    return response('BLOCKED', ['LOCAL_OWNER_KEY_INVALID']);
  const sig = signature(raw.ownerSignature);
  if (!sig) return response('BLOCKED', ['OWNER_SIGNATURE_INVALID']);
  try {
    const owner = trustedKeys.owner as KeyObject;
    if (owner.type !== 'public' || owner.asymmetricKeyType !== 'ed25519' ||
      !verify(null, bytes, owner, sig))
      return response('BLOCKED', ['OWNER_SIGNATURE_INVALID']);
  } catch {
    return response('BLOCKED', ['OWNER_SIGNATURE_INVALID']);
  }
  return response('LOCAL_RELEASE_DECISION_CONSISTENT_NOT_ACTIVATED', []);
}
