import { describe, expect, test } from 'vitest';
import {
  assessS34B25DisposableEvidence, S34_B25_SCOPE,
} from '../../server/g7-operational/s3-4-b2-5';
import {
  S3_4_REQUIRED_CHECKS, type S34Packet, type S34CheckEvidence,
} from '../../server/g7-operational/s3-4-readiness';
import { G7_S3_CAPABILITY, G7_S3_SCHEMA_ID } from '../../server/g7-operational/preflight';

const source = 'a'.repeat(40), rollbackSource = 'b'.repeat(40);
const snap = 'SNAP-disposable-only', timestamp = '2026-10-28T00:00:00Z';
const submitted = '2026-10-28T00:01:00Z';
const reviewed = '2026-10-28T00:02:00Z';
const image = (c: string, version: string, sha: string) =>
  ({ version, sourceCommit: sha, digest: 'sha256:' + c.repeat(64) });

function fixture() {
  const checks = Object.fromEntries(S3_4_REQUIRED_CHECKS.map((name, i) =>
    [name, {
      status: 'PASS' as const, evidenceId: 'EV-disposable-' + (i + 1),
      reviewerId: 'QA-synthetic', testedAtUtc: timestamp,
      snapshotId: snap,
    }])) as S34Packet['checks'];
  const readiness: S34Packet = {
    scope: 'G7_S3_4_READINESS', schemaVersion: 1,
    capability: G7_S3_CAPABILITY, schemaId: G7_S3_SCHEMA_ID,
    sourceCommit: source, snapshotId: snap,
    operationalActivationOff: true, activeMigrationUnchanged: true,
    app: image('1', '0.43.0', source),
    migrator: image('2', '0.43.0', source),
    rollbackApp: image('3', '0.42.1', rollbackSource),
    rollbackMigrator: image('4', '0.42.1', rollbackSource),
    checks,
  };
  const records = S3_4_REQUIRED_CHECKS.map((name, i) => ({
    name, status: 'PASS' as const,
    evidenceId: 'EV-disposable-' + (i + 1),
    reviewerId: 'QA-synthetic', observedAtUtc: timestamp,
    snapshotId: snap, sourceEpoch: 'E-disposable-only',
    changeRequestId: 'CR-fixture', sourceCommit: source, schemaId: G7_S3_SCHEMA_ID,
  }));
  return {
    scope: S34_B25_SCOPE, schemaVersion: 1,
    snapshotId: snap, sourceEpoch: 'E-disposable-only',
    changeRequestId: 'CR-fixture', operatorId: 'OP-synthetic',
    reviewerId: 'QA-synthetic', submittedAtUtc: submitted,
    reviewedAtUtc: reviewed,
    readiness,
    binding: {
      sourceCommit: source, rollbackSourceCommit: rollbackSource,
      sourceEpoch: 'E-disposable-only', changeRequestId: 'CR-fixture',
      schemaId: G7_S3_SCHEMA_ID, snapshotId: snap,
      appDigest: readiness.app.digest, migratorDigest: readiness.migrator.digest,
      rollbackAppDigest: readiness.rollbackApp.digest,
      rollbackMigratorDigest: readiness.rollbackMigrator.digest,
    },
    records,
  };
}
function judge(v: unknown) { return assessS34B25DisposableEvidence(v); }
function editCheck(name: typeof S3_4_REQUIRED_CHECKS[number], check: S34CheckEvidence) {
  const f = fixture();
  return {...f,readiness:{...f.readiness,checks:{...f.readiness.checks,[name]:check}}};
}

describe('#142 S3-4-B2-5 supplied private evidence-reference binder', () => {
  test('complete *synthetic* EV/QA/SNAP ledger is NEVER authenticated/operational GO', () => {
    const r = judge(fixture());
    expect(r).toMatchObject({
      state:'DISPOSABLE_EVIDENCE_RECONCILED_NOT_SITE_PROOF',
      reasons:[], claimedPassCount:S3_4_REQUIRED_CHECKS.length,
      recordsCompared:S3_4_REQUIRED_CHECKS.length,
      requiredCount:S3_4_REQUIRED_CHECKS.length,
      readinessPacketComplete:true,
      privateEvidenceAuthenticated:false, independentReviewerVerified:false,
      registryVerified:false, writerQuiescenceVerified:false,
      sameSnapshotVerified:false, sevenMigrationsExecuted:false,
      restoreExecuted:false,rollbackExecuted:false,
      operationalGo:false,runtimeActivated:false,
    });
  });
  test('review records may be reordered without altering per-check pairing', () => {
    const f=fixture();
    expect(judge({...f,records:[...f.records].reverse()}).state)
      .toBe('DISPOSABLE_EVIDENCE_RECONCILED_NOT_SITE_PROOF');
  });
  test('no record, duplicate check, unknown check and missing field fail closed', () => {
    const f=fixture();
    const values:unknown[] = [
      {...f, records: f.records.slice(1)},
      {...f, records: [f.records[0], ...f.records.slice(0,-1)]},
      {...f, records: [{...f.records[0],name:'INJECTED_PASS'},...f.records.slice(1)]},
      {...f, records: [{...f.records[0], evidenceId:undefined},...f.records.slice(1)]},
    ];
    for(const value of values) expect(judge(value).state).toBe('BLOCKED');
  });
  test('duplicated EV references are blocked even with distinct checks',()=>{
    const f=fixture();
    const records=f.records.map((v,i)=>i===1?{...v,evidenceId:f.records[0].evidenceId}:v);
    const checks={...f.readiness.checks,
      REGISTRY_MIGRATOR_DIGEST: {
        ...f.readiness.checks.REGISTRY_MIGRATOR_DIGEST!,
        evidenceId:f.records[0].evidenceId,
      },
    };
    expect(judge({...f,records,readiness:{...f.readiness,checks}}).reasons)
      .toContain('DUPLICATE_EVIDENCE_REFERENCE');
  });
  test('swapped EV and mismatched witness/reviewer cannot pass',()=>{
    const f=fixture();
    const swapped=f.records.map((v,i)=>i===0?{...v,evidenceId:f.records[1].evidenceId}:
      i===1?{...v,evidenceId:f.records[0].evidenceId}:v);
    expect(judge({...f,records:swapped}).reasons)
      .toContain('UNTRUSTED_CLAIM_BINDING_MISMATCH');
    for(const records of [
      [{...f.records[0],reviewerId:'QA-other'},...f.records.slice(1)],
      [{...f.records[0],snapshotId:'SNAP-other'},...f.records.slice(1)],
      [{...f.records[0],sourceCommit:rollbackSource},...f.records.slice(1)],
      [{...f.records[0],sourceEpoch:'E-wrong'},...f.records.slice(1)],
      [{...f.records[0],changeRequestId:'CR-wrong'},...f.records.slice(1)],
      [{...f.records[0],schemaId:'CAD_BASELINE'},...f.records.slice(1)],
    ]){
      expect(judge({...f,records}).state).toBe('BLOCKED');
    }
  });
  test('four OCI role digests/source/schema/snapshot are exact-bound',()=>{
    const f=fixture();
    const altered=[
      {...f,binding:{...f.binding,appDigest:f.binding.rollbackAppDigest}},
      {...f,binding:{...f.binding,rollbackMigratorDigest:f.binding.appDigest}},
      {...f,binding:{...f.binding,rollbackSourceCommit:source}},
      {...f,binding:{...f.binding,sourceEpoch:'E-wrong'}},
      {...f,binding:{...f.binding,changeRequestId:'CR-wrong'}},
      {...f,binding:{...f.binding,schemaId:'CAD_BASELINE'}},
      {...f,binding:{...f.binding,snapshotId:'SNAP-another'}},
      {...f,snapshotId:'SNAP-another'},
      {...f,readiness:{...f.readiness,migrator:{...f.readiness.migrator,version:'0.99.0'}}},
    ];
    for(const value of altered)expect(judge(value).state).toBe('BLOCKED');
  });
  test('pending NOT_RUN is explicit, never promoted to proof',()=>{
    const f=fixture();
    const key='DB_CAD_S3_SAME_SNAPSHOT' as const;
    const checks={...f.readiness.checks,[key]:{status:'NOT_RUN' as const}};
    const records=f.records.map(x=>x.name===key?{name:x.name,status:'NOT_RUN' as const}:x);
    const result=judge({...f,readiness:{...f.readiness,checks},records});
    expect(result.state).toBe('PENDING');
    expect(result.claimedPassCount).toBe(S3_4_REQUIRED_CHECKS.length-1);
    expect(result.operationalGo).toBe(false);
  });
  test('FAIL, CANCELLED and contradictory status never become PENDING or PASS',()=>{
    const f=fixture();
    for(const status of ['FAIL','CANCELLED'] as const){
      const key='DB_CAD_S3_SAME_SNAPSHOT' as const;
      const checks={...f.readiness.checks,[key]:{status}};
      const records=f.records.map(x=>x.name===key?{name:x.name,status}:x);
      const r=judge({...f,readiness:{...f.readiness,checks},records});
      expect(r.state).toBe('BLOCKED');
    }
    expect(judge({...f,records:[{name:f.records[0].name,status:'NOT_RUN'},...f.records.slice(1)]}).state)
      .toBe('BLOCKED');
  });
  test('invalid UTC dates, reviewer chronology and forged timestamps block',()=>{
    const f=fixture();
    const bad=[
      {...f,submittedAtUtc:'2026-02-31T00:00:00Z'},
      {...f,reviewedAtUtc:'2026-10-27T23:59:59Z'},
      {...f,records:[{...f.records[0],observedAtUtc:'2026-10-28T00:03:00Z'},...f.records.slice(1)]},
      {...f,records:[{...f.records[0],observedAtUtc:'2026-10-27T23:59:59Z'},...f.records.slice(1)]},
    ];
    for(const value of bad)expect(judge(value).state).toBe('BLOCKED');
  });
  test('structurally forged PASS in readiness remains BLOCKED',()=>{
    const f=fixture();
    const bad=editCheck('REGISTRY_APP_DIGEST',{
      status:'PASS',evidenceId:'EV-disposable-1',
      reviewerId:'QA-synthetic',testedAtUtc:'2026-02-31T00:00:00Z',
      snapshotId:snap,
    });
    expect(judge(bad).reasons).toContain('READINESS_PACKET_BLOCKED');
    expect(judge({...f,readiness:{...f.readiness,checks:{
      ...f.readiness.checks,FAKE_CHECK:{status:'PASS'},
    }}}).state).toBe('BLOCKED');
  });
  test('unknown fields, raw assets, non-plain objects and secrets are rejected without reflection',()=>{
    const f=fixture();
    const bad:unknown[]=[
      null, {}, [],
      {...f,rawCadBytes:'PRIVATE-CAD-CONTENT'},
      {...f,credentials:'PASSWORD-SECRET'},
      {...f,records:[{...f.records[0],rawS3ObjectKey:'secret-key'},...f.records.slice(1)]},
      {...f,binding:{...f.binding,registryUrl:'https://private.invalid'}},
      {...f,records:[new Date(),...f.records.slice(1)]},
      {...f,records:['PASS',...f.records.slice(1)]},
      {...f,sourceEpoch:'E-invalid/slash'},
    ];
    for(const v of bad){
      const r=judge(v);
      expect(r.state).toBe('BLOCKED');
      const printed=JSON.stringify(r);
      expect(printed).not.toContain('PRIVATE-CAD-CONTENT');
      expect(printed).not.toContain('PASSWORD-SECRET');
      expect(printed).not.toContain('secret-key');
      expect(printed).not.toContain('private.invalid');
    }
  });
});
