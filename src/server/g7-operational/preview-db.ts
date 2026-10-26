/** S3-2: open only an independently verified disposable S3 migration DB. */
import { createRequire } from 'node:module';
import type { IsolatedDb } from '../g7-staging/g1-store';
import type { G7S3TestTarget } from './disposable-target';
import { G7_S3_SCHEMA_ID } from './preflight';

const Sqlite = createRequire(import.meta.url)('better-sqlite3') as
  new (filename: string, options: object) => IsolatedDb;
const REQUIRED = [
  'User', 'UserRoleGrant', 'UserSiteGrant', 'SpecialGrant',
  'AuthSession', 'AuditEvent', 'AdminRecoveryNonce', 'G3LoginAttempt',
] as const;

export function openG7S3PreviewDb(target: G7S3TestTarget): IsolatedDb {
  const db = new Sqlite(target.databasePath, {fileMustExist: true});
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const row = db.prepare(
      'SELECT finished_at,rolled_back_at FROM "_prisma_migrations" WHERE migration_name=?',
    ).get(G7_S3_SCHEMA_ID);
    if (!row || row.finished_at == null || row.rolled_back_at != null)
      throw new Error('SCHEMA_NOT_MIGRATED');
    for (const name of REQUIRED) {
      const found = db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
      ).get(name);
      if (!found) throw new Error('TABLE_MISSING');
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length !== 0)
      throw new Error('FOREIGN_KEY_FAILURE');
    return db;
  } catch {
    db.close();
    throw new Error('G7_S3_PREVIEW_DATABASE_UNAVAILABLE');
  }
}
