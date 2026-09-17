import { context } from '@/server/context';
import { failure, requireSameOrigin } from '@/server/http';
import { uploadCad } from '@/server/services/upload';
import { revalidatePath } from 'next/cache';
import { UploadDiagnostics, type UploadStage } from '@/server/upload-observability';
import { RequestLogContext } from '@/server/logger';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const requestLog = new RequestLogContext(request, 'api', 'cad_list');
  try {
    const result = await context().list.search(new URL(request.url).searchParams);
    requestLog.completed(200);
    return Response.json(result, { headers: requestLog.responseHeaders({ 'Cache-Control': 'no-store' }) });
  } catch (error) {
    return failure(error, { request: requestLog });
  }
}

export async function POST(request: Request) {
  const diagnostics = new UploadDiagnostics();
  const requestLog = new RequestLogContext(request, 'api', 'cad_upload', diagnostics.requestId);
  let stage: UploadStage = 'origin_validation';
  try {
    requireSameOrigin(request);
    diagnostics.record('origin_validation', 'success');
    stage = 'context_initialization';
    const { repo, storage } = context();
    diagnostics.setBackend(storage.backend);
    diagnostics.record('context_initialization', 'success');
    stage = 'upload_receive';
    const result = await uploadCad(request, repo, storage, diagnostics);
    stage = 'response';
    try {
      revalidatePath('/');
      revalidatePath(`/cad/locations/${result.locationId}`);
    } catch (error) {
      diagnostics.record('response', 'warning', { error });
      requestLog.warn('cache_revalidation_failed', { outcome: 'warning', error });
    }
    const response = Response.json(
      { ...result, requestId: diagnostics.requestId },
      { status: 201, headers: requestLog.responseHeaders() },
    );
    diagnostics.finishSuccess();
    requestLog.completed(201);
    return response;
  } catch (error) {
    return failure(error, { request: requestLog, diagnostics, stage });
  }
}
