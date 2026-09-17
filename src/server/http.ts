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
  const stage = options.stage ?? 'response';
  const requestId = diagnostics?.requestId ?? request?.requestId;
  const status = error instanceof CadError ? error.status : 500;
  const code = error instanceof CadError ? error.code : 'SERVER_ERROR';
  const message = error instanceof CadError ? error.message : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.';

  diagnostics?.finishFailure(error, stage, status);
  if (request) {
    request.error('http_request_failed', error, { outcome: 'failure', httpStatus: status, errorCode: code, stage });
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
