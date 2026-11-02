import { failure } from '@/server/http';
import { RequestLogContext } from '@/server/logger';
import { recordG7WriteFailure } from '@/server/g7-operational/cad-guard';

/** Shared fixed-target denial ledger for R3 reads; no query, name or geometry. */
export async function typedOutlineFailure(request:Request,log:RequestLogContext,
  versionId:string,error:unknown):Promise<Response>{
  let failed=error;
  try{await recordG7WriteFailure(request,log.requestId,'VERSION',versionId,error);}
  catch(auditError){failed=auditError;}
  const response=failure(failed,{request:log});
  response.headers.set('Cache-Control','private, no-store');
  response.headers.set('Vary','Cookie');
  return response;
}
