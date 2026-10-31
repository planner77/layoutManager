// Issue #59: app-owned, bounded, best-effort log sink. No HTTP or Docker access.
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, unlink, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';

export type LogSource = 'app' | 'maintenance';
export type StructuredEntry = {
  timestamp: string;
  schemaVersion: number;
  level: string;
  event: string;
  component: string;
  operation: string;
  appVersion: string;
  [field: string]: unknown;
};
export type StoredLog = StructuredEntry & { logId: string; source: LogSource };
export type StoreOptions = {
  directory: string; // Fixed by the server; injected only by isolated tests.
  source: LogSource;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxFiles: number;
  retentionMs: number;
  maxQueueBytes: number;
};
type FileInfo = { name: string; size: number; mtimeMs: number };
const FILE_NAME = /^(app|maintenance)-[0-9]{13}-[a-f0-9]{32}-[0-9]{4}\.jsonl$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const READ_MAX_FILES = 16;
const READ_MAX_RECORDS = 200;
const READ_MAX_FILE_BYTES = 8 * 1024 * 1024;

function boundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value || !/^[0-9]+$/.test(value)) return fallback;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
}

export function logStoreOptions(env: Record<string, string | undefined> = process.env): StoreOptions {
  const maxTotalMB = boundedInt(env.LOG_MAX_TOTAL_MB, 64, 4, 256);
  const maxFileMB = Math.min(boundedInt(env.LOG_MAX_FILE_MB, 4, 1, 8), maxTotalMB);
  return {
    directory: '/data/logs',
    source: env.LOG_SOURCE === 'maintenance' ? 'maintenance' : 'app',
    maxFileBytes: maxFileMB * 1024 * 1024,
    maxTotalBytes: maxTotalMB * 1024 * 1024,
    maxFiles: 64,
    retentionMs: boundedInt(env.LOG_RETENTION_DAYS, 7, 1, 30) * 86_400_000,
    maxQueueBytes: 1024 * 1024,
  };
}

async function verifiedDirectory(directory: string, create: boolean) {
  if (create) {
    try { await mkdir(directory, { mode: 0o700 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  const stat = await lstat(directory);
  // Fail closed for symlinks and group/world-accessible log directories.
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
    throw new Error('LOG_STORE_DIRECTORY_UNSAFE');
}

async function inventory(directory: string): Promise<FileInfo[]> {
  const names = await readdir(directory);
  const found: FileInfo[] = [];
  for (const name of names) {
    if (!FILE_NAME.test(name)) continue;
    const stat = await lstat(join(directory, name));
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    found.push({ name, size: stat.size, mtimeMs: stat.mtimeMs });
  }
  return found.sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name));
}

export class StructuredLogStore {
  private readonly writerId = randomUUID().replace(/-/g, '');
  private readonly queue: Buffer[] = [];
  private runner?: Promise<void>;
  private handle?: FileHandle;
  private activeName?: string;
  private fileSize = 0;
  private sequence = 0;
  private queuedBytes = 0;
  private lastPruneAt = 0;
  private readonly closedFiles = new Set<string>();
  private readonly counters = { accepted: 0, written: 0, dropped: 0, failed: 0, rotated: 0, purged: 0 };
  private lastFailureCode: string | undefined;

  constructor(private readonly options: StoreOptions) {
    if (options.source !== 'app' && options.source !== 'maintenance') throw new Error('LOG_STORE_SOURCE_INVALID');
    if (![options.maxFileBytes, options.maxTotalBytes, options.maxFiles, options.retentionMs, options.maxQueueBytes]
      .every(n => Number.isSafeInteger(n) && n > 0) || options.maxFileBytes > options.maxTotalBytes) {
      throw new Error('LOG_STORE_LIMIT_INVALID');
    }
  }

  getStatus() {
    return { ...this.counters, queuedBytes: this.queuedBytes, lastFailureCode: this.lastFailureCode };
  }

  // Never call the logger from the sink: ENOSPC/EROFS/EACCES must not recurse.
  enqueue(entry: StructuredEntry): boolean {
    let bytes: Buffer;
    try {
      bytes = Buffer.from(JSON.stringify({ ...entry, logId: randomUUID(), source: this.options.source }) + '\n');
    } catch {
      this.counters.dropped++;
      return false;
    }
    if (bytes.length > this.options.maxFileBytes || this.queuedBytes + bytes.length > this.options.maxQueueBytes) {
      this.counters.dropped++;
      return false;
    }
    this.queue.push(bytes);
    this.queuedBytes += bytes.length;
    this.counters.accepted++;
    this.startDrain();
    return true;
  }

  private startDrain() {
    if (this.runner) return;
    this.runner = this.drain().finally(() => {
      this.runner = undefined;
      if (this.queue.length) this.startDrain();
    });
  }

  async flush() {
    while (this.runner) await this.runner;
  }

  async close() {
    await this.flush();
    if (this.handle) {
      await this.handle.close();
      this.handle = undefined;
      this.activeName = undefined;
    }
  }

  private async drain() {
    while (this.queue.length) {
      const bytes = this.queue.shift()!;
      try {
        await this.append(bytes);
        this.counters.written++;
      } catch (error) {
        this.counters.failed++;
        this.counters.dropped++;
        const code = (error as NodeJS.ErrnoException)?.code;
        this.lastFailureCode = typeof code === 'string' && /^(?:E[A-Z0-9]+)$/.test(code) ? code : 'LOG_IO_FAILED';
        // A partial last line must never be continued with another event.
        try { await this.handle?.close(); } catch { /* best effort */ }
        this.handle = undefined;
        this.activeName = undefined;
        this.fileSize = 0;
      } finally {
        this.queuedBytes -= bytes.length;
      }
    }
  }

  // Protected seam for injected ENOSPC/EROFS tests; runtime uses O_EXCL/O_NOFOLLOW.
  protected async openNewFile(path: string): Promise<FileHandle> {
    return open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  }

  private async append(bytes: Buffer) {
    if (!this.handle || this.fileSize + bytes.length > this.options.maxFileBytes) {
      if (this.handle) {
        const prior = this.activeName;
        await this.handle.close();
        if (prior) this.closedFiles.add(prior);
        this.handle = undefined;
        this.counters.rotated++;
      }
      await verifiedDirectory(this.options.directory, true);
      await this.prune(bytes.length);
      const name = this.options.source + '-' + String(Date.now()).padStart(13, '0') + '-' +
        this.writerId + '-' + String(this.sequence++).padStart(4, '0') + '.jsonl';
      // O_EXCL/O_NOFOLLOW + private mode; each process writes distinct files.
      this.handle = await this.openNewFile(join(this.options.directory, name));
      this.activeName = name;
      this.fileSize = 0;
    }
    // Single drain per writer, fully written record before the next record.
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesWritten } = await this.handle!.write(bytes, offset, bytes.length - offset);
      if (bytesWritten <= 0) throw new Error('LOG_IO_ZERO_WRITE');
      offset += bytesWritten;
      this.fileSize += bytesWritten;
    }
    if (Date.now() - this.lastPruneAt > 60_000) {
      this.lastPruneAt = Date.now();
      await this.prune(0);
    }
  }

  private async prune(incoming: number) {
    const files = await inventory(this.options.directory);
    const now = Date.now();
    let total = files.reduce((sum, f) => sum + f.size, 0);
    let count = files.length;
    for (const file of files) {
      const expired = now - file.mtimeMs > this.options.retentionMs;
      const excessive = count >= this.options.maxFiles || total + incoming > this.options.maxTotalBytes;
      if (!expired && !excessive) break;
      if (file.name === this.activeName) continue;
      // Do not unlink another process's currently written file.
      if (!this.closedFiles.has(file.name) && now - file.mtimeMs < 60_000) continue;
      await unlink(join(this.options.directory, file.name));
      this.closedFiles.delete(file.name);
      total -= file.size;
      count--;
      this.counters.purged++;
    }
    if (total + incoming > this.options.maxTotalBytes || count >= this.options.maxFiles)
      throw new Error('LOG_STORE_CAPACITY');
  }
}

// Internal read-only service for a future authenticated #61 API. No path argument
// from a request, no raw framework/docker logs, and bounded file/page scans.
export async function readStructuredLogTail(options: {
  source?: LogSource;
  limit?: number;
  before?: { timestamp: string; logId: string };
  directory?: string; // only injected by internal callers and isolated tests
} = {}): Promise<StoredLog[]> {
  const directory = options.directory ?? '/data/logs';
  if (options.source !== undefined && options.source !== 'app' && options.source !== 'maintenance')
    throw new Error('LOG_SOURCE_INVALID');
  if (options.before && (!Number.isFinite(Date.parse(options.before.timestamp)) || !UUID.test(options.before.logId)))
    throw new Error('LOG_CURSOR_INVALID');
  const limit = Number.isSafeInteger(options.limit) ? Math.max(1, Math.min(READ_MAX_RECORDS, options.limit!)) : 100;
  try { await verifiedDirectory(directory, false); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const files = (await inventory(directory))
    .filter(f => (!options.source || f.name.startsWith(options.source + '-')) && f.size <= READ_MAX_FILE_BYTES)
    .slice(-READ_MAX_FILES);
  const all: StoredLog[] = [];
  for (const file of files) {
    const handle = await open(join(directory, file.name), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > READ_MAX_FILE_BYTES) continue;
      const content = await handle.readFile({ encoding: 'utf8' });
      const lines = content.split('\n');
      if (!content.endsWith('\n')) lines.pop(); // Crash-truncated final line is not a record.
      for (const line of lines) {
        if (!line || line.length > 16384) continue;
        try {
          const entry: unknown = JSON.parse(line);
          if (!entry || typeof entry !== 'object') continue;
          const item = entry as StoredLog;
          if (item.schemaVersion !== 1 || !UUID.test(item.logId) ||
              !Number.isFinite(Date.parse(item.timestamp)) ||
              (item.source !== 'app' && item.source !== 'maintenance') ||
              (options.source && item.source !== options.source)) continue;
          if (options.before &&
              (item.timestamp > options.before.timestamp ||
               (item.timestamp === options.before.timestamp && item.logId >= options.before.logId))) continue;
          all.push(item);
        } catch { /* corrupt/truncated JSONL line; do not expose it */ }
      }
    } finally { await handle.close(); }
  }
  return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.logId.localeCompare(a.logId))
    .slice(0, limit);
}
