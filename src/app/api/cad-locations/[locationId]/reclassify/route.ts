import { context } from "@/server/context";
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
    requireSameOrigin(request);
    const body = await boundedJson(request, 2048);
    if (typeof body.buildingId !== "string")
      throw new CadError("INVALID_ID", "대상 동을 선택해주세요.");
    const result = await context().masters.reclassifyFloor(
      validateId((await params).locationId),
      validateId(body.buildingId),
    );
    try {
      revalidatePath("/", "layout");
    } catch (error) {
      log.warn("cache_revalidation_failed", { outcome: "warning", error });
    }
    log.completed(200);
    return Response.json(result, { headers: log.responseHeaders() });
  } catch (error) {
    return failure(error, { request: log });
  }
}
