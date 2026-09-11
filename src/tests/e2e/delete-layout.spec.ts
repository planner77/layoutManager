import { expect, test } from '@playwright/test';

const drawing = Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n');

async function register(request: import('@playwright/test').APIRequestContext, suffix: string) {
  const long = (label: string) => `${label}-${'가나다라마바사아자차카타파하'.repeat(6)}`;
  const filename = `delete-layout-${'filenamewithoutbreak'.repeat(8)}-${suffix}.dxf`;
  const response = await request.post('/api/cad-files', { multipart: {
    file: { name: filename, mimeType: 'application/octet-stream', buffer: drawing },
    businessUnit: long(`사업부-${suffix}`), site: long('사업장'), building: long('건물'), floor: long('층'),
    registeredAt: '2026-09-11', makeCurrent: 'true', deletePassword: '1234',
  }});
  expect(response.status()).toBe(201);
  const body = await response.json() as { id: string; locationId: string };
  return { ...body, filename };
}

async function expectContainedGeometry(dialog: import('@playwright/test').Locator) {
  const overflow = await dialog.evaluate(element => {
    const boundary = element.getBoundingClientRect();
    return [...element.querySelectorAll('*')].some(child => {
      const box = child.getBoundingClientRect();
      return box.left < boundary.left - 1 || box.right > boundary.right + 1;
    });
  });
  expect(overflow).toBe(false);
}

test('TC-DELETE-LAYOUT-001: dialog is portaled outside the nowrap table and long text wraps within the viewport', async ({ page, request }) => {
  const target = await register(request, 'desktop');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const row = page.getByRole('row').filter({ hasText: target.filename });
  const trigger = row.getByRole('button', { name: '삭제', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');

  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element.parentElement === document.body)).toBe(true);
  expect(await dialog.evaluate(element => getComputedStyle(element).whiteSpace)).toBe('normal');
  expect(await dialog.evaluate(element => getComputedStyle(element).overflowWrap)).toBe('anywhere');
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1280);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expectContainedGeometry(dialog);
});

test('TC-DELETE-LAYOUT-002: small viewport keeps all controls reachable with internal scrolling', async ({ page, request }) => {
  const target = await register(request, 'responsive');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`/cad/locations/${target.locationId}`);
  const row = page.getByRole('row').filter({ hasText: target.filename });
  await row.getByRole('button', { name: '삭제', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const box = await dialog.boundingBox();

  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  expect(box!.y + box!.height).toBeLessThanOrEqual(667);
  expect(await dialog.evaluate(element => getComputedStyle(element).overflowY)).toBe('auto');
  await expectContainedGeometry(dialog);
  await page.setViewportSize({ width: 375, height: 260 });
  await expect.poll(() => dialog.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await dialog.getByRole('button', { name: '삭제 확인', exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByLabel('삭제 비밀번호', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '삭제 확인', exact: true })).toBeVisible();
});

test('TC-DELETE-LAYOUT-003: focus is trapped and restored, close clears password, and busy state cannot dismiss', async ({ page, request }) => {
  const target = await register(request, 'focus');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`/cad/locations/${target.locationId}`);
  const row = page.getByRole('row').filter({ hasText: target.filename });
  const trigger = row.getByRole('button', { name: '삭제', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  const password = dialog.getByLabel('삭제 비밀번호', { exact: true });
  await expect(password).toBeFocused();
  await password.fill('1234');
  for (let index = 0; index < 6; index += 1) await page.keyboard.press('Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(password).toHaveValue('');
  await password.fill('1234');
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>(resolve => { releaseResponse = resolve; });
  await page.route(`**/api/cad-files/${target.id}`, async route => {
    await responseGate;
    await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INVALID_DELETE_PASSWORD' } }) });
  });
  await dialog.getByRole('button', { name: '삭제 확인', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '삭제 중…', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(dialog).toBeVisible();
  releaseResponse();
  await expect(dialog.getByRole('alert')).toContainText('삭제 비밀번호가 올바르지 않습니다.');
  await expectContainedGeometry(dialog);
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(password).toHaveValue('');

  await page.unroute(`**/api/cad-files/${target.id}`);
  await page.route(`**/api/cad-files/${target.id}`, route => route.fulfill({
    status: 202,
    contentType: 'application/json',
    body: JSON.stringify({ deleted: true, cleanupPending: true }),
  }));
  await password.fill('1234');
  await dialog.getByRole('button', { name: '삭제 확인', exact: true }).click();
  const acknowledge = dialog.getByRole('button', { name: '확인', exact: true });
  await expect(acknowledge).toBeFocused();
  await expectContainedGeometry(dialog);
  await page.keyboard.press('Escape');
  await page.mouse.click(2, 2);
  await expect(dialog).toBeVisible();
  await acknowledge.click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
