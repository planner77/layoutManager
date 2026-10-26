/** #109 S1: standalone STAGING Prisma config; never imported by the operational migrator. */
import { defineConfig } from 'prisma/config';
export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: { path: './prisma/migrations' },
  datasource: { url: process.env.G7_STAGING_DATABASE_URL ?? 'file:/tmp/cad-g7-staging-DISABLED/fixture.sqlite' },
});
