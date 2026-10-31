import { database } from '@/server/db';
import { backfillDeletePasswords } from '@/server/backfill-delete-passwords';
import { JobLogContext, flushLogStore } from '@/server/logger';

const db = database();
let failed = false;
const job = new JobLogContext('delete_password_backfill');

try {
  job.phase('database_write');
  await backfillDeletePasswords(db);
  job.phase('database_write', 'success');
} catch (error) {
  failed = true;
  job.phase('database_write', 'failure', { errorCode: 'DELETE_PASSWORD_BACKFILL_FAILED', error });
} finally {
  job.completed(failed ? 'failure' : 'success', failed ? { errorCode: 'DELETE_PASSWORD_BACKFILL_FAILED' } : {});
  try { await db.$disconnect(); } finally { await flushLogStore(); }
}
if (failed) process.exitCode = 1;
