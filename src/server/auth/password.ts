/**
 * Local-account credential KDF (not the existing CAD deletion-password hash).
 * Built-in scrypt avoids an unreviewed external dependency in the P4-D1
 * disabled domain. Runtime activation still needs benchmark + DB/secret QA.
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const N = 32768;
const R = 8;
const P = 3;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const MAX_MEMORY = 64 * 1024 * 1024;
const HASH_PATTERN = /^scrypt\$local-v1\$N=32768,r=8,p=3\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/;
let active = 0;
const waiters: Array<() => void> = [];

export function assertLocalPassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || Array.from(password).length < 8 ||
      Buffer.byteLength(password, 'utf8') > 1024 || password.includes('\0')) {
    throw new Error('비밀번호는 최소 8자, 최대 1024바이트여야 합니다.');
  }
}
async function acquire() {
  if (active < 2) { active++; return; }
  if (waiters.length >= 16) throw new Error('KDF capacity exceeded');
  await new Promise<void>(resolve => waiters.push(resolve));
}
function release() {
  const next = waiters.shift();
  if (next) next(); else active--;
}
async function derive(password: string, salt: Buffer) {
  await acquire();
  try {
    return await new Promise<Buffer>((resolve, reject) => scrypt(
      password, salt, KEY_BYTES, { N, r: R, p: P, maxmem: MAX_MEMORY },
      (error, key) => error ? reject(error) : resolve(key as Buffer),
    ));
  } finally { release(); }
}
function canonicalBase64(value: string, length: number) {
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === length && decoded.toString('base64url') === value ? decoded : null;
}
export async function hashLocalPassword(password: string): Promise<string> {
  assertLocalPassword(password);
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(password, salt);
  return 'scrypt$local-v1$N=32768,r=8,p=3$' + salt.toString('base64url') + '$' + hash.toString('base64url');
}
export async function verifyLocalPassword(password: string, encoded: string | null | undefined): Promise<boolean> {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 1024) return false;
  const match = HASH_PATTERN.exec(encoded ?? '');
  if (!match) return false;
  const salt = canonicalBase64(match[1], SALT_BYTES);
  const expected = canonicalBase64(match[2], KEY_BYTES);
  if (!salt || !expected) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}
