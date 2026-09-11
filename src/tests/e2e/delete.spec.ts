import { expect, test } from '@playwright/test';

const drawing = Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n');

async function register(request: import('@playwright/test').APIRequestContext, name: string, makeCurrent: boolean) {
  const response = await request.post('/api/cad-files', { multipart: {
    file: { name, mimeType: 'application/octet-stream', buffer: drawing },
    businessUnit: '삭제회귀', site: '브라우저', building: 'A동', floor: '1층',
    registeredAt: '2026-09-11', makeCurrent: String(makeCurrent), deletePassword: '1234',
  }});
  expect(response.status()).toBe(201);
  return response.json() as Promise<{ id: string; locationId: string }>;
}

test('TC-DELETE-002/004: cancel and wrong password preserve a Current version, correct deletion removes all access', async ({ page, request }) => {
  const first = await register(request, 'delete-keep.dxf', false);
  const target = await register(request, 'delete-target.dxf', true);
  await page.goto(`/cad/locations/${target.locationId}`);
  const row = page.getByRole('row').filter({ hasText: 'delete-target.dxf' });
  await row.getByRole('button', { name: '삭제', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('delete-target.dxf · V2');
  const password = dialog.getByLabel('삭제 비밀번호', { exact: true });
  await password.fill('1234');
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await row.getByRole('button', { name: '삭제', exact: true }).click();
  await expect(dialog.getByLabel('삭제 비밀번호', { exact: true })).toHaveValue('');
  await dialog.getByLabel('삭제 비밀번호', { exact: true }).fill('wrong');
  await dialog.getByRole('button', { name: '삭제 확인', exact: true }).click();
  await expect(dialog).toContainText('삭제 비밀번호가 올바르지 않습니다.');
  await expect(row).toBeVisible();
  expect((await request.get(`/api/cad-files/${target.id}/content`)).status()).toBe(200);

  await dialog.getByLabel('삭제 비밀번호', { exact: true }).fill('1234');
  await dialog.getByRole('button', { name: '삭제 확인', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'delete-target.dxf' })).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'delete-keep.dxf' })).toContainText('이전 버전');
  expect((await request.get(`/api/cad-files/${target.id}/content`)).status()).toBe(404);
  // Next's streaming notFound response can retain HTTP 200; verify the rendered 404 boundary and no viewer.
  await page.goto(`/cad/versions/${target.id}/viewer`);
  await expect(page.locator('body')).toContainText('404');
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.locator('body').textContent()).not.toContain('delete-target.dxf');
  const detail = await request.get(`/api/cad-locations/${target.locationId}`);
  expect(detail.status()).toBe(200);
  expect((await detail.json()).versions).toHaveLength(1);
  expect((await request.get(`/api/cad-files/${first.id}/content`)).status()).toBe(200);
});

test('TC-DELETE-003/005: pending cleanup acknowledgment and uncertain responses are safe and never auto-retry', async ({ page, request }) => {
  const pending = await register(request, 'delete-pending.dxf', true);
  await page.goto(`/cad/locations/${pending.locationId}`);
  const row = page.getByRole('row').filter({ hasText: 'delete-pending.dxf' });
  await row.getByRole('button', { name: '삭제', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('삭제 비밀번호', { exact: true }).fill('1234');
  await page.route(`**/api/cad-files/${pending.id}`, async route => route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ deleted: true, cleanupPending: true, locationId: pending.locationId, wasCurrent: true, requestId: 'safe-request-id' }) }));
  await dialog.getByRole('button', { name: '삭제 확인', exact: true }).click();
  await expect(dialog).toContainText('원본 파일 정리는 대기 중입니다');
  await dialog.getByRole('button', { name: '확인', exact: true }).click();

  const uncertain = await register(request, 'delete-uncertain.dxf', false);
  await page.goto(`/cad/locations/${uncertain.locationId}`);
  const uncertainRow = page.getByRole('row').filter({ hasText: 'delete-uncertain.dxf' });
  await uncertainRow.getByRole('button', { name: '삭제', exact: true }).click();
  const uncertainDialog = page.getByRole('dialog');
  await uncertainDialog.getByLabel('삭제 비밀번호', { exact: true }).fill('1234');
  let calls = 0;
  await page.route(`**/api/cad-files/${uncertain.id}`, async route => {
    calls += 1;
    if (calls === 1) await route.fulfill({ status: 200, contentType: 'text/plain', body: 'proxy response with secret-canary' });
    else if (calls === 2) await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    else await route.abort('connectionreset');
  });
  await uncertainDialog.getByRole('button', { name: '삭제 확인', exact: true }).click();
  await expect(uncertainDialog).toContainText('삭제 결과가 불확실하므로 목록을 새로고침해 확인해주세요.');
  expect(await uncertainDialog.textContent()).not.toContain('secret-canary');
  await uncertainDialog.getByRole('button', { name: '삭제 확인', exact: true }).click();
  await expect(uncertainDialog).toContainText('삭제 결과가 불확실하므로 목록을 새로고침해 확인해주세요.');
  await uncertainDialog.getByRole('button', { name: '삭제 확인', exact: true }).click();
  await expect(uncertainDialog).toContainText('삭제 결과가 불확실하므로 목록을 새로고침해 확인해주세요.');
  expect(calls).toBe(3);
  await expect(uncertainRow).toBeVisible();
});
