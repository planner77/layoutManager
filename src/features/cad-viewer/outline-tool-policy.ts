import type { ViewerFormat, ViewerRenderer } from '@/viewers/core/selection';

/**
 * S5: supported render geometry and exact DXF source have separate gates.
 * An absent render count preserves the legacy exact-source caller contract.
 */
export function outlineToolUnavailableReason({
  renderer, format, loading, ready, entityCount, renderEntityCount, sourceSha256,
}: {
  renderer: ViewerRenderer;
  format: ViewerFormat;
  loading: boolean;
  ready: boolean;
  entityCount: number | undefined;
  renderEntityCount?: number;
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
  const count=renderEntityCount===undefined?entityCount:Math.max(renderEntityCount,entityCount??0);
  if (!Number.isInteger(count) || (count ?? 0) <= 0) {
    return renderEntityCount===undefined
      ? '원본과 렌더러의 대응이 검증된 선택 가능 객체가 없습니다.'
      : '지원 가능한 WCS 2D 렌더 객체가 없습니다. 외곽선 목록과 독립 메모는 별도로 사용할 수 있습니다.';
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

/** A saved exact-source choice is only reusable while the LIVE adapter still
 * provides verified source entities. Render edits invalidate exact coordinates
 * without disabling supported render outlines. */
export function effectiveOutlineBasis(
  saved:'render'|'source',
  live:{entityCount:number;sourceUnavailableReason?:string}|null,
):'render'|'source'{
  if(saved==='source'&&(!live||live.entityCount<=0||!!live.sourceUnavailableReason))return 'render';
  return saved;
}
