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
    }])) as S34Packet['checks'];
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

import { loadPrivateS34Packet, readVerifiedS34Descriptor } from '../../scripts/g7-s3-4-readiness';
import {
  chmodSync, lstatSync, mkdtempSync, renameSync, rmSync,
  symlinkSync, writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('#109 S3-4-A private file boundary', () => {
  test('only UID-owned private absolute evidence outside the repo is loaded', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 's3-4-private-'));
    const file = path.join(dir, 'operator.json');
    try {
      writeFileSync(file, JSON.stringify(fixture()), {mode: 0o600});
      expect(assessS34Readiness(loadPrivateS34Packet(file)).state)
        .toBe('EVIDENCE_PACKET_COMPLETE_NOT_GO');
      chmodSync(file, 0o644);
      expect(() => loadPrivateS34Packet(file)).toThrow('G7_S3_4_PRIVATE_FILE_DENIED');
      chmodSync(file, 0o600);
      expect(() => loadPrivateS34Packet('relative/operator.json'))
        .toThrow('G7_S3_4_PRIVATE_ABSOLUTE_PATH_REQUIRED');
    } finally {
      rmSync(dir, {recursive:true,force:true});
    }
  });
});

describe('#109 S3-4-A Codex P2 security regression', () => {
  test('non-string statuses cannot be coerced to NOT_RUN/PASS or return PENDING', () => {
    const sourcePacket = fixture();
    for (const status of [
      ['NOT_RUN'], ['PASS'], {status: 'NOT_RUN'}, 0, true, null,
      ['FAIL'], ['CANCELLED'],
    ]) {
      const check = {status, evidenceId: 'EV-test', reviewerId: 'QA-test',
        testedAtUtc:'2026-10-27T00:00:00Z'};
      const altered = {...sourcePacket, checks:{...sourcePacket.checks,
        REGISTRY_APP_DIGEST: check}};
      const result = assessS34Readiness(altered);
      expect(result.state).toBe('BLOCKED');
      expect(result.reasons).toContain('INVALID_CHECK:REGISTRY_APP_DIGEST');
      expect(result.reasons).not.toContain('NOT_RUN:REGISTRY_APP_DIGEST');
      expect(result.operationalGo).toBe(false);
    }
  });
  test('same descriptor rejects symlink swapped after pathname lstat', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 's34-swap-link-'));
    const file = path.join(dir, 'operator.json'), original = path.join(dir,'old.json');
    const unsafe = path.join(dir,'public.json');
    try {
      writeFileSync(file, JSON.stringify(fixture()), {mode:0o600});
      writeFileSync(unsafe, JSON.stringify(fixture()), {mode:0o644});
      const inspected = lstatSync(file);
      renameSync(file,original);
      symlinkSync(unsafe,file);
      expect(() => readVerifiedS34Descriptor(file, inspected)).toThrow();
      expect(() => loadPrivateS34Packet(file)).toThrow('G7_S3_4_PRIVATE_FILE_DENIED');
    } finally { rmSync(dir,{recursive:true,force:true}); }
  });
  test('same descriptor rejects inode replacement even with private 0600 mode', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 's34-swap-inode-'));
    const file = path.join(dir, 'operator.json'), original = path.join(dir,'old.json');
    try {
      writeFileSync(file, JSON.stringify(fixture()), {mode:0o600});
      const inspected = lstatSync(file);
      renameSync(file,original);
      writeFileSync(file, JSON.stringify(fixture()), {mode:0o600});
      expect(() => readVerifiedS34Descriptor(file, inspected))
        .toThrow('G7_S3_4_PRIVATE_FILE_DENIED');
    } finally { rmSync(dir,{recursive:true,force:true}); }
  });
  test('O_NONBLOCK prevents an attacker-swapped FIFO from hanging', () => {
    if (process.platform === 'win32') return;
    const dir = mkdtempSync(path.join(tmpdir(), 's34-swap-fifo-'));
    const file = path.join(dir,'operator.json'), original = path.join(dir,'old.json');
    const pipe = path.join(dir,'pipe');
    try {
      writeFileSync(file, JSON.stringify(fixture()), {mode:0o600});
      const inspected = lstatSync(file);
      execFileSync('mkfifo',[pipe]);
      renameSync(file,original);
      renameSync(pipe,file);
      expect(() => readVerifiedS34Descriptor(file, inspected))
        .toThrow('G7_S3_4_PRIVATE_FILE_DENIED');
    } finally { rmSync(dir,{recursive:true,force:true}); }
  });
  test('opened descriptor is closed on a malformed JSON parse failure', () => {
    const dir = mkdtempSync(path.join(tmpdir(),'s34-parse-'));
    const file = path.join(dir,'operator.json');
    try {
      writeFileSync(file,'not-json', {mode:0o600});
      expect(() => readVerifiedS34Descriptor(file, lstatSync(file))).toThrow(SyntaxError);
      // A valid replacement can then be read without reusing a stale descriptor.
      writeFileSync(file,JSON.stringify(fixture()), {mode:0o600});
      expect(assessS34Readiness(loadPrivateS34Packet(file)).state)
        .toBe('EVIDENCE_PACKET_COMPLETE_NOT_GO');
    } finally { rmSync(dir,{recursive:true,force:true}); }
  });
});
