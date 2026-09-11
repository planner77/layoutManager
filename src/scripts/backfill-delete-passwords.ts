import { database } from '@/server/db';
import { backfillDeletePasswords } from '@/server/backfill-delete-passwords';
const db = database();
let failed = false;
try {
  await backfillDeletePasswords(db);
} catch {
  failed = true;
  console.error(JSON.stringify({ event: 'delete_password_backfill', outcome: 'failure', errorCode: 'DELETE_PASSWORD_BACKFILL_FAILED' }));
} finally { await db.$disconnect(); }
if (failed) process.exitCode = 1;
