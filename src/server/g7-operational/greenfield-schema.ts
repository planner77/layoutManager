/** #153: an independently installed, empty-database G7 baseline.
 * This is not a migration or an assertion about any previous CAD database.
 * The two password triggers are part of the final installed schema.
 */
import { createHash } from 'node:crypto';
import { CAD_BUSINESS_DDL, CAD_BUSINESS_OBJECT_NAMES,
  LATEST_CAD_BUSINESS_DDL, OUTLINE_TYPE_DDL, OUTLINE_TYPE_OBJECT_NAMES } from '../cad-business/schema-ddl';
import { CAD_ANCHOR_DDL, CAD_ANCHOR_OBJECT_NAMES } from '../cad-business/anchor-ddl';
import {CAD_MEMO_FEATURE_DDL,CAD_MEMO_FEATURE_OBJECT_NAMES} from '../cad-business/memo-feature-ddl';
import type { IsolatedDb } from '../g7-staging/g1-store';

export const G7_GREENFIELD_CAPABILITY = 'G7-GREENFIELD-AUTH-V1' as const;
export const G7_GREENFIELD_SCHEMA_ID = 'G7-GREENFIELD-OUTLINE-TYPES-20261031-1' as const;
export const G7_PREVIOUS_MEMO_SCHEMA_ID = 'G7-GREENFIELD-MEMO-M45-20261031-1' as const;
export const G7_PREVIOUS_ANCHOR_BASELINE='202610310001_greenfield_anchor_baseline' as const;
export const G7_PREVIOUS_ANCHOR_CHECKSUM=createHash('sha256').update('layoutManager:G7-GREENFIELD-ANCHOR-20261031-1:baseline').digest('hex');
export const G7_PREVIOUS_MEMO_BASELINE = '202610310002_greenfield_memo_m45_baseline' as const;
export const G7_GREENFIELD_BASELINE = '202610310003_greenfield_outline_types_baseline' as const;
export const G7_PREVIOUS_BUSINESS_BASELINE='202610300002_greenfield_business_baseline' as const;
export const G7_PREVIOUS_BUSINESS_CHECKSUM=createHash('sha256').update('layoutManager:G7-GREENFIELD-BUSINESS-20261030-1:baseline').digest('hex');
export const G7_SCENE_GREENFIELD_BASELINE = '202610300001_greenfield_scene_baseline' as const;
export const G7_SCENE_GREENFIELD_BASELINE_CHECKSUM = createHash('sha256').update('layoutManager:G7-GREENFIELD-SCENE-20261030-1:baseline').digest('hex');
export const G7_PREVIOUS_MEMO_CHECKSUM =
  createHash('sha256').update('layoutManager:G7-GREENFIELD-MEMO-M45-20261031-1:baseline').digest('hex');
export const G7_GREENFIELD_BASELINE_CHECKSUM =
  createHash('sha256').update('layoutManager:G7-GREENFIELD-OUTLINE-TYPES-20261031-1:baseline').digest('hex');
export const G7_OLD_GREENFIELD_BASELINE = '202610290001_greenfield_baseline' as const;
export const G7_OLD_GREENFIELD_BASELINE_CHECKSUM =
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
const G7_SCENE_DDL_SHA256 = '65651b4a199780ccb2357a5bb9d4ccf4b28b056bc701938299a5740642195151';
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
const schemaQuery = "SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name<>'_prisma_migrations' ORDER BY type,name";

export function assertG7GreenfieldSchema(db: IsolatedDb): void {
  const history = db.prepare('SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations"').all();
  const old=history.length===1&&history[0].migration_name===G7_OLD_GREENFIELD_BASELINE;
  const scene=history.length===1&&history[0].migration_name===G7_SCENE_GREENFIELD_BASELINE;
  const business=history.length===1&&history[0].migration_name===G7_PREVIOUS_BUSINESS_BASELINE;
  const anchor=history.length===1&&history[0].migration_name===G7_PREVIOUS_ANCHOR_BASELINE;
  const memo=history.length===1&&history[0].migration_name===G7_PREVIOUS_MEMO_BASELINE;
  const next=history.length===1&&history[0].migration_name===G7_GREENFIELD_BASELINE;
  if ((!old&&!scene&&!business&&!anchor&&!memo&&!next) ||
      history[0].checksum !== (old?G7_OLD_GREENFIELD_BASELINE_CHECKSUM:scene?G7_SCENE_GREENFIELD_BASELINE_CHECKSUM:business?G7_PREVIOUS_BUSINESS_CHECKSUM:anchor?G7_PREVIOUS_ANCHOR_CHECKSUM:memo?G7_PREVIOUS_MEMO_CHECKSUM:G7_GREENFIELD_BASELINE_CHECKSUM) ||
      history[0].finished_at == null || history[0].rolled_back_at != null)
    throw new Error('G7_GREENFIELD_INSTALL_HISTORY');

  const rows = db.prepare(schemaQuery).all() as {type:string;name:string;sql:string}[];
  const guards = rows.filter(row => row.type === 'trigger' && row.name.startsWith('cad_version_delete_password_'));
  if (guards.length !== 2 || guards.some(row => !G7_DELETE_PASSWORD_TRIGGERS.some(sql =>
      normalize(row.sql) === normalize(sql))))
    throw new Error('G7_GREENFIELD_DELETE_PASSWORD_GUARD');

  const normal = rows.filter(row => !guards.includes(row) && !CAD_BUSINESS_OBJECT_NAMES.has(row.name) && !CAD_ANCHOR_OBJECT_NAMES.has(row.name) && !CAD_MEMO_FEATURE_OBJECT_NAMES.has(row.name) && !OUTLINE_TYPE_OBJECT_NAMES.has(row.name)).map(row =>
    [row.type,row.name,normalize(row.sql)]);
  if (createHash('sha256').update(JSON.stringify(normal)).digest('hex') !== (old?G7_BASE_DDL_SHA256:G7_SCENE_DDL_SHA256))
    throw new Error('G7_GREENFIELD_SCHEMA_DRIFT');
  const extra = rows.filter(row => CAD_BUSINESS_OBJECT_NAMES.has(row.name)).map(row =>
    [row.type,row.name,normalize(row.sql)].join('|')).sort();
  const expected = next ? LATEST_CAD_BUSINESS_DDL.map(row =>
    [row.type,row.name,normalize(row.sql)].join('|')).sort() :
    (business || anchor || memo) ? CAD_BUSINESS_DDL.map(row =>
    [row.type,row.name,normalize(row.sql)].join('|')).sort() : [];
  if (JSON.stringify(extra)!==JSON.stringify(expected)) throw new Error('G7_GREENFIELD_BUSINESS_SCHEMA_DRIFT');
  const anchors=rows.filter(row=>CAD_ANCHOR_OBJECT_NAMES.has(row.name)).map(row=>
    [row.type,row.name,normalize(row.sql)].join('|')).sort();
  const expectedAnchors=(anchor||memo||next)?CAD_ANCHOR_DDL.map(row=>
    [row.type,row.name,normalize(row.sql)].join('|')).sort():[];
  if(JSON.stringify(anchors)!==JSON.stringify(expectedAnchors))
    throw new Error('G7_GREENFIELD_ANCHOR_SCHEMA_DRIFT');
  const memoFeatures=rows.filter(row=>CAD_MEMO_FEATURE_OBJECT_NAMES.has(row.name)).map(row=>
    [row.type,row.name,normalize(row.sql)].join('|')).sort();
  const expectedMemoFeatures=(memo||next)?CAD_MEMO_FEATURE_DDL.map(row=>
    [row.type,row.name,normalize(row.sql)].join('|')).sort():[];
  if(JSON.stringify(memoFeatures)!==JSON.stringify(expectedMemoFeatures))
    throw new Error('G7_GREENFIELD_MEMO_FEATURE_SCHEMA_DRIFT');
  const types=rows.filter(row=>OUTLINE_TYPE_OBJECT_NAMES.has(row.name)).map(row=>
    [row.type,row.name,normalize(row.sql)].join('|')).sort();
  const expectedTypes=next?OUTLINE_TYPE_DDL.map(row=>
    [row.type,row.name,normalize(row.sql)].join('|')).sort():[];
  if(JSON.stringify(types)!==JSON.stringify(expectedTypes))
    throw new Error('G7_GREENFIELD_OUTLINE_TYPE_SCHEMA_DRIFT');

  const check = db.prepare('PRAGMA quick_check').all();
  if (check.length !== 1 || Object.values(check[0])[0] !== 'ok' ||
      db.prepare('PRAGMA foreign_key_check').all().length !== 0)
    throw new Error('G7_GREENFIELD_INTEGRITY');
}
