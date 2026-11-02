import { clickViewerCommand, clickViewerTestCommand, openViewerMenu } from './viewer-menu-helper';
import {test,expect,type Page} from '@playwright/test';
import {masterFields} from './master-helper';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const drawing=[
 '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
 '0','SECTION','2','ENTITIES',
 '0','LWPOLYLINE','5','1A','8','0','90','4','70','1',
 '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
 '0','ENDSEC','0','EOF','',
].join('\n');

/**
 * Clicks in the extended U5 tools dock can scroll the NORMAL (non-immersive)
 * document and leave the canvas with a negative viewport Y coordinate.
 * Playwright's page.mouse works in viewport coordinates, so an offscreen
 * pointerdown never reaches SelectionController (CI #40157734271).
 * Reposition before each real drag, keeping the original hit-test assertion.
 */
async function selectFullCanvas(page: Page) {
  // Legacy canonical/Handle regression explicitly uses the exact-source mode.
  await page.getByTestId('outline-basis').selectOption('source');
  const canvas = page.getByTestId('cad-canvas').locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeInViewport({ ratio: 1 });
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const { x, y, width, height } = box!;
  expect(width).toBeGreaterThan(10);
  expect(height).toBeGreaterThan(10);
  await page.mouse.move(x + 5, y + 5);
  await page.mouse.down();
  await page.mouse.move(x + width - 5, y + height - 5, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
}
test('TC-OUT-E2E-001: selection and convex/precise preview, non-destructive JSON export',async({page,request})=>{
 const created=await request.post('/api/cad-files',{multipart:{
   file:{name:'issue31-outline-square.dxf',mimeType:'application/octet-stream',buffer:Buffer.from(drawing)},
   ...(await masterFields(request,{businessUnit:'Issue31',site:'outline',building:'A',floor:'1'})),
   registeredAt:'2026-10-16',makeCurrent:'true',deletePassword:'1234',
 }});
 expect(created.status()).toBe(201);
 const file=await created.json();
 await page.goto('/cad/versions/'+file.id+'/viewer?renderer=three-dxf-viewer');
 await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
 await clickViewerCommand(page, 'view', '전체 화면 종료');
 const outlineToggle=page.getByTestId('viewer-menu-outline-tool');
 await openViewerMenu(page, 'work');
 await expect(outlineToggle).toHaveAttribute('aria-checked','false');
 await clickViewerTestCommand(page, 'viewer-menu-outline-tool');
 await openViewerMenu(page, 'work');
 await expect(outlineToggle).toHaveAttribute('aria-checked','true');
 const tools=page.getByTestId('cad-outline-tools');
 await expect(tools).toBeVisible();
 await expect(page.getByTestId('outline-render-mapping')).toContainText('매핑 제외 0개');
 await tools.getByRole('button',{name:'선택 모드'}).click();
 // Left-to-right window contains the entire fitted 2D square.
 await selectFullCanvas(page);
 await tools.getByRole('button',{name:'볼록 외곽선 미리보기'}).click();
 await expect(page.getByTestId('outline-preview')).toContainText('볼록 경계');
 await tools.getByRole('button',{name:'임시 확정'}).click();
 const download=page.waitForEvent('download');
 await tools.getByRole('button',{name:/JSON 내보내기/}).click();
 const fileDownload=await download;
 expect(fileDownload.suggestedFilename()).toMatch(/cad-outlines-/);
 await tools.getByRole('button',{name:'정밀 외곽선 미리보기'}).click();
 await expect(page.getByTestId('outline-preview')).toContainText('실제 폐곡선 Union');
 // The old selection's result must become unconfirmable synchronously.
 await tools.getByRole('button',{name:'선택 해제'}).click();
 await expect(tools.getByRole('button',{name:'임시 확정'})).toBeDisabled();
 // Regression: the toolbar can scroll the page; scroll the canvas into view
 // before the SECOND real drag, not only the first one.
 await selectFullCanvas(page);
 await tools.getByRole('button',{name:'정밀 외곽선 미리보기'}).click();
 await expect(page.getByTestId('outline-preview')).toContainText('실제 폐곡선 Union');
 // Verify the PRODUCTION-bundled Web Worker really ran polygon-clipping,
 // instead of accepting a static preview label or a webpack warning.
 await tools.getByRole('button',{name:'임시 확정'}).click();
 const preciseDownload=page.waitForEvent('download');
 await tools.getByRole('button',{name:/JSON 내보내기/}).click();
 const downloaded=await preciseDownload;
 const exported=JSON.parse(await readFile(await downloaded.path(),'utf8'));
 expect(exported.sourceSha256).toBe(createHash('sha256').update(drawing).digest('hex'));
 expect(exported.outlines).toHaveLength(2);
 const result=exported.outlines[1].result;
 expect(result.kind).toBe('PRECISE');
 expect(result.algorithm).toBe('polygon-clipping-union-v1');
 expect(result.persistable).toBe(true);
 expect(result.geometry.type).toBe('Polygon');
 expect(result.sourceEntityIds).toEqual([file.id+':'+exported.sourceSha256+':1A']);
 const ring:number[][]=result.geometry.coordinates[0];
 expect(ring[0]).toEqual(ring[ring.length-1]);
 const polygonArea=Math.abs(ring.slice(0,-1).reduce((sum,p,i)=>{
   const next=ring[i+1];
   return sum+p[0]*next[1]-next[0]*p[1];
 },0)/2);
 expect(polygonArea).toBeCloseTo(10000,2);
 await clickViewerCommand(page, 'view', '전체 화면');
 await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen','true');
 await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
 await clickViewerCommand(page, 'view', '전체 화면 종료');
 // Force CSS fallback and verify Escape prioritizes selection before fullscreen.
 await page.getByTestId('cad-viewer-shell').evaluate(shell=>{
   Object.defineProperty(shell,'requestFullscreen',{configurable:true,
      value:()=>Promise.reject(new Error('test CSS fallback'))});
 });
 await clickViewerCommand(page, 'view', '전체 화면');
 await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen','true');
 // P1 review regression: while search toggle (button) is focused, SelectionController
 // consumes the first Escape during capture. Search must remain open until next Escape.
 await clickViewerCommand(page, 'work', '도면 내 텍스트 검색');
 await expect(page.getByTestId('cad-text-search')).toBeVisible();
 await expect(page.locator('[data-viewer-group="work"]')).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(page.getByTestId('outline-selection-count')).toContainText('선택 0개');
 await expect(page.getByTestId('cad-text-search')).toBeVisible();
 await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen','true');
 await page.keyboard.press('Escape');
 await expect(page.getByTestId('cad-text-search')).toHaveCount(0);
 await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen','true');
 await page.keyboard.press('Escape');
 await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen','false');
 await tools.getByRole('button',{name:'탐색 모드'}).click();
 page.once('dialog', async dialog => { expect(dialog.message()).toContain('선택 상태가 사라집니다'); await dialog.accept(); });
 await clickViewerCommand(page, 'drawing', '다시 불러오기');
 await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
 // U3 reload resets the tool to OFF; selection controls do not exist until ON.
 await openViewerMenu(page, 'work');
 await expect(outlineToggle).toHaveAttribute('aria-checked','false');
 await expect(tools).toHaveCount(0);
 await clickViewerTestCommand(page, 'viewer-menu-outline-tool');
 await openViewerMenu(page, 'work');
 await expect(outlineToggle).toHaveAttribute('aria-checked','true');
 await expect(page.getByTestId('outline-selection-count')).toContainText('선택 0개');
});

// Codex P2: selected SOURCE basis must not strand the OFF outline tool
// when SceneWork invalidates original-source geometry after general selection.
test('TC-S5-E2E-009: reopen outline in render mode after source basis becomes stale',async({page,request})=>{
 const created=await request.post('/api/cad-files',{multipart:{
   file:{name:'issue166-stale-source-basis.dxf',mimeType:'application/octet-stream',buffer:Buffer.from(drawing)},
   ...(await masterFields(request,{businessUnit:'S5 source-to-render',site:'outline',building:'A',floor:'1'})),
   registeredAt:'2026-10-30',makeCurrent:'true',deletePassword:'1234',
 }});
 expect(created.status()).toBe(201);const file=await created.json();
 await page.goto('/cad/versions/'+file.id+'/viewer?renderer=three-dxf-viewer');
 await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
 await clickViewerCommand(page,'view','전체 화면 종료');
 await clickViewerTestCommand(page,'viewer-menu-outline-tool');
 const basis=page.getByTestId('outline-basis');
 await expect(basis.locator('option[value="source"]')).toBeEnabled();
 await basis.selectOption('source');
 await page.getByTestId('canvas-mode-objects').click();
 await expect(page.getByTestId('cad-outline-tools')).toHaveCount(0);
 const canvas=page.getByTestId('cad-canvas').locator('canvas');
 await canvas.scrollIntoViewIfNeeded();
 const box=(await canvas.boundingBox())!;
 await page.mouse.move(box.x+5,box.y+5);await page.mouse.down();
 await page.mouse.move(box.x+box.width-5,box.y+box.height-5,{steps:8});await page.mouse.up();
 await expect(page.getByTestId('canvas-selection-count')).toContainText('선택 1개');
 await page.locator('#scene-work-dx').fill('5');
 await page.getByTestId('scene-work-translate').click();
 await expect(page.getByTestId('scene-work-undo')).toContainText('(1)');
 await clickViewerTestCommand(page,'viewer-menu-outline-tool');
 await expect(page.getByTestId('cad-outline-tools')).toBeVisible();
 await expect(basis).toHaveValue('render');
 await expect(page.getByTestId('outline-tool-notice')).toContainText('렌더 형상 기준');
 await expect(page.getByTestId('exact-source-unavailable')).toBeVisible();
 await openViewerMenu(page,'work');
 await expect(page.getByTestId('viewer-menu-outline-tool')).toHaveAttribute('aria-checked','true');
});
