/** Reviewed, bundled Greenfield release declarations. External JSON/env cannot add edges. */
import { G7_GREENFIELD_BASELINE, G7_GREENFIELD_BASELINE_CHECKSUM,
  G7_GREENFIELD_SCHEMA_ID, G7_PREVIOUS_ZONES_SCHEMA_ID,
  G7_PREVIOUS_SCENE_JOB_SCHEMA_ID,G7_PREVIOUS_SCENE_JOB_BASELINE,
  G7_PREVIOUS_SCENE_JOB_BASELINE_CHECKSUM,
  G7_PREVIOUS_ZONES_BASELINE, G7_PREVIOUS_ZONES_BASELINE_CHECKSUM,
  assertG7GreenfieldSchema } from './greenfield-schema';
import {SCENE_BUILD_JOB_MIGRATION_SQL,SCENE_BUILD_JOB_MIGRATION_CHECKSUM,
  SCENE_JOB_MIGRATION_NAME} from './scene-job-ddl';
import {SCENE_CPU_MIGRATION_SQL,SCENE_CPU_MIGRATION_CHECKSUM,
  SCENE_CPU_MIGRATION_NAME} from './scene-cpu-ddl';
import { createHash } from 'node:crypto';
import type { IsolatedDb } from '../g7-staging/g1-store';

export type ReleaseDeclaration = Readonly<{
  version:string; schemaId:string; baseline:string; checksum:string;
  dataContract:string; runtimeContract:string;
  /** Exact hash of ordered, whitespace-normalized sqlite_master DDL for new schemas. */
  ddlSha256?:string;
  history?:readonly {name:string;checksum:string}[];
}>;
export type MigrationEdge = Readonly<{
  from:string; to:string; kind:'COMPATIBLE'|'MIGRATION';
  /** Required for MIGRATION. SQL is reviewed source, never supplied by operator. */
  sql?:string; sqlSha256?:string; migrationName?:string; migrationChecksum?:string;
  precondition?:string; postcondition?:string;
}>;
export type UpgradeRegistry = Readonly<{releases:readonly ReleaseDeclaration[];edges:readonly MigrationEdge[]}>;

/** Existing v0.56.0..v0.59.0 G7 release declarations are immutable. */
const zones=(version:string):ReleaseDeclaration=>({version,
  schemaId:G7_PREVIOUS_ZONES_SCHEMA_ID,baseline:G7_PREVIOUS_ZONES_BASELINE,
  checksum:G7_PREVIOUS_ZONES_BASELINE_CHECKSUM,
  dataContract:'G7-ZONES-DATA-V1',runtimeContract:'G7-ZONES-RUNTIME-V1'});

/** New schema changes are a signed MIGRATION, never a COMPATIBLE DDL change.
 * The full verified schema is checked by assertG7GreenfieldSchema, including
 * the exact allowlisted five Job objects and both approved history forms.
 */
const sceneJobs=(version:string):ReleaseDeclaration=>({version,
  schemaId:G7_PREVIOUS_SCENE_JOB_SCHEMA_ID,baseline:G7_PREVIOUS_SCENE_JOB_BASELINE,
  checksum:G7_PREVIOUS_SCENE_JOB_BASELINE_CHECKSUM,
  dataContract:'G7-SCENE-JOBS-DATA-V1',runtimeContract:'G7-SCENE-JOBS-RUNTIME-V1'});
const cpuWorker=(version:string):ReleaseDeclaration=>({version,
  schemaId:G7_GREENFIELD_SCHEMA_ID,baseline:G7_GREENFIELD_BASELINE,
  checksum:G7_GREENFIELD_BASELINE_CHECKSUM,
  dataContract:'G7-SCENE-JOBS-DATA-V1',runtimeContract:'G7-CPU-WORKER-RUNTIME-V1'});
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
export const GREENFIELD_UPGRADE_REGISTRY:UpgradeRegistry={
  releases:[zones('0.56.0'),zones('0.57.0'),zones('0.58.0'),
    zones('0.58.1'),zones('0.59.0'),sceneJobs('0.60.0'),cpuWorker('0.61.0'),cpuWorker('0.61.1')],
  edges:[{from:'0.56.0',to:'0.57.0',kind:'COMPATIBLE'},
    {from:'0.57.0',to:'0.58.0',kind:'COMPATIBLE'},
    {from:'0.58.0',to:'0.58.1',kind:'COMPATIBLE'},
    {from:'0.58.1',to:'0.59.0',kind:'COMPATIBLE'},
    {from:'0.59.0',to:'0.60.0',kind:'MIGRATION',
      sql:SCENE_BUILD_JOB_MIGRATION_SQL,
      sqlSha256:sha(SCENE_BUILD_JOB_MIGRATION_SQL),
      migrationName:SCENE_JOB_MIGRATION_NAME,
      migrationChecksum:SCENE_BUILD_JOB_MIGRATION_CHECKSUM,
      precondition:"SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='SceneBuildJob') THEN 1 ELSE 0 END AS ok",
      postcondition:"SELECT CASE WHEN EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='SceneBuildJob') AND EXISTS(SELECT 1 FROM sqlite_master WHERE type='index' AND name='uq_scene_build_one_running') THEN 1 ELSE 0 END AS ok"},
    {from:'0.60.0',to:'0.61.0',kind:'MIGRATION',
      sql:SCENE_CPU_MIGRATION_SQL,sqlSha256:sha(SCENE_CPU_MIGRATION_SQL),
      migrationName:SCENE_CPU_MIGRATION_NAME,migrationChecksum:SCENE_CPU_MIGRATION_CHECKSUM,
      precondition:"SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sqlite_master WHERE name='ix_scene_build_cpu_due') AND EXISTS(SELECT 1 FROM sqlite_master WHERE name='SceneBuildJob') THEN 1 ELSE 0 END AS ok",
      postcondition:"SELECT CASE WHEN EXISTS(SELECT 1 FROM sqlite_master WHERE type='index' AND name='ix_scene_build_cpu_due') THEN 1 ELSE 0 END AS ok"},
    {from:'0.61.0',to:'0.61.1',kind:'COMPATIBLE'}],
};

function forward(from:string,to:string):boolean {
  const a=/^(\d+)\.(\d+)\.(\d+)$/.exec(from);
  const b=/^(\d+)\.(\d+)\.(\d+)$/.exec(to);
  if(!a||!b)return false;
  for(let i=1;i<=3;i++){
    const x=Number(a[i]),y=Number(b[i]);
    if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y))return false;
    if(y>x)return true;
    if(y<x)return false;
  }
  return false;
}

export function resolveUpgradeChain(registry:UpgradeRegistry,from:string,to:string):readonly MigrationEdge[] {
  const source=registry.releases.find(r=>r.version===from);
  const target=registry.releases.find(r=>r.version===to);
  if(!source||!target)throw new Error('G7_UPGRADE_UNSUPPORTED_PATH');
  if(from===to)return [];
  const visited=new Set<string>([from]);
  const queue:{version:string;chain:readonly MigrationEdge[]}[]=[{version:from,chain:[]}];
  while(queue.length){
    const next=queue.shift()!;
    for(const edge of registry.edges.filter(e=>e.from===next.version)){
      if(!forward(edge.from,edge.to))throw new Error('G7_UPGRADE_UNSUPPORTED_PATH');
      if(visited.has(edge.to))continue;
      const a=registry.releases.find(r=>r.version===edge.from);
      const b=registry.releases.find(r=>r.version===edge.to);
      if(!a||!b)throw new Error('G7_UPGRADE_UNSUPPORTED_PATH');
      if(edge.kind==='COMPATIBLE' && (a.schemaId!==b.schemaId||a.baseline!==b.baseline||
        a.checksum!==b.checksum||a.ddlSha256!==b.ddlSha256||
        JSON.stringify(a.history??[])!==JSON.stringify(b.history??[])||
        a.dataContract!==b.dataContract||
        a.runtimeContract!==b.runtimeContract))throw new Error('G7_UPGRADE_SCHEMA_INCOMPATIBLE');
      if(edge.kind==='MIGRATION' && (!edge.sql||!edge.sqlSha256||!edge.migrationName||
        !edge.migrationChecksum||!edge.precondition||!edge.postcondition||
        !b.ddlSha256&&b.schemaId!==G7_GREENFIELD_SCHEMA_ID&&
        b.schemaId!==G7_PREVIOUS_SCENE_JOB_SCHEMA_ID))
        throw new Error('G7_UPGRADE_UNSUPPORTED_PATH');
      const chain=[...next.chain,edge];
      if(edge.to===to)return chain;
      visited.add(edge.to);queue.push({version:edge.to,chain});
    }
  }
  throw new Error('G7_UPGRADE_UNSUPPORTED_PATH');
}

const normalize=(sql:string)=>sql.replace(/\s+/g,' ').trim();
export function ddlSha256(db:IsolatedDb):string {
  const rows=db.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name<>'_prisma_migrations' ORDER BY type,name")
    .all().map(row=>[row.type,row.name,normalize(String(row.sql))]);
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
export function assertDeclaredSchema(db:IsolatedDb,release:ReleaseDeclaration):void{
  // The new reviewed schema is fully validated by the exact G7 schema object
  // allowlist rather than a mutable/unknown external DDL digest.
  // Fresh install: one new baseline; upgrade: old zone baseline + one signed
  // append-only migration row. Never permit an old 0.59.0 schema for 0.60.0.
  if(release.schemaId===G7_GREENFIELD_SCHEMA_ID||
     release.schemaId===G7_PREVIOUS_SCENE_JOB_SCHEMA_ID){
    const history=db.prepare('SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY rowid').all();
    const oldFresh=history.length===1&&
      history[0].migration_name===G7_PREVIOUS_SCENE_JOB_BASELINE&&
      history[0].checksum===G7_PREVIOUS_SCENE_JOB_BASELINE_CHECKSUM;
    const oldUpgraded=history.length===2&&
      history[0].migration_name===G7_PREVIOUS_ZONES_BASELINE&&
      history[0].checksum===G7_PREVIOUS_ZONES_BASELINE_CHECKSUM&&
      history[1].migration_name===SCENE_JOB_MIGRATION_NAME&&
      history[1].checksum===SCENE_BUILD_JOB_MIGRATION_CHECKSUM;
    const newFresh=history.length===1&&
      history[0].migration_name===G7_GREENFIELD_BASELINE&&
      history[0].checksum===G7_GREENFIELD_BASELINE_CHECKSUM;
    const fromJobs=history.length===2&&
      history[0].migration_name===G7_PREVIOUS_SCENE_JOB_BASELINE&&
      history[0].checksum===G7_PREVIOUS_SCENE_JOB_BASELINE_CHECKSUM&&
      history[1].migration_name===SCENE_CPU_MIGRATION_NAME&&
      history[1].checksum===SCENE_CPU_MIGRATION_CHECKSUM;
    const fromZones=history.length===3&&
      history[0].migration_name===G7_PREVIOUS_ZONES_BASELINE&&
      history[0].checksum===G7_PREVIOUS_ZONES_BASELINE_CHECKSUM&&
      history[1].migration_name===SCENE_JOB_MIGRATION_NAME&&
      history[1].checksum===SCENE_BUILD_JOB_MIGRATION_CHECKSUM&&
      history[2].migration_name===SCENE_CPU_MIGRATION_NAME&&
      history[2].checksum===SCENE_CPU_MIGRATION_CHECKSUM;
    const valid=release.schemaId===G7_GREENFIELD_SCHEMA_ID
      ?newFresh||fromJobs||fromZones:oldFresh||oldUpgraded;
    if(!valid||history.some(row=>row.finished_at==null||row.rolled_back_at!=null))
      throw new Error('G7_UPGRADE_SCHEMA_INCOMPATIBLE');
    assertG7GreenfieldSchema(db);
    return;
  }
  const history=db.prepare('SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY rowid').all();
  const expected=release.history??[{name:release.baseline,checksum:release.checksum}];
  if(history.length!==expected.length||history.some((row,i)=>
    row.migration_name!==expected[i].name||row.checksum!==expected[i].checksum||
    row.finished_at==null||row.rolled_back_at!=null))
    throw new Error('G7_UPGRADE_SCHEMA_INCOMPATIBLE');
  if(release.ddlSha256){
    if(ddlSha256(db)!==release.ddlSha256)throw new Error('G7_UPGRADE_SCHEMA_INCOMPATIBLE');
    const check=db.prepare('PRAGMA quick_check').all();
    if(check.length!==1||Object.values(check[0])[0]!=='ok'||
      db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('G7_UPGRADE_SCHEMA_INCOMPATIBLE');
  }else{
    if(release.baseline!==G7_PREVIOUS_ZONES_BASELINE||
      release.checksum!==G7_PREVIOUS_ZONES_BASELINE_CHECKSUM)
      throw new Error('G7_UPGRADE_SCHEMA_INCOMPATIBLE');
    assertG7GreenfieldSchema(db);
  }
}
