import { test, expect } from '@playwright/test';

const drawing = '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n100\n0\nCIRCLE\n8\n0\n10\n50\n20\n50\n40\n25\n0\nENDSEC\n0\nEOF\n';

for (const renderer of ['dxf-viewer', 'three-dxf-viewer']) test(`TC-DXF/THREE-001: ${renderer} render, controls, resize and re-entry`, async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await request.post('/api/cad-files', {
    multipart: {
      file: { name: `viewer-lines-${renderer}.dxf`, mimeType: 'application/octet-stream', buffer: Buffer.from(drawing) },
      businessUnit: 'Viewer', site: 'render', building: 'A', floor: '1', registeredAt: '2026-09-08', makeCurrent: 'true', deletePassword: '1234',
    },
  });
  expect(response.status()).toBe(201);
  const file = await response.json();
  await page.goto(`/?filename=viewer-lines-${renderer}.dxf`);
  await page.getByRole('link', { name: '도면 보기', exact: true }).click();
  if (renderer === 'three-dxf-viewer') await page.getByRole('button', { name: 'three-dxf-viewer', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');

  const canvas = page.locator('canvas');
  await expect(canvas).toHaveCount(1);
  const initial = await canvas.screenshot();
  if (renderer === 'three-dxf-viewer') {
    await page.getByRole('button', { name: /레이어 선택/ }).click();
    const layer = page.getByRole('menuitemcheckbox', { name: '0', exact: true });
    await layer.uncheck();
    await page.keyboard.press('Escape');
    expect((await canvas.screenshot()).equals(initial)).toBe(false);
    await page.getByRole('button', { name: /레이어 선택/ }).click();
    await layer.check();
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await canvas.screenshot()).equals(initial)).toBe(true);
  }

  await page.getByRole('button', { name: '확대', exact: true }).click();
  expect((await canvas.screenshot()).equals(initial)).toBe(false);
  await page.getByRole('button', { name: '축소', exact: true }).click();
  await page.getByRole('button', { name: '화면 맞춤' }).click();
  const beforePan = await canvas.screenshot();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 30, { steps: 8 });
  await page.mouse.up();
  expect((await canvas.screenshot()).equals(beforePan)).toBe(false);

  await page.setViewportSize({ width: 1100, height: 800 });
  await expect.poll(async () => canvas.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const canvasElement = element as HTMLCanvasElement;
    return Math.abs(canvasElement.width - rect.width * devicePixelRatio) < 2 && Math.abs(canvasElement.height - rect.height * devicePixelRatio) < 2;
  })).toBe(true);

  const shell = page.getByTestId('cad-viewer-shell');
  const viewBeforeFullscreen = await canvas.screenshot();
  await page.getByRole('button', { name: '전체 화면', exact: true }).click();
  await expect(shell).toHaveAttribute('data-fullscreen', 'true');
  await expect(page.getByRole('button', { name: '전체 화면 종료', exact: true })).toBeVisible();
  await expect.poll(async () => {
    const fullscreenBox = await shell.boundingBox();
    return Boolean(fullscreenBox && Math.abs(fullscreenBox.width - 1100) <= 2 && Math.abs(fullscreenBox.height - 800) <= 2);
  }).toBe(true);
  await expect.poll(async () => canvas.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const canvasElement = element as HTMLCanvasElement;
    return Math.abs(canvasElement.width - rect.width * devicePixelRatio) < 2 && Math.abs(canvasElement.height - rect.height * devicePixelRatio) < 2;
  })).toBe(true);

  await page.getByRole('button', { name: '전체 화면 종료', exact: true }).click();
  await expect(shell).toHaveAttribute('data-fullscreen', 'false');
  await expect.poll(async () => (await canvas.screenshot()).equals(viewBeforeFullscreen)).toBe(true);

  await page.getByRole('button', { name: '전체 화면', exact: true }).click();
  await expect(shell).toHaveAttribute('data-fullscreen', 'true');
  const fullscreenBeforeZoom = await canvas.screenshot();
  await page.getByRole('button', { name: '전체 화면 확대', exact: true }).click();
  expect((await canvas.screenshot()).equals(fullscreenBeforeZoom)).toBe(false);
  await page.getByRole('button', { name: '전체 화면 축소', exact: true }).click();
  await page.getByRole('button', { name: '전체 화면 맞춤', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(shell).toHaveAttribute('data-fullscreen', 'false');

  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(canvas).toHaveCount(1);
  await page.getByRole('link', { name: '← 버전 목록' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=${renderer}`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await page.screenshot({ path: `test-results/${renderer}-render.png`, fullPage: true });
  expect(errors).toEqual([]);
});

for (const renderer of ['dxf-viewer', 'three-dxf-viewer']) test(`TC-FONT-002: ${renderer} Korean TEXT rendering`, async ({ page, request }) => {
  const bytes = '0\nSECTION\n2\nENTITIES\n0\nTEXT\n8\n0\n10\n0\n20\n0\n40\n10\n1\n한글 공장 ABC\n0\nENDSEC\n0\nEOF\n';
  const response = await request.post('/api/cad-files', {
    multipart: {
      file: { name: 'korean.dxf', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) },
      businessUnit: 'Viewer', site: 'font', building: 'A', floor: '1', registeredAt: '2026-09-08', makeCurrent: 'false', deletePassword: '1234',
    },
  });
  expect(response.status()).toBe(201);
  const file = await response.json();
  const font = page.waitForResponse(result => result.url().includes('/fonts/') && result.status() === 200);
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=${renderer}`);
  await font;
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  const before = await page.locator('canvas').screenshot();
  await page.getByRole('button', { name: '확대', exact: true }).click();
  expect((await page.locator('canvas').screenshot()).equals(before)).toBe(false);
  await page.getByRole('button', { name: '화면 맞춤' }).click();
  await page.screenshot({ path: `test-results/${renderer}-korean.png`, fullPage: true });
});

for (const renderer of ['dxf-viewer', 'three-dxf-viewer']) test(`TC-DXF/THREE-002: ${renderer} corrupted, empty and DWG states`, async ({ page, request }) => {
  for (const [name, bytes, expected] of [
    ['broken.dxf', 'invalid DXF', '表示失敗'],
    ['empty.dxf', '0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n', 'empty'],
    ['deferred.dwg', 'AC1032', 'DWG'],
  ]) {
    const response = await request.post('/api/cad-files', {
      multipart: {
        file: { name, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) },
        businessUnit: 'Viewer', site: 'errors', building: 'A', floor: '1', registeredAt: '2026-09-08', makeCurrent: 'false', deletePassword: '1234',
      },
    });
    const file = await response.json();
    await page.goto(`/cad/versions/${file.id}/viewer?renderer=${renderer}`);
    if (expected === 'DWG') {
      await expect(page.getByRole('main').getByRole('alert')).toContainText('실패');
      await expect(page.getByRole('button', { name: 'dxf-viewer', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'three-dxf-viewer', exact: true })).toHaveCount(0);
      await expect(page.locator('canvas')).toHaveCount(0);
    } else if (expected === 'empty') {
      await expect(page.getByRole('status')).toContainText('표시할 도형이 없습니다');
    } else {
      await expect(page.getByRole('main').getByRole('alert')).toContainText('DXF 처리에 실패');
      await page.getByRole('button', { name: '다시 불러오기' }).click();
      await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
    }
  }
});
