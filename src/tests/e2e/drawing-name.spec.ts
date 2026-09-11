import { expect, test } from '@playwright/test';

const drawing = Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n');

async function register(request: import('@playwright/test').APIRequestContext, filename: string, drawingName?: string) {
  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
    file: { name: filename, mimeType: 'application/octet-stream', buffer: drawing }, businessUnit: '이름E2E', site: '전용사업장', building: 'N동', floor: '6층', registeredAt: '2026-09-11', makeCurrent: 'false', deletePassword: '1234', description: '',
  };
  if (drawingName !== undefined) multipart.drawingName = drawingName;
  const response = await request.post('/api/cad-files', { multipart });
  expect(response.status()).toBe(201);
  return response.json() as Promise<{ id: string; locationId: string; version: number; displayName: string; originalFilename: string }>;
}

test('TC-NAME-002/003: default and custom names lead list, viewer and delete confirmation while filename remains searchable', async ({ page, request }, testInfo) => {
  const automatic = await register(request, 'name-source-one.dxf');
  const custom = await register(request, 'name-source-two.dxf', '<b>사용자 설비 배치도</b>');
  expect(automatic).toMatchObject({ displayName: `[이름E2E][전용사업장][N동][6층]_V${automatic.version}`, originalFilename: 'name-source-one.dxf' });
  expect(custom).toMatchObject({ displayName: '<b>사용자 설비 배치도</b>', originalFilename: 'name-source-two.dxf' });

  await page.goto('/?filename=name-source-two.dxf');
  const row = page.getByRole('row').filter({ hasText: '<b>사용자 설비 배치도</b>' });
  await expect(row).toContainText('원본: name-source-two.dxf');
  await expect(row.locator('b')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('drawing-name-list-custom.png'), fullPage: true });
  await row.getByRole('link', { name: '도면 보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '<b>사용자 설비 배치도</b>' })).toBeVisible();
  await expect(page.getByText('원본: name-source-two.dxf')).toBeVisible();
  await page.goto(`/cad/locations/${custom.locationId}`);
  const locationRow = page.locator(`#version-${custom.id}`);
  await locationRow.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(`<b>사용자 설비 배치도</b> · V${custom.version}`);
});

test('TC-NAME-003: upload form previews the normalized location with an unresolved version', async ({ page }) => {
  await page.goto('/cad/upload');
  for (const [label, value] of [['사업부',' 이름UI '],['사업장','전용미리보기'],['동','P동'],['층','9층']]) await page.getByLabel(label, { exact: true }).fill(value);
  await expect(page.getByLabel('도면 이름')).toHaveAttribute('placeholder', '[이름UI][전용미리보기][P동][9층]_V{등록 시 확정}');
  await expect(page.getByText('실제 버전 번호는 등록할 때 확정됩니다.')).toBeVisible();
  await page.getByLabel('CAD 파일').setInputFiles({ name: 'ui-name-source.dxf', mimeType: 'application/octet-stream', buffer: drawing });
  await page.getByLabel('도면 이름').fill('사용자 입력 이름');
  await page.getByLabel('삭제 비밀번호', { exact: true }).fill('1234');
  await page.getByRole('button', { name: '도면 등록', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('사용자 입력 이름 등록 완료');
  await page.goto('/');
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: '사용자 입력 이름' });
  await expect(row).toContainText('원본: ui-name-source.dxf');
});

test('TC-NAME-003: a maximum-length custom name wraps inside the viewer viewport', async ({ page, request }, testInfo) => {
  const name = '긴도면이름'.repeat(51);
  const result = await register(request, 'long-name-source.dxf', name);
  await page.setViewportSize({ width: 360, height: 700 });
  await page.goto(`/cad/versions/${result.id}/viewer`);
  const heading = page.getByRole('heading', { name });
  await expect(heading).toBeVisible();
  const widths = await heading.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth);
  await page.screenshot({ path: testInfo.outputPath('drawing-name-viewer-long.png'), fullPage: true });
});
