/**
 * Issue #151 / G7 S3-4-C0: on-site Owner Managed receipt-integrity binding.
 *
 * A valid signature means supplied receipt BYTES match an Owner/QA statement
 * against separately configured local Ed25519 public keys. It DOES NOT verify
 * authoritative OCI provenance, physical DB/CAD/S3 restore or operational GO.
 * No filesystem, network, logging, runtime flag or production route.
 */
import { createHash, verify, type KeyObject } from 'node:crypto';
import { S3_4_REQUIRED_CHECKS } from './s3-4-readiness';
import { assessS34B25DisposableEvidence } from './s3-4-b2-5';

export const S34_C_SCOPE = 'G7-S3-4C-OWNER-MANAGED-OFFLINE' as const;

export type S34CTrustAnchors = Readonly<{
  /** Both keys MUST come from independent, pre-authorized local trust config. */
  owner: KeyObject;
  qa: KeyObject;
}>;

export type S34CResult = Readonly<{
  state: 'BLOCKED' | 'PENDING' | 'LOCAL_SIGNED_RECEIPTS_CONSISTENT_NOT_SITE_GO';
  reasons: readonly string[];
  receiptsChecked: number;
  requiredReceipts: number;
  /** Only Ed25519 verification against caller-supplied local anchors. */
  receiptSignaturesValid: boolean;
  /** None of these are proven by matching in-memory receipt claims. */
  privateSourceAuthenticated: false;
  registryProvenanceVerified: false;
  independentReviewerVerified: false;
  writerQuiescenceVerified: false;
  sameSnapshotRestored: false;
  sevenMigrationsExecuted: false;
  physicalRollbackVerified: false;
  operationalGo: false;
  runtimeActivated: false;
}>;

const NAME = new Set<string>(S3_4_REQUIRED_CHECKS);
const SHA256 = /^[0-9a-f]{64}$/;
const OWNER = /^OWNER-[A-Za-z0-9_-]{2,64}$/;
const QA = /^QA-[A-Za-z0-9_-]{2,64}$/;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
const MAX_RECEIPT_BYTES = 65536;
const DAY = 24 * 60 * 60 * 1000;

function plain(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype;
}
function exact(v: unknown, keys: readonly string[]): v is Record<string, unknown> {
  return plain(v) && Object.keys(v).length === keys.length &&
    keys.every(k => Object.hasOwn(v, k));
}
function utc(v: unknown): v is string {
  if (typeof v !== 'string' || !UTC.test(v)) return false;
  const ms = Date.parse(v);
  return Number.isFinite(ms) &&
    new Date(ms).toISOString() === (v.includes('.') ? v : v.replace('Z', '.000Z'));
}
function result(
  state: S34CResult['state'], reasons: string[], checked = 0,
): S34CResult {
  return {
    state, reasons: [...new Set(reasons)].sort(),
    receiptsChecked: checked, requiredReceipts: S3_4_REQUIRED_CHECKS.length,
    receiptSignaturesValid: state === 'LOCAL_SIGNED_RECEIPTS_CONSISTENT_NOT_SITE_GO',
    privateSourceAuthenticated: false, registryProvenanceVerified: false,
    independentReviewerVerified: false, writerQuiescenceVerified: false,
    sameSnapshotRestored: false, sevenMigrationsExecuted: false,
    physicalRollbackVerified: false, operationalGo: false, runtimeActivated: false,
  };
}
type Receipt = {name: string; evidenceId: string; sha256: string; bytes: Uint8Array};
type Binding = Record<string, string>;
type B25 = Record<string, unknown>;

/** An exact, deterministic signed statement with no raw receipt contents.
 * For offline Owner/QA signers ONLY. Before signing, inspect real receipts
 * locally; signatures authenticate a statement, NOT real-world provenance.
 * Returns null for a malformed statement, not an approval.
 */
export function s34CSigningBytes(raw: unknown): Buffer | null {
  if (!exact(raw, [
    'scope', 'schemaVersion', 'evidence', 'receipts',
    'ownerApproval', 'qaApproval', 'expiresAtUtc', 'signatures',
  ]) || raw.scope !== S34_C_SCOPE || raw.schemaVersion !== 1 ||
      !plain(raw.evidence) || !Array.isArray(raw.receipts) ||
      !exact(raw.ownerApproval, ['ownerId', 'signedAtUtc']) ||
      !exact(raw.qaApproval, ['reviewerId', 'signedAtUtc']) ||
      !exact(raw.signatures, ['owner', 'qa'])) return null;

  const packet = raw.evidence as B25;
  if (!plain(packet.binding) || !Array.isArray(packet.records) ||
      typeof packet.snapshotId !== 'string' ||
      typeof packet.sourceEpoch !== 'string' ||
      typeof packet.changeRequestId !== 'string' ||
      typeof packet.reviewerId !== 'string') return null;
  const binding = packet.binding as Binding;
  const checks = new Map<string, Receipt>();
  for (const item of raw.receipts as unknown[]) {
    if (!exact(item, ['name', 'evidenceId', 'sha256', 'bytes']) ||
        typeof item.name !== 'string' || !NAME.has(item.name) ||
        checks.has(item.name) || typeof item.evidenceId !== 'string' ||
        typeof item.sha256 !== 'string' || !SHA256.test(item.sha256) ||
        !(item.bytes instanceof Uint8Array)) return null;
    checks.set(item.name, item as Receipt);
  }
  if (checks.size !== S3_4_REQUIRED_CHECKS.length) return null;
  const b25Hash = createHash('sha256')
    .update(JSON.stringify(raw.evidence), 'utf8').digest('hex');
  // Array position is the canonical S3-4-A check order, not caller order.
  const statement = [
    S34_C_SCOPE, 1, b25Hash,
    packet.snapshotId, packet.sourceEpoch, packet.changeRequestId,
    binding.sourceCommit, binding.rollbackSourceCommit,
    binding.schemaId, binding.appDigest, binding.migratorDigest,
    binding.rollbackAppDigest, binding.rollbackMigratorDigest,
    raw.ownerApproval.ownerId, raw.ownerApproval.signedAtUtc,
    raw.qaApproval.reviewerId, raw.qaApproval.signedAtUtc,
    raw.expiresAtUtc,
    S3_4_REQUIRED_CHECKS.map(n => {
      const v = checks.get(n)!;
      return [n, v.evidenceId, v.sha256];
    }),
  ];
  return Buffer.from(JSON.stringify(statement), 'utf8');
}
function signature(v: unknown): Buffer | null {
  // Ed25519 signatures are 64 bytes, canonical Base64: 86 chars + '=='.
  if (typeof v !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(v)) return null;
  const bytes = Buffer.from(v, 'base64');
  return bytes.length === 64 && bytes.toString('base64') === v ? bytes : null;
}
function trusted(keys: unknown): keys is S34CTrustAnchors {
  if (!plain(keys) || !Object.hasOwn(keys, 'owner') || !Object.hasOwn(keys, 'qa'))
    return false;
  try {
    const a = keys.owner as KeyObject, b = keys.qa as KeyObject;
    return a.type === 'public' && b.type === 'public' &&
      a.asymmetricKeyType === 'ed25519' && b.asymmetricKeyType === 'ed25519' &&
      !a.export({format:'der', type:'spki'})
        .equals(b.export({format:'der', type:'spki'}));
  } catch {
    return false;
  }
}

/** Caller must run INSIDE the site with privately provisioned trust anchors.
 * bytes and keys are never returned; no external proof/GO is asserted.
 * nowUtc must be a trusted on-site clock observation, not user packet data.
 */
export function assessS34COwnerManagedBinding(
  raw: unknown, keys: unknown, nowUtc: unknown,
): S34CResult {
  if (!utc(nowUtc) || !plain(raw) || !plain(raw.evidence))
    return result('BLOCKED', ['INVALID_LOCAL_INPUT']);
  const b25State = assessS34B25DisposableEvidence(raw.evidence).state;
  if (b25State === 'BLOCKED') return result('BLOCKED', ['B2_EVIDENCE_BLOCKED']);
  if (b25State === 'PENDING') return result('PENDING', ['B2_EVIDENCE_PENDING']);
  const message = s34CSigningBytes(raw);
  if (!message || !exact(raw.ownerApproval, ['ownerId', 'signedAtUtc']) ||
      !exact(raw.qaApproval, ['reviewerId', 'signedAtUtc']) ||
      !utc(raw.ownerApproval.signedAtUtc) ||
      !utc(raw.qaApproval.signedAtUtc) || !utc(raw.expiresAtUtc) ||
      typeof raw.ownerApproval.ownerId !== 'string' ||
      !OWNER.test(raw.ownerApproval.ownerId) ||
      typeof raw.qaApproval.reviewerId !== 'string' ||
      !QA.test(raw.qaApproval.reviewerId) ||
      raw.qaApproval.reviewerId !== raw.evidence.reviewerId)
    return result('BLOCKED', ['INVALID_BINDER_PACKET']);

  const reviewed = Date.parse(raw.evidence.reviewedAtUtc as string);
  const ownerAt = Date.parse(raw.ownerApproval.signedAtUtc);
  const qaAt = Date.parse(raw.qaApproval.signedAtUtc);
  const expires = Date.parse(raw.expiresAtUtc);
  const now = Date.parse(nowUtc);
  const latest = Math.max(ownerAt, qaAt);
  if (!Number.isFinite(reviewed) || reviewed > Math.min(ownerAt, qaAt) ||
      ownerAt > now || qaAt > now ||
      expires <= now || expires <= latest || expires - latest > DAY)
    return result('BLOCKED', ['REVIEW_WINDOW_INVALID']);

  const records = (raw.evidence.records as {name:string;evidenceId:string;status:string}[]);
  const expected = new Map(records.map(x=>[x.name, x.evidenceId]));
  let checked = 0;
  for (const rec of raw.receipts as unknown[]) {
    if (!exact(rec, ['name', 'evidenceId', 'sha256', 'bytes']) ||
        typeof rec.name !== 'string' || !NAME.has(rec.name) ||
        typeof rec.evidenceId !== 'string' ||
        rec.evidenceId !== expected.get(rec.name) ||
        typeof rec.sha256 !== 'string' || !SHA256.test(rec.sha256) ||
        !(rec.bytes instanceof Uint8Array) ||
        rec.bytes.byteLength < 1 || rec.bytes.byteLength > MAX_RECEIPT_BYTES ||
        createHash('sha256').update(rec.bytes).digest('hex') !== rec.sha256)
      return result('BLOCKED', ['RECEIPT_INTEGRITY_BLOCKED']);
    checked++;
  }
  if (checked !== S3_4_REQUIRED_CHECKS.length)
    return result('BLOCKED', ['RECEIPT_INTEGRITY_BLOCKED']);
  if (!trusted(keys)) return result('BLOCKED', ['TRUST_ANCHOR_INVALID']);
  const sigs = raw.signatures as Record<string, unknown>;
  const ownerSig = signature(sigs.owner), qaSig = signature(sigs.qa);
  if (!ownerSig || !qaSig ||
      !verify(null, message, keys.owner, ownerSig) ||
      !verify(null, message, keys.qa, qaSig))
    return result('BLOCKED', ['LOCAL_SIGNATURE_INVALID']);
  return result('LOCAL_SIGNED_RECEIPTS_CONSISTENT_NOT_SITE_GO', [], checked);
}
