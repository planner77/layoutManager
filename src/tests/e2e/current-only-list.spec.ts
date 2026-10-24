import { expect, test, type APIRequestContext } from "@playwright/test";
import { masterFields } from "./master-helper";

const drawing = Buffer.from("0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n");
type MasterIds = Awaited<ReturnType<typeof masterFields>>;

async function upload(
  request: APIRequestContext,
  ids: MasterIds,
  filename: string,
  makeCurrent: boolean,
) {
  const response = await request.post("/api/cad-files", {
    multipart: {
      file: { name: filename, mimeType: "application/octet-stream", buffer: drawing },
      ...ids,
      registeredAt: "2026-10-25",
      makeCurrent: String(makeCurrent),
      deletePassword: "1234",
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; locationId: string };
}

test("TC-LIST-045-003: Current-only library and Location history with legacy URL, reassignment and deletion", async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const businessUnit = `ISSUE45-${suffix}`;
  const site = `CURRENT-${suffix}`;
  const prefix = `issue45-${suffix}`;
  const main = await masterFields(request, { businessUnit, site, building: "A동", floor: "2층" });
  const none = await masterFields(request, { businessUnit, site, building: "A동", floor: "3층" });
  const old = await upload(request, main, `${prefix}-v1.dxf`, false);
  const onlyOld = await upload(request, none, `${prefix}-unassigned.dxf`, false);

  await page.goto(`/?filename=${prefix}`);
  await expect(page.locator('table[aria-label="등록된 도면"] tbody tr')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "현재 버전만 표시" })).toHaveCount(0);
  await expect(page.getByText("등록일 최신순 · 현재 버전 도면")).toBeVisible();

  const current = await upload(request, main, `${prefix}-v2.dxf`, true);
  const newer = await upload(request, main, `${prefix}-v3.dxf`, false);
  await page.goto(`/?filename=${prefix}&current=false`);
  await expect(page.locator('table[aria-label="등록된 도면"] tbody tr')).toHaveCount(1);
  await expect(page.locator(`#version-${current.id}`)).toContainText("Current");
  await expect(page.locator(`#version-${old.id}`)).toHaveCount(0);
  await expect(page.locator(`#version-${newer.id}`)).toHaveCount(0);
  await expect(page.locator(`#version-${onlyOld.id}`)).toHaveCount(0);
  const history = await request.get(`/api/cad-files?filename=${prefix}&current=false`);
  expect(history.status()).toBe(200);
  expect((await history.json()).total).toBe(3);

  // A Location with no Current stays reachable via the master hierarchy.
  await page.getByRole("link", { name: "위치별 버전 관리" }).click();
  await page.getByRole("region", { name: "1. 사업부" })
    .getByText(businessUnit, { exact: true }).click();
  await page.getByRole("region", { name: "2. 제품" })
    .getByText("제품", { exact: true }).click();
  await page.getByRole("region", { name: "3. 사업장 / 법인" })
    .getByText(`[사업장] ${site}`, { exact: true }).click();
  await page.getByRole("region", { name: "4. 동" })
    .getByText("A동", { exact: true }).click();
  const unassigned = page.getByRole("region", { name: "5. 층" })
    .locator("div.rounded-lg").filter({ hasText: "3층" });
  await unassigned.getByRole("link", { name: "버전 이력" }).click();
  await expect(page.locator(`#version-${onlyOld.id}`)).toContainText("이전 버전");
  await page.locator(`#version-${onlyOld.id}`)
    .getByRole("button", { name: "Current 지정" }).click();
  await expect(page.locator(`#version-${onlyOld.id}`)).toContainText("Current");

  await page.goto(`/?filename=${prefix}&current=false`);
  await expect(page.locator('table[aria-label="등록된 도면"] tbody tr')).toHaveCount(2);
  await expect(page.locator(`#version-${onlyOld.id}`)).toContainText("Current");
  await expect(page.locator(`#version-${current.id}`)).toContainText("Current");

  // Highest version is NOT Current until the user explicitly assigns it.
  await page.goto(`/cad/locations/${old.locationId}`);
  await expect(page.locator(`#version-${old.id}`)).toContainText("이전 버전");
  await expect(page.locator(`#version-${newer.id}`)).toContainText("이전 버전");
  await page.locator(`#version-${newer.id}`)
    .getByRole("button", { name: "Current 지정" }).click();
  await expect(page.locator(`#version-${newer.id}`)).toContainText("Current");
  await page.goto(`/?filename=${prefix}`);
  await expect(page.locator(`#version-${current.id}`)).toHaveCount(0);
  await expect(page.locator(`#version-${newer.id}`)).toContainText("Current");

  // Deleting that Current does not auto-promote older Versions.
  await page.goto(`/cad/locations/${old.locationId}`);
  await page.locator(`#version-${newer.id}`)
    .getByRole("button", { name: "삭제", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("삭제 비밀번호", { exact: true }).fill("1234");
  await dialog.getByRole("button", { name: "삭제 확인", exact: true }).click();
  await expect(page.locator(`#version-${newer.id}`)).toHaveCount(0);
  await page.goto(`/?filename=${prefix}`);
  await expect(page.locator('table[aria-label="등록된 도면"] tbody tr')).toHaveCount(1);
  await expect(page.locator(`#version-${onlyOld.id}`)).toContainText("Current");
  await expect(page.locator(`#version-${current.id}`)).toHaveCount(0);
});
