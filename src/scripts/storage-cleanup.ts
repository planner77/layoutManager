import { database } from '@/server/db';
import { context } from '@/server/context';
const db = database();
const { storage } = context();
const jobs = await db.cadDeletionJob.findMany({ orderBy: { createdAt: 'asc' } });
for (const job of jobs) {
  try { await storage.removeUncommitted(job.storagePath); await db.cadDeletionJob.delete({ where: { id: job.id } }); console.log(JSON.stringify({ event: 'storage_cleanup', outcome: 'success', jobId: job.id })); }
  catch (error) { console.error(JSON.stringify({ event: 'storage_cleanup', outcome: 'failure', jobId: job.id, error: error instanceof Error ? error.name : 'Unknown' })); }
}
await db.$disconnect();
