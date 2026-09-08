import { expect, test } from '@playwright/test';

test('TC-DEPLOY-001: health endpoint proves application and database readiness without configuration disclosure', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(await response.json()).toEqual({status:'ok'});
});
