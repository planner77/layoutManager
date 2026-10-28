import { describe, expect, test } from 'vitest';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  G7_S35_R0_SCOPE, assessS35OwnerReleaseDecision, s35OwnerDecisionSigningBytes,
  type S35ReleaseIdentity,
} from '../../server/g7-operational/s3-5-owner-decision';
import { s34CSigningBytes, S34_C_SCOPE } from '../../server/g7-operational/s3-4-c';
import { S34_B25_SCOPE } from '../../server/g7-operational/s3-4-b2-5';
import { S3_4_REQUIRED_CHECKS } from '../../server/g7-operational/s3-4-readiness';
import { G7_S3_CAPABILITY, G7_S3_SCHEMA_ID } from '../../server/g7-operational/preflight';

const SOURCE = 'a'.repeat(40), BACK = 'b'.repeat(40);
const NOW = '2026-10-28T00:10:00Z';
const D = (x:string) => 'sha256:' + x.repeat(64);
const image=(digit:string,version:string,sourceCommit:string) =>
  ({version,sourceCommit,digest:D(digit)});

function fixture() {
  const app=image('1','0.43.0',SOURCE);
  const migrator=image('2','0.43.0',SOURCE);
  const rollbackApp=image('3','0.42.1',BACK);
  const rollbackMigrator=image('4','0.42.1',BACK);
  const snap='SNAP-fixture',epoch='E-fixture',cr='CR-fixture';
  const checkedAt='2026-10-28T00:00:00Z';
  const checks=Object.fromEntries(S3_4_REQUIRED_CHECKS.map((name,i)=>[
    name,{status:'PASS',evidenceId:'EV-synthetic-'+i,
      reviewerId:'QA-synthetic',testedAtUtc:checkedAt,snapshotId:snap},
  ]));
  const readiness={
    scope:'G7_S3_4_READINESS',schemaVersion:1,
    capability:G7_S3_CAPABILITY,schemaId:G7_S3_SCHEMA_ID,
    sourceCommit:SOURCE,snapshotId:snap,
    operationalActivationOff:true,activeMigrationUnchanged:true,
    app,migrator,rollbackApp,rollbackMigrator,checks,
  };
  const evidence={
    scope:S34_B25_SCOPE,schemaVersion:1,
    snapshotId:snap,sourceEpoch:epoch,changeRequestId:cr,
    operatorId:'OP-synthetic',reviewerId:'QA-synthetic',
    submittedAtUtc:'2026-10-28T00:01:00Z',
    reviewedAtUtc:'2026-10-28T00:02:00Z',
    readiness,
    binding:{
      sourceCommit:SOURCE,rollbackSourceCommit:BACK,
      sourceEpoch:epoch,changeRequestId:cr,schemaId:G7_S3_SCHEMA_ID,
      snapshotId:snap,appDigest:app.digest,migratorDigest:migrator.digest,
      rollbackAppDigest:rollbackApp.digest,rollbackMigratorDigest:rollbackMigrator.digest,
    },
    records:S3_4_REQUIRED_CHECKS.map((name,i)=>({
      name,status:'PASS',evidenceId:'EV-synthetic-'+i,
      reviewerId:'QA-synthetic',observedAtUtc:checkedAt,
      snapshotId:snap,sourceEpoch:epoch,changeRequestId:cr,
      sourceCommit:SOURCE,schemaId:G7_S3_SCHEMA_ID,
    })),
  };
  const receipts=S3_4_REQUIRED_CHECKS.map((name,i)=>{
    const bytes=Buffer.from('TEST ONLY RECEIPT '+name+' '+i);
    return {name,evidenceId:'EV-synthetic-'+i,sha256:
      createHash('sha256').update(bytes).digest('hex'),bytes};
  });
  const owner=generateKeyPairSync('ed25519'),qa=generateKeyPairSync('ed25519');
  const trusted={owner:owner.publicKey,qa:qa.publicKey};
  const c0Unsigned={
    scope:S34_C_SCOPE,schemaVersion:1,evidence,receipts,
    ownerApproval:{ownerId:'OWNER-synthetic',signedAtUtc:'2026-10-28T00:03:00Z'},
    qaApproval:{reviewerId:'QA-synthetic',signedAtUtc:'2026-10-28T00:04:00Z'},
    expiresAtUtc:'2026-10-28T12:00:00Z',
    signatures:{owner:'',qa:''},
  };
  const c0Signing=s34CSigningBytes(c0Unsigned);
  if(!c0Signing)throw new Error('Synthetic C0 fixture invalid');
  const c0={
    ...c0Unsigned,signatures:{
      owner:sign(null,c0Signing,owner.privateKey).toString('base64'),
      qa:sign(null,c0Signing,qa.privateKey).toString('base64'),
    },
  };
  const release:S35ReleaseIdentity={
    capability:G7_S3_CAPABILITY,schemaId:G7_S3_SCHEMA_ID,
    sourceCommit:SOURCE,rollbackSourceCommit:BACK,siteScope:'SCOPE-fixture',
    snapshotId:snap,sourceEpoch:epoch,changeRequestId:cr,
    appVersion:app.version,migratorVersion:migrator.version,
    rollbackAppVersion:rollbackApp.version,rollbackMigratorVersion:rollbackMigrator.version,
    appDigest:app.digest,migratorDigest:migrator.digest,
    rollbackAppDigest:rollbackApp.digest,rollbackMigratorDigest:rollbackMigrator.digest,
  };
  const raw={
    scope:G7_S35_R0_SCOPE,schemaVersion:1,decision:'GO',
    release,operation:{
      ownerApprovalId:'OWNER-s35-fixture',operatorId:'OP-synthetic',
      rollbackOperatorId:'OP-rollback',
      approvedAtUtc:'2026-10-28T00:05:00Z',
      notBeforeUtc:'2026-10-28T00:06:00Z',
      expiresAtUtc:'2026-10-28T06:00:00Z',
    },
    c0ReceiptPacket:c0,ownerSignature:'',
  };
  const signed=(candidate:unknown)=>{
    const bytes=s35OwnerDecisionSigningBytes(candidate);
    if(!bytes)throw new Error('Invalid synthetic S3-5 signing packet');
    return {...(candidate as typeof raw),
      ownerSignature:sign(null,bytes,owner.privateKey).toString('base64')};
  };
  return {raw:signed(raw),release,c0,trusted,owner,qa,signed};
}
const judge=(raw:unknown,keys:unknown,expected:unknown,now:unknown=NOW)=>
  assessS35OwnerReleaseDecision(raw,keys,expected,now);

describe('#154 S3-5-R0 local signed release-specific Owner decision, never operating GO',()=>{
  test('signed synthetic GO is only locally consistent and NEVER an operational GO',()=>{
    const f=fixture();
    expect(judge(f.raw,f.trusted,f.release)).toMatchObject({
      state:'LOCAL_RELEASE_DECISION_CONSISTENT_NOT_ACTIVATED',reasons:[],
      privateEvidenceAuthenticated:false,productionReleaseVerified:false,
      actualDeploymentAuthorized:false,operationalGo:false,authEligible:false,
      writeEligible:false,runtimeActivated:false,
    });
    const output=JSON.stringify(judge(f.raw,f.trusted,f.release));
    expect(output).not.toContain('EV-synthetic');
    expect(output).not.toContain('TEST ONLY RECEIPT');
    expect(output).not.toContain('sha256:');
  });
  test('NO_GO owner statement fails closed even if correctly signed',()=>{
    const f=fixture();
    const no=f.signed({...f.raw,decision:'NO_GO'});
    expect(judge(no,f.trusted,f.release)).toMatchObject({
      state:'BLOCKED',reasons:['OWNER_NO_GO'],operationalGo:false});
  });
  test('missing/mismatched locally provisioned release identity or scope blocks',()=>{
    const f=fixture();
    expect(judge(f.raw,f.trusted,null).state).toBe('BLOCKED');
    for(const bad of [
      {...f.release,siteScope:'SCOPE-other'},
      {...f.release,sourceCommit:'c'.repeat(40)},
      {...f.release,snapshotId:'SNAP-other'},
      {...f.release,appDigest:D('9')},
      {...f.release,changeRequestId:'CR-other'},
      {...f.release,rollbackMigratorDigest:D('9')},
    ]) expect(judge(f.raw,f.trusted,bad).reasons)
      .toContain('TRUSTED_RELEASE_MISMATCH');
    expect(judge({...f.raw,expectedRelease:f.release},f.trusted,f.release).state)
      .toBe('BLOCKED');
  });
  test('release/Schema/Version/OCI role tampering is blocked even if Owner resigns',()=>{
    const f=fixture();
    for(const altered of [
      {...f.release,schemaId:'unapproved-schema'},
      {...f.release,rollbackSourceCommit:f.release.sourceCommit},
      {...f.release,migratorVersion:'0.99.0'},
      {...f.release,rollbackAppDigest:f.release.appDigest},
      {...f.release,siteScope:'SCOPE-other'},
    ]){
      const changed={...f.raw,release:altered};
      const signature=s35OwnerDecisionSigningBytes(changed);
      if(signature){
        const reSigned=f.signed(changed);
        expect(judge(reSigned,f.trusted,altered).state).toBe('BLOCKED');
      }else expect(judge(changed,f.trusted,f.release).state).toBe('BLOCKED');
    }
  });
  test('role signature substitution, noncanonical base64 or wrong keys block',()=>{
    const f=fixture(),wrong=generateKeyPairSync('ed25519');
    expect(judge({...f.raw,ownerSignature:'fake'},f.trusted,f.release).state)
      .toBe('BLOCKED');
    expect(judge(f.raw,{...f.trusted,owner:wrong.publicKey},f.release).state)
      .toBe('BLOCKED');
    expect(judge(f.raw,{owner:f.trusted.owner,qa:f.trusted.owner},f.release).state)
      .toBe('BLOCKED');
    expect(judge(f.raw,{owner:wrong.privateKey,qa:f.trusted.qa},f.release).state)
      .toBe('BLOCKED');
    expect(judge(f.raw,{},f.release).state).toBe('BLOCKED');
  });
  test('24h max, expiry, approval ordering and future window reject',()=>{
    const f=fixture();
    const operations=[
      {...f.raw.operation,expiresAtUtc:'2026-10-30T00:00:00Z'},
      {...f.raw.operation,expiresAtUtc:'2026-10-28T00:09:00Z'},
      {...f.raw.operation,approvedAtUtc:'2026-10-28T00:11:00Z'},
      {...f.raw.operation,approvedAtUtc:'2026-10-28T00:01:00Z'},
      {...f.raw.operation,notBeforeUtc:'2026-10-28T00:11:00Z'},
      {...f.raw.operation,rollbackOperatorId:f.raw.operation.operatorId},
      {...f.raw.operation,operatorId:'wrong-operator'},
      {...f.raw.operation,approvedAtUtc:'2026-02-31T00:00:00Z'},
    ];
    for(const operation of operations){
      const candidate={...f.raw,operation};
      const bytes=s35OwnerDecisionSigningBytes(candidate);
      const signed=bytes?f.signed(candidate):candidate;
      expect(judge(signed,f.trusted,f.release).state).toBe('BLOCKED');
    }
    expect(judge(f.raw,f.trusted,f.release,'invalid-clock').state).toBe('BLOCKED');
  });
  test('C0 expiry, unknown receipt, swapped snapshot or broken signer block',()=>{
    const f=fixture();
    for(const invalid of [
      {...f.c0,expiresAtUtc:'2026-10-28T00:05:00Z'},
      {...f.c0,signatures:{...f.c0.signatures,qa:f.c0.signatures.owner}},
      {...f.c0,receipts:f.c0.receipts.slice(1)},
      {...f.c0,evidence:{...f.c0.evidence,snapshotId:'SNAP-other'}},
    ]){
      expect(judge({...f.raw,c0ReceiptPacket:invalid},f.trusted,f.release).state)
        .toBe('BLOCKED');
    }
  });
  test('B2 pending cannot be promoted by a signed S3-5 Owner statement',()=>{
    const f=fixture(),key='DB_CAD_S3_SAME_SNAPSHOT';
    const checks={...f.c0.evidence.readiness.checks,[key]:{status:'NOT_RUN'}};
    const records=f.c0.evidence.records.map(rec=>rec.name===key?
      {name:key,status:'NOT_RUN'}:rec);
    const evidence={...f.c0.evidence,readiness:{...f.c0.evidence.readiness,checks},records};
    const c0={...f.c0,evidence};
    const state=judge({...f.raw,c0ReceiptPacket:c0},f.trusted,f.release);
    expect(state.state).toBe('PENDING');
    expect(state.operationalGo).toBe(false);
  });
  test('secret-bearing fields, private URI and arbitrary packet are rejected without reflection',()=>{
    const f=fixture();
    for(const raw of [
      null,{},[],{...f.raw,privateDbPath:'/private/site/db'},
      {...f.raw,operation:{...f.raw.operation,password:'SECRET-TEST'}},
      {...f.raw,release:{...f.raw.release,realRegistryUrl:'https://private.invalid'}},
      {...f.raw,ownerSignature:null},
    ]){
      const out=judge(raw,f.trusted,f.release);
      expect(out.state).toBe('BLOCKED');
      const printable=JSON.stringify(out);
      for(const secret of ['SECRET-TEST','private.invalid','/private/site','EV-synthetic']){
        expect(printable).not.toContain(secret);
      }
    }
  });
});
