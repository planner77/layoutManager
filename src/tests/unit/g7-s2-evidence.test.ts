import { describe, expect, test, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  G7_S2_CASES, assessG7S2Evidence, readPrivateG7Evidence,
} from '../../scripts/g7-s2-evidence.mjs';
const scopes = new Set([
  'BACKUP_SQLITE','BACKUP_LOCAL_CAD','BACKUP_REAL_S3',
  'RESTORE_DB_CAD_S3','ROLLBACK_APP_SCHEMA_PAIR',
]);
const sample = () => ({
  schemaVersion: 1, scope: 'G7_S2_PRIVATE_ATTESTATION',
  sourceCommit: 'a'.repeat(40), appDigest: 'sha256:'+'b'.repeat(64),
  migratorDigest: 'sha256:'+'c'.repeat(64),
  rollbackAppDigest: 'sha256:'+'d'.repeat(64),
  rollbackMigratorDigest: 'sha256:'+'e'.repeat(64),
  migrationId: '202610260001_g7_staging_auth',
  snapshotId: 'SNAP-LOCAL-001', ownerApprovalId: 'GO-OWNER-LOCAL',
  operatorId: 'operator-local', rollbackOperatorId: 'recovery-local',
  checks: Object.fromEntries(G7_S2_CASES.map((kind: string,idx: number) => [kind,{
    status: 'PASS', evidenceId: 'EV-LOCAL-' + idx,
    ...(scopes.has(kind) ? { snapshotId: 'SNAP-LOCAL-001' } : {}),
  }])),
});
const roots: string[] = [];
afterEach(() => { for(const x of roots.splice(0)) rmSync(x,{recursive:true,force:true}); });
describe('#109 S2 private local-only attestations', () => {
  test('never treats unperformed real S3 or restore as PASS', () => {
    const m=sample();
    (m.checks as Record<string,unknown>).BACKUP_REAL_S3={status:'NOT_RUN'};
    expect(assessG7S2Evidence(m).state).toBe('PENDING');
    expect(assessG7S2Evidence(m).reasons).toContain('NOT_RUN:BACKUP_REAL_S3');
  });
  test('cross snapshot mismatch and failed rollback fail closed', () => {
    const m=sample();
    (m.checks as Record<string,unknown>).RESTORE_DB_CAD_S3={
      status:'PASS',evidenceId:'EV-RESTORE-1',snapshotId:'SNAP-DIFFERENT'};
    expect(assessG7S2Evidence(m).reasons).toContain(
      'SNAPSHOT_MISMATCH:RESTORE_DB_CAD_S3');
    (m.checks as Record<string,unknown>).ROLLBACK_APP_SCHEMA_PAIR={status:'FAIL'};
    expect(assessG7S2Evidence(m).state).toBe('BLOCKED');
  });
  test('complete synthetic self-attestation is only READY_FOR_OWNER_REVIEW not GO', () => {
    const x=assessG7S2Evidence(sample());
    expect(x.state).toBe('READY_FOR_OWNER_REVIEW');
    expect(x.accepted).toBe(G7_S2_CASES.length);
    const dumped=JSON.stringify(x);
    expect(dumped).not.toContain('sha256:');
    expect(dumped).not.toContain('SNAP-LOCAL');
    expect(dumped).not.toContain('GO-OWNER');
  });
  test('private file outside repo, 0600; nonprivate rejected', () => {
    const dir=mkdtempSync(path.join(tmpdir(),'g7-private-evidence-'));
    roots.push(dir);
    const manifest=path.join(dir,'attested.json');
    writeFileSync(manifest, JSON.stringify(sample()), {mode:0o600});
    expect(readPrivateG7Evidence(manifest,process.cwd())).toMatchObject({
      scope:'G7_S2_PRIVATE_ATTESTATION',
    });
    chmodSync(manifest,0o644);
    expect(() => readPrivateG7Evidence(manifest,process.cwd())).toThrow();
  });
});
