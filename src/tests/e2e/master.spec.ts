import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";
import { masterFields } from "./master-helper";
import { clickViewerCommand } from "./viewer-menu-helper";

const BetterSqlite = createRequire(import.meta.url)("better-sqlite3") as new (
  filename: string,
) => {
  close(): void;
  prepare(sql: string): { run(...values: unknown[]): unknown };
};

test("TC-191-E2E-01/02/04/05/06: tree CRUD, search, keyboard, inactive and history", async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const bu = "UI 사업부 " + suffix;
  const product = "UI 제품 " + suffix;
  const site = "UI 법인 " + suffix;
  const building = "UI 동 " + suffix;
  const floor = "UI 층 " + suffix;
  const renamed = "UI 층 변경 " + suffix;

  await page.goto("/masters");
  await page.getByRole("button", { name: "+ 사업부 추가" }).click();
  await page.getByLabel("새 사업부 이름").fill(bu);
  await page.getByRole("button", { name: "등록 저장" }).click();
  await expect(page.getByTestId("master-selected-path")).toHaveText(bu);

  await page.getByRole("button", { name: "+ 하위 제품 추가" }).click();
  await page.getByLabel("새 제품 이름").fill(product);
  await page.getByRole("button", { name: "등록 저장" }).click();
  await expect(page.getByTestId("master-selected-path")).toHaveText(bu + " > " + product);

  await page.getByRole("button", { name: "+ 하위 사업장 / 법인 추가" }).click();
  await page.getByLabel("새 사업장 / 법인 이름").fill(site);
  await page.getByRole("combobox", { name: "종류" }).selectOption("LEGAL_ENTITY");
  await page.getByRole("button", { name: "등록 저장" }).click();
  await expect(page.getByRole("treeitem", { name: "사업장 / 법인: [법인] " + site })).toBeVisible();

  await page.getByRole("button", { name: "+ 하위 동 추가" }).click();
  await page.getByLabel("새 동 이름").fill(building);
  await page.getByRole("button", { name: "등록 저장" }).click();
  await page.getByRole("button", { name: "+ 하위 층 추가" }).click();
  await page.getByLabel("새 층 이름").fill(floor);
  await page.getByRole("button", { name: "등록 저장" }).click();
  await expect(page.getByTestId("master-selected-path"))
    .toContainText(bu + " > " + product + " > [법인] " + site + " > " + building + " > " + floor);

  const floorId = (await (await request.get("/api/masters")).json()).items
    .find((item: { name: string }) => item.name === bu).products
    .find((item: { name: string }) => item.name === product).sites
    .find((item: { name: string }) => item.name === site).buildings
    .find((item: { name: string }) => item.name === building).floors
    .find((item: { name: string }) => item.name === floor).id as string;
  await expect(page.getByRole("link", { name: "버전 이력" }))
    .toHaveAttribute("href", "/cad/locations/" + floorId);
  expect((await request.get("/cad/locations/" + floorId)).status()).toBe(200);

  await page.getByRole("button", { name: "편집 / 상태 변경" }).click();
  await page.getByLabel("기준정보 이름").fill(renamed);
  await page.getByRole("button", { name: "변경 저장" }).click();
  await expect(page.getByRole("treeitem", { name: "층: " + renamed })).toBeVisible();

  await page.getByRole("button", { name: "편집 / 상태 변경" }).click();
  await page.getByRole("checkbox", { name: "활성 상태로 사용" }).uncheck();
  await page.getByRole("button", { name: "변경 저장" }).click();
  await expect(page.getByRole("treeitem", { name: "층: " + renamed })).toContainText("비활성");
  await page.getByRole("checkbox", { name: "비활성 항목 표시" }).uncheck();
  await expect(page.getByRole("treeitem", { name: "층: " + renamed })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "비활성 항목 표시" }).check();

  await page.getByRole("textbox", { name: "항목 검색" }).fill(renamed);
  const tree = page.getByRole("tree", { name: "위치 기준정보 계층" });
  for (const node of [
    "사업부: " + bu, "제품: " + product, "사업장 / 법인: [법인] " + site,
    "동: " + building, "층: " + renamed,
  ]) await expect(tree.getByRole("treeitem", { name: node })).toBeVisible();
  await expect(tree.getByRole("treeitem", { name: "사업부: " + bu }))
    .toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "검색 초기화" }).click();

  const floorTreeItem = tree.getByRole("treeitem", { name: "층: " + renamed });
  await floorTreeItem.focus();
  await floorTreeItem.press("ArrowLeft");
  const buildingItem = tree.getByRole("treeitem", { name: "동: " + building });
  await expect(buildingItem).toBeFocused();
  await buildingItem.press("Enter");
  await expect(buildingItem).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText(bu + " > " + product);
  await page.getByRole("button", { name: "삭제 확인" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("하위 항목이나 도면 이력");
  await page.getByRole("button", { name: "비활성화 대안" }).click();
  await expect(page.getByRole("checkbox", { name: "활성 상태로 사용" })).toBeChecked();
  await page.getByRole("button", { name: "취소", exact: true }).click();

  await page.getByRole("button", { name: "+ 사업부 추가" }).click();
  await page.getByLabel("새 사업부 이름").fill(bu);
  await page.getByRole("button", { name: "등록 저장" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("동일한 이름");
  await expect(page.getByLabel("새 사업부 이름")).toHaveValue(bu);
  await page.getByRole("button", { name: "취소", exact: true }).click();

  await page.setViewportSize({ width: 390, height: 820 });
  const nav = await page.locator("section[aria-labelledby='master-tree-heading']").boundingBox();
  const details = await page.locator("section[aria-labelledby='master-details-heading']").boundingBox();
  expect(nav).not.toBeNull();
  expect(details).not.toBeNull();
  expect(details!.y).toBeGreaterThan(nav!.y);
  await expect(page.getByRole("button", { name: "+ 사업부 추가" })).toBeVisible();
});

test("TC-191-E2E-03: empty, query miss and GET error are distinct and recoverable", async ({ page }) => {
  await page.route("**/api/masters?active=false", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"items":[]}' });
  });
  await page.goto("/masters");
  await expect(page.getByText("등록된 사업부가 없습니다. 첫 사업부부터 추가하세요.")).toBeVisible();
  await page.unroute("**/api/masters?active=false");
  await page.getByRole("button", { name: "새로고침" }).click();
  await page.getByRole("textbox", { name: "항목 검색" }).fill("no-master-can-match-191");
  await expect(page.getByText("검색 결과가 없습니다. 검색어를 변경하거나 초기화하세요.")).toBeVisible();
  await page.getByRole("button", { name: "검색 초기화" }).click();
  await page.route("**/api/masters?active=false", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json",
      body: '{"error":{"code":"SERVICE_UNAVAILABLE","message":"기준정보 DB 점검 중"}}' });
  });
  await page.getByRole("button", { name: "새로고침" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("기준정보 DB 점검 중");
  await expect(page.getByRole("tree")).toHaveCount(0);
  await page.unroute("**/api/masters?active=false");
  await page.getByRole("button", { name: "새로고침" }).click();
  await expect(page.getByText("기준정보 DB 점검 중")).toHaveCount(0);
});

test("TC-204-01/04: name-only edit preserves another session's status and kind", async ({ page, request }) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const names = await masterFields(request, {
    businessUnit: "M204 BU " + suffix, product: "M204 Product " + suffix,
    site: "M204 Site " + suffix, siteKind: "LEGAL_ENTITY",
    building: "M204 Building " + suffix, floor: "M204 Floor " + suffix,
  });
  await page.goto("/masters");
  await page.getByRole("textbox", { name: "항목 검색" }).fill("M204 Site " + suffix);
  const site = page.getByRole("treeitem", { name: "사업장 / 법인: [법인] M204 Site " + suffix });
  await site.getByRole("button", { name: "[법인] M204 Site " + suffix, exact: true }).click();
  await page.getByRole("button", { name: "편집 / 상태 변경" }).click();
  await expect(page.getByLabel("기준정보 이름")).toHaveValue("M204 Site " + suffix);
  const otherSession = await request.patch(`/api/masters/sites/${names.siteId}`, {
    data: { kind: "SITE", active: false },
  });
  expect(otherSession.status()).toBe(200);
  let sent: Record<string, unknown> | undefined;
  await page.route(`**/api/masters/sites/${names.siteId}`, async (route) => {
    if (route.request().method() === "PATCH") sent = route.request().postDataJSON() as Record<string, unknown>;
    await route.continue();
  });
  await page.getByLabel("기준정보 이름").fill("M204 Site Latest " + suffix);
  await page.getByRole("button", { name: "변경 저장" }).click();
  await expect(page.getByTestId("master-selected-path")).toContainText("M204 Site Latest " + suffix);
  expect(sent).toEqual({ name: "M204 Site Latest " + suffix });
  await page.getByRole("textbox", { name: "항목 검색" }).fill("");
  await expect(page.getByRole("treeitem", { name: "사업장 / 법인: [사업장] M204 Site Latest " + suffix }))
    .toContainText("비활성");
  await page.reload();
  const refreshed = await request.get("/api/masters?active=false");
  const item = (await refreshed.json()).items
    .find((value: { id: string }) => value.id === names.businessUnitId).products
    .find((value: { id: string }) => value.id === names.productId).sites
    .find((value: { id: string }) => value.id === names.siteId);
  expect(item).toMatchObject({ id: names.siteId, name: "M204 Site Latest " + suffix, active: false, kind: "SITE" });
});

test("TC-204-01/03/06: five repeated renames appear in a fresh browser and linked CAD views", async ({ request, browser, baseURL }) => {
  test.setTimeout(90_000);
  const suffix = crypto.randomUUID().slice(0, 8);
  const names = {
    businessUnit: "M204 Business " + suffix, product: "M204 Product " + suffix,
    site: "M204 Site " + suffix, siteKind: "LEGAL_ENTITY" as const,
    building: "M204 Building " + suffix, floor: "M204 Floor " + suffix,
  };
  const ids = await masterFields(request, names);
  const filename = `m204-${suffix}.dxf`, drawingName = `사용자 도면 ${suffix}`;
  const upload = await request.post("/api/cad-files", { multipart: {
    file: { name: filename, mimeType: "application/octet-stream", buffer: Buffer.from("0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n") },
    ...ids, registeredAt: "2026-11-02", makeCurrent: "true", deletePassword: "1234", drawingName,
  } });
  expect(upload.status()).toBe(201);
  const version = await upload.json() as { id: string; locationId: string };
  expect(version.locationId).toBe(ids.floorId);
  const levels = [
    ["business-units", ids.businessUnitId, "Business"], ["products", ids.productId, "Product"],
    ["sites", ids.siteId, "Site"], ["buildings", ids.buildingId, "Building"], ["floors", ids.floorId, "Floor"],
  ] as const;
  for (const [type, id, label] of levels) for (let n = 1; n <= 2; n++) {
    const response = await request.patch(`/api/masters/${type}/${id}`, { data: { name: `M204 ${label} latest ${n} ${suffix}` } });
    expect(response.status()).toBe(200);
    expect((await response.json()).id).toBe(id);
  }
  const latest = levels.map(([, , label]) => `M204 ${label} latest 2 ${suffix}`);
  const fresh = await browser.newContext({ baseURL });
  const page = await fresh.newPage();
  try {
    await page.goto("/masters");
    await page.getByRole("textbox", { name: "항목 검색" }).fill(latest[4]);
    await expect(page.getByRole("treeitem", { name: "층: " + latest[4] })).toBeVisible();
    await expect(page.getByRole("treeitem", { name: "사업부: " + latest[0] })).toBeVisible();
    await page.getByRole("treeitem", { name: "층: " + latest[4] }).getByRole("button", { name: latest[4] }).click();
    await expect(page.getByTestId("master-selected-path")).toContainText(latest.join(" > ").replace(latest[2], "[법인] " + latest[2]));
    await expect(page.getByRole("link", { name: "버전 이력" })).toHaveAttribute("href", `/cad/locations/${ids.floorId}`);
    await page.goto("/cad/upload");
    const business = page.getByRole("combobox", { name: "사업부", exact: true });
    await expect(business.getByRole("option", { name: latest[0] })).toHaveCount(1);
    await business.selectOption({ label: latest[0] });
    await expect(page.getByRole("combobox", { name: "제품", exact: true }).getByRole("option", { name: latest[1] })).toHaveCount(1);
    await page.goto(`/?filename=${filename}`);
    const row = page.locator(`#version-${version.id}`);
    await expect(row).toContainText(drawingName);
    for (const label of latest) await expect(row).toContainText(label);
    const listBusiness = page.getByRole("combobox", { name: "사업부", exact: true });
    await expect(listBusiness).toBeVisible();
    await expect(listBusiness.getByRole("option", { name: latest[0] })).toHaveCount(1);
    await page.goto(`/cad/locations/${ids.floorId}`);
    await expect(page.getByRole("heading", { name: `${latest[3]} / ${latest[4]} · 도면 버전` })).toBeVisible();
    await expect(page.locator(`#version-${version.id}`)).toContainText(drawingName);
    await page.goto(`/cad/versions/${version.id}/viewer?renderer=three-dxf-viewer`);
    await clickViewerCommand(page, "drawing", "도면 정보");
    const info = page.getByRole("region", { name: "도면 정보" });
    for (const label of latest) await expect(info).toContainText(label);
    await expect(page).toHaveURL(new RegExp(`/cad/versions/${version.id}/viewer`));
  } finally { await fresh.close().catch(() => {}); }
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
