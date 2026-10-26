/** #109 G7 release-specific operational auth DB, inaccessible unless private S3 GO is valid.
 * The same G1 SQL contracts are used by the staged and operational clients.
 */
import { createRequire } from 'node:module';
import type { IsolatedDb } from '../g7-staging/g1-store';
import { G7_OPERATION_SCHEMA_ID, type G7OperationGate } from './gate';

const BetterSqlite = createRequire(import.meta.url)('better-sqlite3') as
  new (filename: string, options?: object) => IsolatedDb;
export function openG7OperationalAuthDb(gate: G7OperationGate): IsolatedDb {
  const db = new BetterSqlite(gate.databaseFile, { fileMustExist: true, timeout: 5000 });
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const migration = db.prepare(
      'SELECT finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name=?',
    ).get(G7_OPERATION_SCHEMA_ID);
    if (!migration || migration.finished_at == null || migration.rolled_back_at != null ||
        !db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?')
          .get('table', 'AuditEvent') ||
        !db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?')
          .get('table', 'G3LoginAttempt') ||
        db.prepare('PRAGMA foreign_key_check').all().length !== 0) {
      throw new Error('G7_AUTH_DB_NOT_READY');
    }
    return db;
  } catch {
    db.close();
    throw new Error('G7_AUTH_DB_UNAVAILABLE');
  }
}
