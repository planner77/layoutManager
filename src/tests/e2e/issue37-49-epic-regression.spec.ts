import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { masterFields } from './master-helper';
import { clickViewerTestCommand, openViewerMenu } from './viewer-menu-helper';

const dxf = Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES',
  '0','LWPOLYLINE','5','A1','8','EQUIP','90','4','70','1',
  '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
  '0','ENDSEC','0','EOF','',
].join('\n'));

test('TC-EPIC-37-49-E2E-001: app docks, generated edit, mixed SOURCE gate and CAD bytes remain independent', async ({ page, request }) => {
  const uploaded = await request.post('/api/cad-files', { multipart: {
    file: { name: 'epic-37-49.dxf', mimeType: 'application/octet-stream', buffer: dxf },
    ...(await masterFields(request, { businessUnit: 'Epic37-49', site: 'combined', building: 'A', floor: '1' })),
    registeredAt: '2026-11-01', makeCurrent: 'true', deletePassword: '1234',
  } });
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  const file = await uploaded.json() as { id: string };
  const sourcePath = '/api/cad-files/' + file.id + '/content';
  const sourceBefore = await request.get(sourcePath);
  expect(sourceBefore.status()).toBe(200);
  const shaBefore = createHash('sha256').update(await sourceBefore.body()).digest('hex');
  let viewerLoads = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === sourcePath) viewerLoads++; });

  await page.goto('/cad/versions/' + file.id + '/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  const canvas = page.getByTestId('cad-canvas').locator('canvas');
  await canvas.evaluate(element => element.setAttribute('data-epic-stable', 'true'));
  await clickViewerTestCommand(page, 'viewer-menu-outline-tool');
  await page.getByTestId('outline-basis').selectOption('source');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + 5, bounds!.y + 5);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width - 5, bounds!.y + bounds!.height - 5, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
  const tools = page.getByTestId('cad-outline-tools');
  await tools.getByRole('button', { name: '볼록 외곽선 미리보기' }).click();
  await expect(page.getByTestId('outline-preview')).toBeVisible();
  await tools.getByRole('button', { name: '임시 확정' }).click();
  await clickViewerTestCommand(page, 'viewer-menu-outline-tool');
  await page.getByTestId('canvas-mode-generated').click();
  await clickViewerTestCommand(page, 'viewer-menu-outline-tree');
  const tree = page.getByTestId('viewer-outline-tree');
  const row = tree.getByTestId('outline-tree-item').first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByTestId('canvas-selection-count')).toContainText('생성 1개');

  const layer = page.getByRole('complementary', { name: '전체 화면 레이어' })
    .getByRole('checkbox', { name: 'EQUIP' });
  await layer.uncheck();
  await expect(row).toBeVisible();
  await layer.check();
  await clickViewerTestCommand(page, 'viewer-menu-layers');
  await expect(page.getByTestId('viewer-layer-dock')).toHaveCount(0);
  await expect(row).toBeVisible();
  await expect(canvas).toHaveAttribute('data-epic-stable', 'true');

  await page.getByTestId('generated-rotate-angle').fill('90');
  await page.getByTestId('generated-rotate-apply').click();
  await expect(page.getByTestId('generated-undo')).toContainText('(1)');
  const download = page.waitForEvent('download');
  const menu = await openViewerMenu(page, 'drawing');
  await menu.getByTestId('viewer-menu-generated-export').click();
  const exported = JSON.parse(await readFile(await (await download).path(), 'utf8')) as {
    format: string; objects: Array<{ transformOperations: unknown[] }>;
  };
  expect(exported.format).toBe('cad-generated-objects');
  expect(exported.objects).toHaveLength(1);
  expect(exported.objects[0].transformOperations).toHaveLength(1);
  await page.getByTestId('generated-undo').click();
  await expect(page.getByTestId('generated-redo')).toContainText('(1)');
  await page.getByTestId('generated-redo').click();

  await page.getByTestId('canvas-mode-objects').click();
  const secondBounds = await canvas.boundingBox();
  expect(secondBounds).not.toBeNull();
  await page.mouse.move(secondBounds!.x + 5, secondBounds!.y + 5);
  await page.mouse.down();
  await page.mouse.move(secondBounds!.x + secondBounds!.width - 5, secondBounds!.y + secondBounds!.height - 5, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('canvas-selection-count')).toContainText('원본 1개');
  await expect(page.getByTestId('generated-delete-selected')).toBeDisabled();
  await expect(page.getByTestId('canvas-edit-gate')).toContainText('읽기 전용');
  await expect(canvas).toHaveAttribute('data-epic-stable', 'true');
  expect(viewerLoads).toBe(1);
  const sourceAfter = await request.get(sourcePath);
  expect(sourceAfter.status()).toBe(200);
  expect(createHash('sha256').update(await sourceAfter.body()).digest('hex')).toBe(shaBefore);
});
