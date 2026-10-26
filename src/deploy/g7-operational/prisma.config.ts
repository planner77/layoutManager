/** #109 S2/S3 separate, explicit G7 Prisma migration history.
 * The normal src/prisma.config.ts and src/scripts/deploy.ts stay unchanged.
 * A missing release-specific S3 GO means the operating DB is NEVER touched.
 */
import { defineConfig } from 'prisma/config';
import { resolveG7StagingGate } from '../../server/g7-staging/gate';
import { resolveG7OperationGate, G7_OPERATION_SCHEMA_ID } from '../../server/g7-operational/gate';

const mode = process.env.G7_MIGRATION_MODE;
let url: string;
if (mode === 'S2_DISPOSABLE_DRY_RUN') {
  const candidate = resolveG7StagingGate(process.env);
  if (!candidate) throw new Error('G7_S2_DRY_RUN_TARGET_DENIED');
  url = 'file:' + candidate.databasePath;
} else if (mode === 'S3_RELEASE_APPROVED') {
  const candidate = resolveG7OperationGate(process.env);
  if (!candidate || process.env.G7_S3_MIGRATION_ACK !== 'APPLY_APPROVED_PAIR' ||
      process.env.G7_S3_BACKUP_SNAPSHOT_ID !== candidate.snapshotId ||
      process.env.G7_OPERATION_SCHEMA_ID !== G7_OPERATION_SCHEMA_ID) {
    throw new Error('G7_S3_MIGRATION_NOT_APPROVED');
  }
  url = candidate.databaseUrl;
} else {
  throw new Error('G7_MIGRATION_MODE_REQUIRED');
}
export default defineConfig({
  schema: '../../prisma/schema.prisma',
  migrations: { path: './prisma/migrations' },
  datasource: { url },
});
