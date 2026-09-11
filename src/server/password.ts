import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { CadError } from '@/domain/cad';
const N = 32768, R = 8, P = 3, KEY = 32;
let active = 0;
async function kdf(password: string, salt: Buffer, limited = true) {
  if (limited && active >= 2) throw new CadError('KDF_BUSY', '동시에 처리할 수 있는 삭제 요청을 초과했습니다. 잠시 후 다시 시도해주세요.', 429);
  active++;
  try { return await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, KEY, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 }, (error, derived) => error ? reject(error) : resolve(derived as Buffer))); } finally { active--; }
}
export async function hashDeletePassword(password: string) { const salt = randomBytes(16), hash = await kdf(password, salt, false); return `scrypt$v1$N=${N},r=${R},p=${P}$${salt.toString('base64url')}$${hash.toString('base64url')}`; }
export async function verifyDeletePassword(password: string, encoded: string | null | undefined) {
  const m = /^scrypt\$v1\$N=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9_-]{22,})\$([A-Za-z0-9_-]{43})$/.exec(encoded ?? '');
  if (!m || Number(m[1]) !== N || Number(m[2]) !== R || Number(m[3]) !== P) return false;
  const actual = await kdf(password, Buffer.from(m[4], 'base64url')), expected = Buffer.from(m[5], 'base64url');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
