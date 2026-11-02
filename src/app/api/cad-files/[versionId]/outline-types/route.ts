import { CadError, validateId } from '@/domain/cad';
import { RequestLogContext } from '@/server/logger';
import { resolveG7RuntimeGate } from '@/server/g7-operational/runtime-gate';
import { sceneReadContext } from '@/server/scene/scene-context';
import { authorizedOutlineCatalog, outlinePageQuery } from '@/server/cad-business/typed-outline-read';
import { typedOutlineFailure } from '@/server/cad-business/typed-outline-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Params={params:Promise<{versionId:string}>};
export async function GET(request:Request,{params}:Params){
  const log=new RequestLogContext(request,'api','business_outline_type_list');
  let ctx:ReturnType<typeof sceneReadContext>|undefined;
  const versionId=(await params).versionId;
  try{
    const id=validateId(versionId);
    const gate=resolveG7RuntimeGate(process.env);
    if(gate.state!=='ACTIVE')throw new CadError('BUSINESS_SCHEMA_UNAVAILABLE','업무 타입을 조회할 수 없습니다.',503);
    const page=outlinePageQuery(request.url,true);
    ctx=sceneReadContext(request);
    if(ctx.gate.state!=='ACTIVE')throw new CadError('BUSINESS_SCHEMA_UNAVAILABLE','업무 타입을 조회할 수 없습니다.',503);
    const data=await authorizedOutlineCatalog(ctx.repo.db,request,id,ctx.gate,page);
    log.completed(200);
    return Response.json(data,{headers:log.responseHeaders({'Cache-Control':'private, no-store',Vary:'Cookie'})});
  }catch(error){return typedOutlineFailure(request,log,versionId,error);}
  finally{await ctx?.close();}
}
