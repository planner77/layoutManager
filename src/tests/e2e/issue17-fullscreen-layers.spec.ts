import { test, expect } from '@playwright/test';

const multiLayerDrawing = [
  '0', 'SECTION', '2', 'ENTITIES',
  '0', 'LINE', '8', '배관 A', '10', '0', '20', '0', '11', '100', '21', '100',
  '0', 'LINE', '8', 'EQUIP 01', '10', '0', '20', '100', '11', '100', '21', '0',
  '0', 'ENDSEC', '0', 'EOF', '',
].join('\n');

test('TC-ISSUE17-001: fullscreen layer panel controls three-dxf-viewer without recreating view state', async ({ page, request }) => {
  const response = await request.post('/api/cad-files', {
    multipart: {
      file: { name: 'issue17-fullscreen-layers.dxf', mimeType: 'application/octet-stream', buffer: Buffer.from(multiLayerDrawing) },
      businessUnit: 'Viewer', site: 'issue17', building: 'A', floor: '1', registeredAt: '2026-09-18', makeCurrent: 'true', deletePassword: '1234',
    },
  });
  expect(response.status()).toBe(201);
  const file = await response.json();

  let contentRequests = 0;
  page.on('request', requestEvent => {
    if (requestEvent.url().includes(`/api/cad-files/${file.id}/content`)) contentRequests += 1;
  });

  await page.goto(`/cad/versions/${file.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  expect(contentRequests).toBe(1);

  const canvas = page.locator('canvas');
  await canvas.evaluate(element => element.setAttribute('data-issue17-canvas', 'stable'));
  await page.getByRole('button', { name: '확대', exact: true }).click();
  const zoomed = await canvas.screenshot();

  await page.getByRole('button', { name: '전체 화면', exact: true }).click();
  const panel = page.getByRole('complementary', { name: '전체 화면 레이어' });
  await expect(panel).toBeVisible();
  const pipeLayer = panel.getByRole('checkbox', { name: '배관 A', exact: true });
  const equipLayer = panel.getByRole('checkbox', { name: 'EQUIP 01', exact: true });
  await expect(pipeLayer).toBeChecked();
  await expect(equipLayer).toBeChecked();
  await expect.poll(async () => canvas.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const canvasElement = element as HTMLCanvasElement;
    return Math.abs(canvasElement.width - rect.width * devicePixelRatio) < 2 && Math.abs(canvasElement.height - rect.height * devicePixelRatio) < 2;
  })).toBe(true);

  const allVisible = await canvas.screenshot();
  await pipeLayer.uncheck();
  await expect(pipeLayer).not.toBeChecked();
  const pipeHidden = await canvas.screenshot();
  expect(pipeHidden.equals(allVisible)).toBe(false);

  await pipeLayer.check();
  await expect(pipeLayer).toBeChecked();
  await expect.poll(async () => !(await canvas.screenshot()).equals(pipeHidden)).toBe(true);
  expect(contentRequests).toBe(1);
  await expect(page.locator('canvas[data-issue17-canvas="stable"]')).toHaveCount(1);

  await panel.getByRole('button', { name: '전체 해제', exact: true }).click();
  await expect(pipeLayer).not.toBeChecked();
  await expect(equipLayer).not.toBeChecked();
  const allHidden = await canvas.screenshot();

  await panel.getByRole('button', { name: '전체 선택', exact: true }).click();
  await expect(pipeLayer).toBeChecked();
  await expect(equipLayer).toBeChecked();
  await expect.poll(async () => !(await canvas.screenshot()).equals(allHidden)).toBe(true);
  expect(contentRequests).toBe(1);
  await expect(page.locator('canvas[data-issue17-canvas="stable"]')).toHaveCount(1);

  await panel.getByRole('button', { name: '레이어 패널 접기', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await page.getByRole('button', { name: '레이어 패널 펼치기', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '전체 화면 레이어' })).toBeVisible();

  await page.getByRole('button', { name: '전체 화면 종료', exact: true }).click();
  await expect.poll(async () => (await canvas.screenshot()).equals(zoomed)).toBe(true);
  await expect(page.locator('canvas[data-issue17-canvas="stable"]')).toHaveCount(1);
  await page.getByRole('button', { name: /레이어 선택/ }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: '배관 A', exact: true })).toBeChecked();
  await expect(page.getByRole('menuitemcheckbox', { name: 'EQUIP 01', exact: true })).toBeChecked();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'dxf-viewer', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await page.getByRole('button', { name: '전체 화면', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '전체 화면 레이어' })).toHaveCount(0);
});
