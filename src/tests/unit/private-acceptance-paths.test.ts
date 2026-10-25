import {afterEach,describe,expect,it} from 'vitest';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  validatePrivateAcceptancePaths,writePrivateAcceptanceReport,
} from '../benchmark/private-acceptance-paths';

const created:string[]=[];
afterEach(()=>{
  for(const dir of created.splice(0))
    rmSync(dir,{recursive:true,force:true});
});
function fixture(){
  const base=mkdtempSync(join(tmpdir(),'issue-99-private-paths-'));
  created.push(base);
  const repo=join(base,'repository');
  const privateDir=join(base,'private');
  const reportDir=join(privateDir,'results');
  mkdirSync(repo);
  mkdirSync(reportDir,{recursive:true});
  const repoSource=join(repo,'hidden.dxf');
  const sourcePath=join(privateDir,'approved.dxf');
  const reportPath=join(reportDir,'new-report.json');
  writeFileSync(repoSource,'fixture-only');
  writeFileSync(sourcePath,'fixture-only');
  return {repo,repoSource,privateDir,sourcePath,reportDir,reportPath};
}

describe('Issue #99 P1 real-path enforcement',()=>{
  it('TC-P0P5-PATH-001: valid separate source and output are allowed once',()=>{
    const f=fixture();
    const paths=validatePrivateAcceptancePaths(f.sourcePath,f.reportPath,f.repo);
    expect(paths.sourceRealPath).toBe(f.sourcePath);
    writePrivateAcceptanceReport(paths,'{"synthetic":true}');
    expect(readFileSync(f.reportPath,'utf8')).toBe('{"synthetic":true}');
    expect(()=>writePrivateAcceptanceReport(paths,'overwritten')).toThrow();
  });
  it('TC-P0P5-PATH-002: reject external source symlink to checkout',()=>{
    const f=fixture();
    const alias=join(f.privateDir,'source-link.dxf');
    symlinkSync(f.repoSource,alias);
    expect(()=>validatePrivateAcceptancePaths(alias,f.reportPath,f.repo))
      .toThrow('outside the checkout');
  });
  it('TC-P0P5-PATH-003: reject external report directory symlink to checkout',()=>{
    const f=fixture();
    const alias=join(f.privateDir,'results-link');
    symlinkSync(f.repo,alias,'dir');
    expect(()=>validatePrivateAcceptancePaths(f.sourcePath,join(alias,'leak.json'),f.repo))
      .toThrow('outside the checkout');
  });
  it('TC-P0P5-PATH-004: reject existing report path and dangling file symlink',()=>{
    const f=fixture();
    symlinkSync(join(f.privateDir,'missing.json'),f.reportPath);
    expect(()=>validatePrivateAcceptancePaths(f.sourcePath,f.reportPath,f.repo))
      .toThrow('already exists');
    rmSync(f.reportPath);
    writeFileSync(f.reportPath,'old-report');
    expect(()=>validatePrivateAcceptancePaths(f.sourcePath,f.reportPath,f.repo))
      .toThrow('already exists');
  });
  it('TC-P0P5-PATH-005: fail if the report directory changes after preflight',()=>{
    const f=fixture();
    const paths=validatePrivateAcceptancePaths(f.sourcePath,f.reportPath,f.repo);
    rmSync(f.reportDir,{recursive:true});
    symlinkSync(f.repo,f.reportDir,'dir');
    expect(()=>writePrivateAcceptanceReport(paths,'should not be written'))
      .toThrow('directory changed');
  });
  it('TC-P0P5-PATH-006: require existing report parent and absolute paths',()=>{
    const f=fixture();
    expect(()=>validatePrivateAcceptancePaths('relative.dxf',f.reportPath,f.repo))
      .toThrow('absolute');
    expect(()=>validatePrivateAcceptancePaths(f.sourcePath,join(f.privateDir,'missing','new.json'),f.repo))
      .toThrow();
  });
});
