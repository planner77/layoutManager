import { cadWriteContext } from '@/server/g7-operational/cad-preview-context';
import { failure, requireSameOrigin } from '@/server/http';
import { validateDeletePassword, validateId, CadError } from '@/domain/cad';
import { revalidatePath } from 'next/cache';
import { clearDeleteAttempts, reserveDeleteAttempt } from '@/server/delete-rate-limit';
import { RequestLogContext } from '@/server/logger';
import { prepareG7CadWrite, recordG7WriteFailure } from '@/server/g7-operational/cad-guard';

export const runtime = 'nodejs';

export async function DELETE(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const requestLog = new RequestLogContext(request, 'api', 'cad_delete');
  try {
    requestLog.phase('authorization');
    const auth = prepareG7CadWrite(request, requestLog.requestId);
    if (!auth?.runtime) requireSameOrigin(request);
    requestLog.phase('authorization', 'success');
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
    const cad = cadWriteContext(auth);
    const { repo, storage } = cad;
    try {
    requestLog.phase('database_write');
    const deleted = await repo.deleteVersion(id, password, auth);
    requestLog.phase('database_write', 'success');
    clearDeleteAttempts(id);
    let cleanupPending = false;
    requestLog.phase('storage_cleanup');
    try {
      await storage.removeUncommitted(deleted.storagePath);
      await repo.db.cadDeletionJob.delete({ where: { id: deleted.jobId } });
      requestLog.phase('storage_cleanup', 'success');
    } catch (error) {
      cleanupPending = true;
      requestLog.phase('storage_cleanup', 'warning', { errorCode: 'STORAGE_CLEANUP_PENDING' });
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
    } finally { await cad.close(); }
  } catch (error) {
    try { await recordG7WriteFailure(request,requestLog.requestId,'VERSION',(await params).versionId,error); }
    catch (auditError) { return failure(auditError,{request:requestLog}); }
    return failure(error, { request: requestLog });
  }
}
