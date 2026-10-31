import { PrismaClient } from '../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { JobLogContext, flushLogStore } from '@/server/logger';

const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }) });
const job = new JobLogContext('database_check');
try {
  job.phase('connection');
  await db.$queryRaw`SELECT 1`;
  job.phase('connection', 'success');
  job.completed('success');
} catch (error) {
  job.phase('connection', 'failure', { error, errorCode: 'DATABASE_CHECK_FAILED' });
  job.completed('failure', { errorCode: 'DATABASE_CHECK_FAILED' });
  process.exitCode = 1;
} finally {
  try { await db.$disconnect(); } finally { await flushLogStore(); }
}
