/**
 * #109 S3-1/S3-2 candidate Prisma migrations: disposable DB ONLY.
 * The active operational prisma.config.ts / automatic migrator are unchanged.
 */
import { defineConfig } from 'prisma/config';
import { requireG7S3DisposableTarget } from '../../server/g7-operational/disposable-target';

const target = requireG7S3DisposableTarget(process.env);
export default defineConfig({
  schema: '../../prisma/schema.prisma',
  migrations: { path: './prisma/migrations' },
  datasource: { url: 'file:' + target.databasePath },
});
