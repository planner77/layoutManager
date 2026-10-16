import { context } from "@/server/context";
import { boundedJson, failure, requireSameOrigin } from "@/server/http";
import { RequestLogContext } from "@/server/logger";
import { masterName, masterType, siteKind } from "@/domain/master";
import { validateId, CadError } from "@/domain/cad";
import { revalidatePath } from "next/cache";
export const runtime = "nodejs";
type Params = { params: Promise<{ type: string; id: string }> };
function refresh(log: RequestLogContext) {
  try {
    revalidatePath("/", "layout");
  } catch (error) {
    log.warn("cache_revalidation_failed", { outcome: "warning", error });
  }
}
export async function PATCH(request: Request, { params }: Params) {
  const log = new RequestLogContext(request, "api", "master_update");
  try {
    requireSameOrigin(request);
    const p = await params,
      body = await boundedJson(request);
    if ("id" in body || "parentId" in body || "isUnclassified" in body)
      throw new CadError(
        "IMMUTABLE_MASTER",
        "ID, 상위 소속, 미분류 표시는 변경할 수 없습니다.",
        409,
      );
    const type = masterType(p.type),
      data: {
        name?: string;
        kind?: "SITE" | "LEGAL_ENTITY";
        active?: boolean;
      } = {};
    if ("name" in body) data.name = masterName(body.name);
    if ("active" in body) {
      if (typeof body.active !== "boolean")
        throw new CadError("INVALID_ACTIVE", "활성 상태를 확인해주세요.");
      data.active = body.active;
    }
    if ("kind" in body) {
      if (type !== "sites")
        throw new CadError(
          "INVALID_SITE_KIND",
          "사업장/법인에서만 종류를 변경할 수 있습니다.",
        );
      data.kind = siteKind(body.kind);
    }
    const result = await context().masters.update(type, validateId(p.id), data);
    refresh(log);
    log.completed(200);
    return Response.json(result, { headers: log.responseHeaders() });
  } catch (error) {
    return failure(error, { request: log });
  }
}
export async function DELETE(request: Request, { params }: Params) {
  const log = new RequestLogContext(request, "api", "master_delete");
  try {
    requireSameOrigin(request);
    const p = await params,
      result = await context().masters.remove(
        masterType(p.type),
        validateId(p.id),
      );
    refresh(log);
    log.completed(200);
    return Response.json(result, { headers: log.responseHeaders() });
  } catch (error) {
    return failure(error, { request: log });
  }
}
