import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'dotenv';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export const project = path.join(root, 'src');
/** @param {Record<string, string | undefined>} inherited */
export function appEnvironment(inherited = process.env, file = path.join(root, '.env')) {
  const local = existsSync(file) ? parse(readFileSync(file)) : {};
  const result = Object.fromEntries(Object.entries(inherited).filter(([k]) => !/^(GIT|GITHUB|remote_repo)/i.test(k)));
  const defaults = { DATABASE_URL: `file:${path.join(root, 'data/db/cad.sqlite')}`, CAD_STORAGE_PATH: path.join(root, 'data/cad'), MAX_UPLOAD_SIZE_MB: '100' };
  for (const key of Object.keys(defaults)) result[key] = inherited[key] || local[key] || defaults[key];
  const limit = Number(result.MAX_UPLOAD_SIZE_MB);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1024) throw new Error('MAX_UPLOAD_SIZE_MB must be an integer between 1 and 1024');
  if (!result.DATABASE_URL.startsWith('file:/') || !path.isAbsolute(result.CAD_STORAGE_PATH)) throw new Error('DATABASE_URL and CAD_STORAGE_PATH require absolute paths');
  result.NEXT_TELEMETRY_DISABLED = '1';
  return result;
}
