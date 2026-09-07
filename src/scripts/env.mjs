import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'dotenv';
import { storageConfiguration } from './storage-config.mjs';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export const project = path.join(root, 'src');
/** @param {Record<string, string | undefined>} inherited */
export function appEnvironment(inherited = process.env, file = path.join(root, '.env')) {
  const local = existsSync(file) ? parse(readFileSync(file)) : {};
  const result = Object.fromEntries(Object.entries(inherited).filter(([k]) => !/^(GIT|GITHUB|remote_repo)/i.test(k)));
  const defaults = { DATABASE_URL: `file:${path.join(root, 'data/db/cad.sqlite')}`, CAD_STORAGE_PATH: path.join(root, 'data/cad'), MAX_UPLOAD_SIZE_MB: '100' };
  for (const key of Object.keys(defaults)) result[key] = inherited[key] || local[key] || defaults[key];
  for (const key of ['CAD_STORAGE_BACKEND','CAD_S3_ENDPOINT','CAD_S3_BUCKET','CAD_S3_REGION','CAD_S3_ACCESS_KEY_ID','CAD_S3_SECRET_ACCESS_KEY','CAD_S3_SESSION_TOKEN','CAD_S3_FORCE_PATH_STYLE','CAD_S3_TIMEOUT_MS']) result[key] = inherited[key] ?? local[key] ?? '';
  storageConfiguration(result);
  const limit = Number(result.MAX_UPLOAD_SIZE_MB);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1024) throw new Error('MAX_UPLOAD_SIZE_MB must be an integer between 1 and 1024');
  if (!result.DATABASE_URL.startsWith('file:/') || !path.isAbsolute(result.CAD_STORAGE_PATH)) throw new Error('DATABASE_URL and CAD_STORAGE_PATH require absolute paths');
  result.NEXT_TELEMETRY_DISABLED = '1';
  return result;
}
