/**
 * #142 / S3-4-B2-1 — locally checks content-addressed OCI image manifests.
 *
 * A supplied file is NOT an authenticated response from a trusted registry:
 * even matching SHA-256s do not prove publication, ownership, signatures,
 * provenance or rollback compatibility. This module never opens a socket,
 * downloads/publishes an image, invokes Docker, reads an operating DB, or
 * activates a G7 runtime route.
 */
import { createHash } from 'node:crypto';
import { G7_S3_CAPABILITY, G7_S3_SCHEMA_ID } from './preflight';

export type S34B2ImageRole = 'app'|'migrator'|'rollbackApp'|'rollbackMigrator';
export type S34B2OfflineArtifact = Readonly<{
  role: S34B2ImageRole;
  immutableRef: string;
  manifestRaw: Buffer;
  configRaw: Buffer;
}>;
export type S34B2OfflineRequest = Readonly<{
  sourceCommit: string;
  version: string;
  rollbackSourceCommit: string;
  rollbackVersion: string;
  artifacts: readonly S34B2OfflineArtifact[];
}>;
export type S34B2OfflineResult = Readonly<{
  state: 'BLOCKED'|'LOCAL_DIGESTS_MATCH_NOT_REGISTRY_PROOF';
  checked: number;
  reasons: readonly string[];
  registryVerified: false;
  provenanceVerified: false;
  rollbackCompatible: false;
  sameSnapshotRestored: false;
  operationalGo: false;
  runtimeActivated: false;
}>;
const ROLES: readonly S34B2ImageRole[] = [
  'app','migrator','rollbackApp','rollbackMigrator',
];
const HEX=/^sha256:[0-9a-f]{64}$/;
const SHA=/^[0-9a-f]{40}$/;
const SEMVER=/^\d+\.\d+\.\d+$/;
const REF=/^ghcr\.io\/planner77\/layoutmanager@(?<digest>sha256:[0-9a-f]{64})$/;
const MAX_MANIFEST=2*1024*1024;
const MAX_CONFIG=2*1024*1024;
const MEDIA=new Set([
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
]);
const CONFIG_MEDIA=new Set([
  'application/vnd.oci.image.config.v1+json',
  'application/vnd.docker.container.image.v1+json',
]);
function shape(x:unknown):x is Record<string,unknown> {
  return x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
}
function sha256(v:Buffer):string {
  return 'sha256:'+createHash('sha256').update(v).digest('hex');
}
function json(raw:Buffer):Record<string,unknown>|null {
  try {const v:unknown=JSON.parse(raw.toString('utf8'));return shape(v)?v:null;}
  catch {return null;}
}
function result(reasons:string[], checked:number):S34B2OfflineResult {
  const codes=[...new Set(reasons)].sort();
  return {
    state:codes.length?'BLOCKED':'LOCAL_DIGESTS_MATCH_NOT_REGISTRY_PROOF',
    checked, reasons:codes, registryVerified:false, provenanceVerified:false,
    rollbackCompatible:false, sameSnapshotRestored:false,
    operationalGo:false, runtimeActivated:false,
  };
}
function validArtifact(x:unknown): x is S34B2OfflineArtifact {
  return shape(x)&&ROLES.includes(x.role as S34B2ImageRole)&&
    typeof x.immutableRef==='string'&&
    Buffer.isBuffer(x.manifestRaw)&&Buffer.isBuffer(x.configRaw);
}
/** Content-addressed local manifest and config identity, not registry proof. */
export function inspectS34B2OfflinePair(request:unknown):S34B2OfflineResult {
  if(!shape(request)||
    Object.keys(request).some(k=>!['sourceCommit','version','rollbackSourceCommit','rollbackVersion','artifacts'].includes(k))||
    typeof request.sourceCommit!=='string'||!SHA.test(request.sourceCommit)||
    typeof request.rollbackSourceCommit!=='string'||!SHA.test(request.rollbackSourceCommit)||
    typeof request.version!=='string'||!SEMVER.test(request.version)||
    typeof request.rollbackVersion!=='string'||!SEMVER.test(request.rollbackVersion)||
    !Array.isArray(request.artifacts)||request.artifacts.length!==4
  ) return result(['INVALID_OFFLINE_PAIR'],0);
  const reasons:string[]=[];
  const artifacts=request.artifacts as unknown[];
  const seen=new Set<string>();
  const digestByRole=new Map<S34B2ImageRole,string>();
  let checked=0;
  for(const artifact of artifacts){
    if(!validArtifact(artifact)){reasons.push('INVALID_ARTIFACT');continue;}
    if(seen.has(artifact.role)){reasons.push('DUPLICATE_ROLE');continue;}
    seen.add(artifact.role);
    const ref=REF.exec(artifact.immutableRef);
    if(!ref||!ref.groups?.digest){reasons.push('IMMUTABLE_DIGEST_REF_REQUIRED');continue;}
    const manifestBytes=artifact.manifestRaw, configBytes=artifact.configRaw;
    if(manifestBytes.length<2||manifestBytes.length>MAX_MANIFEST||
      configBytes.length<2||configBytes.length>MAX_CONFIG){
      reasons.push('INVALID_OCI_BYTE_SIZE');continue;
    }
    const manifest=json(manifestBytes),config=json(configBytes);
    if(!manifest||!config){reasons.push('MALFORMED_OCI_JSON');continue;}
    if(sha256(manifestBytes)!==ref.groups.digest){
      reasons.push('MANIFEST_DIGEST_MISMATCH');continue;
    }
    if(!MEDIA.has(String(manifest.mediaType))||manifest.schemaVersion!==2||
      !shape(manifest.config)||!Array.isArray(manifest.layers)||
      manifest.layers.length===0){
      reasons.push('PLATFORM_MANIFEST_REQUIRED');continue;
    }
    if(!CONFIG_MEDIA.has(String(manifest.config.mediaType))||
      !HEX.test(String(manifest.config.digest))||
      !Number.isSafeInteger(manifest.config.size)||
      manifest.config.size!==configBytes.length||
      manifest.config.digest!==sha256(configBytes)){
      reasons.push('CONFIG_DIGEST_MISMATCH');continue;
    }
    const layerValid=manifest.layers.every(layer=>
      shape(layer)&&HEX.test(String(layer.digest))&&
      Number.isSafeInteger(layer.size)&&Number(layer.size)>0&&
      typeof layer.mediaType==='string');
    if(!layerValid){reasons.push('INVALID_LAYER_DESCRIPTOR');continue;}
    if(config.os!=='linux'||config.architecture!=='amd64'||!shape(config.config)||
      !shape(config.config.Labels)){
      reasons.push('PLATFORM_OR_LABELS_MISSING');continue;
    }
    const labels=config.config.Labels;
    const isRollback=artifact.role.startsWith('rollback');
    const version=isRollback?request.rollbackVersion:request.version;
    const source=isRollback?request.rollbackSourceCommit:request.sourceCommit;
    const schema=isRollback?'CAD_BASELINE':G7_S3_SCHEMA_ID;
    if(labels['org.opencontainers.image.revision']!==source||
       labels['org.opencontainers.image.version']!==version||
       labels['com.planner77.g7.schema-id']!==schema||
       labels['com.planner77.g7.capability']!==(isRollback?'CAD_BASELINE':G7_S3_CAPABILITY)||
       labels['com.planner77.g7.image-role']!==artifact.role){
      reasons.push('IMAGE_IDENTITY_LABEL_MISMATCH');continue;
    }
    digestByRole.set(artifact.role,ref.groups.digest);checked++;
  }
  if(seen.size!==4||ROLES.some(r=>!seen.has(r)))reasons.push('MISSING_IMAGE_ROLE');
  if(digestByRole.size===4){
    const distinct=new Set(digestByRole.values());
    if(distinct.size!==4)reasons.push('IMAGE_DIGEST_REUSED');
  }
  if(request.sourceCommit===request.rollbackSourceCommit&&
    request.version===request.rollbackVersion)reasons.push('ROLLBACK_NOT_DISTINCT');
  return result(reasons,checked);
}
