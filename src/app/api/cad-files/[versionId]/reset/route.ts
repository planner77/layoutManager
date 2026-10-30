import {validateId} from '@/domain/cad';
import {failure,boundedJson} from '@/server/http';
import {RequestLogContext} from '@/server/logger';
import {requireBusinessWrite} from '@/server/cad-business/service';
import {resetBusinessVersion} from '@/server/cad-business/reset-service';
import {cadWriteContext} from '@/server/g7-operational/cad-preview-context';
import {recordG7WriteFailure} from '@/server/g7-operational/cad-guard';
export const runtime='nodejs';
type Params={params:Promise<{versionId:string}>};
export async function POST(request:Request,{params}:Params){
 const log=new RequestLogContext(request,'api','business_scene_origin_reset');
 const {versionId}=await params;
 let ctx:ReturnType<typeof cadWriteContext>|undefined;
 try{
  validateId(versionId);
  const proof=requireBusinessWrite(request,log.requestId);
  const body=await boundedJson(request,32768);
  ctx=cadWriteContext(proof);
  const result=await resetBusinessVersion(ctx.repo.db,versionId,body,proof);
  log.completed(200);
  return Response.json(result,{headers:log.responseHeaders({'Cache-Control':'private, no-store'})});
 }catch(error){
  try{await recordG7WriteFailure(request,log.requestId,'VERSION',versionId,error);}
  catch(auditError){return failure(auditError,{request:log});}
  return failure(error,{request:log});
 }finally{await ctx?.close();}
}
