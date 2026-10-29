/** #153 runtime authority. R0/preflight remain non-activating consistency tools.
 * A locally provisioned Owner trust/expected-release file is independent from
 * the signed operation envelope. Never accept either authority over HTTP.
 */
import { constants, openSync, closeSync, fstatSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { createPublicKey, verify } from 'node:crypto';
import packageInfo from '../../package.json' with {type:'json'};
import { G7_S3_CAPABILITY, G7_S3_SCHEMA_ID } from './preflight';
import { openG7RuntimeDb } from './runtime-db';

const appVersion = packageInfo.version;
export const G7_RUNTIME_SCOPE = 'G7-OWNER-MANAGED-RUNTIME-V1' as const;
const DAY = 86400000;
const releaseKeys = ['capability','schemaId','sourceCommit','version','appDigest','migratorDigest',
  'rollbackSourceCommit','rollbackAppDigest','rollbackMigratorDigest'] as const;
export type G7RuntimeRelease = Readonly<Record<typeof releaseKeys[number], string>>;
export type G7RuntimeTrust = Readonly<{
  schemaVersion: 1; ownerPublicKeyPem: string; release: G7RuntimeRelease;
  origin: string; databasePath: string; cadStoragePath: string; siteIds: readonly string[];
}>;
export type G7RuntimeApproval = Readonly<{
  scope: typeof G7_RUNTIME_SCOPE; schemaVersion: 1; decision: 'GO' | 'NO_GO';
  release: G7RuntimeRelease; origin: string; databasePath: string; cadStoragePath: string; siteIds: readonly string[];
  scopes: readonly ('AUTH' | 'CAD_WRITE' | 'MIGRATION')[]; approvalId: string;
  snapshotId: string; changeRequestId: string;
  approvedAtUtc: string; notBeforeUtc: string; expiresAtUtc: string; signature: string;
}>;
export type G7RuntimeActiveGate = Readonly<{
  state: 'ACTIVE'; authEnabled: true; cadWriteEnabled: boolean;
  origin: string; databasePath: string; cadStoragePath: string; siteIds: readonly string[];
  expiresAt: number; approvalId: string; snapshotId: string; changeRequestId: string;
  scopes: readonly ('AUTH' | 'CAD_WRITE' | 'MIGRATION')[];
}>;
export type G7RuntimeGate = G7RuntimeActiveGate |
  Readonly<{state: 'OFF'; authEnabled: false; cadWriteEnabled: false}> |
  Readonly<{state: 'BLOCKED'; authEnabled: false; cadWriteEnabled: false; reasons: readonly string[]}>;

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key));
}
function release(value: unknown): value is G7RuntimeRelease {
  if (!exact(value, releaseKeys)) return false;
  const digests = [value.appDigest,value.migratorDigest,value.rollbackAppDigest,value.rollbackMigratorDigest];
  return value.capability === G7_S3_CAPABILITY && value.schemaId === G7_S3_SCHEMA_ID &&
    typeof value.version === 'string' && /^\d+\.\d+\.\d+$/.test(value.version) &&
    typeof value.sourceCommit === 'string' && /^[a-f0-9]{40}$/.test(value.sourceCommit) &&
    typeof value.rollbackSourceCommit === 'string' && /^[a-f0-9]{40}$/.test(value.rollbackSourceCommit) &&
    value.sourceCommit !== value.rollbackSourceCommit &&
    digests.every(x => typeof x === 'string' && /^sha256:[a-f0-9]{64}$/.test(x)) && new Set(digests).size === 4;
}
function sites(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 100 &&
    value.every(x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x)) &&
    new Set(value).size === value.length && JSON.stringify(value) === JSON.stringify([...value].sort());
}
function utc(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
const approvalKeys = ['scope','schemaVersion','decision','release','origin','databasePath','cadStoragePath','siteIds','scopes',
  'approvalId','snapshotId','changeRequestId','approvedAtUtc','notBeforeUtc','expiresAtUtc','signature'] as const;
function approval(value: unknown): value is G7RuntimeApproval {
  return exact(value, approvalKeys) && value.scope === G7_RUNTIME_SCOPE && value.schemaVersion === 1 &&
    (value.decision === 'GO' || value.decision === 'NO_GO') && release(value.release) && sites(value.siteIds) &&
    typeof value.origin === 'string' && typeof value.databasePath === 'string' && typeof value.cadStoragePath === 'string' &&
    Array.isArray(value.scopes) && (JSON.stringify(value.scopes) === '["AUTH"]' ||
      JSON.stringify(value.scopes) === '["AUTH","CAD_WRITE"]' ||
      JSON.stringify(value.scopes) === '["AUTH","MIGRATION"]' ||
      JSON.stringify(value.scopes) === '["AUTH","CAD_WRITE","MIGRATION"]') &&
    typeof value.approvalId === 'string' && /^OWNER-[A-Za-z0-9_-]{2,64}$/.test(value.approvalId) &&
    typeof value.snapshotId === 'string' && /^SNAP-[A-Za-z0-9_-]{2,64}$/.test(value.snapshotId) &&
    typeof value.changeRequestId === 'string' && /^CR-[A-Za-z0-9_-]{2,64}$/.test(value.changeRequestId) &&
    utc(value.approvedAtUtc) && utc(value.notBeforeUtc) && utc(value.expiresAtUtc) &&
    typeof value.signature === 'string';
}
/** Canonical domain-separated bytes. Formatting does not issue an approval. */
export function g7RuntimeApprovalSigningBytes(value: unknown): Buffer | null {
  if (!approval(value)) return null;
  return Buffer.from(JSON.stringify([G7_RUNTIME_SCOPE,1,value.decision,
    releaseKeys.map(key => value.release[key]),value.origin,value.databasePath,value.cadStoragePath,value.siteIds,value.scopes,
    value.approvalId,value.snapshotId,value.changeRequestId,value.approvedAtUtc,value.notBeforeUtc,value.expiresAtUtc]));
}
export function readG7RuntimePrivateFile(filename: string | undefined): Buffer {
  if (!filename || !path.isAbsolute(filename) || realpathSync(filename) !== filename) throw new Error();
  const parent = lstatSync(path.dirname(filename));
  if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== process.getuid?.() ||
      (parent.mode & 0o077) !== 0) throw new Error();
  const fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0 ||
        stat.nlink !== 1 || stat.size < 2 || stat.size > 32768) throw new Error();
    const bytes = readFileSync(fd);
    if (bytes.length !== stat.size) throw new Error();
    return bytes;
  } finally { closeSync(fd); }
}
function readPrivateJson(filename: string | undefined): unknown {
  return JSON.parse(readG7RuntimePrivateFile(filename).toString('utf8'));
}
/** CLI-only historical signature check. Expiry and current release binding are
 * deliberately excluded, while the original signed operation contract stays exact.
 */
export function verifyG7HistoricalMigrationApproval(value: unknown, ownerPublicKeyPem: string): value is G7RuntimeApproval {
  if (!approval(value) || value.decision !== 'GO' || !value.scopes.includes('MIGRATION')) return false;
  const approved = Date.parse(value.approvedAtUtc), start = Date.parse(value.notBeforeUtc), end = Date.parse(value.expiresAtUtc);
  if (approved > start || start >= end || end - approved > DAY) return false;
  try {
    const key = createPublicKey(ownerPublicKeyPem), bytes = g7RuntimeApprovalSigningBytes(value);
    return key.asymmetricKeyType === 'ed25519' && !!bytes &&
      /^[A-Za-z0-9+/]{86}==$/.test(value.signature) &&
      Buffer.from(value.signature,'base64').toString('base64') === value.signature &&
      verify(null,bytes,key,Buffer.from(value.signature,'base64'));
  } catch { return false; }
}
/** Use the same ownership, parent-mode, symlink and size policy as runtime gate. */
export function readG7RuntimePrivateJson(filename: string | undefined): unknown {
  return readPrivateJson(filename);
}
function blocked(reason: string): G7RuntimeGate {
  return {state:'BLOCKED',authEnabled:false,cadWriteEnabled:false,reasons:[reason]};
}
function resolveAuthority(
  env: Readonly<Record<string, string | undefined>>, now: number, requiredScope: 'AUTH' | 'MIGRATION',
): G7RuntimeGate {
  const flags = [env.G7_AUTH_ENABLED,env.G7_CAD_WRITE_CUTOVER_ENABLED,env.G7_RUNTIME_RECOVERY_MODE,
    env.G7_RUNTIME_ALLOW_HTTP];
  if (flags.some(x => x !== undefined && x !== 'true' && x !== 'false')) return blocked('INVALID_RUNTIME_SWITCH');
  if (env.G7_RUNTIME_RECOVERY_MODE === 'true') return blocked('RUNTIME_RECOVERY_HOLD');
  // A migration/restore HOLD also protects legacy writes with runtime OFF.
  // Do not open SQLite or its data here; a dangling symlink is still a HOLD.
  if (requiredScope === 'AUTH' && env.DATABASE_URL?.startsWith('file:')) {
    try {
      const dbPath = path.resolve(env.DATABASE_URL.slice(5));
      lstatSync(path.join(path.dirname(dbPath),'g7-runtime-hold.json'));
      return blocked('RUNTIME_RECOVERY_HOLD');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return blocked('RUNTIME_HOLD_UNAVAILABLE');
    }
  }
  const configured = !!(env.G7_RUNTIME_TRUST_PATH || env.G7_RUNTIME_APPROVAL_PATH);
  if (requiredScope === 'MIGRATION' && (env.G7_AUTH_ENABLED === 'true' ||
      env.G7_CAD_WRITE_CUTOVER_ENABLED === 'true')) return blocked('MIGRATION_REQUIRES_RUNTIME_OFF');
  if (requiredScope === 'AUTH' && env.G7_AUTH_ENABLED !== 'true') {
    if (env.G7_CAD_WRITE_CUTOVER_ENABLED === 'true' || configured) return blocked('AUTH_REQUIRED');
    return {state:'OFF',authEnabled:false,cadWriteEnabled:false};
  }
  if (['G7_S3_AUTH_API_PREVIEW_ONLY','G7_S3_CAD_PREVIEW_ONLY',
    ...(requiredScope === 'AUTH' ? ['G7_S3_MIGRATION_TEST_ONLY'] : []),'G7_STAGING_ENABLED','G7_STAGING_ONLY'].some(key => env[key] === 'true')) return blocked('PREVIEW_RUNTIME_CONFLICT');
  if (!Number.isSafeInteger(now)) return blocked('INVALID_RUNTIME_TIME');
  try {
    if (!env.G7_RUNTIME_TRUST_PATH || env.G7_RUNTIME_TRUST_PATH === env.G7_RUNTIME_APPROVAL_PATH) throw new Error();
    const trust = readPrivateJson(env.G7_RUNTIME_TRUST_PATH);
    const raw = readPrivateJson(env.G7_RUNTIME_APPROVAL_PATH);
    if (!exact(trust,['schemaVersion','ownerPublicKeyPem','release','origin','databasePath','cadStoragePath','siteIds']) ||
        trust.schemaVersion !== 1 || typeof trust.ownerPublicKeyPem !== 'string' || !release(trust.release) ||
        !sites(trust.siteIds) || typeof trust.origin !== 'string' || typeof trust.databasePath !== 'string' || typeof trust.cadStoragePath !== 'string' ||
        !approval(raw)) return blocked('RUNTIME_CONTRACT_INVALID');
    const r = trust.release;
    if (r.version !== appVersion || env.G7_RELEASE_VERSION !== r.version ||
        env.G7_RELEASE_CAPABILITY !== r.capability || env.G7_RELEASE_SCHEMA_ID !== r.schemaId ||
        env.G7_RELEASE_SOURCE_COMMIT !== r.sourceCommit || env.G7_RELEASE_APP_DIGEST !== r.appDigest ||
        env.G7_RELEASE_MIGRATOR_DIGEST !== r.migratorDigest ||
        releaseKeys.some(key => raw.release[key] !== r[key]) ||
        raw.origin !== trust.origin || raw.databasePath !== trust.databasePath || raw.cadStoragePath !== trust.cadStoragePath ||
        JSON.stringify(raw.siteIds) !== JSON.stringify(trust.siteIds) ||
        env.DATABASE_URL !== 'file:' + trust.databasePath || env.CAD_STORAGE_PATH !== trust.cadStoragePath) return blocked('RUNTIME_RELEASE_BINDING');
    // Migration authority skips schema7, but never skips the physical DB
    // binding: it may only address the same existing private SQLite file.
    if (!path.isAbsolute(trust.databasePath) || realpathSync(trust.databasePath) !== trust.databasePath)
      return blocked('RUNTIME_STORAGE_BINDING');
    const dbFile = lstatSync(trust.databasePath), dbParent = lstatSync(path.dirname(trust.databasePath));
    if (!dbFile.isFile() || dbFile.isSymbolicLink() || dbFile.uid !== process.getuid?.() ||
        (dbFile.mode & 0o077) !== 0 || dbFile.nlink !== 1 || !dbParent.isDirectory() ||
        dbParent.uid !== process.getuid?.() || (dbParent.mode & 0o022) !== 0)
      return blocked('RUNTIME_STORAGE_BINDING');
    if (!path.isAbsolute(trust.cadStoragePath) || realpathSync(trust.cadStoragePath) !== trust.cadStoragePath ||
        trust.databasePath.startsWith(trust.cadStoragePath + path.sep) || trust.cadStoragePath === trust.databasePath)
      return blocked('RUNTIME_STORAGE_BINDING');
    const cad = lstatSync(trust.cadStoragePath);
    if (!cad.isDirectory() || cad.isSymbolicLink() || cad.uid !== process.getuid?.() ||
        (cad.mode & 0o022) !== 0) return blocked('RUNTIME_STORAGE_BINDING');
    const origin = new URL(trust.origin);
    if (origin.origin !== trust.origin || origin.username || origin.password ||
        (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && env.G7_RUNTIME_ALLOW_HTTP === 'true')))
      return blocked('RUNTIME_ORIGIN_INVALID');
    const bytes = g7RuntimeApprovalSigningBytes(raw);
    const key = createPublicKey(trust.ownerPublicKeyPem);
    if (key.asymmetricKeyType !== 'ed25519' || !bytes ||
        !/^[A-Za-z0-9+/]{86}==$/.test(raw.signature) ||
        Buffer.from(raw.signature,'base64').toString('base64') !== raw.signature ||
        !verify(null,bytes,key,Buffer.from(raw.signature,'base64'))) return blocked('RUNTIME_OWNER_SIGNATURE');
    const start = Date.parse(raw.notBeforeUtc), end = Date.parse(raw.expiresAtUtc);
    if (raw.decision !== 'GO' || Date.parse(raw.approvedAtUtc) > start || start >= end ||
        end - Date.parse(raw.approvedAtUtc) > DAY || now < start || now >= end)
      return blocked('RUNTIME_APPROVAL_INACTIVE');
    if (!raw.scopes.includes(requiredScope)) return blocked('RUNTIME_SCOPE_DENIED');
    const write = requiredScope === 'AUTH' && env.G7_CAD_WRITE_CUTOVER_ENABLED === 'true';
    if (write && !raw.scopes.includes('CAD_WRITE')) return blocked('RUNTIME_SCOPE_DENIED');
    const gate: G7RuntimeActiveGate = {state:'ACTIVE',authEnabled:true,cadWriteEnabled:write,
      origin:trust.origin,databasePath:trust.databasePath,cadStoragePath:trust.cadStoragePath,siteIds:[...trust.siteIds],expiresAt:end,approvalId:raw.approvalId,
      snapshotId:raw.snapshotId,changeRequestId:raw.changeRequestId,scopes:[...raw.scopes]};
    if (requiredScope === 'AUTH') { const db = openG7RuntimeDb(gate,true); db.close(); }
    return gate;
  } catch { return blocked('RUNTIME_AUTHORITY_OR_SCHEMA_UNAVAILABLE'); }
}

export function resolveG7RuntimeGate(
  env: Readonly<Record<string, string | undefined>> = process.env, now = Date.now(),
): G7RuntimeGate { return resolveAuthority(env,now,'AUTH'); }
/** CLI-only migration authority validates the same signed exact operation but
 * requires MIGRATION scope and both runtime switches OFF. The CLI separately
 * checks the six-migration baseline, writer lock, snapshot and seven-schema
 * postcondition; HTTP routes never use this function. */
export function resolveG7RuntimeMigrationAuthority(
  env: Readonly<Record<string, string | undefined>> = process.env, now = Date.now(),
): G7RuntimeGate { return resolveAuthority(env,now,'MIGRATION'); }
