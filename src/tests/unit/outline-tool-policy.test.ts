import { describe, expect, it } from 'vitest';
import { isLiveOutlineRequest, outlineToolUnavailableReason } from '../../features/cad-viewer/outline-tool-policy';

const supported = {
  renderer: 'three-dxf-viewer' as const,
  format: 'DXF' as const,
  loading: false,
  ready: true,
  entityCount: 1,
  sourceSha256: 'a'.repeat(64),
};

describe('TC-U3-UNIT-002: outline tool availability is fail-closed', () => {
  it('only enables mapped DXF three-dxf-viewer with verified SHA', () => {
    expect(outlineToolUnavailableReason(supported)).toBeNull();
    expect(outlineToolUnavailableReason({ ...supported, renderer: 'dxf-viewer' })).toMatch(/three-dxf-viewer/);
    expect(outlineToolUnavailableReason({ ...supported, format: 'DWG', renderer: 'libredwg-web' })).toMatch(/DXF/);
    expect(outlineToolUnavailableReason({ ...supported, loading: true })).toMatch(/로딩/);
    expect(outlineToolUnavailableReason({ ...supported, ready: false })).toMatch(/완료/);
    expect(outlineToolUnavailableReason({ ...supported, sourceSha256: '' })).toMatch(/SHA-256/);
    expect(outlineToolUnavailableReason({ ...supported, sourceSha256: 'g'.repeat(64) })).toMatch(/SHA-256/);
    expect(outlineToolUnavailableReason({ ...supported, entityCount: 0 })).toMatch(/검증된 선택 가능 객체/);
    expect(outlineToolUnavailableReason({ ...supported, entityCount: undefined })).toMatch(/검증된 선택 가능 객체/);
  });
});

describe('TC-U3-UNIT-003: ignore late Worker failures after OFF or replacement', () => {
  it('accepts only current enabled computations and discards aborts', () => {
    expect(isLiveOutlineRequest(1, 1, true)).toBe(true);
    expect(isLiveOutlineRequest(1, 2, true)).toBe(false);
    expect(isLiveOutlineRequest(1, 1, false)).toBe(false);
    expect(isLiveOutlineRequest(3, 3, true, new DOMException('cancel', 'AbortError'))).toBe(false);
    expect(isLiveOutlineRequest(3, 3, true, new Error('worker failed'))).toBe(true);
    // OFF invalidates epoch 4; a new ON cannot accept its prior completion.
    expect(isLiveOutlineRequest(4, 6, true)).toBe(false);
  });
});
