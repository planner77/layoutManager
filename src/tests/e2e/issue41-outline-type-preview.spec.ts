import { expect, test } from '@playwright/test';

test('TC-U4-E2E-PREVIEW-001: isolated type draft CRUD, duplicate/soft-delete/revision, reload loses state', async ({ page }) => {
  let managementRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/outline-types')) managementRequests++;
  });

  await page.goto('/lab/outline-types');
  const preview = page.getByTestId('outline-type-prototype');
  await expect(preview).toHaveAttribute('data-persistence', 'none');
  await expect(page.getByText('설계 검증용 시안 — 운영 관리 기능 아님')).toBeVisible();
  await expect(page.getByTestId('outline-type-row')).toHaveCount(0);

  await page.getByTestId('outline-type-name').fill('  WIP  ');
  await page.getByTestId('outline-type-sort').fill('5');
  await page.getByTestId('outline-type-description').fill(' 임시 작업 구역 ');
  await page.getByRole('button', { name: '시안 추가' }).click();
  await expect(page.getByTestId('outline-type-row')).toHaveCount(1);
  await expect(page.getByTestId('outline-type-row')).toContainText('WIP');
  await expect(page.getByTestId('outline-type-row')).toContainText('임시 작업 구역');
  await expect(page.getByTestId('outline-type-row')).toContainText('rev 1');

  await page.getByTestId('outline-type-name').fill('wip');
  await page.getByRole('button', { name: '시안 추가' }).click();
  await expect(preview.getByRole('alert')).toContainText('같은 이름');
  await expect(page.getByTestId('outline-type-row')).toHaveCount(1);

  await page.getByRole('button', { name: 'WIP 수정' }).click();
  await page.getByTestId('outline-type-name').fill('설비');
  await page.getByRole('button', { name: '시안 수정' }).click();
  await expect(page.getByTestId('outline-type-row')).toContainText('설비');
  await expect(page.getByTestId('outline-type-row')).toContainText('rev 2');
  await page.getByRole('button', { name: '설비 비활성화' }).click();
  await expect(page.getByTestId('outline-type-row')).toContainText('비활성');
  await page.getByRole('button', { name: '설비 복구' }).click();
  await expect(page.getByTestId('outline-type-row')).toContainText('활성');
  expect(managementRequests).toBe(0);
  await page.reload();
  await expect(page.getByTestId('outline-type-row')).toHaveCount(0);
});

test('TC-U4-E2E-GATE-002: production management routes are absent before Owner RBAC approval', async ({ request }) => {
  const list = await request.get('/api/outline-types');
  expect(list.status()).toBe(404);
  const create = await request.post('/api/outline-types', { data: { name: 'bypass', active: true } });
  expect(create.status()).toBe(404);
  const mutate = await request.patch('/api/outline-types/11111111-1111-4111-8111-111111111111', {
    headers: { 'X-User': 'admin', 'X-Role': 'Admin' },
    data: { name: 'bypass', deletePassword: '1234' },
  });
  expect(mutate.status()).toBe(404);
});


test('TC-U4-E2E-HTTP-003: prototype creation works without crypto.randomUUID (insecure HTTP simulation)', async ({ page }) => {
  // Same browser method removal used by TC-ISSUE14-001; getRandomValues remains available.
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto('/lab/outline-types');
  expect(await page.evaluate(() => typeof globalThis.crypto.randomUUID)).toBe('undefined');
  expect(await page.evaluate(() => typeof globalThis.crypto.getRandomValues)).toBe('function');

  await page.getByTestId('outline-type-name').fill('현장 구역');
  await page.getByRole('button', { name: '시안 추가' }).click();
  const row = page.getByTestId('outline-type-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('현장 구역');
  await expect(row).toContainText('rev 1');
  await expect(page.getByRole('status').filter({ hasText: '서버에는 저장되지 않았습니다.' })).toBeVisible();
  await expect(page.getByTestId('outline-type-prototype').getByRole('alert')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('outline-type-row')).toHaveCount(0);
});
