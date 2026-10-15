import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { hashDeletePassword } from "../../server/password";

const databaseUrl = process.env.DATABASE_URL;
const storageRoot = process.env.CAD_STORAGE_PATH;
const sentinelDirectory = process.env.CAD_MASTER_MIGRATION_DIR;
if (!databaseUrl?.startsWith("file:") || !storageRoot || !sentinelDirectory) {
  throw new Error("isolated migration environment is required");
}
const databasePath = databaseUrl.slice(5);
const expectedPrefix = path.join(
  await realpath(tmpdir()),
  "cad-master-migration-",
);
const safeDirectory = await realpath(sentinelDirectory);
if (
  !safeDirectory.startsWith(expectedPrefix) ||
  path.resolve(path.dirname(databasePath)) !== safeDirectory ||
  path.resolve(storageRoot) !== path.join(safeDirectory, "cad")
) {
  throw new Error("migration fixture paths are outside the isolated directory");
}
for (const target of [databasePath, storageRoot]) {
  try {
    await lstat(target);
    throw new Error(`migration fixture target already exists: ${target}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
await mkdir(storageRoot, { recursive: true });

const BetterSqlite = createRequire(import.meta.url)("better-sqlite3") as new (
  filename: string,
) => {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): { run(...values: unknown[]): unknown };
};
const sqlite = new BetterSqlite(databasePath);
const appliedMigrations = [
  "202609070001_locations",
  "202609090001_description",
  "202609110001_delete_password",
  "202609110002_delete_invariants",
  "202609110003_drawing_name",
];
for (const migration of appliedMigrations) {
  sqlite.exec(
    await readFile(
      new URL(
        `../../prisma/migrations/${migration}/migration.sql`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
}

const locationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const versionIds = [
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
];
sqlite
  .prepare(
    `INSERT INTO CadLocation
      (id,business_unit,site,building,floor,current_version_id,next_version,created_at,updated_at)
     VALUES (?,?,?,?,?,NULL,4,?,?)`,
  )
  .run(
    locationId,
    "이관 사업부",
    "이관 사업장",
    "구동",
    "구층",
    "2026-10-01",
    "2026-10-03",
  );

const insertVersion = sqlite.prepare(
  `INSERT INTO CadFileVersion
    (id,location_id,version,original_filename,drawing_name,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at,created_at,updated_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
);
for (let index = 0; index < versionIds.length; index += 1) {
  const version = index + 1;
  const bytes = Buffer.from(
    `0\nSECTION\n2\nENTITIES\n0\nENDSEC\n999\nmigrated-${version}\n0\nEOF\n`,
  );
  const relativePath = `${locationId}/${versionIds[index]}/original.dxf`;
  const absolutePath = path.join(storageRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes);
  insertVersion.run(
    versionIds[index],
    locationId,
    version,
    `migrated-v${version}.dxf`,
    null,
    `legacy history ${version}`,
    await hashDeletePassword("1234"),
    "DXF",
    bytes.byteLength,
    createHash("sha256").update(bytes).digest("hex"),
    relativePath,
    `2026-10-0${version}`,
    `2026-10-0${version}`,
    `2026-10-0${version}`,
  );
}
sqlite
  .prepare("UPDATE CadLocation SET current_version_id=? WHERE id=?")
  .run(versionIds[1], locationId);
sqlite.close();

for (const migration of appliedMigrations) {
  const result = spawnSync(
    path.resolve("node_modules/.bin/prisma"),
    ["migrate", "resolve", "--applied", migration],
    { cwd: process.cwd(), env: process.env, stdio: "inherit" },
  );
  if (result.status !== 0)
    throw new Error(`could not mark ${migration} applied`);
}
