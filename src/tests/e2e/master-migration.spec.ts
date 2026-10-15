import { expect, test } from "@playwright/test";
import { masterFields } from "./master-helper";

test("TC-MASTER-005: actual pre-0.25 database deploy is usable in browser and reclassifies all history", async ({
  page,
  request,
}) => {
  const locationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const target = await masterFields(request, {
    businessUnit: "운영 사업부",
    product: "운영 제품",
    site: "운영 법인",
    siteKind: "LEGAL_ENTITY",
    building: "신동",
    floor: "준비층",
  });

  await page.goto(`/cad/locations/${locationId}`);
  await expect(
    page.getByText("이관 사업부 / 미분류 / [사업장] 이관 사업장"),
  ).toBeVisible();
  await expect(page.getByText("총 3개 버전")).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "migrated-v2.dxf" }),
  ).toContainText("Current");
  for (let version = 1; version <= 3; version += 1) {
    const row = page
      .getByRole("row")
      .filter({ hasText: `migrated-v${version}.dxf` });
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
    .getByRole("combobox", { name: "사업부", exact: true })
    .selectOption(target.businessUnitId);
  await page
    .getByRole("combobox", { name: "제품", exact: true })
    .selectOption(target.productId);
  await page
    .getByRole("combobox", { name: "사업장 / 법인", exact: true })
    .selectOption(target.siteId);
  await page
    .getByRole("combobox", { name: "동", exact: true })
    .selectOption(target.buildingId);
  await page.getByRole("button", { name: "전체 이력 재분류" }).click();
  await expect(
    page.getByText("운영 사업부 / 운영 제품 / [법인] 운영 법인"),
  ).toBeVisible();
  await expect(page.getByText("총 3개 버전")).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "migrated-v2.dxf" }),
  ).toContainText("Current");
});
