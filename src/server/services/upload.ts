import { CadRepository } from '../repositories/cad';
import type { StorageBackend } from '../storage/backend';
export async function uploadCad(request: Request, repo: CadRepository, storage: StorageBackend) {
  const received = await storage.receive(request);
  let published: string | undefined;
  try {
    published = await storage.prepare?.(received);
    return await repo.register(received.input, published ? {...received.file, storagePath: published} : received.file,
      published ? undefined : async (location, version) => published = await storage.publish(received.tempFile, location, version, received.file.fileFormat));
  }
  catch (error) {
    if (published) {
      // A failed COMMIT response may be ambiguous. Retain the file unless absence is confirmed.
      try { if (!await repo.db.cadFileVersion.findUnique({ where: { storagePath: published } })) await storage.removeUncommitted(published); } catch { console.error('CAD_UPLOAD_CLEANUP_PENDING'); }
    }
    throw error;
  } finally { await received.cleanup(); }
}
