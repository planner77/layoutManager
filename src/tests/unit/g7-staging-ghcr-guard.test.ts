import { afterEach, describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tmpRoots: string[] = [];
const workflow = readFileSync(
  new URL('../../../.github/workflows/docker-publish.yml', import.meta.url), 'utf8',
);
function releaseScopeScript() {
  const pos = workflow.indexOf('      - name: Check changed paths before GHCR publication');
  const runStart = workflow.indexOf('        run: |\n', pos);
  const nextJob = workflow.indexOf('\n  build-and-push:', runStart);
  if (pos < 0 || runStart < 0 || nextJob < 0) throw new Error('G7_SCOPE_SCRIPT_MISSING');
  const raw = workflow.slice(runStart + '        run: |\n'.length, nextJob);
  return raw.split('\n').map(line => line.startsWith('          ')
    ? line.slice(10) : line).join('\n');
}
function command(cwd: string, executable: string, args: string[],
  env?: NodeJS.ProcessEnv) {
  return spawnSync(executable, args, {
    cwd, encoding: 'utf8', env: env ?? process.env, timeout: 15000,
  });
}
function git(cwd: string, ...args: string[]) {
  const result = command(cwd, 'git', args);
  if (result.status !== 0) throw new Error('G7_GIT_TEST_FAILURE: ' + result.stderr);
  return result.stdout.trim();
}
function write(root: string, filename: string, value: string) {
  const full = path.join(root, filename);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, value);
}
function runScope(changes: string[], subject: string, gitRef = 'refs/heads/main') {
  const root = mkdtempSync(path.join(tmpdir(), 'g7-scope-fixture-'));
  tmpRoots.push(root);
  git(root, 'init', '-q');
  write(root, '.github/workflows/pr-ci.yml', 'name: PR CI\n');
  write(root, '.github/workflows/docker-publish.yml', 'name: Main CI\n');
  write(root, 'AGENTS.md', '# AGENTS\n');
  git(root, 'add', '.');
  git(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '-q', '-m', 'initial fixture');
  const before = git(root, 'rev-parse', 'HEAD');
  for (const file of changes) write(root, file, 'staging-only synthetic change\n');
  git(root, 'add', '.');
  git(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '-q', '-m', subject);
  const head = git(root, 'rev-parse', 'HEAD');
  const out = path.join(root, 'output.txt'), summary = path.join(root, 'summary.md');
  const response = command(root, 'bash', ['-c', releaseScopeScript()], {
    ...process.env, GITHUB_REF: gitRef, EVENT_BEFORE: before,
    GITHUB_SHA: head, COMMIT_MESSAGE: subject, RUNNER_TEMP: root,
    GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: summary,
  });
  const values = response.status === 0 ? readFileSync(out, 'utf8') : '';
  return { ...response, values };
}
afterEach(() => {
  for (const root of tmpRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('#109 G7 S1 narrow non-publishing Main CI gate', () => {
  test('scope script parses under Bash, not an unverified YAML string', () => {
    // Bash -n on stdin validates the exact release-scope shell fragment.
    const syntax = spawnSync('bash', ['-n'], {
      input: releaseScopeScript(), encoding: 'utf8', timeout: 15000,
    });
    expect(syntax.status, syntax.stderr).toBe(0);
  });
  test('explicit squash subject + staging-only files => publish=false', () => {
    const marker = '#109 | S1 Staging-only integration [G7-S1-NO-GHCR]';
    const result = runScope([
      'src/app/api/g7-staging/route.ts',
      'src/server/g7-staging/gate.ts',
      'src/tests/unit/g7-staging-ghcr-guard.test.ts',
      'out/Issue109.md',
      '.github/workflows/docker-publish.yml',
    ], marker + '\n\nS1 code and tests, no production deploy');
    expect(result.status, result.stderr).toBe(0);
    expect(result.values).toContain('publish=false');
  });
  test('same marker + operational CAD API => fail closed; no accidental GHCR', () => {
    const result = runScope([
      'src/server/g7-staging/gate.ts',
      'src/app/api/cad-files/route.ts',
    ], '#109 | S1 Staging-only integration [G7-S1-NO-GHCR]');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('G7-S1 GHCR exclusion disallowed path');
    expect(result.stdout).not.toContain('G7-S1 GHCR exclusion disallowed path');
  });
  test('near-match or appended text never grants a GHCR skipping exception', () => {
    const marker = '#109 | S1 Staging-only integration [G7-S1-NO-GHCR]';
    for (const subject of [
      marker + ' NOT-APPROVED',
      marker + '-extra',
      '#109 | S1 Staging-only integration [G7-S1-NO-GHCR]  ',
    ]) {
      const result = runScope(['src/server/g7-staging/gate.ts'], subject);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('G7-S1 exact squash subject required');
      expect(result.values).toBe('');
    }
  });
  test('exact first line with multiline commit body still skips publication', () => {
    const marker = '#109 | S1 Staging-only integration [G7-S1-NO-GHCR]';
    const result = runScope(['src/server/g7-staging/gate.ts'], marker + '\n\nApproved S1 changes');
    expect(result.status, result.stderr).toBe(0);
    expect(result.values).toContain('publish=false');
  });
  test('normal runtime change without marker keeps normal publishing path', () => {
    const result = runScope(['src/app/api/cad-files/route.ts'],
      '#555 | production runtime fix');
    expect(result.status, result.stderr).toBe(0);
    expect(result.values).toContain('publish=true');
  });
  test('normal docs-only change does not publish', () => {
    const result = runScope(['out/Issue109.md'], '#109 | documentation');
    expect(result.status, result.stderr).toBe(0);
    expect(result.values).toContain('publish=false');
  });
});

describe('#109 G7 S2 exact-title private-evidence-only Main CI gate', () => {
  const s2 = '#109 | S2 private-evidence readiness [G7-S2-NO-GHCR]';
  test('all S2 PR files plus release workflow are non-publishing with exact subject', () => {
    const result = runScope([
      'AGENTS.md',
      'out/Decisions.md',
      'out/FailureLedger.md',
      'out/Issue109-S2-Readiness.md',
      'out/Issue109.md',
      'out/Operation.md',
      'out/Requirements.md',
      'out/TestPlan.md',
      'out/TestReport.md',
      'src/scripts/g7-s2-readiness.ts',
      'src/server/g7-staging/s2-readiness.ts',
      'src/tests/unit/g7-s2-readiness.test.ts',
      'src/tests/unit/g7-staging-ghcr-guard.test.ts',
      '.github/workflows/docker-publish.yml',
    ], s2 + '\n\nS2 offline readiness only; operations OFF');
    expect(result.status, result.stderr).toBe(0);
    expect(result.values).toContain('publish=false');
    expect(result.values).not.toContain('publish=true');
  });
  test('S2 exact subject with operational or merely S1-only files fails closed', () => {
    const forbiddenPaths = [
      'src/app/api/cad-files/route.ts',
      'src/prisma/schema.prisma',
      'src/docker-compose.yml',
      'src/server/g7-staging/cad-service.ts',
      'src/scripts/g7-staging-admin.ts',
      'src/tests/unit/unrelated.test.ts',
      '.github/workflows/pr-ci.yml',
    ];
    for (const path of forbiddenPaths) {
      const result = runScope(['src/server/g7-staging/s2-readiness.ts', path], s2);
      expect(result.status, `Path must be blocked: ${path}`).not.toBe(0);
      expect(result.stderr).toContain('G7-S2 GHCR exclusion disallowed path: ' + path);
      expect(result.values).toBe('');
    }
  });
  test('S2 near-matches and accidental subject suffix cannot publish or skip', () => {
    for (const subject of [
      s2 + ' NOT-APPROVED', s2 + '-extra', s2 + '  ',
      '#109 | S2 private-evidence readiness',
      '#109 | S2 private-evidence readiness [G7-S2-NO-GHCR',
      '#109 | S2 unknown-release-subject',
    ]) {
      const result = runScope(['src/server/g7-staging/s2-readiness.ts'], subject);
      expect(result.status, `Subject should be blocked: ${subject}`).not.toBe(0);
      expect(result.stderr).toContain('G7-S2 exact squash subject required');
      expect(result.values).toBe('');
    }
  });
  test('S1 subject cannot bypass S2-only allowlist', () => {
    const s1 = '#109 | S1 Staging-only integration [G7-S1-NO-GHCR]';
    const result = runScope(['src/scripts/g7-s2-readiness.ts'], s1);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('G7-S1 GHCR exclusion disallowed path');
    expect(result.values).toBe('');
  });
  test('unrelated production changes retain GHCR publication and tags are unchanged', () => {
    const normal = runScope(['src/app/api/cad-files/route.ts'], '#555 | runtime feature');
    expect(normal.status, normal.stderr).toBe(0);
    expect(normal.values).toContain('publish=true');
    const tagged = runScope(['src/server/g7-staging/s2-readiness.ts'], s2, 'refs/tags/v0.99.1');
    expect(tagged.status, tagged.stderr).toBe(0);
    expect(tagged.values).toContain('publish=true');
  });
});

describe('#109 S3-1 schema/type-only no-GHCR Main scope', () => {
  const exact = '#109 | S3-1 Operational schema and gates [G7-S3-1-NO-GHCR]';
  test('all S3-1 schema, disposable migration candidate, tests, docs => skip GHCR', () => {
    const files = [
      '.github/workflows/docker-publish.yml', 'AGENTS.md',
      'out/Architecture.md', 'out/Database.md', 'out/Decisions.md',
      'out/FailureLedger.md', 'out/Issue109.md', 'out/Operation.md',
      'out/Requirements.md', 'out/TestPlan.md', 'out/TestReport.md',
      'src/prisma/schema.prisma',
      'src/deploy/g7-s3/README.md', 'src/deploy/g7-s3/prisma.config.ts',
      'src/deploy/g7-s3/prisma/migrations/migration_lock.toml',
      ...[
        '202609070001_locations', '202609090001_description',
        '202609110001_delete_password', '202609110002_delete_invariants',
        '202609110003_drawing_name', '202610150001_master_hierarchy',
        '202610260002_g7_operational_auth',
      ].map(name => 'src/deploy/g7-s3/prisma/migrations/' + name + '/migration.sql'),
      'src/server/g7-operational/preflight.ts',
      'src/tests/unit/g7-s3-operational-gate.test.ts',
      'src/tests/integration/g7-s3-operational-migration.test.ts',
      'src/tests/integration/auth-g1.test.ts',
      'src/tests/integration/auth-g2.test.ts',
      'src/tests/integration/auth-g3.test.ts',
      'src/tests/unit/g7-staging-ghcr-guard.test.ts',
    ];
    const result = runScope(files, exact + '\n\nCandidate only; runtime OFF');
    expect(result.status, result.stderr).toBe(0);
    expect(result.values).toContain('publish=false');
    expect(result.values).not.toContain('publish=true');
  });
  test('same subject with active migration, auth routes or runtime deployment fails closed', () => {
    for (const forbidden of [
      'src/prisma/migrations/202610260002_g7_operational_auth/migration.sql',
      'src/app/api/cad-files/route.ts',
      'src/app/api/g7-operational/route.ts',
      'src/scripts/deploy.ts',
      'src/docker-compose.yml',
      'src/server/g7-staging/cad-service.ts',
      'src/tests/unit/unrelated.test.ts',
      '.github/workflows/pr-ci.yml',
    ]) {
      const result = runScope(['src/prisma/schema.prisma', forbidden], exact);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('G7-S3-1 GHCR exclusion disallowed path: ' + forbidden);
      expect(result.values).toBe('');
    }
  });
  test('S3-1 similar or malformed subjects reject before any publishing decision', () => {
    for (const subject of [
      exact + ' NOT-APPROVED', exact + '-extra', exact + ' ',
      '#109 | S3-1 Operational schema and gates',
      '#109 | S3-1 [NO-GHCR]',
    ]) {
      const result = runScope(['src/prisma/schema.prisma'], subject);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('G7-S3-1 exact squash subject required');
      expect(result.values).toBe('');
    }
  });
  test('S1/S2 cannot be used to sneak in S3-1 production schema', () => {
    for (const subject of [
      '#109 | S1 Staging-only integration [G7-S1-NO-GHCR]',
      '#109 | S2 private-evidence readiness [G7-S2-NO-GHCR]',
    ]) {
      const result = runScope(['src/prisma/schema.prisma'], subject);
      expect(result.status).not.toBe(0);
      expect(result.values).toBe('');
    }
  });
  test('ordinary runtime and tags keep the original publishing policy', () => {
    const runtime = runScope(['src/app/api/cad-files/route.ts'], '#555 | runtime fix');
    expect(runtime.status).toBe(0);
    expect(runtime.values).toContain('publish=true');
    const tag = runScope(['src/prisma/schema.prisma'], exact, 'refs/tags/v0.99.1');
    expect(tag.status).toBe(0);
    expect(tag.values).toContain('publish=true');
  });
});


describe('#109 S3-2 exact Auth/Admin preview-only GHCR exclusion',()=>{
  const title='#109 | S3-2 Operational Auth/Admin API [G7-S3-2-NO-GHCR]';
  const paths=[
    '.github/workflows/docker-publish.yml','AGENTS.md',
    'out/Architecture.md','out/Database.md','out/Decisions.md','out/FailureLedger.md',
    'out/Issue109.md','out/Operation.md','out/Requirements.md','out/TestPlan.md','out/TestReport.md',
    'src/deploy/g7-s3/prisma.config.ts','src/deploy/g7-s3/README.md','src/deploy/g7-s3/S3-2.md',
    'src/server/g7-operational/disposable-target.ts',
    'src/server/g7-operational/preview-gate.ts','src/server/g7-operational/preview-db.ts',
    'src/server/g7-operational/preview-handler.ts','src/server/g7-operational/user-provisioning.ts',
    'src/app/api/g7-operational/[...segments]/route.ts',
    'src/scripts/g7-s3-admin.ts',
    'src/tests/integration/g7-s3-operational-auth.test.ts',
    'src/tests/unit/g7-staging-ghcr-guard.test.ts',
  ];
  test('exact subject + exactly allowed S3-2 code/docs/runtime path => no GHCR',()=>{
    const result=runScope(paths,title+'\n\nNonproduction API, operating auth OFF');
    expect(result.status,result.stderr).toBe(0);
    expect(result.values).toContain('publish=false');
  });
  test('existing CAD write, active Prisma migration, deploy or compose cannot be excluded',()=>{
    for(const forbidden of [
      'src/prisma/migrations/202610260002_g7_operational_auth/migration.sql',
      'src/prisma/schema.prisma',
      'src/app/api/g7-operational/route.ts',
      'src/app/api/g7-operational/z/route.ts',
      'src/app/api/cad-files/route.ts',
      'src/app/api/cad-locations/[locationId]/current/route.ts',
      'src/scripts/deploy.ts','src/docker-compose.yml',
      'src/server/g7-operational/preflight.ts',
      'src/tests/unit/not-allowlisted.test.ts',
      '.github/workflows/pr-ci.yml',
    ]){
      const result=runScope(['src/server/g7-operational/preview-handler.ts',forbidden],title);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('G7-S3-2 GHCR exclusion disallowed path: '+forbidden);
      expect(result.values).toBe('');
    }
  });
  test('incorrect subject, even suffix/space, cannot pass or trigger GHCR',()=>{
    for(const subject of [
      title+' NOT-APPROVED',title+'-extra',title+' ',
      '#109 | S3-2 Operational Auth/Admin API',
      '#109 | S3-2 other change',
    ]){
      const result=runScope(['src/server/g7-operational/preview-handler.ts'],subject);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('G7-S3-2 exact squash subject required');
      expect(result.values).toBe('');
    }
  });
  test('existing S3-1/S2 title does not authorize S3-2 preview handler',()=>{
    for(const subject of [
      '#109 | S3-1 Operational schema and gates [G7-S3-1-NO-GHCR]',
      '#109 | S2 private-evidence readiness [G7-S2-NO-GHCR]',
    ]){
      const result=runScope(['src/app/api/g7-operational/[...segments]/route.ts'],subject);
      expect(result.status).not.toBe(0);
      expect(result.values).toBe('');
    }
  });
  test('normal runtime and version tags retain GHCR publish decision',()=>{
    const normal=runScope(['src/app/api/cad-files/route.ts'],'#777 | regular feature');
    expect(normal.status).toBe(0);
    expect(normal.values).toContain('publish=true');
    const tag=runScope(['src/server/g7-operational/preview-handler.ts'],title,'refs/tags/v0.99.1');
    expect(tag.status).toBe(0);
    expect(tag.values).toContain('publish=true');
  });
});

describe('#109 S3-3 isolated CAD transaction GHCR exclusion',()=>{
  const title='#109 | S3-3 Isolated CAD write and Audit [G7-S3-3-NO-GHCR]';
  test('exact subject and approved code/docs skip image publication',()=>{
    const result=runScope([
      '.github/workflows/docker-publish.yml','AGENTS.md','out/Issue109.md',
      'out/FailureLedger.md','src/deploy/g7-s3/S3-3.md',
      'src/server/auth/audit.ts','src/server/g7-operational/cad-guard.ts',
      'src/server/g7-operational/cad-preview-context.ts',
      'src/server/g7-operational/cad-preview-storage.ts',
      'src/server/repositories/cad.ts','src/server/services/upload.ts',
      'src/app/api/cad-files/route.ts','src/app/api/cad-files/[versionId]/route.ts',
      'src/app/api/cad-locations/[locationId]/current/route.ts',
      'src/tests/integration/g7-s3-cad-write.test.ts',
      'src/tests/unit/g7-s3-cad-preview.test.ts',
      'src/tests/unit/g7-staging-ghcr-guard.test.ts',
    ], title+'\n\nSynthetic S3-3, operating OFF');
    expect(result.status,result.stderr).toBe(0);
    expect(result.values).toContain('publish=false');
  });
  test('active migrations and unrelated runtime files denied',()=>{
    for(const p of [
      'src/prisma/migrations/202610260002_g7_operational_auth/migration.sql',
      'src/prisma/schema.prisma','src/app/api/health/route.ts',
      '.github/workflows/pr-ci.yml','src/docker-compose.yml',
    ]){
      const result=runScope(['src/server/g7-operational/cad-guard.ts',p],title);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('G7-S3-3 GHCR exclusion disallowed path: '+p);
    }
  });
  test('near-title and version tag do not grant no-GHCR',()=>{
    for(const subject of [title+' ',title+'-fake','#109 | S3-3 unapproved']){
      const result=runScope(['src/server/g7-operational/cad-guard.ts'],subject);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('G7-S3-3 exact squash subject required');
    }
    const tagged=runScope(['src/server/g7-operational/cad-guard.ts'],title,'refs/tags/v0.99.1');
    expect(tagged.status).toBe(0);
    expect(tagged.values).toContain('publish=true');
  });
});

describe('#109 S3-4-A offline release evidence exact GHCR exclusion', () => {
  const exact = '#109 | S3-4-A Offline release evidence [G7-S3-4A-NO-GHCR]';
  const allowed = [
    '.github/workflows/docker-publish.yml','AGENTS.md',
    'out/Architecture.md','out/Database.md','out/Decisions.md',
    'out/FailureLedger.md','out/Issue109.md','out/Operation.md',
    'out/Requirements.md','out/TestPlan.md','out/TestReport.md',
    'src/deploy/g7-s3/S3-4.md',
    'src/server/g7-operational/s3-4-readiness.ts',
    'src/scripts/g7-s3-4-readiness.ts',
    'src/tests/unit/g7-s3-4-readiness.test.ts',
    'src/tests/unit/g7-staging-ghcr-guard.test.ts',
  ];
  test('exact subject and only allowed offline sources => skip GHCR', () => {
    const result = runScope(allowed, exact + '\n\nOperational auth remains OFF');
    expect(result.status, result.stderr).toBe(0);
    expect(result.values).toContain('publish=false');
  });
  test('runtime routes, operational migrations, schema or deploy script fail closed', () => {
    for (const unsafe of [
      'src/app/api/cad-files/route.ts',
      'src/app/api/g7-operational/[...segments]/route.ts',
      'src/prisma/schema.prisma',
      'src/prisma/migrations/202610260002_g7_operational_auth/migration.sql',
      'src/scripts/deploy.ts','src/docker-compose.yml',
      'src/server/g7-operational/preflight.ts','.github/workflows/pr-ci.yml',
    ]) {
      const result = runScope([allowed[12], unsafe], exact);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('G7-S3-4A GHCR exclusion disallowed path: '+unsafe);
    }
  });
  test('wrong title/suffix fails; ordinary tagged publication unaffected', () => {
    for (const subject of [exact+' ', exact+'-extra', '#109 | S3-4 candidate release']) {
      const result = runScope([allowed[12]],subject);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('G7-S3-4A exact squash subject required');
    }
    const tagged = runScope([allowed[12]],exact,'refs/tags/v0.99.1');
    expect(tagged.status).toBe(0);
    expect(tagged.values).toContain('publish=true');
  });
});

describe('#109 S3-4-B1 local clone exact-title GHCR exclusion',()=>{
  const exact='#109 | S3-4-B1 Disposable restore integrity [G7-S3-4B1-NO-GHCR]';
  const files=[
    '.github/workflows/docker-publish.yml','AGENTS.md','out/Architecture.md',
    'out/Database.md','out/Decisions.md','out/FailureLedger.md','out/Issue109.md',
    'out/Operation.md','out/Requirements.md','out/TestPlan.md','out/TestReport.md',
    'src/deploy/g7-s3/S3-4-B.md',
    'src/server/g7-operational/s3-4-b-clone.ts',
    'src/tests/integration/g7-s3-4-b-clone.test.ts',
    'src/tests/unit/g7-staging-ghcr-guard.test.ts',
  ];
  test('only reviewed B1 files with exact title skip GHCR',()=>{
    const result=runScope(files,exact+'\n\nDisposable clone only');
    expect(result.status,result.stderr).toBe(0);
    expect(result.values).toContain('publish=false');
  });
  test('real operating migrations, deployment and routes cannot hide behind B1 title',()=>{
    for(const unsafe of [
      'src/prisma/migrations/202610260002_g7_operational_auth/migration.sql',
      'src/scripts/deploy.ts','src/docker-compose.yml',
      'src/app/api/cad-files/route.ts','src/server/g7-operational/preflight.ts',
      '.github/workflows/pr-ci.yml',
    ]){
      const r=runScope([files[12],unsafe],exact);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('G7-S3-4B1 GHCR exclusion disallowed path: '+unsafe);
    }
  });
  test('near-match subject and tagged push cannot suppress normal release',()=>{
    for(const subject of [exact+' ',exact+'-fake','#109 | S3-4-B1 other']){
      const r=runScope([files[12]],subject);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('G7-S3-4A exact squash subject required');
    }
    const tagged=runScope([files[12]],exact,'refs/tags/v0.99.1');
    expect(tagged.status).toBe(0);
    expect(tagged.values).toContain('publish=true');
  });
});

describe('#142 S3-4-B2-1 exact offline OCI GHCR no-publish scope',()=>{
  const title='#142 | S3-4-B2-1 Offline OCI digest preflight [G7-S3-4B2-1-NO-GHCR]';
  const paths=[
    '.github/workflows/docker-publish.yml','AGENTS.md',
    'out/Architecture.md','out/Database.md','out/Decisions.md',
    'out/FailureLedger.md','out/Issue109.md','out/Operation.md',
    'out/Requirements.md','out/TestPlan.md','out/TestReport.md',
    'src/deploy/g7-s3/S3-4-B2.md',
    'src/server/g7-operational/s3-4-b2-oci.ts',
    'src/tests/unit/g7-s3-4-b2-oci.test.ts',
    'src/tests/unit/g7-staging-ghcr-guard.test.ts',
  ];
  test('exact B2-1 title and reviewed paths skip GHCR',()=>{
    const x=runScope(paths,title+'\n\nOffline bytes-only test; production OFF');
    expect(x.status,x.stderr).toBe(0);
    expect(x.values).toContain('publish=false');
  });
  test('active migrations, Dockerfile, Compose, real runtime and other workflows fail closed',()=>{
    for(const unsafe of [
      'src/prisma/migrations/202610260002_g7_operational_auth/migration.sql',
      'src/Dockerfile','src/docker-compose.yml','src/scripts/deploy.ts',
      'src/app/api/cad-files/route.ts','.github/workflows/pr-ci.yml',
      'src/server/g7-operational/preflight.ts',
    ]){
      const x=runScope([paths[12],unsafe],title);
      expect(x.status).not.toBe(0);
      expect(x.stderr).toContain('G7-S3-4B2-1 GHCR exclusion disallowed path: '+unsafe);
    }
  });
  test('malformed B2-1 squash title is rejected; tag retains standard publish',()=>{
    for(const name of [title+' ',title+'-extra','#142 | S3-4-B2-1 not-approved']){
      const x=runScope([paths[12]],name);
      expect(x.status).not.toBe(0);
      expect(x.stderr).toContain('G7-S3-4B2-1 exact squash subject required');
    }
    const tagged=runScope([paths[12]],title,'refs/tags/v0.99.1');
    expect(tagged.status).toBe(0);
    expect(tagged.values).toContain('publish=true');
  });
});

describe('#142 B2-4 exact synthetic rollback replay no-GHCR exception',()=>{
  const title='#142 | S3-4-B2-4 Disposable rollback replay [G7-S3-4B2-4-NO-GHCR]';
  const paths=[".github/workflows/docker-publish.yml","AGENTS.md","out/Architecture.md","out/Database.md","out/Decisions.md","out/FailureLedger.md","out/Issue109.md","out/Operation.md","out/Requirements.md","out/TestPlan.md","out/TestReport.md","src/deploy/g7-s3/S3-4-B2-4.md","src/server/g7-operational/s3-4-b2-4.ts","src/tests/integration/g7-s3-4-b2-4.test.ts","src/tests/unit/g7-staging-ghcr-guard.test.ts"];
  test('exact approved squash subject and fifteen reviewed files publish=false',()=>{
    const r=runScope(paths,title);
    expect(r.status,r.stderr).toBe(0);
    expect(r.values).toContain('publish=false');
  });
  test('active migration, OCI publish, deployment, runtime and workflow files fail closed',()=>{
    for(const file of [
      'src/prisma/migrations/202610260002_g7_operational_auth/migration.sql',
      'src/deploy/g7-s3/prisma/migrations/202610260002_g7_operational_auth/migration.sql',
      'src/deploy/g7-s3/prisma.config.ts','src/scripts/deploy.ts',
      'src/Dockerfile','src/docker-compose.yml',
      'src/app/api/cad-files/route.ts','src/server/g7-operational/preview-handler.ts',
      '.github/workflows/pr-ci.yml',
    ]){
      const result=runScope([paths[12],file],title);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('G7-S3-4B2-4 GHCR exclusion disallowed path: '+file);
    }
  });
  test('near-miss titles block, release tag retains normal publication policy',()=>{
    for(const subject of [title+' ',title+'-other','#142 | S3-4-B2-4 unsafe']){
      const result=runScope([paths[12]],subject);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('G7-S3-4B2-4 exact squash subject required');
    }
    const tag=runScope([paths[12]],title,'refs/tags/v0.99.1');
    expect(tag.status).toBe(0);
    expect(tag.values).toContain('publish=true');
  });
});

describe('#142 B2-3 exact seven migration no-GHCR exclusion',()=>{
  const title='#142 | S3-4-B2-3 Isolated seven migration rehearsal [G7-S3-4B2-3-NO-GHCR]';
  const paths=[".github/workflows/docker-publish.yml","AGENTS.md","out/Architecture.md","out/Database.md","out/Decisions.md","out/FailureLedger.md","out/Issue109.md","out/Operation.md","out/Requirements.md","out/TestPlan.md","out/TestReport.md","src/deploy/g7-s3/S3-4-B2-3.md","src/server/g7-operational/s3-4-b2-3.ts","src/tests/integration/g7-s3-4-b2-3.test.ts","src/tests/unit/g7-staging-ghcr-guard.test.ts"];
  test('exact title and exact fifteen reviewed source/docs/test paths skip GHCR',()=>{
    const r=runScope(paths,title);
    expect(r.status,r.stderr).toBe(0);
    expect(r.values).toContain('publish=false');
  });
  test('active Prisma SQL, deployment and operating paths block exception',()=>{
    for(const file of [
      'src/prisma/migrations/202610260002_g7_operational_auth/migration.sql',
      'src/deploy/g7-s3/prisma/migrations/202610260002_g7_operational_auth/migration.sql',
      'src/deploy/g7-s3/prisma.config.ts',
      'src/scripts/deploy.ts','src/Dockerfile','src/docker-compose.yml',
      'src/app/api/cad-files/route.ts','src/server/g7-operational/preview-handler.ts',
      '.github/workflows/pr-ci.yml',
    ]){
      const r=runScope([paths[12],file],title);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('G7-S3-4B2-3 GHCR exclusion disallowed path: '+file);
    }
  });
  test('near-miss subjects fail closed; version tag uses existing release policy',()=>{
    for(const malformed of [title+' ',title+'-fake','#142 | S3-4-B2-3 unapproved']){
      const r=runScope([paths[12]],malformed);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('G7-S3-4B2-3 exact squash subject required');
    }
    const tag=runScope([paths[12]],title,'refs/tags/v0.99.1');
    expect(tag.status).toBe(0);
    expect(tag.values).toContain('publish=true');
  });
});

describe('#142 B2-2B exact no-GHCR disposable byte preflight',()=>{
  const title='#142 | S3-4-B2-2B Isolated byte evidence preflight [G7-S3-4B2-2B-NO-GHCR]';
  const paths=[".github/workflows/docker-publish.yml","AGENTS.md","out/Architecture.md","out/Database.md","out/Decisions.md","out/FailureLedger.md","out/Issue109.md","out/Operation.md","out/Requirements.md","out/TestPlan.md","out/TestReport.md","src/deploy/g7-s3/S3-4-B2-2B.md","src/server/g7-operational/s3-4-b2-2b-observation.ts","src/tests/unit/g7-s3-4-b2-2b-observation.test.ts","src/tests/unit/g7-staging-ghcr-guard.test.ts"];
  test('exact B2-2B title and exactly fifteen reviewed paths skip GHCR',()=>{
    const r=runScope(paths,title);
    expect(r.status,r.stderr).toBe(0);
    expect(r.values).toContain('publish=false');
  });
  test('operating paths and other Actions workflows deny no-GHCR scope',()=>{
    for(const file of [
      'src/Dockerfile','src/scripts/deploy.ts','src/prisma/migrations/x/migration.sql',
      'src/docker-compose.yml','src/app/api/cad-files/route.ts',
      'src/server/g7-operational/preview-handler.ts','.github/workflows/pr-ci.yml',
      'src/deploy/g7-s3/prisma.config.ts',
    ]){
      const r=runScope([paths[12],file],title);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('G7-S3-4B2-2B GHCR exclusion disallowed path: '+file);
    }
  });
  test('changed subject fails closed; release tag retains existing publish policy',()=>{
    for(const malformed of [title+' ',title+'-fake','#142 | S3-4-B2-2B other']){
      const r=runScope([paths[12]],malformed);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('G7-S3-4B2-2B exact squash subject required');
    }
    const tag=runScope([paths[12]],title,'refs/tags/v0.99.1');
    expect(tag.status).toBe(0);
    expect(tag.values).toContain('publish=true');
  });
});

describe('#142 B2-2A exact capture claim GHCR exclusion',()=>{
  const title='#142 | S3-4-B2-2A Capture barrier packet contract [G7-S3-4B2-2A-NO-GHCR]';
  const paths=[".github/workflows/docker-publish.yml","AGENTS.md","out/Architecture.md","out/Database.md","out/Decisions.md","out/FailureLedger.md","out/Issue109.md","out/Operation.md","out/Requirements.md","out/TestPlan.md","out/TestReport.md","src/deploy/g7-s3/S3-4-B2-2.md","src/server/g7-operational/s3-4-b2-capture.ts","src/tests/unit/g7-s3-4-b2-capture.test.ts","src/tests/unit/g7-staging-ghcr-guard.test.ts"];
  test('approved exact title and all enumerated files publish=false',()=>{
    const r=runScope(paths,title);
    expect(r.status,r.stderr).toBe(0);
    expect(r.values).toContain('publish=false');
  });
  test('operating paths and near-miss subject cannot bypass release gate',()=>{
    for(const file of [
      'src/Dockerfile','src/scripts/deploy.ts','src/prisma/migrations/x/migration.sql',
      'src/docker-compose.yml','src/app/api/cad-files/route.ts',
      'src/server/g7-operational/preflight.ts','.github/workflows/pr-ci.yml',
    ]){
      const r=runScope([paths[12],file],title);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('G7-S3-4B2-2A GHCR exclusion disallowed path: '+file);
    }
    for(const malformed of [title+' ',title+'-fake','#142 | S3-4-B2-2A other']){
      const r=runScope([paths[12]],malformed);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('G7-S3-4B2-2A exact squash subject required');
    }
    const tag=runScope([paths[12]],title,'refs/tags/v0.99.1');
    expect(tag.status).toBe(0);
    expect(tag.values).toContain('publish=true');
  });
});

describe('#142 B2-5 disposable private evidence GHCR exclusion',()=>{
  const title='#142 | S3-4-B2-5 Disposable private evidence reconciliation [G7-S3-4B2-5-NO-GHCR]';
  const files=[
    '.github/workflows/docker-publish.yml','AGENTS.md',
    'out/Architecture.md','out/Database.md','out/Decisions.md',
    'out/FailureLedger.md','out/Issue109.md','out/Operation.md',
    'out/Requirements.md','out/TestPlan.md','out/TestReport.md',
    'src/deploy/g7-s3/S3-4-B2-5.md',
    'src/server/g7-operational/s3-4-b2-5.ts',
    'src/tests/unit/g7-s3-4-b2-5.test.ts',
    'src/tests/unit/g7-staging-ghcr-guard.test.ts',
  ];
  test('only exact B2-5 squash subject plus fifteen approved paths skip GHCR',()=>{
    const r=runScope(files,title+'\n\nUntrusted packet correlation only; no site proof');
    expect(r.status,r.stderr).toBe(0);
    expect(r.values).toContain('publish=false');
    expect(r.values).not.toContain('publish=true');
  });
  test('production path, active migration, image build and unrelated CI workflow refuse exclusion',()=>{
    for(const forbidden of [
      'src/prisma/schema.prisma',
      'src/prisma/migrations/202610260002_g7_operational_auth/migration.sql',
      'src/deploy/g7-s3/prisma/migrations/202610260002_g7_operational_auth/migration.sql',
      'src/deploy/g7-s3/prisma.config.ts',
      'src/Dockerfile','src/docker-compose.yml','src/scripts/deploy.ts',
      'src/app/api/cad-files/route.ts',
      'src/app/api/g7-operational/[...segments]/route.ts',
      'src/server/g7-operational/preflight.ts',
      'src/tests/unit/unauthorized.test.ts','.github/workflows/pr-ci.yml',
    ]){
      const r=runScope([files[12],forbidden],title);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('G7-S3-4B2-5 GHCR exclusion disallowed path: '+forbidden);
      expect(r.values).toBe('');
    }
  });
  test('near misses fail closed; other B2 subject and tag never bypass release',()=>{
    for(const malformed of [title+' ',title+'-extra',
      '#142 | S3-4-B2-5 other', '#142 | S3-4-B2-5',
    ]){
      const r=runScope([files[12]],malformed);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('G7-S3-4B2-5 exact squash subject required');
    }
    const old=runScope([files[12]],
      '#142 | S3-4-B2-4 Disposable rollback replay [G7-S3-4B2-4-NO-GHCR]');
    expect(old.status).not.toBe(0);
    const tagged=runScope([files[12]],title,'refs/tags/v0.99.1');
    expect(tagged.status).toBe(0);
    expect(tagged.values).toContain('publish=true');
  });
});

describe('#142/#67 Docker layer compressed TAR audit exact no-GHCR gate', () => {
  const exact = '#142 | #67 Docker layer archive compatibility [CI-142-LAYER-NO-GHCR]';
  const allowed = [
    '.github/workflows/docker-publish.yml', 'AGENTS.md',
    'out/FailureLedger.md', 'out/TestPlan.md', 'out/TestReport.md',
    'src/scripts/audit_standalone_layers.py',
    'src/scripts/test_audit_standalone_layers.py',
    'src/tests/unit/g7-staging-ghcr-guard.test.ts',
  ];
  test('exact title and exactly eight CI-only paths skip GHCR', () => {
    const result = runScope(allowed, exact);
    expect(result.status, result.stderr).toBe(0);
    expect(result.values).toContain('publish=false');
  });
  test('runtime, active Prisma, Dockerfile, deployment and other workflow fail closed', () => {
    for (const file of [
      'src/Dockerfile', 'src/server/repositories/cad.ts',
      'src/prisma/migrations/20261028_unauthorized/migration.sql',
      '.github/workflows/pr-ci.yml', 'src/scripts/measure-images.sh',
    ]) {
      const result = runScope([allowed[5], file], exact);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('CI-142-LAYER GHCR exclusion disallowed path: ' + file);
    }
  });
  test('near-match squash subject rejected; release tag unaffected', () => {
    for (const subject of [exact + ' ', exact + '-other', '#142 | #67 Docker layer unsafe']) {
      const r = runScope([allowed[5]], subject);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('CI-142-LAYER exact squash subject required');
    }
    const tagged = runScope([allowed[5]], exact, 'refs/tags/v0.99.1');
    expect(tagged.status).toBe(0);
    expect(tagged.values).toContain('publish=true');
  });
});

