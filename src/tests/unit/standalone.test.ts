import { expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareStandaloneAssets, standalonePort } from '../../scripts/standalone.mjs';

test('TC-IMAGE-001: standalone start accepts the existing --port contract', () => {
  expect(standalonePort([], '3101')).toBe('3101');
  expect(standalonePort(['--port', '3000'], '3101')).toBe('3000');
  for (const args of [['--port'], ['--port', '0'], ['--port', '65536'], ['--host', '127.0.0.1']]) {
    expect(() => standalonePort(args)).toThrow();
  }
});

test('TC-IMAGE-002: production bundle retains static chunks, fonts and DWG wasm', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'cad-standalone-'));
  try {
    for (const p of ['.next/standalone', '.next/static/chunks', 'public/fonts', 'public/libredwg/wasm']) {
      mkdirSync(path.join(root, p), { recursive: true });
    }
    writeFileSync(path.join(root, '.next/standalone/server.js'), '/* fixture */');
    writeFileSync(path.join(root, '.next/static/chunks/app.js'), 'static chunk');
    writeFileSync(path.join(root, 'public/fonts/CadKorean.typeface.json'), '{"family":"CAD Korean"}');
    writeFileSync(path.join(root, 'public/libredwg/wasm/libredwg-web.wasm'), 'fixture-wasm');
    prepareStandaloneAssets(root);
    for (const p of ['.next/static/chunks/app.js', 'public/fonts/CadKorean.typeface.json', 'public/libredwg/wasm/libredwg-web.wasm']) {
      expect(readFileSync(path.join(root, '.next/standalone', p), 'utf8')).toBeTruthy();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('TC-IMAGE-003: release images separate the one-shot migrator from web startup', () => {
  const root = path.resolve(process.cwd(), '..');
  const docker = readFileSync(path.join(root, 'src/Dockerfile'), 'utf8');
  const compose = readFileSync(path.join(root, 'src/docker-compose.yml'), 'utf8');
  const migratorDependencies = docker.split('FROM dependencies AS migrator-dependencies\n')[1]?.split('\nFROM runtime-base AS migrator')[0];
  const migrator = docker.split('FROM runtime-base AS migrator\n')[1]?.split('\nFROM runtime-base AS runtime')[0];
  const webRuntime = docker.split('FROM runtime-base AS runtime\n')[1];

  expect(migratorDependencies).toContain('npm prune --omit=dev --offline --legacy-peer-deps');
  expect(migratorDependencies).toContain('node scripts/prepare-migrator-package.mjs --verify');
  expect(migrator).toContain('COPY --from=migrator-dependencies --chown=cad:cad /app/src/node_modules ./node_modules');
  expect(migrator).not.toContain('COPY --from=dependencies /app/src/node_modules ./node_modules');
  expect(migrator).not.toContain('COPY --from=builder /app/src/node_modules');
  expect(migrator).toContain('USER cad');

  // Check the *migrator stage*, not an obsolete image-wide CMD string.
  const migratorCmd = migrator?.split('\n').find(line => line.trim().startsWith('CMD ['));
  expect(migratorCmd).toBeDefined();
  expect(JSON.parse(migratorCmd?.trim().replace(/^CMD\s+/, '') ?? '[]')).toEqual([
    './node_modules/.bin/tsx', 'scripts/deploy.ts',
  ]);
  expect(migrator).not.toContain('server.js');
  expect(webRuntime).toContain('CMD ["node", "server.js"]');
  expect(docker).not.toContain('COPY --from=builder /app/src /app/src');
  expect(compose).toContain('condition: service_completed_successfully');
  expect(compose).toContain('target: migrator');
  expect(compose).toContain('target: runtime');
});

test('TC-IMG66-010: migrator deploy waits for Prisma migration before password backfill', () => {
  const root = path.resolve(process.cwd(), '..');
  const deploy = readFileSync(path.join(root, 'src/scripts/deploy.ts'), 'utf8');
  const migrateSpawn = deploy.indexOf("['migrate', 'deploy']");
  const migrateCompletion = deploy.indexOf('await new Promise<void>');
  const backfillSpawn = deploy.indexOf("['scripts/backfill-delete-passwords.ts']");
  expect(deploy).toContain('node_modules/.bin/prisma');
  expect(deploy).toContain('node_modules/.bin/tsx');
  expect(migrateSpawn).toBeGreaterThan(-1);
  expect(migrateCompletion).toBeGreaterThan(migrateSpawn);
  expect(backfillSpawn).toBeGreaterThan(migrateCompletion);
  expect(deploy).toContain('code === 0 ? resolve() : reject');
  expect(deploy).not.toContain('server.js');
});


test.skipIf(process.platform === 'win32')('TC-IMAGE-010: Compose launcher normalizes tagless image pairs and enforces digest pairing', async () => {
  const { execFileSync } = await import('node:child_process');
  const root = path.resolve(process.cwd(), '..');
  const launcher = path.join(root, 'src/scripts/compose.sh');
  const envfile = path.join(root, '.env.example');
  const resolve = (vars: Record<string, string> = {}) => execFileSync(
    'bash', [launcher, envfile, '--print-images'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GHCR_IMAGE: '', GHCR_MIGRATION_IMAGE: '', ...vars },
    },
  );
  expect(resolve()).toContain('migrate=cad-layout-viewer:local-migrate');
  expect(resolve({ GHCR_IMAGE: 'ghcr.io/planner77/layoutmanager:0.26.0' }))
    .toContain('migrate=ghcr.io/planner77/layoutmanager:0.26.0-migrate');
  expect(resolve({ GHCR_IMAGE: 'ghcr.io/planner77/layoutmanager' }))
    .toBe('app=ghcr.io/planner77/layoutmanager:latest\nmigrate=ghcr.io/planner77/layoutmanager:latest-migrate\n');
  expect(resolve({ GHCR_IMAGE: 'registry.example:5000/org/cad' }))
    .toContain('migrate=registry.example:5000/org/cad:latest-migrate');
  expect(() => resolve({ GHCR_IMAGE: 'ghcr.io/planner77/layoutmanager@sha256:abc' })).toThrow();
  expect(resolve({
    GHCR_IMAGE: 'ghcr.io/planner77/layoutmanager@sha256:abc',
    GHCR_MIGRATION_IMAGE: 'ghcr.io/planner77/layoutmanager@sha256:def',
  })).toContain('migrate=ghcr.io/planner77/layoutmanager@sha256:def');
});

test('TC-IMAGE-011: GHCR publication stages two candidates before public alias promotion', () => {
  const root = path.resolve(process.cwd(), '..');
  const workflow = readFileSync(path.join(root, '.github/workflows/docker-publish.yml'), 'utf8');
  const app = workflow.indexOf('name: Build application candidate');
  const migration = workflow.indexOf('name: Build migration candidate');
  const promote = workflow.indexOf('name: Promote paired release images after both candidates succeed');
  expect(app).toBeGreaterThan(0);
  expect(migration).toBeGreaterThan(app);
  expect(promote).toBeGreaterThan(migration);
  expect(workflow.slice(app, promote)).not.toContain('tags: ${{ steps.meta.outputs.tags }}');
  expect(workflow.slice(app, promote)).not.toContain('tags: ${{ steps.meta_migration.outputs.tags }}');
  expect(workflow).toContain('docker buildx imagetools create --tag "$IMAGE:${APP_VERSION}-migrate"');
  expect(workflow).toContain('cancel-in-progress: false');
});
