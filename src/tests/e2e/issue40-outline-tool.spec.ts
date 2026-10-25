import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { masterFields } from './master-helper';

// Portable LWPOLYLINE: DXF group 90 must state the four vertex (10/20) pairs.
// Missing group 90 let three-dxf-viewer render this but crashed dxf-viewer's parser.
const square = Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES',
  '0','LWPOLYLINE','5','1A','8','EQUIP','90','4','70','1',
  '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
  '0','ENDSEC','0','EOF','',
].join('\n'));

async function createDrawing(request: APIRequestContext, name: string, data = square) {
  const created = await request.post('/api/cad-files', { multipart: {
    file: { name: name + '.dxf', mimeType: 'application/octet-stream', buffer: data },
    ...(await masterFields(request, { businessUnit: name, site: 'outline-toggle', building: 'A', floor: '1' })),
    registeredAt: '2026-10-25', makeCurrent: 'true', deletePassword: '1234',
  } });
  expect(created.status()).toBe(201);
  return (await created.json()) as { id: string };
}

async function selectSquare(page: Page) {
  const canvas = page.getByTestId('cad-canvas').locator('canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
}

test('TC-U3-E2E-001: ON enables selection; OFF clears draft but preserves confirmed overlay/export', async ({ page, request }) => {
  const file = await createDrawing(request, 'issue40-session');
  let contentRequests = 0;
  page.on('request', req => {
    if (new URL(req.url()).pathname === `/api/cad-files/${file.id}/content`) contentRequests++;
  });
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  const toggle = page.getByTestId('viewer-menu-outline-tool');
  const canvas = page.getByTestId('cad-canvas').locator('canvas');
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('cad-outline-tools')).toHaveCount(0);
  await canvas.evaluate(el => el.setAttribute('data-u3-stable', 'yes'));

  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  // P2 review: a focused toolbar button must consume Space as a native click
  // even while the SelectionController is active (not temporary canvas pan).
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveAttribute('aria-controls', 'viewer-tools-dock');
  const tools = page.getByTestId('cad-outline-tools');
  await expect(tools).toBeVisible();
  await expect(canvas).toHaveAttribute('data-u3-stable', 'yes');
  expect(await canvas.evaluate(el => (el as HTMLCanvasElement).style.cursor)).toBe('crosshair');
  await selectSquare(page);
  await tools.getByRole('button', { name: '정밀 외곽선 미리보기' }).click();
  await expect(page.getByTestId('outline-preview')).toContainText('실제 폐곡선 Union');
  await tools.getByRole('button', { name: '임시 확정' }).click();
  await expect(tools.getByRole('button', { name: /JSON 내보내기 \(1\)/ })).toBeEnabled();

  // A new unconfirmed preview must be cancelled on OFF; confirmed outlines remain.
  await tools.getByRole('button', { name: '볼록 외곽선 미리보기' }).click();
  await expect(page.getByTestId('outline-preview')).toContainText('볼록 경계');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).not.toHaveAttribute('aria-controls', 'viewer-tools-dock');
  await expect(page.getByTestId('cad-outline-tools')).toHaveCount(0);
  await expect(page.getByTestId('outline-tool-notice')).toContainText('비확정');
  await expect(page.getByTestId('outline-saved-tools')).toContainText('1건');
  await expect(canvas).toHaveAttribute('data-u3-stable', 'yes');
  expect(await canvas.evaluate(el => (el as HTMLCanvasElement).style.cursor)).not.toBe('crosshair');
  const download = page.waitForEvent('download');
  await page.getByTestId('outline-saved-tools').getByRole('button', { name: /JSON 내보내기/ }).click();
  const exported = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  expect(exported.outlines).toHaveLength(1);
  expect(exported.outlines[0].result.kind).toBe('PRECISE');

  await toggle.click();
  await expect(page.getByTestId('outline-selection-count')).toContainText('선택 0개');
  await expect(tools.getByRole('button', { name: '임시 확정' })).toBeDisabled();
  await expect(tools.getByRole('button', { name: /JSON 내보내기 \(1\)/ })).toBeEnabled();
  await expect(page.getByTestId('outline-preview')).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-u3-stable', 'yes');
  expect(contentRequests).toBe(1);
});

test('TC-U3-E2E-002: repeated ON/OFF, layer-hidden safety and ESC scope', async ({ page, request }) => {
  const file = await createDrawing(request, 'issue40-repeated');
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  const toggle = page.getByTestId('viewer-menu-outline-tool');
  const tools = page.getByTestId('cad-outline-tools');
  for (let i = 0; i < 3; i++) {
    await toggle.click();
    await expect(tools).toBeVisible();
    await toggle.click();
    await expect(tools).toHaveCount(0);
  }
  await toggle.click();
  // Keep Space+drag pan when no interactive control owns keyboard focus.
  await toggle.evaluate(node => (node as HTMLButtonElement).blur());
  const panCanvas = page.getByTestId('cad-canvas').locator('canvas');
  const panBox = (await panCanvas.boundingBox())!;
  await page.keyboard.down('Space');
  await page.mouse.move(panBox.x + panBox.width / 2, panBox.y + panBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(panBox.x + panBox.width / 2 + 20, panBox.y + panBox.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  await expect(page.getByTestId('outline-selection-count')).toContainText('선택 0개');
  await page.getByRole('button', { name: '전체 화면 맞춤' }).click();
  await selectSquare(page);
  await page.getByRole('complementary', { name: '전체 화면 레이어' })
    .getByRole('checkbox', { name: 'EQUIP' }).uncheck();
  await expect(page.getByTestId('outline-selection-count')).toContainText('선택 0개');
  await selectNothing(page);
  await page.getByRole('complementary', { name: '전체 화면 레이어' })
    .getByRole('checkbox', { name: 'EQUIP' }).check();
  await selectSquare(page);
  await page.getByRole('button', { name: '도면 내 텍스트 검색' }).click();
  await expect(page.getByTestId('cad-text-search')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('outline-selection-count')).toContainText('선택 0개');
  await expect(page.getByTestId('cad-text-search')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cad-text-search')).toHaveCount(0);
  await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen', 'false');
});

async function selectNothing(page: Page) {
  const canvas = page.getByTestId('cad-canvas').locator('canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('outline-selection-count')).toContainText('선택 0개');
}

test('TC-U3-E2E-003: unsupported renderer, no entities, reload and SHA-bound switch reset', async ({ page, request }) => {
  // Use the same valid DXF in both renderers rather than a 90-less,
  // renderer-dependent approximation of a closed LWPOLYLINE.
  const file = await createDrawing(request, 'issue40-renderer');
  await page.goto(`/cad/versions/${file.id}/viewer?renderer=dxf-viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  const toggle = page.getByTestId('viewer-menu-outline-tool');
  await expect(toggle).toBeDisabled();
  await expect(page.getByTestId('outline-tool-unavailable')).toContainText('three-dxf-viewer');
  await expect(page.getByTestId('cad-outline-tools')).toHaveCount(0);
  await page.getByRole('button', { name: 'three-dxf-viewer', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await page.getByRole('button', { name: 'dxf-viewer', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'three-dxf-viewer', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  const empty = await createDrawing(request, 'issue40-empty', Buffer.from('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n'));
  await page.goto(`/cad/versions/${empty.id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status')).not.toHaveText('도면 로딩 중…');
  await expect(toggle).toBeDisabled();
  await expect(page.getByTestId('cad-outline-tools')).toHaveCount(0);
});
