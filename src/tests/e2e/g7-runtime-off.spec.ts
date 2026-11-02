import { expect, test } from '@playwright/test';

test('G7 runtime stays OFF in the existing anonymous CAD deployment', async ({page,request}) => {
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'CAD 도면 목록'})).toBeVisible();
  await expect.poll(async () => (await request.get('/api/g7-runtime/status')).json()).toMatchObject({state:'OFF',authEnabled:false,cadWriteEnabled:false});
  await expect(page.getByRole('link',{name:'계정 / 로그인'})).toHaveCount(0);
  const session=await request.get('/api/g7-runtime/auth/session');
  expect(session.status()).toBe(404);
  const account=await page.goto('/g7-runtime');
  // Installed Next.js documents streamed notFound responses as HTTP 200;
  // non-streamed responses are 404. Assert the actual disabled page and keep
  // the API's exact 404 contract above, rather than equating transport with UI.
  expect([200,404]).toContain(account?.status());
  await expect(page.getByRole('heading',{name:'404',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'This page could not be found.',exact:true})).toBeVisible();
  await expect(page.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
  await expect(page.getByTestId('g7-runtime-account')).toHaveCount(0);
  await expect(page.locator('main form')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'계정 / 로그인'})).toHaveCount(0);
});
