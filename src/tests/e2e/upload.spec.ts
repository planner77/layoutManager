import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('TC-UI-001/UP-001: header registration link opens a working upload form', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('link', { name: '파일 등록', exact: true }).click();
  await expect(page.getByRole('heading', { name: '새 도면 등록' })).toBeVisible();
  await page.getByLabel('CAD 파일').setInputFiles({ name: '테스트-layout.dxf', mimeType: 'application/octet-stream', buffer: Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n') });
  for (const [name, value] of [['사업부','자동화'],['사업장','평택'],['동','A동'],['층','2층']]) await page.getByLabel(name, { exact: true }).fill(value);
  await page.getByLabel('삭제 비밀번호', { exact: true }).fill('1234');
  const uploadResponse = page.waitForResponse(response => response.url().endsWith('/api/cad-files') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '도면 등록', exact: true }).click();
  const completed = await uploadResponse;
  const completedBody = await completed.json();
  expect(completed.headers()['x-request-id']).toBe(completedBody.requestId);
  await expect(page.getByRole('status')).toContainText('V1 등록 완료');
  const href = await page.getByRole('link', { name: '등록한 원본 다운로드' }).getAttribute('href');
  const content = await request.get(href!);
  expect(content.status()).toBe(200);
  expect(await content.text()).toContain('ENTITIES');
  await page.screenshot({ path: 'test-results/upload-success.png', fullPage: true });
  await page.getByRole('link', { name: '목록으로', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: '테스트-layout.dxf' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: '테스트-layout.dxf' })).toContainText('Current');
});
test('TC-API-002/003: invalid metadata, ID and unsupported upload are safe errors', async ({ request }) => {
  const response = await request.post('/api/cad-files', { multipart: {file: {name:'bad.exe',mimeType:'application/octet-stream',buffer:Buffer.from('bad')},businessUnit:'x',site:'x',building:'x',floor:'x',registeredAt:'2026-09-07',makeCurrent:'true',deletePassword:'1234'} });
  expect(response.status()).toBe(415);
  const data = await response.json(); expect(data.error.message).toContain('DXF'); expect(data.error.stack).toBeUndefined();
  expect(response.headers()['x-request-id']).toBe(data.error.requestId);
  expect(data.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect((await request.get('/api/cad-files/not-an-id/content')).status()).toBe(400);
  expect((await request.post('/api/cad-files', { headers: { origin: 'https://foreign.invalid' } })).status()).toBe(403);
});

test('TC-OBS-001–003/007: proxy failure has selectable, downloadable safe diagnostics without retry', async ({ page }) => {
  let uploads = 0;
  let connectionFailure = false;
  const consoleMessages: string[] = [];
  page.on('console', message => consoleMessages.push(message.text()));
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  await page.route('**/api/cad-files', async route => {
    uploads += 1;
    if (connectionFailure) await route.abort('connectionrefused');
    else await route.fulfill({ status: 502, contentType: 'text/html', body: '<html>Authorization: Bearer browser-canary</html>' });
  });
  await page.goto('/cad/upload');
  await page.getByLabel('CAD 파일').setInputFiles({ name: 'diagnostic.dxf', mimeType: 'application/octet-stream', buffer: Buffer.from('0\nEOF\n') });
  for (const [name, value] of [['사업부','진단'],['사업장','폐쇄망'],['동','A동'],['층','1층']]) await page.getByLabel(name, { exact: true }).fill(value);
  await page.getByLabel('삭제 비밀번호', { exact: true }).fill('1234');
  await page.getByRole('button', { name: '도면 등록', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('서버 또는 중간 프록시');
  await page.getByText('오류 상세 보기').click();
  const details = page.getByLabel('업로드 오류 진단 전체 내용');
  await expect(details).toContainText('오류 코드: HTTP_502');
  await expect(details).toContainText('HTTP 상태: 502');
  await expect(details).toContainText('서버 요청 ID: 없음');
  await expect(details).not.toContainText('browser-canary');
  await page.getByRole('button', { name: '진단 정보 복사' }).click();
  await expect(page.getByRole('status')).toContainText('직접 선택');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '진단 JSON 저장' }).click();
  const saved = await (await downloadPromise).path();
  const exported = JSON.parse(await readFile(saved!, 'utf8'));
  expect(exported).toMatchObject({ code: 'HTTP_502', httpStatus: 502, requestId: null, outcome: 'uncertain' });
  expect(JSON.stringify(exported)).not.toContain('browser-canary');
  expect(consoleMessages.join('\n')).not.toContain('browser-canary');
  expect(uploads).toBe(1);
  connectionFailure = true;
  await page.getByRole('button', { name: '도면 등록', exact: true }).click();
  await page.getByText('오류 상세 보기').click();
  await expect(page.getByLabel('업로드 오류 진단 전체 내용')).toContainText('오류 코드: CONNECTION_FAILED');
  await expect(page.getByLabel('업로드 오류 진단 전체 내용')).toContainText('HTTP 상태: 응답 없음');
  expect(uploads).toBe(2);
});

test('TC-ISSUE-001/LIST: list API, filters, detail and current change persist', async ({ page, request }) => {
  for (const [index,name] of ['issue-one.dxf','issue-two.dxf'].entries()) {
    const response = await request.post('/api/cad-files', { multipart: {file: {name,mimeType:'application/octet-stream',buffer:Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n')},businessUnit:'회귀',site:'이슈검증',building:'B동',floor:'1층',registeredAt:'2026-09-07',makeCurrent:index === 1 ? 'true' : 'false',deletePassword:'1234'} });
    expect(response.status()).toBe(201);
  }
  const response = await request.get('/api/cad-files?site=이슈검증&current=true');
  expect(response.status()).toBe(200); expect(response.headers()['cache-control']).toContain('no-store');
  const result = await response.json(); expect(result.total).toBe(1); expect(result.items[0].originalFilename).toBe('issue-two.dxf'); expect(result.items[0].storagePath).toBeUndefined();
  for (const query of ['page=0','format=EXE','current=yes','site=a&site=b']) expect((await request.get(`/api/cad-files?${query}`)).status()).toBe(400);
  await page.goto('/');
  await page.getByLabel('파일명', {exact:true}).fill('issue-');
  await page.getByRole('combobox', {name:'사업장',exact:true}).selectOption('이슈검증');
  await page.getByRole('button',{name:'검색',exact:true}).click();
  await expect(page.getByRole('row').filter({hasText:'issue-one.dxf'})).toBeVisible();
  await page.getByRole('row').filter({hasText:'issue-one.dxf'}).getByRole('button',{name:'Current 지정'}).click();
  await expect(page.getByRole('row').filter({hasText:'issue-one.dxf'})).toContainText('Current');
  await page.getByRole('link',{name:'issue-one.dxf',exact:true}).click();
  await expect(page.getByRole('row').filter({hasText:'issue-one.dxf'})).toContainText('Current');
  await expect(page.getByRole('row').filter({hasText:'issue-two.dxf'}).getByRole('button',{name:'Current 지정'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('row').filter({hasText:'issue-two.dxf'}).getByRole('button',{name:'Current 지정'})).toBeVisible();
  await page.goto('/?site=이슈검증&current=true');
  await expect(page.getByRole('row').filter({hasText:'issue-one.dxf'})).toBeVisible();
  await expect(page.getByRole('row').filter({hasText:'issue-two.dxf'})).toHaveCount(0);
  await page.screenshot({path:'test-results/list-current.png',fullPage:true});
  const detail = await request.get(`/api/cad-locations/${result.items[0].locationId}`);
  expect(detail.status()).toBe(200); expect((await detail.json()).versions.filter((v: {isCurrent:boolean})=>v.isCurrent)).toHaveLength(1);
});

test('TC-DESC-005: description registration, literal search and viewer display', async ({ page, request }) => {
  const response = await request.post('/api/cad-files', { multipart: { file: { name:'description-only.dxf', mimeType:'application/octet-stream', buffer:Buffer.from('0\nEOF\n') }, businessUnit:'설명', site:'검색', building:'A동', floor:'1층', registeredAt:'2026-09-09', makeCurrent:'true', deletePassword:'1234', description:'설비 구역 %_\n두 번째 줄' } });
  expect(response.status()).toBe(201);
  await response.json();
  await page.goto('/?description='+encodeURIComponent('설비 구역 %_'));
  const row = page.getByRole('row').filter({ hasText:'description-only.dxf' });
  await expect(row).toContainText('설비 구역 %_');
  await row.getByRole('link', { name:'도면 보기', exact:true }).click();
  await expect(page.getByLabel('도면 설명')).toContainText('두 번째 줄');
});
