import { describe, expect, test } from 'vitest';
import {
  evaluateG7S3Preflight, G7_S3_CAPABILITY, G7_S3_SCHEMA_ID,
  type G7S3BuildIdentity, type G7S3OperationApproval,
  type G7S3ReleaseEvidence,
} from '../../server/g7-operational/preflight';

const NOW = Date.parse('2026-10-26T10:00:00Z');
const sourceCommit = 'a'.repeat(40);
const appDigest = 'sha256:' + 'b'.repeat(64);
const migratorDigest = 'sha256:' + 'c'.repeat(64);
const identity: G7S3BuildIdentity = {
  capability: G7_S3_CAPABILITY, sourceCommit, schemaId: G7_S3_SCHEMA_ID,
  app: { version: '0.41.1', digest: appDigest, sourceCommit },
  migrator: { version: '0.41.1', digest: migratorDigest, sourceCommit },
};
const evidence: G7S3ReleaseEvidence = {
  appDigestRegistryVerified: true, migratorDigestRegistryVerified: true,
  sourceCommitVerified: true, migrationSchemaVerified: true,
  foreignKeyViolations: 0, rollbackPairVerified: true,
  snapshotRestoreVerified: true,
};
const approval: G7S3OperationApproval = {
  decision: 'GO', scope: 'G7-S3-AUTH-CUTOVER',
  ownerApprovalId: 'OWNER-synthetic', changeRequestId: 'CR-synthetic',
  notBeforeUtc: '2026-10-26T09:00:00Z',
  expiresAtUtc: '2026-10-26T11:00:00Z',
  sourceCommit, schemaId: G7_S3_SCHEMA_ID,
  appDigest, migratorDigest,
  rollbackAppDigest: 'sha256:' + 'd'.repeat(64),
  rollbackMigratorDigest: 'sha256:' + 'e'.repeat(64),
  snapshotId: 'SNAP-synthetic',
};
const environment = {
  G7_AUTH_ENABLED: 'true', G7_CAD_WRITE_CUTOVER_ENABLED: 'false',
  G7_RELEASE_CAPABILITY: G7_S3_CAPABILITY,
  G7_RELEASE_SOURCE_COMMIT: sourceCommit,
  G7_RELEASE_SCHEMA_ID: G7_S3_SCHEMA_ID,
  G7_RELEASE_APP_DIGEST: appDigest,
  G7_RELEASE_MIGRATOR_DIGEST: migratorDigest,
  G7_RELEASE_VERSION: '0.41.1',
  G7_OPERATION_APPROVAL_ID: 'OWNER-synthetic',
  G7_OPERATION_CHANGE_ID: 'CR-synthetic',
};

describe('#109 S3-1 production schema release/operation preflight (never routed)', () => {
  test('all default flags absent is OFF and does not activate any runtime', () => {
    const result = evaluateG7S3Preflight({}, null, null, null, NOW);
    expect(result).toMatchObject({
      state: 'OFF', authEligible: false, writeEligible: false,
      runtimeActivated: false,
    });
  });
  test('both synthetic gates valid allows preflight but NEVER routes or activates', () => {
    const result = evaluateG7S3Preflight(
      environment, identity, evidence, approval, NOW);
    expect(result).toMatchObject({
      state: 'READY_FOR_RUNTIME_INTEGRATION', releaseReady: true,
      operationReady: true, authEligible: true, writeEligible: false,
      runtimeActivated: false,
    });
    const writing = evaluateG7S3Preflight(
      { ...environment, G7_CAD_WRITE_CUTOVER_ENABLED: 'true' },
      identity, evidence, approval, NOW);
    expect(writing.writeEligible).toBe(true);
    expect(writing.runtimeActivated).toBe(false);
  });
  test('write switch without Auth can never enable write', () => {
    const result = evaluateG7S3Preflight({
      ...environment, G7_AUTH_ENABLED: 'false', G7_CAD_WRITE_CUTOVER_ENABLED: 'true',
    }, identity, evidence, approval, NOW);
    expect(result.state).toBe('OFF');
    expect(result.writeEligible).toBe(false);
    expect(result.reasons).toContain('WRITE_REQUIRES_AUTH');
  });
  test('typos in flags never resolve to a permissive state', () => {
    for (const value of ['TRUE', 'yes', '1', ' true']) {
      const result = evaluateG7S3Preflight(
        { ...environment, G7_AUTH_ENABLED: value }, identity, evidence, approval, NOW);
      expect(result.authEligible).toBe(false);
      expect(result.runtimeActivated).toBe(false);
    }
  });
  test('version/source/digest/schema mismatch blocks release even if owner signed', () => {
    const candidates: G7S3BuildIdentity[] = [
      { ...identity, schemaId: '202601010001_wrong' },
      { ...identity, sourceCommit: 'f'.repeat(40) },
      { ...identity, migrator: { ...identity.migrator, version: '0.41.2' } },
      { ...identity, app: { ...identity.app, digest: 'sha256:' + 'd'.repeat(64) } },
      { ...identity, capability: 'G7-S1-STAGING-V1' },
    ];
    for (const candidate of candidates) {
      const result = evaluateG7S3Preflight(
        environment, candidate, evidence, approval, NOW);
      expect(result.releaseReady).toBe(false);
      expect(result.reasons).toContain('RELEASE_IDENTITY_MISMATCH');
    }
  });
  test('missing registry verification or DB migration evidence blocks release', () => {
    for (const verification of [
      null, { ...evidence, appDigestRegistryVerified: false },
      { ...evidence, migrationSchemaVerified: false },
      { ...evidence, foreignKeyViolations: 1 },
      { ...evidence, snapshotRestoreVerified: false },
    ]) {
      const result = evaluateG7S3Preflight(
        environment, identity, verification, approval, NOW);
      expect(result.authEligible).toBe(false);
      expect(result.reasons).toContain('RELEASE_EVIDENCE_MISSING');
    }
  });
  test('S2 Owner general acceptance cannot substitute for release-specific GO', () => {
    for (const owner of [
      null, { ...approval, decision: 'NO_GO' as const },
      { ...approval, scope: 'S2-STAGING-ACCEPTED' },
      { ...approval, appDigest: 'sha256:' + 'f'.repeat(64) },
      { ...approval, snapshotId: '' },
      { ...approval, expiresAtUtc: '2026-10-26T09:30:00Z' },
    ]) {
      const result = evaluateG7S3Preflight(
        environment, identity, evidence, owner, NOW);
      expect(result.operationReady).toBe(false);
      expect(result.authEligible).toBe(false);
      expect(result.reasons).toContain('OWNER_RELEASE_SPECIFIC_GO_REQUIRED');
    }
  });
  test('wrong operation approval or change ID denies even if everything else matches', () => {
    const result = evaluateG7S3Preflight(
      { ...environment, G7_OPERATION_APPROVAL_ID: 'OWNER-wrong' },
      identity, evidence, approval, NOW);
    expect(result.operationReady).toBe(false);
  });
});
