import { test, expect } from '@playwright/test';
import { masterFields } from './master-helper';

function fixture() {
  let entities = '';
  for (const [i, x] of [0, 1800, 3600].entries()) {
    entities += '0\nTEXT\n5\nT' + i + '\n8\nFIND\n10\n' + x +
      '\n20\n100\n40\n20\n1\n장비 ABC 123\n';
    entities += '0\nCIRCLE\n8\nFIND\n10\n' + (x + 60) + '\n20\n60\n40\n' + (12 + i * 18) + '\n';
  }
  entities += '0\nMTEXT\n8\nFIND\n10\n100\n20\n400\n40\n15\n1\n검사\\P구역 45\n';
  return '0\nSECTION\n2\nENTITIES\n' + entities + '0\nENDSEC\n0\nEOF\n';
}

for (const renderer of ['dxf-viewer', 'three-dxf-viewer'] as const) {
  test('TC-TEXT-E2E-001: ' + renderer + ' search, pan and zoom across distinct text positions and renderer re-entry', async ({ page, request }) => {
    const response = await request.post('/api/cad-files', {
      multipart: {
        file: { name: 'text-search-' + renderer + '.dxf', mimeType: 'application/octet-stream', buffer: Buffer.from(fixture()) },
        ...(await masterFields(request, { businessUnit: 'Search-' + renderer, site: 'site', building: 'A', floor: '3' })),
        registeredAt: '2026-10-16', makeCurrent: 'false', deletePassword: '1234',
      },
    });
    expect(response.status()).toBe(201);
    const file = await response.json();
    let downloads = 0;
    await page.route('**/api/cad-files/*/content', route => { downloads++; return route.continue(); });
    await page.goto('/cad/versions/' + file.id + '/viewer?renderer=' + renderer);
    await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
    const canvas = page.locator('canvas');
    await page.getByRole('button', { name: '도면 내 텍스트 검색' }).click();
    const panel = page.getByTestId('cad-text-search');
    const search = page.getByRole('searchbox', { name: '도면 텍스트 검색어' });
    await search.fill('abc 123');
    await expect(panel.getByText('검색 결과 3개')).toBeVisible();
    await expect(panel.getByRole('listitem')).toHaveCount(3);
    await panel.getByRole('button', { name: '다음 결과' }).click();
    const first = await canvas.screenshot();
    await panel.getByRole('button', { name: '다음 결과' }).click();
    const second = await canvas.screenshot();
    await panel.getByRole('button', { name: '다음 결과' }).click();
    const third = await canvas.screenshot();
    expect(first.equals(second)).toBe(false);
    expect(second.equals(third)).toBe(false);
    await search.fill('검사 구역 45');
    await expect(panel.getByText('검색 결과 1개')).toBeVisible();
    await panel.getByRole('button', { name: '다음 결과' }).click();
    expect((await canvas.screenshot()).equals(third)).toBe(false);
    expect(downloads).toBe(1);

    await page.getByRole('button', { name: '전체 화면', exact: true }).click();
    await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen', 'true');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: '이전 결과' }).click();
    await page.getByRole('button', { name: '전체 화면 종료' }).click();
    await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen', 'false');

    const other = renderer === 'dxf-viewer' ? 'three-dxf-viewer' : 'dxf-viewer';
    await page.getByRole('button', { name: other, exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
    await expect(page.getByTestId('cad-text-search')).toHaveCount(0);
    await page.getByRole('button', { name: '도면 내 텍스트 검색' }).click();
    await page.getByRole('searchbox', { name: '도면 텍스트 검색어' }).fill('abc');
    await expect(page.getByTestId('cad-text-search').getByText('검색 결과 3개')).toBeVisible();
    expect(downloads).toBe(1);
  });
}
