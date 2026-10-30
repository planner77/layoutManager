import {validateId} from '@/domain/cad';
import {failure,boundedJson} from '@/server/http';
import {RequestLogContext} from '@/server/logger';
import {cadWriteContext} from '@/server/g7-operational/cad-preview-context';
import {recordG7WriteFailure} from '@/server/g7-operational/cad-guard';
import {requireBusinessWrite} from '@/server/cad-business/service';
import {MemoGroupRepository} from '@/server/cad-business/memo-groups';
export const runtime='nodejs';
type Params={params:Promise<{versionId:string}>};
export async function POST(request:Request,{params}:Params){
 const log=new RequestLogContext(request,'api','business_memo_group_create');
 const id=(await params).versionId;
 let ctx:ReturnType<typeof cadWriteContext>|undefined;
 try{
  validateId(id);
  const proof=requireBusinessWrite(request,log.requestId);
  const body=await boundedJson(request,524288);
  ctx=cadWriteContext(proof);
  const result=await new MemoGroupRepository(ctx.repo.db).create(id,body,proof);
  log.completed(201);return Response.json(result,{status:201,
   headers:log.responseHeaders({'Cache-Control':'private, no-store'})});
 }catch(error){
  try{await recordG7WriteFailure(request,log.requestId,'VERSION',id,error);}
  catch(auditError){return failure(auditError,{request:log});}
  return failure(error,{request:log});
 }finally{await ctx?.close();}
}
