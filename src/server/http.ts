import { CadError } from '@/domain/cad';
import type { UploadDiagnostics, UploadStage } from './upload-observability';
import { RequestLogContext } from './logger';

type FailureOptions = {
  request?: RequestLogContext;
  diagnostics?: UploadDiagnostics;
  stage?: UploadStage;
};

export function failure(error: unknown, options: FailureOptions = {}) {
  const request = options.request;
  const diagnostics = options.diagnostics;
  const stage = options.stage ?? request?.currentStage ?? 'response';
  const requestId = diagnostics?.requestId ?? request?.requestId;
  const status = error instanceof CadError ? error.status : 500;
  const code = error instanceof CadError ? error.code : 'SERVER_ERROR';
  const message = error instanceof CadError ? error.message : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.';

  // UploadDiagnostics accepts only UploadStage, while L2 request phases include
  // database_read/database_write/authorization. Keep these two contracts separate.
  diagnostics?.finishFailure(error, options.stage ?? 'response', status);
  if (request) {
    const internalCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    const safeInternalCode = typeof internalCode === 'string' &&
      /^(?:P[0-9]{4}|SQLITE_[A-Z0-9_]+)$/.test(internalCode) ? internalCode : code;
    request.error('http_request_failed', error, { outcome: 'failure', httpStatus: status, errorCode: safeInternalCode, stage });
    request.completed(status, 'failure');
  }

  const headers = request?.responseHeaders() ?? new Headers();
  if (!request && requestId) headers.set('X-Request-Id', requestId);
  if (status === 429) headers.set('Retry-After', String(error instanceof CadError ? error.retryAfterSeconds ?? 60 : 60));
  return Response.json({ error: { code, message, requestId } }, { status, headers });
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin) {
    const source = new URL(origin);
    const target = new URL(request.url);
    // Next may reconstruct request.url with its bind hostname; Host is the browser's authority.
    if (source.host !== (request.headers.get('host') ?? target.host) || source.protocol !== target.protocol) throw new CadError('INVALID_ORIGIN', '허용되지 않은 요청입니다.', 403);
  }
}
export async function boundedJson(request:Request,maximum=4096):Promise<Record<string,unknown>>{
  if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw new CadError('INVALID_JSON','JSON 요청 내용을 확인해주세요.');
  if(Number(request.headers.get('content-length')??0)>maximum)throw new CadError('REQUEST_TOO_LARGE','요청이 너무 큽니다.',413);
  try{
    if(!request.body)throw new Error();
    const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
    for(;;){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>maximum){await reader.cancel();throw new CadError('REQUEST_TOO_LARGE','요청이 너무 큽니다.',413)}chunks.push(part.value)}
    const value:unknown=JSON.parse(new TextDecoder().decode(Buffer.concat(chunks.map(c=>Buffer.from(c)))));
    if(!value||Array.isArray(value)||typeof value!=='object')throw new Error();
    return value as Record<string,unknown>;
  }catch(error){if(error instanceof CadError)throw error;throw new CadError('INVALID_JSON','JSON 요청 내용을 확인해주세요.')}
}
