import { validateId } from '@/domain/cad';
import { failure } from '@/server/http';
import { RequestLogContext } from '@/server/logger';
import { sceneReadContext, requireSceneRead } from '@/server/scene/scene-context';

export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{versionId:string}>}){
  const log=new RequestLogContext(request,'api','scene_content');
  let ctx:ReturnType<typeof sceneReadContext>|undefined;
  try{
    const versionId=validateId((await params).versionId);
    const assetId=validateId(new URL(request.url).searchParams.get('assetId')??'');
    ctx=sceneReadContext(request);
    await requireSceneRead(request,ctx.repo.db,versionId,ctx.gate);
    const bytes=await ctx.repo.content(versionId,assetId);
    log.completed(200);
    return new Response(bytes as BodyInit,{headers:log.responseHeaders({
      'Content-Type':'application/json','Content-Length':String(bytes.length),
      'Content-Disposition':'attachment; filename="scene.json"',
      'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'})});
  }catch(error){return failure(error,{request:log});}
  finally{await ctx?.close();}
}
