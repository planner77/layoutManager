import { clickViewerCommand, clickViewerTestCommand, openViewerMenu } from './viewer-menu-helper';
import { expect, test } from '@playwright/test';
import { masterFields } from './master-helper';

const multiLayer = Buffer.from(
  '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nEQUIP\n10\n0\n20\n0\n11\n100\n21\n100\n0\nLINE\n8\nUTILITY\n10\n0\n20\n100\n11\n100\n21\n0\n0\nENDSEC\n0\nEOF\n',
);
const emptyDrawing = Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n');

test('TC-U2-E2E-001: menu and panel collapse share one state, layer visibility and canvas survive', async ({ page, request }) => {
  const response = await request.post('/api/cad-files', {
    multipart: {
      file: { name: 'issue39-layer-menu.dxf', mimeType: 'application/octet-stream', buffer: multiLayer },
      ...(await masterFields(request, { businessUnit: 'Issue39-menu', site: 'panel', building: 'A', floor: '1' })),
      registeredAt: '2026-10-25', makeCurrent: 'true', deletePassword: '1234',
    },
  });
  expect(response.status()).toBe(201);
  const file = await response.json();
  let contentRequests = 0;
  page.on('request', event => {
    if (new URL(event.url()).pathname === `/api/cad-files/${file.id}/content`) contentRequests++;
  });

  await page.goto(`/cad/versions/${file.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  const menu = page.getByTestId('viewer-menu-layers');
  const panel = page.getByRole('complementary', { name: '전체 화면 레이어' });
  const dock = page.getByTestId('viewer-layer-dock');
  const canvas = page.getByTestId('cad-canvas').locator('canvas');
  await openViewerMenu(page, 'work');
  await expect(menu).toBeEnabled();
  await expect(menu).toHaveAttribute('aria-checked', 'true');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(menu).toHaveAttribute('aria-controls', 'viewer-layer-dock');
  await expect(panel).toBeVisible();
  await expect(dock).toBeVisible();

  await clickViewerCommand(page, 'view', '확대');
  const allVisible = await canvas.screenshot();
  const equip = panel.getByRole('checkbox', { name: 'EQUIP' });
  const utility = panel.getByRole('checkbox', { name: 'UTILITY' });
  await equip.uncheck();
  await expect(equip).not.toBeChecked();
  await expect(utility).toBeChecked();
  await expect.poll(async () => (await canvas.screenshot()).equals(allVisible)).toBe(false);
  await canvas.evaluate(element => element.setAttribute('data-u2-canvas', 'stable'));
  expect(contentRequests).toBe(1);

  await clickViewerTestCommand(page, 'viewer-menu-layers');
  await openViewerMenu(page, 'work');
  await expect(menu).toHaveAttribute('aria-checked', 'false');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).not.toHaveAttribute('aria-controls', /viewer-layer-dock/);
  await expect(dock).toHaveCount(0);
  await expect(panel).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-u2-canvas', 'stable');
  await clickViewerTestCommand(page, 'viewer-menu-layers');
  await expect(panel).toBeVisible();
  await expect(equip).not.toBeChecked();
  await expect(utility).toBeChecked();
  await expect(canvas).toHaveAttribute('data-u2-canvas', 'stable');

  await panel.getByRole('button', { name: '레이어 패널 접기' }).focus();
  await page.keyboard.press('Enter');
  await expect(panel).toHaveCount(0);
  await expect(page.locator('[data-viewer-group="work"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu).toHaveAttribute('aria-checked', 'false');
  await menu.focus();
  await page.keyboard.press('Space');
  await expect(panel).toBeVisible();
  await openViewerMenu(page, 'work');
  await expect(menu).toHaveAttribute('aria-checked', 'true');
  await expect(menu).toHaveAttribute('aria-controls', 'viewer-layer-dock');
  await expect(equip).not.toBeChecked();

  await page.setViewportSize({ width: 320, height: 640 });
  await expect.poll(() => canvas.evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.width > 100 && box.height > 60 && box.left >= -1 && box.right <= 321;
  })).toBe(true);
  await panel.getByRole('button', { name: '레이어 패널 접기' }).click();
  await expect(dock).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-u2-canvas', 'stable');
  await clickViewerTestCommand(page, 'viewer-menu-layers');
  await expect(panel).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 800 });
  await clickViewerCommand(page, 'view', '전체 화면 종료');
  await expect(dock).toBeVisible();
  await expect(panel.getByRole('checkbox', { name: 'EQUIP' })).not.toBeChecked();
  await expect(panel.getByRole('checkbox', { name: 'UTILITY' })).toBeChecked();
  await clickViewerCommand(page, 'view', '전체 화면');
  await expect(panel).toBeVisible();
  await expect(equip).not.toBeChecked();
  await expect(canvas).toHaveAttribute('data-u2-canvas', 'stable');
  expect(contentRequests).toBe(1);
});

test('TC-U2-E2E-002: simulated native fullscreen, reload and renderer switch honor panel availability', async ({ page, request }) => {
  const response = await request.post('/api/cad-files', {
    multipart: {
      file: { name: 'issue39-lifecycle.dxf', mimeType: 'application/octet-stream', buffer: multiLayer },
      ...(await masterFields(request, { businessUnit: 'Issue39-lifecycle', site: 'panel', building: 'B', floor: '1' })),
      registeredAt: '2026-10-25', makeCurrent: 'true', deletePassword: '1234',
    },
  });
  expect(response.status()).toBe(201);
  const file = await response.json();
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  const menu = page.getByTestId('viewer-menu-layers');
  const panel = page.getByRole('complementary', { name: '전체 화면 레이어' });
  const shell = page.getByTestId('cad-viewer-shell');
  await panel.getByRole('checkbox', { name: 'EQUIP' }).uncheck();

  // Simulate the fullscreenchange notification; the real browser permission path remains #25.
  await shell.evaluate(element => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: element });
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  await expect(shell).toHaveAttribute('data-native-fullscreen', 'true');
  await clickViewerTestCommand(page, 'viewer-menu-layers');
  await expect(panel).toHaveCount(0);
  await clickViewerTestCommand(page, 'viewer-menu-layers');
  await expect(panel.getByRole('checkbox', { name: 'EQUIP' })).not.toBeChecked();
  await shell.evaluate(() => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  await expect(shell).toHaveAttribute('data-native-fullscreen', 'false');

  await clickViewerCommand(page, 'drawing', '다시 불러오기');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await openViewerMenu(page, 'work');
  await expect(menu).toHaveAttribute('aria-checked', 'true');
  await expect(panel.getByRole('checkbox', { name: 'EQUIP' })).toBeChecked();

  await clickViewerCommand(page, 'view', 'dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await openViewerMenu(page, 'work');
  await expect(menu).toBeDisabled();
  await expect(menu).not.toHaveAttribute('aria-controls', /viewer-layer-dock/);
  await expect(panel).toHaveCount(0);
  await clickViewerCommand(page, 'view', 'three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await openViewerMenu(page, 'work');
  await expect(menu).toHaveAttribute('aria-checked', 'true');
  await expect(panel.getByRole('checkbox', { name: 'EQUIP' })).toBeChecked();
});

test('TC-U2-E2E-003: no drawable layers do not enable the panel command', async ({ page, request }) => {
  const response = await request.post('/api/cad-files', {
    multipart: {
      file: { name: 'issue39-empty.dxf', mimeType: 'application/octet-stream', buffer: emptyDrawing },
      ...(await masterFields(request, { businessUnit: 'Issue39-empty', site: 'panel', building: 'C', floor: '1' })),
      registeredAt: '2026-10-25', makeCurrent: 'true', deletePassword: '1234',
    },
  });
  expect(response.status()).toBe(201);
  const file = await response.json();
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status')).not.toHaveText('도면 로딩 중…');
  await openViewerMenu(page, 'work');
  await expect(page.getByTestId('viewer-menu-layers')).toBeDisabled();
  await expect(page.getByTestId('viewer-layer-dock')).toHaveCount(0);
});
