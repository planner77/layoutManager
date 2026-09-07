import { PrismaClient } from '@/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
export function createDb(url: string) { return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url, timeout: 5000 }) }); }
const globalDb = globalThis as unknown as { cadDb?: ReturnType<typeof createDb> };
export function database() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; use the documented npm launcher');
  return globalDb.cadDb ??= createDb(process.env.DATABASE_URL);
}
export type Database = ReturnType<typeof createDb>;
// Single-process P.O.C.: serialize writes to keep SQLite interactive transactions short.
let tail: Promise<unknown> = Promise.resolve();
export function writeTransaction<T>(db: Database, action: (tx: import('@/generated/prisma/client').Prisma.TransactionClient) => Promise<T>): Promise<T> { const pending = tail.then(() => db.$transaction(action, { timeout: 10000, maxWait: 10000 })); tail = pending.catch(() => {}); return pending; }
