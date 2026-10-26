/**
 * #109 S3-1: candidate Prisma migrations may run ONLY on disposable test DBs.
 * This configuration is NOT the default operational prisma.config.ts.
 * Do not copy the candidate migration into src/prisma/migrations before S3
 * release+operation approval and a separate rollout review.
 */
import { defineConfig } from 'prisma/config';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { G7_S3_SCHEMA_ID } from '../../server/g7-operational/preflight';

function disposableDatabaseUrl(): string {
  const env = process.env;
  if (env.G7_S3_MIGRATION_TEST_ONLY !== 'true' ||
      env.G7_AUTH_ENABLED === 'true' ||
      env.G7_CAD_WRITE_CUTOVER_ENABLED === 'true') {
    throw new Error('G7_S3_DISPOSABLE_MIGRATION_ONLY');
  }
  const rootInput = env.G7_S3_TEST_ROOT;
  if (!rootInput || !path.isAbsolute(rootInput) ||
      !/^cad-g7-s3-[A-Za-z0-9_-]{6,64}$/.test(path.basename(rootInput)) ||
      lstatSync(rootInput).isSymbolicLink()) {
    throw new Error('G7_S3_DISPOSABLE_MIGRATION_ONLY');
  }
  const root = realpathSync(rootInput);
  if (root !== path.join(realpathSync(tmpdir()), path.basename(rootInput))) {
    throw new Error('G7_S3_DISPOSABLE_MIGRATION_ONLY');
  }
  const stat = lstatSync(root);
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 ||
      (typeof process.getuid === 'function' && stat.uid !== process.getuid())) {
    throw new Error('G7_S3_DISPOSABLE_MIGRATION_ONLY');
  }
  const databasePath = path.join(root, 'fixture.sqlite');
  const db = lstatSync(databasePath);
  if (!db.isFile() || db.isSymbolicLink() ||
      realpathSync(databasePath) !== databasePath ||
      (db.mode & 0o077) !== 0 ||
      (typeof process.getuid === 'function' && db.uid !== process.getuid()) ||
      env.G7_S3_TEST_DATABASE_URL !== 'file:' + databasePath ||
      env.DATABASE_URL !== 'file:' + databasePath) {
    throw new Error('G7_S3_DISPOSABLE_MIGRATION_ONLY');
  }
  const markerPath = path.join(root, 's3-disposable.json');
  const markerFile = lstatSync(markerPath);
  if (!markerFile.isFile() || markerFile.isSymbolicLink() ||
      markerFile.size > 512 || (markerFile.mode & 0o077) !== 0 ||
      (typeof process.getuid === 'function' && markerFile.uid !== process.getuid())) {
    throw new Error('G7_S3_DISPOSABLE_MIGRATION_ONLY');
  }
  const marker: unknown = JSON.parse(readFileSync(markerPath, 'utf8'));
  if (!marker || typeof marker !== 'object' || Array.isArray(marker)) {
    throw new Error('G7_S3_DISPOSABLE_MIGRATION_ONLY');
  }
  const m = marker as Record<string, unknown>;
  if (m.scope !== 'G7-S3-DISPOSABLE-MIGRATION-TEST' ||
      m.schemaId !== G7_S3_SCHEMA_ID ||
      m.databasePath !== databasePath ||
      typeof m.fixtureNonce !== 'string' || !/^[a-f0-9]{32}$/.test(m.fixtureNonce)) {
    throw new Error('G7_S3_DISPOSABLE_MIGRATION_ONLY');
  }
  return 'file:' + databasePath;
}
let targetUrl: string;
try {
  targetUrl = disposableDatabaseUrl();
} catch {
  // No sensitive filesystem path, SQLite content or operator input in errors.
  throw new Error('G7_S3_DISPOSABLE_MIGRATION_ONLY');
}
export default defineConfig({
  schema: '../../prisma/schema.prisma',
  migrations: { path: './prisma/migrations' },
  datasource: { url: targetUrl },
});
