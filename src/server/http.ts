import { randomUUID } from 'node:crypto';
import { CadError } from '@/domain/cad';
import type { UploadDiagnostics, UploadStage } from './upload-observability';
export function failure(error: unknown, diagnostics?: UploadDiagnostics, stage: UploadStage = 'response') {
  const requestId = diagnostics?.requestId ?? randomUUID();
  const status = error instanceof CadError ? error.status : 500;
  const code = error instanceof CadError ? error.code : 'SERVER_ERROR';
  const message = error instanceof CadError ? error.message : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.';
  diagnostics?.finishFailure(error, stage, status);
  if (!diagnostics && !(error instanceof CadError)) console.error('CAD_REQUEST_FAILED', { requestId, category: error instanceof Error ? error.name : 'Unknown' });
  return Response.json({ error: { code, message, requestId } }, { status, headers: { 'X-Request-Id': requestId } });
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
