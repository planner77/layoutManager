import { defineConfig } from '@playwright/test';
/** Dedicated non-production CPU-only converter validation suite. Never skipped. */
export default defineConfig({
  testDir: '.',
  testMatch: 'headless.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: {timeout: 20_000},
  use: {trace: 'off', screenshot: 'off', video: 'off'},
  reporter: 'line',
});
