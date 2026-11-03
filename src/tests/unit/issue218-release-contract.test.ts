import { describe, expect, test } from 'vitest';
import packageInfo from '../../package.json';
import lock from '../../package-lock.json';
import { GREENFIELD_UPGRADE_REGISTRY as registry, resolveUpgradeChain } from
  '../../server/g7-operational/greenfield-upgrade-registry';
import {SCENE_BUILD_JOB_MIGRATION_SQL, SCENE_JOB_MIGRATION_NAME,
  SCENE_BUILD_JOB_MIGRATION_CHECKSUM} from
  '../../server/g7-operational/scene-job-ddl';

describe('#218/#225 Scene v2 → durable Job forward G7 release',()=>{
  test('0.59.0 stays immutable and 0.60.0 needs a reviewed migration',()=>{
    expect(packageInfo.version).toBe('0.60.0');
    expect(lock.version).toBe(packageInfo.version);
    expect(lock.packages[''].version).toBe(packageInfo.version);
    const previous=registry.releases.find(r=>r.version==='0.58.1')!;
    const v59=registry.releases.find(r=>r.version==='0.59.0')!;
    const next=registry.releases.find(r=>r.version===packageInfo.version)!;
    expect(v59).toEqual({...previous,version:'0.59.0'});
    expect(next.schemaId).toBe('G7-GREENFIELD-SCENE-JOBS-20261104-1');
    expect(next.schemaId).not.toBe(v59.schemaId);
    expect(next.checksum).not.toBe(v59.checksum);
    expect(resolveUpgradeChain(registry,'0.58.1','0.59.0'))
      .toEqual([{from:'0.58.1',to:'0.59.0',kind:'COMPATIBLE'}]);
    const chain=resolveUpgradeChain(registry,'0.59.0','0.60.0');
    expect(chain).toHaveLength(1);
    expect(chain[0]).toMatchObject({
      from:'0.59.0',to:'0.60.0',kind:'MIGRATION',
      sql:SCENE_BUILD_JOB_MIGRATION_SQL,
      migrationName:SCENE_JOB_MIGRATION_NAME,
      migrationChecksum:SCENE_BUILD_JOB_MIGRATION_CHECKSUM,
    });
    expect(()=>resolveUpgradeChain(registry,'0.60.0','0.59.0'))
      .toThrow('G7_UPGRADE_UNSUPPORTED_PATH');
    expect(()=>resolveUpgradeChain(registry,'0.59.0','0.58.1'))
      .toThrow('G7_UPGRADE_UNSUPPORTED_PATH');
  });
});
