import { beforeEach, afterEach, test, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb, type Database } from "../../server/db";
import { CadRepository } from "../../server/repositories/cad";
import { migrate, seedChain } from "../helpers/database";
let directory: string,
  db: Database,
  repo: CadRepository,
  chain: Awaited<ReturnType<typeof seedChain>>;
const file = (n: number) => ({
  originalFilename: `file${n}.dxf`,
  fileFormat: "DXF" as const,
  fileSize: 100,
  sha256: String(n).repeat(64),
  storagePath: `test/${n}.dxf`,
});
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "cad-db-"));
  const filename = `${directory}/test.sqlite`;
  await migrate(filename);
  db = createDb(`file:${filename}`);
  repo = new CadRepository(db);
  chain = await seedChain(db);
});
afterEach(async () => {
  await db.$disconnect();
  await rm(directory, { recursive: true, force: true });
});
test("TC-MASTER-002: exact seeded ID chain registers and mismatched chain is rejected", async () => {
  const a = await repo.register(chain.input, file(1));
  expect(a.locationId).toBe(chain.floor.id);
  const other = await seedChain(db, {
    businessUnit: "설비",
    product: "제품 B",
    site: "서울",
    building: "B동",
    floor: "1층",
  });
  await expect(
    repo.register({ ...chain.input, productId: other.product.id }, file(2)),
  ).rejects.toMatchObject({ code: "INVALID_LOCATION_CHAIN" });
  expect(await db.cadFileVersion.count()).toBe(1);
});
test("TC-MASTER-002: inactive floor or ancestor rejects registration", async () => {
  await db.product.update({
    where: { id: chain.product.id },
    data: { active: false },
  });
  await expect(repo.register(chain.input, file(1))).rejects.toMatchObject({
    code: "INACTIVE_LOCATION_CHAIN",
  });
  expect(await db.cadFileVersion.count()).toBe(0);
});
test("TC-MASTER-003: versions, current replacement, concurrency and rollback", async () => {
  const versions = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      repo.register(chain.input, file(i + 1)),
    ),
  );
  expect(new Set(versions.map((v) => v.version)).size).toBe(8);
  const location = await db.cadLocation.findUniqueOrThrow({
    where: { id: chain.floor.id },
  });
  expect(versions.some((v) => v.id === location.currentVersionId)).toBe(true);
  await repo.setCurrent(chain.floor.id, versions[0].id);
  expect(
    (await db.cadLocation.findUniqueOrThrow({ where: { id: chain.floor.id } }))
      .currentVersionId,
  ).toBe(versions[0].id);

  const competing = versions.slice(1, 4);
  const currentChanges = await Promise.allSettled(
    competing.map((version) => repo.setCurrent(chain.floor.id, version.id)),
  );
  expect(currentChanges.every((result) => result.status === "fulfilled")).toBe(
    true,
  );
  const afterCompetition = await db.cadLocation.findUniqueOrThrow({
    where: { id: chain.floor.id },
    include: { versions: true },
  });
  expect(
    competing.some(
      (version) => version.id === afterCompetition.currentVersionId,
    ),
  ).toBe(true);
  expect(
    afterCompetition.versions.filter(
      (version) => version.id === afterCompetition.currentVersionId,
    ),
  ).toHaveLength(1);

  const currentBeforeRollback = afterCompetition.currentVersionId;
  await expect(
    db.$transaction(async (tx) => {
      await tx.cadLocation.update({
        where: { id: chain.floor.id },
        data: { currentVersionId: null },
      });
      throw new Error("fault");
    }),
  ).rejects.toThrow("fault");
  expect(
    (await db.cadLocation.findUniqueOrThrow({ where: { id: chain.floor.id } }))
      .currentVersionId,
  ).toBe(currentBeforeRollback);
});
test("TC-MASTER-003: API and SQL reject another floor/product current", async () => {
  const a = await repo.register(chain.input, file(1)),
    other = await seedChain(db, {
      businessUnit: "설비",
      product: "제품 B",
      site: "서울",
      building: "B동",
      floor: "1층",
    }),
    b = await repo.register(other.input, file(2));
  await expect(repo.setCurrent(a.locationId, b.id)).rejects.toMatchObject({
    code: "LOCATION_MISMATCH",
  });
  await expect(
    db.$executeRaw`UPDATE CadLocation SET current_version_id=${b.id} WHERE id=${a.locationId}`,
  ).rejects.toThrow();
  expect(await db.$queryRaw`PRAGMA foreign_key_check`).toEqual([]);
});
