import { afterEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ options: vi.fn() }));
vi.mock('@/server/context', () => ({ context: () => ({ list: { options: mocks.options } }) }));

import { GET } from '@/app/api/health/route';

afterEach(() => mocks.options.mockReset());

test('TC-DEPLOY-001: health returns only a non-cacheable ready status after the database check', async () => {
  mocks.options.mockResolvedValue({ businessUnits: ['내부값'] });

  const response = await GET();

  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ status: 'ok' });
  expect(mocks.options).toHaveBeenCalledOnce();
});

test('TC-DEPLOY-001: health converts database failure to a safe non-cacheable 503', async () => {
  mocks.options.mockRejectedValue(new Error('secret database path and stack details'));

  const response = await GET();
  const body = await response.json();

  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(body).toEqual({ status: 'unavailable' });
  expect(Object.keys(body)).toEqual(['status']);
  expect(JSON.stringify(body)).not.toContain('secret');
});
