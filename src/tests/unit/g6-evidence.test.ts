import { afterEach, describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  G6_CASES, assessG6Evidence, readPrivateG6Evidence,
} from '../../scripts/g6-evidence.mjs';

const full = () => ({
  schemaVersion: 1, scope: 'G6_PREACTIVATION', operationalFeaturesOff: true,
  checks: Object.fromEntries(G6_CASES.map((id: string, i: number) => [id, {
    status: 'PASS', evidenceId: 'EV-CASE-' + i,
    ...(id.startsWith('BACKUP_') || id === 'MIGRATION_DRY_RUN' || id === 'RESTORE_DB_CAD_S3'
      ? { snapshotId: 'SNAP-PRIVATE-001' } : {}),
    ...(id === 'PROD_PC_1_NGINX' ? { clientId: 'PC-ONE' } : {}),
    ...(id === 'PROD_PC_2_NGINX' ? { clientId: 'PC-TWO' } : {}),
    ...(id === 'APP_MIGRATOR_PAIR' ? { appVersion: '0.41.0', migratorVersion: '0.41.0' } : {}),
    ...(['MIGRATION_DRY_RUN', 'RESTORE_DB_CAD_S3'].includes(id) ? { invariants: {
      fkZero: true, versionRowsEqual: true, currentOwnershipEqual: true,
      databaseShaFieldsEqual: true, localCadBytesEqual: true, s3BytesEqual: true,
    } } : {}),
  }])),
});
let temp = '';
afterEach(() => { if (temp) rmSync(temp, { recursive: true, force: true }); temp = ''; });

describe('Issue #108 G6 evidence readiness (not field acceptance)', () => {
  test('TC-P4-G6-001: NOT_RUN must remain PENDING, never PASS', () => {
    const data = full();
    (data.checks as Record<string, unknown>).CAD_DELETE_EDITOR_SITE_PASSWORD = { status: 'NOT_RUN' };
    const state = assessG6Evidence(data);
    expect(state.state).toBe('PENDING');
    expect(state.reasons).toContain('NOT_RUN:CAD_DELETE_EDITOR_SITE_PASSWORD');
    expect(state.completed).toBe(G6_CASES.length - 1);
  });

  test('TC-P4-G6-002: documented OFF is mandatory; no automatic G7 activation', () => {
    const data = full();
    expect(assessG6Evidence(data).state).toBe('READY_FOR_OWNER_REVIEW');
    data.operationalFeaturesOff = false;
    expect(assessG6Evidence(data).reasons).toContain('OPERATIONAL_GATE_NOT_OFF');
    expect(assessG6Evidence(data).state).toBe('BLOCKED');
    expect(assessG6Evidence(null).state).toBe('BLOCKED');
  });

  test('TC-P4-G6-003: same checkpoint DB/CAD/S3/dry-run/restore, evidence per PASS', () => {
    const data = full();
    data.checks.BACKUP_S3.snapshotId = 'SNAP-OTHER-002';
    expect(assessG6Evidence(data).reasons).toContain('BACKUP_CHECKPOINT_MISMATCH');
    data.checks.BACKUP_S3.snapshotId = 'SNAP-PRIVATE-001';
    data.checks.RESTORE_DB_CAD_S3.invariants!.s3BytesEqual = false;
    expect(assessG6Evidence(data).reasons).toContain('INTEGRITY_UNVERIFIED:RESTORE_DB_CAD_S3');
    data.checks.RESTORE_DB_CAD_S3.invariants!.s3BytesEqual = true;
    data.checks.BACKUP_SQLITE.evidenceId = '';
    expect(assessG6Evidence(data).reasons).toContain('INVALID_PASS_EVIDENCE:BACKUP_SQLITE');
  });

  test('TC-P4-G6-004: two different LAN clients; paired app/migrator images', () => {
    const data = full();
    data.checks.PROD_PC_2_NGINX.clientId = 'PC-ONE';
    expect(assessG6Evidence(data).reasons).toContain('LAN_CLIENTS_NOT_DISTINCT');
    data.checks.PROD_PC_2_NGINX.clientId = 'PC-TWO';
    data.checks.APP_MIGRATOR_PAIR.migratorVersion = '0.40.9';
    expect(assessG6Evidence(data).reasons).toContain('IMAGE_PAIR_MISMATCH');
  });

  test('TC-P4-G6-005: unknown/private fields or failure cannot masquerade as acceptance', () => {
    const data = full();
    data.checks.AUTH_SESSION.status = 'FAIL';
    expect(assessG6Evidence(data).reasons).toContain('CHECK_FAILED:AUTH_SESSION');
    data.checks.AUTH_SESSION.status = 'PASS';
    Object.assign(data.checks.AUTH_SESSION, { rawToken: 'private-secret-never-emit' });
    const report = JSON.stringify(assessG6Evidence(data));
    expect(report).toContain('INVALID_CHECK:AUTH_SESSION');
    expect(report).not.toContain('private-secret-never-emit');
  });

  test('TC-P4-G6-006: private-only manifest guard rejects repository path and symlink', () => {
    const repo = path.resolve(process.cwd(), '..');
    temp = mkdtempSync(path.join(tmpdir(), 'g6-private-test-'));
    const src = path.join(temp, 'manifest.json');
    writeFileSync(src, JSON.stringify(full()));
    expect(readPrivateG6Evidence(src, repo).schemaVersion).toBe(1);
    expect(() => readPrivateG6Evidence(path.join(process.cwd(), 'package.json'), repo))
      .toThrow('G6_REPOSITORY_PATH_DENIED');
    const redirect = path.join(temp, 'symlink.json');
    symlinkSync(src, redirect);
    expect(() => readPrivateG6Evidence(redirect, repo)).toThrow('G6_SYMLINK_DENIED');
    const parent = path.join(temp, 'unused');
    mkdirSync(parent);
    expect(() => readPrivateG6Evidence(parent, repo)).toThrow('G6_EVIDENCE_FILE_INVALID');
  });
});
