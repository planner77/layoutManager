/** #153: an independently installed, empty-database G7 baseline.
 * This is not a migration or an assertion about any previous CAD database.
 * The two password triggers are part of the final installed schema.
 */
import { createHash } from 'node:crypto';
import type { IsolatedDb } from '../g7-staging/g1-store';

export const G7_GREENFIELD_CAPABILITY = 'G7-GREENFIELD-AUTH-V1' as const;
export const G7_GREENFIELD_SCHEMA_ID = 'G7-GREENFIELD-20261029-1' as const;
export const G7_GREENFIELD_BASELINE = '202610290001_greenfield_baseline' as const;
export const G7_GREENFIELD_BASELINE_CHECKSUM =
  createHash('sha256').update('layoutManager:G7-GREENFIELD-20261029-1:baseline').digest('hex');

// The production CAD backfill defines exactly these two independent guards.
// Do not replace with an allowlist of arbitrary extra sqlite_master objects.
export const G7_DELETE_PASSWORD_TRIGGERS = [
  'CREATE TRIGGER "cad_version_delete_password_insert" BEFORE INSERT ON "CadFileVersion" WHEN NEW."delete_password_hash" IS NULL OR length(NEW."delete_password_hash") = 0 BEGIN SELECT RAISE(ABORT, \'delete password hash required\'); END',
  'CREATE TRIGGER "cad_version_delete_password_update" BEFORE UPDATE OF "delete_password_hash" ON "CadFileVersion" WHEN NEW."delete_password_hash" IS NULL OR length(NEW."delete_password_hash") = 0 BEGIN SELECT RAISE(ABORT, \'delete password hash required\'); END',
] as const;

// Reviewed G7 final schema fingerprint before the two ordinary CAD guards.
// Used only to verify the fresh baseline's fixed DDL, never a legacy DB.
const G7_BASE_DDL_SHA256 = 'a937cf58b78710e8b501f7ec3211494c78316080b5c16732f9bf37e66765de6a';
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
const schemaQuery = "SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name<>'_prisma_migrations' ORDER BY type,name";

export function assertG7GreenfieldSchema(db: IsolatedDb): void {
  const history = db.prepare('SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations"').all();
  if (history.length !== 1 || history[0].migration_name !== G7_GREENFIELD_BASELINE ||
      history[0].checksum !== G7_GREENFIELD_BASELINE_CHECKSUM ||
      history[0].finished_at == null || history[0].rolled_back_at != null)
    throw new Error('G7_GREENFIELD_INSTALL_HISTORY');

  const rows = db.prepare(schemaQuery).all() as {type:string;name:string;sql:string}[];
  const guards = rows.filter(row => row.type === 'trigger' && row.name.startsWith('cad_version_delete_password_'));
  if (guards.length !== 2 || guards.some(row => !G7_DELETE_PASSWORD_TRIGGERS.some(sql =>
      normalize(row.sql) === normalize(sql))))
    throw new Error('G7_GREENFIELD_DELETE_PASSWORD_GUARD');

  const normal = rows.filter(row => !guards.includes(row)).map(row =>
    [row.type,row.name,normalize(row.sql)]);
  if (createHash('sha256').update(JSON.stringify(normal)).digest('hex') !== G7_BASE_DDL_SHA256)
    throw new Error('G7_GREENFIELD_SCHEMA_DRIFT');

  const check = db.prepare('PRAGMA quick_check').all();
  if (check.length !== 1 || Object.values(check[0])[0] !== 'ok' ||
      db.prepare('PRAGMA foreign_key_check').all().length !== 0)
    throw new Error('G7_GREENFIELD_INTEGRITY');
}
