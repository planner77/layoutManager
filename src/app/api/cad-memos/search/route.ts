
import { CadError } from '@/domain/cad';
import { memoSearchQuery } from '@/domain/cad-memo-search';
import { failure } from '@/server/http';
import { RequestLogContext } from '@/server/logger';
import { sceneReadContext,requireMemoSearchSites } from '@/server/scene/scene-context';
import { businessSchema,memoFeatureSchema } from '@/server/cad-business/service';
import { CadMemoSearchRepository } from '@/server/repositories/cad-memo-search';
export const runtime='nodejs';
export async function GET(request:Request){
  // The query string may contain private memo words. Never put it into logs.
  const log=new RequestLogContext(request,'api','business_memo_search');
  let ctx:ReturnType<typeof sceneReadContext>|undefined;
  try{
    const query=memoSearchQuery(new URL(request.url).searchParams);
    ctx=sceneReadContext(request);
    if(ctx.gate.state!=='ACTIVE')
      throw new CadError('BUSINESS_AUTH_REQUIRED','메모 검색에는 로그인이 필요합니다.',401);
    const sites=await requireMemoSearchSites(request,ctx.repo.db,ctx.gate);
    await businessSchema(ctx.repo.db);
    const featuresAvailable=await memoFeatureSchema(ctx.repo.db);
    const result=await new CadMemoSearchRepository(ctx.repo.db).search(query,sites,featuresAvailable);
    log.completed(200);
    return Response.json(result,{headers:log.responseHeaders({
      'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer',
    })});
  }catch(error){return failure(error,{request:log});}
  finally{await ctx?.close();}
}
