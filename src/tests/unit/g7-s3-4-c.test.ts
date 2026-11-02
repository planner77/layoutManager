import { describe, expect, test } from 'vitest';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  assessS34COwnerManagedBinding, s34CSigningBytes, S34_C_SCOPE,
} from '../../server/g7-operational/s3-4-c';
import { S3_4_REQUIRED_CHECKS, type S34Packet } from
  '../../server/g7-operational/s3-4-readiness';
import { G7_S3_CAPABILITY, G7_S3_SCHEMA_ID } from
  '../../server/g7-operational/preflight';
import { S34_B25_SCOPE } from '../../server/g7-operational/s3-4-b2-5';

const source='a'.repeat(40), rollbackSource='b'.repeat(40);
const now='2026-10-28T00:06:00Z';
const image=(digit:string,version:string,sha:string)=>({
  sourceCommit:sha,version,digest:'sha256:'+digit.repeat(64),
});
function fixture(){
  const checkedAt='2026-10-28T00:00:00Z';
  const readiness:S34Packet={
    scope:'G7_S3_4_READINESS',schemaVersion:1,
    capability:G7_S3_CAPABILITY,schemaId:G7_S3_SCHEMA_ID,
    sourceCommit:source,snapshotId:'SNAP-site-fixture',
    operationalActivationOff:true,activeMigrationUnchanged:true,
    app:image('1','0.43.0',source),
    migrator:image('2','0.43.0',source),
    rollbackApp:image('3','0.42.1',rollbackSource),
    rollbackMigrator:image('4','0.42.1',rollbackSource),
    checks:Object.fromEntries(S3_4_REQUIRED_CHECKS.map((name,i)=>[
      name,{status:'PASS',evidenceId:'EV-synthetic-'+i,
        reviewerId:'QA-synthetic',testedAtUtc:checkedAt,
        snapshotId:'SNAP-site-fixture'},
    ])),
  };
  const evidence={
    scope:S34_B25_SCOPE,schemaVersion:1,
    snapshotId:'SNAP-site-fixture',
    sourceEpoch:'E-fixture',changeRequestId:'CR-fixture',
    operatorId:'OP-fixture',reviewerId:'QA-synthetic',
    submittedAtUtc:'2026-10-28T00:01:00Z',
    reviewedAtUtc:'2026-10-28T00:02:00Z',
    readiness,
    binding:{
      sourceCommit:source,rollbackSourceCommit:rollbackSource,
      sourceEpoch:'E-fixture',changeRequestId:'CR-fixture',
      schemaId:G7_S3_SCHEMA_ID,snapshotId:'SNAP-site-fixture',
      appDigest:readiness.app.digest,
      migratorDigest:readiness.migrator.digest,
      rollbackAppDigest:readiness.rollbackApp.digest,
      rollbackMigratorDigest:readiness.rollbackMigrator.digest,
    },
    records:S3_4_REQUIRED_CHECKS.map((name,i)=>({
      name,status:'PASS',evidenceId:'EV-synthetic-'+i,
      reviewerId:'QA-synthetic',observedAtUtc:checkedAt,
      snapshotId:'SNAP-site-fixture',sourceEpoch:'E-fixture',
      changeRequestId:'CR-fixture',sourceCommit:source,
      schemaId:G7_S3_SCHEMA_ID,
    })),
  };
  const receipts=S3_4_REQUIRED_CHECKS.map((name,i)=>{
    const bytes=Buffer.from('FAKE PRIVATE RECEIPT '+name+' '+i,'utf8');
    return {name,evidenceId:'EV-synthetic-'+i,
      sha256:createHash('sha256').update(bytes).digest('hex'),bytes};
  });
  const owner=generateKeyPairSync('ed25519');
  const qa=generateKeyPairSync('ed25519');
  const trusted={owner:owner.publicKey,qa:qa.publicKey};
  const unsigned={
    scope:S34_C_SCOPE,schemaVersion:1,evidence,receipts,
    ownerApproval:{ownerId:'OWNER-fixture',signedAtUtc:'2026-10-28T00:03:00Z'},
    qaApproval:{reviewerId:'QA-synthetic',signedAtUtc:'2026-10-28T00:04:00Z'},
    expiresAtUtc:'2026-10-28T12:00:00Z',
    signatures:{owner:'',qa:''},
  };
  const signPacket=(candidate:unknown)=>{
    const bytes=s34CSigningBytes(candidate);
    if(!bytes) throw new Error('fixture signing statement malformed');
    return {...(candidate as typeof unsigned),signatures:{
      owner:sign(null,bytes,owner.privateKey).toString('base64'),
      qa:sign(null,bytes,qa.privateKey).toString('base64'),
    }};
  };
  return {signed:signPacket(unsigned),unsigned,signPacket,trusted};
}
function check(v:unknown, keys:unknown, at:unknown=now){
  return assessS34COwnerManagedBinding(v,keys,at);
}

describe('Issue #151 S3-4-C0 Owner Managed strictly local evidence receipts',()=>{
  test('valid synthetic local signatures NEVER authenticate site or enable runtime GO',()=>{
    const f=fixture(),r=check(f.signed,f.trusted);
    expect(r).toMatchObject({
      state:'LOCAL_SIGNED_RECEIPTS_CONSISTENT_NOT_SITE_GO',
      reasons:[], receiptsChecked:17,requiredReceipts:17,
      receiptSignaturesValid:true,privateSourceAuthenticated:false,
      registryProvenanceVerified:false, independentReviewerVerified:false,
      writerQuiescenceVerified:false,sameSnapshotRestored:false,
      sevenMigrationsExecuted:false,physicalRollbackVerified:false,
      operationalGo:false,runtimeActivated:false,
    });
    expect(JSON.stringify(r)).not.toContain('FAKE PRIVATE RECEIPT');
    expect(JSON.stringify(r)).not.toContain('EV-synthetic');
  });
  test('signature canonicalization does not depend on supplied receipt order',()=>{
    const f=fixture();
    const shuffled={...f.signed,receipts:[...f.signed.receipts].reverse()};
    expect(check(shuffled,f.trusted).state)
      .toBe('LOCAL_SIGNED_RECEIPTS_CONSISTENT_NOT_SITE_GO');
  });
  test('tampered receipt bytes or sha256 are blocked even with valid old signatures',()=>{
    const f=fixture();
    const bytes=[...f.signed.receipts];
    bytes[0]={...bytes[0],bytes:Buffer.from('TAMPERED PRIVATE RECEIPT')};
    expect(check({...f.signed,receipts:bytes},f.trusted).reasons)
      .toContain('RECEIPT_INTEGRITY_BLOCKED');
    const digest=[...f.signed.receipts];
    digest[0]={...digest[0],sha256:'f'.repeat(64)};
    expect(check({...f.signed,receipts:digest},f.trusted).state)
      .toBe('BLOCKED');
  });
  test('missing, duplicate and unexpected receipts are blocked',()=>{
    const f=fixture(),receipts=f.signed.receipts;
    for(const list of [
      receipts.slice(1),
      [receipts[0],...receipts.slice(0,-1)],
      [{...receipts[0],name:'NOT_AN_ALLOWED_CHECK'},...receipts.slice(1)],
      [{...receipts[0],bytes:Buffer.alloc(65537)},...receipts.slice(1)],
    ]) expect(check({...f.signed,receipts:list},f.trusted).state).toBe('BLOCKED');
  });
  test('trusted signers are injected separately; wrong, same or private key fails',()=>{
    const f=fixture(),other=generateKeyPairSync('ed25519');
    expect(check(f.signed,{owner:other.publicKey,qa:f.trusted.qa}).reasons)
      .toContain('LOCAL_SIGNATURE_INVALID');
    expect(check(f.signed,{owner:f.trusted.owner,qa:f.trusted.owner}).reasons)
      .toContain('TRUST_ANCHOR_INVALID');
    expect(check(f.signed,{owner:other.privateKey,qa:f.trusted.qa}).state)
      .toBe('BLOCKED');
    expect(check({...f.signed,trustedKeys:f.trusted},f.trusted).state)
      .toBe('BLOCKED');
  });
  test('missing, wrong or swapped owner/QA signatures fail closed',()=>{
    const f=fixture(),sig=f.signed.signatures;
    const edits=[
      {...f.signed,signatures:{...sig,qa:sig.owner}},
      {...f.signed,signatures:{...sig,owner:''}},
      {...f.signed,signatures:{...sig,qa:'fake'}},
      {...f.signed,qaApproval:{...f.signed.qaApproval,reviewerId:'QA-other'}},
    ];
    for(const value of edits)expect(check(value,f.trusted).state).toBe('BLOCKED');
  });
  test('release/snapshot/OCI and audit claim changes need new valid signatures',()=>{
    const f=fixture(),packet=f.signed.evidence;
    for(const bad of [
      {...f.signed,evidence:{...packet,snapshotId:'SNAP-other'}},
      {...f.signed,evidence:{...packet,binding:{
        ...packet.binding,appDigest:packet.binding.rollbackAppDigest,
      }}},
      {...f.signed,evidence:{...packet,changeRequestId:'CR-other'}},
      {...f.signed,evidence:{...packet,readiness:{...packet.readiness,
        sourceCommit:rollbackSource}}},
    ]) expect(check(bad,f.trusted).state).toBe('BLOCKED');
  });
  test('expired, future, malformed UTC and >24h approval windows block',()=>{
    const f=fixture();
    for(const bad of [
      {...f.signed,expiresAtUtc:'2026-10-28T00:05:00Z'},
      {...f.signed,expiresAtUtc:'2026-10-30T00:00:00Z'},
      {...f.signed,ownerApproval:{...f.signed.ownerApproval,
        signedAtUtc:'2026-10-28T00:07:00Z'}},
      {...f.signed,qaApproval:{...f.signed.qaApproval,
        signedAtUtc:'2026-02-31T00:00:00Z'}},
      {...f.signed,ownerApproval:{...f.signed.ownerApproval,
        signedAtUtc:'2026-10-27T23:00:00Z'}},
    ]) expect(check(bad,f.trusted).state).toBe('BLOCKED');
    expect(check(f.signed,f.trusted,'not-a-clock').state).toBe('BLOCKED');
  });
  test('B2-5 explicit NOT_RUN yields PENDING; failed claim cannot be signed GO',()=>{
    const f=fixture(),key='DB_CAD_S3_SAME_SNAPSHOT';
    const checks={...f.signed.evidence.readiness.checks,[key]:{status:'NOT_RUN'}};
    const records=f.signed.evidence.records.map(r=>r.name===key?{
      name:key,status:'NOT_RUN',
    }:r);
    const evidence={...f.signed.evidence,readiness:{
      ...f.signed.evidence.readiness,checks,
    },records};
    const pending={...f.signed,evidence};
    expect(check(pending,f.trusted).state).toBe('PENDING');
    const failed={...f.signed,evidence:{...evidence,readiness:{
      ...evidence.readiness,checks:{...checks,[key]:{status:'FAIL'}},
    }}};
    expect(check(failed,f.trusted).state).toBe('BLOCKED');
  });
  test('unknown, secret-bearing, invalid receipt payload cannot leak in output',()=>{
    const f=fixture();
    const vals:unknown[]=[
      {...f.signed,privatePath:'/secret/internal/private'},
      {...f.signed,receipts:[{...f.signed.receipts[0],
        localS3Key:'S3-PRIVATE-KEY'},...f.signed.receipts.slice(1)]},
      {...f.signed,receipts:[{...f.signed.receipts[0],bytes:'plaintext'},
        ...f.signed.receipts.slice(1)]},
      {},
      null,
    ];
    for(const value of vals){
      const got=check(value,f.trusted);
      expect(got.state).toBe('BLOCKED');
      const printed=JSON.stringify(got);
      for(const fragment of ['/secret/internal','S3-PRIVATE-KEY',
        'FAKE PRIVATE RECEIPT','EV-synthetic']){
        expect(printed).not.toContain(fragment);
      }
    }
  });
});
