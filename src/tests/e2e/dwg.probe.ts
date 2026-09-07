import { test, expect } from '@playwright/test';
import path from 'node:path';
const sample = (name: string) => path.join(process.cwd(), 'node_modules/.cache/cad-dwg-samples', name);

test('TC-DWG-001/003/005: real DWG LINE, repeat free/unlink, direct drawing and worker termination', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    let active = 0;
    Object.defineProperty(window, '__dwgWorkers', { get: () => active });
    const Original = Worker;
    window.Worker = class extends Original {
      private stopped = false;
      constructor(url: string | URL, options?: WorkerOptions) { super(url, options); active++; }
      terminate() { if (!this.stopped) { this.stopped = true; active--; } super.terminate(); }
    };
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const wasm = page.waitForResponse(r => r.url().endsWith('libredwg-web.wasm'));
  await page.goto('/lab/dwg');
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByLabel('실험 DWG 파일').setInputFiles([]);
    await page.getByLabel('실험 DWG 파일').setInputFiles(sample('Line.dwg'));
    await expect(page.getByRole('status')).toHaveText('LINE 표시 완료 (실험)', { timeout: 60_000 });
    const result = JSON.parse((await page.getByTestId('dwg-probe-result').textContent())!);
    expect(result).toMatchObject({ entityCount: 1, lineCount: 1, skipped: {}, freed: true, temporaryFileRemoved: true });
    for (const key of ['initMs', 'parseMs', 'convertMs']) expect(result[key]).toBeGreaterThanOrEqual(0);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __dwgWorkers: number }).__dwgWorkers)).toBe(0);
    const canvas = page.locator('canvas'); await expect(canvas).toHaveCount(1);
    const before = await canvas.screenshot();
    await page.getByRole('button', { name: '확대', exact: true }).click();
    expect((await canvas.screenshot()).equals(before)).toBe(false);
  }
  const asset = await wasm; expect(asset.status()).toBe(200); expect(asset.headers()['content-type']).toContain('application/wasm');
  await page.screenshot({ path: 'dwg-test-results/dwg-line-probe.png', fullPage: true });
  await page.getByRole('button', { name: '해제', exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('TC-DWG-002/004: unsupported CIRCLE, damaged DWG and missing WASM stay explicit', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/lab/dwg');
  await page.getByLabel('실험 DWG 파일').setInputFiles(sample('circle.dwg'));
  await expect(page.getByRole('status')).toHaveText('표시 가능한 LINE이 없습니다.', { timeout: 60_000 });
  const result = JSON.parse((await page.getByTestId('dwg-probe-result').textContent())!);
  expect(result.lineCount).toBe(0); expect(result.skipped.CIRCLE).toBeGreaterThan(0); expect(result.freed).toBe(true);
  await page.getByLabel('실험 DWG 파일').setInputFiles({ name: 'broken.dwg', mimeType: 'application/octet-stream', buffer: Buffer.from('AC1015broken') });
  await expect(page.getByRole('status')).toContainText('실패', { timeout: 60_000 });
  await expect(page.getByTestId('dwg-probe-result')).toHaveCount(0);
  await page.route('**/libredwg/wasm/libredwg-web.wasm', route => route.fulfill({ status: 404, body: '' }));
  await page.getByLabel('실험 DWG 파일').setInputFiles(sample('Line.dwg'));
  await expect(page.getByRole('status')).toContainText('WASM 초기화 실패', { timeout: 60_000 });
  await expect(page.locator('canvas')).toHaveCount(0);
});
