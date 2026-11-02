import { describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const workflow=readFileSync(
  new URL('../../../.github/workflows/docker-publish.yml',import.meta.url),'utf8');
const HEAD='a'.repeat(40);
function script(name:string):string{
  const at=workflow.indexOf('      - name: '+name+'\n');
  if(at<0)throw new Error('RELEASE_STEP_NOT_FOUND: '+name);
  const next=workflow.indexOf('\n      - name:',at+10);
  const block=workflow.slice(at,next<0?undefined:next);
  const marker='        run: |\n',start=block.indexOf(marker);
  if(start<0)throw new Error('RELEASE_SHELL_NOT_FOUND: '+name);
  return block.slice(start+marker.length).split('\n')
    .map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');
}
function fixture(){
  const root=mkdtempSync(path.join(tmpdir(),'g7-216-ghcr-'));
  const bin=path.join(root,'bin');mkdirSync(bin);
  const docker=path.join(bin,'docker');
  writeFileSync(docker,`#!/usr/bin/env bash
if [[ "$1" != buildx || "$2" != imagetools || "$3" != inspect ]]; then exit 9; fi
if [[ "$REGISTRY_ERROR" == yes ]]; then echo "network/authentication failure" >&2; exit 29; fi
if [[ "$4" == *-migrate ]]; then
  [[ "\${MIGRATOR_EXISTS}" == yes ]] && exit 0
else
  [[ "\${APP_EXISTS}" == yes ]] && exit 0
fi
printf '%s\\n' 'manifest unknown: 404 Not Found' >&2
exit 1
`);
  chmodSync(docker,0o700);
  const git=path.join(bin,'git');
  writeFileSync(git,`#!/usr/bin/env bash
if [[ "$1" != rev-list || "$2" != -n || "$3" != 1 ]]; then exit 9; fi
printf '%s\\n' "$TAG_COMMIT"
`);
  chmodSync(git,0o700);
  return {root,bin,output:path.join(root,'output.txt')};
}
function execute(command:string,env:Record<string,string>){
  const f=fixture();
  try{
    const actual=spawnSync('bash',['-c',command],{cwd:f.root,encoding:'utf8',timeout:15000,
      env:{...process.env,PATH:f.bin+':'+process.env.PATH,
        REGISTRY:'ghcr.io',IMAGE_NAME:'planner77/layoutmanager',
        APP_VERSION:'0.58.1',APP_EXISTS:'no',MIGRATOR_EXISTS:'no',
        GITHUB_REF:'refs/heads/main',GITHUB_SHA:HEAD,TAG_COMMIT:HEAD,
        GITHUB_OUTPUT:f.output,...env}});
    return {status:actual.status,stderr:actual.stderr,
      output:existsSync(f.output)?readFileSync(f.output,'utf8'):''};
  }finally{rmSync(f.root,{recursive:true,force:true});}
}
describe('#216 immutable GHCR pair workflow (no registry network)',()=>{
  const check=script('Check immutable version pair on GHCR');
  const publish=script('Decide whether to publish');
  test('shell syntax is valid',()=>{
    for(const shell of [check,publish]){
      const result=spawnSync('bash',['-n'],{input:shell,encoding:'utf8'});
      expect(result.status,result.stderr).toBe(0);
    }
  });
  test('both existing version tags mean no publish on main or rerun tag',()=>{
    const inspected=execute(check,{APP_EXISTS:'yes',MIGRATOR_EXISTS:'yes'});
    expect(inspected.status,inspected.stderr).toBe(0);
    expect(inspected.output).toContain('exists=true');
    for(const ref of ['refs/heads/main','refs/tags/v0.58.1']){
      const result=execute(publish.replaceAll('${{ steps.release_image.outputs.exists }}','true')
        .replaceAll('${{ steps.version.outputs.version }}','0.58.1'),{GITHUB_REF:ref});
      expect(result.status,result.stderr).toBe(0);
      expect(result.output).toContain('publish=false');
    }
  });
  test('both absent permit initial publish only from the pinned tag source on main',()=>{
    const inspected=execute(check,{APP_EXISTS:'no',MIGRATOR_EXISTS:'no'});
    expect(inspected.status,inspected.stderr).toBe(0);
    expect(inspected.output).toContain('exists=false');
    const shell=publish.replaceAll('${{ steps.release_image.outputs.exists }}','false')
      .replaceAll('${{ steps.version.outputs.version }}','0.58.1');
    for(const ref of ['refs/heads/main','refs/tags/v0.58.1']){
      const result=execute(shell,{GITHUB_REF:ref});
      expect(result.status,result.stderr).toBe(0);
      expect(result.output).toContain('publish=true');
    }
    const mismatch=execute(shell,{GITHUB_REF:'refs/heads/main',TAG_COMMIT:'b'.repeat(40)});
    expect(mismatch.status).not.toBe(0);
    expect(mismatch.stderr).toContain('G7_RELEASE_TAG_SOURCE_MISMATCH');
    expect(mismatch.output).not.toContain('publish=true');
  });
  test('partial image version pair is fail-closed, not silently overwritten',()=>{
    for(const pair of [{APP_EXISTS:'yes',MIGRATOR_EXISTS:'no'},
      {APP_EXISTS:'no',MIGRATOR_EXISTS:'yes'}]){
      const result=execute(check,pair);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('G7_RELEASE_PARTIAL_PAIR');
      expect(result.output).not.toContain('exists=false');
    }
  });
  test('registry network or authentication uncertainty must not publish',()=>{
    const result=execute(check,{REGISTRY_ERROR:'yes'});
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('G7_RELEASE_REGISTRY_CHECK_FAILED');
    expect(result.output).not.toContain('exists=false');
  });
});
