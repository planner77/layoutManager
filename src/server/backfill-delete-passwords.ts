import type { Database } from './db';
import { hashDeletePassword } from './password';
import { DELETE_PASSWORD_TRIGGER_SQL } from './delete-password-triggers';

export async function backfillDeletePasswords(db: Database) {
  const before = await db.$queryRawUnsafe<Array<{ versions: bigint; locations: bigint }>>(`SELECT (SELECT count(*) FROM "CadFileVersion") versions, (SELECT count(*) FROM "CadLocation") locations`);
  const currentBefore = await db.cadLocation.findMany({ where: { currentVersionId: { not: null } }, select: { id: true, currentVersionId: true }, orderBy: { id: 'asc' } });
  const rows = await db.cadFileVersion.findMany({ where: { deletePasswordHash: null }, select: { id: true } });
  for (const row of rows) {
    const hash = await hashDeletePassword('1234');
    await db.cadFileVersion.updateMany({ where: { id: row.id, deletePasswordHash: null }, data: { deletePasswordHash: hash } });
  }
  const remaining = await db.cadFileVersion.count({ where: { deletePasswordHash: null } });
  if (remaining) throw new Error(`delete password backfill incomplete: ${remaining}`);
  for (const statement of DELETE_PASSWORD_TRIGGER_SQL) await db.$executeRawUnsafe(statement);
  const after = await db.$queryRawUnsafe<Array<{ versions: bigint; locations: bigint }>>(`SELECT (SELECT count(*) FROM "CadFileVersion") versions, (SELECT count(*) FROM "CadLocation") locations`);
  const currentAfter = await db.cadLocation.findMany({ where: { currentVersionId: { not: null } }, select: { id: true, currentVersionId: true }, orderBy: { id: 'asc' } });
  if (before[0].versions !== after[0].versions || before[0].locations !== after[0].locations || JSON.stringify(currentBefore) !== JSON.stringify(currentAfter)) throw new Error('delete password backfill changed protected rows or Current pointers');
  const foreignKeys = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(`PRAGMA foreign_key_check`);
  if (foreignKeys.length) throw new Error(`delete password backfill foreign key check failed: ${foreignKeys.length}`);
}
