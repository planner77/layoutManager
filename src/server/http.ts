import { randomUUID } from 'node:crypto';
import { CadError } from '@/domain/cad';
export function failure(error: unknown) {
  const requestId = randomUUID();
  if (error instanceof CadError) return Response.json({ error: { code: error.code, message: error.message, requestId } }, { status: error.status });
  console.error('CAD_REQUEST_FAILED', { requestId, category: error instanceof Error ? error.name : 'Unknown' });
  return Response.json({ error: { code: 'SERVER_ERROR', message: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.', requestId } }, { status: 500 });
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
