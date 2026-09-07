import { expect, test } from '@playwright/test';
test('TC-UI-001/UP-001: header registration link opens a working upload form', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '파일 등록', exact: true }).click();
  await expect(page.getByRole('heading', { name: '새 도면 등록' })).toBeVisible();
  await page.getByLabel('CAD 파일').setInputFiles({ name: '테스트-layout.dxf', mimeType: 'application/octet-stream', buffer: Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n') });
  for (const [name, value] of [['사업부','자동화'],['사업장','평택'],['동','A동'],['층','2층']]) await page.getByLabel(name, { exact: true }).fill(value);
  await page.getByRole('button', { name: '도면 등록', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('V1 등록 완료');
  const href = await page.getByRole('link', { name: '등록한 원본 다운로드' }).getAttribute('href');
  const content = await request.get(href!);
  expect(content.status()).toBe(200);
  expect(await content.text()).toContain('ENTITIES');
  await page.screenshot({ path: 'test-results/upload-success.png', fullPage: true });
});
test('TC-API-002/003: invalid metadata, ID and unsupported upload are safe errors', async ({ request }) => {
  const response = await request.post('/api/cad-files', { multipart: {file: {name:'bad.exe',mimeType:'application/octet-stream',buffer:Buffer.from('bad')},businessUnit:'x',site:'x',building:'x',floor:'x',registeredAt:'2026-09-07',makeCurrent:'true'} });
  expect(response.status()).toBe(415);
  const data = await response.json(); expect(data.error.message).toContain('DXF'); expect(data.error.stack).toBeUndefined();
  expect((await request.get('/api/cad-files/not-an-id/content')).status()).toBe(400);
  expect((await request.post('/api/cad-files', { headers: { origin: 'https://foreign.invalid' } })).status()).toBe(403);
});
