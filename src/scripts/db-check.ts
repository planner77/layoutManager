import { PrismaClient } from '../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }) });
try {
  await db.$queryRaw`SELECT 1`;
  console.log('SQLite connection OK');
} finally { await db.$disconnect(); }
