import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  devIndicators: false,
  experimental: { cpus: 2, useTypeScriptCli: false },
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-better-sqlite3', 'better-sqlite3'],
  // Native SQLite binding and generated Prisma client are loaded dynamically by the adapter.
  outputFileTracingIncludes: {
    '/*': ['./node_modules/better-sqlite3/**/*', './generated/prisma/**/*'],
  },
};
export default config;
