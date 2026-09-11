import packageInfo from '../../package.json';

export type UploadResult = { id: string; locationId: string; requestId: string; version: number; displayName: string; originalFilename: string; duplicateCount: number; description?: string };
export type PublicUploadDiagnostic = {
  occurredAt: string;
  appVersion: string;
  outcome: 'failed' | 'uncertain';
  code: string;
  httpStatus: number | null;
  requestId: string | null;
  summary: string;
  guidance: string;
};

const knownErrors: Record<string, string> = {
  INVALID_ORIGIN: '허용되지 않은 업로드 요청입니다.', MISSING_FILE: '업로드할 파일을 선택해주세요.',
  INVALID_UPLOAD: '파일 또는 입력 항목을 확인해주세요.', FILE_TOO_LARGE: '업로드 제한 크기를 초과했습니다.',
  EMPTY_FILE: '내용이 있는 파일을 선택해주세요.', UNSUPPORTED_FILE: 'DXF 또는 DWG 파일만 등록할 수 있습니다.',
  INVALID_METADATA: '도면 위치, 등록일, 이름 또는 설명을 확인해주세요.', STORAGE_UNAVAILABLE: '도면 저장소를 사용할 수 없습니다.',
  SERVER_ERROR: '서버가 업로드 요청을 처리하지 못했습니다.',
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeCode = /^[A-Z][A-Z0-9_]{1,63}$/;
function requestId(value: unknown) { return typeof value === 'string' && uuid.test(value) ? value : null; }
function diagnostic(code: string, status: number | null, id: string | null, summary: string, outcome: PublicUploadDiagnostic['outcome'] = 'failed'): PublicUploadDiagnostic {
  return { occurredAt: new Date().toISOString(), appVersion: packageInfo.version, outcome, code, httpStatus: status, requestId: id, summary,
    guidance: outcome === 'uncertain' ? '등록 결과를 확인할 수 없습니다. 도면 목록에서 등록 여부를 먼저 확인한 뒤 다시 시도하세요.' : '입력 내용을 확인한 뒤 다시 시도하세요. 문제가 계속되면 이 진단 정보를 운영 담당자에게 전달하세요.' };
}
function isUploadResult(value: unknown): value is UploadResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return requestId(result.id) !== null && requestId(result.locationId) !== null && requestId(result.requestId) !== null && Number.isInteger(result.version) && Number(result.version) > 0 && typeof result.displayName === 'string' && result.displayName.length > 0 && typeof result.originalFilename === 'string' && result.originalFilename.length > 0 && Number.isInteger(result.duplicateCount) && Number(result.duplicateCount) >= 0 && (result.description === undefined || typeof result.description === 'string');
}
export async function interpretUploadResponse(response: Response): Promise<{ result: UploadResult } | { diagnostic: PublicUploadDiagnostic }> {
  const headerId = requestId(response.headers.get('x-request-id'));
  let body: unknown;
  let bodyState: 'empty' | 'json' | 'invalid' = 'empty';
  try {
    const text = await response.text();
    if (text) { try { body = JSON.parse(text); bodyState = 'json'; } catch { bodyState = 'invalid'; } }
  } catch { return { diagnostic: diagnostic('RESPONSE_READ_FAILED', response.status || null, headerId, '서버 응답을 읽지 못했습니다.', 'uncertain') }; }
  if (response.ok) {
    if (bodyState === 'json' && isUploadResult(body) && (!headerId || headerId === body.requestId)) return { result: body };
    return { diagnostic: diagnostic('UPLOAD_RESULT_UNCERTAIN', response.status, headerId, '서버의 등록 성공 응답을 확인할 수 없습니다.', 'uncertain') };
  }
  const envelope = bodyState === 'json' && body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined;
  const error = envelope && typeof envelope === 'object' ? envelope as Record<string, unknown> : undefined;
  const bodyCode = typeof error?.code === 'string' && safeCode.test(error.code) ? error.code : undefined;
  const id = headerId ?? requestId(error?.requestId);
  if (bodyCode && knownErrors[bodyCode]) return { diagnostic: diagnostic(bodyCode, response.status, id, knownErrors[bodyCode]) };
  if (response.status === 413) return { diagnostic: diagnostic('HTTP_PAYLOAD_TOO_LARGE', 413, id, '서버 또는 중간 프록시가 업로드 크기를 거부했습니다.') };
  if (response.status === 502 || response.status === 504) return { diagnostic: diagnostic(`HTTP_${response.status}`, response.status, id, '서버 또는 중간 프록시에서 응답하지 못했습니다.', 'uncertain') };
  if (bodyState === 'empty') return { diagnostic: diagnostic('EMPTY_ERROR_RESPONSE', response.status, id, '서버가 내용 없는 오류 응답을 반환했습니다.') };
  if (bodyState === 'invalid') return { diagnostic: diagnostic('NON_JSON_ERROR_RESPONSE', response.status, id, '서버 또는 중간 프록시가 해석할 수 없는 오류 응답을 반환했습니다.') };
  return { diagnostic: diagnostic('UNKNOWN_ERROR_RESPONSE', response.status, id, '서버가 알 수 없는 형식의 오류 응답을 반환했습니다.') };
}
export function connectionDiagnostic(): PublicUploadDiagnostic { return diagnostic('CONNECTION_FAILED', null, null, '서버와 통신하지 못했습니다.', 'uncertain'); }
export function diagnosticText(value: PublicUploadDiagnostic) { return [`발생 시각: ${value.occurredAt}`, `앱 버전: ${value.appVersion}`, `결과: ${value.outcome === 'uncertain' ? '확인 필요' : '실패'}`, `오류 코드: ${value.code}`, `HTTP 상태: ${value.httpStatus ?? '응답 없음'}`, `서버 요청 ID: ${value.requestId ?? '없음 (서버에 도달하지 않았거나 응답에서 제공되지 않음)'}`, `요약: ${value.summary}`, `조치 안내: ${value.guidance}`].join('\n'); }
export function diagnosticJson(value: PublicUploadDiagnostic) { return JSON.stringify(value, null, 2); }
