import type { ViewerFormat, ViewerRenderer } from '@/viewers/core/selection';

/**
 * U3 fail-closed preconditions. Source/renderer identity is checked by #31's
 * mapping audit; this UI only enables the tool when mapped entities exist.
 */
export function outlineToolUnavailableReason({
  renderer, format, loading, ready, entityCount, sourceSha256,
}: {
  renderer: ViewerRenderer;
  format: ViewerFormat;
  loading: boolean;
  ready: boolean;
  entityCount: number | undefined;
  sourceSha256: string;
}): string | null {
  if (format !== 'DXF' || renderer !== 'three-dxf-viewer') {
    return '외곽선 생성은 DXF의 three-dxf-viewer에서만 지원합니다.';
  }
  if (loading) return '도면과 외곽선 객체 인덱스가 로딩 중입니다.';
  if (!ready) return '도면 표시가 완료된 뒤 외곽선을 생성할 수 있습니다.';
  if (!/^[a-f0-9]{64}$/i.test(sourceSha256)) {
    return '원본 도면의 SHA-256을 검증할 수 없어 외곽선 생성을 차단했습니다.';
  }
  if (!Number.isInteger(entityCount) || (entityCount ?? 0) <= 0) {
    return '원본과 렌더러의 대응이 검증된 선택 가능 객체가 없습니다.';
  }
  return null;
}

/** Ignore completed/cancelled Worker promises from an earlier tool session. */
export function isLiveOutlineRequest(
  requestRevision: number, currentRevision: number, toolEnabled: boolean, error?: unknown,
): boolean {
  return toolEnabled && requestRevision === currentRevision &&
    !(error instanceof Error && error.name === 'AbortError');
}
