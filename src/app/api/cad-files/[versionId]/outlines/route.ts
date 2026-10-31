import { CadError, validateId } from '@/domain/cad';
import { boundedJson } from '@/server/http';
import { RequestLogContext } from '@/server/logger';
import { sceneReadContext } from '@/server/scene/scene-context';
import { cadWriteContext } from '@/server/g7-operational/cad-preview-context';
import { BusinessRepository, requireBusinessWrite } from '@/server/cad-business/service';
import { storedOutlinePage, outlinePageQuery } from '@/server/cad-business/typed-outline-read';
import { typedOutlineFailure } from '@/server/cad-business/typed-outline-http';
import { resolveG7RuntimeGate } from '@/server/g7-operational/runtime-gate';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Params={params:Promise<{versionId:string}>};
export async function GET(request:Request,{params}:Params){
 const log=new RequestLogContext(request,'api','business_outline_list');
 let ctx:ReturnType<typeof sceneReadContext>|undefined;
 const versionId=(await params).versionId;
 try{
  const id=validateId(versionId);
  if(resolveG7RuntimeGate(process.env).state!=='ACTIVE')
    throw new CadError('BUSINESS_SCHEMA_UNAVAILABLE','외곽선 조회를 처리할 수 없습니다.',503);
  const page=outlinePageQuery(request.url,false);
  ctx=sceneReadContext(request);
  if(ctx.gate.state!=='ACTIVE')throw new CadError('BUSINESS_AUTH_REQUIRED','로그인이 필요합니다.',401);
  const result=await storedOutlinePage(ctx.repo.db,request,id,ctx.gate,page);
  log.completed(200);return Response.json(result,{headers:log.responseHeaders({'Cache-Control':'private, no-store',Vary:'Cookie'})});
 }catch(error){return typedOutlineFailure(request,log,versionId,error);}
 finally{await ctx?.close();}
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
  const result=await repo.createOutline(id,body,proof,request.headers.get('idempotency-key'));
  const status=result.replayed?200:201;
  log.completed(status);return Response.json(result,{status,headers:log.responseHeaders({'Cache-Control':'private, no-store',Vary:'Cookie'})});
 }catch(error){
  return typedOutlineFailure(request,log,id,error);
 }finally{await ctx?.close();}
}
