import { context } from "@/server/context";
import { boundedJson, failure, requireSameOrigin } from "@/server/http";
import { RequestLogContext } from "@/server/logger";
import {
  masterName,
  masterType,
  optionalParentId,
  siteKind,
} from "@/domain/master";
import { revalidatePath } from "next/cache";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const log = new RequestLogContext(request, "api", "master_list");
  try {
    const result = await context().masters.tree(
      new URL(request.url).searchParams.get("active") !== "true",
    );
    log.completed(200);
    return Response.json(
      { items: result },
      { headers: log.responseHeaders({ "Cache-Control": "no-store" }) },
    );
  } catch (error) {
    return failure(error, { request: log });
  }
}
export async function POST(request: Request) {
  const log = new RequestLogContext(request, "api", "master_create");
  try {
    requireSameOrigin(request);
    const body = await boundedJson(request),
      type = masterType(String(body.type ?? ""));
    const result = await context().masters.create(type, {
      name: masterName(body.name),
      parentId:
        type === "business-units" ? undefined : optionalParentId(body.parentId),
      kind: type === "sites" ? siteKind(body.kind) : undefined,
    });
    try {
      revalidatePath("/", "layout");
    } catch (error) {
      log.warn("cache_revalidation_failed", { outcome: "warning", error });
    }
    log.completed(201);
    return Response.json(result, {
      status: 201,
      headers: log.responseHeaders(),
    });
  } catch (error) {
    return failure(error, { request: log });
  }
}
