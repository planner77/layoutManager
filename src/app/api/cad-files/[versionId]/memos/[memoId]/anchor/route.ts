import {validateId} from '@/domain/cad';
import {failure,boundedJson} from '@/server/http';
import {RequestLogContext} from '@/server/logger';
import {requireBusinessWrite} from '@/server/cad-business/service';
import {mutateMemoAnchor} from '@/server/cad-business/anchor-service';
import {cadWriteContext} from '@/server/g7-operational/cad-preview-context';
import {recordG7WriteFailure} from '@/server/g7-operational/cad-guard';
export const runtime='nodejs';
type Params={params:Promise<{versionId:string;memoId:string}>};
export async function PATCH(request:Request,{params}:Params){
 const log=new RequestLogContext(request,'api','business_memo_anchor');
 const {versionId,memoId}=await params;
 let ctx:ReturnType<typeof cadWriteContext>|undefined;
 try{
  validateId(versionId);validateId(memoId);
  const proof=requireBusinessWrite(request,log.requestId);
  const body=await boundedJson(request,16384);
  ctx=cadWriteContext(proof);
  const result=await mutateMemoAnchor(ctx.repo.db,versionId,memoId,body,proof);
  log.completed(200);return Response.json(result,{headers:log.responseHeaders({'Cache-Control':'private, no-store',Vary:'Cookie'})});
 }catch(error){
  try{await recordG7WriteFailure(request,log.requestId,'VERSION',versionId,error);}
  catch(auditError){const response=failure(auditError,{request:log});
   response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Cookie');return response;}
  const response=failure(error,{request:log});
  response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Cookie');return response;
 }finally{await ctx?.close();}
}
