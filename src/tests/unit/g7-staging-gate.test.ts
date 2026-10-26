import { afterEach, describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { G7_STAGING_SCHEMA_ID, resolveG7StagingGate } from '../../server/g7-staging/gate';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'cad-g7-staging-'));
  dirs.push(root);
  mkdirSync(path.join(root, 'cad'));
  writeFileSync(path.join(root, 'fixture.sqlite'), '');
  writeFileSync(path.join(root, 'release.json'), JSON.stringify({
    scope: 'S1-STAGING-ONLY', schemaId: G7_STAGING_SCHEMA_ID,
    databasePath: path.join(root, 'fixture.sqlite'),
    appDigest: 'sha256:' + 'a'.repeat(64),
    migratorDigest: 'sha256:' + 'b'.repeat(64),
    sourceCommit: 'c'.repeat(40),
  }));
  const env: Record<string, string> = {
    G7_STAGING_ONLY: 'true',
    G7_AUTH_ENABLED: 'true',
    G7_RELEASE_CAPABILITY: 'G7-S1-STAGING-V1',
    G7_OPERATION_APPROVAL: 'S1-STAGING-ONLY',
    G7_STAGING_ROOT: root,
    G7_STAGING_DATABASE_URL: 'file:' + path.join(root, 'fixture.sqlite'),
    DATABASE_URL: 'file:' + path.join(root, 'fixture.sqlite'),
    CAD_STORAGE_PATH: path.join(root, 'cad'),
    G7_STAGING_ORIGIN: 'http://127.0.0.1:3315',
    G7_CAD_WRITE_CUTOVER_ENABLED: 'false',
  };
  return { root, env };
}
describe('#109 G7 staging release+operation gate', () => {
  test('001/002 defaults and incorrect approvals are OFF; writing has a second gate', () => {
    const { env } = setup();
    expect(resolveG7StagingGate({})).toBeNull();
    expect(resolveG7StagingGate({ ...env, G7_AUTH_ENABLED: 'false' })).toBeNull();
    expect(resolveG7StagingGate({ ...env, G7_AUTH_ENABLED: 'TRUE' })).toBeNull();
    expect(resolveG7StagingGate({ ...env, G7_STAGING_ONLY: undefined })).toBeNull();
    expect(resolveG7StagingGate({ ...env, G7_RELEASE_CAPABILITY: 'latest' })).toBeNull();
    expect(resolveG7StagingGate({ ...env, G7_OPERATION_APPROVAL: 'GO' })).toBeNull();
    expect(resolveG7StagingGate(env)?.writeEnabled).toBe(false);
    expect(resolveG7StagingGate({ ...env, G7_CAD_WRITE_CUTOVER_ENABLED: 'TRUE' })?.writeEnabled)
      .toBe(false);
    expect(resolveG7StagingGate({ ...env, G7_CAD_WRITE_CUTOVER_ENABLED: 'true' })?.writeEnabled)
      .toBe(true);
  });
  test('003 denies mismatched operational DB and symlinked stage root', () => {
    const { root, env } = setup();
    expect(resolveG7StagingGate({ ...env, DATABASE_URL: 'file:/data/operational.sqlite' }))
      .toBeNull();
    expect(resolveG7StagingGate({ ...env, CAD_STORAGE_PATH: '/data/cad' })).toBeNull();
    expect(resolveG7StagingGate({ ...env, G7_STAGING_DATABASE_URL: 'file:/data/x.sqlite' }))
      .toBeNull();
    const alias = path.join(tmpdir(), 'cad-g7-staging-badalias');
    dirs.push(alias);
    symlinkSync(root, alias);
    expect(resolveG7StagingGate({ ...env, G7_STAGING_ROOT: alias })).toBeNull();
  });
  test('013/014 rejects schema/digest/manifest mismatches, never enabling production', () => {
    const { root, env } = setup();
    const manifest = path.join(root, 'release.json');
    writeFileSync(manifest, JSON.stringify({
      scope: 'OWNER_GO', schemaId: G7_STAGING_SCHEMA_ID,
      databasePath: path.join(root, 'fixture.sqlite'),
      appDigest: 'sha256:' + 'a'.repeat(64),
      migratorDigest: 'sha256:' + 'b'.repeat(64),
      sourceCommit: 'c'.repeat(40),
    }));
    expect(resolveG7StagingGate(env)).toBeNull();
  });
});
