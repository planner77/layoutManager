import { clickViewerCommand } from './viewer-menu-helper';
import { test, expect } from '@playwright/test';
import { masterFields } from './master-helper';
import { createTextSearchDxf } from '../fixtures/text-search-dxf';

for (const renderer of ['dxf-viewer', 'three-dxf-viewer'] as const) {
  test('TC-TEXT-E2E-001: ' + renderer + ' search, pan and zoom across distinct text positions and renderer re-entry', async ({ page, request }) => {
    const response = await request.post('/api/cad-files', {
      multipart: {
        file: { name: 'text-search-' + renderer + '.dxf', mimeType: 'application/octet-stream', buffer: Buffer.from(createTextSearchDxf()) },
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
    await clickViewerCommand(page, 'view', '전체 화면 종료');
    const canvas = page.locator('canvas');
    await clickViewerCommand(page, 'work', '도면 내 텍스트 검색');
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

    await clickViewerCommand(page, 'view', '전체 화면');
    await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen', 'true');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: '이전 결과' }).click();
    await clickViewerCommand(page, 'view', '전체 화면 종료');
    await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen', 'false');

    const other = renderer === 'dxf-viewer' ? 'three-dxf-viewer' : 'dxf-viewer';
    await clickViewerCommand(page, 'view', other);
    await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
    await expect(page.getByTestId('cad-text-search')).toHaveCount(0);
    await clickViewerCommand(page, 'work', '도면 내 텍스트 검색');
    await page.getByRole('searchbox', { name: '도면 텍스트 검색어' }).fill('abc');
    await expect(page.getByTestId('cad-text-search').getByText('검색 결과 3개')).toBeVisible();
    expect(downloads).toBe(1);
  });
}
