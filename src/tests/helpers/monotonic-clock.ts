import { vi } from 'vitest';

// Capture before any test installs the Date.now spy; reinstalling must not recurse.
const systemWallNow=Date.now.bind(Date);

/** Isolated positive lifecycle clock; callers restoreAllMocks after each test.
 * Explicit future/expiry timestamps still exercise production fail-closed rules.
 */
export function installMonotonicTestClock() {
  const now=createMonotonicTestNow(systemWallNow,performance.now.bind(performance));
  vi.spyOn(Date, 'now').mockImplementation(now);
}

/** Injectable sources reproduce wall/monotonic rounding and host clock changes. */
export function createMonotonicTestNow(wallNow:()=>number,monotonicNow:()=>number):()=>number{
  const wallStart=wallNow(),monotonicStart=monotonicNow();
  let latest=wallStart;
  return ()=>{
    latest=Math.max(latest,wallNow(),wallStart+Math.floor(monotonicNow()-monotonicStart));
    return latest;
  };
}
