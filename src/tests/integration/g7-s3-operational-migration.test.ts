import { afterEach, describe, expect, test } from 'vitest';
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, chmodSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { migrations, migrate } from '../helpers/database';
import { G7_S3_SCHEMA_ID } from '../../server/g7-operational/preflight';

type SqliteDb = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
    get(...args: unknown[]): Record<string, unknown> | undefined;
    all(...args: unknown[]): Record<string, unknown>[];
  };
  close(): void;
  transaction<T>(action: () => T): () => T;
};
const Sqlite = createRequire(import.meta.url)('better-sqlite3') as
  new (file: string) => SqliteDb;
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const rootDir = path.resolve(process.cwd());
const migrationDir = path.join(rootDir, 'deploy/g7-s3/prisma/migrations');
const candidateFile = path.join(migrationDir, G7_S3_SCHEMA_ID, 'migration.sql');
const candidateSql = readFileSync(candidateFile, 'utf8');

function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'cad-g7-s3-'));
  dirs.push(root);
  const filename = path.join(root, 'fixture.sqlite');
  writeFileSync(filename, '', { mode: 0o600 });
  chmodSync(filename, 0o600);
  writeFileSync(path.join(root, 's3-disposable.json'),
    JSON.stringify({
      scope: 'G7-S3-DISPOSABLE-MIGRATION-TEST', schemaId: G7_S3_SCHEMA_ID,
      databasePath: filename, fixtureNonce: randomBytes(16).toString('hex'),
    }), { mode: 0o600 });
  const env = {
    ...process.env,
    G7_S3_MIGRATION_TEST_ONLY: 'true',
    G7_S3_TEST_ROOT: root,
    G7_S3_TEST_DATABASE_URL: 'file:' + filename,
    DATABASE_URL: 'file:' + filename,
    G7_AUTH_ENABLED: 'false',
    G7_CAD_WRITE_CUTOVER_ENABLED: 'false',
  };
  return { root, filename, env };
}
function invokePrisma(env: NodeJS.ProcessEnv) {
  const cli = path.join(rootDir, 'node_modules/prisma/build/index.js');
  return spawnSync(process.execPath,
    [cli, 'migrate', 'deploy', '--config', 'deploy/g7-s3/prisma.config.ts'],
    { cwd: rootDir, encoding: 'utf8', env, timeout: 90000 });
}
function seedCad(db: SqliteDb) {
  db.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run('bu', 'G7 test');
  db.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)')
    .run('product', 'bu', 'Control');
  db.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)')
    .run('site', 'product', 'Site', 'SITE');
  db.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)')
    .run('building', 'site', 'Building');
  db.prepare('INSERT INTO "CadLocation"(id,building_id,name,next_version) VALUES(?,?,?,?)')
    .run('floor', 'building', 'Floor', 2);
  const hash = createHash('sha256').update('synthetic source').digest('hex');
  db.prepare('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,1,?,?,?,?,?,?,?,?)')
    .run('version', 'floor', 'synthetic.dxf', '', 'scrypt$synthetic-hash',
      'DXF', 16, hash, 'synthetic/file', '2026-10-26');
  db.prepare('UPDATE "CadLocation" SET current_version_id=? WHERE id=?')
    .run('version', 'floor');
}
function snapshot(db: SqliteDb) {
  return ['BusinessUnit','Product','CadSite','Building','CadLocation',
    'CadFileVersion','CadDeletionJob'].map(name=>({
      name, rows: db.prepare('SELECT * FROM "' + name + '" ORDER BY id').all(),
    }));
}

describe('#109 S3-1 quarantine: formal Prisma migration and CAD invariants', () => {
  test('existing operational migration history contains exactly six safe CAD versions', () => {
    // Never copy G7 migration into this active directory:
    // the Docker migrator runs Prisma migrate deploy automatically.
    const active = readFileSync(path.join(rootDir,
      'prisma/migrations/migration_lock.toml'), 'utf8');
    expect(active).toContain('sqlite');
    expect(migrations).toHaveLength(6);
    for (const name of migrations) {
      const baseline = readFileSync(path.join(rootDir,
        'prisma/migrations', name, 'migration.sql'));
      const copied = readFileSync(path.join(migrationDir, name, 'migration.sql'));
      expect(copied).toEqual(baseline);
    }
    const activeMigration = path.join(rootDir,
      'prisma/migrations', G7_S3_SCHEMA_ID, 'migration.sql');
    expect(() => readFileSync(activeMigration)).toThrow();
    expect(candidateSql).toContain('CREATE TABLE "User"');
    const schema = readFileSync(path.join(rootDir, 'prisma/schema.prisma'), 'utf8');
    for (const model of ['User','AuthSession','UserRoleGrant','UserSiteGrant',
      'SpecialGrant','AuditEvent','AdminRecoveryNonce','G3LoginAttempt']) {
      expect(schema).toContain('model ' + model + ' {');
    }
  });
  test('formal Prisma deploy applies 7 migrations on isolated /tmp SQLite only', () => {
    const { filename, env } = makeFixture();
    const run = invokePrisma(env);
    expect(run.status, (run.stderr + run.stdout).slice(-1700)).toBe(0);
    const db = new Sqlite(filename);
    try {
      db.exec('PRAGMA foreign_keys=ON');
      expect(Number(db.prepare('SELECT COUNT(*) AS n FROM "_prisma_migrations"').get()?.n))
        .toBe(7);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='AuditEvent'").get())
        .toBeDefined();
      expect(db.prepare('PRAGMA foreign_key_check').all()).toHaveLength(0);
      seedCad(db);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toHaveLength(0);
      expect(db.prepare('SELECT current_version_id FROM "CadLocation" WHERE id=?').get('floor')?.current_version_id)
        .toBe('version');
      expect(() => db.prepare('INSERT INTO "UserSiteGrant"(user_id,site_id,granted_at) VALUES(?,?,?)')
        .run('unknown', 'site', Date.now())).toThrow();
    } finally { db.close(); }
  }, 100000);
  test('existing populated CAD database stays logically unchanged', async () => {
    const { filename } = makeFixture();
    await migrate(filename);
    const db = new Sqlite(filename);
    try {
      db.exec('PRAGMA foreign_keys=ON');
      seedCad(db);
      const before = snapshot(db);
      const rollback= db.transaction(() => {
        db.exec(candidateSql);
        throw new Error('G7_S3_INJECTED_FAILURE');
      });
      expect(rollback).toThrow('G7_S3_INJECTED_FAILURE');
      expect(snapshot(db)).toEqual(before);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='User'").get()).toBeUndefined();
      db.exec(candidateSql);
      expect(snapshot(db)).toEqual(before);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toHaveLength(0);
      db.prepare('INSERT INTO "AuditEvent"(id,action,target_kind,target_id,outcome,timestamp_utc,request_id) VALUES(?,?,?,?,?,?,?)')
        .run('audit-synthetic', 'LOGIN_DENIED', 'ACCOUNT', 'actor-unknown',
          'DENIED', '2026-10-26T09:00:00Z', 'g7-s3-migration-test');
      expect(() => db.prepare('UPDATE "AuditEvent" SET action=? WHERE id=?')
        .run('FORGED', 'audit-synthetic')).toThrow('G1_AUDIT_APPEND_ONLY');
    } finally { db.close(); }
  });
  test('config blocks wrong/unapproved DB URLs BEFORE opening SQLite', () => {
    const { filename, root, env } = makeFixture();
    const foreign = path.join(root, 'not-approved.sqlite');
    const marker='NEVER_MIGRATE_REAL_DATA';
    writeFileSync(foreign, marker, {mode: 0o600});
    for(const variant of [
      { ...env, DATABASE_URL: 'file:' + foreign },
      { ...env, G7_S3_TEST_DATABASE_URL: 'file:' + foreign },
      { ...env, G7_S3_MIGRATION_TEST_ONLY: 'false' },
      { ...env, G7_AUTH_ENABLED: 'true' },
      { ...env, G7_CAD_WRITE_CUTOVER_ENABLED: 'true' },
    ]) {
      const result = invokePrisma(variant);
      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('G7_S3_DISPOSABLE_MIGRATION_ONLY');
      expect(readFileSync(foreign, 'utf8')).toBe(marker);
    }
    expect(readFileSync(filename).length).toBe(0);
  }, 100000);
});
