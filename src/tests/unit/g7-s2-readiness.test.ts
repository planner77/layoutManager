import { describe, expect, test } from 'vitest';
import { assessS2Readiness, S2_CHECKS, type S2Attestation } from '../../server/g7-staging/s2-readiness';
const NOW='2026-10-26T09:00:00Z';
function complete(): S2Attestation {
  const checks=Object.fromEntries(S2_CHECKS.map(k=>[k,{
    status:'PASS',evidenceId:'EV-'+k.replaceAll('_','-'),
    reviewerId:'QA-private-reviewer',testedAtUtc:NOW,
    ...(['STAGING_BACKUP_RESTORE','DB_CAD_S3_SAME_SNAPSHOT_RESTORE'].includes(k)
      ? {snapshotId:'SNAP-approved-synthetic'} : {}),
  }]));
  return {
    schemaVersion:1,scope:'G7_S2_READINESS',operationalActivationOff:true,
    sourceCommit:'a'.repeat(40),schemaId:'202610260001_g7_staging_auth',
    appDigest:'sha256:'+'a'.repeat(64),migratorDigest:'sha256:'+'b'.repeat(64),
    rollbackAppDigest:'sha256:'+'c'.repeat(64),
    rollbackMigratorDigest:'sha256:'+'d'.repeat(64),
    changeRequestId:'CR-private-123',proposedWindowUtc:NOW,
    ownerDecision:'GO',ownerApprovalId:'OWNER-private-123',
    ownerApprovedAtUtc:NOW,checks,
  } as S2Attestation;
}
describe('#109 S2 offline attestation: never substitutes for operational release GO',()=>{
  test('missing all evidence is pending or blocked, never GO',()=>{
    const out=assessS2Readiness({});
    expect(out.state).toBe('BLOCKED');
    expect(out.operationalGo).toBe(false);
  });
  test('syntactically complete private IDs only reach review, never activate',()=>{
    const out=assessS2Readiness(complete());
    expect(out).toMatchObject({state:'READY_FOR_OWNER_REVIEW',completed:S2_CHECKS.length,operationalGo:false});
    expect(JSON.stringify(out)).not.toContain('private-123');
  });
  test('missing one check is not silently accepted',()=>{
    const candidate=structuredClone(complete());
    delete (candidate.checks as Record<string,unknown>).PRODUCTION_MULTIPART_AUTH_CONTRACT;
    expect(assessS2Readiness(candidate).reasons).toContain('NOT_RUN:PRODUCTION_MULTIPART_AUTH_CONTRACT');
  });
  test('owner no-go always blocks',()=>{
    const candidate={...complete(),ownerDecision:'NO_GO'};
    expect(assessS2Readiness(candidate).state).toBe('BLOCKED');
  });
  test('snapshot mismatch blocks, even with all self-attested PASS',()=>{
    const base=complete();
    const candidate={...base,checks:{...base.checks,
      DB_CAD_S3_SAME_SNAPSHOT_RESTORE:{...base.checks.DB_CAD_S3_SAME_SNAPSHOT_RESTORE,
        snapshotId:'SNAP-other-snapshot'}}};
    expect(assessS2Readiness(candidate).reasons).toContain('SNAPSHOT_MISMATCH');
  });
  test('unknown input field cannot exfiltrate or be accepted',()=>{
    const candidate={...complete(),rawDatabaseDump:'PRIVATE_CANARY'};
    const result=assessS2Readiness(candidate);
    expect(result.state).toBe('BLOCKED');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CANARY');
  });
  test('unknown status or missing evidence ID never counts',()=>{
    const base=complete();
    const candidate={...base,checks:{...base.checks,
      STAGING_AUTH_SESSION:{...base.checks.STAGING_AUTH_SESSION,evidenceId:undefined}}};
    expect(assessS2Readiness(candidate).reasons).toContain('UNVERIFIED_CHECK:STAGING_AUTH_SESSION');
  });
});
