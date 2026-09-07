import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const data = process.env.CAD_E2E_DIR ||= mkdtempSync(path.join(tmpdir(), 'cad-e2e-'));
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3101', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  webServer: { command: 'npm run db:deploy && npm run start -- --port 3101', url: 'http://127.0.0.1:3101', reuseExistingServer: false, env: { DATABASE_URL: `file:${data}/db.sqlite`, CAD_STORAGE_PATH: `${data}/cad`, MAX_UPLOAD_SIZE_MB: '1' } },
});
