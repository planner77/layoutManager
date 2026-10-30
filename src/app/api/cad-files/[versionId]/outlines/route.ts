import { CadError, validateId } from '@/domain/cad';
import { failure, boundedJson } from '@/server/http';
import { RequestLogContext } from '@/server/logger';
import { sceneReadContext, requireSceneRead } from '@/server/scene/scene-context';
import { cadWriteContext } from '@/server/g7-operational/cad-preview-context';
import { recordG7WriteFailure } from '@/server/g7-operational/cad-guard';
import { BusinessRepository, requireBusinessWrite } from '@/server/cad-business/service';
export const runtime='nodejs';
type Params={params:Promise<{versionId:string}>};
export async function GET(request:Request,{params}:Params){
 const log=new RequestLogContext(request,'api','business_outline_list');
 let ctx:ReturnType<typeof sceneReadContext>|undefined;
 try{
  const id=validateId((await params).versionId);
  ctx=sceneReadContext(request);
  if(ctx.gate.state!=='ACTIVE')throw new CadError('BUSINESS_AUTH_REQUIRED','로그인이 필요합니다.',401);
  await requireSceneRead(request,ctx.repo.db,id,ctx.gate,'outline:read');
  const result=await new BusinessRepository(ctx.repo.db).list('outline',id);
  log.completed(200);return Response.json(result,{headers:log.responseHeaders({'Cache-Control':'private, no-store'})});
 }catch(error){return failure(error,{request:log});}finally{await ctx?.close();}
}
export async function POST(request:Request,{params}:Params){
 const log=new RequestLogContext(request,'api','business_outline_create');
 const id=(await params).versionId;
 let ctx:ReturnType<typeof cadWriteContext>|undefined;
 try{
  validateId(id);
  const proof=requireBusinessWrite(request,log.requestId);
  const body=await boundedJson(request,524288);
  ctx=cadWriteContext(proof);
  const repo=new BusinessRepository(ctx.repo.db);
  const result=await repo.createOutline(id,body,proof);
  log.completed(201);return Response.json(result,{status:201,headers:log.responseHeaders({'Cache-Control':'private, no-store'})});
 }catch(error){
  try{await recordG7WriteFailure(request,log.requestId,'VERSION',id,error);}
  catch(auditError){return failure(auditError,{request:log});}
  return failure(error,{request:log});
 }finally{await ctx?.close();}
}
