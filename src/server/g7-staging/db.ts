/** #109 S1 disposable staging DB only; never imports operating database(). */
import { createRequire } from 'node:module';
import type { IsolatedDb } from './g1-store';
import type { G7StagingGate } from './gate';
const Sqlite = createRequire(import.meta.url)('better-sqlite3') as
  new (filename: string, options?: object) => IsolatedDb;

export function openG7StagingDb(gate: G7StagingGate): IsolatedDb {
  const db = new Sqlite(gate.databasePath, { fileMustExist: true });
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    // Must be provisioned by the STAGING-ONLY Prisma migration, not by normal
    // app startup or a test helper imported into a production handler.
    const migration = db.prepare('SELECT finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name=?')
      .get('202610260001_g7_staging_auth');
    if (!migration || migration.finished_at == null || migration.rolled_back_at != null ||
        !db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?')
          .get('table', 'G3LoginAttempt')) {
      throw new Error('G7_STAGING_SCHEMA_NOT_READY');
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length > 0) {
      throw new Error('G7_STAGING_FOREIGN_KEY_INVALID');
    }
    return db;
  } catch {
    db.close();
    throw new Error('G7_STAGING_DATABASE_UNAVAILABLE');
  }
}
