import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GREENFIELD_UPGRADE_REGISTRY,resolveUpgradeChain} from
  '../../server/g7-operational/greenfield-upgrade-registry';
import {SCENE_CPU_INDEX_DDL,SCENE_CPU_MIGRATION_NAME,
  SCENE_CPU_MIGRATION_SQL,SCENE_CPU_MIGRATION_CHECKSUM} from
  '../../server/g7-operational/scene-cpu-ddl';
import {G7_PREVIOUS_SCENE_JOB_SCHEMA_ID,G7_GREENFIELD_SCHEMA_ID} from
  '../../server/g7-operational/greenfield-schema';

describe('#225/B2-B forward-only v0.61.0 CPU Builder release',()=>{
  it('never mutates the 0.60.0 schema identity and uses a signed migration edge',()=>{
    const old=GREENFIELD_UPGRADE_REGISTRY.releases.find(r=>r.version==='0.60.0');
    const current=GREENFIELD_UPGRADE_REGISTRY.releases.find(r=>r.version==='0.61.0');
    expect(old?.schemaId).toBe(G7_PREVIOUS_SCENE_JOB_SCHEMA_ID);
    expect(current?.schemaId).toBe(G7_GREENFIELD_SCHEMA_ID);
    const edges=resolveUpgradeChain(GREENFIELD_UPGRADE_REGISTRY,'0.60.0','0.61.0');
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({kind:'MIGRATION',sql:SCENE_CPU_MIGRATION_SQL,
      migrationName:SCENE_CPU_MIGRATION_NAME,
      migrationChecksum:SCENE_CPU_MIGRATION_CHECKSUM});
    expect(()=>resolveUpgradeChain(GREENFIELD_UPGRADE_REGISTRY,'0.61.0','0.60.0'))
      .toThrow('G7_UPGRADE_UNSUPPORTED_PATH');
  });
  it('matches the reviewed on-disk SQL and protects builder/status/due lookup',()=>{
    const sql=readFileSync(new URL('../../deploy/scene-cpu-worker/migration.sql',import.meta.url),'utf8');
    const withoutComments=sql.split('\n').filter(x=>!x.trim().startsWith('--')).join('\n').trim();
    expect(withoutComments).toBe(SCENE_CPU_INDEX_DDL.sql+';');
    expect(createHash('sha256').update(SCENE_CPU_MIGRATION_SQL).digest('hex'))
      .toBe(SCENE_CPU_MIGRATION_CHECKSUM);
  });
});
