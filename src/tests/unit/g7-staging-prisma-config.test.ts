import { afterEach, describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('#109 G7 staged Prisma CLI migration preflight', () => {
  test('never migrates an existing non-staging database even with a supplied URL', () => {
    const stage = mkdtempSync(path.join(tmpdir(), 'cad-g7-staging-'));
    const outside = mkdtempSync(path.join(tmpdir(), 'cad-g7-unsafe-'));
    roots.push(stage, outside);
    mkdirSync(path.join(stage, 'cad'));
    const staged = path.join(stage, 'fixture.sqlite');
    writeFileSync(staged, '');
    writeFileSync(path.join(stage, 'release.json'), JSON.stringify({
      scope: 'S1-STAGING-ONLY', schemaId: '202610260001_g7_staging_auth',
      databasePath: staged, appDigest: 'sha256:' + 'a'.repeat(64),
      migratorDigest: 'sha256:' + 'b'.repeat(64), sourceCommit: 'c'.repeat(40),
    }));
    // This may represent a valid business SQLite URL in a mistaken invocation.
    // The target must be refused before Prisma opens or migrates the file.
    const live = path.join(outside, 'live.sqlite');
    const sentinel = 'UNTOUCHED-UNAPPROVED-STAGING-TARGET';
    writeFileSync(live, sentinel);
    const prisma = path.join(process.cwd(), 'node_modules/prisma/build/index.js');
    const run = spawnSync(process.execPath, [
      prisma, 'migrate', 'deploy', '--config', 'deploy/g7-staging/prisma.config.ts',
    ], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 20_000,
      env: { ...process.env, G7_STAGING_ONLY: 'true', G7_AUTH_ENABLED: 'true',
        G7_RELEASE_CAPABILITY: 'G7-S1-STAGING-V1',
        G7_OPERATION_APPROVAL: 'S1-STAGING-ONLY',
        G7_STAGING_ROOT: stage, G7_STAGING_DATABASE_URL: 'file:' + live,
        DATABASE_URL: 'file:' + live, CAD_STORAGE_PATH: path.join(stage, 'cad'),
        G7_STAGING_ORIGIN: 'http://127.0.0.1:3315',
      },
    });
    expect(run.status, 'An unapproved path must never deploy migrations').not.toBe(0);
    expect(run.stdout + run.stderr).toContain('G7_STAGING_PRISMA_TARGET_DENIED');
    expect(readFileSync(live, 'utf8')).toBe(sentinel);
  }, 30_000);
});
