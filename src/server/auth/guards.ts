/**
 * Issue #96: independent, non-routed helpers; not a public authentication API.
 * Trusted origin and session-owned CSRF secret must come from the server.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export function requireSessionCsrf(
  submittedOrigin: string | null, trustedOrigin: string,
  submittedToken: string | null, expectedSessionToken: string,
): void {
  let actual: URL, expected: URL;
  try {
    if (!submittedOrigin || !trustedOrigin) throw new Error();
    actual = new URL(submittedOrigin);
    expected = new URL(trustedOrigin);
    if (actual.origin !== submittedOrigin || expected.origin !== trustedOrigin ||
        !['http:', 'https:'].includes(actual.protocol) ||
        !['http:', 'https:'].includes(expected.protocol)) throw new Error();
  } catch { throw new Error('CSRF_ORIGIN_DENIED'); }
  if (actual.origin !== expected.origin) throw new Error('CSRF_ORIGIN_DENIED');
  // Session-bound synchronizer token, not an unsigned double-submit cookie.
  if (!submittedToken || !/^[a-zA-Z0-9_-]{32,128}$/.test(submittedToken) ||
      !/^[a-zA-Z0-9_-]{32,128}$/.test(expectedSessionToken)) throw new Error('CSRF_TOKEN_DENIED');
  const first = createHash('sha256').update(submittedToken).digest();
  const second = createHash('sha256').update(expectedSessionToken).digest();
  if (!timingSafeEqual(first, second)) throw new Error('CSRF_TOKEN_DENIED');
}

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;
const MAX_ENTRIES = 10_000;

export class LoginAttemptLimiter {
  private readonly attempts = new Map<string, { count: number; until: number }>();
  /** Key must be derived from trusted network peer + normalized account ID. */
  reserve(key: string, now: number) {
    if (!key || !Number.isFinite(now) || key.length > 256) throw new Error('LOGIN_DENIED');
    for (const [item, value] of this.attempts) if (value.until <= now) this.attempts.delete(item);
    const current = this.attempts.get(key);
    if (current && current.count >= MAX_ATTEMPTS) throw new Error('LOGIN_RATE_LIMITED');
    if (!current && this.attempts.size >= MAX_ENTRIES) throw new Error('LOGIN_RATE_LIMITED');
    this.attempts.set(key, current
      ? { count: current.count + 1, until: current.until }
      : { count: 1, until: now + WINDOW_MS });
  }
  reset(key: string) { this.attempts.delete(key); }
  // Production requires shared/durable limiting or a demonstrably single worker.
}
