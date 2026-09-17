import { PrismaClient } from '../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { writeLog } from '@/server/logger';

const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }) });
const startedAt = Date.now();
try {
  await db.$queryRaw`SELECT 1`;
  writeLog('info', 'database_check_completed', { component: 'maintenance', operation: 'database_check', outcome: 'success', elapsedMs: Date.now() - startedAt });
} catch (error) {
  writeLog('error', 'database_check_failed', { component: 'maintenance', operation: 'database_check', outcome: 'failure', errorCode: 'DATABASE_CHECK_FAILED', elapsedMs: Date.now() - startedAt, error });
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
