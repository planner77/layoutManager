/**
 * Browser-only UUID for Issue #41's disposable outline-type UX prototype.
 * randomUUID is secure-context-only in Chromium, whereas getRandomValues is
 * supported on documented HTTP deployments. Never use Math.random or treat
 * preview IDs as a server security, permission or persistence token.
 */
type BrowserRandomSource = Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>>;

export function createPreviewUuid(source: BrowserRandomSource = globalThis.crypto): string {
  if (source && typeof source.randomUUID === 'function') {
    return source.randomUUID();
  }
  if (!source || typeof source.getRandomValues !== 'function') {
    throw new Error('이 브라우저는 안전한 난수 생성을 지원하지 않습니다.');
  }

  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // RFC 9562 UUID version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 9562 variant 10xx
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
    hex.slice(16, 20), hex.slice(20)].join('-');
}
