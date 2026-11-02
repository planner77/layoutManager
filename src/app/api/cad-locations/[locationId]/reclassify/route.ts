import { prepareG7CadWrite, recordG7WriteFailure } from '@/server/g7-operational/cad-guard';
import { cadWriteContext } from '@/server/g7-operational/cad-preview-context';
import { boundedJson, failure, requireSameOrigin } from "@/server/http";
import { RequestLogContext } from "@/server/logger";
import { validateId, CadError } from "@/domain/cad";
import { revalidatePath } from "next/cache";
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ locationId: string }> },
) {
  const log = new RequestLogContext(request, "api", "floor_reclassify");
  try {
    log.phase('authorization');
    const auth = prepareG7CadWrite(request,log.requestId);
    if (!auth?.runtime) requireSameOrigin(request);
    log.phase('authorization', 'success');
    const body = await boundedJson(request, 2048);
    if (typeof body.buildingId !== "string")
      throw new CadError("INVALID_ID", "대상 동을 선택해주세요.");
    const cad = cadWriteContext(auth);
    let result;
    log.phase('database_write');
    try { result = await cad.masters.reclassifyFloor(
      validateId((await params).locationId),
      validateId(body.buildingId),
      auth,
    ); } finally { await cad.close(); }
    log.phase('database_write', 'success');
    let cacheWarning = false;
    try {
      revalidatePath("/", "layout");
    } catch (error) {
      cacheWarning = true;
      log.warn("cache_revalidation_failed", { outcome: "warning", error });
    }
    log.completed(200, cacheWarning ? 'warning' : 'success');
    return Response.json(result, { headers: log.responseHeaders() });
  } catch (error) {
    try { await recordG7WriteFailure(request,log.requestId,'ROLE','FLOOR_RECLASSIFY',error); }
    catch (auditError) { return failure(auditError,{request:log}); }
    return failure(error, { request: log });
  }
}
