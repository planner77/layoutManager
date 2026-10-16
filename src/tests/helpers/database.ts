import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Database } from "../../server/db";
import { registration } from "../../domain/cad";
type Sqlite = { exec(sql: string): void; close(): void };
const BetterSqlite = createRequire(import.meta.url)("better-sqlite3") as new (
  filename: string,
) => Sqlite;
export const migrations = [
  "202609070001_locations",
  "202609090001_description",
  "202609110001_delete_password",
  "202609110002_delete_invariants",
  "202609110003_drawing_name",
  "202610150001_master_hierarchy",
];
export async function migrate(filename: string, list = migrations) {
  const sqlite = new BetterSqlite(filename);
  try {
    for (const name of list)
      sqlite.exec(
        await readFile(
          new URL(
            `../../prisma/migrations/${name}/migration.sql`,
            import.meta.url,
          ),
          "utf8",
        ),
      );
  } finally {
    sqlite.close();
  }
}
export async function seedChain(
  db: Database,
  names = {
    businessUnit: "자동화",
    product: "제품 A",
    site: "평택",
    building: "A동",
    floor: "2층",
  },
) {
  const businessUnit = await db.businessUnit.create({
    data: { id: randomUUID(), name: names.businessUnit },
  });
  const product = await db.product.create({
    data: {
      id: randomUUID(),
      businessUnitId: businessUnit.id,
      name: names.product,
    },
  });
  const site = await db.cadSite.create({
    data: {
      id: randomUUID(),
      productId: product.id,
      name: names.site,
      kind: "SITE",
    },
  });
  const building = await db.building.create({
    data: { id: randomUUID(), siteId: site.id, name: names.building },
  });
  const floor = await db.cadLocation.create({
    data: { id: randomUUID(), buildingId: building.id, name: names.floor },
  });
  return {
    businessUnit,
    product,
    site,
    building,
    floor,
    input: registration({
      businessUnitId: businessUnit.id,
      productId: product.id,
      siteId: site.id,
      buildingId: building.id,
      floorId: floor.id,
      registeredAt: "2026-09-07",
      makeCurrent: true,
      deletePassword: "1234",
    }),
  };
}
