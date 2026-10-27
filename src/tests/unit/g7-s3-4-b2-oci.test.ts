import { describe, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { G7_S3_CAPABILITY, G7_S3_SCHEMA_ID } from '../../server/g7-operational/preflight';
import { inspectS34B2OfflinePair, type S34B2ImageRole, type S34B2OfflineArtifact } from '../../server/g7-operational/s3-4-b2-oci';

const hash=(b:Buffer)=>'sha256:'+createHash('sha256').update(b).digest('hex');
const forward='a'.repeat(40),rollback='b'.repeat(40);
const roles:readonly S34B2ImageRole[]=['app','migrator','rollbackApp','rollbackMigrator'];
function artifact(role:S34B2ImageRole):S34B2OfflineArtifact {
  const back=role.startsWith('rollback');
  const configRaw=Buffer.from(JSON.stringify({
    architecture:'amd64',os:'linux',config:{Labels:{
      'org.opencontainers.image.revision':back?rollback:forward,
      'org.opencontainers.image.version':back?'0.42.1':'0.43.0',
      'com.planner77.g7.schema-id':back?'CAD_BASELINE':G7_S3_SCHEMA_ID,
      'com.planner77.g7.capability':back?'CAD_BASELINE':G7_S3_CAPABILITY,
      'com.planner77.g7.image-role':role,
    }},
  }));
  const manifestRaw=Buffer.from(JSON.stringify({
    schemaVersion:2,mediaType:'application/vnd.oci.image.manifest.v1+json',
    config:{mediaType:'application/vnd.oci.image.config.v1+json',
      size:configRaw.length,digest:hash(configRaw)},
    layers:[{mediaType:'application/vnd.oci.image.layer.v1.tar+gzip',
      size:100,digest:hash(Buffer.from('layer-'+role))}],
  }));
  return {role,immutableRef:'ghcr.io/planner77/layoutmanager@'+hash(manifestRaw),
    configRaw,manifestRaw};
}
function fixture(){return {sourceCommit:forward,version:'0.43.0',
  rollbackSourceCommit:rollback,rollbackVersion:'0.42.1',
  artifacts:roles.map(artifact)};}
type SyntheticConfig={ architecture:string; os:string; config:{Labels:Record<string,string>} };
describe('#142 B2-1 offline OCI content-address checking (never registry GO)',()=>{
  test('valid local bytes are only locally consistent, NEVER authoritative registry proof',()=>{
    const r=inspectS34B2OfflinePair(fixture());
    expect(r).toMatchObject({state:'LOCAL_DIGESTS_MATCH_NOT_REGISTRY_PROOF',checked:4,
      registryVerified:false,provenanceVerified:false,rollbackCompatible:false,
      sameSnapshotRestored:false,operationalGo:false,runtimeActivated:false});
  });
  test('mutable tag-only refs, registry substitution and reused digests are blocked',()=>{
    for(const ref of [
      'ghcr.io/planner77/layoutmanager:latest',
      'ghcr.io/planner77/layoutmanager:0.43.0',
      'docker.io/planner77/layoutmanager@sha256:'+'a'.repeat(64),
      'ghcr.io/planner77/layoutmanager@sha256:'+'A'.repeat(64),
    ]){
      const f=fixture(); f.artifacts[0]={...f.artifacts[0],immutableRef:ref};
      expect(inspectS34B2OfflinePair(f).state).toBe('BLOCKED');
    }
  });
  test('changed manifest bytes or changed config bytes fail digest authentication',()=>{
    const f=fixture();
    f.artifacts[0]={...f.artifacts[0],manifestRaw:Buffer.concat([f.artifacts[0].manifestRaw,Buffer.from(' ')])};
    expect(inspectS34B2OfflinePair(f).reasons).toContain('MANIFEST_DIGEST_MISMATCH');
    const f2=fixture();
    f2.artifacts[0]={...f2.artifacts[0],configRaw:Buffer.from('{}')};
    expect(inspectS34B2OfflinePair(f2).reasons).toContain('CONFIG_DIGEST_MISMATCH');
  });
  test('multiarch index instead of selected platform manifest must be rejected',()=>{
    const f=fixture();
    const raw=Buffer.from(JSON.stringify({schemaVersion:2,
      mediaType:'application/vnd.oci.image.index.v1+json',manifests:[]}));
    f.artifacts[0]={...f.artifacts[0],manifestRaw:raw,
      immutableRef:'ghcr.io/planner77/layoutmanager@'+hash(raw)};
    expect(inspectS34B2OfflinePair(f).reasons).toContain('PLATFORM_MANIFEST_REQUIRED');
  });
  test('wrong source, architecture, schema, role labels and absent provenance never pass',()=>{
    for(const mutation of [
      (x:SyntheticConfig)=>{x.architecture='arm64';},
      (x:SyntheticConfig)=>{delete x.config.Labels['com.planner77.g7.schema-id'];},
      (x:SyntheticConfig)=>{x.config.Labels['org.opencontainers.image.revision']='c'.repeat(40);},
      (x:SyntheticConfig)=>{x.config.Labels['com.planner77.g7.image-role']='migrator';},
    ]){
      const f=fixture();
      const original=JSON.parse(f.artifacts[0].configRaw.toString()) as SyntheticConfig;
      mutation(original);
      const configRaw=Buffer.from(JSON.stringify(original));
      const manifest=JSON.parse(f.artifacts[0].manifestRaw.toString());
      manifest.config.digest=hash(configRaw);manifest.config.size=configRaw.length;
      const manifestRaw=Buffer.from(JSON.stringify(manifest));
      f.artifacts[0]={...f.artifacts[0],manifestRaw,configRaw,
        immutableRef:'ghcr.io/planner77/layoutmanager@'+hash(manifestRaw)};
      expect(inspectS34B2OfflinePair(f).state).toBe('BLOCKED');
    }
  });
  test('missing or repeated roles, invalid source and identical rollback are blocked',()=>{
    const f=fixture();f.artifacts[3]={...f.artifacts[0]};
    expect(inspectS34B2OfflinePair(f).state).toBe('BLOCKED');
    expect(inspectS34B2OfflinePair({...fixture(),sourceCommit:'latest'}).state).toBe('BLOCKED');
    expect(inspectS34B2OfflinePair({...fixture(),rollbackVersion:'0.43.0',
      rollbackSourceCommit:forward}).reasons).toContain('ROLLBACK_NOT_DISTINCT');
  });
});
