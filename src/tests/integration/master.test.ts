import { beforeEach, afterEach, test, expect } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createDb, type Database } from "../../server/db";
import { MasterRepository } from "../../server/repositories/master";
import { CadRepository } from "../../server/repositories/cad";
import {
  hashDeletePassword,
  verifyDeletePassword,
} from "../../server/password";
import { migrate, seedChain } from "../helpers/database";
type Sqlite = {
  exec(sql: string): void;
  close(): void;
  prepare(sql: string): {
    all(...values: unknown[]): Record<string, unknown>[];
    get(...values: unknown[]): Record<string, unknown>;
    run(...values: unknown[]): unknown;
  };
};
const BetterSqlite = createRequire(import.meta.url)("better-sqlite3") as new (
  filename: string,
) => Sqlite;
let directory: string, db: Database, masters: MasterRepository;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "cad-master-"));
  const file = `${directory}/test.sqlite`;
  await migrate(file);
  db = createDb(`file:${file}`);
  masters = new MasterRepository(db);
});
afterEach(async () => {
  await db.$disconnect();
  await rm(directory, { recursive: true, force: true });
});
test("TC-MASTER-001/006: hierarchy lifecycle, duplicate, immutable identity and safe delete", async () => {
  const bu = await masters.create("business-units", { name: " 사업부 " });
  const product = await masters.create("products", {
    parentId: bu.id,
    name: "제품",
  });
  const site = await masters.create("sites", {
    parentId: product.id,
    name: "법인 A",
    kind: "LEGAL_ENTITY",
  });
  const building = await masters.create("buildings", {
    parentId: site.id,
    name: "A동",
  });
  const floor = await masters.create("floors", {
    parentId: building.id,
    name: "1F",
  });
  expect((await masters.tree())[0].products[0].sites[0]).toMatchObject({
    id: site.id,
    kind: "LEGAL_ENTITY",
  });
  await expect(
    masters.create("floors", { parentId: building.id, name: "1F" }),
  ).rejects.toMatchObject({ code: "DUPLICATE_MASTER" });
  await expect(
    masters.create("floors", { parentId: crypto.randomUUID(), name: "2F" }),
  ).rejects.toMatchObject({ code: "INVALID_PARENT" });
  await masters.update("sites", site.id, {
    name: "법인 B",
    kind: "SITE",
    active: false,
  });
  expect(
    await db.cadSite.findUniqueOrThrow({ where: { id: site.id } }),
  ).toMatchObject({ name: "법인 B", kind: "SITE", active: false });
  await masters.update("sites", site.id, { active: true });
  await expect(masters.remove("buildings", building.id)).rejects.toMatchObject({
    code: "MASTER_REFERENCED",
  });
  expect(await masters.remove("floors", floor.id)).toMatchObject({
    deleted: true,
  });
});
test("TC-MASTER-005/006: unclassified floor reclassification preserves complete history and rejects collision", async () => {
  const legacy = await seedChain(db, {
    businessUnit: "사업부",
    product: "미분류",
    site: "기존",
    building: "A동",
    floor: "1F",
  });
  await db.product.update({
    where: { id: legacy.product.id },
    data: { isUnclassified: true },
  });
  const actual = await seedChain(db, {
    businessUnit: "사업부2",
    product: "제품 X",
    site: "신규",
    building: "B동",
    floor: "2F",
  });
  const repo = new CadRepository(db),
    first = await repo.register(legacy.input, {
      originalFilename: "a.dxf",
      fileFormat: "DXF",
      fileSize: 3,
      sha256: "a".repeat(64),
      storagePath: "a",
    }),
    second = await repo.register(legacy.input, {
      originalFilename: "b.dxf",
      fileFormat: "DXF",
      fileSize: 4,
      sha256: "b".repeat(64),
      storagePath: "b",
    });
  const before = await db.cadLocation.findUniqueOrThrow({
      where: { id: legacy.floor.id },
    }),
    collision = await db.cadLocation.create({
      data: {
        id: crypto.randomUUID(),
        buildingId: actual.building.id,
        name: "1F",
      },
    });
  await expect(
    masters.reclassifyFloor(legacy.floor.id, actual.building.id),
  ).rejects.toMatchObject({ code: "RECLASSIFY_COLLISION" });
  await db.cadLocation.delete({ where: { id: collision.id } });
  await masters.reclassifyFloor(legacy.floor.id, actual.building.id);
  const after = await db.cadLocation.findUniqueOrThrow({
    where: { id: legacy.floor.id },
  });
  expect(after).toMatchObject({
    id: before.id,
    nextVersion: before.nextVersion,
    currentVersionId: second.id,
    buildingId: actual.building.id,
  });
  const preservedVersions = await db.cadFileVersion.findMany({
    where: { locationId: legacy.floor.id },
  });
  expect(preservedVersions.map((version) => version.id).sort()).toEqual(
    [first.id, second.id].sort(),
  );
  expect(
    preservedVersions.every((version) =>
      version.deletePasswordHash?.startsWith("scrypt$v1$"),
    ),
  ).toBe(true);
  for (const version of preservedVersions) {
    expect(await verifyDeletePassword("1234", version.deletePasswordHash!)).toBe(
      true,
    );
  }
});
test("TC-MASTER-005: populated migration preserves real hashes, bytes, shared labels and per-BU dedup", async () => {
  const legacy = `${directory}/legacy.sqlite`;
  await migrate(legacy, [
    "202609070001_locations",
    "202609090001_description",
    "202609110001_delete_password",
    "202609110002_delete_invariants",
    "202609110003_drawing_name",
  ]);

  const bytes = [
    Buffer.from("0\\nSECTION\\n2\\nENTITIES\\n0\\nENDSEC\\n0\\nEOF\\n"),
    Buffer.from([0, 255, 16, 32, 68, 87, 71, 0, 128]),
    Buffer.from("same labels in a different business unit"),
  ];
  const storagePaths = await Promise.all(
    bytes.map(async (content, index) => {
      const storagePath = `${directory}/original-${index + 1}.cad`;
      await writeFile(storagePath, content);
      return storagePath;
    }),
  );
  const sha256 = bytes.map((content) =>
    createHash("sha256").update(content).digest("hex"),
  );
  const passwords = ["alpha-password", "beta-password", "gamma-password"];
  const passwordHashes = await Promise.all(passwords.map(hashDeletePassword));
  const locationA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const locationB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const versionIds = [
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  ];

  const sqlite = new BetterSqlite(legacy);
  const insertLocation = sqlite.prepare(
    `INSERT INTO CadLocation
      (id,business_unit,site,building,floor,current_version_id,next_version,created_at,updated_at)
     VALUES (?,?,?,?,?,NULL,?,?,?)`,
  );
  insertLocation.run(
    locationA,
    "BU-A",
    "공통 사업장",
    "공통동",
    "1F",
    3,
    "2026-01-01",
    "2026-01-02",
  );
  insertLocation.run(
    locationB,
    "BU-B",
    "공통 사업장",
    "공통동",
    "1F",
    2,
    "2026-02-01",
    "2026-02-02",
  );

  const insertVersion = sqlite.prepare(
    `INSERT INTO CadFileVersion
      (id,location_id,version,original_filename,drawing_name,description,delete_password_hash,file_format,file_size,sha256,storage_path,registered_at,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  for (let index = 0; index < versionIds.length; index += 1) {
    insertVersion.run(
      versionIds[index],
      index < 2 ? locationA : locationB,
      index < 2 ? index + 1 : 1,
      `original-${index + 1}.${index === 1 ? "dwg" : "dxf"}`,
      index === 1 ? "사용자 이름" : null,
      `memo-${index + 1}`,
      passwordHashes[index],
      index === 1 ? "DWG" : "DXF",
      bytes[index].byteLength,
      sha256[index],
      storagePaths[index],
      `2026-0${index + 1}-01`,
      `2026-0${index + 1}-01`,
      `2026-0${index + 1}-02`,
    );
  }
  sqlite
    .prepare("UPDATE CadLocation SET current_version_id=? WHERE id=?")
    .run(versionIds[1], locationA);
  sqlite
    .prepare("UPDATE CadLocation SET current_version_id=? WHERE id=?")
    .run(versionIds[2], locationB);

  const before = sqlite
    .prepare("SELECT * FROM CadFileVersion ORDER BY id")
    .all();
  sqlite.exec(
    await readFile(
      new URL(
        "../../prisma/migrations/202610150001_master_hierarchy/migration.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  const migratedVersions = sqlite
    .prepare("SELECT * FROM CadFileVersion ORDER BY id")
    .all();
  expect(migratedVersions).toEqual(before);
  expect(
    sqlite
      .prepare(
        "SELECT id,current_version_id,next_version FROM CadLocation ORDER BY id",
      )
      .all(),
  ).toEqual([
    { id: locationA, current_version_id: versionIds[1], next_version: 3 },
    { id: locationB, current_version_id: versionIds[2], next_version: 2 },
  ]);
  expect(
    sqlite
      .prepare(
        `SELECT bu.name business_unit,p.name product,s.name site,b.name building,l.name floor
         FROM CadLocation l
         JOIN Building b ON b.id=l.building_id
         JOIN CadSite s ON s.id=b.site_id
         JOIN Product p ON p.id=s.product_id
         JOIN BusinessUnit bu ON bu.id=p.business_unit_id
         ORDER BY bu.name`,
      )
      .all(),
  ).toEqual([
    {
      business_unit: "BU-A",
      product: "미분류",
      site: "공통 사업장",
      building: "공통동",
      floor: "1F",
    },
    {
      business_unit: "BU-B",
      product: "미분류",
      site: "공통 사업장",
      building: "공통동",
      floor: "1F",
    },
  ]);
  expect(
    sqlite
      .prepare("SELECT count(*) count FROM Product WHERE is_unclassified=1")
      .get(),
  ).toEqual({ count: 2 });
  expect(sqlite.prepare("SELECT count(*) count FROM CadSite").get()).toEqual({
    count: 2,
  });
  expect(sqlite.prepare("SELECT count(*) count FROM Building").get()).toEqual({
    count: 2,
  });
  expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  sqlite.close();

  for (let index = 0; index < storagePaths.length; index += 1) {
    const preservedBytes = await readFile(storagePaths[index]);
    expect(preservedBytes.equals(bytes[index])).toBe(true);
    expect(createHash("sha256").update(preservedBytes).digest("hex")).toBe(
      sha256[index],
    );
    expect(
      await verifyDeletePassword(
        passwords[index],
        migratedVersions[index].delete_password_hash as string,
      ),
    ).toBe(true);
  }
});
test("TC-MASTER-005: migration failure rolls back the entire schema/data rewrite", async () => {
  const legacy = `${directory}/rollback.sqlite`;
  await migrate(legacy, [
    "202609070001_locations",
    "202609090001_description",
    "202609110001_delete_password",
    "202609110002_delete_invariants",
    "202609110003_drawing_name",
  ]);
  let sqlite = new BetterSqlite(legacy);
  sqlite.exec(
    "INSERT INTO CadLocation(id,business_unit,site,building,floor) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','BU','SITE','A','1F')",
  );
  const sql = await readFile(
    new URL(
      "../../prisma/migrations/202610150001_master_hierarchy/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  expect(() =>
    sqlite.exec(
      sql.replace("COMMIT;", "INSERT INTO missing_table VALUES(1); COMMIT;"),
    ),
  ).toThrow();
  sqlite.close();
  sqlite = new BetterSqlite(legacy);
  expect(
    sqlite
      .prepare("SELECT business_unit,site,building,floor FROM CadLocation")
      .all(),
  ).toEqual([
    { business_unit: "BU", site: "SITE", building: "A", floor: "1F" },
  ]);
  expect(
    sqlite
      .prepare(
        "SELECT count(*) count FROM sqlite_master WHERE type='table' AND name='BusinessUnit'",
      )
      .get(),
  ).toEqual({ count: 0 });
  sqlite.close();
});

test("TC-191-INTEGRATION-01: direct master create refuses an inactive parent or ancestor without partial writes", async () => {
  const businessUnit = await masters.create("business-units", { name: "조직 191" });
  const product = await masters.create("products", { parentId: businessUnit.id, name: "제품 191" });
  const site = await masters.create("sites", { parentId: product.id, name: "사업장 191", kind: "SITE" });
  const building = await masters.create("buildings", { parentId: site.id, name: "동 191" });

  await masters.update("business-units", businessUnit.id, { active: false });
  await expect(masters.create("products", { parentId: businessUnit.id, name: "다른 제품" }))
    .rejects.toMatchObject({ code: "INVALID_PARENT", status: 409 });
  await expect(masters.create("sites", { parentId: product.id, name: "다른 사업장", kind: "SITE" }))
    .rejects.toMatchObject({ code: "INVALID_PARENT", status: 409 });
  await expect(masters.create("buildings", { parentId: site.id, name: "다른 동" }))
    .rejects.toMatchObject({ code: "INVALID_PARENT", status: 409 });
  await expect(masters.create("floors", { parentId: building.id, name: "새 층" }))
    .rejects.toMatchObject({ code: "INVALID_PARENT", status: 409 });
  expect((await masters.tree())[0].products[0].sites[0].buildings[0].floors).toHaveLength(0);
  expect(await masters.tree(false)).toHaveLength(0);

  await masters.update("business-units", businessUnit.id, { active: true });
  await masters.update("sites", site.id, { active: false });
  await expect(masters.create("floors", { parentId: building.id, name: "추가 거절" }))
    .rejects.toMatchObject({ code: "INVALID_PARENT", status: 409 });
  await masters.update("sites", site.id, { active: true });
  const floor = await masters.create("floors", { parentId: building.id, name: "1F" });
  expect((await masters.tree(false))[0].products[0].sites[0].buildings[0].floors[0].id).toBe(floor.id);
});
