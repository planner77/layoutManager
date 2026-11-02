import {test,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {chmodSync,mkdirSync,mkdtempSync,rmSync,symlinkSync,utimesSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const preloader=new URL('../fixtures/g7-runtime-monotonic-clock.mjs',import.meta.url).pathname;
function fixture(){
 const root=mkdtempSync(path.join(tmpdir(),'cad-g7-runtime-'));chmodSync(root,0o700);
 mkdirSync(path.join(root,'cad'),{mode:0o700});
 for(const name of ['fixture.sqlite','runtime-trust.json','runtime-approval.json'])
  writeFileSync(path.join(root,name),'{}',{mode:0o600});
 const env={...process.env,G7_RUNTIME_E2E_ROOT:root,G7_RUNTIME_E2E_MONOTONIC_CLOCK:'true',
  DATABASE_URL:'file:'+path.join(root,'fixture.sqlite'),CAD_STORAGE_PATH:path.join(root,'cad'),
  G7_RUNTIME_TRUST_PATH:path.join(root,'runtime-trust.json'),
  G7_RUNTIME_APPROVAL_PATH:path.join(root,'runtime-approval.json'),
  CAD_STORAGE_BACKEND:'local',G7_AUTH_ENABLED:'true',G7_CAD_WRITE_CUTOVER_ENABLED:'true',
  G7_RUNTIME_ALLOW_HTTP:'true',NODE_ENV:'production' as const};
 const run=(overrides:Record<string,string>={})=>spawnSync(process.execPath,
  ['--import',preloader,'-e','process.stdout.write(String(Date.now()))'],
  {env:{...env,...overrides},encoding:'utf8',timeout:5000});
 return {root,env,run,close:()=>rmSync(root,{recursive:true,force:true})};
}
test('Auth E2E preloader accepts only owned exact disposable paths and starts after fixture writes',()=>{
 const f=fixture();
 try{
  const future=Date.now()+1000;
  utimesSync(path.join(f.root,'runtime-approval.json'),future/1000,future/1000);
  const valid=f.run();expect(valid.status).toBe(0);
  expect(Number(valid.stdout)).toBeGreaterThanOrEqual(future);
  expect(f.run({G7_RUNTIME_E2E_MONOTONIC_CLOCK:'false'}).status).not.toBe(0);
  expect(f.run({DATABASE_URL:'file:'+path.join(f.root,'other.sqlite')}).status).not.toBe(0);
  expect(f.run({G7_RUNTIME_TRUST_PATH:path.join(f.root,'other.json')}).status).not.toBe(0);
  chmodSync(path.join(f.root,'cad'),0o755);
  expect(f.run().status).not.toBe(0);
  chmodSync(path.join(f.root,'cad'),0o700);
  rmSync(path.join(f.root,'runtime-trust.json'));
  symlinkSync(path.join(f.root,'runtime-approval.json'),path.join(f.root,'runtime-trust.json'));
  expect(f.run().status).not.toBe(0);
 }finally{f.close();}
});
