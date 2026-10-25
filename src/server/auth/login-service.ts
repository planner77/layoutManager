/** #105 G3: explicit, non-routed login service. The store is supplied by the caller. */
import { createHmac } from 'node:crypto';
import type { UserAccess } from '../../domain/auth';
import { assertLocalPassword, hashLocalPassword, verifyLocalPassword } from './password';
import { digestSessionToken, newSessionCandidate, type AuthSession } from './session';

export type AuthCode = 'BAD_INPUT' | 'UNAUTHENTICATED' | 'ACCOUNT_DISABLED' |
  'PASSWORD_CHANGE_REQUIRED' | 'SESSION_LIMIT' | 'LOGIN_RATE_LIMITED' | 'CSRF_DENIED';
export class AuthFailure extends Error {
  constructor(readonly code: AuthCode, readonly status: number) { super(code); }
}
export const failure = (code: AuthCode, status: number) => new AuthFailure(code, status);
export type Credential = Readonly<{
  id: string; passwordHash: string; status: 'ACTIVE' | 'DISABLED'; mustChangePassword: boolean;
}>;
export type Authenticated = Readonly<{ actor: UserAccess; sessionId: string }>;
export type AuthStore = Readonly<{
  credential(login: string): Credential | null;
  credentialById(userId: string): Credential | null;
  /** Recheck the KDF input hash and state inside the same transaction as insert+audit. */
  issue(userId: string, expectedHash: string, candidate: AuthSession, requestId: string): void;
  /** CAS hash, state, all-session revoke and audit in one write transaction. */
  change(userId: string, expectedHash: string, requiredMustChange: boolean,
    newHash: string, now: number, requestId: string, tokenHash?: string): void;
  /** Lookup, eligibility, expiry, touch and current grants are one consistent operation. */
  authenticate(tokenHash: string, now: number): Authenticated;
  /** Revoke only this session and audit atomically. Already absent/revoked is idempotent. */
  revoke(tokenHash: string, now: number, requestId: string): void;
  denied(userId: string | null, now: number, requestId: string): void;
}>;

export function normalizeLogin(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9._-]{2,63}$/i.test(value)) {
    throw failure('BAD_INPUT', 400);
  }
  return value.toLowerCase();
}
function checkContext(now: number, requestId: string) {
  if (!Number.isSafeInteger(now) || now < 0 ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(requestId)) throw failure('BAD_INPUT', 400);
}
function checkNewPassword(value: unknown): asserts value is string {
  try { assertLocalPassword(value); } catch { throw failure('BAD_INPUT', 400); }
}
function validToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{43}$/.test(value) &&
    Buffer.from(value, 'base64url').length === 32 &&
    Buffer.from(value, 'base64url').toString('base64url') === value;
}
/** This proof is derived from the cookie token with a distinct HMAC domain. */
export function csrfProof(rawToken: string): string {
  if (!validToken(rawToken)) throw failure('UNAUTHENTICATED', 401);
  return createHmac('sha256', rawToken).update('cad-g3-csrf-v1').digest('base64url');
}

export function createLoginService(store: AuthStore) {
  function authenticate(rawToken: unknown, now: number): Authenticated & { csrfToken: string } {
    if (!validToken(rawToken) || !Number.isSafeInteger(now) || now < 0) {
      throw failure('UNAUTHENTICATED', 401);
    }
    return { ...store.authenticate(digestSessionToken(rawToken), now), csrfToken: csrfProof(rawToken) };
  }
  async function checkedCredential(login: unknown, password: unknown, now: number, requestId: string) {
    checkContext(now, requestId);
    const name = normalizeLogin(login);
    const account = store.credential(name);
    if (typeof password !== 'string' || !await verifyLocalPassword(password, account?.passwordHash)) {
      store.denied(account?.id ?? null, now, requestId);
      throw failure('UNAUTHENTICATED', 401);
    }
    if (account?.status === 'DISABLED') throw failure('ACCOUNT_DISABLED', 403);
    return account!;
  }
  return {
    async login(login: unknown, password: unknown, now: number, requestId: string) {
      const account = await checkedCredential(login, password, now, requestId);
      if (account.mustChangePassword) throw failure('PASSWORD_CHANGE_REQUIRED', 403);
      const { rawToken, session } = newSessionCandidate(account.id, now);
      store.issue(account.id, account.passwordHash, session, requestId);
      return { rawToken, csrfToken: csrfProof(rawToken) };
    },
    async initialChange(login: unknown, oldPassword: unknown, newPassword: unknown,
      now: number, requestId: string) {
      const account = await checkedCredential(login, oldPassword, now, requestId);
      if (!account.mustChangePassword) throw failure('BAD_INPUT', 400);
      checkNewPassword(newPassword);
      if (newPassword === oldPassword) throw failure('BAD_INPUT', 400);
      const newHash = await hashLocalPassword(newPassword);
      store.change(account.id, account.passwordHash, true, newHash, now, requestId);
    },
    authenticate,
    async changePassword(rawToken: unknown, oldPassword: unknown, newPassword: unknown,
      now: number, requestId: string) {
      checkContext(now, requestId);
      const { actor } = authenticate(rawToken, now);
      const account = store.credentialById(actor.id);
      if (!account || typeof oldPassword !== 'string' ||
          !await verifyLocalPassword(oldPassword, account.passwordHash)) {
        throw failure('UNAUTHENTICATED', 401);
      }
      checkNewPassword(newPassword);
      if (newPassword === oldPassword) throw failure('BAD_INPUT', 400);
      const newHash = await hashLocalPassword(newPassword);
      store.change(actor.id, account.passwordHash, false, newHash, now, requestId,
        digestSessionToken(rawToken as string));
    },
    logout(rawToken: unknown, now: number, requestId: string) {
      checkContext(now, requestId);
      if (validToken(rawToken)) store.revoke(digestSessionToken(rawToken), now, requestId);
    },
  };
}
