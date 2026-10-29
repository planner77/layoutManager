/** Runtime DDL installed by the normal delete-password backfill after the six CAD migrations.
 * Keep these exact statements shared with G7 schema checks: they are not Prisma migrations.
 */
export const DELETE_PASSWORD_TRIGGER_SQL = [
  `CREATE TRIGGER IF NOT EXISTS "cad_version_delete_password_insert" BEFORE INSERT ON "CadFileVersion" WHEN NEW."delete_password_hash" IS NULL OR length(NEW."delete_password_hash") = 0 BEGIN SELECT RAISE(ABORT, 'delete password hash required'); END`,
  `CREATE TRIGGER IF NOT EXISTS "cad_version_delete_password_update" BEFORE UPDATE OF "delete_password_hash" ON "CadFileVersion" WHEN NEW."delete_password_hash" IS NULL OR length(NEW."delete_password_hash") = 0 BEGIN SELECT RAISE(ABORT, 'delete password hash required'); END`,
] as const;

type TriggerReader = { prepare(sql: string): { all(): Array<Record<string, unknown>> } };
/** SQLite stores the supplied CREATE body but strips the IF NOT EXISTS prefix. */
export function assertDeletePasswordTriggers(db: TriggerReader): void {
  const rows = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name LIKE 'cad_version_delete_password_%' ORDER BY name").all();
  const expected = DELETE_PASSWORD_TRIGGER_SQL.map(statement => ({
    name: statement.match(/"(cad_version_delete_password_[^"]+)"/)?.[1],
    sql: statement.replace(/^CREATE TRIGGER IF NOT EXISTS /,'CREATE TRIGGER '),
  })).sort((a,b) => String(a.name).localeCompare(String(b.name)));
  if (JSON.stringify(rows) !== JSON.stringify(expected)) throw new Error('G7_DELETE_PASSWORD_TRIGGER_DRIFT');
}
