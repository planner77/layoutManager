import {CadError,validateId} from '@/domain/cad';
import {boundedJson,failure} from '@/server/http';
import {RequestLogContext} from '@/server/logger';
import {sceneReadContext} from '@/server/scene/scene-context';
import {cadWriteContext} from '@/server/g7-operational/cad-preview-context';
import {requireBusinessWrite} from '@/server/cad-business/service';
import {recordG7WriteFailure} from '@/server/g7-operational/cad-guard';
import {resolveG7RuntimeGate} from '@/server/g7-operational/runtime-gate';
import {listZones,createZone,changeZone,listZoneCategories,createZoneCategory,changeZoneCategory} from './zone-service';
type Route='zones-list'|'zones-create'|'zones-change'|'zones-delete'|'categories-list'|'categories-create'|'categories-change'|'categories-delete';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
export async function zoneRequest(request:Request,route:Route,versionId:string,targetId?:string):Promise<Response>{
 const log=new RequestLogContext(request,'api','cad_'+route.replaceAll('-','_'));
 let ctx:ReturnType<typeof sceneReadContext>|ReturnType<typeof cadWriteContext>|undefined;
 try{
  validateId(versionId);
  if(targetId!==undefined)validateId(targetId);
  if(new URL(request.url).search)throw new CadError('ZONE_INPUT_INVALID','지원하지 않는 조회 조건입니다.',400);
  const gate=resolveG7RuntimeGate(process.env);
  if(gate.state!=='ACTIVE')throw new CadError('ZONE_SCHEMA_UNAVAILABLE','구역 기능을 사용할 수 없습니다.',503);
  const reading=route.endsWith('list');
  if(reading){
   ctx=sceneReadContext(request);
   if(ctx.gate.state!=='ACTIVE')throw new CadError('ZONE_AUTH_REQUIRED','로그인이 필요합니다.',401);
   const result=route==='zones-list'
    ?await listZones(ctx.repo.db,request,versionId,ctx.gate)
    :await listZoneCategories(ctx.repo.db,request,versionId,ctx.gate);
   log.completed(200);return Response.json(result,{headers:log.responseHeaders(headers)});
  }
  const proof=requireBusinessWrite(request,log.requestId);
  const body=await boundedJson(request,524288);
  ctx=cadWriteContext(proof);
  let result:unknown;
  if(route==='zones-create')result=await createZone(ctx.repo.db,versionId,body,proof,request.headers.get('idempotency-key'));
  else if(route==='zones-change'||route==='zones-delete')
   result=await changeZone(ctx.repo.db,versionId,targetId!,body,proof,route==='zones-delete');
  else if(route==='categories-create')result=await createZoneCategory(ctx.repo.db,versionId,body,proof);
  else result=await changeZoneCategory(ctx.repo.db,versionId,targetId!,body,proof,route==='categories-delete');
  const status=route==='zones-create'&&!(result as {replayed:boolean}).replayed||route==='categories-create'?201:200;
  log.completed(status);return Response.json(result,{status,headers:log.responseHeaders(headers)});
 }catch(error){
  let failed=error;
  try{await recordG7WriteFailure(request,log.requestId,'VERSION',versionId,error);}catch(auditError){failed=auditError;}
  const response=failure(failed,{request:log});
  response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Cookie');
  return response;
 }finally{await ctx?.close();}
}
