import { validateId, CadError } from '@/domain/cad';
import { cadWriteContext } from '@/server/g7-operational/cad-preview-context';
import { failure, requireSameOrigin } from '@/server/http';
import { RequestLogContext } from '@/server/logger';
import { prepareG7CadWrite, recordG7WriteFailure } from '@/server/g7-operational/cad-guard';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';

export async function PUT(request: Request, { params }: { params: Promise<{ locationId: string }> }) {
  const requestLog = new RequestLogContext(request, 'api', 'cad_set_current');
  let auditTarget = 'CAD_CURRENT';
  try {
    const auth = prepareG7CadWrite(request, requestLog.requestId);
    if (!auth?.runtime) requireSameOrigin(request);
    let body: unknown;
    try { body = await request.json(); }
    catch { throw new CadError('INVALID_JSON','요청 내용을 확인해주세요.'); }
    auditTarget = validateId(String((body as {versionId?:unknown})?.versionId ?? ''));
    const cad = cadWriteContext(auth);
    let result;
    try {
      result = await cad.repo.setCurrent(
        validateId((await params).locationId),
        validateId(String((body as { versionId?: unknown })?.versionId ?? '')),
        auth,
      );
    } finally { await cad.close(); }
    for (const path of ['/', `/cad/locations/${result.id}`]) {
      try { revalidatePath(path); }
      catch (error) { requestLog.warn('cache_revalidation_failed', { outcome: 'warning', error }); }
    }
    requestLog.completed(200);
    return Response.json(
      { id: result.id, currentVersionId: result.currentVersionId },
      { headers: requestLog.responseHeaders() },
    );
  } catch (error) {
    try { await recordG7WriteFailure(request,requestLog.requestId,'VERSION',auditTarget,error); }
    catch (auditError) { return failure(auditError,{request:requestLog}); }
    return failure(error, { request: requestLog });
  }
}
