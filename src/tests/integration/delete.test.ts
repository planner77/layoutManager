import { beforeEach, afterEach, test, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createDb, type Database } from '../../server/db';
import { CadRepository } from '../../server/repositories/cad';
import { registration } from '../../domain/cad';
import { hashDeletePassword, verifyDeletePassword } from '../../server/password';
import { backfillDeletePasswords } from '../../server/backfill-delete-passwords';

type SqliteDatabase = { exec(sql: string): void; close(): void; prepare(sql: string): { get(): Record<string, number>; all(): Array<Record<string, unknown>> } };
const BetterSqlite = createRequire(import.meta.url)('better-sqlite3') as new (filename: string) => SqliteDatabase;
let dir:string, db:Database, repo:CadRepository;
const input=registration({businessUnit:'삭제',site:'시험',building:'A',floor:'1',registeredAt:'2026-09-11',makeCurrent:true,deletePassword:'abcd'});
const file=(n:number)=>({originalFilename:`${n}.dxf`,fileFormat:'DXF' as const,fileSize:10,sha256:String(n).repeat(64),storagePath:`${n}/${n}/original.dxf`});
const allMigrations = ['202609070001_locations','202609090001_description','202609110001_delete_password','202609110002_delete_invariants'];
async function migrate(filename: string, migrations = allMigrations) {
  const sqlite = new BetterSqlite(filename);
  try { for(const migration of migrations) sqlite.exec(await readFile(new URL(`../../prisma/migrations/${migration}/migration.sql`,import.meta.url),'utf8')); }
  finally { sqlite.close(); }
}
beforeEach(async()=>{dir=await mkdtemp(path.join(tmpdir(),'cad-delete-'));const filename=`${dir}/db.sqlite`;await migrate(filename);db=createDb(`file:${filename}`);repo=new CadRepository(db)});
afterEach(async()=>{await db.$disconnect();await rm(dir,{recursive:true,force:true})});

test('TC-DELETE-001: hashes are canonical, salted and verify without exposure',async()=>{
  const a=await hashDeletePassword('1234'),b=await hashDeletePassword('1234');
  expect(a).not.toBe(b); expect(await verifyDeletePassword('1234',a)).toBe(true); expect(await verifyDeletePassword('wrong',a)).toBe(false);
  expect(await verifyDeletePassword('1234',`${a}=`)).toBe(false);
  expect(await verifyDeletePassword('1234',a.replace('$v1$', '$v01$'))).toBe(false);
});

test('TC-DELETE-004: wrong password makes zero mutations; correct deletion clears Current and preserves sequence',async()=>{
  const a=await repo.register(input,file(1)); const b=await repo.register({...input,makeCurrent:false},file(2));
  const before={versions:await db.cadFileVersion.count(),jobs:await db.cadDeletionJob.count(),location:await db.cadLocation.findUniqueOrThrow({where:{id:a.locationId}})};
  await expect(repo.deleteVersion(a.id,'wrong')).rejects.toMatchObject({code:'INVALID_DELETE_PASSWORD',status:403});
  expect(await db.cadFileVersion.count()).toBe(before.versions); expect(await db.cadDeletionJob.count()).toBe(before.jobs);
  expect(await db.cadLocation.findUniqueOrThrow({where:{id:a.locationId}})).toEqual(before.location);
  const deleted=await repo.deleteVersion(a.id,'abcd'); expect(deleted).toMatchObject({id:a.id,locationId:a.locationId,wasCurrent:true});
  expect(await db.cadFileVersion.findUnique({where:{id:a.id}})).toBeNull(); expect((await db.cadLocation.findUniqueOrThrow({where:{id:a.locationId}})).currentVersionId).toBeNull();
  const c=await repo.register({...input,makeCurrent:false},file(3)); expect(c.version).toBe(3); expect(await db.cadFileVersion.findUnique({where:{id:b.id}})).not.toBeNull();
});

test('TC-DELETE-006: real 0.16 migrations upgrade and idempotent backfill preserve data and Current identity',async()=>{
  const legacy=`${dir}/legacy.sqlite`, locationId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', firstId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', secondId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await migrate(legacy,['202609070001_locations','202609090001_description']);
  const sqlite=new BetterSqlite(legacy);
  sqlite.exec(`INSERT INTO "CadLocation" (id,business_unit,site,building,floor,current_version_id) VALUES ('${locationId}','BU','SITE','B','1',NULL);
    INSERT INTO "CadFileVersion" (id,location_id,version,original_filename,description,file_format,file_size,sha256,storage_path,registered_at) VALUES
    ('${firstId}','${locationId}',1,'one.dxf','first','DXF',10,'${'1'.repeat(64)}','old/one/original.dxf','2026-09-01'),
    ('${secondId}','${locationId}',2,'two.dxf','second','DXF',20,'${'2'.repeat(64)}','old/two/original.dxf','2026-09-02');
    UPDATE "CadLocation" SET current_version_id='${secondId}' WHERE id='${locationId}';`);
  const before=sqlite.prepare('SELECT id,location_id,version,original_filename,description,file_size,sha256,storage_path,registered_at FROM CadFileVersion ORDER BY version').all();
  for(const migration of ['202609110001_delete_password','202609110002_delete_invariants']) sqlite.exec(await readFile(new URL(`../../prisma/migrations/${migration}/migration.sql`,import.meta.url),'utf8'));
  sqlite.close();
  const legacyDb=createDb(`file:${legacy}`); await backfillDeletePasswords(legacyDb);
  const firstHash=(await legacyDb.cadFileVersion.findUniqueOrThrow({where:{id:firstId}})).deletePasswordHash;
  const secondHash=(await legacyDb.cadFileVersion.findUniqueOrThrow({where:{id:secondId}})).deletePasswordHash;
  expect(firstHash).not.toBe(secondHash); expect(await verifyDeletePassword('1234',firstHash)).toBe(true); expect(await verifyDeletePassword('1234',secondHash)).toBe(true);
  const custom=await hashDeletePassword('custom-password');
  await legacyDb.cadFileVersion.update({where:{id:firstId},data:{deletePasswordHash:custom}});
  await backfillDeletePasswords(legacyDb);
  expect((await legacyDb.cadFileVersion.findUniqueOrThrow({where:{id:firstId}})).deletePasswordHash).toBe(custom);
  expect((await legacyDb.cadFileVersion.findUniqueOrThrow({where:{id:secondId}})).deletePasswordHash).toBe(secondHash);
  const location=await legacyDb.cadLocation.findUniqueOrThrow({where:{id:locationId}}); expect(location.currentVersionId).toBe(secondId); expect(location.nextVersion).toBe(3);
  await legacyDb.$disconnect();
  const verifyDb=new BetterSqlite(legacy); try { expect(verifyDb.prepare('SELECT id,location_id,version,original_filename,description,file_size,sha256,storage_path,registered_at FROM CadFileVersion ORDER BY version').all()).toEqual(before); expect(verifyDb.prepare('PRAGMA foreign_key_check').all()).toEqual([]); } finally { verifyDb.close(); }
});
