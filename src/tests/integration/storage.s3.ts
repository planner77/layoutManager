import { beforeEach, afterEach, afterAll, test, expect, vi } from 'vitest';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { S3Client, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { storageConfiguration } from '@/scripts/storage-config.mjs';
import { ConfiguredCadStorage } from '@/server/storage/configured-storage';
import { CadStorage } from '@/server/storage/cad-storage';
import { S3ObjectStorage, s3Location } from '@/server/storage/s3-storage';
import { createDb, type Database } from '@/server/db';
import { CadRepository } from '@/server/repositories/cad';
import { uploadCad } from '@/server/services/upload';
import { UploadDiagnostics } from '@/server/upload-observability';
let directory: string, db: Database, repo: CadRepository, storage: ConfiguredCadStorage;
const options = storageConfiguration(process.env).s3!;
const client = new S3Client({...options, maxAttempts:1});
afterAll(()=>client.destroy());
function request(name='layout.dxf', bytes=Buffer.from('0\nEOF\n')) {
  const form = new FormData();form.set('file',new File([new Uint8Array(bytes)],name));
  for(const [key,value] of Object.entries({businessUnit:'S3',site:'test',building:'A',floor:'1',registeredAt:'2026-09-08',makeCurrent:'true',deletePassword:'1234'}))form.set(key,value);
  return new Request('http://localhost/api/cad-files',{method:'POST',body:form});
}
async function keys() { return (await client.send(new ListObjectsV2Command({Bucket:options.bucket}))).Contents?.map(x=>x.Key).sort() ?? []; }
beforeEach(async()=>{
  directory=await mkdtemp(path.join(tmpdir(),'cad-s3-db-'));db=createDb(`file:${directory}/db.sqlite`);repo=new CadRepository(db);
  for(const migration of ['202609070001_locations','202609090001_description','202609110001_delete_password','202609110003_drawing_name']) for(const sql of (await readFile(new URL(`../../prisma/migrations/${migration}/migration.sql`,import.meta.url),'utf8')).split(';').filter(x=>x.trim()))await db.$executeRawUnsafe(sql);
  storage=new ConfiguredCadStorage(path.join(directory,'cad'),1024*1024,process.env);
});
afterEach(async()=>{vi.restoreAllMocks();storage.close();await db.$disconnect();await rm(directory,{recursive:true,force:true});});
test('TC-S3-001: DXF/DWG exact bytes/hash, version/current and local/S3 mixed reads',async()=>{
  const local=new CadStorage(storage.directory,storage.maxBytes);
  const a=await uploadCad(request(),repo,local);
  const bytes=Buffer.from([65,67,49,48,51,50,0,255,128,7]);
  const b=await uploadCad(request('원본.DWG',bytes),repo,storage);
  const c=await uploadCad(request('원본.DWG',bytes),repo,storage);
  expect(c.duplicateCount).toBe(1);expect(c.version).toBe(3);
  expect((await db.cadLocation.findFirstOrThrow()).currentVersionId).toBe(c.id);
  const file=await db.cadFileVersion.findUniqueOrThrow({where:{id:b.id}});
  expect(file.storagePath.startsWith('s3:')).toBe(true);expect(file.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  const object=await storage.content(file.storagePath);expect(Buffer.from(await new Response(object.stream).arrayBuffer())).toEqual(bytes);expect(object.size).toBe(bytes.length);
  const previous=await db.cadFileVersion.findUniqueOrThrow({where:{id:a.id}});
  expect(await new Response((await storage.content(previous.storagePath)).stream).text()).toBe('0\nEOF\n');
  const localMode=new ConfiguredCadStorage(storage.directory,storage.maxBytes,{...process.env,CAD_STORAGE_BACKEND:'local',CAD_S3_BUCKET:'unused-bucket'});
  try { expect(Buffer.from(await new Response((await localMode.content(file.storagePath)).stream).arrayBuffer())).toEqual(bytes); } finally {localMode.close();}
});
test('TC-S3-002/003: remote publication precedes DB transaction; DB failure deletes only new object',async()=>{
  const a=await uploadCad(request(),repo,storage);const baseline=await keys();
  vi.spyOn(repo,'register').mockImplementation(async()=>{expect((await keys()).length).toBe(baseline.length+1);throw new Error('DB fault');});
  await expect(uploadCad(request(),repo,storage)).rejects.toThrow('DB fault');expect(await keys()).toEqual(baseline);
  expect((await db.cadLocation.findFirstOrThrow()).currentVersionId).toBe(a.id);
  expect((await readdir(storage.directory)).filter(x=>x.startsWith('.upload-'))).toEqual([]);
});
test('TC-S3-002: committed record survives ambiguous DB response without deleting the object',async()=>{
  const original=repo.register.bind(repo);
  vi.spyOn(repo,'register').mockImplementation(async(...args)=>{await original(...args);throw new Error('lost COMMIT response');});
  await expect(uploadCad(request(),repo,storage)).rejects.toThrow('lost COMMIT');
  const file=await db.cadFileVersion.findFirstOrThrow();expect(await new Response((await storage.content(file.storagePath)).stream).text()).toBe('0\nEOF\n');
});
test('TC-S3-002: bad credentials fail safely before DB mutation; missing object/path are safe',async()=>{
  const bad=new ConfiguredCadStorage(storage.directory,storage.maxBytes,{...process.env,CAD_S3_SECRET_ACCESS_KEY:'deliberately-invalid-test-value'});
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  const diagnostics=new UploadDiagnostics();
  try { await expect(uploadCad(request(),repo,bad,diagnostics)).rejects.toMatchObject({status:503,code:'STORAGE_UNAVAILABLE',cause:expect.anything()}); } finally {bad.close();}
  expect(await db.cadFileVersion.count()).toBe(0);expect(log.mock.calls.map(call=>String(call[0])).some(line=>line.includes('storage_publish')&&line.includes('failure'))).toBe(true);
  await expect(storage.content(`s3:${options.bucket}:cad/${randomUUID()}/original.dxf`)).rejects.toMatchObject({status:404});
  await expect(storage.content(`s3:${options.bucket}:../outside`)).rejects.toMatchObject({status:404});
});
test('TC-S3-002: conditional PUT refuses overwrite on actual SeaweedFS',async()=>{
  const uploaded=await uploadCad(request(),repo,storage);
  const file=await db.cadFileVersion.findUniqueOrThrow({where:{id:uploaded.id}});
  const target=s3Location(file.storagePath);
  await expect(client.send(new PutObjectCommand({...target,Body:Buffer.from('overwrite'),IfNoneMatch:'*'}))).rejects.toMatchObject({$metadata:{httpStatusCode:412}});
  expect(await new Response((await storage.content(file.storagePath)).stream).text()).toBe('0\nEOF\n');
  const remote=new S3ObjectStorage(options);try {await remote.removeUncommitted(file.storagePath);await expect(remote.content(file.storagePath)).rejects.toMatchObject({status:404});}finally{remote.close();}
});

test('TC-S3-002: failed compensation preserves orphan for recovery and clears staging files',async()=>{
  const baseline=await keys();
  vi.spyOn(repo,'register').mockRejectedValue(new Error('DB fault'));
  vi.spyOn(storage,'removeUncommitted').mockRejectedValue(new Error('Delete unavailable'));
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  const diagnostics=new UploadDiagnostics();
  await expect(uploadCad(request(),repo,storage,diagnostics)).rejects.toThrow('DB fault');
  expect((await keys()).length).toBe(baseline.length+1);expect(await db.cadFileVersion.count()).toBe(0);
  expect(log.mock.calls.map(call=>String(call[0])).some(line=>line.includes('compensation')&&line.includes('warning'))).toBe(true);
  expect((await readdir(storage.directory)).filter(x=>x.startsWith('.upload-'))).toEqual([]);
});
