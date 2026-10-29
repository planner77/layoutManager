/** Greenfield runtime authority: binds an initial installation to its own
 * release, exact database, Site scope and Owner signature. There are no old
 * DB, rollback OCI, HOLD-epoch or snapshot fields in this contract.
 */
import { constants, openSync, closeSync, fstatSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { createPublicKey, verify } from 'node:crypto';
import packageInfo from '../../package.json' with {type:'json'};
import { G7_GREENFIELD_CAPABILITY, G7_GREENFIELD_SCHEMA_ID, assertG7GreenfieldSchema } from './greenfield-schema';
import { openG7RuntimeDb } from './runtime-db';
import type { G7RuntimeGate } from './runtime-gate';

export const G7_GREENFIELD_SCOPE='G7-GREENFIELD-RUNTIME-V1' as const;
const DAY=86400000;
const releaseKeys=['capability','schemaId','sourceCommit','version','appDigest','migratorDigest'] as const;
type Release=Readonly<Record<typeof releaseKeys[number],string>>;
export type GreenfieldTrust=Readonly<{schemaVersion:1;ownerPublicKeyPem:string;release:Release;
  origin:string;databasePath:string;cadStoragePath:string;siteIds:readonly string[]}>;
export type GreenfieldApproval=Readonly<{scope:typeof G7_GREENFIELD_SCOPE;schemaVersion:1;decision:'GO'|'NO_GO';
  release:Release;origin:string;databasePath:string;cadStoragePath:string;siteIds:readonly string[];
  scopes:readonly ('AUTH'|'CAD_WRITE')[];approvalId:string;changeRequestId:string;
  approvedAtUtc:string;notBeforeUtc:string;expiresAtUtc:string;signature:string}>;
const denied=(reason:string):G7RuntimeGate=>({state:'BLOCKED',authEnabled:false,cadWriteEnabled:false,reasons:[reason]});
function exact(v:unknown,keys:readonly string[]):v is Record<string,unknown> {
  return v!==null && typeof v==='object' && !Array.isArray(v) &&
    Object.keys(v).length===keys.length && keys.every(k=>Object.hasOwn(v,k));
}
function release(v:unknown):v is Release {
  return exact(v,releaseKeys) && v.capability===G7_GREENFIELD_CAPABILITY &&
    v.schemaId===G7_GREENFIELD_SCHEMA_ID &&
    typeof v.version==='string' && /^\d+\.\d+\.\d+$/.test(v.version) &&
    typeof v.sourceCommit==='string' && /^[a-f0-9]{40}$/.test(v.sourceCommit) &&
    [v.appDigest,v.migratorDigest].every(x=>typeof x==='string'&&/^sha256:[a-f0-9]{64}$/.test(x)) &&
    v.appDigest!==v.migratorDigest;
}
function siteIds(v:unknown):v is readonly string[] {
  return Array.isArray(v) && v.length>0 && v.length<=100 &&
    v.every(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x)) &&
    new Set(v).size===v.length && JSON.stringify(v)===JSON.stringify([...v].sort());
}
function utc(v:unknown):v is string {
  return typeof v==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) &&
    Number.isFinite(Date.parse(v)) && new Date(v).toISOString()===v;
}
const approvalKeys=['scope','schemaVersion','decision','release','origin','databasePath','cadStoragePath',
  'siteIds','scopes','approvalId','changeRequestId','approvedAtUtc','notBeforeUtc','expiresAtUtc','signature'];
function approval(v:unknown):v is GreenfieldApproval {
  return exact(v,approvalKeys) && v.scope===G7_GREENFIELD_SCOPE && v.schemaVersion===1 &&
    (v.decision==='GO'||v.decision==='NO_GO') && release(v.release) && siteIds(v.siteIds) &&
    typeof v.origin==='string' && typeof v.databasePath==='string' && typeof v.cadStoragePath==='string' &&
    (JSON.stringify(v.scopes)==='["AUTH"]' || JSON.stringify(v.scopes)==='["AUTH","CAD_WRITE"]') &&
    typeof v.approvalId==='string' && /^OWNER-[A-Za-z0-9_-]{2,64}$/.test(v.approvalId) &&
    typeof v.changeRequestId==='string' && /^CR-[A-Za-z0-9_-]{2,64}$/.test(v.changeRequestId) &&
    utc(v.approvedAtUtc) && utc(v.notBeforeUtc) && utc(v.expiresAtUtc) && typeof v.signature==='string';
}
export function greenfieldApprovalSigningBytes(v:unknown):Buffer|null {
  if(!approval(v))return null;
  return Buffer.from(JSON.stringify([G7_GREENFIELD_SCOPE,1,v.decision,
    releaseKeys.map(k=>v.release[k]),v.origin,v.databasePath,v.cadStoragePath,v.siteIds,v.scopes,
    v.approvalId,v.changeRequestId,v.approvedAtUtc,v.notBeforeUtc,v.expiresAtUtc]));
}
function readPrivateJson(filename:string|undefined):unknown {
  if(!filename||!path.isAbsolute(filename)||realpathSync(filename)!==filename)throw new Error();
  const parent=lstatSync(path.dirname(filename));
  if(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==process.getuid?.() ||
     (parent.mode&0o077)!==0)throw new Error();
  const fd=openSync(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const stat=fstatSync(fd);
    if(!stat.isFile()||stat.uid!==process.getuid?.()||(stat.mode&0o077)!==0||
      stat.nlink!==1||stat.size<2||stat.size>32768)throw new Error();
    const bytes=readFileSync(fd);
    if(bytes.length!==stat.size)throw new Error();
    return JSON.parse(bytes.toString('utf8'));
  }finally{closeSync(fd);}
}
export function resolveG7GreenfieldGate(
  env:Readonly<Record<string,string|undefined>>,now=Date.now(),
):G7RuntimeGate {
  if(env.G7_GREENFIELD_MODE!=='true')return denied('GREENFIELD_MODE_REQUIRED');
  for(const k of ['G7_AUTH_ENABLED','G7_CAD_WRITE_CUTOVER_ENABLED','G7_RUNTIME_ALLOW_HTTP',
    'G7_RUNTIME_RECOVERY_MODE']) {
    if(env[k]!==undefined&&env[k]!=='true'&&env[k]!=='false')return denied('INVALID_RUNTIME_SWITCH');
  }
  if(env.G7_RUNTIME_RECOVERY_MODE==='true')return denied('RUNTIME_RECOVERY_HOLD');
  if(env.G7_AUTH_ENABLED!=='true') {
    if(env.G7_CAD_WRITE_CUTOVER_ENABLED==='true'||env.G7_RUNTIME_TRUST_PATH||
       env.G7_RUNTIME_APPROVAL_PATH)return denied('AUTH_REQUIRED');
    return {state:'OFF',authEnabled:false,cadWriteEnabled:false};
  }
  if(['G7_S3_AUTH_API_PREVIEW_ONLY','G7_S3_CAD_PREVIEW_ONLY','G7_STAGING_ENABLED',
      'G7_STAGING_ONLY'].some(k=>env[k]==='true'))return denied('PREVIEW_RUNTIME_CONFLICT');
  if(!Number.isSafeInteger(now))return denied('INVALID_RUNTIME_TIME');
  try{
    if(!env.G7_RUNTIME_TRUST_PATH||env.G7_RUNTIME_TRUST_PATH===env.G7_RUNTIME_APPROVAL_PATH)throw new Error();
    const trust=readPrivateJson(env.G7_RUNTIME_TRUST_PATH),raw=readPrivateJson(env.G7_RUNTIME_APPROVAL_PATH);
    if(!exact(trust,['schemaVersion','ownerPublicKeyPem','release','origin','databasePath',
       'cadStoragePath','siteIds']) || trust.schemaVersion!==1 ||
       typeof trust.ownerPublicKeyPem!=='string'||!release(trust.release)||!siteIds(trust.siteIds)||
       typeof trust.origin!=='string'||typeof trust.databasePath!=='string'||
       typeof trust.cadStoragePath!=='string'||!approval(raw))
      return denied('GREENFIELD_CONTRACT_INVALID');
    // Narrow the independently validated release objects before a callback
    // iterates their keys. Keep signed/trusted fields byte-exact.
    const trustedRelease=trust.release;
    const signedRelease=raw.release;
    if(trustedRelease.version!==packageInfo.version ||
      env.G7_RELEASE_VERSION!==trustedRelease.version ||
      env.G7_RELEASE_CAPABILITY!==trustedRelease.capability ||
      env.G7_RELEASE_SCHEMA_ID!==trustedRelease.schemaId ||
      env.G7_RELEASE_SOURCE_COMMIT!==trustedRelease.sourceCommit ||
      env.G7_RELEASE_APP_DIGEST!==trustedRelease.appDigest ||
      env.G7_RELEASE_MIGRATOR_DIGEST!==trustedRelease.migratorDigest ||
      releaseKeys.some(k=>trustedRelease[k]!==signedRelease[k]) ||
      raw.origin!==trust.origin||raw.databasePath!==trust.databasePath||
      raw.cadStoragePath!==trust.cadStoragePath||
      JSON.stringify(raw.siteIds)!==JSON.stringify(trust.siteIds)||
      env.DATABASE_URL!=='file:'+trust.databasePath ||
      env.CAD_STORAGE_PATH!==trust.cadStoragePath)
      return denied('GREENFIELD_RELEASE_BINDING');
    if(!path.isAbsolute(trust.databasePath)||!path.isAbsolute(trust.cadStoragePath)||
       realpathSync(trust.databasePath)!==trust.databasePath||
       realpathSync(trust.cadStoragePath)!==trust.cadStoragePath)
      return denied('GREENFIELD_STORAGE_BINDING');
    const db=lstatSync(trust.databasePath),dir=lstatSync(path.dirname(trust.databasePath)),cad=lstatSync(trust.cadStoragePath);
    if(!db.isFile()||db.isSymbolicLink()||db.uid!==process.getuid?.()||(db.mode&0o077)!==0||db.nlink!==1||
       !dir.isDirectory()||dir.isSymbolicLink()||dir.uid!==process.getuid?.()||(dir.mode&0o022)!==0||
       !cad.isDirectory()||cad.isSymbolicLink()||cad.uid!==process.getuid?.()||(cad.mode&0o022)!==0||
       trust.databasePath===trust.cadStoragePath||
       trust.databasePath.startsWith(trust.cadStoragePath+path.sep))
      return denied('GREENFIELD_STORAGE_BINDING');
    const origin=new URL(trust.origin);
    if(origin.origin!==trust.origin||origin.username||origin.password||
      (origin.protocol!=='https:'&&!(origin.protocol==='http:'&&env.G7_RUNTIME_ALLOW_HTTP==='true')))
      return denied('GREENFIELD_ORIGIN_INVALID');
    const key=createPublicKey(trust.ownerPublicKeyPem);
    const bytes=greenfieldApprovalSigningBytes(raw);
    if(key.asymmetricKeyType!=='ed25519'||!bytes||!/^[A-Za-z0-9+/]{86}==$/.test(raw.signature)||
       Buffer.from(raw.signature,'base64').toString('base64')!==raw.signature||
       !verify(null,bytes,key,Buffer.from(raw.signature,'base64')))
      return denied('GREENFIELD_SIGNATURE_INVALID');
    const approved=Date.parse(raw.approvedAtUtc),start=Date.parse(raw.notBeforeUtc),end=Date.parse(raw.expiresAtUtc);
    if(raw.decision!=='GO'||approved>start||start>=end||end-approved>DAY||now<start||now>=end)
      return denied('GREENFIELD_APPROVAL_INACTIVE');
    const write=env.G7_CAD_WRITE_CUTOVER_ENABLED==='true';
    if(!raw.scopes.includes('AUTH')||(write&&!raw.scopes.includes('CAD_WRITE')))
      return denied('GREENFIELD_SCOPE_DENIED');
    const gate={state:'ACTIVE' as const,authEnabled:true as const,cadWriteEnabled:write,
      schemaMode:'GREENFIELD' as const,
      origin:trust.origin,databasePath:trust.databasePath,cadStoragePath:trust.cadStoragePath,
      siteIds:[...trust.siteIds],expiresAt:end,approvalId:raw.approvalId,snapshotId:'',
      changeRequestId:raw.changeRequestId,scopes:[...raw.scopes]};
    const opened=openG7RuntimeDb(gate,true);
    try{
      // The common runtime used to accept legacy 7-migration Schema. This
      // authority MUST never validate against the legacy branch.
      assertG7GreenfieldSchema(opened);
      const extra=opened.prepare('SELECT id FROM "CadSite" ORDER BY id').all() as {id:string}[];
      if(extra.length!==gate.siteIds.length ||
          JSON.stringify(extra.map(x=>x.id))!==JSON.stringify(gate.siteIds))
        return denied('GREENFIELD_SITE_SCOPE');
    }finally{opened.close();}
    return gate;
  }catch{return denied('GREENFIELD_AUTHORITY_UNAVAILABLE');}
}
