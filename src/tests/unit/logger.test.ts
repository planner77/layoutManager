import { afterEach, expect, test, vi } from 'vitest';
import { RequestLogContext, sanitizeLogFields, writeLog } from '../../server/logger';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.LOG_LEVEL;
  delete process.env.LOG_FORMAT;
});

test('TC-LOG-001: production-compatible log is one-line JSON with base fields', () => {
  process.env.LOG_LEVEL = 'info';
  process.env.LOG_FORMAT = 'json';
  const output: string[] = [];
  vi.spyOn(console, 'log').mockImplementation(value => output.push(String(value)));
  writeLog('info', 'test_event', { component: 'test', outcome: 'success' });
  expect(output).toHaveLength(1);
  expect(output[0]).not.toContain('\n');
  expect(JSON.parse(output[0])).toMatchObject({ level: 'info', event: 'test_event', component: 'test', outcome: 'success' });
});

test('TC-LOG-002: LOG_LEVEL suppresses lower-severity events', () => {
  process.env.LOG_LEVEL = 'warn';
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  writeLog('debug', 'debug_event');
  writeLog('info', 'info_event');
  writeLog('warn', 'warn_event');
  expect(log).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledTimes(1);
});

test('TC-LOG-003: sensitive keys and long values are redacted or bounded', () => {
  const safe = sanitizeLogFields({
    password: 'canary-password',
    Authorization: 'Bearer canary',
    nested: { accessKey: 'canary-key', note: 'x'.repeat(500) },
  });
  const serialized = JSON.stringify(safe);
  expect(serialized).not.toMatch(/canary-password|Bearer canary|canary-key/);
  expect(serialized).toContain('[REDACTED]');
  expect(String((safe.nested as { note: string }).note).length).toBeLessThanOrEqual(256);
});

test('TC-LOG-004: request lifecycle reuses one server requestId and returns it in the response header', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const request = new Request('http://localhost/api/cad-files?search=sample');
  const scope = new RequestLogContext(request, 'api', 'cad_list');
  const headers = scope.responseHeaders({ 'Cache-Control': 'no-store' });
  scope.completed(200);
  expect(scope.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(headers.get('x-request-id')).toBe(scope.requestId);
  expect(headers.get('cache-control')).toBe('no-store');
});

test('TC-LOG-005: exception message and credential-like fields never reach output', () => {
  const output: string[] = [];
  vi.spyOn(console, 'error').mockImplementation(value => output.push(String(value)));
  const error = Object.assign(new Error('Authorization=Bearer canary /private/file.dxf'), { code: 'SQLITE_BUSY' });
  writeLog('error', 'operation_failed', { error, token: 'canary-token', pathHint: 'safe-stage-only' });
  expect(output).toHaveLength(1);
  expect(output[0]).not.toMatch(/Bearer canary|private\/file|canary-token/);
  expect(JSON.parse(output[0]).error).toMatchObject({ name: 'Error', code: 'SQLITE_BUSY', message: 'Internal error details suppressed.' });
});
