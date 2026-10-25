/**
 * Storage-neutral session policy for Issue #96; not an enabled session store.
 * Production issuance MUST atomically check the count in a DB transaction,
 * revoke on logout/disable/reset, and never persist the returned raw token.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_MAX_CONCURRENT = 3;

export type AuthSession = Readonly<{
  id: string;
  userId: string;
  tokenHash: string;
  issuedAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
}>;

export function digestSessionToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}
export function newSessionCandidate(userId: string, now: number): { rawToken: string; session: AuthSession } {
  if (!userId.trim() || !Number.isSafeInteger(now) || now < 0) throw new Error('Invalid session input');
  const rawToken = randomBytes(32).toString('base64url');
  const session: AuthSession = {
    id: randomBytes(16).toString('hex'), userId, tokenHash: digestSessionToken(rawToken),
    issuedAt: now, lastSeenAt: now, expiresAt: now + SESSION_ABSOLUTE_MS, revokedAt: null,
  };
  return { rawToken, session };
}
export function isSessionActive(session: AuthSession, now: number, activeAccount: boolean): boolean {
  return activeAccount && Number.isFinite(now) && now >= session.issuedAt &&
    session.revokedAt === null && now < session.expiresAt &&
    now - session.lastSeenAt < SESSION_IDLE_MS;
}
export function hasSessionSlot(existing: readonly AuthSession[], userId: string, now: number): boolean {
  return existing.filter(item => item.userId === userId && isSessionActive(item, now, true)).length <
    SESSION_MAX_CONCURRENT;
}
export function verifySessionToken(rawToken: unknown, session: AuthSession): boolean {
  if (typeof rawToken !== 'string' || !/^[a-zA-Z0-9_-]{43}$/.test(rawToken) ||
      !/^[0-9a-f]{64}$/.test(session.tokenHash)) return false;
  const supplied = Buffer.from(digestSessionToken(rawToken), 'hex');
  const expected = Buffer.from(session.tokenHash, 'hex');
  return timingSafeEqual(supplied, expected);
}
export function touchSession(session: AuthSession, now: number, activeAccount: boolean): AuthSession | null {
  if (!isSessionActive(session, now, activeAccount)) return null;
  return { ...session, lastSeenAt: Math.max(session.lastSeenAt, now) };
}
export function revokeSession(session: AuthSession, now: number): AuthSession {
  if (!Number.isFinite(now)) throw new Error('Invalid revocation time');
  return { ...session, revokedAt: session.revokedAt ?? now };
}
/** Deliberately no Secure attribute for the Owner-approved plain HTTP deployment. */
export function sessionCookie(rawToken: string): string {
  if (!/^[a-zA-Z0-9_-]{43}$/.test(rawToken)) throw new Error('Invalid token');
  return 'cad_session=' + rawToken + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800';
}
export function expiredSessionCookie(): string {
  return 'cad_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
}
