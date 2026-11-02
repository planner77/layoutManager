import { CadError, validateId } from '@/domain/cad';
import { failure } from '@/server/http';
import { RequestLogContext } from '@/server/logger';
import { prepareG7CadWrite, recordG7WriteFailure } from '@/server/g7-operational/cad-guard';
import { cadWriteContext } from '@/server/g7-operational/cad-preview-context';
import { sceneReadContext, requireSceneRead } from '@/server/scene/scene-context';
import { SceneRepository } from '@/server/scene/scene-repository';
import { SceneBlobStorage } from '@/server/storage/scene-storage';
import { parseScenePublicationInput } from '@/server/scene/scene-input';

export const runtime='nodejs';
type Params={params:Promise<{versionId:string}>};
export async function GET(request:Request,{params}:Params){
  const log=new RequestLogContext(request,'api','scene_status');
  let ctx:ReturnType<typeof sceneReadContext>|undefined;
  try{
    const versionId=validateId((await params).versionId);
    ctx=sceneReadContext(request);
    await requireSceneRead(request,ctx.repo.db,versionId,ctx.gate);
    const result=await ctx.repo.status(versionId);
    log.completed(200);
    return Response.json(result,{headers:log.responseHeaders({'Cache-Control':'private, no-store'})});
  }catch(error){return failure(error,{request:log});}
  finally{await ctx?.close();}
}
export async function POST(request:Request,{params}:Params){
  const log=new RequestLogContext(request,'api','scene_publish');
  let cad:ReturnType<typeof cadWriteContext>|undefined;
  let storage:SceneBlobStorage|undefined;
  const versionId=(await params).versionId;
  try{
    const proof=prepareG7CadWrite(request,log.requestId);
    if(!proof)throw new CadError('G7_AUTH_CONTEXT_REQUIRED','Scene 게시 승인이 필요합니다.',403);
    validateId(versionId);
    const {manifest,bytes,expectedRevision}=await parseScenePublicationInput(request);
    cad=cadWriteContext(proof);
    storage=new SceneBlobStorage(cad.storage.directory,process.env);
    const repo=new SceneRepository(cad.repo.db,storage);
    const result=await repo.publish(versionId,manifest,bytes,expectedRevision as number|null,proof);
    log.completed(200);
    return Response.json(result,{headers:log.responseHeaders({'Cache-Control':'private, no-store'})});
  }catch(error){
    try{await recordG7WriteFailure(request,log.requestId,'VERSION',versionId,error);}
    catch(auditError){return failure(auditError,{request:log});}
    return failure(error,{request:log});
  }finally{storage?.close();await cad?.close();}
}
