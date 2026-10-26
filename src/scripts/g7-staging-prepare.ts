/** #109 S1: create a disposable CAD baseline ONLY, before staged Prisma migrate. */
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const isDigest = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[0-9a-f]{64}$/.test(v);
const isCommit = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{40}$/.test(v);
if (process.argv.slice(2).join(' ') !== '--ack-disposable-only')
  throw new Error('G7_STAGING_EXPLICIT_DISPOSABLE_ACK_REQUIRED');
const appDigest = process.env.G7_STAGING_APP_DIGEST;
const migratorDigest = process.env.G7_STAGING_MIGRATOR_DIGEST;
const sourceCommit = process.env.G7_STAGING_SOURCE_COMMIT;
if (!isDigest(appDigest) || !isDigest(migratorDigest) || !isCommit(sourceCommit))
  throw new Error('G7_STAGING_CANDIDATE_REFERENCE_REQUIRED');
const root = mkdtempSync(path.join(tmpdir(), 'cad-g7-staging-'));
chmodSync(root, 0o700);
mkdirSync(path.join(root, 'cad'), { mode: 0o700 });
const file = path.join(root, 'fixture.sqlite');
const Sqlite = createRequire(import.meta.url)('better-sqlite3') as
  new(filename: string) => { exec(sql: string): void; close(): void };
const db = new Sqlite(file);
// Empty DB; the formal STAGING Prisma migrator must apply all seven ordered
// migrations, including the six baseline CAD migrations.
db.exec('PRAGMA foreign_keys=ON');
db.close();
chmodSync(file, 0o600);
writeFileSync(path.join(root, 'release.json'), JSON.stringify({
  scope: 'S1-STAGING-ONLY',
  schemaId: '202610260001_g7_staging_auth',
  databasePath: file, appDigest, migratorDigest, sourceCommit,
  fixtureId: randomUUID(),
}), { mode: 0o600, flag: 'wx' });
// This prepares CAD baseline ONLY. Run staged Prisma migrate deploy separately;
// never use the operational npm run db:deploy for the auth schema.
process.stdout.write('G7_STAGING_EMPTY_DB_READY (run explicit staging Prisma migrate deploy)\n');
process.stdout.write('G7_STAGING_ROOT=' + root + '\n');
process.stdout.write('G7_STAGING_DATABASE_URL=file:' + file + '\n');
