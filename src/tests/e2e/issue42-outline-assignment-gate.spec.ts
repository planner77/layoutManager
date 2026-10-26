import { clickViewerTestCommand, openViewerMenu } from './viewer-menu-helper';
import { expect, test } from '@playwright/test';
import { masterFields } from './master-helper';

const drawing = Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES',
  '0','LWPOLYLINE','5','1A','8','EQUIP','90','4','70','1',
  '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
  '0','ENDSEC','0','EOF','',
].join('\n'));

test('TC-U5-E2E-GATE-001: server catalog absent; no forged type confirmation or operational API', async ({ page, request }) => {
  const read = await request.get('/api/outline-types');
  expect(read.status()).toBe(404);
  const created = await request.post('/api/cad-files', { multipart: {
    file: { name: 'issue42-gate.dxf', mimeType: 'application/octet-stream', buffer: drawing },
    ...(await masterFields(request, { businessUnit: 'issue42-gate', site: 'u5', building: 'A', floor: '1' })),
    registeredAt: '2026-10-25', makeCurrent: 'true', deletePassword: '1234',
  } });
  expect(created.status()).toBe(201);
  const file = (await created.json()) as { id: string };
  await page.goto('/cad/versions/' + file.id + '/viewer?renderer=three-dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await clickViewerTestCommand(page, 'viewer-menu-outline-tool');
  const tools = page.getByTestId('cad-outline-tools');
  await expect(tools).toBeVisible();
  await expect(page.getByTestId('outline-type-select')).toBeDisabled();
  await expect(page.getByTestId('outline-typed-confirm')).toBeDisabled();
  await expect(page.getByTestId('outline-type-gate')).toContainText('#65');
  await page.getByTestId('outline-instance-name').fill('타입 없는 외곽선');
  await expect(page.getByTestId('outline-typed-confirm')).toBeDisabled();
  await openViewerMenu(page, 'work');
  await expect(page.getByTestId('viewer-menu-outline-types')).toBeDisabled();
});
