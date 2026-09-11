import packageInfo from '../../package.json';
import type { PublicUploadDiagnostic } from './diagnostics';

export const MIB_BYTES = 1024 * 1024;

export function exceedsUploadLimit(file: Pick<File, 'size'> | null | undefined, maxMb: number) {
  return Boolean(file && file.size > maxMb * MIB_BYTES);
}

export function uploadLimitDiagnostic(maxMb: number): PublicUploadDiagnostic {
  return {
    occurredAt: new Date().toISOString(),
    appVersion: packageInfo.version,
    outcome: 'failed',
    code: 'FILE_TOO_LARGE',
    httpStatus: null,
    requestId: null,
    summary: `파일 크기가 최대 ${maxMb} MiB를 초과했습니다.`,
    guidance: `최대 ${maxMb} MiB 이하의 DXF 또는 DWG 파일을 선택하세요.`,
  };
}
