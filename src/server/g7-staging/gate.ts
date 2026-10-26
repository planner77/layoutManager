/** #109 S1 staging-only dual gate. Fails closed and never changes operating settings. */
import { lstatSync, realpathSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const G7_STAGING_SCHEMA_ID = '202610260001_g7_staging_auth';
export type G7StagingGate = Readonly<{
  root: string; databasePath: string; origin: string; writeEnabled: boolean;
  appDigest: string; migratorDigest: string; sourceCommit: string;
}>;

const isDigest = (value: unknown): value is string =>
  typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const isCommit = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

/** Caller supplies the server environment, never X-Forwarded/Host/Role headers.
 * A private manifest pins the candidate pair but is NOT proof of OCI registry
 * signatures/digests or permission to deploy to production (Owner S2 remains).
 */
export function resolveG7StagingGate(
  env: Readonly<Record<string, string | undefined>>,
): G7StagingGate | null {
  if (env.G7_STAGING_ONLY !== 'true' ||
      env.G7_AUTH_ENABLED !== 'true' ||
      env.G7_RELEASE_CAPABILITY !== 'G7-S1-STAGING-V1' ||
      env.G7_OPERATION_APPROVAL !== 'S1-STAGING-ONLY') return null;
  try {
    const rootInput = env.G7_STAGING_ROOT;
    if (!rootInput || !path.isAbsolute(rootInput) ||
        path.basename(rootInput).startsWith('.') ||
        !/^cad-g7-staging-[A-Za-z0-9_-]{6,64}$/.test(path.basename(rootInput))) return null;
    const root = realpathSync(rootInput);
    if (root !== path.join(realpathSync(tmpdir()), path.basename(rootInput)) ||
        !lstatSync(root).isDirectory() || lstatSync(rootInput).isSymbolicLink()) return null;
    if (typeof process.getuid === 'function' &&
        lstatSync(root).uid !== process.getuid()) return null;
    const dbFile = path.join(root, 'fixture.sqlite');
    if (!lstatSync(dbFile).isFile() || lstatSync(dbFile).isSymbolicLink() ||
        realpathSync(dbFile) !== dbFile ||
        env.G7_STAGING_DATABASE_URL !== 'file:' + dbFile ||
        env.DATABASE_URL !== 'file:' + dbFile) return null;
    const storageDir = path.join(root, 'cad');
    if (env.CAD_STORAGE_PATH !== storageDir ||
        lstatSync(storageDir).isSymbolicLink() ||
        realpathSync(storageDir) !== storageDir) return null;
    const manifestPath = path.join(root, 'release.json');
    if (lstatSync(manifestPath).isSymbolicLink() || !lstatSync(manifestPath).isFile() ||
        lstatSync(manifestPath).size > 2048) return null;
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;
    const m = manifest as Record<string, unknown>;
    if (m.scope !== 'S1-STAGING-ONLY' || m.schemaId !== G7_STAGING_SCHEMA_ID ||
        m.databasePath !== dbFile || !isDigest(m.appDigest) ||
        !isDigest(m.migratorDigest) || !isCommit(m.sourceCommit)) return null;
    const origin = env.G7_STAGING_ORIGIN;
    if (!origin || !/^https?:\/\//.test(origin) ||
        new URL(origin).origin !== origin) return null;
    return {
      root, databasePath: dbFile, origin,
      writeEnabled: env.G7_CAD_WRITE_CUTOVER_ENABLED === 'true',
      appDigest: m.appDigest, migratorDigest: m.migratorDigest,
      sourceCommit: m.sourceCommit,
    };
  } catch { return null; }
}
