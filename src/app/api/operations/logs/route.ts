import { randomUUID } from 'node:crypto';
import { authorizeOperationLogsActor } from '@/server/logging/access';
import { parseLogQuery, queryOperationLogs } from '@/server/logging/query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers=(requestId:string)=>({ 'X-Request-Id':requestId, 'Cache-Control':'private, no-store', Vary:'Cookie' });
export async function GET(request:Request):Promise<Response>{
  const requestId=randomUUID();
  try{
    const actor=await authorizeOperationLogsActor(request,requestId);
    const query=parseLogQuery(request.url);
    const result=await queryOperationLogs(query,actor,{enabled:process.env.LOG_STORE_ENABLED==='true'});
    // Approval/session/grant may have changed during asynchronous file reads.
    await authorizeOperationLogsActor(request,requestId);
    return Response.json(result,{headers:headers(requestId)});
  }catch(error){
    const safe=error&&typeof error==='object'&&'status' in error&&'code' in error?
      error as {status:number;code:string}:null;
    const status=safe&&[400,401,403,410,429,503].includes(safe.status)?safe.status:503;
    const code=safe&&/^[A-Z][A-Z0-9_]{0,63}$/.test(safe.code)?safe.code:'LOG_QUERY_UNAVAILABLE';
    return Response.json({error:{code},requestId},{status,headers:{...headers(requestId),
      ...(status===429?{'Retry-After':'60'}:{})}});
  }
}
