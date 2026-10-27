import { afterEach, describe, expect, test, vi } from 'vitest';
import { prepareG7CadWrite } from '../../server/g7-operational/cad-guard';

afterEach(() => vi.unstubAllEnvs());
describe('S3-3 CAD cutover is never activated by production flags', () => {
  const request = () => new Request('http://127.0.0.1:3317/api/cad-files',
    { method: 'POST', headers: { origin: 'http://127.0.0.1:3317' } });
  test('unconfigured legacy request stays backward compatible', () => {
    vi.stubEnv('G7_S3_CAD_PREVIEW_ONLY', undefined);
    vi.stubEnv('G7_AUTH_ENABLED', 'false');
    vi.stubEnv('G7_CAD_WRITE_CUTOVER_ENABLED', 'false');
    vi.stubEnv('G7_S3_GO', undefined);
    vi.stubEnv('G7_OPERATION_MANIFEST_PATH', undefined);
    expect(prepareG7CadWrite(request(), 'fixture')).toBeUndefined();
  });
  test('production enable attempt never falls back to anonymous write', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('G7_S3_CAD_PREVIEW_ONLY', 'true');
    vi.stubEnv('G7_AUTH_ENABLED', 'false');
    vi.stubEnv('G7_CAD_WRITE_CUTOVER_ENABLED', 'false');
    expect(() => prepareG7CadWrite(request(), 'fixture')).toThrow();
  });
  test('invalid GO without S3-4 trusted release is denied', () => {
    vi.stubEnv('G7_S3_CAD_PREVIEW_ONLY', undefined);
    vi.stubEnv('G7_AUTH_ENABLED', 'true');
    expect(() => prepareG7CadWrite(request(), 'fixture')).toThrow();
  });
  test('preview without isolated migration/marker is denied before any write', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('G7_S3_CAD_PREVIEW_ONLY', 'true');
    vi.stubEnv('G7_S3_AUTH_API_PREVIEW_ONLY', 'true');
    vi.stubEnv('G7_AUTH_ENABLED', 'false');
    vi.stubEnv('G7_CAD_WRITE_CUTOVER_ENABLED', 'false');
    vi.stubEnv('G7_S3_MIGRATION_TEST_ONLY', 'true');
    vi.stubEnv('G7_S3_TEST_ROOT', '/var/lib/production');
    expect(() => prepareG7CadWrite(request(), 'fixture')).toThrow();
  });
});
