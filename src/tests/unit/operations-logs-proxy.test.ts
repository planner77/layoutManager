import { afterEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/server/logging/access', () => ({
  authorizeOperationLogs: vi.fn(),
  OperationLogsAccessError: class extends Error {
    constructor(readonly code: string, readonly status: number) { super(code); }
  },
}));
import { authorizeOperationLogs, OperationLogsAccessError } from '../../server/logging/access';
import { config, proxy } from '../../proxy';
afterEach(() => vi.resetAllMocks());

test.each([401, 403, 429, 503])('TC-R1-009: protected RSC/prefetch denies with HTTP %s and no metadata', async status => {
  vi.mocked(authorizeOperationLogs).mockRejectedValue(new OperationLogsAccessError('SAFE_FAILURE', status));
  const request = new NextRequest('https://cad.example.test/operations/logs', {
    headers: { RSC: '1', 'Next-Router-Prefetch': '1' },
  });
  const response = await proxy(request);
  expect(authorizeOperationLogs).toHaveBeenCalledWith(request);
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('vary')).toContain('Cookie');
  expect(response.headers.get('retry-after')).toBe(status === 429 ? '60' : null);
  const body = await response.text();
  expect(body).toContain('서버 로그 접근 제한');
  for (const field of ['items', 'logId', 'timestamp', 'skippedLines', 'SAFE_FAILURE']) expect(body).not.toContain(field);
});
test('TC-R1-009: approved request continues with no-store; CAD paths are outside the matcher', async () => {
  vi.mocked(authorizeOperationLogs).mockResolvedValue(undefined);
  const response = await proxy(new NextRequest('https://cad.example.test/operations/logs'));
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(config.matcher).toBe('/operations/logs');
});
test('TC-R1-009: unexpected server failure stays 503 and suppresses its raw detail', async () => {
  vi.mocked(authorizeOperationLogs).mockRejectedValue(new Error('synthetic-private-path-and-secret'));
  const response = await proxy(new NextRequest('https://cad.example.test/operations/logs'));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('synthetic-private');
});
