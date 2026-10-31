import { digestSessionToken } from '@/server/auth/session';
import { csrfProof } from '@/server/auth/login-service';
import { requireSessionCsrf } from '@/server/auth/guards';
import { G4Failure } from '@/server/auth/g4-service';
import { RequestLogContext } from '@/server/logger';
import { boundedJson } from '@/server/http';
import { resolveG7RuntimeGate } from '@/server/g7-operational/runtime-gate';
import { openG7RuntimeDb } from '@/server/g7-operational/runtime-db';
import { assertRuntimeApprovalCurrent, matchesRuntimeAuthority } from '@/server/g7-operational/runtime-handler';
import { createOutlineType, getOutlineTypeAccess, listOutlineTypes, normalizeTypeSearch,
  updateOutlineType, type TypeListQuery, type TypePatch } from './type-catalog-service';

type Route = 'access'|'list'|'create'|'update';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const messages:Readonly<Record<string,string>>={
  BAD_INPUT:'요청 내용을 확인해주세요.',INVALID_JSON:'JSON 요청 내용을 확인해주세요.',
  REQUEST_TOO_LARGE:'요청이 너무 큽니다.',UNAUTHENTICATED:'로그인이 필요합니다.',
  ACCESS_DENIED:'접근 권한이 없습니다.',CONFLICT:'변경 충돌입니다. 목록을 다시 조회해주세요.',
  NOT_FOUND:'업무 타입을 찾을 수 없습니다.',CATALOG_UNAVAILABLE:'업무 타입 기능을 사용할 수 없습니다.',
  WRITE_DISABLED:'업무 타입 변경이 활성화되지 않았습니다.',BOOTSTRAP_REQUIRED:'최초 관리자 설정이 필요합니다.',
  G7_RUNTIME_UNAVAILABLE:'업무 타입 기능을 사용할 수 없습니다.',G4_UNAVAILABLE:'요청을 처리하지 못했습니다.',
};
function reply(log:RequestLogContext,status:number,body:object):Response {
  log.completed(status,status>=400?'failure':'success');
  return Response.json(body,{status,headers:log.responseHeaders({
    'Cache-Control':'private, no-store',Vary:'Cookie',
  })});
}
function cookie(request:Request):string|null {
  const values=(request.headers.get('cookie')??'').split(';').map(x=>x.trim())
    .filter(x=>x.startsWith('cad_session='));
  if(values.length!==1)return null;
  const raw=values[0].slice('cad_session='.length);
  return /^[A-Za-z0-9_-]{43}$/.test(raw)&&Buffer.from(raw,'base64url').length===32&&
    Buffer.from(raw,'base64url').toString('base64url')===raw?raw:null;
}
function integer(raw:string|null,fallback:number,min:number,max:number):number {
  if(raw===null)return fallback;
  if(!/^(0|[1-9][0-9]{0,5})$/.test(raw))throw new G4Failure('BAD_INPUT',400);
  const number=Number(raw);
  if(number<min||number>max)throw new G4Failure('BAD_INPUT',400);
  return number;
}
function listQuery(url:string):TypeListQuery {
  const params=new URL(url).searchParams;
  for(const key of params.keys())if(!['includeInactive','q','offset','limit'].includes(key)||params.getAll(key).length!==1)
    throw new G4Failure('BAD_INPUT',400);
  const rawInactive=params.get('includeInactive');
  if(rawInactive!==null&&rawInactive!=='true'&&rawInactive!=='false')throw new G4Failure('BAD_INPUT',400);
  return {includeInactive:rawInactive==='true',q:normalizeTypeSearch(params.get('q')??''),
    offset:integer(params.get('offset'),0,0,100000),limit:integer(params.get('limit'),50,1,100)};
}
function exact(input:Record<string,unknown>,allowed:readonly string[],required:readonly string[]):void {
  if(Object.keys(input).some(key=>!allowed.includes(key))||required.some(key=>!Object.hasOwn(input,key)))
    throw new G4Failure('BAD_INPUT',400);
}
function patch(input:Record<string,unknown>):TypePatch {
  exact(input,['expectedRevision','name','description','sortOrder','active'],['expectedRevision']);
  if(Object.keys(input).length<2||!Number.isSafeInteger(input.expectedRevision)||
    (input.expectedRevision as number)<1||
    (input.active!==undefined&&typeof input.active!=='boolean'))throw new G4Failure('BAD_INPUT',400);
  return input as TypePatch;
}
function errorResponse(log:RequestLogContext,error:unknown):Response {
  const known=error&&typeof error==='object'&&'code' in error&&'status' in error?
    error as {code:unknown;status:unknown}:null;
  const code=known&&typeof known.code==='string'&&Object.hasOwn(messages,known.code)?known.code:'G4_UNAVAILABLE';
  const status=known&&typeof known.status==='number'&&[400,401,403,404,409,413,503].includes(known.status)?known.status:503;
  return reply(log,status,{error:{code,message:messages[code]},requestId:log.requestId});
}
/** All body parsing is bounded; the G4 transaction reloads session/role after awaits. */
export async function handleOutlineTypeRequest(request:Request,route:Route,typeId?:string):Promise<Response> {
  const log=new RequestLogContext(request,'api','outline_type_'+route);
  let db:ReturnType<typeof openG7RuntimeDb>|undefined;
  try {
    const gate=resolveG7RuntimeGate(process.env,Date.now());
    if(gate.state!=='ACTIVE')throw new G4Failure('G7_RUNTIME_UNAVAILABLE',503);
    if(!matchesRuntimeAuthority(request,gate.origin))throw new G4Failure('ACCESS_DENIED',403);
    if(typeId!==undefined&&!uuid.test(typeId))throw new G4Failure('BAD_INPUT',400);
    const query=route==='list'?listQuery(request.url):null;
    const body=route==='create'||route==='update'?await boundedJson(request,4096):null;
    if(route==='create'&&body)exact(body,['name','description','sortOrder'],['name','sortOrder']);
    const change=route==='update'&&body?patch(body):null;
    const raw=cookie(request),hash=raw?digestSessionToken(raw):null;
    const check=()=>assertRuntimeApprovalCurrent(gate);
    check();
    db=openG7RuntimeDb(gate);
    if(Number(db.prepare('SELECT COUNT(*) AS n FROM "User"').get()?.n)===0)
      throw new G4Failure('BOOTSTRAP_REQUIRED',503);
    const context={now:Date.now(),requestId:log.requestId};
    const proof=()=>{
      if(!raw)throw new G4Failure('UNAUTHENTICATED',401);
      try{requireSessionCsrf(request.headers.get('origin'),gate.origin,
        request.headers.get('x-csrf-token'),csrfProof(raw));}
      catch{throw new G4Failure('ACCESS_DENIED',403);}
    };
    if(route==='access')return reply(log,200,getOutlineTypeAccess(db,hash,gate,context,check));
    if(route==='list')return reply(log,200,listOutlineTypes(db,hash,gate,context,check,query!));
    if(route==='create')return reply(log,201,{item:createOutlineType(db,hash,gate,context,check,proof,
      body as {name:unknown;description?:unknown;sortOrder:unknown})});
    return reply(log,200,{item:updateOutlineType(db,hash,gate,context,check,proof,typeId!,change!)});
  }catch(error){return errorResponse(log,error);}
  finally{db?.close();}
}
