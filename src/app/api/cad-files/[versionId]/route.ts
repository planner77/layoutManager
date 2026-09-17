import { context } from '@/server/context';
import { failure, requireSameOrigin } from '@/server/http';
import { validateDeletePassword, validateId, CadError } from '@/domain/cad';
import { revalidatePath } from 'next/cache';
import { clearDeleteAttempts, reserveDeleteAttempt } from '@/server/delete-rate-limit';
import { RequestLogContext } from '@/server/logger';

export const runtime = 'nodejs';

export async function DELETE(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const requestLog = new RequestLogContext(request, 'api', 'cad_delete');
  try {
    requireSameOrigin(request);
    const id = validateId((await params).versionId);
    if (Number(request.headers.get('content-length') ?? 0) > 1024) throw new CadError('INVALID_DELETE_PASSWORD', '요청이 너무 큽니다.');
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new CadError('INVALID_DELETE_PASSWORD', 'JSON 비밀번호를 입력해주세요.');
    let body: unknown;
    try {
      if (!request.body) throw new Error('missing body');
      const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
      for (;;) { const part = await reader.read(); if (part.done) break; total += part.value.byteLength; if (total > 1024) { await reader.cancel(); throw new CadError('INVALID_DELETE_PASSWORD', '요청이 너무 큽니다.'); } chunks.push(part.value); }
      body = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks.map(chunk => Buffer.from(chunk)))));
    } catch (error) { if (error instanceof CadError) throw error; throw new CadError('INVALID_DELETE_PASSWORD', 'JSON 비밀번호를 입력해주세요.'); }
    const password = validateDeletePassword((body as { password?: unknown })?.password);
    reserveDeleteAttempt(id);
    const { repo, storage } = context();
    const deleted = await repo.deleteVersion(id, password);
    clearDeleteAttempts(id);
    let cleanupPending = false;
    try {
      await storage.removeUncommitted(deleted.storagePath);
      await repo.db.cadDeletionJob.delete({ where: { id: deleted.jobId } });
    } catch (error) {
      cleanupPending = true;
      requestLog.warn('cad_delete_cleanup_pending', { outcome: 'warning', error, errorCode: 'STORAGE_CLEANUP_PENDING' });
    }
    for (const path of ['/', `/cad/locations/${deleted.locationId}`, `/cad/versions/${id}/viewer`]) {
      try { revalidatePath(path); }
      catch (error) { requestLog.warn('cache_revalidation_failed', { outcome: 'warning', error }); }
    }
    const status = cleanupPending ? 202 : 200;
    requestLog.completed(status, cleanupPending ? 'warning' : 'success');
    return Response.json(
      { deleted: true, cleanupPending, locationId: deleted.locationId, wasCurrent: deleted.wasCurrent, requestId: requestLog.requestId },
      { status, headers: requestLog.responseHeaders() },
    );
  } catch (error) {
    return failure(error, { request: requestLog });
  }
}
