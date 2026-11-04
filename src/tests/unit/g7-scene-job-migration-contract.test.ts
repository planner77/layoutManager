import {describe,expect,test} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {G7_GREENFIELD_SCHEMA_ID, G7_GREENFIELD_BASELINE,
  G7_PREVIOUS_SCENE_JOB_SCHEMA_ID,G7_PREVIOUS_SCENE_JOB_BASELINE,
  G7_PREVIOUS_ZONES_SCHEMA_ID, G7_PREVIOUS_ZONES_BASELINE,
  hasG7FeatureSchemaHistory} from '../../server/g7-operational/greenfield-schema';
import {GREENFIELD_UPGRADE_REGISTRY,resolveUpgradeChain} from
  '../../server/g7-operational/greenfield-upgrade-registry';
import {SCENE_BUILD_JOB_DDL,SCENE_BUILD_JOB_MIGRATION_SQL,
  SCENE_BUILD_JOB_MIGRATION_CHECKSUM,SCENE_JOB_MIGRATION_NAME} from
  '../../server/g7-operational/scene-job-ddl';

describe('#225 B1 G7 migration registration — 0.59 immutable / 0.60 candidate',()=>{
 test('reviewed SQL file and runtime-registered statements are byte-semantically identical',()=>{
  const raw=readFileSync(new URL('../../deploy/scene-build-jobs/migration.sql',import.meta.url),'utf8');
  const statements=raw.split('\n').filter(x=>!x.trimStart().startsWith('--')).join('\n')
    .split(';').map(x=>x.trim()).filter(Boolean);
  expect(statements).toEqual(SCENE_BUILD_JOB_DDL.map(x=>x.sql));
  expect(SCENE_BUILD_JOB_DDL.map(x=>x.name)).toEqual([
    'SceneBuildJob','uq_scene_build_identity','uq_scene_build_one_running',
    'ix_scene_build_due','ix_scene_build_version',
  ]);
  expect(createHash('sha256').update(SCENE_BUILD_JOB_MIGRATION_SQL).digest('hex'))
    .toBe(SCENE_BUILD_JOB_MIGRATION_CHECKSUM);
  expect(SCENE_BUILD_JOB_MIGRATION_SQL).toContain('WHERE "status"=\'RUNNING\'');
 });
 test('0.59 stays on zones baseline; next version uses migration rather than compatible edge',()=>{
  const old=GREENFIELD_UPGRADE_REGISTRY.releases.find(x=>x.version==='0.59.0')!;
  const next=GREENFIELD_UPGRADE_REGISTRY.releases.find(x=>x.version==='0.60.0')!;
  expect(old.schemaId).toBe(G7_PREVIOUS_ZONES_SCHEMA_ID);
  expect(old.baseline).toBe(G7_PREVIOUS_ZONES_BASELINE);
  expect(next.schemaId).toBe(G7_PREVIOUS_SCENE_JOB_SCHEMA_ID);
  expect(next.baseline).toBe(G7_PREVIOUS_SCENE_JOB_BASELINE);
  expect(GREENFIELD_UPGRADE_REGISTRY.releases.find(x=>x.version==='0.61.0'))
    .toMatchObject({schemaId:G7_GREENFIELD_SCHEMA_ID,baseline:G7_GREENFIELD_BASELINE});
  const chain=resolveUpgradeChain(GREENFIELD_UPGRADE_REGISTRY,'0.59.0','0.60.0');
  expect(chain).toHaveLength(1);
  expect(chain[0]).toMatchObject({kind:'MIGRATION',
    migrationName:SCENE_JOB_MIGRATION_NAME,
    sql:SCENE_BUILD_JOB_MIGRATION_SQL,
    migrationChecksum:SCENE_BUILD_JOB_MIGRATION_CHECKSUM});
  expect(()=>resolveUpgradeChain(GREENFIELD_UPGRADE_REGISTRY,'0.60.0','0.59.0'))
    .toThrow('G7_UPGRADE_UNSUPPORTED_PATH');
 });
 test('business feature gates recognize prior and migrated markers without accepting drift shapes',()=>{
  const prev=[{migration_name:G7_PREVIOUS_ZONES_BASELINE}];
  const fresh=[{migration_name:G7_GREENFIELD_BASELINE}];
  const previousFresh=[{migration_name:G7_PREVIOUS_SCENE_JOB_BASELINE}];
  const migrated=[...prev,{migration_name:SCENE_JOB_MIGRATION_NAME}];
  for(const feature of ['zone','typed-outline','outline-type'] as const){
   for(const history of [prev,fresh,previousFresh,migrated])
    expect(hasG7FeatureSchemaHistory(history,feature)).toBe(true);
   expect(hasG7FeatureSchemaHistory([...migrated,{migration_name:'evil'}],feature)).toBe(false);
   expect(hasG7FeatureSchemaHistory(migrated.slice().reverse(),feature)).toBe(false);
  }
  expect(hasG7FeatureSchemaHistory(
    [{migration_name:'202611010001_greenfield_typed_outlines_baseline'}],'zone'))
    .toBe(false);
 });
});
