import { createHash } from 'node:crypto';
import { cp, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { migrate } from '../helpers/database';
import { applyG1Fixture, openG1Fixture, type IsolatedDb } from '../fixtures/auth-g1/store';

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const dxf = (marker: string) => Buffer.from(
  '0\nSECTION\n2\nENTITIES\n999\nG6-SYNTHETIC-' + marker + '\n0\nENDSEC\n0\nEOF\n', 'utf8',
);
const CAD_TABLES = ['BusinessUnit', 'Product', 'CadSite', 'Building',
  'CadLocation', 'CadFileVersion', 'CadDeletionJob'] as const;
const rows = (db: IsolatedDb) => CAD_TABLES.map(table => ({
  table, data: db.prepare('SELECT * FROM "' + table + '" ORDER BY id').all(),
}));
const fk = (db: IsolatedDb) => db.prepare('PRAGMA foreign_key_check').all();

describe('Issue #108 G6 disposable backup → isolated migration → restore', () => {
  test('TC-P4-G6-007: immutable CAD versions/current and bytes across real SQLite backup and restore', async () => {
    // This is synthetic local + mock-S3 only, NOT a live LAN/production/S3 rehearsal.
    const directory = await mkdtemp(path.join(tmpdir(), 'cad-auth-g1-g6-'));
    const dryDirectory = await mkdtemp(path.join(tmpdir(), 'cad-auth-g1-g6-dryrun-'));
    const filename = path.join(directory, 'fixture.sqlite');
    const dryFilename = path.join(dryDirectory, 'fixture.sqlite');
    const backup = path.join(directory, 'consistent-synthetic-backup.sqlite');
    const local = path.join(directory, 'local-cad');
    const objectMirror = path.join(directory, 'mock-s3');
    const localBackup = path.join(directory, 'backup-local');
    const s3Backup = path.join(directory, 'backup-mock-s3');
    let db: IsolatedDb | undefined;
    let dry: IsolatedDb | undefined;
    try {
      await migrate(filename); // the repository's six real CAD schema migrations
      db = openG1Fixture(filename); // guarded cad-auth-g1-* fixture.sqlite ONLY
      db.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run('bu-g6', 'G6');
      db.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)')
        .run('product-g6', 'bu-g6', 'Fixture product');
      db.prepare('INSERT INTO "CadSite"(id,product_id,name,kind) VALUES(?,?,?,?)')
        .run('site-g6', 'product-g6', 'Fixture site', 'SITE');
      db.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)')
        .run('building-g6', 'site-g6', 'Building');
      db.prepare('INSERT INTO "CadLocation"(id,building_id,name,next_version) VALUES(?,?,?,1)')
        .run('floor-g6', 'building-g6', 'Floor');
      await mkdir(local); await mkdir(objectMirror);
      const bytesByVersion = [dxf('1'), dxf('2')];
      for (const [index, bytes] of bytesByVersion.entries()) {
        const version = index + 1;
        const filenamePart = 'version-' + version + '.dxf';
        db.prepare('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
          .run('v-g6-' + version, 'floor-g6', version, filenamePart,
            'synthetic', 'scrypt$synthetic-only', 'DXF', bytes.length,
            digest(bytes), 'cad/' + filenamePart, '2026-10-26');
        await writeFile(path.join(local, filenamePart), bytes);
        await writeFile(path.join(objectMirror, filenamePart), bytes);
      }
      db.prepare('UPDATE "CadLocation" SET current_version_id=?,next_version=3 WHERE id=?')
        .run('v-g6-2', 'floor-g6');
      expect(fk(db)).toEqual([]);
      const baseline = rows(db);
      const verifyFiles = async (connection: IsolatedDb, cadDir: string, s3Dir: string) => {
        const versions = connection.prepare('SELECT id,file_size,sha256,storage_path FROM "CadFileVersion" ORDER BY id').all();
        expect(versions).toHaveLength(2);
        for (const record of versions) {
          const part = path.basename(String(record.storage_path));
          for (const directory of [cadDir, s3Dir]) {
            const bytes = await readFile(path.join(directory, part));
            expect(bytes.length).toBe(Number(record.file_size));
            expect(digest(bytes)).toBe(record.sha256);
          }
        }
      };
      await verifyFiles(db, local, objectMirror);
      // Quiesced synthetic writers; SQLite online backup + both file mirrors as one bundle.
      await db.backup(backup);
      await cp(local, localBackup, { recursive: true });
      await cp(objectMirror, s3Backup, { recursive: true });
      // A dry-run MUST use a separate disposable DB, never the source/production DB.
      await copyFile(backup, dryFilename);
      dry = openG1Fixture(dryFilename);
      applyG1Fixture(dry);
      expect(fk(dry)).toEqual([]);
      expect(rows(dry)).toEqual(baseline);
      expect(dry.prepare("SELECT name FROM sqlite_master WHERE name='User'").get())
        .toBeDefined();
      await verifyFiles(dry, localBackup, s3Backup);
      dry.close(); dry = undefined;
      // Inject post-snapshot corruption to prove restore is substantive (not a no-op).
      db.prepare('UPDATE "CadLocation" SET current_version_id=NULL WHERE id=?')
        .run('floor-g6');
      await writeFile(path.join(local, 'version-1.dxf'), 'corrupt synthetic local');
      await writeFile(path.join(objectMirror, 'version-2.dxf'), 'corrupt synthetic mirror');
      expect(rows(db)).not.toEqual(baseline);
      expect(digest(await readFile(path.join(local, 'version-1.dxf'))))
        .not.toBe(bytesByVersion.length ? digest(bytesByVersion[0]) : '');
      db.close(); db = undefined; // emulate stopped application before restoring
      await copyFile(backup, filename);
      await rm(local, { recursive: true }); await rm(objectMirror, { recursive: true });
      await cp(localBackup, local, { recursive: true });
      await cp(s3Backup, objectMirror, { recursive: true });
      db = openG1Fixture(filename);
      expect(fk(db)).toEqual([]);
      expect(rows(db)).toEqual(baseline);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name='User'").get())
        .toBeUndefined(); // the snapshot predates the isolated migration
      await verifyFiles(db, local, objectMirror);
    } finally {
      db?.close(); dry?.close();
      await rm(directory, { recursive: true, force: true });
      await rm(dryDirectory, { recursive: true, force: true });
    }
  });
});
