import { database } from '@/server/db';
import { ConfiguredCadStorage } from '@/server/storage/configured-storage';
import { CadError } from '@/domain/cad';
import { JobLogContext, flushLogStore } from '@/server/logger';

const db = database();
const run = new JobLogContext('storage_cleanup');
let failed = false;
let storage: ConfiguredCadStorage | undefined;

try {
  if (!process.env.CAD_STORAGE_PATH) throw new Error('CAD_STORAGE_PATH is required');
  storage = new ConfiguredCadStorage(process.env.CAD_STORAGE_PATH, Number(process.env.MAX_UPLOAD_SIZE_MB ?? 100) * 1024 * 1024, process.env);
  run.phase('database_read');
  const jobs = await db.cadDeletionJob.findMany({ orderBy: { createdAt: 'asc' } });
  run.phase('database_read', 'success', { jobCount: jobs.length });
  for (const job of jobs) {
    run.phase('storage_cleanup');
    try {
      await storage.removeUncommitted(job.storagePath);
      await db.cadDeletionJob.delete({ where: { id: job.id } });
      run.phase('storage_cleanup', 'success');
    } catch (error) {
      failed = true;
      run.phase('storage_cleanup', 'failure', { errorCode: error instanceof CadError ? error.code : 'STORAGE_CLEANUP_FAILED', error });
    }
  }
  if (await db.cadDeletionJob.count()) failed = true;
} catch (error) {
  failed = true;
  run.phase('recovery', 'failure', { errorCode: error instanceof CadError ? error.code : 'STORAGE_CLEANUP_FAILED', error });
} finally {
  storage?.close();
  run.completed(failed ? 'failure' : 'success', failed ? { errorCode: 'STORAGE_CLEANUP_FAILED' } : {});
  try { await db.$disconnect(); } finally { await flushLogStore(); }
}
if (failed) process.exitCode = 1;
