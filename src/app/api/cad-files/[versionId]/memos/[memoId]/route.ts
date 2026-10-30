import { CadError, validateId } from '@/domain/cad';
import { sceneReadContext, requireSceneRead } from '@/server/scene/scene-context';
import { boundedJson, failure } from '@/server/http';
import { RequestLogContext } from '@/server/logger';
import { recordG7WriteFailure } from '@/server/g7-operational/cad-guard';
import { cadWriteContext } from '@/server/g7-operational/cad-preview-context';
import { BusinessRepository, requireBusinessWrite } from '@/server/cad-business/service';
export const runtime='nodejs';
type Params={params:Promise<{versionId:string;memoId:string}>};
async function apply(request:Request,{params}:Params,remove:boolean){
 const log=new RequestLogContext(request,'api','business_memo_change');
 const {versionId,memoId:id}=await params;
 let ctx:ReturnType<typeof cadWriteContext>|undefined;
 try{
  validateId(versionId);validateId(id);
  const proof=requireBusinessWrite(request,log.requestId);
  const body=await boundedJson(request,524288);
  ctx=cadWriteContext(proof);
  const result=await new BusinessRepository(ctx.repo.db).editMemo(versionId,id,body,proof,remove);
  log.completed(200);return Response.json(result,{headers:log.responseHeaders({'Cache-Control':'private, no-store'})});
 }catch(error){
  try{await recordG7WriteFailure(request,log.requestId,'VERSION',versionId,error);}
  catch(auditError){return failure(auditError,{request:log});}
  return failure(error,{request:log});
 }finally{await ctx?.close();}
}
export async function GET(request:Request,{params}:Params){
 const log=new RequestLogContext(request,'api','business_memo_read');
 let ctx:ReturnType<typeof sceneReadContext>|undefined;
 try{
  const {versionId,memoId:id}=await params;
  validateId(versionId);validateId(id);
  ctx=sceneReadContext(request);
  if(ctx.gate.state!=='ACTIVE')throw new CadError('BUSINESS_AUTH_REQUIRED','로그인이 필요합니다.',401);
  await requireSceneRead(request,ctx.repo.db,versionId,ctx.gate,'memo:read');
  const data=await new BusinessRepository(ctx.repo.db).list('memo',versionId);
  const match=data.memos.find(item=>item.id===id);
  if(!match)throw new CadError('BUSINESS_NOT_FOUND','업무 객체를 찾지 못했습니다.',404);
  log.completed(200);
  return Response.json(match,{headers:log.responseHeaders({'Cache-Control':'private, no-store'})});
 }catch(error){return failure(error,{request:log});}
 finally{await ctx?.close();}
}
export async function PATCH(req:Request,ctx:Params){return apply(req,ctx,false);}
export async function DELETE(req:Request,ctx:Params){return apply(req,ctx,true);}
