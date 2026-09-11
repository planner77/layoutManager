import { database } from '@/server/db';
import { hashDeletePassword } from '@/server/password';
const db = database();
try {
  const rows = await db.cadFileVersion.findMany({ where: { deletePasswordHash: null }, select: { id: true } });
  for (const row of rows) {
    const hash = await hashDeletePassword('1234');
    await db.cadFileVersion.updateMany({ where: { id: row.id, deletePasswordHash: null }, data: { deletePasswordHash: hash } });
  }
  const remaining = await db.cadFileVersion.count({ where: { deletePasswordHash: null } });
  if (remaining) throw new Error(`delete password backfill incomplete: ${remaining}`);
  await db.$executeRawUnsafe(`CREATE TRIGGER IF NOT EXISTS "cad_version_delete_password_insert" BEFORE INSERT ON "CadFileVersion" WHEN NEW."delete_password_hash" IS NULL OR length(NEW."delete_password_hash") = 0 BEGIN SELECT RAISE(ABORT, 'delete password hash required'); END`);
  await db.$executeRawUnsafe(`CREATE TRIGGER IF NOT EXISTS "cad_version_delete_password_update" BEFORE UPDATE OF "delete_password_hash" ON "CadFileVersion" WHEN NEW."delete_password_hash" IS NULL OR length(NEW."delete_password_hash") = 0 BEGIN SELECT RAISE(ABORT, 'delete password hash required'); END`);
} finally { await db.$disconnect(); }
