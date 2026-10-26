import { clickViewerCommand, openViewerMenu } from './viewer-menu-helper';
import { expect, test } from '@playwright/test';
import { masterFields } from './master-helper';

const drawing = Buffer.from(
  '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n100\n0\nLINE\n8\nEQUIP\n10\n0\n20\n100\n11\n100\n21\n0\n0\nENDSEC\n0\nEOF\n',
);

for (const renderer of ['dxf-viewer', 'three-dxf-viewer'] as const) {
  test(`TC-ISSUE25-001: ${renderer} list/direct/reload launches CSS immersive, preserves controls and exits safely`, async ({ page, request, browser, baseURL }) => {
    const response = await request.post('/api/cad-files', {
      multipart: {
        file: { name: `issue25-${renderer}.dxf`, mimeType: 'application/octet-stream', buffer: drawing },
        ...(await masterFields(request, { businessUnit: `Issue25-${renderer}`, site: 'site', building: 'B', floor: '2' })),
        registeredAt: '2026-10-17', makeCurrent: 'true', deletePassword: '1234',
      },
    });
    expect(response.status()).toBe(201);
    const file = await response.json();
    await page.goto(`/?filename=issue25-${renderer}.dxf`);
    await page.getByRole('link', { name: '도면 보기', exact: true }).click();
    if (renderer === 'dxf-viewer') {
      await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
      await clickViewerCommand(page, 'view', 'dxf-viewer');
    }
    const shell = page.getByTestId('cad-viewer-shell');
    await expect(shell).toHaveAttribute('data-fullscreen', 'true');
    await expect(shell).toHaveAttribute('data-native-fullscreen', 'false');
    await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
    await expect(page.getByRole('heading', { name: file.displayName })).toBeVisible();
    await openViewerMenu(page, 'drawing');
    await expect(page.getByRole('menuitem', { name: '버전 목록' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: '다시 불러오기' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: '도면 링크 복사' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: '원본 다운로드' })).toBeVisible();
    await openViewerMenu(page, 'view');
    await expect(page.getByRole('menuitem', { name: '브라우저 전체 화면', exact: true })).toBeVisible();
    await expect.poll(() => shell.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return Math.abs(bounds.width - innerWidth) < 2 && Math.abs(bounds.height - innerHeight) < 2;
    })).toBe(true);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
    await expect(page.getByTestId('viewer-active-renderer')).toHaveText(renderer);
    if (renderer === 'three-dxf-viewer') await expect(page.getByRole('complementary', { name: '전체 화면 레이어' })).toBeVisible();
    const canvas = page.getByTestId('cad-canvas').locator('canvas');
    await expect(canvas).toHaveCount(1);
    await page.setViewportSize({ width: 360, height: 700 });
    await expect.poll(() => shell.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return Math.abs(bounds.width - 360) < 2 && Math.abs(bounds.height - 700) < 2;
    })).toBe(true);
    await expect.poll(() => canvas.evaluate(element => {
      const canvas = element as HTMLCanvasElement;
      const bounds = canvas.getBoundingClientRect();
      return Math.abs(canvas.width - bounds.width * devicePixelRatio) < 2 &&
        Math.abs(canvas.height - bounds.height * devicePixelRatio) < 2;
    })).toBe(true);
    await shell.evaluate(element => Object.defineProperty(element, 'requestFullscreen', {
      configurable: true, value: () => Promise.reject(new Error('browser-policy-rejected')),
    }));
    await clickViewerCommand(page, 'view', '브라우저 전체 화면');
    await expect(shell).toHaveAttribute('data-fullscreen', 'true');
    await expect(shell).toHaveAttribute('data-native-fullscreen', 'false');

    await page.reload();
    await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
    await expect(shell).toHaveAttribute('data-fullscreen', 'true');
    if (renderer === 'three-dxf-viewer') {
      await expect(page.getByRole('dialog', { name: '레이어' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: '레이어' })).toHaveCount(0);
      await expect(shell).toHaveAttribute('data-fullscreen', 'true');
    }
    await page.keyboard.press('Escape');
    await expect(shell).toHaveAttribute('data-fullscreen', 'false');
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
    await openViewerMenu(page, 'view');
    await expect(page.getByRole('menuitem', { name: '전체 화면', exact: true })).toBeVisible();
    await clickViewerCommand(page, 'view', '전체 화면');
    await expect(shell).toHaveAttribute('data-fullscreen', 'true');

    const directContext = await browser.newContext({ baseURL });
    try {
      const directPage = await directContext.newPage();
      await directPage.goto(`/cad/versions/${file.id}/viewer?renderer=${renderer}`);
      await expect(directPage.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen', 'true');
      await expect(directPage.getByTestId('cad-viewer-shell')).toHaveAttribute('data-native-fullscreen', 'false');
      await expect(directPage.getByRole('status')).toHaveText('도면 표시 완료');
    } finally {
      await directContext.close();
    }

    await clickViewerCommand(page, 'drawing', '← 버전 목록');
    await expect(page).toHaveURL(new RegExp(`/cad/locations/${file.locationId}`));
    await expect(page.getByTestId('cad-viewer-shell')).toHaveCount(0);
    await page.goBack();
    await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen', 'true');
    await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  });
}

test('TC-ISSUE25-002: native fullscreen has an in-shell blocking loading overlay', async ({ page, request }) => {
  const response = await request.post('/api/cad-files', {
    multipart: {
      file: { name: 'issue25-native-loading.dxf', mimeType: 'application/octet-stream', buffer: drawing },
      ...(await masterFields(request, { businessUnit: 'Issue25-native', site: 'site', building: 'B', floor: '2' })),
      registeredAt: '2026-10-17', makeCurrent: 'true', deletePassword: '1234',
    },
  });
  expect(response.status()).toBe(201);
  const file = await response.json();
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=dxf-viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');

  const shell = page.getByTestId('cad-viewer-shell');
  // Model a browser native fullscreenchange deterministically. Real fullscreen
  // permissions vary by browser/runner, while this contract is top-layer subtree placement.
  await shell.evaluate(element => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  await expect(shell).toHaveAttribute('data-native-fullscreen', 'true');

  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route(`**/api/cad-files/${file.id}/content`, async route => {
    requests++;
    await gate;
    await route.continue();
  });
  try {
    await clickViewerCommand(page, 'drawing', '다시 불러오기');
    await expect.poll(() => requests).toBe(1);
    await expect(shell.getByTestId('viewer-loading-overlay')).toBeVisible();
    await expect(shell.getByRole('button', { name: '로딩 중단 후 three-dxf-viewer로 열기' })).toBeEnabled();
    await openViewerMenu(page, 'drawing');
    await expect(page.getByRole('menuitem', { name: '다시 불러오기' })).toBeDisabled();
  } finally {
    release();
  }
  await expect(shell.getByTestId('viewer-loading-overlay')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await shell.evaluate(() => {
    Reflect.deleteProperty(document, 'fullscreenElement');
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  await expect(shell).toHaveAttribute('data-native-fullscreen', 'false');
});
