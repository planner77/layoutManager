import { database } from '@/server/db';
import { ConfiguredCadStorage } from '@/server/storage/configured-storage';
import { CadError } from '@/domain/cad';
const db = database();
let failed = false;
let storage: ConfiguredCadStorage | undefined;
try {
  if (!process.env.CAD_STORAGE_PATH) throw new Error('CAD_STORAGE_PATH is required');
  storage = new ConfiguredCadStorage(process.env.CAD_STORAGE_PATH, Number(process.env.MAX_UPLOAD_SIZE_MB ?? 100) * 1024 * 1024, process.env);
  const jobs = await db.cadDeletionJob.findMany({ orderBy: { createdAt: 'asc' } });
  for (const job of jobs) {
    try { await storage.removeUncommitted(job.storagePath); await db.cadDeletionJob.delete({ where: { id: job.id } }); console.log(JSON.stringify({ event: 'storage_cleanup', outcome: 'success', jobId: job.id })); }
    catch (error) { failed = true; console.error(JSON.stringify({ event: 'storage_cleanup', outcome: 'failure', jobId: job.id, errorCode: error instanceof CadError ? error.code : 'STORAGE_CLEANUP_FAILED' })); }
  }
  if (await db.cadDeletionJob.count()) failed = true;
} catch (error) {
  failed = true;
  console.error(JSON.stringify({ event: 'storage_cleanup', outcome: 'failure', errorCode: error instanceof CadError ? error.code : 'STORAGE_CLEANUP_FAILED' }));
} finally { storage?.close(); await db.$disconnect(); }
if (failed) process.exitCode = 1;
