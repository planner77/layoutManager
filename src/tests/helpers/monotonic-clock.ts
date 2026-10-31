import { vi } from 'vitest';

/** Isolated positive lifecycle clock; callers restoreAllMocks after each test.
 * Explicit future/expiry timestamps still exercise production fail-closed rules.
 */
export function installMonotonicTestClock() {
  const wallStart = Date.now(), monotonicStart = performance.now();
  vi.spyOn(Date, 'now').mockImplementation(() => wallStart + Math.floor(performance.now() - monotonicStart));
}
