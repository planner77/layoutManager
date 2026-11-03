import { defineConfig } from '@playwright/test';
/** Dedicated non-production CPU-only converter validation suite. Never skipped. */
export default defineConfig({
  testDir: '.',
  testMatch: 'headless.spec.ts',
  // CI proof runs with --read-only; Playwright artifacts must remain in the
  // explicit ephemeral /tmp tmpfs, not the immutable /app/src/test-results.
  // Do not change production mounts or remove the read-only security gate.
  outputDir: '/tmp/a2-playwright-results',
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: {timeout: 20_000},
  use: {trace: 'off', screenshot: 'off', video: 'off'},
  reporter: 'line',
});
