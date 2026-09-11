import { afterEach, beforeEach, expect, test } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createDb, type Database } from '../../server/db';

const execute = promisify(execFile);
const Sqlite = createRequire(import.meta.url)('better-sqlite3') as new (file: string) => { exec(sql: string): void; close(): void };
let directory: string, db: Database;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'cad-cleanup-cli-'));
  const sqlite = new Sqlite(`${directory}/db.sqlite`);
  try { for (const migration of ['202609070001_locations','202609090001_description','202609110001_delete_password','202609110002_delete_invariants','202609110003_drawing_name']) sqlite.exec(await readFile(new URL(`../../prisma/migrations/${migration}/migration.sql`,import.meta.url),'utf8')); }
  finally { sqlite.close(); }
  db = createDb(`file:${directory}/db.sqlite`);
  await mkdir(`${directory}/cad`);
});
afterEach(async () => { await db.$disconnect(); await rm(directory, { recursive: true, force: true }); });
function cleanup() {
  return execute(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/storage-cleanup.ts'], {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: { ...process.env, DATABASE_URL: `file:${directory}/db.sqlite`, CAD_STORAGE_PATH: `${directory}/cad`, CAD_STORAGE_BACKEND: 'local', MAX_UPLOAD_SIZE_MB: '1' },
  });
}

test('TC-DELETE-005: actual standalone cleanup retries approved jobs, tolerates absent originals, and preserves other files', async () => {
  const key = `${randomUUID()}/${randomUUID()}/original.dxf`;
  await mkdir(path.dirname(`${directory}/cad/${key}`), { recursive: true });
  await writeFile(`${directory}/cad/${key}`, 'test-original');
  await writeFile(`${directory}/cad/keep.txt`, 'untouched');
  await db.cadDeletionJob.create({data:{id:randomUUID(),versionId:randomUUID(),storagePath:key}});
  await db.cadDeletionJob.create({data:{id:randomUUID(),versionId:randomUUID(),storagePath:`${randomUUID()}/${randomUUID()}/original.dwg`}});
  const result = await cleanup();
  expect(result.stderr).toBe(''); expect(result.stdout).toContain('"outcome":"success"');
  expect(await db.cadDeletionJob.count()).toBe(0);
  await expect(readFile(`${directory}/cad/${key}`)).rejects.toMatchObject({code:'ENOENT'});
  expect(await readFile(`${directory}/cad/keep.txt`, 'utf8')).toBe('untouched');
  await expect(cleanup()).resolves.toMatchObject({stderr:''});
});

test('TC-DELETE-005: standalone cleanup refuses unsafe job paths, keeps retry evidence and exits nonzero', async () => {
  await writeFile(`${directory}/keep.txt`, 'untouched');
  const job = await db.cadDeletionJob.create({data:{id:randomUUID(),versionId:randomUUID(),storagePath:'../keep.txt'}});
  await expect(cleanup()).rejects.toMatchObject({code:1,stderr:expect.stringContaining('UNSAFE_PATH')});
  expect(await db.cadDeletionJob.findUnique({where:{id:job.id}})).not.toBeNull();
  expect(await readFile(`${directory}/keep.txt`,'utf8')).toBe('untouched');
});
