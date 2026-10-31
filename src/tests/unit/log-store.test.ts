import { afterEach, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { appendFile, lstat, mkdtemp, readdir, rm, symlink, unlink, utimes, writeFile, mkdir } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  StructuredLogStore, logStoreOptions, readStructuredLogTail, type StoreOptions, type StructuredEntry,
} from '../../server/logging/store';

const roots: string[] = [];
async function tmp() {
  const dir = await mkdtemp(join(tmpdir(), 'issue59-jsonl-'));
  roots.push(dir);
  return dir;
}
afterEach(async () => { for (const dir of roots.splice(0)) await rm(dir, { recursive: true, force: true }); });
function opts(directory: string, source: 'app' | 'maintenance' = 'app'): StoreOptions {
  return { directory, source, maxFileBytes: 560, maxTotalBytes: 4000,
    maxFiles: 16, retentionMs: 86400000, maxQueueBytes: 64000 };
}
function entry(index: number): StructuredEntry {
  return { timestamp: new Date(Date.now() + index).toISOString(), schemaVersion: 1,
    level: 'info', event: 'synthetic_event', component: 'test',
    operation: 'synthetic', appVersion: '0.48.0', outcome: 'success' };
}

test('TC-L3-001: persistent JSONL survives process restart, rotates and bounds file bytes', async () => {
  const directory = await tmp();
  const config = opts(directory);
  const first = new StructuredLogStore(config);
  for (let n = 0; n < 6; n++) expect(first.enqueue(entry(n))).toBe(true);
  await first.close();
  const second = new StructuredLogStore(config);
  expect(second.enqueue(entry(7))).toBe(true);
  await second.close();
  const files = (await readdir(directory)).filter(name => name.endsWith('.jsonl'));
  expect(files.length).toBeGreaterThan(1);
  for (const file of files) {
    const stat = await lstat(join(directory, file));
    expect(stat.size).toBeLessThanOrEqual(config.maxFileBytes);
    expect(stat.mode & 0o777).toBe(0o600);
  }
  expect((await lstat(directory)).mode & 0o777).toBe(0o700);
  const read = await readStructuredLogTail({ directory, source: 'app', limit: 200 });
  expect(read).toHaveLength(7);
  expect(new Set(read.map(x => x.logId)).size).toBe(7);
  expect(read.every(x => x.source === 'app' && x.schemaVersion === 1)).toBe(true);
});

test('TC-L3-002: independent app and maintenance writer files never interleave', async () => {
  const directory = await tmp();
  const a = new StructuredLogStore(opts(directory, 'app'));
  const b = new StructuredLogStore(opts(directory, 'maintenance'));
  for (let n = 0; n < 6; n++) { a.enqueue(entry(n)); b.enqueue(entry(n)); }
  await Promise.all([a.close(), b.close()]);
  const files = await readdir(directory);
  expect(files.some(name => name.startsWith('app-'))).toBe(true);
  expect(files.some(name => name.startsWith('maintenance-'))).toBe(true);
  expect(await readStructuredLogTail({ directory, source: 'app' })).toHaveLength(6);
  expect(await readStructuredLogTail({ directory, source: 'maintenance' })).toHaveLength(6);
});

test('TC-L3-003: rotation/total-size and file count purge oldest closed files', async () => {
  const directory = await tmp();
  const config = { ...opts(directory), maxFileBytes: 350, maxTotalBytes: 900, maxFiles: 3 };
  const writer = new StructuredLogStore(config);
  for (let n = 0; n < 14; n++) writer.enqueue(entry(n));
  await writer.close();
  const files = (await readdir(directory)).filter(name => name.endsWith('.jsonl'));
  const stats = await Promise.all(files.map(file => lstat(join(directory, file))));
  expect(files.length).toBeLessThanOrEqual(config.maxFiles);
  expect(stats.reduce((a, x) => a + x.size, 0)).toBeLessThanOrEqual(config.maxTotalBytes);
  expect(writer.getStatus().purged).toBeGreaterThan(0);
});

test('TC-L3-004: symlink directory, ENOSPC and read cursor reject unsafe input without throwing on enqueue', async () => {
  const root = await tmp();
  const actual = join(root, 'private');
  const fake = join(root, 'link');
  await mkdir(actual);
  await symlink(actual, fake);
  const linkWriter = new StructuredLogStore(opts(fake));
  expect(linkWriter.enqueue(entry(0))).toBe(true);
  await linkWriter.flush();
  expect(linkWriter.getStatus().failed).toBe(1);
  expect(await readdir(actual)).toHaveLength(0);
  class FullDisk extends StructuredLogStore {
    protected override async openNewFile(_file: string): Promise<FileHandle> {
      throw Object.assign(new Error('private path: /home/password'), { code: 'ENOSPC' });
    }
  }
  const full = new FullDisk(opts(actual));
  expect(full.enqueue(entry(1))).toBe(true);
  await full.flush();
  expect(full.getStatus()).toMatchObject({ failed: 1, dropped: 1, lastFailureCode: 'ENOSPC' });
  await expect(readStructuredLogTail({ directory: actual, source: 'evil' as 'app' })).rejects.toThrow();
  await expect(readStructuredLogTail({ directory: actual, before: { timestamp: 'bad', logId: randomUUID() } })).rejects.toThrow();
});

test('TC-L3-005: truncated final JSON, wrong schema and symlink files are ignored', async () => {
  const directory = await tmp();
  const writer = new StructuredLogStore(opts(directory));
  writer.enqueue(entry(0));
  await writer.close();
  const [file] = (await readdir(directory)).filter(name => name.endsWith('.jsonl'));
  await appendFile(join(directory, file), '{"password":"partial');
  await writeFile(join(directory, 'README.not-jsonl'), 'secret');
  const rows = await readStructuredLogTail({ directory });
  expect(rows).toHaveLength(1);
  expect(JSON.stringify(rows)).not.toContain('partial');
});

test('TC-L3-006: invalid environment input uses safe defaults and never changes log path', () => {
  const config = logStoreOptions({
    LOG_SOURCE: '../../private', LOG_MAX_FILE_MB: '9999', LOG_MAX_TOTAL_MB: '-1',
    LOG_RETENTION_DAYS: '999',
  });
  expect(config).toMatchObject({ directory: '/data/logs', source: 'app',
    maxFileBytes: 4 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024,
    retentionMs: 7 * 86400000 });
});


test('TC-L3-007: idle app writer reopens after maintenance prunes its inode', async () => {
  const directory = await tmp();
  const config = { ...opts(directory), maxFileBytes: 300, maxTotalBytes: 900, maxFiles: 2 };
  const app = new StructuredLogStore(config);
  const maintenance = new StructuredLogStore({ ...config, source: 'maintenance' });
  app.enqueue(entry(0));
  await app.flush(); // descriptor stays open while the other process rotates
  const [appName] = (await readdir(directory)).filter(name => name.startsWith('app-'));
  expect(appName).toBeDefined();
  const past = new Date(Date.now() - 120_000);
  await utimes(join(directory, appName), past, past);

  maintenance.enqueue(entry(1));
  await maintenance.flush();
  maintenance.enqueue(entry(2)); // rotation at 300 bytes, must reclaim idle app file
  await maintenance.close();
  expect((await readdir(directory))).not.toContain(appName);
  expect(maintenance.getStatus().purged).toBeGreaterThan(0);

  // Allow room under the shared two-file retention limit, while still keeping
  // the app's original file handle open to its now-unlinked inode.
  const [oldMaintenance] = (await readdir(directory)).filter(name => name.startsWith('maintenance-'));
  await utimes(join(directory, oldMaintenance), past, past);
  app.enqueue({ ...entry(3), event: 'after_external_prune' });
  await app.close();
  expect(app.getStatus()).toMatchObject({ written: 2, failed: 0 });
  const readable = await readStructuredLogTail({ directory, source: 'app' });
  expect(readable.map(row => row.event)).toContain('after_external_prune');
});

test('TC-L3-008: 10000+ rotation sequence remains inventoried and quota bounded', async () => {
  const directory = await tmp();
  const config = { ...opts(directory), maxFileBytes: 300, maxTotalBytes: 900, maxFiles: 3 };
  const writer = new StructuredLogStore(config);
  // White-box long-running-writer boundary without allocating 10,000 files.
  (writer as unknown as { sequence: number }).sequence = 9999;
  for (let n = 0; n < 9; n++) writer.enqueue({ ...entry(n), event: 'sequence_boundary' });
  await writer.close();
  const files = (await readdir(directory)).filter(name => name.endsWith('.jsonl'));
  expect(files.some(name => /-1000[0-9]\.jsonl$/.test(name))).toBe(true);
  expect(files.length).toBeLessThanOrEqual(config.maxFiles);
  const sizes = await Promise.all(files.map(name => lstat(join(directory, name))));
  expect(sizes.reduce((sum, stat) => sum + stat.size, 0)).toBeLessThanOrEqual(config.maxTotalBytes);
  expect(writer.getStatus()).toMatchObject({ written: 9, failed: 0 });
  expect((await readStructuredLogTail({ directory, source: 'app' })).length).toBeGreaterThan(0);
});

test('TC-L3-009: periodic prune permits exactly maxFiles without deleting a valid file', async () => {
  const directory = await tmp();
  const config = { ...opts(directory), maxFileBytes: 300, maxTotalBytes: 900, maxFiles: 2 };
  const writer = new StructuredLogStore(config);
  writer.enqueue(entry(0));
  await writer.flush();
  (writer as unknown as { lastPruneAt: number }).lastPruneAt = 0;
  writer.enqueue(entry(1));
  await writer.close();
  const files = (await readdir(directory)).filter(name => name.endsWith('.jsonl'));
  expect(files).toHaveLength(2);
  expect(writer.getStatus()).toMatchObject({ written: 2, failed: 0, purged: 0 });
  expect(await readStructuredLogTail({ directory })).toHaveLength(2);
});
