import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { GREENFIELD_UPGRADE_REGISTRY, resolveUpgradeChain } from
  '../../server/g7-operational/greenfield-upgrade-registry';

const readJson=(file:URL):{version:string;packages?:Record<string,{version:string}>} =>
  JSON.parse(readFileSync(file,'utf8')) as {version:string;packages?:Record<string,{version:string}>};

describe('#216 immutable 0.58.1 release',()=>{
  test('package, lockfile and exact G7 compatible edges agree',()=>{
    const pkg=readJson(new URL('../../package.json',import.meta.url));
    const lock=readJson(new URL('../../package-lock.json',import.meta.url));
    expect(pkg.version).toBe('0.58.1');
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages?.['']?.version).toBe(pkg.version);
    expect(GREENFIELD_UPGRADE_REGISTRY.releases.map(r=>r.version))
      .toEqual(['0.56.0','0.57.0','0.58.0','0.58.1']);
    expect(resolveUpgradeChain(GREENFIELD_UPGRADE_REGISTRY,'0.56.0',pkg.version))
      .toEqual([{from:'0.56.0',to:'0.57.0',kind:'COMPATIBLE'},
        {from:'0.57.0',to:'0.58.0',kind:'COMPATIBLE'},
        {from:'0.58.0',to:'0.58.1',kind:'COMPATIBLE'}]);
    expect(resolveUpgradeChain(GREENFIELD_UPGRADE_REGISTRY,'0.58.0',pkg.version))
      .toEqual([{from:'0.58.0',to:'0.58.1',kind:'COMPATIBLE'}]);
    expect(()=>resolveUpgradeChain(GREENFIELD_UPGRADE_REGISTRY,'0.58.1','0.58.0'))
      .toThrow('G7_UPGRADE_UNSUPPORTED_PATH');
    expect(()=>resolveUpgradeChain(GREENFIELD_UPGRADE_REGISTRY,'0.55.0','0.58.1'))
      .toThrow('G7_UPGRADE_UNSUPPORTED_PATH');
  });
  test('compatible edges reject unknown data contracts and missing bridge',()=>{
    const reg=GREENFIELD_UPGRADE_REGISTRY;
    const from=reg.releases.find(r=>r.version==='0.58.0')!;
    const to=reg.releases.find(r=>r.version==='0.58.1')!;
    for(const key of ['schemaId','baseline','checksum','dataContract','runtimeContract'] as const)
      expect(from[key]).toBe(to[key]);
    const changed={releases:reg.releases.map(r=>r.version==='0.58.1'
      ? {...r,dataContract:r.dataContract+'-UNREVIEWED'} : r),edges:reg.edges};
    expect(()=>resolveUpgradeChain(changed,'0.58.0','0.58.1'))
      .toThrow('G7_UPGRADE_SCHEMA_INCOMPATIBLE');
    expect(()=>resolveUpgradeChain({...reg,edges:reg.edges.filter(e=>e.to!=='0.58.1')},
      '0.58.0','0.58.1')).toThrow('G7_UPGRADE_UNSUPPORTED_PATH');
  });
});
