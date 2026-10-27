import {afterEach,describe,expect,test} from 'vitest';
import {createRequire} from 'node:module';
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,chmodSync,rmSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {migrations} from '../helpers/database';
import {G7_S3_SCHEMA_ID} from '../../server/g7-operational/preflight';
import {assessS34B23DisposableMigration} from '../../server/g7-operational/s3-4-b2-3';

type SqliteDb={
  exec(sql:string):void;close():void;serialize():Buffer;
  transaction<T>(run:()=>T):()=>T;
  prepare(sql:string):{
    run(...args:(string|number|null)[]):unknown;
    get(...args:(string|number|null)[]):Record<string,unknown>|undefined;
    all(...args:(string|number|null)[]):Record<string,unknown>[];
  };
};
const Sqlite=createRequire(import.meta.url)('better-sqlite3') as new(filename:string)=>SqliteDb;
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const rootDir=path.resolve(process.cwd());
const candidateDir=path.join(rootDir,'deploy/g7-s3/prisma/migrations');
const allNames=[...migrations,G7_S3_SCHEMA_ID];
const sql=(name:string)=>readFileSync(path.join(candidateDir,name,'migration.sql'),'utf8');
const seventh=sql(G7_S3_SCHEMA_ID);
const localId='22222222-2222-4222-8222-222222222222';
const s3Id='33333333-3333-4333-8333-333333333333';
const loc='11111111-1111-4111-8111-111111111111';
const s3ObjectId='66666666-6666-4666-8666-666666666666';
const localBytes=Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n');
const s3Bytes=Buffer.from('SYNTHETIC_S3_EXPORT_DWG');
type Asset={dbVersionId:string;storagePath:string;storage:'local'|'s3';bytes:Buffer};
type Packet={
  scope:string;schemaId:string;snapshotId:string;
  beforeBytes:Buffer;afterBytes:Buffer;assets:Asset[];
};
const dirs:string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
function disposable() {
  const root=mkdtempSync(path.join(tmpdir(),'cad-g7-s3-'));
  dirs.push(root);
  const file=path.join(root,'fixture.sqlite');
  writeFileSync(file,'',{mode:0o600});
  chmodSync(file,0o600);
  writeFileSync(path.join(root,'s3-disposable.json'),JSON.stringify({
    scope:'G7-S3-DISPOSABLE-MIGRATION-TEST',schemaId:G7_S3_SCHEMA_ID,
    databasePath:file,fixtureNonce:randomBytes(16).toString('hex'),
  }),{mode:0o600});
  return {root,file,env:{...process.env,
    G7_S3_MIGRATION_TEST_ONLY:'true',G7_S3_TEST_ROOT:root,
    G7_S3_TEST_DATABASE_URL:'file:'+file,DATABASE_URL:'file:'+file,
    G7_AUTH_ENABLED:'false',G7_CAD_WRITE_CUTOVER_ENABLED:'false'}};
}
function seedCad(db:SqliteDb){
  db.exec('PRAGMA foreign_keys=ON');
  db.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run('bu','Synthetic');
  db.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)')
    .run('p','bu','Product');
  db.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)')
    .run('s','p','Site','SITE');
  db.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)')
    .run('b','s','Building');
  db.prepare('INSERT INTO "CadLocation"(id,building_id,name,next_version) VALUES(?,?,?,?)')
    .run(loc,'b','Floor',3);
  const insert=db.prepare('INSERT INTO "CadFileVersion"'+
    '(id,location_id,version,original_filename,description,delete_password_hash,'+
    'file_format,file_size,sha256,storage_path,registered_at)'+
    ' VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  insert.run(localId,loc,1,'local.dxf','','scrypt$synthetic',
    'DXF',localBytes.length,digest(localBytes),loc+'/'+localId+'/original.dxf','2026-10-27');
  insert.run(s3Id,loc,2,'export.dwg','','scrypt$synthetic',
    'DWG',s3Bytes.length,digest(s3Bytes),
    's3:fixture-bucket:cad/'+s3ObjectId+'/original.dwg','2026-10-27');
  db.prepare('UPDATE "CadLocation" SET current_version_id=? WHERE id=?')
    .run(localId,loc);
}
function fixture(mutator?:(db:SqliteDb)=>void,
  baselineMutator?:(db:SqliteDb)=>void):Packet{
  const db=new Sqlite(':memory:');
  try{
    for(const name of migrations)db.exec(sql(name));
    seedCad(db);
    baselineMutator?.(db);
    const beforeBytes=db.serialize();
    db.exec(seventh);
    mutator?.(db);
    const afterBytes=db.serialize();
    return {scope:'G7-S3-4B2-3-DISPOSABLE-ONLY',
      schemaId:G7_S3_SCHEMA_ID,snapshotId:'SNAP-synthetic-seven',
      beforeBytes,afterBytes,assets:[
        {dbVersionId:localId,storagePath:loc+'/'+localId+'/original.dxf',
          storage:'local',bytes:Buffer.from(localBytes)},
        {dbVersionId:s3Id,
          storagePath:'s3:fixture-bucket:cad/'+s3ObjectId+'/original.dwg',
          storage:'s3',bytes:Buffer.from(s3Bytes)},
      ]};
  }finally{db.close();}
}
function blocked(p:unknown,reason:string){
  const result=assessS34B23DisposableMigration(p);
  expect(result.state,result.reasons.join(',')).toBe('BLOCKED');
  expect(result.reasons).toContain(reason);
  expect(result).toMatchObject({
    actualSourceSnapshotVerified:false,formalPrismaDeployVerified:false,
    provenanceVerified:false,operationalGo:false,runtimeActivated:false,
  });
}
describe('#142 B2-3 isolated seven migration + fault rehearsal (site NO-GO)',()=>{
  test('exact six CAD migration SQL copies match active history and seventh remains quarantined',()=>{
    expect(migrations).toHaveLength(6);
    expect(allNames).toHaveLength(7);
    for(const name of migrations){
      expect(readFileSync(path.join(rootDir,'prisma/migrations',name,'migration.sql'),'utf8'))
        .toBe(sql(name));
    }
    expect(()=>readFileSync(path.join(rootDir,'prisma/migrations',
      G7_S3_SCHEMA_ID,'migration.sql'),'utf8')).toThrow();
  });
  test('formal Prisma CLI applies exactly seven on owned throwaway /tmp, never operating DB',()=>{
    const {file,env}=disposable();
    const cli=path.join(rootDir,'node_modules/prisma/build/index.js');
    const run=spawnSync(process.execPath,
      [cli,'migrate','deploy','--config','deploy/g7-s3/prisma.config.ts'],
      {cwd:rootDir,env,encoding:'utf8',timeout:90000});
    expect(run.status,(run.stderr+run.stdout).slice(-1200)).toBe(0);
    const db=new Sqlite(file);
    try{
      const done=db.prepare('SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY started_at,migration_name').all();
      expect(done).toHaveLength(7);
      expect(new Set(done.map(r=>r.migration_name))).toEqual(new Set(allNames));
      expect(done.every(r=>typeof r.checksum==='string'&&
        /^[0-9a-f]{64}$/.test(r.checksum as string)&&
        r.finished_at!==null&&r.rolled_back_at===null)).toBe(true);
      expect(db.prepare('PRAGMA quick_check').get()?.quick_check).toBe('ok');
      expect(db.prepare('PRAGMA foreign_key_check').all()).toHaveLength(0);
      const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
      for(const name of [
        'User','UserRoleGrant','UserSiteGrant','SpecialGrant',
        'AuthSession','AuditEvent','AdminRecoveryNonce','G3LoginAttempt',
      ])expect(tables.has(name)).toBe(true);
    }finally{db.close();}
  },100000);
  test('six CAD migrations with two CAD copies then seventh preserve Current, Version and SHA',()=>{
    const result=assessS34B23DisposableMigration(fixture());
    expect(result).toMatchObject({
      state:'DISPOSABLE_SEVEN_SCHEMA_INVARIANTS_ONLY',reasons:[],
      cadVersionCount:2,assetBytesChecked:2,authTableCount:8,
      auditAppendOnlyChecked:true,
      actualSourceSnapshotVerified:false,formalPrismaDeployVerified:false,
      provenanceVerified:false,operationalGo:false,runtimeActivated:false,
    });
  });
  test('invalid Local owner or Version path in BOTH snapshots is rejected',()=>{
    for(const malformedPath of [
      s3Id+'/'+localId+'/original.dxf', // wrong Location ID
      loc+'/'+s3Id+'/original.dxf',      // wrong DB Version ID
    ]){
      const p=fixture(undefined,db=>{
        db.prepare('UPDATE "CadFileVersion" SET storage_path=? WHERE id=?')
          .run(malformedPath,localId);
      });
      // Every byte, hash, database row and file locator still agrees
      // across before/after; shape-only checks would return false PASS.
      p.assets[0].storagePath=malformedPath;
      blocked(p,'LOCAL_LOCATOR_OWNER_INVALID');
    }
  });
  test('wrong Local or S3 export bytes are not evidence',()=>{
    const a=fixture();a.assets[0].bytes=Buffer.from('tampered');
    blocked(a,'CAD_BYTES_OR_LOCATOR_MISMATCH');
    const b=fixture();b.assets[1].bytes=Buffer.from('tampered');
    blocked(b,'CAD_BYTES_OR_LOCATOR_MISMATCH');
  });
  test('CAD Version SHA, Current or nextVersion mutation after seventh is blocked',()=>{
    const hash=fixture(db=>db.prepare('UPDATE "CadFileVersion" SET sha256=? WHERE id=?')
      .run('a'.repeat(64),s3Id));
    blocked(hash,'CAD_ROWS_CHANGED');
    const current=fixture(db=>db.prepare('UPDATE "CadLocation" SET current_version_id=? WHERE id=?')
      .run(s3Id,loc));
    blocked(current,'CAD_ROWS_CHANGED');
    const sequence=fixture(db=>db.prepare('UPDATE "CadLocation" SET next_version=? WHERE id=?')
      .run(99,loc));
    blocked(sequence,'CAD_ROWS_CHANGED');
  });
  test('FK breach in a candidate is blocked even if local foreign_keys enforcement is off',()=>{
    const p=fixture(db=>{
      db.exec('PRAGMA foreign_keys=OFF');
      db.prepare('INSERT INTO "UserSiteGrant"(user_id,site_id,granted_at) VALUES(?,?,?)')
        .run('unknown-user','s',0);
    });
    blocked(p,'AFTER_FOREIGN_KEY_VIOLATIONS');
  });
  test('missing Auth table or Audit trigger blocks partial candidate',()=>{
    blocked(fixture(db=>db.exec('DROP TABLE "G3LoginAttempt"')),'AUTH_SCHEMA_INCOMPLETE');
    blocked(fixture(db=>db.exec('DROP TRIGGER "g1_audit_no_delete"')),
      'AUDIT_TRIGGERS_INCOMPLETE');
  });
  test('a forged no-op Audit update trigger is rejected by executable in-memory probe',()=>{
    const p=fixture(db=>db.exec('DROP TRIGGER "g1_audit_no_update";'+
      'CREATE TRIGGER "g1_audit_no_update" BEFORE UPDATE ON "AuditEvent" '+
      'BEGIN SELECT 1; END;'));
    blocked(p,'AUDIT_NOT_APPEND_ONLY');
  });
  test('injected transaction failure in seventh SQL leaves baseline intact',()=>{
    const db=new Sqlite(':memory:');
    try{
      for(const name of migrations)db.exec(sql(name));
      seedCad(db);
      const baseline=db.serialize();
      const interrupted=db.transaction(()=>{
        db.exec(seventh);
        throw new Error('SYNTHETIC_MIGRATION_ABORT');
      });
      expect(interrupted).toThrow('SYNTHETIC_MIGRATION_ABORT');
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='AuditEvent'").get())
        .toBeUndefined();
      // Rollback preserves logical CAD rows; SQLite header counters may
      // legitimately differ after a failed transaction.
      expect(db.prepare('PRAGMA foreign_key_check').all()).toHaveLength(0);
      expect(db.prepare('SELECT COUNT(*) AS n FROM "CadFileVersion"').get()?.n).toBe(2);
      const result=assessS34B23DisposableMigration({
        ...fixture(),beforeBytes:baseline,afterBytes:db.serialize(),
      });
      expect(result.state).toBe('BLOCKED');
      expect(result.reasons).toContain('AUTH_SCHEMA_INCOMPLETE');
    }finally{db.close();}
  });
  test('unexpected path, missing asset or malformed before snapshot cannot be admitted',()=>{
    blocked({...fixture(),operatingDbPath:'/var/lib/cad/prod.sqlite'},'INVALID_DISPOSABLE_PACKET');
    const missing=fixture();missing.assets.pop();
    blocked(missing,'INVALID_DISPOSABLE_PACKET');
    const malformed=fixture();malformed.beforeBytes=Buffer.from('not sqlite');
    blocked(malformed,'INVALID_DISPOSABLE_PACKET');
  });
});
