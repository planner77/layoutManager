import { test, expect } from '@playwright/test';

test('TC-E2E-001: UI registration through current replacement and both DXF renderers', async ({ page, request }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const drawing = Buffer.from('0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n100\n0\nCIRCLE\n8\n0\n10\n50\n20\n50\n40\n25\n0\nENDSEC\n0\nEOF\n');
  const files: { id: string; locationId: string }[] = [];
  await page.goto('/');
  for (const version of [1, 2]) {
    await page.getByRole('navigation').getByRole('link', { name: '파일 등록', exact: true }).click();
    await page.getByLabel('CAD 파일').setInputFiles({ name: `release-v${version}.dxf`, mimeType: 'application/octet-stream', buffer: drawing });
    for (const [label, value] of [['사업부', '통합검증'], ['사업장', 'DXF릴리스'], ['동', 'A동'], ['층', '2층']]) {
      await page.getByLabel(label, { exact: true }).fill(value);
    }
    await page.getByLabel('등록일', { exact: true }).fill('2026-09-08');
    const response = page.waitForResponse(r => r.url().endsWith('/api/cad-files') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '도면 등록', exact: true }).click();
    const uploaded = await response;
    expect(uploaded.status()).toBe(201);
    files.push(await uploaded.json());
    await expect(page.getByRole('status')).toContainText(`V${version} 등록 완료`);
    await page.getByRole('link', { name: '목록으로', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: `release-v${version}.dxf` })).toContainText('Current');
  }
  expect(files[0].locationId).toBe(files[1].locationId);
  await page.getByLabel('파일명', { exact: true }).fill('release-v');
  await page.getByRole('combobox', { name: '사업장', exact: true }).selectOption('DXF릴리스');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'release-v1.dxf' })).toContainText('이전 버전');
  await page.getByRole('link', { name: 'release-v1.dxf', exact: true }).click();
  await page.getByRole('row').filter({ hasText: 'release-v1.dxf' }).getByRole('button', { name: 'Current 지정' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'release-v1.dxf' })).toContainText('● Current');
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: 'release-v2.dxf' })).toContainText('이전 버전');
  const current = await request.get('/api/cad-files?site=DXF릴리스&current=true');
  const listed = await current.json();
  expect(listed.total).toBe(1);
  expect(listed.items[0].id).toBe(files[0].id);
  const detail = await request.get(`/api/cad-locations/${files[0].locationId}`);
  const versions = (await detail.json()).versions;
  expect(versions.filter((v: { isCurrent: boolean }) => v.isCurrent).map((v: { id: string }) => v.id)).toEqual([files[0].id]);
  await page.getByRole('row').filter({ hasText: 'release-v1.dxf' }).getByRole('link', { name: '도면 보기', exact: true }).click();
  for (const renderer of ['dxf-viewer', 'three-dxf-viewer']) {
    if (renderer === 'three-dxf-viewer') await page.getByRole('button', { name: renderer, exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
    const metric = JSON.parse((await page.getByTestId('viewer-metric').textContent())!);
    expect(metric.versionId).toBe(files[0].id);
    expect(metric.renderer).toBe(renderer);
    expect(metric.fileBytes).toBe(drawing.length);
    // Visible geometry must change on zoom, not just mount an empty canvas.
    const canvas = page.locator('canvas');
    await expect(canvas).toHaveCount(1);
    const before = await canvas.screenshot();
    await page.getByRole('button', { name: '확대', exact: true }).click();
    expect((await canvas.screenshot()).equals(before)).toBe(false);
    await page.getByRole('button', { name: '화면 맞춤' }).click();
  }
  const original = await request.get(`/api/cad-files/${files[0].id}/content`);
  expect(original.status()).toBe(200);
  expect(await original.body()).toEqual(drawing);
  await page.screenshot({ path: 'test-results/release-workflow.png', fullPage: true });
  expect(errors).toEqual([]);
});
