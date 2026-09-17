import { expect, test } from '@playwright/test';

const drawing = Buffer.from('0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n10\n21\n10\n0\nENDSEC\n0\nEOF\n');

async function fillUpload(page: import('@playwright/test').Page) {
  await page.getByLabel('CAD 파일').setInputFiles({ name: 'global-loading.dxf', mimeType: 'application/octet-stream', buffer: drawing });
  for (const [name, value] of [['사업부','로딩'],['사업장','전역'],['동','A동'],['층','1층']]) await page.getByLabel(name, { exact: true }).fill(value);
  await page.getByLabel('삭제 비밀번호', { exact: true }).fill('1234');
}

test('TC-ISSUE9-001/002: upload blocks the screen, rejects duplicate submit and clears on failure', async ({ page }) => {
  let posts = 0;
  let release!: () => void;
  await page.route('**/api/cad-files', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    posts += 1;
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: 502, contentType: 'text/html', body: '<html>proxy failure</html>' });
  });

  await page.goto('/cad/upload');
  await fillUpload(page);
  await page.getByRole('button', { name: '도면 등록', exact: true }).click();

  const overlay = page.getByTestId('global-loading-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('도면을 등록하는 중입니다...');
  await expect(page.locator('body')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('button', { name: '등록 중…', exact: true })).toBeDisabled();

  await page.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await expect.poll(() => posts).toBe(1);

  release();
  await expect(overlay).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('main').getByRole('alert')).toContainText('서버 또는 중간 프록시');
});

test('TC-ISSUE9-003: viewer load keeps the global overlay until CAD content resolves', async ({ page, request }) => {
  const uploaded = await request.post('/api/cad-files', { multipart: {
    file: { name: 'viewer-loading.dxf', mimeType: 'application/octet-stream', buffer: drawing },
    businessUnit: '로딩', site: 'Viewer', building: 'A동', floor: '1층', registeredAt: '2026-09-17', makeCurrent: 'true', deletePassword: '1234'
  } });
  expect(uploaded.status()).toBe(201);
  const version = await uploaded.json() as { id: string };

  let release!: () => void;
  await page.route(`**/api/cad-files/${version.id}/content`, async route => {
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: drawing });
  });

  await page.goto(`/cad/versions/${version.id}/viewer`);
  const overlay = page.getByTestId('global-loading-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('도면을 여는 중입니다...');
  await expect(page.locator('body')).toHaveAttribute('aria-busy', 'true');

  release();
  await expect(overlay).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: '도면 표시 완료' })).toBeVisible();
});
