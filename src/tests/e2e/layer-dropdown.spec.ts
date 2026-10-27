import { clickViewerCommand } from './viewer-menu-helper';
import { expect, test, type APIRequestContext } from "@playwright/test";
import { masterFields } from "./master-helper";

const dxf = (names: string[]) =>
  `0\nSECTION\n2\nENTITIES\n${names.map((name, index) => `0\nLINE\n8\n${name}\n10\n${index * 20}\n20\n${index * 15}\n11\n${index * 20 + 30}\n21\n${index * 15 + 25}\n`).join("")}0\nENDSEC\n0\nEOF\n`;
async function upload(
  request: APIRequestContext,
  name: string,
  layers: string[],
) {
  const response = await request.post("/api/cad-files", {
    multipart: {
      file: {
        name,
        mimeType: "application/octet-stream",
        buffer: Buffer.from(dxf(layers)),
      },
      ...(await masterFields(request, {
        businessUnit: "Viewer-layers",
        site: "layers",
        building: "A",
        floor: "1",
      })),
      registeredAt: "2026-09-11",
      makeCurrent: "false",
      deletePassword: "1234",
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

test("TC-LAYER001: individual multi-select and all controls alter the existing canvas without another download", async ({
  page,
  request,
}, testInfo) => {
  const layers = ["0", "전기", "배관"];
  const file = await upload(request, "three-layers.dxf", layers);
  let downloads = 0;
  await page.route("**/api/cad-files/*/content", async (route) => {
    downloads++;
    await route.continue();
  });
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole("status")).toHaveText("도면 표시 완료");
  await clickViewerCommand(page, 'view', '전체 화면 종료');
  const panel = page.getByTestId('fullscreen-layer-panel');
  const canvas = page.locator("canvas");
  await canvas.evaluate((node) => {
    node.dataset.layerTestCanvas = "same";
  });
  const initial = await canvas.screenshot();
  await expect(panel).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("layer-menu-normal.png") });
  await panel.getByRole('checkbox', { name: '전기' }).uncheck();
  await expect(panel).toBeVisible();
  const oneHidden = await canvas.screenshot();
  expect(oneHidden.equals(initial)).toBe(false);
  await panel.getByRole('checkbox', { name: '배관' }).uncheck();
  const twoHidden = await canvas.screenshot();
  expect(twoHidden.equals(oneHidden)).toBe(false);
  await panel.getByRole('button', { name: '전체 해제' }).click();
  await expect(panel).toContainText("레이어 0/3");
  const none = await canvas.screenshot();
  expect(none.equals(initial)).toBe(false);
  expect(none.equals(twoHidden)).toBe(false);
  await panel.getByRole('button', { name: '전체 선택' }).click();
  await expect
    .poll(async () => (await canvas.screenshot()).equals(initial))
    .toBe(true);
  await expect(canvas).toHaveAttribute("data-layer-test-canvas", "same");
  expect(downloads).toBe(1);
});

test("TC-LAYER002: selection resets across reload, renderer switch, and version navigation", async ({
  page,
  request,
}) => {
  const first = await upload(request, "lifecycle-a.dxf", ["A-one", "A-two"]);
  const second = await upload(request, "lifecycle-b.dxf", ["B-only"]);
  let downloads = 0;
  await page.route("**/api/cad-files/*/content", async (route) => {
    downloads++;
    await route.continue();
  });
  await page.goto(`/cad/versions/${first.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole("status")).toHaveText("도면 표시 완료");
  await clickViewerCommand(page, 'view', '전체 화면 종료');
  const panel = page.getByTestId('fullscreen-layer-panel');
  await panel.getByRole('checkbox', { name: 'A-one' }).uncheck();
  await expect(panel).toContainText("레이어 1/2");
  await clickViewerCommand(page, 'drawing', '다시 불러오기');
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("도면 표시 완료");
  await expect(panel).toContainText("레이어 2/2");
  await clickViewerCommand(page, 'view', 'dxf-viewer');
  await expect(page.getByRole("status")).toHaveText("도면 표시 완료");
  await expect(panel).toHaveCount(0);
  await clickViewerCommand(page, 'view', 'three-dxf-viewer');
  await expect(page.getByRole("status")).toHaveText("도면 표시 완료");
  await expect(panel).toContainText("레이어 2/2");
  expect(downloads).toBe(2);
  await page.goto(
    `/cad/versions/${second.id}/viewer?renderer=three-dxf-viewer`,
  );
  await expect(page.getByRole("status")).toHaveText("도면 표시 완료");
  await clickViewerCommand(page, 'view', '전체 화면 종료');
  await expect(panel).toContainText("레이어 1/1");
  await expect(
    panel.getByRole('checkbox', { name: 'B-only' }),
  ).toBeChecked();
  await expect(
    panel.getByRole('checkbox', { name: 'A-one' }),
  ).toHaveCount(0);
});

test("TC-LAYER003: many long layers fit a narrow Drawer and support keyboard actions", async ({
  page,
  request,
}, testInfo) => {
  const layers = [
    "0",
    "긴 레이어 이름 ".repeat(15),
    ...Array.from(
      { length: 32 },
      (_, index) => `Layer-${String(index).padStart(2, "0")}`,
    ),
  ];
  const file = await upload(request, "many-long-layers.dxf", layers);
  await page.setViewportSize({ width: 360, height: 480 });
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole("status")).toHaveText("도면 표시 완료");
  const menu = page.getByRole('dialog', { name: '레이어' });
  await expect(menu).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("layer-menu-narrow.png") });
  const box = await menu.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(361);
  expect(box!.y + box!.height).toBeLessThanOrEqual(481);
  expect(
    await menu.locator('aside > div').last().evaluate((node) => node.scrollHeight > node.clientHeight),
  ).toBe(true);
  expect(
    await menu.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  const clearAll = menu.getByRole('button', { name: '전체 해제' });
  await clearAll.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toContainText(`레이어 0/${layers.length}`);
  await expect(menu).toBeVisible();
  const longLayer = menu.getByRole('checkbox', { name: layers[1] });
  expect(
    await longLayer.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await longLayer.focus();
  await page.keyboard.press("Space");
  await expect(longLayer).toBeChecked();
  await expect(menu).toContainText(`레이어 1/${layers.length}`);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.locator('[data-viewer-group="work"]')).toBeFocused();
});
