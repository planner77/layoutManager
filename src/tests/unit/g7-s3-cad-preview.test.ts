import { afterEach, describe, expect, test, vi } from 'vitest';
import { prepareG7CadWrite } from '../../server/g7-operational/cad-guard';
import { requireG7S3CadStorageAlignment } from '../../server/g7-operational/cad-preview-context';
import { CadStorage } from '../../server/storage/cad-storage';
import { ConfiguredCadStorage } from '../../server/storage/configured-storage';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

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

describe('S3-3 P2 preview storage alignment and anonymous content compatibility', () => {
  const root = '/tmp/cad-g7-s3-fixture1234';
  const target = { root, databasePath: root + '/fixture.sqlite' };
  test('only exact local storage root is accepted for both write and content GET', () => {
    expect(requireG7S3CadStorageAlignment(target, {
      CAD_STORAGE_PATH: root + '/cad', CAD_STORAGE_BACKEND: 'local',
    })).toBe(root + '/cad');
    for (const env of [
      { CAD_STORAGE_PATH: '/srv/operating-cad' },
      { CAD_STORAGE_PATH: root + '/cad/../cad' },
      { CAD_STORAGE_PATH: root + '/cad', CAD_STORAGE_BACKEND: 's3' },
      { CAD_STORAGE_PATH: root + '/cad', CAD_S3_ENDPOINT: 'http://127.0.0.1:9000' },
    ]) {
      expect(() => requireG7S3CadStorageAlignment(target, env)).toThrow('G7_S3_CAD_STORAGE_ALIGNMENT_DENIED');
    }
  });
  test('a locally published preview object is readable with the legacy configured content backend', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const temp = mkdtempSync(path.join(tmpdir(), 'g7-s3-content-'));
    try {
      const directory = path.join(temp, 'cad');
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const incoming = path.join(temp, 'original');
      const bytes = '0\\nSECTION\\n2\\nENTITIES\\n0\\nENDSEC\\n0\\nEOF\\n';
      writeFileSync(incoming, bytes);
      const writer = new CadStorage(directory, 1024 * 1024);
      const reader = new ConfiguredCadStorage(directory, 1024 * 1024,
        { CAD_STORAGE_PATH: directory, CAD_STORAGE_BACKEND: 'local' });
      const location = '11111111-1111-4111-8111-111111111111';
      const version = '22222222-2222-4222-8222-222222222222';
      const key = await writer.publish(incoming, location, version, 'DXF');
      const opened = await reader.content(key);
      expect(await new Response(opened.stream).text()).toBe(bytes);
      reader.close();
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
});
