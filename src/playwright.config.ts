import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const data = process.env.CAD_E2E_DIR ||= mkdtempSync(path.join(tmpdir(), 'cad-e2e-'));
const port = process.env.CAD_E2E_PORT || '3101';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  webServer: { command: `npm run db:deploy && npm run start -- --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: false, env: { CAD_STORAGE_BACKEND: process.env.CAD_E2E_STORAGE_BACKEND === 's3' ? 's3' : 'local', DATABASE_URL: `file:${data}/db.sqlite`, CAD_STORAGE_PATH: `${data}/cad`, MAX_UPLOAD_SIZE_MB: process.env.CAD_E2E_MAX_UPLOAD_SIZE_MB ?? '100' } },
});
