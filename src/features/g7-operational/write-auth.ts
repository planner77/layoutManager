'use client';

/** Browser-side CSRF handshake for the real CAD Multipart/Current/Delete APIs.
 * DOM gate is a UX hint only; every server write independently checks GO
 * and the current DB session/roles/Site inside the business transaction.
 */
export async function g7CadWriteHeaders(): Promise<Record<string, string>> {
  if (typeof document === 'undefined' ||
      document.documentElement.dataset.g7Operational !== 'true') return {};
  let response: Response;
  try {
    response = await fetch('/api/g7-operation/auth/session', {
      method: 'GET', credentials: 'same-origin', cache: 'no-store',
    });
  } catch {
    throw new Error('인증 서버 연결을 확인해주세요. 도면 변경을 중단했습니다.');
  }
  if (!response.ok) throw new Error('로그인 또는 세션 확인이 필요합니다. 도면 변경을 중단했습니다.');
  let body: { csrfToken?: unknown };
  try { body = await response.json(); }
  catch { throw new Error('세션 응답이 올바르지 않습니다. 도면 변경을 중단했습니다.'); }
  if (typeof body.csrfToken !== 'string' ||
      !/^[a-zA-Z0-9_-]{32,128}$/.test(body.csrfToken)) {
    throw new Error('CSRF 인증이 확인되지 않았습니다. 도면 변경을 중단했습니다.');
  }
  return { 'x-csrf-token': body.csrfToken };
}
