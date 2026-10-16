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
  expect(docker).toContain('FROM runtime-base AS migrator');
  expect(docker).toContain('FROM runtime-base AS runtime');
  expect(docker).toContain('CMD ["node", "scripts/run.mjs", "deploy"]');
  expect(docker).toContain('CMD ["node", "server.js"]');
  expect(docker).not.toContain('COPY --from=builder /app/src /app/src');
  expect(compose).toContain('condition: service_completed_successfully');
  expect(compose).toContain('target: migrator');
  expect(compose).toContain('target: runtime');
});
