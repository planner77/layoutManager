import { validateId, CadError } from '@/domain/cad';
import { context } from '@/server/context';
import { failure, requireSameOrigin } from '@/server/http';
import { RequestLogContext } from '@/server/logger';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';

export async function PUT(request: Request, { params }: { params: Promise<{ locationId: string }> }) {
  const requestLog = new RequestLogContext(request, 'api', 'cad_set_current');
  try {
    requireSameOrigin(request);
    let body: unknown;
    try { body = await request.json(); }
    catch { throw new CadError('INVALID_JSON','요청 내용을 확인해주세요.'); }
    const result = await context().repo.setCurrent(
      validateId((await params).locationId),
      validateId(String((body as { versionId?: unknown })?.versionId ?? '')),
    );
    for (const path of ['/', `/cad/locations/${result.id}`]) {
      try { revalidatePath(path); }
      catch (error) { requestLog.warn('cache_revalidation_failed', { outcome: 'warning', error }); }
    }
    requestLog.completed(200);
    return Response.json(
      { id: result.id, currentVersionId: result.currentVersionId },
      { headers: requestLog.responseHeaders() },
    );
  } catch(error) {
    return failure(error, { request: requestLog });
  }
}
