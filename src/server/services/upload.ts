import { CadRepository } from '../repositories/cad';
import type { StorageBackend } from '../storage/backend';
import type { UploadDiagnostics } from '../upload-observability';
function recoveryId(locator: string | undefined) { return locator?.match(/(?:cad\/|\/)([0-9a-f]{8}-[0-9a-f-]{27})\/original\.(?:dxf|dwg)$/i)?.[1]; }
export async function uploadCad(request: Request, repo: CadRepository, storage: StorageBackend, diagnostics?: UploadDiagnostics) {
  let received;
  try {
    received = await storage.receive(request, diagnostics);
  } catch (error) {
    // CadStorage records its precise receive/validation boundary. This fallback covers other backend implementations and setup I/O failures.
    diagnostics?.record('upload_receive', 'failure', { error });
    throw error;
  }
  let published: string | undefined;
  let result: Awaited<ReturnType<CadRepository['register']>>;
  try {
    if (storage.prepare) {
      try {
        published = await storage.prepare(received);
        if (published) diagnostics?.record('storage_publish', 'success', { recoveryId: recoveryId(published) });
      } catch (error) {
        diagnostics?.record('storage_publish', 'failure', { error });
        throw error;
      }
    }
    try {
      result = await repo.register(received.input, published ? {...received.file, storagePath: published} : received.file,
        published ? undefined : async (location, version) => {
          try {
            const locator = await storage.publish(received.tempFile, location, version, received.file.fileFormat);
            published = locator;
            diagnostics?.record('storage_publish', 'success', { recoveryId: recoveryId(locator) });
            return locator;
          } catch (error) {
            diagnostics?.record('storage_publish', 'failure', { error });
            throw error;
          }
        });
      diagnostics?.record('database_registration', 'success');
    } catch (error) {
      diagnostics?.record('database_registration', 'failure', { error });
      throw error;
    }
  }
  catch (error) {
    if (published) {
      // A failed COMMIT response may be ambiguous. Retain the file unless absence is confirmed.
      try {
        if (!await repo.db.cadFileVersion.findUnique({ where: { storagePath: published } })) {
          await storage.removeUncommitted(published);
          diagnostics?.record('compensation', 'success', { recoveryId: recoveryId(published) });
        }
      } catch (cleanupError) {
        diagnostics?.record('compensation', 'warning', { error: cleanupError, recoveryId: recoveryId(published) });
      }
    }
    try {
      await received.cleanup();
      diagnostics?.record('temporary_cleanup', 'success');
    } catch (cleanupError) {
      diagnostics?.record('temporary_cleanup', 'warning', { error: cleanupError });
    }
    throw error;
  }
  try {
    await received.cleanup();
    diagnostics?.record('temporary_cleanup', 'success');
  } catch (cleanupError) {
    diagnostics?.record('temporary_cleanup', 'warning', { error: cleanupError });
  }
  return result;
}
