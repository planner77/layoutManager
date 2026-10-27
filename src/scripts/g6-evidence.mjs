/**
 * Issue #108: schema-only, non-operational G6 evidence gate.
 * All inputs are *operator attestations*, never proof of real LAN/restore.
 * No raw CAD, hostnames, addresses, tokens, SHA values or log bodies in Git/CI.
 */
import { realpathSync, lstatSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const G6_CASES = Object.freeze([
  'AUTH_SESSION', 'ROLE_SITE_VERSION', 'ADMIN_RECOVERY',
  'PUBLIC_CAD_ANONYMOUS_GET', 'CAD_POST_EDITOR_SITE',
  'CAD_CURRENT_EDITOR_SITE', 'CAD_DELETE_EDITOR_SITE_PASSWORD',
  'AUDIT_365_DAYS', 'PROD_PC_1_NGINX', 'PROD_PC_2_NGINX',
  'DEV_DIRECT_ISOLATED', 'BACKUP_SQLITE', 'BACKUP_LOCAL_CAD',
  'BACKUP_S3', 'MIGRATION_DRY_RUN', 'RESTORE_DB_CAD_S3',
  'ROLLBACK_IMAGE_DB', 'APP_MIGRATOR_PAIR', 'PR_CI_VERIFY_DOCKER',
]);
const snapshotCases = new Set([
  'BACKUP_SQLITE', 'BACKUP_LOCAL_CAD', 'BACKUP_S3',
  'MIGRATION_DRY_RUN', 'RESTORE_DB_CAD_S3',
]);
const allowedCheckFields = new Set([
  'status', 'evidenceId', 'snapshotId', 'clientId',
  'appVersion', 'migratorVersion', 'invariants',
]);
const expectedInvariants = [
  'fkZero', 'versionRowsEqual', 'currentOwnershipEqual',
  'databaseShaFieldsEqual', 'localCadBytesEqual', 's3BytesEqual',
];
const safeId = (value, prefix) => typeof value === 'string' &&
  new RegExp('^' + prefix + '-[A-Za-z0-9_-]{2,64}$').test(value);
const plain = (value) => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

/**
 * Outputs only enumerated reason codes and counts, never input values.
 * READY_FOR_OWNER_REVIEW means the manifest is structurally complete:
 * neither field execution nor Owner acceptance is independently certified.
 */
export function assessG6Evidence(data) {
  const blocked = [], pending = [];
  let completed = 0;
  if (!plain(data)) {
    return { state: 'BLOCKED', completed, required: G6_CASES.length,
      reasons: ['INVALID_MANIFEST'], note: 'Self-attested evidence only; Owner review required.' };
  }
  if (Object.keys(data).some(k => !['schemaVersion', 'scope', 'operationalFeaturesOff', 'checks'].includes(k)))
    blocked.push('UNKNOWN_MANIFEST_FIELD');
  if (data.schemaVersion !== 1 || data.scope !== 'G6_PREACTIVATION')
    blocked.push('INVALID_MANIFEST_SCOPE');
  if (data.operationalFeaturesOff !== true) blocked.push('OPERATIONAL_GATE_NOT_OFF');
  if (!plain(data.checks)) blocked.push('INVALID_CHECKS');
  const checks = plain(data.checks) ? data.checks : {};
  if (Object.keys(checks).some(k => !G6_CASES.includes(k)))
    blocked.push('UNKNOWN_CHECK');
  const snapshots = [];
  for (const id of G6_CASES) {
    const check = checks[id];
    if (check === undefined || (plain(check) && check.status === 'NOT_RUN')) {
      pending.push('NOT_RUN:' + id);
      continue;
    }
    if (!plain(check) || Object.keys(check).some(k => !allowedCheckFields.has(k))) {
      blocked.push('INVALID_CHECK:' + id);
      continue;
    }
    if (check.status === 'FAIL' || check.status === 'CANCELLED') {
      blocked.push('CHECK_FAILED:' + id);
      continue;
    }
    if (check.status !== 'PASS' || !safeId(check.evidenceId, 'EV')) {
      blocked.push('INVALID_PASS_EVIDENCE:' + id);
      continue;
    }
    if (snapshotCases.has(id)) {
      if (!safeId(check.snapshotId, 'SNAP')) {
        blocked.push('INVALID_SNAPSHOT_ID:' + id);
        continue;
      }
      snapshots.push(check.snapshotId);
    }
    if ((id === 'PROD_PC_1_NGINX' || id === 'PROD_PC_2_NGINX') &&
        !safeId(check.clientId, 'PC')) {
      blocked.push('INVALID_CLIENT_ID:' + id);
      continue;
    }
    if (id === 'APP_MIGRATOR_PAIR') {
      const semver = /^\d+\.\d+\.\d+$/;
      if (typeof check.appVersion !== 'string' || !semver.test(check.appVersion) ||
          check.appVersion !== check.migratorVersion) {
        blocked.push('IMAGE_PAIR_MISMATCH');
        continue;
      }
    }
    if (id === 'MIGRATION_DRY_RUN' || id === 'RESTORE_DB_CAD_S3') {
      if (!plain(check.invariants) ||
          Object.keys(check.invariants).length !== expectedInvariants.length ||
          expectedInvariants.some(k => check.invariants[k] !== true)) {
        blocked.push('INTEGRITY_UNVERIFIED:' + id);
        continue;
      }
    }
    completed++;
  }
  if (snapshots.length > 1 && new Set(snapshots).size !== 1)
    blocked.push('BACKUP_CHECKPOINT_MISMATCH');
  if (checks.PROD_PC_1_NGINX?.status === 'PASS' &&
      checks.PROD_PC_2_NGINX?.status === 'PASS' &&
      checks.PROD_PC_1_NGINX.clientId === checks.PROD_PC_2_NGINX.clientId)
    blocked.push('LAN_CLIENTS_NOT_DISTINCT');
  const reasons = [...new Set([...blocked, ...pending])];
  return {
    state: blocked.length ? 'BLOCKED' : pending.length ? 'PENDING' : 'READY_FOR_OWNER_REVIEW',
    completed, required: G6_CASES.length, reasons,
    note: 'Operator-attested checklist only. Not a field test PASS or G7 authorization.',
  };
}

/** Offline-only. Reject checked-out or symlinked inputs; never echo private path. */
export function readPrivateG6Evidence(inputPath, repositoryRoot) {
  if (typeof inputPath !== 'string' || !isAbsolute(inputPath)) throw Error('G6_PRIVATE_PATH_REQUIRED');
  if (lstatSync(inputPath).isSymbolicLink()) throw Error('G6_SYMLINK_DENIED');
  const root = realpathSync(repositoryRoot);
  const source = realpathSync(inputPath);
  const rel = relative(root, source);
  if (rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)))
    throw Error('G6_REPOSITORY_PATH_DENIED');
  const info = statSync(source);
  if (!info.isFile() || info.size < 1 || info.size > 262144)
    throw Error('G6_EVIDENCE_FILE_INVALID');
  return JSON.parse(readFileSync(source, 'utf8'));
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw Error('G6_ARGS');
    const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
    const report = assessG6Evidence(readPrivateG6Evidence(process.argv[2], repoRoot));
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (report.state !== 'READY_FOR_OWNER_REVIEW') process.exitCode = 3;
  } catch {
    process.stderr.write('G6 private manifest invalid or unavailable (no private details logged).\n');
    process.exitCode = 2;
  }
}
