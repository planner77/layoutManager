import { expect, test } from '@playwright/test';
import { masterFields } from './master-helper';

const drawing = Buffer.from(
  '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nEQUIP\n10\n0\n20\n0\n11\n100\n21\n100\n0\nLINE\n8\nUTILITY\n10\n0\n20\n100\n11\n100\n21\n0\n0\nENDSEC\n0\nEOF\n',
);

for (const renderer of ['dxf-viewer', 'three-dxf-viewer'] as const) {
  test(`TC-U1-E2E-001: ${renderer} CSS immersive/menu/resize/escape and dock state`, async ({ page, request }) => {
    const created = await request.post('/api/cad-files', {
      multipart: {
        file: { name: `issue38-${renderer}.dxf`, mimeType: 'application/octet-stream', buffer: drawing },
        ...(await masterFields(request, { businessUnit: `Issue38-${renderer}`, site: 'menu', building: 'A', floor: '1' })),
        registeredAt: '2026-10-24', makeCurrent: 'true', deletePassword: '1234',
      },
    });
    expect(created.status()).toBe(201);
    const file = await created.json();
    let contentRequests = 0;
    page.on('request', r => { if (r.url().includes(`/api/cad-files/${file.id}/content`)) contentRequests++; });

    await page.goto(`/cad/versions/${file.id}/viewer?renderer=${renderer}`);
    const shell = page.getByTestId('cad-viewer-shell');
    const menu = page.getByTestId('viewer-menu-bar');
    const canvas = page.getByTestId('cad-canvas').locator('canvas');
    await expect(shell).toHaveAttribute('data-fullscreen', 'true');
    await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
    await expect(menu).toBeVisible();
    await expect(page.getByRole('heading', { name: file.displayName })).toBeVisible();
    await expect(page.getByRole('link', { name: '← 버전 목록' })).toBeVisible();
    await expect(page.getByRole('link', { name: '원본 다운로드' })).toBeVisible();
    await expect(page.getByRole('button', { name: '도면 링크 복사' })).toBeVisible();
    await expect(page.getByRole('button', { name: '브라우저 전체 화면' })).toBeVisible();
    await expect(page.getByTestId('viewer-menu-outline-tool')).toBeDisabled();
    await expect(page.getByTestId('viewer-menu-outline-tree')).toBeDisabled();
    await expect(page.getByTestId('viewer-menu-outline-types')).toBeDisabled();
    await expect(canvas).toHaveCount(1);
    expect(contentRequests).toBe(1);

    const layerMenu = page.getByTestId('viewer-menu-layers');
    if (renderer === 'three-dxf-viewer') {
      await expect(layerMenu).toBeEnabled();
      const panel = page.getByRole('complementary', { name: '전체 화면 레이어' });
      await expect(panel).toBeVisible();
      const equip = panel.getByRole('checkbox', { name: 'EQUIP' });
      await equip.uncheck();
      const stable = 'issue38-no-recreate';
      await canvas.evaluate((element, marker) => element.setAttribute('data-stable', marker), stable);
      await layerMenu.click();
      await expect(panel).toHaveCount(0);
      await expect(layerMenu).toHaveAttribute('aria-pressed', 'false');
      await expect(canvas).toHaveAttribute('data-stable', stable);
      await layerMenu.click();
      await expect(panel).toBeVisible();
      await expect(equip).not.toBeChecked();
      await expect(canvas).toHaveAttribute('data-stable', stable);
      // No stable Source Handle exists: U3 selection/outline tools remain
      // fail-closed. Issue #82's free-WCS memo is independent of Source mapping,
      // so the shared tools dock now hosts *only* the temporary memo controls.
      await expect(page.getByTestId('viewer-menu-outline-tool')).toBeDisabled();
      await expect(page.getByTestId('cad-object-selection-tools')).toHaveCount(0);
      await expect(page.getByTestId('cad-outline-tools')).toHaveCount(0);
      await expect(page.getByTestId('viewer-tools-dock')).toHaveCount(1);
      await expect(page.getByTestId('cad-memo-status')).toContainText('0/100');
      await expect(page.getByTestId('viewer-menu-memo-add')).toBeEnabled();
      await expect(page.getByTestId('cad-memo-pin')).toHaveCount(0);
      expect(contentRequests).toBe(1);
    } else {
      await expect(layerMenu).toBeDisabled();
      await expect(page.getByTestId('viewer-menu-memo-add')).toBeDisabled();
      await expect(page.getByTestId('cad-memo-status')).toHaveCount(0);
      await expect(page.getByTestId('viewer-tools-dock')).toHaveCount(0);
      await expect(page.getByRole('complementary', { name: '전체 화면 레이어' })).toHaveCount(0);
    }

    await page.setViewportSize({ width: 320, height: 640 });
    await expect.poll(() => canvas.evaluate(element => {
      const box = element.getBoundingClientRect();
      return box.width > 100 && box.height > 60 && box.left >= -1 && box.right <= 321;
    })).toBe(true);
    await expect.poll(() => canvas.evaluate(element => {
      const box = element.getBoundingClientRect();
      const c = element as HTMLCanvasElement;
      return Math.abs(c.width - box.width * devicePixelRatio) < 2 &&
        Math.abs(c.height - box.height * devicePixelRatio) < 2;
    })).toBe(true);
    await page.getByRole('button', { name: '도면 내 텍스트 검색' }).click();
    await expect(page.getByTestId('cad-text-search')).toBeVisible();
    await page.getByRole('searchbox', { name: '도면 텍스트 검색어' }).focus();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('cad-text-search')).toHaveCount(0);
    await expect(shell).toHaveAttribute('data-fullscreen', 'true');
    await page.keyboard.press('Escape');
    await expect(shell).toHaveAttribute('data-fullscreen', 'false');
    await page.getByRole('button', { name: '전체 화면', exact: true }).click();
    await expect(shell).toHaveAttribute('data-fullscreen', 'true');
    expect(contentRequests).toBe(1);
    await page.reload();
    await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
    await expect(menu).toBeVisible();
  });
}

test('TC-U1-E2E-002: DWG UI uses the app shell without offering DXF-only controls on damaged input', async ({ page, request }) => {
  const created = await request.post('/api/cad-files', {
    multipart: {
      file: { name: 'issue38-corrupt.dwg', mimeType: 'application/octet-stream', buffer: Buffer.from('AC1032broken') },
      ...(await masterFields(request, { businessUnit: 'Issue38-DWG', site: 'menu', building: 'A', floor: '1' })),
      registeredAt: '2026-10-24', makeCurrent: 'true', deletePassword: '1234',
    },
  });
  expect(created.status()).toBe(201);
  const file = await created.json();
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=libredwg-web`);
  await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen', 'true');
  await expect(page.getByTestId('viewer-menu-bar')).toBeVisible();
  await expect(page.getByText('libredwg-web', { exact: true })).toBeVisible();
  await expect(page.getByTestId('viewer-menu-layers')).toBeDisabled();
  await expect(page.getByTestId('viewer-menu-outline-tool')).toBeDisabled();
  await expect(page.getByTestId('viewer-menu-outline-tree')).toBeDisabled();
  await expect(page.getByTestId('viewer-menu-outline-types')).toBeDisabled();
  await expect(page.getByTestId('viewer-menu-memo-add')).toBeDisabled();
  await expect(page.getByTestId('cad-memo-status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'dxf-viewer', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'three-dxf-viewer', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '다시 불러오기' })).toBeVisible();
  await expect(page.getByRole('link', { name: '원본 다운로드' })).toBeVisible();
  await expect(page.getByRole('link', { name: '← 버전 목록' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('실패');
});


test('TC-M1-E2E-006: free-WCS memo remains available without stable Source handles', async ({ page, request }) => {
  const created = await request.post('/api/cad-files', {
    multipart: {
      file: { name: 'issue82-unmapped-source.dxf', mimeType: 'application/octet-stream', buffer: drawing },
      ...(await masterFields(request, { businessUnit: 'Issue82-Unmapped-Source', site: 'memo', building: 'B', floor: '1' })),
      registeredAt: '2026-10-25', makeCurrent: 'true', deletePassword: '1234',
    },
  });
  expect(created.status()).toBe(201);
  const version = (await created.json()) as { id: string };
  await page.goto(`/cad/versions/${version.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(page.getByTestId('viewer-menu-outline-tool')).toBeDisabled();
  await expect(page.getByTestId('cad-object-selection-tools')).toHaveCount(0);
  await expect(page.getByTestId('viewer-menu-memo-add')).toBeEnabled();
  await page.getByTestId('viewer-menu-memo-add').click();
  await page.getByTestId('cad-memo-title').fill('핸들 없는 DXF 메모');
  await page.getByTestId('cad-memo-content').fill('SOURCE 선택 없이 WCS 배치');
  await page.getByTestId('cad-memo-x').fill('10');
  await page.getByTestId('cad-memo-y').fill('20');
  await page.getByTestId('cad-memo-coordinate-place').click();
  await page.getByTestId('cad-memo-create').click();
  const pin = page.getByTestId('cad-memo-pin');
  await expect(pin).toHaveCount(1);
  await expect(pin).toHaveAttribute('data-memo-wcs-x', '10');
  await expect(pin).toHaveAttribute('data-memo-wcs-y', '20');
  await expect(page.getByTestId('cad-memo-status')).toContainText('1/100');
  await expect(page.getByTestId('cad-object-selection-tools')).toHaveCount(0);
  await page.getByRole('button', { name: '전체 화면 확대' }).click();
  await page.getByRole('button', { name: '전체 화면 맞춤' }).click();
  await expect(pin).toHaveAttribute('data-memo-wcs-x', '10');
  await expect(pin).toHaveAttribute('data-memo-wcs-y', '20');
});
