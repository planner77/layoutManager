import { context } from '@/server/context';
import { failure, requireSameOrigin } from '@/server/http';
import { uploadCad } from '@/server/services/upload';
import { revalidatePath } from 'next/cache';
import { UploadDiagnostics, type UploadStage } from '@/server/upload-observability';
export const runtime = 'nodejs';
export async function GET(request: Request) { try { return Response.json(await context().list.search(new URL(request.url).searchParams), { headers: { 'Cache-Control': 'no-store' } }); } catch (error) { return failure(error); } }
export async function POST(request: Request) {
  const diagnostics = new UploadDiagnostics();
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
    } catch (error) { diagnostics.record('response', 'warning', { error }); }
    const response = Response.json({ ...result, requestId: diagnostics.requestId }, { status: 201, headers: { 'X-Request-Id': diagnostics.requestId } });
    diagnostics.finishSuccess();
    return response;
  } catch (error) {
    return failure(error, diagnostics, stage);
  }
}
