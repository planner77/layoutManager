import { expect, test } from '@playwright/test';

test('R2 global catalogue persists, rejects stale edits, preserves Viewer and locks non-admin', async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  await page.goto('/g7-runtime');
  await page.getByLabel('계정').fill('admin');
  await page.getByLabel('비밀번호', { exact: true }).fill('synthetic-changed-password');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '현재 세션' })).toBeVisible();
  const session = await (await page.request.get('/api/g7-runtime/auth/session')).json();
  const headers = { origin: baseURL!, 'x-csrf-token': session.csrfToken };
  const files = await (await page.request.get('/api/cad-files')).json();
  const versionId = files.items[0].id;
  let originalGets = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === `/api/cad-files/${versionId}/content`) originalGets++; });
  const viewerUrl = `/cad/versions/${versionId}/viewer`;
  await page.goto(viewerUrl);
  await expect(page.getByRole('status', { name: '', exact: true }).filter({ hasText: '도면 표시 완료' })).toBeVisible();
  const canvas = await page.getByTestId('cad-canvas').locator('canvas').elementHandle();
  expect(canvas).toBeTruthy();
  const work = async (id: string) => {
    await page.getByRole('button', { name: '작업', exact: true }).click();
    await page.getByTestId(id).click();
  };
  await work('viewer-menu-layers');
  await work('viewer-menu-outline-tool');
  await page.getByRole('button', { name: '도구 닫기', exact: true }).click();
  const bounds = (await page.getByTestId('cad-canvas').locator('canvas').boundingBox())!;
  const range = async () => {
    await page.mouse.move(bounds.x + 10, bounds.y + 10); await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width - 10, bounds.y + bounds.height - 10, { steps: 8 }); await page.mouse.up();
  };
  await range();
  await work('viewer-menu-tools');
  await page.getByRole('button', { name: '볼록 외곽선 미리보기', exact: true }).click();
  await expect(page.getByTestId('outline-preview')).toContainText('Polygon');
  await page.getByRole('button', { name: '임시 확정', exact: true }).click();
  await work('viewer-menu-outline-tool');
  await page.getByTestId('canvas-mode-generated').click();
  await page.getByRole('button', { name: '도구 닫기', exact: true }).click();
  await range();
  await work('viewer-menu-tools');
  await expect(page.getByTestId('canvas-selection-count')).toContainText('생성 1개');
  await page.getByTestId('generated-translate-x').fill('5');
  await page.getByTestId('generated-translate-apply').click();
  await expect(page.getByTestId('generated-undo')).toContainText('(1)');
  const selectionBefore = await page.getByTestId('canvas-selection-count').textContent();
  const undoBefore = await page.getByTestId('generated-undo').textContent();
  const openTypes = async () => {
    await page.getByRole('button', { name: '작업', exact: true }).click();
    await expect(page.getByTestId('viewer-menu-outline-types')).toBeEnabled();
    await page.getByTestId('viewer-menu-outline-types').click();
    await expect(page.getByTestId('outline-type-manager')).toBeVisible();
  };
  await openTypes();
  const manager = page.getByTestId('outline-type-manager');
  await manager.getByLabel('타입 이름 (1~100자)').fill('R2 설비 구역');
  await manager.getByLabel('설명 (최대 500자)').fill('Synthetic equipment area');
  await manager.getByLabel('정렬 순서 (0~9999)').fill('10');
  await manager.getByRole('button', { name: '타입 등록', exact: true }).click();
  await expect(manager.getByRole('status')).toContainText('서버에 저장');
  let row = manager.locator('li[data-type-id]').filter({ hasText: 'R2 설비 구역' });
  await expect(row).toHaveCount(1);
  const typeId = await row.getAttribute('data-type-id');
  await row.getByRole('button', { name: 'R2 설비 구역 비활성화', exact: true }).click();
  await expect(row.getByRole('button', { name: 'R2 설비 구역 복구', exact: true })).toBeVisible();
  const duplicate = await page.request.post('/api/outline-types', { headers,
    data: { name: ' r2 설비 구역 ', sortOrder: 10 } });
  expect(duplicate.status()).toBe(409);
  await row.getByRole('button', { name: 'R2 설비 구역 복구', exact: true }).click();
  await expect(row.getByRole('button', { name: 'R2 설비 구역 비활성화', exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'R2 설비 구역 수정', exact: true }).click();
  const current = await (await page.request.get('/api/outline-types?includeInactive=true')).json();
  const item = current.items.find((value: { id: string }) => value.id === typeId);
  const external = await page.request.patch('/api/outline-types/' + typeId, { headers,
    data: { expectedRevision: item.revision, description: 'Concurrent server edit' } });
  expect(external.status()).toBe(200);
  await manager.getByLabel('타입 이름 (1~100자)').fill('R2 stale browser edit');
  await manager.getByRole('button', { name: '변경 저장', exact: true }).click();
  await expect(manager.getByRole('alert')).toContainText('다른 수정');
  await manager.getByRole('button', { name: '목록 다시 조회', exact: true }).click();
  row = manager.locator(`li[data-type-id="${typeId}"]`);
  await expect(row).toContainText('Concurrent server edit');
  await row.getByRole('button', { name: 'R2 설비 구역 수정', exact: true }).click();
  await manager.getByLabel('타입 이름 (1~100자)').fill('R2 수정 구역');
  await manager.getByRole('button', { name: '변경 저장', exact: true }).click();
  await expect(row).toContainText('R2 수정 구역');
  expect(await canvas!.evaluate(node => node === document.querySelector('[data-testid="cad-canvas"] canvas'))).toBe(true);
  expect(originalGets).toBe(0);
  await work('viewer-menu-tools');
  await expect(manager).toHaveCount(0);
  await expect(page.getByTestId('canvas-selection-count')).toHaveText(selectionBefore!);
  await expect(page.getByTestId('generated-undo')).toHaveText(undoBefore!);
  await openTypes();
  await page.route('**/api/outline-types?*', route => route.fulfill({ status: 503,
    json: { error: { code: 'TYPE_UNAVAILABLE' } } }));
  await manager.getByRole('button', { name: '목록 다시 조회', exact: true }).click();
  await expect(manager.getByRole('alert')).toBeVisible();
  await expect(manager.locator('li[data-type-id]')).toHaveCount(0);
  await expect(manager.getByRole('button', { name: '타입 등록', exact: true })).toBeDisabled();
  await page.unroute('**/api/outline-types?*');
  await manager.getByRole('button', { name: '목록 다시 조회', exact: true }).click();
  await expect(manager.locator(`li[data-type-id="${typeId}"]`)).toContainText('R2 수정 구역');

  for (let n = 0; n < 51; n++) {
    const response = await page.request.post('/api/outline-types', { headers,
      data: { name: 'R2-PAGE-' + String(n).padStart(3, '0'), sortOrder: 20 } });
    expect(response.status()).toBe(201);
  }
  await manager.getByLabel('이름 검색', { exact: true }).fill('R2-PAGE');
  await manager.getByRole('button', { name: '검색', exact: true }).click();
  await expect(manager.locator('li[data-type-id]')).toHaveCount(50);
  await manager.getByRole('button', { name: '다음 타입', exact: true }).click();
  await expect(manager.locator('li[data-type-id]')).toHaveCount(1);
  await manager.getByRole('button', { name: '이전 타입', exact: true }).click();
  await expect(manager.locator('li[data-type-id]')).toHaveCount(50);
  await page.getByTestId('viewer-tools-panel-drag-handle').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('viewer-tools-dock')).toHaveAttribute('data-viewer-panel-mode', 'floating');
  await page.getByTestId('viewer-tools-panel-reset').click();
  await page.getByRole('button', { name: '보기', exact: true }).click();
  await page.getByRole('menuitem', { name: '브라우저 전체 화면', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(page.getByTestId('viewer-tools-dock')).toHaveAttribute('aria-modal', 'true');
  await manager.getByLabel('이름 검색', { exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(manager).toHaveCount(0);
  expect(await canvas!.evaluate(node => node === document.querySelector('[data-testid="cad-canvas"] canvas'))).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '도면', exact: true }).click();
  await page.getByRole('menuitem', { name: '다시 불러오기', exact: true }).click();
  await expect(manager).toHaveCount(0);
  await expect(page.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
  await openTypes();
  await expect(manager.locator(`li[data-type-id="${typeId}"]`)).toContainText('R2 수정 구역');
  expect(originalGets).toBe(0);
  await page.getByRole('button', { name: '보기', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'dxf-viewer', exact: true }).click();
  await expect(page.getByTestId('viewer-active-renderer')).toHaveText('dxf-viewer');
  await expect(manager).toHaveCount(0);
  await page.getByRole('button', { name: '보기', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'three-dxf-viewer', exact: true }).click();
  await expect(page.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
  await expect(manager).toHaveCount(0);
  await openTypes();

  const created = await page.request.post('/api/g7-runtime/users/create', { headers,
    data: { login: 'r2reader', initialPassword: 'synthetic-reader-initial' } });
  expect(created.status()).toBe(201);
  const user = await created.json();
  const grant = await page.request.post('/api/g7-runtime/access/grant', { headers,
    data: { kind: 'role', operation: 'grant', affectedUserId: user.id, value: 'Reader' } });
  expect(grant.status()).toBe(200);
  const reader = await browser.newContext({ baseURL });
  try {
    expect((await reader.request.post('/api/g7-runtime/auth/initial-change', { headers: { origin: baseURL! },
      data: { login: 'r2reader', password: 'synthetic-reader-initial', newPassword: 'synthetic-reader-changed' } })).status()).toBe(200);
    const login = await reader.request.post('/api/g7-runtime/auth/login', { headers: { origin: baseURL! },
      data: { login: 'r2reader', password: 'synthetic-reader-changed' } });
    expect(login.status()).toBe(200);
    const identity = await login.json();
    expect((await reader.request.get('/api/outline-types')).status()).toBe(200);
    expect((await reader.request.get('/api/outline-types?includeInactive=true')).status()).toBe(403);
    expect((await reader.request.post('/api/outline-types', {
      headers: { origin: baseURL!, 'x-csrf-token': identity.csrfToken, 'x-role': 'Admin' },
      data: { name: 'Unauthorized', sortOrder: 0 },
    })).status()).toBe(403);
    const readerPage = await reader.newPage();
    await readerPage.goto(viewerUrl);
    await readerPage.getByRole('button', { name: '작업', exact: true }).click();
    await expect(readerPage.getByTestId('viewer-menu-outline-types')).toBeDisabled();
  } finally { await reader.close(); }
  const logout = await page.request.post('/api/g7-runtime/auth/logout', { headers });
  expect(logout.status()).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(manager.locator('li[data-type-id]')).toHaveCount(0);
  await expect(manager.getByRole('button', { name: '타입 등록', exact: true })).toBeDisabled();
  const loginAgain = await page.request.post('/api/g7-runtime/auth/login', { headers: { origin: baseURL! },
    data: { login: 'admin', password: 'synthetic-changed-password' } });
  expect(loginAgain.status()).toBe(200);
  const restored = await (await page.request.get('/api/outline-types?includeInactive=true')).json();
  const restoredItem = restored.items.find((value: { id: string }) => value.id === typeId);
  expect(restoredItem).toMatchObject({ id: typeId, name: 'R2 수정 구역', createdAt: item.createdAt, createdById: item.createdById });
  const active=await (await page.request.get('/api/g7-runtime/auth/session')).json();
  expect((await page.request.post('/api/g7-runtime/auth/logout',{
    headers:{origin:baseURL!,'x-csrf-token':active.csrfToken},
  })).status()).toBe(200);
});
