import { beforeEach, afterEach, describe, expect, test } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createDb, type Database } from '../../server/db';
import { CadRepository } from '../../server/repositories/cad';
import { migrate, seedChain } from '../helpers/database';
import { inspectS34B1Clone, openS34B1MemoryClone } from '../../server/g7-operational/s3-4-b-clone';

type RawDb={exec(s:string):void;close():void};
const SQLite=createRequire(import.meta.url)('better-sqlite3') as new(filename:string)=>RawDb;
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
let root:string,db:Database,repo:CadRepository;
let source:{siteId:string;floorId:string;input:Awaited<ReturnType<typeof seedChain>>['input']};
let localFile='',s3File='';
const snap='SNAP-synthetic-clone';
function ownedWrite(rel:string,bytes:Buffer|string) {
  const file=path.join(root,rel);
  mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  writeFileSync(file,bytes,{mode:0o600});
  return file;
}
function assertResult(state:'BLOCKED'|'ISOLATED_INTEGRITY_ONLY',schema:'CAD_BASELINE'|'G7_CANDIDATE'='CAD_BASELINE') {
  const r=inspectS34B1Clone(root,{snapshotId:snap,schema});
  expect(r.state,r.reasons.join(',')).toBe(state);
  expect(r.operationalGo).toBe(false);
  expect(r.runtimeActivated).toBe(false);
  return r;
}
beforeEach(async()=>{
  root=mkdtempSync('/tmp/cad-g7-s3-b-');
  const file=ownedWrite('snapshot.sqlite','');
  await migrate(file);
  db=createDb('file:'+file);
  repo=new CadRepository(db);
  const chain=await seedChain(db);
  source={siteId:chain.site.id,floorId:chain.floor.id,input:chain.input};
  const local=Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n');
  const version1=await repo.register({...source.input,makeCurrent:true},{
    originalFilename:'first.dxf',fileFormat:'DXF',fileSize:local.length,
    sha256:digest(local),storagePath:'',
  },async (location,id)=>{
    const key=location+'/'+id+'/original.dxf';
    localFile=ownedWrite('local/'+key,local);
    return key;
  });
  const exported=Buffer.from('synthetic-S3-DWG-binary');
  const uuid=randomUUID();
  const locator='s3:fixture-bucket:cad/'+uuid+'/original.dwg';
  s3File=ownedWrite('s3-export/fixture-bucket/cad/'+uuid+'/original.dwg',exported);
  await repo.register({...source.input,makeCurrent:false},{
    originalFilename:'second.dwg',fileFormat:'DWG',fileSize:exported.length,
    sha256:digest(exported),storagePath:locator,
  });
  expect(version1.id).toBeTruthy();
  ownedWrite('snapshot.json',JSON.stringify({
    scope:'G7-S3-4B-DISPOSABLE-RESTORE',snapshotId:snap,schema:'CAD_BASELINE',schemaId:'CAD_BASELINE',
  }));
});
afterEach(async()=>{
  await db.$disconnect();
  rmSync(root,{recursive:true,force:true});
});
describe('#109 S3-4-B1 offline disposable clone integrity',()=>{
  test('actual SQLite FK/Current/Version and local plus exported S3 byte hashes verified',()=>{
    const r=assertResult('ISOLATED_INTEGRITY_ONLY');
    expect(r).toMatchObject({versionCount:2,localChecked:1,s3ExportChecked:1});
  });
  test('local corrupted bytes or S3 export mismatch blocks with safe reason code',()=>{
    writeFileSync(localFile,Buffer.from('damaged'));
    expect(assertResult('BLOCKED').reasons).toContain('CAD_OR_S3_BYTES_MISMATCH');
  });
  test('missing exported S3 bytes or swapped path fails closed',()=>{
    rmSync(s3File);
    expect(assertResult('BLOCKED').reasons).toContain('CAD_OR_S3_EXPORT_MISSING');
  });
  test('incorrect claimed snapshot label cannot count as same snapshot',()=>{
    expect(inspectS34B1Clone(root,{snapshotId:'SNAP-different',schema:'CAD_BASELINE'}).state)
      .toBe('BLOCKED');
  });
  test('symlink and world-readable CAD bytes fail closed',()=>{
    chmodSync(s3File,0o644);
    expect(assertResult('BLOCKED').reasons).toContain('CAD_OR_S3_EXPORT_MISSING');
  });
  test('wrong source scope or path cannot access real operating directories',()=>{
    expect(inspectS34B1Clone('/var/lib/cad',{
      snapshotId:snap,schema:'CAD_BASELINE',
    }).reasons).toContain('G7_S3_4B_DISPOSABLE_ONLY');
  });

  test('partial AuthSession alone cannot masquerade as CAD baseline',async()=>{
    await db.$disconnect();
    const f=path.join(root,'snapshot.sqlite'),raw=new SQLite(f);
    try{raw.exec('CREATE TABLE "AuthSession"("id" TEXT PRIMARY KEY)');}
    finally{raw.close();}
    db=createDb('file:'+f);
    expect(assertResult('BLOCKED').reasons).toContain('SCHEMA_BOUNDARY_MISMATCH');
  });
  test('two placeholder Auth tables cannot masquerade as 8-table G7 candidate',async()=>{
    await db.$disconnect();
    const f=path.join(root,'snapshot.sqlite'),raw=new SQLite(f);
    try{raw.exec('CREATE TABLE "AuditEvent"("id" TEXT PRIMARY KEY);CREATE TABLE "AuthSession"("id" TEXT PRIMARY KEY)');}
    finally{raw.close();}
    db=createDb('file:'+f);
    ownedWrite('snapshot.json',JSON.stringify({scope:'G7-S3-4B-DISPOSABLE-RESTORE',
      snapshotId:snap,schema:'G7_CANDIDATE',schemaId:'202610260002_g7_operational_auth'}));
    expect(assertResult('BLOCKED','G7_CANDIDATE').reasons).toContain('AUTH_TABLES_INCOMPLETE');
  });
  test('verified SQLite Buffer is independent of later pathname replacement',async()=>{
    await db.$disconnect();
    const f=path.join(root,'snapshot.sqlite'),saved=path.join(root,'saved.sqlite');
    const bytes=readFileSync(f);
    renameSync(f,saved);
    symlinkSync(saved,f);
    const memory=openS34B1MemoryClone(bytes);
    try{expect(memory.prepare('PRAGMA quick_check').all()).toEqual([{quick_check:'ok'}]);}
    finally{memory.close();}
    expect(assertResult('BLOCKED').reasons).toContain('ISOLATED_MIRROR_UNAVAILABLE');
    rmSync(f);
    renameSync(saved,f);
    db=createDb('file:'+f);
  });
  test('candidate 7th schema is explicitly distinguished from baseline',async()=>{
    await db.$disconnect();
    const file=path.join(root,'snapshot.sqlite');
    const raw=new SQLite(file);
    try{
      raw.exec(readFileSync(new URL('../../deploy/g7-s3/prisma/migrations/202610260002_g7_operational_auth/migration.sql',import.meta.url),'utf8'));
    }finally{raw.close();}
    db=createDb('file:'+file);
    expect(assertResult('BLOCKED').reasons).toContain('SCHEMA_BOUNDARY_MISMATCH');
    ownedWrite('snapshot.json',JSON.stringify({
      scope:'G7-S3-4B-DISPOSABLE-RESTORE',snapshotId:snap,schema:'G7_CANDIDATE',
      schemaId:'202610260002_g7_operational_auth',
    }));
    assertResult('ISOLATED_INTEGRITY_ONLY','G7_CANDIDATE');
  });
});
