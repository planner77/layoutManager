/** #109 G7 S2/S3: deny-first, release-specific private Owner GO contract.
 * This is code for later controlled S3 use; S2 acceptance alone never sets GO.
 * Manifest values are operator attestations, not OCI registry verification.
 */
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SHA = /^[0-9a-f]{40}$/;
const ID = /^(?:GO|SNAP|EV)-[A-Za-z0-9_-]{2,64}$/;
export const G7_OPERATION_SCHEMA_ID = '202610260001_g7_staging_auth';

export type G7OperationGate = Readonly<{
  databaseUrl: string; databaseFile: string; cadStoragePath: string;
  origin: string; operationGoId: string; snapshotId: string;
  appDigest: string; migratorDigest: string; sourceCommit: string;
  rollbackAppDigest: string; rollbackMigratorDigest: string;
  writeEnabled: boolean;
}>;
type Env = Readonly<Record<string, string | undefined>>;
function validIsoDate(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return null;
  const when = Date.parse(value);
  return Number.isFinite(when) && new Date(when).toISOString() === new Date(value).toISOString() ? when : null;
}
function directFile(url: string | undefined): string | null {
  if (!url || !url.startsWith('file:/') || url.includes('?') || url.includes('#') ||
      url.includes('%') || url.includes('\\')) return null;
  const filename = url.slice(5);
  if (!path.isAbsolute(filename) || path.normalize(filename) !== filename) return null;
  return filename;
}
function privateManifest(filename: string | undefined): Record<string, unknown> | null {
  try {
    if (!filename || !path.isAbsolute(filename) || path.normalize(filename) !== filename ||
        lstatSync(filename).isSymbolicLink()) return null;
    const stat = lstatSync(filename);
    if (!stat.isFile() || stat.size < 1 || stat.size > 8192 ||
        (stat.mode & 0o077) !== 0 || typeof process.getuid !== 'function' ||
        stat.uid !== process.getuid() || realpathSync(filename) !== filename) return null;
    const data: unknown = JSON.parse(readFileSync(filename, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch { return null; }
}
/** Operational runtime MUST receive a fresh, privately recorded release-specific GO.
 * Neither a boolean environment flag alone nor an S2 Owner intent enables it.
 */
export function resolveG7OperationGate(env: Env, now = Date.now()): G7OperationGate | null {
  if (env.G7_S3_GO !== 'true' || env.G7_AUTH_ENABLED !== 'true' ||
      env.G7_RELEASE_CAPABILITY !== 'G7-OPERATIONAL-V1' ||
      !Number.isSafeInteger(now)) return null;
  const m = privateManifest(env.G7_OPERATION_MANIFEST_PATH);
  if (!m || m.scope !== 'G7_S3_RELEASE_SPECIFIC_GO' ||
      m.schemaId !== G7_OPERATION_SCHEMA_ID || m.decision !== 'GO' ||
      typeof m.operationGoId !== 'string' || !ID.test(m.operationGoId) ||
      m.operationGoId !== env.G7_OPERATION_GO_ID ||
      typeof m.snapshotId !== 'string' || !ID.test(m.snapshotId)) return null;
  const from = validIsoDate(m.validFrom), until = validIsoDate(m.validUntil);
  if (from === null || until === null || from > now || now > until || until <= from ||
      until - from > 86_400_000) return null;
  if (typeof m.appDigest !== 'string' || !DIGEST.test(m.appDigest) ||
      typeof m.migratorDigest !== 'string' || !DIGEST.test(m.migratorDigest) ||
      typeof m.rollbackAppDigest !== 'string' || !DIGEST.test(m.rollbackAppDigest) ||
      typeof m.rollbackMigratorDigest !== 'string' || !DIGEST.test(m.rollbackMigratorDigest) ||
      typeof m.sourceCommit !== 'string' || !SHA.test(m.sourceCommit) ||
      m.appDigest !== env.G7_RUNNING_APP_DIGEST ||
      m.migratorDigest !== env.G7_RUNNING_MIGRATOR_DIGEST ||
      m.sourceCommit !== env.G7_RUNNING_SOURCE_COMMIT) return null;
  if (!Array.isArray(m.evidenceIds) || m.evidenceIds.length < 3 ||
      m.evidenceIds.some(id => typeof id !== 'string' || !ID.test(id))) return null;
  if (typeof m.operatorId !== 'string' || !m.operatorId ||
      typeof m.rollbackOperatorId !== 'string' || !m.rollbackOperatorId ||
      typeof m.ownerId !== 'string' || !m.ownerId) return null;
  const file = directFile(env.DATABASE_URL);
  if (!file || m.databaseUrl !== env.DATABASE_URL ||
      env.G7_OPERATION_DATABASE_URL !== env.DATABASE_URL ||
      m.cadStoragePath !== env.CAD_STORAGE_PATH ||
      !env.CAD_STORAGE_PATH || !path.isAbsolute(env.CAD_STORAGE_PATH)) return null;
  try {
    if (lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile() ||
        realpathSync(file) !== file ||
        lstatSync(env.CAD_STORAGE_PATH).isSymbolicLink() ||
        !lstatSync(env.CAD_STORAGE_PATH).isDirectory() ||
        realpathSync(env.CAD_STORAGE_PATH) !== env.CAD_STORAGE_PATH) return null;
  } catch { return null; }
  const origin = env.G7_OPERATION_ORIGIN;
  try {
    if (!origin || new URL(origin).origin !== origin || m.origin !== origin ||
        !['http:', 'https:'].includes(new URL(origin).protocol)) return null;
  } catch { return null; }
  return {
    databaseUrl: env.DATABASE_URL!, databaseFile: file,
    cadStoragePath: env.CAD_STORAGE_PATH!, origin: origin!,
    operationGoId: m.operationGoId as string, snapshotId: m.snapshotId as string,
    appDigest: m.appDigest as string, migratorDigest: m.migratorDigest as string,
    sourceCommit: m.sourceCommit as string,
    rollbackAppDigest: m.rollbackAppDigest as string,
    rollbackMigratorDigest: m.rollbackMigratorDigest as string,
    writeEnabled: env.G7_CAD_WRITE_CUTOVER_ENABLED === 'true',
  };
}
export function g7OperationalWriteMode(env: Env): 'legacy' | 'blocked' | 'protected' {
  // Only an installation which has NEVER requested operational G7 retains
  // the existing legacy write API. Once cutover is attempted, never fall back
  // to unauthenticated writes on bad flags, expired GO or DB failure.
  const attempted = [
    'G7_S3_GO','G7_OPERATION_GO_ID','G7_OPERATION_MANIFEST_PATH',
    'G7_RELEASE_CAPABILITY','G7_OPERATION_ORIGIN',
    'G7_OPERATION_DATABASE_URL','G7_RUNNING_APP_DIGEST',
    'G7_RUNNING_MIGRATOR_DIGEST','G7_RUNNING_SOURCE_COMMIT',
  ].some(key => env[key] !== undefined && env[key] !== '') ||
    (env.G7_AUTH_ENABLED !== undefined && env.G7_AUTH_ENABLED !== 'false') ||
    (env.G7_CAD_WRITE_CUTOVER_ENABLED !== undefined &&
      env.G7_CAD_WRITE_CUTOVER_ENABLED !== 'false');
  if (!attempted) return 'legacy';
  const gate = resolveG7OperationGate(env);
  return gate?.writeEnabled ? 'protected' : 'blocked';
}
