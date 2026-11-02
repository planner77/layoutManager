import { context } from '@/server/context';
import { listQuery } from '@/domain/cad-list';
import { withAuthorizedDrawingMemoList } from '@/server/services/authorized-drawing-memo-list';
import { cadWriteContext } from '@/server/g7-operational/cad-preview-context';
import { failure, requireSameOrigin } from '@/server/http';
import { uploadCad } from '@/server/services/upload';
import { revalidatePath } from 'next/cache';
import { UploadDiagnostics, type UploadStage } from '@/server/upload-observability';
import { RequestLogContext } from '@/server/logger';
import { prepareG7CadWrite, recordG7WriteFailure } from '@/server/g7-operational/cad-guard';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const requestLog = new RequestLogContext(request, 'api', 'cad_list');
  try {
    requestLog.phase('database_read');
    const params = new URL(request.url).searchParams;
    const query = listQuery(params);
    const result = query.memo
      ? await withAuthorizedDrawingMemoList(request, (repo, sites) => repo.list(query, sites))
      : await context().list.search(params);
    requestLog.phase('database_read', 'success');
    requestLog.completed(200);
    return Response.json(result, { headers: requestLog.responseHeaders({
      'Cache-Control': query.memo ? 'private, no-store' : 'no-store',
      ...(query.memo ? { 'Referrer-Policy': 'no-referrer' } : {}),
    }) });
  } catch (error) {
    const response = failure(error, { request: requestLog });
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }
}

export async function POST(request: Request) {
  const diagnostics = new UploadDiagnostics();
  const requestLog = new RequestLogContext(request, 'api', 'cad_upload', diagnostics.requestId);
  let stage: UploadStage = 'origin_validation';
  try {
    // Deny before receiving a potentially large CAD body.
    requestLog.phase('authorization');
    const auth = prepareG7CadWrite(request, requestLog.requestId);
    if (!auth?.runtime) requireSameOrigin(request);
    diagnostics.record('origin_validation', 'success');
    requestLog.phase('authorization', 'success');
    stage = 'context_initialization';
    const cad = cadWriteContext(auth);
    const { repo, storage } = cad;
    try {
    diagnostics.setBackend(storage.backend);
    diagnostics.record('context_initialization', 'success');
    stage = 'upload_receive';
    const result = await uploadCad(request, repo, storage, diagnostics, auth);
    stage = 'response';
    let cacheWarning = false;
    try {
      revalidatePath('/');
      revalidatePath(`/cad/locations/${result.locationId}`);
    } catch (error) {
      cacheWarning = true;
      diagnostics.record('response', 'warning', { error });
      requestLog.warn('cache_revalidation_failed', { outcome: 'warning', error });
    }
    const response = Response.json(
      { ...result, requestId: diagnostics.requestId },
      { status: 201, headers: requestLog.responseHeaders() },
    );
    diagnostics.finishSuccess();
    requestLog.completed(201, cacheWarning ? 'warning' : 'success');
    return response;
    } finally { await cad.close(); }
  } catch (error) {
    try { await recordG7WriteFailure(request,requestLog.requestId,'VERSION','CAD_UPLOAD',error); }
    catch (auditError) { return failure(auditError,{request:requestLog,diagnostics,stage}); }
    return failure(error, { request: requestLog, diagnostics, stage });
  }
}
