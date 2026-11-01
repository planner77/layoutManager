import { expect, test } from '@playwright/test';

test('R1 logs real permission gate, filtered table and timeline, cursor, mobile and revocation', async ({ page, baseURL }) => {
  const anonymousPage = await page.request.get('/operations/logs');
  expect(anonymousPage.status()).toBe(401);
  expect(anonymousPage.headers()['cache-control']).toContain('no-store');
  expect(await anonymousPage.text()).not.toContain('operations-log-console');
  await page.goto('/g7-runtime');
  await page.getByLabel('계정').fill('admin');
  await page.getByLabel('비밀번호', { exact: true }).fill('synthetic-changed-password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '현재 세션' })).toBeVisible();
  expect((await page.request.get('/api/operations/logs')).status()).toBe(403);
  const deniedPage = await page.goto('/operations/logs');
  expect(deniedPage?.status()).toBe(403);
  await expect(page.getByRole('heading', { name: '서버 로그 접근 제한' })).toBeVisible();
  await expect(page.getByTestId('operations-log-console')).toHaveCount(0);
  const session = await (await page.request.get('/api/g7-runtime/auth/session')).json();
  const headers = { origin: baseURL!, 'x-csrf-token': session.csrfToken };
  const change = async (operation: 'grant' | 'revoke') => {
    const response = await page.request.post('/api/g7-runtime/access/grant', {
      headers, data: { kind: 'special', operation, affectedUserId: session.actor.id, value: 'logs:read' },
    });
    expect(response.status(), await response.text()).toBe(200);
  };
  await change('grant');
  const access = await page.request.get('/api/operations/logs/access');
  expect(access.status()).toBe(200);
  expect(access.headers()['cache-control']).toContain('no-store');
  const actual = await page.request.get('/api/operations/logs');
  expect(actual.status()).toBe(200);
  expect((await actual.json()).status).toBe('disabled');
  // HTTP authorization is real above. Browser state fixtures below isolate UI
  // filtering/timeline/error behavior from the fixed production /data/logs path.
  const id = '16cecd3f-92db-484e-a1f3-548c2b89193e';
  const at = new Date(Date.now() - 120_000).toISOString();
  const first = { logId: 'fad2c1dc-0a8c-4cc8-8425-0c980d89411d', timestamp: at,
    level: 'error', event: 'http_request_stage', source: 'app', component: 'api',
    operation: 'cad_upload', appVersion: '0.49.0', requestId: id, stage: 'database_write',
    outcome: 'failure', errorCode: 'SERVER_ERROR', elapsedMs: 31, httpStatus: 500 };
  let requested = new URLSearchParams();
  let expired = false;
  let mode: 'ok' | 'empty' | 'partial' | 'offline' | 'timeline-offline' = 'ok';
  await page.route('**/api/operations/logs?*', async route => {
    requested = new URL(route.request().url()).searchParams;
    if (expired) return route.fulfill({ status: 410, json: { error: { code: 'CURSOR_EXPIRED' } } });
    if (mode === 'offline' || (mode === 'timeline-offline' && requested.has('requestId')))
      return route.fulfill({ status: 503, json: { error: { code: 'LOG_STORE_UNAVAILABLE' } } });
    const timeline = requested.has('requestId');
    const later = { ...first, logId: '4cb69b36-d900-4f48-94c5-b872ba19d6b7',
      timestamp: new Date(Date.parse(at) - 1000).toISOString(), level: 'info',
      event: 'http_request_started', stage: 'request_received', outcome: 'started' };
    return route.fulfill({ json: { items: mode === 'empty' ? [] : timeline ? [first, later] : [first],
      nextCursor: timeline ? null : 'opaque-test-cursor', sourceCoverage: 'app-structured-only',
      status: mode === 'partial' ? 'partial' : 'ok', skippedLines: mode === 'partial' ? 2 : 0, scanTruncated: mode === 'partial' } });
  });
  await page.goto('/operations/logs');
  await expect(page.getByRole('heading', { name: '서버 로그', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '운영 · 서버 로그' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'http_request_stage cad_upload' })).toBeVisible();
  await page.getByRole('combobox', { name: '레벨', exact: true }).selectOption('error');
  await page.getByLabel('작업', { exact: true }).fill('cad_upload');
  await page.getByRole('button', { name: '검색 적용 / 첫 페이지' }).click();
  await expect.poll(() => requested.get('level')).toBe('error');
  expect(requested.get('operation')).toBe('cad_upload');
  await page.getByRole('button', { name: 'http_request_stage 상세' }).click();
  await expect(page.getByRole('region', { name: '이벤트 상세' })).toContainText(id);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'requestId 복사' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'ID를 복사했습니다.' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(id);
  await page.getByRole('button', { name: 'requestId: ' + id.slice(0, 8) + '…' }).click();
  const timeline = page.getByRole('region', { name: '요청 작업 타임라인' });
  await expect(timeline.locator('li')).toHaveCount(2);
  await expect(timeline.locator('li').first()).toContainText('http_request_started');
  // A transient timeline read error must not erase the separately authorized
  // main list. It must remove stale timeline steps and permit an explicit retry.
  mode = 'timeline-offline';
  await page.getByRole('button', { name: 'requestId: ' + id.slice(0, 8) + '…' }).click();
  await expect(timeline.getByRole('alert')).toContainText('로그 저장소를 조회하지 못했습니다.');
  await expect(timeline.locator('li')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'http_request_stage cad_upload' })).toBeVisible();
  mode = 'ok';
  await page.getByRole('button', { name: 'requestId: ' + id.slice(0, 8) + '…' }).click();
  await expect(timeline.locator('li')).toHaveCount(2);
  expect(requested.has('level')).toBe(false);
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(page.getByRole('button', { name: '검색 적용 / 첫 페이지' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/layoutmanager-r1-logs-mobile.png', fullPage: true });
  expired = true;
  await page.getByRole('button', { name: '더 보기', exact: true }).click();
  await expect(page.getByTestId('operations-log-console').getByRole('alert')).toContainText('페이지가 만료');
  await expect(page.getByRole('cell', { name: 'http_request_stage cad_upload' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '이벤트 상세' })).toHaveCount(0);
  expired = false;
  mode = 'empty';
  await page.getByRole('button', { name: '현재 조건 새로 조회' }).click();
  await expect(page.getByText('검색 조건에 맞는 로그가 없습니다.')).toBeVisible();
  mode = 'partial';
  await page.getByRole('button', { name: '현재 조건 새로 조회' }).click();
  await expect(page.getByRole('status').filter({ hasText: '일부 로그만 조회했습니다.' })).toContainText('2개');
  mode = 'offline';
  await page.getByRole('button', { name: '현재 조건 새로 조회' }).click();
  await expect(page.getByTestId('operations-log-console').getByRole('alert')).toContainText('로그 저장소를 조회하지 못했습니다.');
  await expect(page.getByRole('cell', { name: 'http_request_stage cad_upload' })).toHaveCount(0);
  await page.unroute('**/api/operations/logs?*');
  await change('revoke');
  expect((await page.request.get('/api/operations/logs')).status()).toBe(403);
  await page.reload();
  await expect(page.getByTestId('operations-log-console')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '운영 · 서버 로그' })).toHaveCount(0);
  const logout = await page.request.post('/api/g7-runtime/auth/logout', { headers });
  expect(logout.status()).toBe(200);
});
