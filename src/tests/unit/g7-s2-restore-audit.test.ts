import { describe, expect, test, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { writeFileSync, copyFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assessG7OfflineRestore } from '../../scripts/g7-s2-restore-audit.mjs';

const Sqlite = createRequire(import.meta.url)('better-sqlite3') as new
 (filename:string)=>{exec(sql:string):void;close():void};
const roots:string[]=[];
afterEach(()=>{for(const d of roots.splice(0))rmSync(d,{recursive:true,force:true});});
const checksum=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function setup() {
  const root=mkdtempSync(path.join(tmpdir(),'g7-rollback-synthetic-'));
  roots.push(root);
  const src=path.join(root,'source.sqlite'),res=path.join(root,'restore.sqlite');
  const db=new Sqlite(src);
  db.exec('CREATE TABLE "CadLocation" (id TEXT PRIMARY KEY, current_version_id TEXT, next_version INTEGER);');
  db.exec('CREATE TABLE "CadFileVersion" (id TEXT PRIMARY KEY,location_id TEXT,version INTEGER,sha256 TEXT,delete_password_hash TEXT);');
  db.exec("INSERT INTO CadLocation VALUES ('floor-1','v1',2);");
  db.exec("INSERT INTO CadFileVersion VALUES ('v1','floor-1',1,'synthetic_sha','synthetic_delete_hash');");
  db.close();
  copyFileSync(src,res);
  const kinds=['CAD_LOCAL','S3_EXPORTED_BYTES'];
  const files: Array<{kind:string;source:string;restored:string;sha256:string;snapshotId:string}> = [{
    kind:'SQLITE',source:src,restored:res,sha256:checksum(readFileSync(src)),
    snapshotId:'SNAP-LOCAL-001',
  }];
  for(const kind of kinds) {
    const bytes=Buffer.from(kind+'-synthetic-cad-content');
    const p=path.join(root,kind+'-input.dxf'),q=path.join(root,kind+'-restored.dxf');
    writeFileSync(p,bytes);writeFileSync(q,bytes);
    files.push({kind,source:p,restored:q,sha256:checksum(bytes),snapshotId:'SNAP-LOCAL-001'});
  }
  return {schemaVersion:1,snapshotId:'SNAP-LOCAL-001',files};
}
describe('#109 offline snapshot/rollback, synthetic evidence only',()=>{
  test('same-snapshot SQLite+CAD+S3-rehydrated bytes preserve FK/Current/Version/SHA', async()=>{
    const a=await assessG7OfflineRestore(setup());
    expect(a.state).toBe('READY_FOR_PRIVATE_OPERATOR_REVIEW');
    expect(a.checked).toBe(3);
    expect(JSON.stringify(a)).not.toContain('SNAP-LOCAL-001');
  });
  test('tampered S3 exported bytes must be a hard BLOCKED not fake PASS',async()=>{
    const sample=setup();
    writeFileSync(sample.files[2].restored,'altered');
    const result=await assessG7OfflineRestore(sample);
    expect(result.state).toBe('BLOCKED');
    expect(result.reasons).toContain('RESTORE_MISMATCH:S3_EXPORTED_BYTES');
  });
  test('wrong snapshot association is always blocked',async()=>{
    const sample=setup(); sample.files[1].snapshotId='SNAP-MISMATCH';
    expect((await assessG7OfflineRestore(sample)).state).toBe('BLOCKED');
  });
});
