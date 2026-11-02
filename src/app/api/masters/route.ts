import { prepareG7CadWrite, recordG7WriteFailure } from '@/server/g7-operational/cad-guard';
import { cadWriteContext } from '@/server/g7-operational/cad-preview-context';
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
    log.phase('database_read');
    const result = await context().masters.tree(
      new URL(request.url).searchParams.get("active") !== "true",
    );
    log.phase('database_read', 'success');
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
    log.phase('authorization');
    const auth = prepareG7CadWrite(request,log.requestId);
    if (!auth?.runtime) requireSameOrigin(request);
    log.phase('authorization', 'success');
    const body = await boundedJson(request),
      type = masterType(String(body.type ?? ""));
    const cad = cadWriteContext(auth);
    let result;
    log.phase('database_write');
    try { result = await cad.masters.create(type, {
      name: masterName(body.name),
      parentId:
        type === "business-units" ? undefined : optionalParentId(body.parentId),
      kind: type === "sites" ? siteKind(body.kind) : undefined,
    },auth); } finally { await cad.close(); }
    log.phase("database_write", "success");
    let cacheWarning = false;
    try {
      revalidatePath("/", "layout");
    } catch (error) {
      cacheWarning = true;
      log.warn("cache_revalidation_failed", { outcome: "warning", error });
    }
    log.completed(201, cacheWarning ? 'warning' : 'success');
    return Response.json(result, {
      status: 201,
      headers: log.responseHeaders(),
    });
  } catch (error) {
    try { await recordG7WriteFailure(request,log.requestId,'ROLE','MASTER_CREATE',error); }
    catch (auditError) { return failure(auditError,{request:log}); }
    return failure(error, { request: log });
  }
}
