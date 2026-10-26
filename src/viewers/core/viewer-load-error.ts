export type ViewerLoadStage = 'source' | 'adapter-init' | 'adapter-load';
export const DWG_ADAPTER_LOAD_MESSAGES = {
  DWG_SIZE: 'DWG Viewer는 현재 0보다 크고 20 MiB 이하인 파일만 처리합니다.',
  DWG_HEADER: '지원하지 않거나 손상된 DWG 헤더입니다.',
  DWG_WASM_INIT: 'WASM 초기화 실패: 지원 가능한 정상 DWG인지 확인해주세요.',
  DWG_PARSE: 'DWG 파싱 실패: 지원 가능한 정상 DWG인지 확인해주세요.',
  DWG_EXTRACT: 'DWG 객체 추출 실패: 지원 가능한 정상 DWG인지 확인해주세요.',
  DWG_WORKER_INIT: 'DWG Worker 초기화 실패',
  DWG_TIMEOUT: 'DWG 처리 시간 초과',
} as const;
export type DwgAdapterLoadReason = keyof typeof DWG_ADAPTER_LOAD_MESSAGES;
export class ViewerLoadError extends Error {
  constructor(public readonly stage: ViewerLoadStage, public readonly reasonCode: string, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ViewerLoadError';
  }
}
export function dwgAdapterLoadError(reasonCode: DwgAdapterLoadReason, cause?: unknown): ViewerLoadError {
  return new ViewerLoadError('adapter-load',reasonCode,DWG_ADAPTER_LOAD_MESSAGES[reasonCode],cause);
}
export function isKnownSafeDwgAdapterLoadError(error: unknown): error is ViewerLoadError {
  return error instanceof ViewerLoadError && error.stage==='adapter-load' &&
    Object.prototype.hasOwnProperty.call(DWG_ADAPTER_LOAD_MESSAGES,error.reasonCode) &&
    error.message===DWG_ADAPTER_LOAD_MESSAGES[error.reasonCode as DwgAdapterLoadReason];
}
export function isViewerCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
