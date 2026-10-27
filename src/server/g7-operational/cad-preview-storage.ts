/** #109 S3-3 preview local storage alignment.
 * Pure function, no server-only context/production storage access.
 */
import path from 'node:path';
import type { G7S3TestTarget } from './disposable-target';

export function requireG7S3CadStorageAlignment(
  target: G7S3TestTarget, env: Readonly<Record<string, string | undefined>>,
): string {
  const expected = path.join(target.root, 'cad');
  if (env.CAD_STORAGE_PATH !== expected ||
      (env.CAD_STORAGE_BACKEND !== undefined && env.CAD_STORAGE_BACKEND !== 'local') ||
      Object.entries(env).some(([key, value]) => key.startsWith('CAD_S3_') && !!value)) {
    throw new Error('G7_S3_CAD_STORAGE_ALIGNMENT_DENIED');
  }
  return expected;
}
