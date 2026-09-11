import { CadError } from '@/domain/cad';

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;
const MAX_ENTRIES = 10_000;
type Attempt = { count: number; until: number };
const attempts = new Map<string, Attempt>();

function prune(now: number) {
  for (const [key, state] of attempts) if (state.until <= now) attempts.delete(key);
}

/** Reserve before any asynchronous password work so concurrent requests cannot bypass the limit. */
export function reserveDeleteAttempt(key: string, now = Date.now()) {
  prune(now);
  const current = attempts.get(key);
  if (current && current.count >= MAX_ATTEMPTS) {
    throw new CadError('DELETE_RATE_LIMITED', '잠시 후 다시 시도해주세요.', 429, { retryAfterSeconds: Math.max(1, Math.ceil((current.until - now) / 1000)) });
  }
  if (!current && attempts.size >= MAX_ENTRIES) throw new CadError('DELETE_RATE_LIMITED', '잠시 후 다시 시도해주세요.', 429, { retryAfterSeconds: 60 });
  const next = current ? { ...current, count: current.count + 1 } : { count: 1, until: now + WINDOW_MS };
  attempts.set(key, next);
}

export function clearDeleteAttempts(key: string) { attempts.delete(key); }

export function resetDeleteAttemptsForTests() { attempts.clear(); }
