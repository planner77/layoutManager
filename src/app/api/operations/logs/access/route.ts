import { randomUUID } from 'node:crypto';
import { authorizeOperationLogsActor } from '@/server/logging/access';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request):Promise<Response>{
  const requestId=randomUUID();
  const headers={'X-Request-Id':requestId,'Cache-Control':'private, no-store',Vary:'Cookie'};
  try{await authorizeOperationLogsActor(request,requestId);
    return Response.json({allowed:true},{headers});
  }catch(error){const safe=error&&typeof error==='object'&&'status' in error&&'code' in error?
      error as {status:number;code:string}:null;
    const status=safe&&[401,403,429,503].includes(safe.status)?safe.status:503;
    const code=safe&&/^[A-Z][A-Z0-9_]{0,63}$/.test(safe.code)?safe.code:'G7_RUNTIME_UNAVAILABLE';
    return Response.json({error:{code},requestId},{status,headers:{...headers,
      ...(status===429?{'Retry-After':'60'}:{})}});}
}
