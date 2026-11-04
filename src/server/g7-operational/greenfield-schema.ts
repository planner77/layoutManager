/** #153: an independently installed, empty-database G7 baseline.
 * This is not a migration or an assertion about any previous CAD database.
 * The two password triggers are part of the final installed schema.
 */
import { createHash } from 'node:crypto';
import { CAD_BUSINESS_DDL, CAD_BUSINESS_OBJECT_NAMES,
  LATEST_CAD_BUSINESS_DDL, OUTLINE_TYPE_DDL, OUTLINE_TYPE_OBJECT_NAMES,
  CAD_OUTLINE_RECEIPT_DDL, CAD_OUTLINE_RECEIPT_OBJECT_NAMES } from '../cad-business/schema-ddl';
import { CAD_ANCHOR_DDL, CAD_ANCHOR_OBJECT_NAMES } from '../cad-business/anchor-ddl';
import {CAD_MEMO_FEATURE_DDL,CAD_MEMO_FEATURE_OBJECT_NAMES} from '../cad-business/memo-feature-ddl';
import {CAD_ZONE_DDL,CAD_ZONE_OBJECT_NAMES} from '../cad-business/zone-ddl';
import type { IsolatedDb } from '../g7-staging/g1-store';
import {SCENE_BUILD_JOB_DDL, SCENE_BUILD_JOB_OBJECT_NAMES,
  SCENE_JOB_MIGRATION_NAME, SCENE_BUILD_JOB_MIGRATION_CHECKSUM} from './scene-job-ddl';
import {SCENE_CPU_INDEX_DDL,SCENE_CPU_OBJECT_NAMES,
  SCENE_CPU_MIGRATION_NAME,SCENE_CPU_MIGRATION_CHECKSUM} from './scene-cpu-ddl';

export const G7_GREENFIELD_CAPABILITY = 'G7-GREENFIELD-AUTH-V1' as const;
export const G7_PREVIOUS_ZONES_SCHEMA_ID='G7-GREENFIELD-SEMANTIC-ZONES-20261101-1' as const;
export const G7_PREVIOUS_SCENE_JOB_SCHEMA_ID='G7-GREENFIELD-SCENE-JOBS-20261104-1' as const;
export const G7_GREENFIELD_SCHEMA_ID='G7-GREENFIELD-CPU-WORKER-20261104-1' as const;
export const G7_PREVIOUS_TYPED_OUTLINES_BASELINE = '202611010001_greenfield_typed_outlines_baseline' as const;
export const G7_PREVIOUS_TYPED_OUTLINES_CHECKSUM = createHash('sha256').update('layoutManager:G7-GREENFIELD-TYPED-OUTLINES-20261101-1:baseline').digest('hex');
export const G7_PREVIOUS_TYPES_SCHEMA_ID = 'G7-GREENFIELD-OUTLINE-TYPES-20261031-1' as const;
export const G7_PREVIOUS_MEMO_SCHEMA_ID = 'G7-GREENFIELD-MEMO-M45-20261031-1' as const;
export const G7_PREVIOUS_ANCHOR_BASELINE='202610310001_greenfield_anchor_baseline' as const;
export const G7_PREVIOUS_ANCHOR_CHECKSUM=createHash('sha256').update('layoutManager:G7-GREENFIELD-ANCHOR-20261031-1:baseline').digest('hex');
export const G7_PREVIOUS_MEMO_BASELINE = '202610310002_greenfield_memo_m45_baseline' as const;
export const G7_PREVIOUS_TYPES_BASELINE = '202610310003_greenfield_outline_types_baseline' as const;
export const G7_PREVIOUS_ZONES_BASELINE='202611010002_greenfield_semantic_zones_baseline' as const;
export const G7_PREVIOUS_SCENE_JOB_BASELINE='202611040002_greenfield_scene_jobs_baseline' as const;
export const G7_GREENFIELD_BASELINE='202611040004_greenfield_cpu_worker_baseline' as const;
export const G7_PREVIOUS_BUSINESS_BASELINE='202610300002_greenfield_business_baseline' as const;
export const G7_PREVIOUS_BUSINESS_CHECKSUM=createHash('sha256').update('layoutManager:G7-GREENFIELD-BUSINESS-20261030-1:baseline').digest('hex');
export const G7_SCENE_GREENFIELD_BASELINE = '202610300001_greenfield_scene_baseline' as const;
export const G7_SCENE_GREENFIELD_BASELINE_CHECKSUM = createHash('sha256').update('layoutManager:G7-GREENFIELD-SCENE-20261030-1:baseline').digest('hex');
export const G7_PREVIOUS_MEMO_CHECKSUM =
  createHash('sha256').update('layoutManager:G7-GREENFIELD-MEMO-M45-20261031-1:baseline').digest('hex');
export const G7_PREVIOUS_TYPES_CHECKSUM =
  createHash('sha256').update('layoutManager:G7-GREENFIELD-OUTLINE-TYPES-20261031-1:baseline').digest('hex');
export const G7_PREVIOUS_ZONES_BASELINE_CHECKSUM=
  createHash('sha256').update('layoutManager:G7-GREENFIELD-SEMANTIC-ZONES-20261101-1:baseline').digest('hex');
export const G7_PREVIOUS_SCENE_JOB_BASELINE_CHECKSUM=
  createHash('sha256').update('layoutManager:G7-GREENFIELD-SCENE-JOBS-20261104-1:baseline').digest('hex');
export const G7_GREENFIELD_BASELINE_CHECKSUM=
  createHash('sha256').update('layoutManager:G7-GREENFIELD-CPU-WORKER-20261104-1:baseline').digest('hex');
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

/** Validates every historical frozen baseline and the new forward Job schema.
 * For v0.60.0: fresh Greenfield has one new baseline; 0.59.0 upgrade keeps its
 * original zones baseline and appends the reviewed SceneBuildJob migration.
 * Neither path approves unknown DDL, arbitrary indexes or untracked history.
 */
export function assertG7GreenfieldSchema(db:IsolatedDb):void{
  const history=db.prepare('SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY rowid').all();
  const one=history.length===1;
  const old=one&&history[0].migration_name===G7_OLD_GREENFIELD_BASELINE;
  const scene=one&&history[0].migration_name===G7_SCENE_GREENFIELD_BASELINE;
  const business=one&&history[0].migration_name===G7_PREVIOUS_BUSINESS_BASELINE;
  const anchor=one&&history[0].migration_name===G7_PREVIOUS_ANCHOR_BASELINE;
  const memo=one&&history[0].migration_name===G7_PREVIOUS_MEMO_BASELINE;
  const previousTypes=one&&history[0].migration_name===G7_PREVIOUS_TYPES_BASELINE;
  const previousTyped=one&&history[0].migration_name===G7_PREVIOUS_TYPED_OUTLINES_BASELINE;
  const previousZones=one&&history[0].migration_name===G7_PREVIOUS_ZONES_BASELINE;
  const freshJobs=one&&history[0].migration_name===G7_PREVIOUS_SCENE_JOB_BASELINE;
  const freshCpu=one&&history[0].migration_name===G7_GREENFIELD_BASELINE;
  const upgradedJobs=history.length===2 &&
    history[0].migration_name===G7_PREVIOUS_ZONES_BASELINE &&
    history[0].checksum===G7_PREVIOUS_ZONES_BASELINE_CHECKSUM &&
    history[1].migration_name===SCENE_JOB_MIGRATION_NAME &&
    history[1].checksum===SCENE_BUILD_JOB_MIGRATION_CHECKSUM;
  const upgradedCpuJobs=history.length===2 &&
    history[0].migration_name===G7_PREVIOUS_SCENE_JOB_BASELINE &&
    history[0].checksum===G7_PREVIOUS_SCENE_JOB_BASELINE_CHECKSUM &&
    history[1].migration_name===SCENE_CPU_MIGRATION_NAME &&
    history[1].checksum===SCENE_CPU_MIGRATION_CHECKSUM;
  const upgradedCpuZones=history.length===3 &&
    history[0].migration_name===G7_PREVIOUS_ZONES_BASELINE &&
    history[0].checksum===G7_PREVIOUS_ZONES_BASELINE_CHECKSUM &&
    history[1].migration_name===SCENE_JOB_MIGRATION_NAME &&
    history[1].checksum===SCENE_BUILD_JOB_MIGRATION_CHECKSUM &&
    history[2].migration_name===SCENE_CPU_MIGRATION_NAME &&
    history[2].checksum===SCENE_CPU_MIGRATION_CHECKSUM;
  const expectedChecksum=old?G7_OLD_GREENFIELD_BASELINE_CHECKSUM:
    scene?G7_SCENE_GREENFIELD_BASELINE_CHECKSUM:
    business?G7_PREVIOUS_BUSINESS_CHECKSUM:
    anchor?G7_PREVIOUS_ANCHOR_CHECKSUM:
    memo?G7_PREVIOUS_MEMO_CHECKSUM:
    previousTypes?G7_PREVIOUS_TYPES_CHECKSUM:
    previousTyped?G7_PREVIOUS_TYPED_OUTLINES_CHECKSUM:
    previousZones?G7_PREVIOUS_ZONES_BASELINE_CHECKSUM:
    freshJobs?G7_PREVIOUS_SCENE_JOB_BASELINE_CHECKSUM:
    freshCpu?G7_GREENFIELD_BASELINE_CHECKSUM:'';
  if(!(old||scene||business||anchor||memo||previousTypes||previousTyped||
       previousZones||freshJobs||upgradedJobs||freshCpu||upgradedCpuJobs||upgradedCpuZones) ||
     one&&history[0].checksum!==expectedChecksum ||
     history.some(row=>row.finished_at==null||row.rolled_back_at!=null))
    throw new Error('G7_GREENFIELD_INSTALL_HISTORY');

  const rows=db.prepare(schemaQuery).all() as {type:string;name:string;sql:string}[];
  const guards=rows.filter(row=>row.type==='trigger'&&row.name.startsWith('cad_version_delete_password_'));
  if(guards.length!==2||guards.some(row=>!G7_DELETE_PASSWORD_TRIGGERS.some(sql=>
      normalize(row.sql)===normalize(sql))))
    throw new Error('G7_GREENFIELD_DELETE_PASSWORD_GUARD');

  const normal=rows.filter(row=>!guards.includes(row)&&
    !CAD_BUSINESS_OBJECT_NAMES.has(row.name)&&!CAD_ANCHOR_OBJECT_NAMES.has(row.name)&&
    !CAD_MEMO_FEATURE_OBJECT_NAMES.has(row.name)&&!OUTLINE_TYPE_OBJECT_NAMES.has(row.name)&&
    !CAD_OUTLINE_RECEIPT_OBJECT_NAMES.has(row.name)&&!CAD_ZONE_OBJECT_NAMES.has(row.name)&&
    !SCENE_BUILD_JOB_OBJECT_NAMES.has(row.name)&&!SCENE_CPU_OBJECT_NAMES.has(row.name))
    .map(row=>[row.type,row.name,normalize(row.sql)]);
  if(createHash('sha256').update(JSON.stringify(normal)).digest('hex')!==
     (old?G7_BASE_DDL_SHA256:G7_SCENE_DDL_SHA256))
    throw new Error('G7_GREENFIELD_SCHEMA_DRIFT');

  const modern=previousZones||freshJobs||upgradedJobs||freshCpu||upgradedCpuJobs||upgradedCpuZones;
  const businessRows=rows.filter(row=>CAD_BUSINESS_OBJECT_NAMES.has(row.name))
    .map(row=>[row.type,row.name,normalize(row.sql)].join('|')).sort();
  const expectedBusiness=(modern||previousTyped||previousTypes
    ?LATEST_CAD_BUSINESS_DDL:(business||anchor||memo?CAD_BUSINESS_DDL:[]))
    .map(row=>[row.type,row.name,normalize(row.sql)].join('|')).sort();
  if(JSON.stringify(businessRows)!==JSON.stringify(expectedBusiness))
    throw new Error('G7_GREENFIELD_BUSINESS_SCHEMA_DRIFT');

  const presentAnchors=rows.filter(row=>CAD_ANCHOR_OBJECT_NAMES.has(row.name))
    .map(row=>[row.type,row.name,normalize(row.sql)].join('|')).sort();
  const expectedAnchors=(anchor||memo||previousTypes||previousTyped||modern
    ?CAD_ANCHOR_DDL:[]).map(row=>[row.type,row.name,normalize(row.sql)].join('|')).sort();
  if(JSON.stringify(presentAnchors)!==JSON.stringify(expectedAnchors))
    throw new Error('G7_GREENFIELD_ANCHOR_SCHEMA_DRIFT');

  const presentMemo=rows.filter(row=>CAD_MEMO_FEATURE_OBJECT_NAMES.has(row.name))
    .map(row=>[row.type,row.name,normalize(row.sql)].join('|')).sort();
  const expectedMemo=(memo||previousTypes||previousTyped||modern?CAD_MEMO_FEATURE_DDL:[])
    .map(row=>[row.type,row.name,normalize(row.sql)].join('|')).sort();
  if(JSON.stringify(presentMemo)!==JSON.stringify(expectedMemo))
    throw new Error('G7_GREENFIELD_MEMO_FEATURE_SCHEMA_DRIFT');

  const presentTypes=rows.filter(row=>OUTLINE_TYPE_OBJECT_NAMES.has(row.name))
    .map(row=>[row.type,row.name,normalize(row.sql)].join('|')).sort();
  const expectedTypes=(previousTypes||previousTyped||modern?OUTLINE_TYPE_DDL:[])
    .map(row=>[row.type,row.name,normalize(row.sql)].join('|')).sort();
  if(JSON.stringify(presentTypes)!==JSON.stringify(expectedTypes))
    throw new Error('G7_GREENFIELD_OUTLINE_TYPE_SCHEMA_DRIFT');

  const presentReceipts=rows.filter(row=>CAD_OUTLINE_RECEIPT_OBJECT_NAMES.has(row.name))
    .map(row=>[row.type,row.name,normalize(row.sql)].join('|')).sort();
  const expectedReceipts=(previousTyped||modern?CAD_OUTLINE_RECEIPT_DDL:[])
    .map(row=>[row.type,row.name,normalize(row.sql)].join('|')).sort();
  if(JSON.stringify(presentReceipts)!==JSON.stringify(expectedReceipts))
    throw new Error('G7_GREENFIELD_OUTLINE_RECEIPT_SCHEMA_DRIFT');

  const presentZones=rows.filter(row=>CAD_ZONE_OBJECT_NAMES.has(row.name))
    .map(row=>[row.type,row.name,normalize(row.sql)].join('|')).sort();
  const expectedZones=(modern?CAD_ZONE_DDL:[])
    .map(row=>[row.type,row.name,normalize(row.sql)].join('|')).sort();
  if(JSON.stringify(presentZones)!==JSON.stringify(expectedZones))
    throw new Error('G7_GREENFIELD_ZONE_SCHEMA_DRIFT');

  const presentJobs=rows.filter(row=>SCENE_BUILD_JOB_OBJECT_NAMES.has(row.name))
    .map(row=>[row.type,row.name,normalize(row.sql)].join('|')).sort();
  const expectedJobs=(freshJobs||upgradedJobs||freshCpu||upgradedCpuJobs||upgradedCpuZones?SCENE_BUILD_JOB_DDL:[])
    .map(row=>[row.type,row.name,normalize(row.sql)].join('|')).sort();
  if(JSON.stringify(presentJobs)!==JSON.stringify(expectedJobs))
    throw new Error('G7_GREENFIELD_SCENE_JOB_SCHEMA_DRIFT');
  const presentCpu=rows.filter(row=>SCENE_CPU_OBJECT_NAMES.has(row.name))
    .map(row=>[row.type,row.name,normalize(row.sql)].join('|')).sort();
  const expectedCpu=(freshCpu||upgradedCpuJobs||upgradedCpuZones?[SCENE_CPU_INDEX_DDL]:[])
    .map(row=>[row.type,row.name,normalize(row.sql)].join('|')).sort();
  if(JSON.stringify(presentCpu)!==JSON.stringify(expectedCpu))
    throw new Error('G7_GREENFIELD_CPU_WORKER_SCHEMA_DRIFT');

  const check=db.prepare('PRAGMA quick_check').all();
  if(check.length!==1||Object.values(check[0])[0]!=='ok'||
     db.prepare('PRAGMA foreign_key_check').all().length!==0)
    throw new Error('G7_GREENFIELD_INTEGRITY');
}

/** For business feature routing only: a narrow marker shape classifier.
 * Signed runtime open / G7 schema verification remains the authority for
 * checksums, complete DDL, permissions and database integrity.
 */
export function hasG7FeatureSchemaHistory(
  rows:readonly {migration_name:string}[],
  feature:'zone'|'typed-outline'|'outline-type',
):boolean{
  const single=rows.length===1?rows[0].migration_name:null;
  const upgraded=rows.length===2 &&
    rows[0].migration_name===G7_PREVIOUS_ZONES_BASELINE &&
    rows[1].migration_name===SCENE_JOB_MIGRATION_NAME;
  const cpuJobs=rows.length===2 &&
    rows[0].migration_name===G7_PREVIOUS_SCENE_JOB_BASELINE &&
    rows[1].migration_name===SCENE_CPU_MIGRATION_NAME;
  const cpuZones=rows.length===3 &&
    rows[0].migration_name===G7_PREVIOUS_ZONES_BASELINE &&
    rows[1].migration_name===SCENE_JOB_MIGRATION_NAME &&
    rows[2].migration_name===SCENE_CPU_MIGRATION_NAME;
  const modern=upgraded||cpuJobs||cpuZones||single===G7_GREENFIELD_BASELINE||
    single===G7_PREVIOUS_SCENE_JOB_BASELINE||single===G7_PREVIOUS_ZONES_BASELINE;
  if(feature==='zone')return modern;
  if(feature==='typed-outline')return modern||single===G7_PREVIOUS_TYPED_OUTLINES_BASELINE;
  return modern||single===G7_PREVIOUS_TYPED_OUTLINES_BASELINE||
    single===G7_PREVIOUS_TYPES_BASELINE;
}
