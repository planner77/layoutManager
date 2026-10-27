/**
 * S3-1/S3-2 disposable fixture guard shared by Prisma CLI and preview app.
 * Absolutely no operating DB fallback; all callers fail closed.
 */
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { G7_S3_SCHEMA_ID } from './preflight';

export type G7S3TestTarget = Readonly<{ root: string; databasePath: string }>;
export function requireG7S3DisposableTarget(
  env: Readonly<Record<string, string | undefined>>,
): G7S3TestTarget {
  try {
    if (process.platform === 'win32' || typeof process.getuid !== 'function' ||
        env.G7_S3_MIGRATION_TEST_ONLY !== 'true' ||
        env.G7_AUTH_ENABLED === 'true' ||
        env.G7_CAD_WRITE_CUTOVER_ENABLED === 'true') throw new Error();
    const requested = env.G7_S3_TEST_ROOT;
    if (!requested || !path.isAbsolute(requested) ||
        !/^cad-g7-s3-[A-Za-z0-9_-]{6,64}$/.test(path.basename(requested)) ||
        lstatSync(requested).isSymbolicLink()) throw new Error();
    const root = realpathSync(requested);
    if (root !== path.join(realpathSync('/tmp'), path.basename(requested))) throw new Error();
    const rootStat = lstatSync(root);
    if (!rootStat.isDirectory() || (rootStat.mode & 0o077) !== 0 ||
        rootStat.uid !== process.getuid()) throw new Error();
    const databasePath = path.join(root, 'fixture.sqlite');
    const file = lstatSync(databasePath);
    if (!file.isFile() || file.isSymbolicLink() ||
        realpathSync(databasePath) !== databasePath ||
        file.uid !== process.getuid() || (file.mode & 0o077) !== 0 ||
        env.G7_S3_TEST_DATABASE_URL !== 'file:' + databasePath ||
        env.DATABASE_URL !== 'file:' + databasePath) throw new Error();
    const markerFile = path.join(root, 's3-disposable.json');
    const markerStat = lstatSync(markerFile);
    if (!markerStat.isFile() || markerStat.isSymbolicLink() ||
        realpathSync(markerFile) !== markerFile ||
        markerStat.uid !== process.getuid() ||
        (markerStat.mode & 0o077) !== 0 ||
        markerStat.size < 2 || markerStat.size > 512) throw new Error();
    const value: unknown = JSON.parse(readFileSync(markerFile, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    const m = value as Record<string, unknown>;
    if (m.scope !== 'G7-S3-DISPOSABLE-MIGRATION-TEST' ||
        m.schemaId !== G7_S3_SCHEMA_ID ||
        m.databasePath !== databasePath ||
        typeof m.fixtureNonce !== 'string' || !/^[a-f0-9]{32}$/.test(m.fixtureNonce))
      throw new Error();
    return {root, databasePath};
  } catch {
    throw new Error('G7_S3_DISPOSABLE_MIGRATION_ONLY');
  }
}
