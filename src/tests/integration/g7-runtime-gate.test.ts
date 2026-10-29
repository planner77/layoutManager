import { afterEach, describe, expect, test } from 'vitest';
import { chmodSync, readFileSync, mkdirSync, unlinkSync, writeFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolveG7RuntimeGate, resolveG7RuntimeMigrationAuthority } from '../../server/g7-operational/runtime-gate';
import { makeG7RuntimeFixture } from '../helpers/g7-runtime';
const fixtures:ReturnType<typeof makeG7RuntimeFixture>[]=[];
const fixture=()=>{const f=makeG7RuntimeFixture();fixtures.push(f);return f;};
afterEach(()=>{for(const f of fixtures.splice(0))f.cleanup();});
const blocked=(f:ReturnType<typeof fixture>)=>expect(resolveG7RuntimeGate(f.env)).toMatchObject({state:'BLOCKED',authEnabled:false,cadWriteEnabled:false});
describe('#153 signed Owner Managed runtime gate',()=>{
 test('HOLD protects legacy OFF writes and signed migration authority never bypasses HTTP schema',()=>{
  const f=fixture();f.env.G7_AUTH_ENABLED='false';f.env.G7_CAD_WRITE_CUTOVER_ENABLED='false';
  f.writeApproval({scopes:['AUTH','MIGRATION']});
  expect(resolveG7RuntimeMigrationAuthority(f.env)).toMatchObject({state:'ACTIVE',scopes:['AUTH','MIGRATION']});
  const db=f.openDb();db.exec('DROP TRIGGER g1_audit_no_update');db.close();
  expect(resolveG7RuntimeMigrationAuthority(f.env)).toMatchObject({state:'ACTIVE'});
  expect(resolveG7RuntimeGate({...f.env,G7_AUTH_ENABLED:'true'})).toMatchObject({state:'BLOCKED'});
  writeFileSync(path.join(f.root,'g7-runtime-hold.json'),'{}',{mode:0o600});
  expect(resolveG7RuntimeGate({DATABASE_URL:f.env.DATABASE_URL})).toMatchObject({state:'BLOCKED'});
  expect(resolveG7RuntimeMigrationAuthority({...f.env,G7_AUTH_ENABLED:'true'})).toMatchObject({state:'BLOCKED'});
 });
 test('FIFO authority is rejected without blocking request execution',()=>{
  const f=fixture();unlinkSync(f.approvalPath);
  expect(spawnSync('mkfifo',[f.approvalPath]).status).toBe(0);chmodSync(f.approvalPath,0o600);
  const script="import {resolveG7RuntimeGate} from './server/g7-operational/runtime-gate.ts';process.exit(resolveG7RuntimeGate(process.env).state==='BLOCKED'?0:1)";
  const child=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script],
    {cwd:process.cwd(),env:{...process.env,...f.env},encoding:'utf8',timeout:5000});
  expect(child.status,child.error?.message??child.stderr).toBe(0);
 });
 test('CAD path is signed independently, configured exactly and stays owned canonical storage',()=>{
  const f=fixture();f.env.CAD_STORAGE_PATH=path.join(f.root,'other');blocked(f);f.env.CAD_STORAGE_PATH=f.cadStoragePath;
  f.writeApproval({cadStoragePath:f.root});blocked(f);f.writeApproval({cadStoragePath:f.cadStoragePath});
  chmodSync(f.cadStoragePath,0o777);blocked(f);chmodSync(f.cadStoragePath,0o700);
  const other=path.join(f.root,'other-cad');mkdirSync(other,{mode:0o700});
  f.writeTrust({...f.trust,cadStoragePath:other});f.env.CAD_STORAGE_PATH=other;blocked(f);
  f.writeApproval({cadStoragePath:other});expect(resolveG7RuntimeGate(f.env)).toMatchObject({state:'ACTIVE',cadStoragePath:other});
 });
 test('internal HTTP requires explicit opt-in and FK corruption remains blocked',()=>{
  const f=fixture();f.trust.origin='http://127.0.0.1:3456';f.writeTrust();f.writeApproval({origin:f.trust.origin});blocked(f);
  f.env.G7_RUNTIME_ALLOW_HTTP='true';expect(resolveG7RuntimeGate(f.env)).toMatchObject({state:'ACTIVE'});
  const db=f.openDb();db.exec("PRAGMA foreign_keys=OFF;INSERT INTO UserSiteGrant(user_id,site_id,granted_at) VALUES('missing','site-a',0)");db.close();blocked(f);
 });

 test('default OFF; env alone cannot activate; malformed switches fail closed',()=>{
  expect(resolveG7RuntimeGate({})).toMatchObject({state:'OFF'});
  for(const env of [{G7_AUTH_ENABLED:'true'},{G7_AUTH_ENABLED:'TRUE'},{G7_CAD_WRITE_CUTOVER_ENABLED:'true'}])expect(resolveG7RuntimeGate(env)).toMatchObject({state:'BLOCKED'});
 });
 test('seven real SQL schemas and signed exact release activate production AUTH/write separately',()=>{
  const f=fixture();expect(resolveG7RuntimeGate(f.env)).toMatchObject({state:'ACTIVE',authEnabled:true,cadWriteEnabled:true,siteIds:['site-a']});
  f.env.G7_CAD_WRITE_CUTOVER_ENABLED='false';f.writeApproval({scopes:['AUTH']});expect(resolveG7RuntimeGate(f.env)).toMatchObject({state:'ACTIVE',cadWriteEnabled:false});
  f.env.G7_CAD_WRITE_CUTOVER_ENABLED='true';blocked(f);
 });
 test('expiry, future, over24h, revoked decision and recovery disable per request',()=>{
  const f=fixture(),now=Date.now();expect(resolveG7RuntimeGate(f.env)).toMatchObject({state:'ACTIVE'});
  expect(resolveG7RuntimeGate(f.env,Date.parse(f.approval.expiresAtUtc))).toMatchObject({state:'BLOCKED'});
  expect(resolveG7RuntimeGate(f.env,now-3600000)).toMatchObject({state:'BLOCKED'});
  f.writeApproval({expiresAtUtc:new Date(now+86400001).toISOString()});blocked(f);
  f.writeApproval({expiresAtUtc:new Date(now+3600000).toISOString(),decision:'NO_GO'});blocked(f);
  f.writeApproval({decision:'GO'});f.env.G7_RUNTIME_RECOVERY_MODE='true';blocked(f);
 });
 test('unsigned mutation, attacker trust key and missing authorities denied',()=>{
  const f=fixture(),raw=JSON.parse(readFileSync(f.approvalPath,'utf8'));raw.siteIds=['site-b'];writeFileSync(f.approvalPath,JSON.stringify(raw));blocked(f);
  f.writeApproval();const other=generateKeyPairSync('ed25519');f.writeTrust({...f.trust,ownerPublicKeyPem:other.publicKey.export({format:'pem',type:'spki'}).toString()});blocked(f);
  f.writeTrust();unlinkSync(f.approvalPath);blocked(f);
 });
 test('source/digest/version/schema/database/site/origin must match trusted release',()=>{
  for(const key of ['G7_RELEASE_SOURCE_COMMIT','G7_RELEASE_APP_DIGEST','G7_RELEASE_VERSION','G7_RELEASE_SCHEMA_ID','DATABASE_URL']){const f=fixture();f.env[key]='mismatch';blocked(f);}
  const f=fixture();f.writeApproval({siteIds:['site-b']});blocked(f);f.writeApproval({siteIds:['site-a'],origin:'https://other.example.test'});blocked(f);
  f.writeApproval({origin:f.trust.origin,release:{...f.trust.release,rollbackAppDigest:f.trust.release.appDigest}});blocked(f);
 });
 test('unsafe mode, symlink and sibling recovery hold cannot activate',()=>{
  const f=fixture();chmodSync(f.approvalPath,0o644);blocked(f);chmodSync(f.approvalPath,0o600);chmodSync(f.databasePath,0o644);blocked(f);chmodSync(f.databasePath,0o600);
  const copy=path.join(f.root,'approval-copy.json');writeFileSync(copy,readFileSync(f.approvalPath),{mode:0o600});unlinkSync(f.approvalPath);symlinkSync(copy,f.approvalPath);blocked(f);unlinkSync(f.approvalPath);f.writeApproval();
  writeFileSync(path.join(f.root,'g7-runtime-hold.json'),'{}',{mode:0o600});blocked(f);
 });
 test('missing/failed/forged history and weakened audit triggers rejected',()=>{
  for(const sql of ["DELETE FROM _prisma_migrations WHERE migration_name='202610260002_g7_operational_auth'","UPDATE _prisma_migrations SET finished_at=NULL WHERE migration_name='202610260002_g7_operational_auth'","UPDATE _prisma_migrations SET checksum='forged' WHERE migration_name='202610260002_g7_operational_auth'",'DROP TRIGGER g1_audit_no_delete','DROP TRIGGER g1_audit_no_update;CREATE TRIGGER g1_audit_no_update BEFORE UPDATE ON AuditEvent BEGIN SELECT 1;END']){const f=fixture(),db=f.openDb();db.exec(sql);db.close();blocked(f);}
 });
 test('runtime schema requires the two exact delete-password backfill triggers',()=>{
  for(const sql of [
    'DROP TRIGGER cad_version_delete_password_insert',
    'DROP TRIGGER cad_version_delete_password_update',
    'DROP TRIGGER cad_version_delete_password_insert; CREATE TRIGGER cad_version_delete_password_insert BEFORE INSERT ON CadFileVersion BEGIN SELECT 1; END',
    'DROP TRIGGER cad_version_delete_password_update; CREATE TRIGGER cad_version_delete_password_update BEFORE UPDATE OF delete_password_hash ON CadFileVersion BEGIN SELECT 1; END',
  ]){
    const f=fixture(),db=f.openDb();db.exec(sql);db.close();blocked(f);
  }
 });
 test('runtime schema rejects extra table, index and trigger including on migration history',()=>{
  for(const sql of [
    'CREATE TABLE unexpected_schema(id TEXT)',
    'CREATE INDEX unexpected_history_index ON _prisma_migrations(checksum)',
    'CREATE TRIGGER unexpected_history_trigger BEFORE UPDATE ON _prisma_migrations BEGIN SELECT 1; END',
  ]){
    const f=fixture(),db=f.openDb();db.exec(sql);db.close();blocked(f);
  }
 });
 test('missing approved site, preview runtime conflict and auth switch-down fail closed',()=>{
  const f=fixture(),db=f.openDb();db.exec("DELETE FROM CadSite WHERE id='site-a'");db.close();blocked(f);
  const g=fixture();g.env.G7_S3_AUTH_API_PREVIEW_ONLY='true';blocked(g);g.env.G7_S3_AUTH_API_PREVIEW_ONLY='false';g.env.G7_STAGING_ONLY='true';blocked(g);g.env.G7_STAGING_ONLY='false';g.env.G7_AUTH_ENABLED='false';blocked(g);
 });
});
