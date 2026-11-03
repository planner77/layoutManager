import { describe, expect, test } from 'vitest';
import packageInfo from '../../package.json';
import lock from '../../package-lock.json';
import { GREENFIELD_UPGRADE_REGISTRY as registry, resolveUpgradeChain } from
  '../../server/g7-operational/greenfield-upgrade-registry';

describe('#218 Scene fidelity release compatibility',()=>{
  test('0.59.0 adds a forward edge with the same database and runtime contracts',()=>{
    expect(packageInfo.version).toBe('0.59.0');
    expect(lock.version).toBe(packageInfo.version);
    expect(lock.packages[''].version).toBe(packageInfo.version);
    const previous=registry.releases.find(r=>r.version==='0.58.1')!;
    const current=registry.releases.find(r=>r.version===packageInfo.version)!;
    expect(current).toEqual({...previous,version:'0.59.0'});
    expect(resolveUpgradeChain(registry,'0.58.1','0.59.0')).toEqual([
      {from:'0.58.1',to:'0.59.0',kind:'COMPATIBLE'},
    ]);
    expect(()=>resolveUpgradeChain(registry,'0.59.0','0.58.1'))
      .toThrow('G7_UPGRADE_UNSUPPORTED_PATH');
  });
});
