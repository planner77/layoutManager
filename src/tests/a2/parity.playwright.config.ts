import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'.',testMatch:'parity.spec.ts',outputDir:'/tmp/a2-parity-results',
  workers:1,retries:0,timeout:180_000,expect:{timeout:20_000},
  use:{trace:'off',screenshot:'off',video:'off'},reporter:'line',
});
