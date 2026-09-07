import type { NextConfig } from 'next';
const config: NextConfig = { devIndicators: false, experimental: { cpus: 2 }, serverExternalPackages: ['@prisma/client', '@prisma/adapter-better-sqlite3', 'better-sqlite3'] };
export default config;
