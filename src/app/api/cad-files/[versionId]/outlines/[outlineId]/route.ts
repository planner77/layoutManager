import { CadError, validateId } from '@/domain/cad';
import { sceneReadContext } from '@/server/scene/scene-context';
import { boundedJson } from '@/server/http';
import { RequestLogContext } from '@/server/logger';
import { cadWriteContext } from '@/server/g7-operational/cad-preview-context';
import { BusinessRepository, requireBusinessWrite } from '@/server/cad-business/service';
import { storedOutlineById } from '@/server/cad-business/typed-outline-read';
import { typedOutlineFailure } from '@/server/cad-business/typed-outline-http';
import { resolveG7RuntimeGate } from '@/server/g7-operational/runtime-gate';
export const runtime='nodejs';
export const dynamic='force-dynamic';
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
  log.completed(200);return Response.json(result,{headers:log.responseHeaders({'Cache-Control':'private, no-store',Vary:'Cookie'})});
 }catch(error){
  return typedOutlineFailure(request,log,versionId,error);
 }finally{await ctx?.close();}
}
export async function GET(request:Request,{params}:Params){
 const log=new RequestLogContext(request,'api','business_outline_read');
 let ctx:ReturnType<typeof sceneReadContext>|undefined;
 const {versionId,outlineId:id}=await params;
 try{
  validateId(versionId);validateId(id);
  if(resolveG7RuntimeGate(process.env).state!=='ACTIVE')
    throw new CadError('BUSINESS_SCHEMA_UNAVAILABLE','외곽선 조회를 처리할 수 없습니다.',503);
  ctx=sceneReadContext(request);
  if(ctx.gate.state!=='ACTIVE')throw new CadError('BUSINESS_AUTH_REQUIRED','로그인이 필요합니다.',401);
  const match=await storedOutlineById(ctx.repo.db,request,versionId,id,ctx.gate);
  log.completed(200);
  return Response.json(match,{headers:log.responseHeaders({'Cache-Control':'private, no-store',Vary:'Cookie'})});
 }catch(error){return typedOutlineFailure(request,log,versionId,error);}
 finally{await ctx?.close();}
}
export async function PATCH(req:Request,ctx:Params){return apply(req,ctx,false);}
export async function DELETE(req:Request,ctx:Params){return apply(req,ctx,true);}
