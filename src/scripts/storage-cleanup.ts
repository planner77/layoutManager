import { database } from '@/server/db';
import { ConfiguredCadStorage } from '@/server/storage/configured-storage';
import { CadError } from '@/domain/cad';
import { writeLog } from '@/server/logger';

const db = database();
let failed = false;
let storage: ConfiguredCadStorage | undefined;
const startedAt = Date.now();

try {
  if (!process.env.CAD_STORAGE_PATH) throw new Error('CAD_STORAGE_PATH is required');
  storage = new ConfiguredCadStorage(process.env.CAD_STORAGE_PATH, Number(process.env.MAX_UPLOAD_SIZE_MB ?? 100) * 1024 * 1024, process.env);
  const jobs = await db.cadDeletionJob.findMany({ orderBy: { createdAt: 'asc' } });
  writeLog('info', 'storage_cleanup_started', { component: 'maintenance', operation: 'storage_cleanup', outcome: 'started', jobCount: jobs.length });
  for (const job of jobs) {
    try {
      await storage.removeUncommitted(job.storagePath);
      await db.cadDeletionJob.delete({ where: { id: job.id } });
      writeLog('info', 'storage_cleanup_job_completed', { component: 'maintenance', operation: 'storage_cleanup', outcome: 'success', jobId: job.id });
    } catch (error) {
      failed = true;
      writeLog('error', 'storage_cleanup_job_failed', { component: 'maintenance', operation: 'storage_cleanup', outcome: 'failure', jobId: job.id, errorCode: error instanceof CadError ? error.code : 'STORAGE_CLEANUP_FAILED', error });
    }
  }
  if (await db.cadDeletionJob.count()) failed = true;
} catch (error) {
  failed = true;
  writeLog('error', 'storage_cleanup_failed', { component: 'maintenance', operation: 'storage_cleanup', outcome: 'failure', errorCode: error instanceof CadError ? error.code : 'STORAGE_CLEANUP_FAILED', error });
} finally {
  storage?.close();
  await db.$disconnect();
  writeLog(failed ? 'warn' : 'info', 'storage_cleanup_completed', { component: 'maintenance', operation: 'storage_cleanup', outcome: failed ? 'warning' : 'success', elapsedMs: Date.now() - startedAt });
}
if (failed) process.exitCode = 1;
