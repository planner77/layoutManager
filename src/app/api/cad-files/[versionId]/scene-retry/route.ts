/** #225/B3: actor/session/CSRF/site checked inside final retry + Audit TX. */
import {CadError,validateId} from '@/domain/cad';
import {boundedJson,failure} from '@/server/http';
import {RequestLogContext} from '@/server/logger';
import {prepareG7CadWrite,recordG7WriteFailure} from '@/server/g7-operational/cad-guard';
import {cadWriteContext} from '@/server/g7-operational/cad-preview-context';
import {manualRetryCpuSceneJob} from '@/server/scene/scene-build-retry-service';

export const runtime='nodejs';
type Params={params:Promise<{versionId:string}>};
export async function POST(request:Request,{params}:Params){
  const log=new RequestLogContext(request,'api','scene_build_retry');
  const versionId=(await params).versionId;
  let cad:ReturnType<typeof cadWriteContext>|undefined;
  try{
    const proof=prepareG7CadWrite(request,log.requestId);
    if(!proof?.runtime)throw new CadError('G7_AUTH_CONTEXT_REQUIRED',
      'Scene 재시도는 승인된 G7 로그인에서만 가능합니다.',403);
    const id=validateId(versionId);
    const body=await boundedJson(request,256);
    if(Object.keys(body).length!==0)throw new CadError('INVALID_JSON',
      '재시도 요청 내용이 올바르지 않습니다.',400);
    cad=cadWriteContext(proof);
    const result=await manualRetryCpuSceneJob(cad.repo.db,id,proof);
    log.completed(202);
    return Response.json(result,{status:202,headers:log.responseHeaders({
      'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer',
    })});
  }catch(error){
    try{await recordG7WriteFailure(request,log.requestId,'VERSION',versionId,error);}
    catch(auditError){return failure(auditError,{request:log});}
    const response=failure(error,{request:log});
    response.headers.set('Cache-Control','private, no-store');
    return response;
  }finally{await cad?.close();}
}
