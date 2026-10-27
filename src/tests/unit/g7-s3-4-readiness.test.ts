import { describe, expect, test } from 'vitest';
import {
  assessS34Readiness, S3_4_REQUIRED_CHECKS, type S34Packet,
} from '../../server/g7-operational/s3-4-readiness';
import { G7_S3_CAPABILITY, G7_S3_SCHEMA_ID } from '../../server/g7-operational/preflight';
const source = 'a'.repeat(40);
const image = (letter: string, version: string, commit: string) =>
  ({ version, sourceCommit: commit, digest: 'sha256:' + letter.repeat(64) });
function fixture(): S34Packet {
  const snapshotId = 'SNAP-s3-4-private';
  const checks = Object.fromEntries(S3_4_REQUIRED_CHECKS.map((key, i) =>
    [key, { status: 'PASS', evidenceId: 'EV-private-' + (i + 1),
      reviewerId: 'QA-internal', testedAtUtc: '2026-10-27T00:00:00Z',
      ...(key.includes('SNAPSHOT') || key.includes('RESTORE') ||
        key === 'CAD_LOCAL_RESTORE_SHA' || key === 'S3_OBJECT_RESTORE_SHA'
        ? { snapshotId } : {}),
    }]));
  return {
    schemaVersion: 1, scope: 'G7_S3_4_READINESS',
    capability: G7_S3_CAPABILITY, schemaId: G7_S3_SCHEMA_ID,
    sourceCommit: source, snapshotId, operationalActivationOff: true,
    activeMigrationUnchanged: true,
    app: image('1', '0.43.0', source), migrator: image('2', '0.43.0', source),
    rollbackApp: image('3', '0.42.0', 'b'.repeat(40)),
    rollbackMigrator: image('4', '0.42.0', 'b'.repeat(40)),
    checks,
  };
}
describe('#109 S3-4-A offline release evidence, no operating GO', () => {
  test('even complete private PASS attestations cannot activate a release', () => {
    const r = assessS34Readiness(fixture());
    expect(r).toMatchObject({
      state: 'EVIDENCE_PACKET_COMPLETE_NOT_GO',
      completed: S3_4_REQUIRED_CHECKS.length,
      required: S3_4_REQUIRED_CHECKS.length,
      operationalGo: false, runtimeActivated: false,
    });
  });
  test('not-run/omitted checks never count as completed', () => {
    const base = fixture();
    const checks = {...base.checks};
    delete checks.REGISTRY_MIGRATOR_DIGEST;
    const r = assessS34Readiness({...base,checks});
    expect(r.state).toBe('PENDING');
    expect(r.reasons).toContain('NOT_RUN:REGISTRY_MIGRATOR_DIGEST');
    expect(r.operationalGo).toBe(false);
  });
  test('operator FAIL and CANCELLED are blocked, never silently skipped', () => {
    for (const status of ['FAIL','CANCELLED'] as const) {
      const base = fixture();
      const checks = {...base.checks, DB_RESTORE_FK_ZERO: {
        ...base.checks.DB_RESTORE_FK_ZERO!, status,
      }};
      const r = assessS34Readiness({...base,checks});
      expect(r.state).toBe('BLOCKED');
      expect(r.reasons).toContain(status + ':DB_RESTORE_FK_ZERO');
    }
  });
  test('same snapshot and private evidence ID are mandatory for PASS', () => {
    const base = fixture();
    const a = assessS34Readiness({...base, checks:{...base.checks,
      DB_CAD_S3_SAME_SNAPSHOT: {...base.checks.DB_CAD_S3_SAME_SNAPSHOT!, snapshotId:'SNAP-other'},
    }});
    expect(a.state).toBe('BLOCKED');
    expect(a.reasons).toContain('SNAPSHOT_ID_MISMATCH:DB_CAD_S3_SAME_SNAPSHOT');
    const b = assessS34Readiness({...base, checks:{...base.checks,
      DB_RESTORE_FK_ZERO: {...base.checks.DB_RESTORE_FK_ZERO!, evidenceId:undefined},
    }});
    expect(b.reasons).toContain('PASS_WITHOUT_PRIVATE_EVIDENCE:DB_RESTORE_FK_ZERO');
  });
  test('OCI semantic pair, rollback pair, source, digest and schema are fail-closed', () => {
    const base = fixture();
    for (const pkt of [
      {...base, migrator:{...base.migrator, version:'0.42.1'}},
      {...base, sourceCommit:'f'.repeat(40)},
      {...base, app:{...base.app,digest:'latest'}},
      {...base, rollbackMigrator:{...base.rollbackMigrator,sourceCommit:'c'.repeat(40)}},
      {...base, schemaId:'202610260001_g7_staging_auth'},
      {...base, operationalActivationOff:false},
      {...base, activeMigrationUnchanged:false},
      {...base, injectedSecret:'must-be-denied'},
    ]) {
      expect(assessS34Readiness(pkt).state).toBe('BLOCKED');
    }
  });
  test('malformed, unknown, missing proof and false PASS are never accepted', () => {
    const base = fixture();
    for (const pkt of [
      null, [], {}, {...base,checks:{...base.checks,FAKE_CHECK:{status:'PASS'}}},
      {...base,checks:{...base.checks,REGISTRY_APP_DIGEST:{
        ...base.checks.REGISTRY_APP_DIGEST!,testedAtUtc:'2026-02-31T00:00:00Z'}}},
    ]) {
      expect(assessS34Readiness(pkt).state).toBe('BLOCKED');
    }
  });
});
