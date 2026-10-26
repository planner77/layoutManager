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
