import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/integration/*.s3.ts'], testTimeout: 30000, hookTimeout: 30000, fileParallelism: false }, resolve: { alias: { '@': new URL('.', import.meta.url).pathname } } });
