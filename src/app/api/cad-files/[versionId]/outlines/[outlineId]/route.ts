import { validateId } from '@/domain/cad';
import { boundedJson, failure } from '@/server/http';
import { RequestLogContext } from '@/server/logger';
import { recordG7WriteFailure } from '@/server/g7-operational/cad-guard';
import { cadWriteContext } from '@/server/g7-operational/cad-preview-context';
import { BusinessRepository, requireBusinessWrite } from '@/server/cad-business/service';
export const runtime='nodejs';
type Params={params:Promise<{versionId:string;outlineId:string}>};
async function apply(request:Request,{params}:Params,remove:boolean){
 const log=new RequestLogContext(request,'api','business_outline_change');
 const {versionId,outlineId:id}=await params;
 let ctx:ReturnType<typeof cadWriteContext>|undefined;
 try{
  validateId(versionId);validateId(id);
  const proof=requireBusinessWrite(request,log.requestId);
  const body=await boundedJson(request,524288);
  ctx=cadWriteContext(proof);
  const result=await new BusinessRepository(ctx.repo.db).editOutline(versionId,id,body,proof,remove);
  log.completed(200);return Response.json(result,{headers:log.responseHeaders({'Cache-Control':'private, no-store'})});
 }catch(error){
  try{await recordG7WriteFailure(request,log.requestId,'VERSION',versionId,error);}
  catch(auditError){return failure(auditError,{request:log});}
  return failure(error,{request:log});
 }finally{await ctx?.close();}
}
export async function PATCH(req:Request,ctx:Params){return apply(req,ctx,false);}
export async function DELETE(req:Request,ctx:Params){return apply(req,ctx,true);}
