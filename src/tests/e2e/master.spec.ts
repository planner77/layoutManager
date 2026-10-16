import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";
import { masterFields } from "./master-helper";

const BetterSqlite = createRequire(import.meta.url)("better-sqlite3") as new (
  filename: string,
) => {
  close(): void;
  prepare(sql: string): { run(...values: unknown[]): unknown };
};

function masterSection(page: import("@playwright/test").Page, name: string) {
  return page.getByRole("region", { name });
}
test("TC-MASTER-001/002/006: management UI lifecycle and upload dropdown reset", async ({
  page,
  request,
}) => {
  await page.goto("/masters");
  await page.getByLabel("새 사업부").fill("UI 사업부");
  await page.getByRole("button", { name: "추가" }).first().click();
  await expect(page.getByText("UI 사업부", { exact: true })).toBeVisible();
  await page.getByText("UI 사업부", { exact: true }).click();
  await masterSection(page, "2. 제품").getByLabel("새 제품").fill("UI 제품");
  await masterSection(page, "2. 제품")
    .getByRole("button", { name: "추가" })
    .click();
  await masterSection(page, "2. 제품")
    .getByText("UI 제품", { exact: true })
    .click();
  await masterSection(page, "3. 사업장 / 법인")
    .getByLabel("새 사업장 / 법인")
    .fill("UI 법인");
  await masterSection(page, "3. 사업장 / 법인")
    .getByLabel("종류")
    .selectOption("LEGAL_ENTITY");
  await masterSection(page, "3. 사업장 / 법인")
    .getByRole("button", { name: "추가" })
    .click();
  await masterSection(page, "3. 사업장 / 법인")
    .getByText("[법인] UI 법인", { exact: true })
    .click();
  await masterSection(page, "4. 동").getByLabel("새 동").fill("UI 동");
  await masterSection(page, "4. 동")
    .getByRole("button", { name: "추가" })
    .click();
  await masterSection(page, "4. 동")
    .getByText("UI 동", { exact: true })
    .click();
  await masterSection(page, "5. 층").getByLabel("새 층").fill("UI 층");
  await masterSection(page, "5. 층")
    .getByRole("button", { name: "추가" })
    .click();
  const floorRow = masterSection(page, "5. 층")
    .locator("div.rounded-lg")
    .filter({ hasText: "UI 층" });
  await floorRow.getByRole("button", { name: "편집" }).click();
  await masterSection(page, "5. 층")
    .getByLabel("기준정보 이름")
    .fill("UI 층 변경");
  await masterSection(page, "5. 층")
    .getByRole("button", { name: "저장" })
    .click();
  await expect(
    masterSection(page, "5. 층").getByText("UI 층 변경", { exact: true }),
  ).toBeVisible();
  const renamedFloorRow = masterSection(page, "5. 층")
    .locator("div.rounded-lg")
    .filter({ hasText: "UI 층 변경" });
  await renamedFloorRow.getByRole("button", { name: "비활성화" }).click();
  await expect(renamedFloorRow).toContainText("비활성");
  await renamedFloorRow.getByRole("button", { name: "재활성화" }).click();
  await expect(renamedFloorRow).toContainText("활성");
  const fields = await masterFields(request, {
    businessUnit: "계층 E2E",
    product: "제품 E2E",
    site: "법인 E2E",
    siteKind: "LEGAL_ENTITY",
    building: "B동",
    floor: "3F",
  });
  void fields;
  await page.goto("/cad/upload");
  await page
    .getByRole("combobox", { name: "사업부", exact: true })
    .selectOption({ label: "계층 E2E" });
  await page
    .getByRole("combobox", { name: "제품", exact: true })
    .selectOption({ label: "제품 E2E" });
  await page
    .getByRole("combobox", { name: "사업장 / 법인", exact: true })
    .selectOption({ label: "[법인] 법인 E2E" });
  await page
    .getByRole("combobox", { name: "동", exact: true })
    .selectOption({ label: "B동" });
  await page
    .getByRole("combobox", { name: "층", exact: true })
    .selectOption({ label: "3F" });
  await page
    .getByRole("combobox", { name: "사업부", exact: true })
    .selectOption({ label: "UI 사업부" });
  await expect(
    page.getByRole("combobox", { name: "제품", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "사업장 / 법인", exact: true }),
  ).toBeDisabled();
});

test("TC-MASTER-003/005/007: three-version current history survives inactive master and browser reclassification", async ({
  page,
  request,
}) => {
  const legacy = await masterFields(request, {
    businessUnit: "이관 E2E",
    product: "미분류",
    site: "이전 사업장",
    building: "이전동",
    floor: "이전층",
  });
  await masterFields(request, {
    businessUnit: "운영 E2E",
    product: "실제품",
    site: "실사업장",
    siteKind: "LEGAL_ENTITY",
    building: "실동",
    floor: "준비층",
  });
  const databaseDirectory = process.env.CAD_E2E_DIR;
  expect(databaseDirectory).toBeTruthy();
  const sqlite = new BetterSqlite(path.join(databaseDirectory!, "db.sqlite"));
  sqlite
    .prepare("UPDATE Product SET is_unclassified=1 WHERE id=?")
    .run(legacy.productId);
  sqlite.close();

  const versionIds: string[] = [];
  for (let version = 1; version <= 3; version += 1) {
    const response = await request.post("/api/cad-files", {
      multipart: {
        file: {
          name: `legacy-v${version}.dxf`,
          mimeType: "application/octet-stream",
          buffer: Buffer.from(`0\n999\nlegacy-${version}\n0\nEOF\n`),
        },
        ...legacy,
        registeredAt: `2026-10-${10 + version}`,
        makeCurrent: version === 2 ? "true" : "false",
        deletePassword: "1234",
      },
    });
    expect(response.status()).toBe(201);
    versionIds.push((await response.json()).id);
  }

  const inactive = await request.patch(
    `/api/masters/products/${legacy.productId}`,
    {
      data: { active: false },
    },
  );
  expect(inactive.status()).toBe(200);
  await page.goto("/cad/upload");
  await page
    .getByRole("combobox", { name: "사업부", exact: true })
    .selectOption({ label: "이관 E2E" });
  await expect(
    page.getByRole("combobox", { name: "제품", exact: true }),
  ).not.toContainText("미분류");
  const rejectedUpload = await request.post("/api/cad-files", {
    multipart: {
      file: {
        name: "inactive-rejected.dxf",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("0\nEOF\n"),
      },
      ...legacy,
      registeredAt: "2026-10-15",
      makeCurrent: "true",
      deletePassword: "1234",
    },
  });
  expect(rejectedUpload.status()).toBe(409);
  expect((await rejectedUpload.json()).error.code).toBe(
    "INACTIVE_LOCATION_CHAIN",
  );

  // PR #27 review regression: non-2xx JSON must not crash the reclassification view.
  await page.route("**/api/masters?active=true", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Database unavailable" } }),
    }),
  );
  await page.goto(`/cad/locations/${legacy.floorId}`);
  // Scope to the reclassification form; Next.js also renders a route-announcer
  // with role="alert", which must not cause a strict-mode selector collision.
  const reclassifyAlert = page.locator("form").getByRole("alert");
  await expect(reclassifyAlert).toHaveText(
    "대상 기준정보를 불러오지 못했습니다.",
  );
  await expect(
    page.getByRole("heading", { name: "미분류 층 재분류" }),
  ).toBeVisible();
  await expect(page.getByText("총 3개 버전")).toBeVisible();
  await page.unroute("**/api/masters?active=true");
  await page.reload();
  await expect(reclassifyAlert).toHaveCount(0);
  await expect(page.getByText("총 3개 버전")).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "legacy-v2.dxf" }),
  ).toContainText("Current");
  for (let version = 1; version <= 3; version += 1) {
    const row = page
      .getByRole("row")
      .filter({ hasText: `legacy-v${version}.dxf` });
    const contentHref = await row
      .getByRole("link", { name: "원본" })
      .getAttribute("href");
    expect((await request.get(contentHref!)).status()).toBe(200);
    const viewerHref = await row
      .getByRole("link", { name: "도면 보기" })
      .getAttribute("href");
    expect((await request.get(viewerHref!)).status()).toBe(200);
  }
  await page
    .getByRole("row")
    .filter({ hasText: "legacy-v3.dxf" })
    .getByRole("button", { name: "Current 지정" })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: "legacy-v3.dxf" }),
  ).toContainText("Current");
  await page
    .getByRole("combobox", { name: "사업부", exact: true })
    .selectOption({ label: "운영 E2E" });
  await page
    .getByRole("combobox", { name: "제품", exact: true })
    .selectOption({ label: "실제품" });
  await page
    .getByRole("combobox", { name: "사업장 / 법인", exact: true })
    .selectOption({ label: "[법인] 실사업장" });
  await page
    .getByRole("combobox", { name: "동", exact: true })
    .selectOption({ label: "실동" });
  await page.getByRole("button", { name: "전체 이력 재분류" }).click();
  await expect(
    page.getByText("운영 E2E / 실제품 / [법인] 실사업장"),
  ).toBeVisible();
  await expect(page.getByText("총 3개 버전")).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "legacy-v3.dxf" }),
  ).toContainText("Current");

  const detail = await request.get(`/api/cad-locations/${legacy.floorId}`);
  expect(detail.status()).toBe(200);
  const body = await detail.json();
  expect(
    body.versions.map((version: { id: string }) => version.id).sort(),
  ).toEqual(versionIds.sort());
  expect(
    body.versions.filter(
      (version: { isCurrent: boolean }) => version.isCurrent,
    ),
  ).toHaveLength(1);
  expect(body.building).toBe("실동");
});
test("TC-MASTER-002/006: routes reject malformed bodies, immutable parent and mixed ID chain", async ({
  request,
}) => {
  const malformed = await request.post("/api/masters", {
    headers: { "content-type": "application/json" },
    data: "{",
  });
  expect(malformed.status()).toBe(400);
  const chain = await masterFields(request, {
      businessUnit: "변조 E2E",
      product: "제품 A",
      site: "사업장 A",
      building: "A동",
      floor: "1F",
    }),
    other = await masterFields(request, {
      businessUnit: "변조 E2E 2",
      product: "제품 B",
      site: "사업장 B",
      building: "B동",
      floor: "2F",
    });
  const immutable = await request.patch(
    `/api/masters/products/${chain.productId}`,
    { data: { parentId: other.businessUnitId } },
  );
  expect(immutable.status()).toBe(409);
  const upload = await request.post("/api/cad-files", {
    multipart: {
      file: {
        name: "tampered.dxf",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("0\nEOF\n"),
      },
      ...chain,
      productId: other.productId,
      registeredAt: "2026-10-15",
      makeCurrent: "true",
      deletePassword: "1234",
    },
  });
  expect(upload.status()).toBe(409);
  expect((await upload.json()).error.code).toBe("INVALID_LOCATION_CHAIN");
});
