/** #109 S2 private-only evidence evaluator. NEVER uploads/prints the input.
 * READY_FOR_OWNER_REVIEW is a structural check, NOT field proof or S3 GO.
 */
import { readFileSync, realpathSync, lstatSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const G7_S2_CASES = Object.freeze([
  'S1_OWNER_ACCEPTANCE', 'G6_PRIVATE_EVIDENCE_REVIEW',
  'APP_MIGRATOR_REGISTRY_DIGEST', 'ROLLBACK_PAIR_COMPATIBLE',
  'G7_SCHEMA_DRY_RUN', 'OPERATIONAL_CAD_AUTH_AND_AUDIT',
  'PUBLIC_CAD_GET_AND_VIEWER', 'COOKIE_ROLE_SITE_VERSION',
  'CAD_POST_MULTIPART', 'CAD_CURRENT', 'CAD_DELETE_PASSWORD',
  'BACKUP_SQLITE', 'BACKUP_LOCAL_CAD', 'BACKUP_REAL_S3',
  'RESTORE_DB_CAD_S3', 'ROLLBACK_APP_SCHEMA_PAIR',
  'ADMIN_SECRET_RECOVERY_SOP', 'AUDIT_RETENTION_SOP',
  'PROD_TWO_PC_PROVENANCE', 'OWNER_S3_RELEASE_DECISION',
]);
const SNAPSHOT_CASES = new Set([
  'BACKUP_SQLITE','BACKUP_LOCAL_CAD','BACKUP_REAL_S3',
  'RESTORE_DB_CAD_S3','ROLLBACK_APP_SCHEMA_PAIR',
]);
const ID = /^(?:EV|SNAP|GO)-[A-Za-z0-9_-]{2,64}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SHA = /^[0-9a-f]{40}$/;
const SCHEMA = '202610260001_g7_staging_auth';
const okObj = v => !!v && typeof v === 'object' && !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const invalidString = v => typeof v !== 'string' || v.length < 2 || v.length > 128;

export function assessG7S2Evidence(manifest) {
  const blockers = [], pending = [];
  let accepted = 0;
  if (!okObj(manifest)) return {
    state: 'BLOCKED', accepted: 0, required: G7_S2_CASES.length,
    reasons: ['INVALID_MANIFEST'],
    note: 'Self-attested readiness only; never an operational GO.',
  };
  const meta = ['schemaVersion','scope','sourceCommit','appDigest','migratorDigest',
    'rollbackAppDigest','rollbackMigratorDigest','migrationId','snapshotId',
    'ownerApprovalId','operatorId','rollbackOperatorId','checks'];
  if (Object.keys(manifest).some(key => !meta.includes(key))) blockers.push('UNKNOWN_FIELD');
  if (manifest.schemaVersion !== 1 || manifest.scope !== 'G7_S2_PRIVATE_ATTESTATION')
    blockers.push('INVALID_SCOPE');
  if (!SHA.test(manifest.sourceCommit) ||
      ![manifest.appDigest, manifest.migratorDigest, manifest.rollbackAppDigest,
        manifest.rollbackMigratorDigest].every(v => typeof v === 'string' && DIGEST.test(v))) {
    blockers.push('INVALID_RELEASE_PAIR_REFERENCE');
  }
  if (manifest.migrationId !== SCHEMA) blockers.push('SCHEMA_MISMATCH');
  if (typeof manifest.snapshotId !== 'string' || !ID.test(manifest.snapshotId) ||
      !manifest.snapshotId.startsWith('SNAP-')) blockers.push('SNAPSHOT_ID_REQUIRED');
  if (typeof manifest.ownerApprovalId !== 'string' ||
      !manifest.ownerApprovalId.startsWith('GO-') || !ID.test(manifest.ownerApprovalId) ||
      invalidString(manifest.operatorId) || invalidString(manifest.rollbackOperatorId)) {
    blockers.push('APPROVAL_OR_OPERATOR_MISSING');
  }
  const checks = okObj(manifest.checks) ? manifest.checks : {};
  if (!okObj(manifest.checks)) blockers.push('CHECKS_MISSING');
  if (Object.keys(checks).some(key => !G7_S2_CASES.includes(key))) blockers.push('UNKNOWN_CHECK');
  for (const name of G7_S2_CASES) {
    const item = checks[name];
    if (item === undefined || (okObj(item) && item.status === 'NOT_RUN')) {
      pending.push('NOT_RUN:' + name);
      continue;
    }
    if (!okObj(item) || Object.keys(item).some(k => !['status','evidenceId','snapshotId'].includes(k))) {
      blockers.push('INVALID_CHECK:' + name);
      continue;
    }
    if (item.status === 'FAIL' || item.status === 'CANCELLED') {
      blockers.push('FAILED:' + name);
      continue;
    }
    if (item.status !== 'PASS' ||
        typeof item.evidenceId !== 'string' || !item.evidenceId.startsWith('EV-') ||
        !ID.test(item.evidenceId)) {
      blockers.push('NO_EVIDENCE:' + name);
      continue;
    }
    if (SNAPSHOT_CASES.has(name) && item.snapshotId !== manifest.snapshotId) {
      blockers.push('SNAPSHOT_MISMATCH:' + name);
      continue;
    }
    accepted++;
  }
  return {
    state: blockers.length ? 'BLOCKED' :
      pending.length ? 'PENDING' : 'READY_FOR_OWNER_REVIEW',
    accepted, required: G7_S2_CASES.length,
    reasons: [...new Set([...blockers,...pending])],
    note: 'Local operator attestation only. No internal evidence content or actual S3 proof is transferred.',
  };
}
/** File must be an operator-owned private regular file outside the repo. */
export function readPrivateG7Evidence(filename, repoRoot) {
  if (typeof filename !== 'string' || !isAbsolute(filename) ||
      lstatSync(filename).isSymbolicLink()) throw new Error('G7_PRIVATE_FILE_REQUIRED');
  const root = realpathSync(repoRoot), input = realpathSync(filename);
  const rel = relative(root, input);
  if (!rel || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))) {
    throw new Error('G7_REPOSITORY_PATH_DENIED');
  }
  const stat = statSync(input);
  if (!stat.isFile() || stat.size < 1 || stat.size > 128 * 1024 ||
      (stat.mode & 0o077) !== 0 ||
      typeof process.getuid !== 'function' || stat.uid !== process.getuid()) {
    throw new Error('G7_PRIVATE_FILE_INSECURE');
  }
  return JSON.parse(readFileSync(input, 'utf8'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('G7_ARGS');
    const repo = fileURLToPath(new URL('../../', import.meta.url));
    const assessment = assessG7S2Evidence(readPrivateG7Evidence(process.argv[2], repo));
    // Strict schema: no host, digest, paths, account data, evidence IDs or raw logs.
    process.stdout.write(JSON.stringify(assessment, null, 2) + '\n');
    if (assessment.state !== 'READY_FOR_OWNER_REVIEW') process.exitCode = 3;
  } catch {
    process.stderr.write('G7_PRIVATE_MANIFEST_INVALID (details withheld)\n');
    process.exitCode = 2;
  }
}
