/** No credentials or CSRF proofs are persisted in browser storage. */
export type RuntimeSession = {
  actor: { id: string; status: 'ACTIVE'; mustChangePassword: boolean; roles: string[];
    siteGrants: string[]; specialGrants: string[] };
  csrfToken: string;
  runtime: { cadWriteEnabled: boolean; siteIds: string[] };
};
export class RuntimeClientError extends Error {
  constructor(readonly code: string, readonly status: number) {
    const messages: Record<string, string> = {
      UNAUTHENTICATED: '로그인이 필요하거나 세션이 만료되었습니다. 계정 / 로그인에서 다시 로그인하세요.',
      ACCESS_DENIED: '이 작업에 필요한 역할 또는 사업장 권한이 없습니다.',
      CSRF_DENIED: '요청을 확인하지 못했습니다. 세션을 새로 확인한 뒤 다시 시도하세요.',
      INITIAL_CHANGE_REQUIRED: '최초 비밀번호 변경이 필요합니다. 초기 비밀번호 변경을 선택하세요.',
      PASSWORD_CHANGE_REQUIRED: '최초 비밀번호 변경이 필요합니다. 초기 비밀번호 변경을 선택하세요.',
      INVALID_CREDENTIALS: '계정 또는 비밀번호를 확인하세요.',
      LOGIN_RATE_LIMITED: '로그인 시도가 많습니다. 잠시 후 다시 시도하세요.',
      RUNTIME_STATUS_UNAVAILABLE: '운영 인증 상태를 확인하지 못했습니다. 다시 시도하세요.',
      RUNTIME_UNAVAILABLE: '운영 인증을 사용할 수 없습니다. 관리자에게 문의하세요.',
      G7_RUNTIME_WRITE_DISABLED: '현재 도면 변경 기능이 비활성화되어 있습니다.',
      INVALID_SESSION_RESPONSE: '세션을 확인하지 못했습니다.',
      BAD_INPUT: '입력값을 확인하세요.', CONFLICT: '이미 존재하거나 현재 상태와 충돌합니다.',
    };
    super(messages[code] ?? '요청을 처리하지 못했습니다. 입력값과 운영 상태를 확인하세요.');
    this.name = 'RuntimeClientError';
  }
}
export async function runtimeJson<T>(action: string, input?: object, csrfToken?: string): Promise<T> {
  const headers = new Headers();
  if (input !== undefined) headers.set('Content-Type', 'application/json');
  if (csrfToken) headers.set('x-csrf-token', csrfToken);
  const response = await fetch('/api/g7-runtime/' + action, {
    method: input === undefined ? 'GET' : 'POST', headers,
    credentials: 'same-origin', cache: 'no-store',
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  const body = await response.json();
  if (!response.ok) throw new RuntimeClientError(String(body?.error?.code ?? 'UNAVAILABLE'), response.status);
  return body as T;
}

/** Refresh against the server on EVERY mutation, so logout/revocation in another
 * tab is respected. OFF alone retains the existing anonymous CAD contract. */
export async function runtimeCadHeaders(initial?: HeadersInit): Promise<Headers> {
  const headers = new Headers(initial);
  headers.delete('x-csrf-token');
  let response: Response;
  try {
    // The public status endpoint returns 200 for OFF. Avoid probing an absent
    // Auth endpoint (404 console errors) in the existing anonymous deployment.
    const status = await fetch('/api/g7-runtime/status', {
      credentials: 'same-origin', cache: 'no-store',
    });
    if (!status.ok) throw new Error('STATUS_UNAVAILABLE');
    const current = await status.json();
    if (current.state === 'OFF' && current.authEnabled === false && current.cadWriteEnabled === false) return headers;
    if (current.state !== 'ACTIVE' || current.authEnabled !== true) throw new RuntimeClientError('RUNTIME_UNAVAILABLE', 503);
    if (current.cadWriteEnabled !== true) throw new RuntimeClientError('G7_RUNTIME_WRITE_DISABLED', 503);
    response = await fetch('/api/g7-runtime/auth/session', {
      credentials: 'same-origin', cache: 'no-store',
    });
  } catch (failure) {
    if (failure instanceof RuntimeClientError) throw failure;
    throw new RuntimeClientError('RUNTIME_STATUS_UNAVAILABLE', 503);
  }
  if (response.status === 401) throw new RuntimeClientError('UNAUTHENTICATED', 401);
  if (!response.ok) throw new RuntimeClientError('RUNTIME_UNAVAILABLE', 503);
  const session = await response.json() as RuntimeSession;
  if (!session.runtime?.cadWriteEnabled) throw new RuntimeClientError('G7_RUNTIME_WRITE_DISABLED', 503);
  if (typeof session.csrfToken !== 'string' || !session.csrfToken) throw new RuntimeClientError('INVALID_SESSION_RESPONSE', 503);
  headers.set('x-csrf-token', session.csrfToken);
  return headers;
}
