/**
 * #109 S1 - an explicitly selected, disposable staging-only Prisma CLI target.
 * This config is NOT the application's operational prisma.config.ts.
 * Reject real DB paths BEFORE Prisma can apply any SQL migration.
 */
import { defineConfig } from 'prisma/config';
import { resolveG7StagingGate } from '../../server/g7-staging/gate';

// Reuse the same realpath, UID, symlink, manifest/schema, release/operation
// checks as the staged App Router. No default/fallback datasource is safe.
// The environment must be explicitly set for staging BEFORE migrate deploy.
const target = resolveG7StagingGate(process.env);
if (!target) throw new Error('G7_STAGING_PRISMA_TARGET_DENIED');

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: { path: './prisma/migrations' },
  datasource: { url: 'file:' + target.databasePath },
});
