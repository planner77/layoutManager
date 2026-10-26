import { describe, expect, test, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  G7_OPERATION_SCHEMA_ID, resolveG7OperationGate, g7OperationalWriteMode,
} from '../../server/g7-operational/gate';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(now: number) {
  const root = mkdtempSync(path.join(tmpdir(), 'g7-operation-fixture-'));
  roots.push(root);
  const dbFile = path.join(root, 'cad.sqlite'), cadDir = path.join(root, 'cad');
  const approval = path.join(root, 'approved.json');
  mkdirSync(cadDir);
  writeFileSync(dbFile, '');
  const src = 'a'.repeat(40), app = 'sha256:' + 'b'.repeat(64),
    migrator = 'sha256:' + 'c'.repeat(64);
  const data = {
    scope: 'G7_S3_RELEASE_SPECIFIC_GO', decision: 'GO',
    schemaId: G7_OPERATION_SCHEMA_ID, operationGoId: 'GO-S3-REHEARSAL',
    snapshotId: 'SNAP-TEST-001',
    appDigest: app, migratorDigest: migrator, sourceCommit: src,
    rollbackAppDigest: 'sha256:' + 'd'.repeat(64),
    rollbackMigratorDigest: 'sha256:' + 'e'.repeat(64),
    evidenceIds: ['EV-TEST-001','EV-TEST-002','EV-TEST-003'],
    operatorId: 'operator-fixture', rollbackOperatorId: 'rollback-fixture',
    ownerId: 'owner-fixture',
    origin: 'http://127.0.0.1:3317',
    databaseUrl: 'file:' + dbFile, cadStoragePath: cadDir,
    validFrom: new Date(now - 1000).toISOString(),
    validUntil: new Date(now + 1000).toISOString(),
  };
  writeFileSync(approval, JSON.stringify(data), { mode: 0o600 });
  const env: Record<string,string> = {
    G7_S3_GO: 'true', G7_AUTH_ENABLED: 'true',
    G7_RELEASE_CAPABILITY: 'G7-OPERATIONAL-V1',
    G7_OPERATION_MANIFEST_PATH: approval,
    G7_OPERATION_GO_ID: data.operationGoId,
    G7_OPERATION_DATABASE_URL: data.databaseUrl, DATABASE_URL: data.databaseUrl,
    CAD_STORAGE_PATH: cadDir, G7_OPERATION_ORIGIN: data.origin,
    G7_RUNNING_APP_DIGEST: app,
    G7_RUNNING_MIGRATOR_DIGEST: migrator,
    G7_RUNNING_SOURCE_COMMIT: src,
    G7_CAD_WRITE_CUTOVER_ENABLED: 'false',
  };
  return { env, data, approval, dbFile, now };
}
describe('#109 S2/S3 operational GO gate', () => {
  test('NO-GO default and invalid/partial flags never upgrade legacy writes', () => {
    expect(resolveG7OperationGate({})).toBeNull();
    expect(g7OperationalWriteMode({})).toBe('legacy');
    expect(g7OperationalWriteMode({ G7_AUTH_ENABLED: 'true' })).toBe('blocked');
    expect(g7OperationalWriteMode({ G7_CAD_WRITE_CUTOVER_ENABLED: 'true' })).toBe('blocked');
    expect(g7OperationalWriteMode({ G7_S3_GO: 'false' })).toBe('blocked');
  });
  test('private release-specific approved manifest allows Auth, write only on separate flag', () => {
    const now = Date.now(), { env } = fixture(now);
    expect(resolveG7OperationGate(env,now)?.writeEnabled).toBe(false);
    expect(g7OperationalWriteMode(env)).toBe('blocked');
    const auth = { ...env, G7_CAD_WRITE_CUTOVER_ENABLED: 'true' };
    expect(resolveG7OperationGate(auth,now)?.writeEnabled).toBe(true);
    expect(g7OperationalWriteMode(auth)).toBe('protected');
  });
  test('invalid digest/approval, expired/incorrect target and public manifest always NO-GO', async () => {
    const now = Date.now(), { env, data, approval, dbFile } = fixture(now);
    for (const altered of [
      { G7_S3_GO: 'false' }, { G7_OPERATION_GO_ID: 'GO-OTHER' },
      { G7_RUNNING_APP_DIGEST: 'sha256:' + 'f'.repeat(64) },
      { G7_RUNNING_SOURCE_COMMIT: 'e'.repeat(40) },
      { DATABASE_URL: 'file:/data/real.sqlite' },
      { G7_OPERATION_ORIGIN: 'http://another.example' },
    ]) expect(resolveG7OperationGate({ ...env, ...altered },now)).toBeNull();
    expect(resolveG7OperationGate(env,now + 1001)).toBeNull();
    writeFileSync(approval, JSON.stringify({ ...data, decision: 'PENDING' }), { mode: 0o600 });
    expect(resolveG7OperationGate(env,now)).toBeNull();
    writeFileSync(approval, JSON.stringify(data), { mode: 0o644 });
    // chmod explicit to avoid umask variations.
    const fs = await import('node:fs');
    fs.chmodSync(approval, 0o644);
    expect(resolveG7OperationGate(env,now)).toBeNull();
    expect((await import('node:fs')).readFileSync(dbFile,'utf8')).toBe('');
  });
});
