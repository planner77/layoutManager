/** Synthetic owned runtime authority and seven-migration SQLite. No site data. */
import { createRequire } from 'node:module';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import packageInfo from '../../package.json' with {type:'json'};
const version=packageInfo.version;
import { G7_S3_CAPABILITY, G7_S3_SCHEMA_ID } from '../../server/g7-operational/preflight';
import { G7_RUNTIME_MIGRATION_CHECKSUMS } from '../../server/g7-operational/runtime-db';
import { G7_RUNTIME_SCOPE, g7RuntimeApprovalSigningBytes,
  type G7RuntimeApproval, type G7RuntimeTrust } from '../../server/g7-operational/runtime-gate';
import { DELETE_PASSWORD_TRIGGER_SQL } from '../../server/delete-password-triggers';
import type { IsolatedDb } from '../../server/g7-staging/g1-store';
const Sqlite = createRequire(import.meta.url)('better-sqlite3') as new (filename:string) => IsolatedDb & {serialize():Buffer};
export function makeG7RuntimeFixture(now = Date.now()) {
  const root = mkdtempSync(path.join(tmpdir(),'cad-g7-runtime-'));chmodSync(root,0o700);
  const cadStoragePath=path.join(root,'cad');mkdirSync(cadStoragePath,{mode:0o700});
  const databasePath = path.join(root,'fixture.sqlite');writeFileSync(databasePath,'',{mode:0o600});
  // Build disposable fixture schema in memory, then persist one complete image.
  // Runtime tests still open the real file; this avoids hundreds of unrelated
  // fixture fsyncs competing with Build/Docker verification.
  const db = new Sqlite(':memory:');
  try {
    db.exec('CREATE TABLE "_prisma_migrations"(id TEXT PRIMARY KEY,migration_name TEXT,checksum TEXT,finished_at INTEGER,rolled_back_at INTEGER)');
    for (const name of Object.keys(G7_RUNTIME_MIGRATION_CHECKSUMS)) {
      const sql = readFileSync(new URL('../../deploy/g7-s3/prisma/migrations/'+name+'/migration.sql',import.meta.url));db.exec(sql.toString('utf8'));
      db.prepare('INSERT INTO "_prisma_migrations" VALUES(?,?,?,?,NULL)').run(randomUUID(),name,createHash('sha256').update(sql).digest('hex'),now);
    }
    for (const statement of DELETE_PASSWORD_TRIGGER_SQL) db.exec(statement);
    db.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run('bu','Synthetic');
    db.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)').run('product','bu','Product');
    for (const site of ['site-a','site-b']) db.prepare('INSERT INTO "CadSite"(id,product_id,name) VALUES(?,?,?)').run(site,'product',site);
    writeFileSync(databasePath,db.serialize(),{mode:0o600});
  } finally { db.close(); }
  const keys = generateKeyPairSync('ed25519');
  const trust: {-readonly [K in keyof G7RuntimeTrust]: G7RuntimeTrust[K]} = {
    schemaVersion:1,ownerPublicKeyPem:keys.publicKey.export({format:'pem',type:'spki'}).toString(),
    release:{capability:G7_S3_CAPABILITY,schemaId:G7_S3_SCHEMA_ID,sourceCommit:'1'.repeat(40),version,
      appDigest:'sha256:'+'a'.repeat(64),migratorDigest:'sha256:'+'b'.repeat(64),rollbackSourceCommit:'2'.repeat(40),
      rollbackAppDigest:'sha256:'+'c'.repeat(64),rollbackMigratorDigest:'sha256:'+'d'.repeat(64)},
    origin:'https://cad.example.test',databasePath,cadStoragePath,siteIds:['site-a'],
  };
  let approval: G7RuntimeApproval = {scope:G7_RUNTIME_SCOPE,schemaVersion:1,decision:'GO',release:trust.release,
    origin:trust.origin,databasePath,cadStoragePath,siteIds:trust.siteIds,scopes:['AUTH','CAD_WRITE'],approvalId:'OWNER-synthetic',
    snapshotId:'SNAP-synthetic',changeRequestId:'CR-synthetic',approvedAtUtc:new Date(now-1000).toISOString(),
    notBeforeUtc:new Date(now-1000).toISOString(),expiresAtUtc:new Date(now+3600000).toISOString(),signature:''};
  const trustPath=path.join(root,'runtime-trust.json'),approvalPath=path.join(root,'runtime-approval.json');
  function writeTrust(value:unknown=trust){writeFileSync(trustPath,JSON.stringify(value),{mode:0o600});}
  function writeApproval(patch:Partial<G7RuntimeApproval>={},signed=true){
    approval={...approval,...patch,signature:''};const bytes=g7RuntimeApprovalSigningBytes(approval);
    approval={...approval,signature:signed&&bytes?sign(null,bytes,keys.privateKey).toString('base64'):'invalid'};
    writeFileSync(approvalPath,JSON.stringify(approval),{mode:0o600});return approval;
  }
  writeTrust();writeApproval();
  const env:Record<string,string|undefined>={NODE_ENV:'production',DATABASE_URL:'file:'+databasePath,CAD_STORAGE_PATH:cadStoragePath,
    G7_AUTH_ENABLED:'true',G7_CAD_WRITE_CUTOVER_ENABLED:'true',G7_RUNTIME_TRUST_PATH:trustPath,G7_RUNTIME_APPROVAL_PATH:approvalPath,
    G7_RELEASE_VERSION:version,G7_RELEASE_CAPABILITY:G7_S3_CAPABILITY,G7_RELEASE_SCHEMA_ID:G7_S3_SCHEMA_ID,
    G7_RELEASE_SOURCE_COMMIT:trust.release.sourceCommit,G7_RELEASE_APP_DIGEST:trust.release.appDigest,G7_RELEASE_MIGRATOR_DIGEST:trust.release.migratorDigest};
  return {root,databasePath,cadStoragePath,env,trust,get approval(){return approval;},keys,trustPath,approvalPath,writeTrust,writeApproval,
    openDb:()=>new Sqlite(databasePath),cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
