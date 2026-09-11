import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { CadError } from '@/domain/cad';
const N = 32768, R = 8, P = 3, KEY = 32;
let active = 0;
const waiters: Array<() => void> = [];
async function acquireKdf() {
  if (active < 2) { active++; return; }
  if (waiters.length >= 16) throw new CadError('KDF_BUSY', '비밀번호 처리 요청이 많습니다. 잠시 후 다시 시도해주세요.', 429);
  await new Promise<void>(resolve => waiters.push(resolve));
}
function releaseKdf() { const next = waiters.shift(); if (next) next(); else active--; }
async function kdf(password: string, salt: Buffer) {
  await acquireKdf();
  try { return await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, KEY, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 }, (error, derived) => error ? reject(error) : resolve(derived as Buffer))); } finally { releaseKdf(); }
}
function decodeCanonical(value: string, bytes: number) {
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === bytes && decoded.toString('base64url') === value ? decoded : null;
}
export async function hashDeletePassword(password: string) { const salt = randomBytes(16), hash = await kdf(password, salt); return `scrypt$v1$N=${N},r=${R},p=${P}$${salt.toString('base64url')}$${hash.toString('base64url')}`; }
export async function verifyDeletePassword(password: string, encoded: string | null | undefined) {
  const m = /^scrypt\$v1\$N=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/.exec(encoded ?? '');
  if (!m || Number(m[1]) !== N || Number(m[2]) !== R || Number(m[3]) !== P) return false;
  const salt = decodeCanonical(m[4], 16), expected = decodeCanonical(m[5], KEY);
  if (!salt || !expected) return false;
  const actual = await kdf(password, salt);
  return timingSafeEqual(actual, expected);
}
