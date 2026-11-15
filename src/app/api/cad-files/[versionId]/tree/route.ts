import {CadError,validateId} from '@/domain/cad';
import {boundedJson,failure} from '@/server/http';
import {RequestLogContext} from '@/server/logger';
import {sceneReadContext} from '@/server/scene/scene-context';
import {cadWriteContext} from '@/server/g7-operational/cad-preview-context';
import {requireBusinessWrite} from '@/server/cad-business/service';
import {recordG7WriteFailure} from '@/server/g7-operational/cad-guard';
import {resolveG7RuntimeGate} from '@/server/g7-operational/runtime-gate';
import {readTree,createTreeFolder,changeTreeFolder,changeTreeMembership} from '@/server/cad-business/tree-service';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
async function handle(request:Request,versionId:string,method:'GET'|'POST'|'PATCH'|'DELETE'):Promise<Response>{
 const log=new RequestLogContext(request,'api','cad_tree_'+method.toLowerCase());
 let ctx:ReturnType<typeof sceneReadContext>|ReturnType<typeof cadWriteContext>|undefined;
 try{
  validateId(versionId);
  if(new URL(request.url).search)throw new CadError('TREE_INPUT_INVALID','지원하지 않는 조회 조건입니다.',400);
  const gate=resolveG7RuntimeGate(process.env);
  if(gate.state!=='ACTIVE')throw new CadError('TREE_SCHEMA_UNAVAILABLE','트리 기능을 사용할 수 없습니다.',503);
  if(method==='GET'){
   ctx=sceneReadContext(request);
   if(ctx.gate.state!=='ACTIVE')throw new CadError('TREE_AUTH_REQUIRED','로그인이 필요합니다.',401);
   const data=await readTree(ctx.repo.db,request,versionId,ctx.gate);
   log.completed(200);return Response.json(data,{headers:log.responseHeaders(headers)});
  }
  const proof=requireBusinessWrite(request,log.requestId);
  const body=await boundedJson(request,65536) as Record<string,unknown>;
  ctx=cadWriteContext(proof);
  let result:unknown;
  if(method==='POST')result=await createTreeFolder(ctx.repo.db,versionId,body,proof);
  else if(method==='PATCH'){
   if(body?.target==='membership')result=await changeTreeMembership(ctx.repo.db,versionId,
    Object.fromEntries(Object.entries(body).filter(([k])=>k!=='target')),proof);
   else if(body?.target==='folder')result=await changeTreeFolder(ctx.repo.db,versionId,String(body.folderId),
    Object.fromEntries(Object.entries(body).filter(([k])=>k!=='target'&&k!=='folderId')),proof,false);
   else throw new CadError('TREE_INPUT_INVALID','트리 대상을 확인하세요.',400);
  }else{
   if(body?.target!=='folder')throw new CadError('TREE_INPUT_INVALID','트리 대상을 확인하세요.',400);
   result=await changeTreeFolder(ctx.repo.db,versionId,String(body.folderId),
    Object.fromEntries(Object.entries(body).filter(([k])=>k!=='target'&&k!=='folderId')),proof,true);
  }
  const status=method==='POST'?201:200;log.completed(status);
  return Response.json(result,{status,headers:log.responseHeaders(headers)});
 }catch(error){
  let failed=error;
  if(method!=='GET')try{await recordG7WriteFailure(request,log.requestId,'VERSION',versionId,error);}catch(audit){failed=audit;}
  const response=failure(failed,{request:log});response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Cookie');return response;
 }finally{await ctx?.close();}
}
type Context={params:Promise<{versionId:string}>};
export async function GET(request:Request,{params}:Context){return handle(request,(await params).versionId,'GET');}
export async function POST(request:Request,{params}:Context){return handle(request,(await params).versionId,'POST');}
export async function PATCH(request:Request,{params}:Context){return handle(request,(await params).versionId,'PATCH');}
export async function DELETE(request:Request,{params}:Context){return handle(request,(await params).versionId,'DELETE');}
