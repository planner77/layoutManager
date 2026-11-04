/** #225/B3 signed G7-scoped, no-store batched status (not raw Job records). */
import {CadError,validateId} from '@/domain/cad';
import {failure} from '@/server/http';
import {RequestLogContext} from '@/server/logger';
import {sceneReadContext,requireMemoSearchSites} from '@/server/scene/scene-context';
import {readSceneBuildBatch,SCENE_BATCH_LIMIT} from '@/server/scene/scene-build-status-batch';

export const runtime='nodejs';
export async function GET(request:Request){
  const log=new RequestLogContext(request,'api','scene_build_list');
  let ctx:ReturnType<typeof sceneReadContext>|undefined;
  try{
    const query=new URL(request.url).searchParams;
    if([...query.keys()].some(key=>key!=='versionId'))
      throw new CadError('SCENE_BATCH_INVALID','조회 조건을 확인해주세요.',400);
    const raw=query.getAll('versionId');
    if(raw.length<1||raw.length>SCENE_BATCH_LIMIT||
       new Set(raw).size!==raw.length)
      throw new CadError('SCENE_BATCH_INVALID','도면 조회 개수를 확인해주세요.',400);
    const ids=raw.map(id=>validateId(id));
    ctx=sceneReadContext(request);
    if(ctx.gate.state!=='ACTIVE')
      throw new CadError('G7_AUTH_CONTEXT_REQUIRED','로그인 후 조회할 수 있습니다.',503);
    const readSites=await requireMemoSearchSites(request,ctx.repo.db,ctx.gate,'cad:read');
    let writeSites:string[]=[];
    try{
      writeSites=await requireMemoSearchSites(request,ctx.repo.db,ctx.gate,'cad:upload');
    }catch(error){
      if(!(error instanceof CadError)||error.code!=='ACCESS_DENIED')throw error;
    }
    const response=await readSceneBuildBatch(ctx.repo.db,ctx.repo.storage,ids,readSites,writeSites);
    log.completed(200);
    return Response.json(response,{headers:log.responseHeaders({
      'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer',
    })});
  }catch(error){
    const response=failure(error,{request:log});
    response.headers.set('Cache-Control','private, no-store');
    response.headers.set('Referrer-Policy','no-referrer');
    return response;
  }finally{await ctx?.close();}
}
