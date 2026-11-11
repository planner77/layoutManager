import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';
import {encryptFile,decryptFile,validateArchive} from '../../scripts/recovery-local.mjs';

const helper=fileURLToPath(new URL('../../scripts/recovery-local-volume.mjs',import.meta.url));
const sha=x=>createHash('sha256').update(x).digest('hex');
const roots=[];
function temp(){const p=fs.mkdtempSync(path.join(os.tmpdir(),'r283-test-'));roots.push(p);return p;}
test.after(()=>{for(const p of roots)fs.rmSync(p,{recursive:true,force:true});});
function fixture(){const root=temp();fs.mkdirSync(path.join(root,'db'),{mode:0o700});fs.mkdirSync(path.join(root,'cad'),{mode:0o700});
  const db=new Database(path.join(root,'db/cad.sqlite'));db.exec('CREATE TABLE TestRow(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO TestRow(value) VALUES (\'secret-value\')');db.close();
  fs.writeFileSync(path.join(root,'db/g7-install.json'),JSON.stringify({version:'0.61.0',schemaId:'G7-test',installId:'synthetic'}),{mode:0o600});
  fs.writeFileSync(path.join(root,'cad/a.dxf'),Buffer.from('CAD-PRIVATE'),{mode:0o600});
  fs.writeFileSync(path.join(root,'cad/empty.dxf'),Buffer.alloc(0),{mode:0o600});return root;}
function storageFixture(){const root=fixture(),db=new Database(path.join(root,'db/cad.sqlite'));
  const loc='11111111-1111-4111-8111-111111111111',version='22222222-2222-4222-8222-222222222222',
    asset='33333333-3333-4333-8333-333333333333',cadPath=`${loc}/${version}/original.dxf`,scenePath=`scenes/${asset}.json`;
  const cad=Buffer.from('VALID CAD'),scene=Buffer.from('{"scene":1}');
  fs.mkdirSync(path.join(root,'cad',loc,version),{recursive:true,mode:0o700});
  fs.mkdirSync(path.join(root,'cad/scenes'),{mode:0o700});
  fs.writeFileSync(path.join(root,'cad',cadPath),cad,{mode:0o600});
  fs.writeFileSync(path.join(root,'cad',scenePath),scene,{mode:0o600});
  db.exec('CREATE TABLE CadFileVersion(id TEXT,storage_path TEXT,file_size INTEGER,sha256 TEXT); CREATE TABLE SceneAsset(id TEXT,storage_locator TEXT,byte_length INTEGER,digest TEXT); CREATE TABLE CadDeletionJob(storage_path TEXT); CREATE TABLE SceneOrphanJob(storage_locator TEXT); CREATE TABLE SceneBuildJob(status TEXT); CREATE TABLE CurrentScene(version_id TEXT)');
  db.prepare('INSERT INTO CadFileVersion VALUES(?,?,?,?)').run(version,cadPath,cad.length,sha(cad));
  db.prepare('INSERT INTO SceneAsset VALUES(?,?,?,?)').run(asset,scenePath,scene.length,sha(scene));
  db.prepare('INSERT INTO SceneBuildJob VALUES(?)').run('READY');db.prepare('INSERT INTO CurrentScene VALUES(?)').run(version);
  db.close();return {root,cadPath,scenePath,cad,scene};}
function volume(root,action,input){return spawnSync(process.execPath,[helper,action],{input,env:{...process.env,RECOVERY283_TEST_ROOT:root},cwd:path.dirname(path.dirname(helper)),maxBuffer:16*1024*1024});}
async function collect(iter){const list=[];for await(const b of iter)list.push(b);return Buffer.concat(list);}
test('source scan, bounded bundle, isolated restore and DB logical equality',async()=>{
  const source=fixture(),before=volume(source,'scan');assert.equal(before.status,0,before.stderr.toString());
  const emitted=volume(source,'emit');assert.equal(emitted.status,0,emitted.stderr.toString());
  const header=JSON.parse(emitted.stdout.subarray(0,emitted.stdout.indexOf(10)).toString());
  assert.equal(header.logical.tables.find(t=>t.name==='TestRow').count,1);
  const target=temp(),restored=volume(target,'receive',emitted.stdout);
  assert.equal(restored.status,0,restored.stderr.toString());
  assert.deepEqual(JSON.parse(volume(target,'scan').stdout),JSON.parse(before.stdout));
  assert.equal(fs.readFileSync(path.join(target,'cad/a.dxf')).toString(),'CAD-PRIVATE');
  assert.equal(fs.statSync(path.join(target,'cad/empty.dxf')).size,0);
  assert.notEqual(volume(target,'receive',emitted.stdout).status,0,'nonempty target must fail');
});
test('authenticated archive and settings reject wrong key, tampering, and bad member paths',async()=>{
  const dir=temp(),key=randomBytes(32),plain=Buffer.from('private settings'),cipher=path.join(dir,'settings.gcm');
  await encryptFile([plain],key,cipher,'plan:settings');
  assert.deepEqual(await collect(decryptFile(cipher,key,'plan:settings')),plain);
  await assert.rejects(()=>collect(decryptFile(cipher,randomBytes(32),'plan:settings')));
  const bytes=fs.readFileSync(cipher);bytes[25]^=1;fs.writeFileSync(cipher,bytes,{mode:0o600});
  await assert.rejects(()=>collect(decryptFile(cipher,key,'plan:settings')));
  for(const bad of ['../escape','/absolute','cad//bad','cad/./bad']){
    const payload=Buffer.from('x');const b=Buffer.from(JSON.stringify({format:'RECOVERY283-V1',files:[{path:bad,size:1,sha256:sha(payload)}],logical:{}})+'\n');
    const archive=path.join(dir,'archive-'+sha(bad)+'.gcm');await encryptFile([b,payload],key,archive,'plan:archive');
    await assert.rejects(()=>validateArchive(archive,key,'plan:archive'));
  }
});
test('truncated, duplicate, hash mismatch and symlink source are rejected',async()=>{
  const source=fixture(),emitted=volume(source,'emit');assert.equal(emitted.status,0);
  assert.notEqual(volume(temp(),'receive',emitted.stdout.subarray(0,-1)).status,0);
  fs.symlinkSync('/etc/passwd',path.join(source,'cad/link'));
  assert.notEqual(volume(source,'scan').status,0);
  const dir=temp(),key=randomBytes(32),f=path.join(dir,'a.gcm');
  const e={path:'a',size:1,sha256:sha('x')};
  await encryptFile([Buffer.from(JSON.stringify({format:'RECOVERY283-V1',files:[e,e],logical:{}})+'\nxx')],key,f,'aad');
  await assert.rejects(()=>validateArchive(f,key,'aad'));
  const f2=path.join(dir,'b.gcm');
  await encryptFile([Buffer.from(JSON.stringify({format:'RECOVERY283-V1',files:[e],logical:{}})+'\ny')],key,f2,'aad');
  await assert.rejects(()=>validateArchive(f2,key,'aad'));
});
test('local DB references match CAD and READY Scene bytes; missing or changed bytes fail',()=>{
  const f=storageFixture(),good=volume(f.root,'scan');assert.equal(good.status,0,good.stderr.toString());
  const storage=JSON.parse(good.stdout).logical.storage;
  assert.deepEqual([storage.cadCount,storage.sceneAssetCount,storage.readyJobs,storage.currentScenes],[1,1,1,1]);
  const cadFile=path.join(f.root,'cad',f.cadPath),sceneFile=path.join(f.root,'cad',f.scenePath);
  fs.writeFileSync(cadFile,'BADID CAD');assert.notEqual(volume(f.root,'scan').status,0);
  fs.writeFileSync(cadFile,f.cad);fs.rmSync(sceneFile);assert.notEqual(volume(f.root,'scan').status,0);
  fs.writeFileSync(sceneFile,Buffer.from('{"scene":2}'),{mode:0o600});assert.notEqual(volume(f.root,'scan').status,0);
  fs.writeFileSync(sceneFile,f.scene);assert.equal(volume(f.root,'scan').status,0);
});
test('each remote CAD/Scene locator is refused even with local files present',()=>{
  const f=storageFixture(),file=path.join(f.root,'db/cad.sqlite');
  for(const [table,column,original] of [['CadFileVersion','storage_path',f.cadPath],
    ['SceneAsset','storage_locator',f.scenePath],['CadDeletionJob','storage_path',null],
    ['SceneOrphanJob','storage_locator',null]]){
    const db=new Database(file);
    if(original===null)db.prepare(`INSERT INTO "${table}"("${column}") VALUES(?)`).run('s3:bucket:object');
    else db.prepare(`UPDATE "${table}" SET "${column}"=?`).run('s3:bucket:object');
    db.close();assert.notEqual(volume(f.root,'scan').status,0,table+' must fail');
    const cleanup=new Database(file);
    if(original===null)cleanup.prepare(`DELETE FROM "${table}"`).run();
    else cleanup.prepare(`UPDATE "${table}" SET "${column}"=?`).run(original);
    cleanup.close();
  }
  assert.equal(volume(f.root,'scan').status,0);
});
