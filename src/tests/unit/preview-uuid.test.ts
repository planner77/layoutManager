import { describe, expect, it } from 'vitest';
import { createPreviewUuid } from '../../features/cad-viewer/preview-uuid';

describe('Issue #41 disposable preview IDs', () => {
  it('TC-U4-UNIT-005: prefers randomUUID when available', () => {
    const source = {
      randomUUID: () => '11111111-1111-4111-8111-111111111111' as const,
      getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
        void array;
        throw new Error('getRandomValues must not run when randomUUID exists');
      },
    };
    expect(createPreviewUuid(source)).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('TC-U4-UNIT-006: insecure HTTP falls back to getRandomValues and emits RFC UUIDv4', () => {
    let calls = 0;
    const insecureSource = {
      getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
        calls++;
        if (array instanceof Uint8Array) array.fill(0xab);
        return array;
      },
    };
    expect(createPreviewUuid(insecureSource)).toBe('abababab-abab-4bab-abab-abababababab');
    expect(calls).toBe(1);
    expect(createPreviewUuid({ ...insecureSource, randomUUID: undefined }))
      .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // No insecure Math.random fallback when cryptographic APIs are absent.
    expect(() => createPreviewUuid({} as Crypto)).toThrow(/안전한 난수/);
  });
});
