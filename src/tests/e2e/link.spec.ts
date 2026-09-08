import { expect, test, type APIRequestContext } from '@playwright/test';

const drawing = Buffer.from('0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n100\n0\nENDSEC\n0\nEOF\n');

async function upload(request: APIRequestContext, name: string, makeCurrent = false) {
  const response = await request.post('/api/cad-files', { multipart: {
    file: { name, mimeType: 'application/octet-stream', buffer: name.endsWith('.dxf') ? drawing : Buffer.from('AC1032broken') },
    businessUnit: '직접링크', site: 'LINK', building: 'A', floor: '1', registeredAt: '2026-09-08', makeCurrent: String(makeCurrent),
  }});
  expect(response.status()).toBe(201);
  return response.json() as Promise<{id:string;locationId:string}>;
}

test('TC-LINK-001/002: list, location and viewer create pinned renderer-specific links', async ({ page, request, browser, baseURL }) => {
  const first = await upload(request, 'link-v1.dxf', true);

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL! });
  await page.goto('/?filename=link-v1.dxf');
  const row = page.getByRole('row').filter({hasText:'link-v1.dxf'});
  await row.getByRole('button', {name:'link-v1.dxf 도면 링크 복사'}).click();
  const pinned = await page.evaluate(() => navigator.clipboard.readText());
  expect(pinned).toBe(`${baseURL}/cad/versions/${first.id}/viewer?renderer=dxf-viewer`);
  await expect(row.getByText('도면 링크를 복사했습니다.')).toBeVisible();

  const second = await upload(request, 'link-v2.dxf', true);
  await page.goto(`/cad/locations/${first.locationId}`);
  await expect(page.getByRole('row').filter({hasText:'link-v1.dxf'}).getByRole('button', {name:'link-v1.dxf 도면 링크 복사'})).toBeVisible();
  await expect(page.getByRole('row').filter({hasText:'link-v1.dxf'})).toContainText('이전 버전');

  const fresh = await browser.newContext({baseURL, permissions:['clipboard-read', 'clipboard-write']});
  const direct = await fresh.newPage();
  await direct.goto(pinned);
  await expect(direct).toHaveURL(new RegExp(`/cad/versions/${first.id}/viewer\\?renderer=dxf-viewer$`));
  await expect(direct.getByRole('status')).toHaveText('도면 표시 완료');
  // The copied URL remains pinned to V1 after V2 becomes Current.
  await expect(direct.getByRole('heading', {name:/link-v1\.dxf · V1/})).toBeVisible();
  await direct.getByRole('button', {name:'three-dxf-viewer', exact:true}).click();
  await direct.getByRole('button', {name:'도면 링크 복사'}).click();
  await expect(direct.getByText('도면 링크를 복사했습니다.')).toBeVisible();
  const threeUrl = await direct.evaluate(() => navigator.clipboard.readText());
  expect(threeUrl).toBe(`${baseURL}/cad/versions/${first.id}/viewer?renderer=three-dxf-viewer`);
  const freshThree = await browser.newContext({baseURL});
  const directThree = await freshThree.newPage();
  await directThree.goto(threeUrl);
  await expect(directThree.getByRole('button', {name:'three-dxf-viewer', exact:true})).toBeDisabled();
  await expect(directThree.getByRole('status')).toHaveText('도면 표시 완료');
  await freshThree.close();
  await fresh.close();

  expect(second.id).not.toBe(first.id);
});

test('TC-LINK-002/003: DWG canonical renderer and clipboard failure fallback', async ({page, request, baseURL}) => {
  const dwg = await upload(request, 'link.dwg');
  await page.goto(`/?filename=link.dwg`);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:() => Promise.reject(new Error('denied'))}}));
  const row = page.getByRole('row').filter({hasText:'link.dwg'});
  await row.getByRole('button', {name:'link.dwg 도면 링크 복사'}).click();
  const input = row.getByLabel('복사할 도면 링크');
  await expect(input).toBeVisible();
  await expect(input).toHaveValue(`${baseURL}/cad/versions/${dwg.id}/viewer?renderer=libredwg-web`);
  const open = row.getByRole('link', {name:'도면 열기'});
  await expect(open).toHaveAttribute('href', `${baseURL}/cad/versions/${dwg.id}/viewer?renderer=libredwg-web`);
  await expect(row.getByText('링크를 복사하지 못했습니다.')).toBeVisible();

  await open.click();
  await expect(page).toHaveURL(/\/cad\/versions\/[^/]+\/viewer\?renderer=libredwg-web$/);
  await expect(page.getByText('libredwg-web', {exact:true})).toBeVisible();
  await expect(page.getByRole('button', {name:'dxf-viewer', exact:true})).toHaveCount(0);
  await expect(page.getByRole('button', {name:'three-dxf-viewer', exact:true})).toHaveCount(0);
});

test('TC-LINK-003: unavailable clipboard exposes a manual link fallback', async ({page, request, baseURL}) => {
  const file = await upload(request, 'link-unavailable.dxf');
  await page.goto('/?filename=link-unavailable.dxf');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {configurable:true, value:undefined}));
  const row = page.getByRole('row').filter({hasText:'link-unavailable.dxf'});
  await row.getByRole('button', {name:'link-unavailable.dxf 도면 링크 복사'}).click();
  const input = row.getByLabel('복사할 도면 링크');
  await expect(input).toHaveValue(`${baseURL}/cad/versions/${file.id}/viewer?renderer=dxf-viewer`);
  await expect(row.getByText('클립보드를 사용할 수 없습니다')).toBeVisible();
});
