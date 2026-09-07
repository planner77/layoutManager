import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const sample = (name: string) => path.join(process.cwd(), 'node_modules/.cache/cad-dwg-samples', name);

test('TC-E2E-002/DWG-001/003: registered DWG uses its own adapter, controls and lifecycle', async ({ page, request }) => {
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
  await page.goto('/cad/upload');
  await page.getByLabel('CAD 파일').setInputFiles(sample('Line.dwg'));
  for (const [label, value] of [['사업부','DWG통합'],['사업장','U7B'],['동','A'],['층','1']]) await page.getByLabel(label,{exact:true}).fill(value);
  const response = page.waitForResponse(r => r.url().endsWith('/api/cad-files') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '도면 등록', exact: true }).click();
  const uploaded = await response; expect(uploaded.status()).toBe(201); const file = await uploaded.json();
  await expect(page.getByRole('status')).toContainText('등록 완료');
  await page.getByRole('link', { name: '목록으로', exact: true }).click();
  await page.getByLabel('파일명', { exact: true }).fill('Line.dwg');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'DWG통합' }); await expect(row).toContainText('Current');
  await row.getByRole('link', { name: '도면 보기', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(page.getByRole('button', { name: 'dxf-viewer', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'three-dxf-viewer', exact: true })).toHaveCount(0);
  let metric = JSON.parse((await page.getByTestId('viewer-metric').textContent())!);
  expect(metric).toMatchObject({ renderer: 'libredwg-web', versionId: file.id, entityCount: 1, result: 'success' });
  const canvas = page.locator('canvas'); const initial = await canvas.screenshot();
  await page.getByRole('button', { name: '확대', exact: true }).click(); expect((await canvas.screenshot()).equals(initial)).toBe(false);
  await page.getByRole('button', { name: '축소', exact: true }).click();
  await page.getByRole('button', { name: '화면 맞춤' }).click(); expect((await canvas.screenshot()).equals(initial)).toBe(true);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down(); await page.mouse.move(box.x+box.width/2+90,box.y+box.height/2+50,{steps:8}); await page.mouse.up();
  expect((await canvas.screenshot()).equals(initial)).toBe(false);
  await page.getByRole('button', { name: '화면 맞춤' }).click(); expect((await canvas.screenshot()).equals(initial)).toBe(true);
  await page.setViewportSize({width:1100,height:800});
  await expect.poll(() => canvas.evaluate(c => Math.abs((c as HTMLCanvasElement).width-c.getBoundingClientRect().width*devicePixelRatio)<2)).toBe(true);
  for (let i=0;i<3;i++) {
    await page.getByRole('button', { name: '다시 불러오기' }).click();
    await expect(page.getByRole('status')).toHaveText('도면 표시 완료'); await expect(canvas).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => (window as unknown as {__dwgWorkers:number}).__dwgWorkers)).toBe(0);
  }
  await page.getByRole('link',{name:'← 버전 목록'}).click(); await expect(canvas).toHaveCount(0);
  // Forged query must not enter either DXF renderer.
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  metric = JSON.parse((await page.getByTestId('viewer-metric').textContent())!); expect(metric.renderer).toBe('libredwg-web');
  expect(await (await request.get(`/api/cad-files/${file.id}/content`)).body()).toEqual(await readFile(sample('Line.dwg')));
  await page.screenshot({path:'dwg-test-results/registered-dwg.png',fullPage:true});
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/libredwg/wasm/libredwg-web.wasm', async route => { await gate; await route.abort(); });
  await page.getByRole('button', {name:'다시 불러오기'}).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as {__dwgWorkers:number}).__dwgWorkers)).toBe(1);
  await page.getByRole('link', {name:'← 버전 목록'}).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as {__dwgWorkers:number}).__dwgWorkers)).toBe(0);
  await expect(canvas).toHaveCount(0); release();
  expect(errors).toEqual([]);
});

test('TC-DWG-002/004: partial coverage, unsupported header, missing file/WASM and retry', async ({ page, request }) => {
  test.setTimeout(120_000);
  const upload = async (name: string, buffer: Buffer) => {
    const response = await request.post('/api/cad-files',{multipart:{file:{name,mimeType:'application/octet-stream',buffer},businessUnit:'DWG오류',site:'7B',building:'A',floor:'1',registeredAt:'2026-09-08',makeCurrent:'false'}});
    expect(response.status()).toBe(201); return response.json();
  };
  const circle = await upload('circle.dwg',await readFile(sample('circle.dwg')));
  await page.goto(`/cad/versions/${circle.id}/viewer`);
  await expect(page.getByRole('status')).toContainText('표시할 도형이 없습니다');
  await expect(page.getByTestId('viewer-coverage')).toContainText('CIRCLE');
  expect(JSON.parse((await page.getByTestId('viewer-metric').textContent())!).result).toBe('partial');
  for (const bytes of ['unsupported', 'AC1032broken']) {
    const file = await upload('broken.dwg',Buffer.from(bytes)); await page.goto(`/cad/versions/${file.id}/viewer`);
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible(); await expect(page.locator('canvas')).toHaveCount(0);
  }
  const line = await upload('line-error.dwg',await readFile(sample('Line.dwg')));
  const content = `**/api/cad-files/${line.id}/content`;
  await page.route(content,route=>route.fulfill({status:404,body:''}));
  await page.goto(`/cad/versions/${line.id}/viewer`); await expect(page.getByRole('main').getByRole('alert')).toContainText('원본 파일을 찾을 수 없습니다');
  await page.unroute(content);
  await page.route('**/libredwg/wasm/libredwg-web.wasm',route=>route.fulfill({status:404,body:''}));
  await page.getByRole('button',{name:'다시 불러오기'}).click(); await expect(page.getByRole('main').getByRole('alert')).toContainText('WASM 초기화 실패');
  await page.unroute('**/libredwg/wasm/libredwg-web.wasm');
  await page.getByRole('button',{name:'다시 불러오기'}).click(); await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
});
