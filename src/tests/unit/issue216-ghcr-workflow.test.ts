import { describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const workflow=readFileSync(
  new URL('../../../.github/workflows/docker-publish.yml',import.meta.url),'utf8');
const HEAD='a'.repeat(40);
const PINNED_SOURCE='934e5561ff7d54b388d59b6f8e8f40bd14bcd45e';
const PINNED_TAG_OBJECT='bbd526ce3ce222dea7b63d1c8b081990ab238268';
const PINNED_TREE='2a8ed7596a4b3444a03fd839784c9e0a5a125a0c';
const RECOVERY_TITLE='#216 | Recover immutable v0.58.1 GHCR pair [G7-RECOVERY-0581]';
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
if [[ "$REGISTRY_ERROR" == mixed ]]; then
  printf '%s\\n' "ERROR: $4: not found: connection timeout" >&2
else
  printf '%s\\n' "ERROR: $4: not found" >&2
fi
exit 1
`);
  chmodSync(docker,0o700);
  const git=path.join(bin,'git');
  writeFileSync(git,`#!/usr/bin/env bash
if [[ "$1" == rev-list && "$2" == -n && "$3" == 1 ]]; then
  printf '%s\\n' "$TAG_COMMIT"
elif [[ "$1" == rev-parse && "$2" == 'refs/tags/v0.58.1^{tag}' ]]; then
  printf '%s\\n' "$TAG_OBJECT"
elif [[ "$1" == rev-parse && "$2" == "\${TAG_COMMIT}^{tree}" ]]; then
  printf '%s\\n' "$TAG_TREE"
else
  exit 9
fi
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
        TAG_OBJECT:PINNED_TAG_OBJECT,TAG_TREE:PINNED_TREE,COMMIT_MESSAGE:'',
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
    expect(execute(shell,{GITHUB_REF:'refs/heads/main'}).output)
      .toContain('source_sha='+HEAD);
  });
  test('approved repair uses exactly tagged source, never a new main tree',()=>{
    const shell=publish.replaceAll('${{ steps.release_image.outputs.exists }}','false')
      .replaceAll('${{ steps.version.outputs.version }}','0.58.1');
    const repaired=execute(shell,{COMMIT_MESSAGE:RECOVERY_TITLE,TAG_COMMIT:PINNED_SOURCE});
    expect(repaired.status,repaired.stderr).toBe(0);
    expect(repaired.output).toContain('publish=true');
    expect(repaired.output).toContain('source_sha='+PINNED_SOURCE);
    const mismatches:Record<string,string>[]=[
      {TAG_OBJECT:'c'.repeat(40)},
      {TAG_TREE:'d'.repeat(40)},
      {TAG_COMMIT:'e'.repeat(40)},
      {COMMIT_MESSAGE:RECOVERY_TITLE+' changed'},
    ];
    for(const mismatch of mismatches){
      const blocked=execute(shell,{COMMIT_MESSAGE:RECOVERY_TITLE,
        TAG_COMMIT:PINNED_SOURCE,...mismatch});
      expect(blocked.status).not.toBe(0);
      expect(blocked.stderr).toContain('G7_RELEASE_TAG_SOURCE_MISMATCH');
    }
    expect(workflow).toContain('Checkout exact immutable source for paired candidate images');
    expect(workflow).toContain('org.opencontainers.image.revision=${{ steps.publish.outputs.source_sha }}');
    expect(workflow).toContain('build-${{ steps.publish.outputs.source_sha }}-app');
    expect(workflow).toContain('build-${{ steps.publish.outputs.source_sha }}-migrate');
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
  test('unscoped absence-like failures never authorize a publish',()=>{
    const result=execute(check,{REGISTRY_ERROR:'mixed'});
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('G7_RELEASE_REGISTRY_CHECK_FAILED');
    expect(result.output).not.toContain('exists=false');
  });
  test('registry network or authentication uncertainty must not publish',()=>{
    const result=execute(check,{REGISTRY_ERROR:'yes'});
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('G7_RELEASE_REGISTRY_CHECK_FAILED');
    expect(result.output).not.toContain('exists=false');
  });
});
