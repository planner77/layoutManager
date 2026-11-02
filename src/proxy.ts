import { NextResponse, type NextRequest } from 'next/server';
import { authorizeOperationLogs, OperationLogsAccessError } from '@/server/logging/access';

const denialHtml = '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>서버 로그 접근 제한</title><body><main><h1>서버 로그 접근 제한</h1><p>운영 인증과 서버 로그 조회 권한이 필요합니다. 관리자에게 계정과 logs:read 권한을 확인하세요.</p><p><a href="/g7-runtime">계정 / 로그인</a></p><a href="/">도면 목록</a></main></body></html>';

/** Next 16 Proxy runs in Node. Only this protected operations page is matched. */
export async function proxy(request: NextRequest) {
  try {
    await authorizeOperationLogs(request);
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.append('Vary', 'Cookie');
    return response;
  } catch (error) {
    const status = error instanceof OperationLogsAccessError && [401, 403, 429, 503].includes(error.status)
      ? error.status : 503;
    return new NextResponse(denialHtml, { status, headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', Vary: 'Cookie',
      'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      ...(status === 429 ? { 'Retry-After': '60' } : {}),
    } });
  }
}
export const config = { matcher: '/operations/logs' };
