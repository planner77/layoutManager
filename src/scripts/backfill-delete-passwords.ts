import { database } from '@/server/db';
import { backfillDeletePasswords } from '@/server/backfill-delete-passwords';
import { writeLog } from '@/server/logger';

const db = database();
let failed = false;
const startedAt = Date.now();

try {
  writeLog('info', 'delete_password_backfill_started', { component: 'maintenance', operation: 'delete_password_backfill', outcome: 'started' });
  await backfillDeletePasswords(db);
} catch (error) {
  failed = true;
  writeLog('error', 'delete_password_backfill_failed', { component: 'maintenance', operation: 'delete_password_backfill', outcome: 'failure', errorCode: 'DELETE_PASSWORD_BACKFILL_FAILED', error });
} finally {
  await db.$disconnect();
  writeLog(failed ? 'warn' : 'info', 'delete_password_backfill_completed', { component: 'maintenance', operation: 'delete_password_backfill', outcome: failed ? 'warning' : 'success', elapsedMs: Date.now() - startedAt });
}
if (failed) process.exitCode = 1;
