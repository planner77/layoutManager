/** Live schema validation for #153. No DDL or repair is performed here. */
import { createHash } from 'node:crypto';
import { assertG7GreenfieldSchema, G7_GREENFIELD_BASELINE, G7_PREVIOUS_TYPES_BASELINE, G7_PREVIOUS_MEMO_BASELINE, G7_PREVIOUS_ANCHOR_BASELINE, G7_PREVIOUS_BUSINESS_BASELINE, G7_SCENE_GREENFIELD_BASELINE, G7_OLD_GREENFIELD_BASELINE } from './greenfield-schema';
import { createRequire } from 'node:module';
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { IsolatedDb } from '../g7-staging/g1-store';

const Sqlite = createRequire(import.meta.url)('better-sqlite3') as
  new (filename: string, options: {fileMustExist: boolean; readonly?: boolean}) => IsolatedDb;
export const G7_RUNTIME_MIGRATION_CHECKSUMS: Readonly<Record<string, string>> = {
  '202609070001_locations': '392523062702c6a4d4c4cab2e9586d87a1fcfc18922c633e59fa101d5b4b49e6',
  '202609090001_description': '90290830264614977ddbddce6114e8e2f059014a9d9008dd8e15a4b128d8af91',
  '202609110001_delete_password': '914b91a26261fcbbe72986ab20967fb32b2366691037ad1f1d5be9fe3642999c',
  '202609110002_delete_invariants': 'd42a9bf77eb5be7ed56a0954ec21995f88074b5e82a6cdacb53a0f668d42e752',
  '202609110003_drawing_name': '97f28144adb750f8e008050a840a8d2be11cc7297fd606f8e00385b6ccca8c0e',
  '202610150001_master_hierarchy': '1c6343fb7511be4865ae293eb7e38bcb01f0f4fdc442ab22dae88e183a4c909c',
  '202610260002_g7_operational_auth': 'c013e3e4881c1e91d0cd054eb2e1d4d417beb03f61cb506f805bccc5129215d3',
};
// Hash of sorted [type,name,whitespace-normalized sqlite_master.sql] after the
// reviewed seven SQL migrations. This also detects weakened CHECKs/triggers;
// merely finding the expected table/trigger names would not be sufficient.
const SCHEMA_FINGERPRINT = 'a937cf58b78710e8b501f7ec3211494c78316080b5c16732f9bf37e66765de6a';
export function assertG7RuntimeSchema(db: IsolatedDb): void {
  const rows = db.prepare('SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations"').all();
  // A new installation has one explicit final-schema baseline marker, never a
  // fabricated history of six legacy CAD upgrades plus the old Auth cutover.
  if (rows.length === 1 && (rows[0].migration_name === G7_GREENFIELD_BASELINE ||
       rows[0].migration_name === G7_PREVIOUS_TYPES_BASELINE ||
       rows[0].migration_name === G7_PREVIOUS_MEMO_BASELINE ||
       rows[0].migration_name === G7_PREVIOUS_ANCHOR_BASELINE ||
       rows[0].migration_name === G7_PREVIOUS_BUSINESS_BASELINE ||
      rows[0].migration_name === G7_OLD_GREENFIELD_BASELINE ||
      rows[0].migration_name === G7_SCENE_GREENFIELD_BASELINE)) {
    assertG7GreenfieldSchema(db);
    return;
  }
  const completed = new Set<string>();
  for (const row of rows) {
    const name = String(row.migration_name);
    if (!Object.hasOwn(G7_RUNTIME_MIGRATION_CHECKSUMS, name) ||
        row.checksum !== G7_RUNTIME_MIGRATION_CHECKSUMS[name]) throw new Error('G7_RUNTIME_MIGRATION_HISTORY');
    if (row.rolled_back_at != null) continue;
    if (row.finished_at == null || completed.has(name)) throw new Error('G7_RUNTIME_MIGRATION_INCOMPLETE');
    completed.add(name);
  }
  if (completed.size !== 7) throw new Error('G7_RUNTIME_SCHEMA_MISSING');
  const schema = db.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name<>'_prisma_migrations' ORDER BY type,name")
    .all().map(row => [row.type, row.name, String(row.sql).replace(/\s+/g, ' ').trim()]);
  if (createHash('sha256').update(JSON.stringify(schema)).digest('hex') !== SCHEMA_FINGERPRINT)
    throw new Error('G7_RUNTIME_SCHEMA_DRIFT');
  const check = db.prepare('PRAGMA quick_check').all();
  if (check.length !== 1 || Object.values(check[0])[0] !== 'ok' ||
      db.prepare('PRAGMA foreign_key_check').all().length !== 0)
    throw new Error('G7_RUNTIME_DATABASE_INTEGRITY');
}
export function openG7RuntimeDb(
  gate: Readonly<{databasePath: string; siteIds?: readonly string[]; schemaMode?: 'GREENFIELD'}>,
  readonly = false,
): IsolatedDb {
  const filename = gate.databasePath;
  if (!path.isAbsolute(filename) || realpathSync(filename) !== filename)
    throw new Error('G7_RUNTIME_DATABASE_PATH');
  const stat = lstatSync(filename), parent = lstatSync(path.dirname(filename));
  let held = false;
  try { lstatSync(path.join(path.dirname(filename), 'g7-runtime-hold.json')); held = true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() ||
      stat.nlink !== 1 || (stat.mode & 0o077) !== 0 || !parent.isDirectory() || parent.isSymbolicLink() ||
      realpathSync(path.dirname(filename)) !== path.dirname(filename) || parent.uid !== process.getuid?.() ||
      (parent.mode & 0o022) !== 0 || held)
    throw new Error('G7_RUNTIME_DATABASE_PATH');
  const db = new Sqlite(filename, {fileMustExist: true, readonly});
  try {
    const after = lstatSync(filename), parentAfter = lstatSync(path.dirname(filename));
    if (after.dev !== stat.dev || after.ino !== stat.ino || after.mode !== stat.mode ||
        after.uid !== stat.uid || after.nlink !== 1 || realpathSync(filename) !== filename ||
        parentAfter.dev !== parent.dev || parentAfter.ino !== parent.ino || parentAfter.mode !== parent.mode ||
        parentAfter.uid !== parent.uid) throw new Error('G7_RUNTIME_DATABASE_CHANGED');
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    // Keep this enforcement inside every DB open, including post-approval
    // transactions. A stale/replaced legacy seven-schema file must never be
    // accepted by a signed Greenfield authority.
    if(gate.schemaMode==='GREENFIELD') assertG7GreenfieldSchema(db);
    else assertG7RuntimeSchema(db);
    for (const siteId of gate.siteIds ?? []) {
      if (!db.prepare('SELECT 1 FROM "CadSite" WHERE id=?').get(siteId))
        throw new Error('G7_RUNTIME_SITE_SCOPE');
    }
    return db;
  } catch (error) { db.close(); throw error; }
}
