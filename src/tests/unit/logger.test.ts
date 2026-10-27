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


test('TC-L1-001: L1 upload stages obey the same warn threshold and one-line schema', async () => {
  process.env.LOG_LEVEL = 'warn';
  process.env.LOG_FORMAT = 'json';
  const info = vi.spyOn(console, 'log').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { UploadDiagnostics } = await import('../../server/upload-observability');
  const diagnostic = new UploadDiagnostics();
  diagnostic.record('origin_validation', 'success');
  diagnostic.record('temporary_cleanup', 'warning', { error: Object.assign(new Error('private'), { code: 'EACCES' }) });
  diagnostic.record('storage_publish', 'failure', { error: Object.assign(new Error('s3://token/path'), { code: 'ENOSPC' }) });
  diagnostic.finishFailure(new Error('private/path'), 'response', 503);
  expect(info).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledTimes(2);
  const events = [warn, error].flatMap(spy => spy.mock.calls.map(call => JSON.parse(String(call[0]))));
  expect(events.every(event => event.requestId === diagnostic.requestId && event.schemaVersion === 1 && event.component === 'upload' && event.operation === 'cad_upload')).toBe(true);
  expect(events.find(event => event.stage === 'temporary_cleanup')).toMatchObject({ level: 'warn', outcome: 'warning', error: { code: 'EACCES', category: 'filesystem_permission' } });
  expect(events.find(event => event.stage === 'storage_publish')).toMatchObject({ level: 'error', errorCode: 'ENOSPC', error: { category: 'filesystem_capacity' } });
  expect(events.every(event => !JSON.stringify(event).includes('private'))).toBe(true);
});

test('TC-L1-002: only declared safe fields survive; base metadata and raw bytes cannot be forged', () => {
  process.env.LOG_FORMAT = 'json';
  const output: string[] = [];
  vi.spyOn(console, 'error').mockImplementation(value => output.push(String(value)));
  const cyc: { self?: unknown } = {}; cyc.self = cyc;
  writeLog('error', 'test_event', {
    component: 'api', operation: 'cad_upload',
    timestamp: 'forged', level: 'info', event: 'forged', appVersion: 'canary',
    requestId: 'not-a-uuid', jobId: 'secrets',
    route: '/api/cad-files/customer-private.dxf/content',
    locationPath: '/private/canary.dxf', locator: 's3://bucket/canary',
    fileBytes: Buffer.from('canary'), extra: cyc,
    error: { name: 'Error', code: 'EACCES', category: 'secret', message: 'Authorization=canary', stack: '/private/canary', cause: { name: 'Error', code: 'SQLITE_BUSY', message: 'canary' } },
  });
  const event = JSON.parse(output[0]);
  expect(event).toMatchObject({
    level: 'error', event: 'test_event', component: 'api', operation: 'cad_upload', schemaVersion: 1,
    route: '/api/cad-files/:versionId/content',
    error: { name: 'Error', code: 'EACCES', message: 'Filesystem permission denied.', category: 'filesystem_permission' },
  });
  expect(event.appVersion).not.toBe('canary');
  expect(event.requestId).toBeUndefined();
  expect(event.jobId).toBeUndefined();
  expect(event.error.stack).toBeUndefined();
  for (const key of ['locationPath', 'locator', 'fileBytes', 'extra']) expect(event).not.toHaveProperty(key);
  expect(output[0]).not.toMatch(/canary|Authorization|bucket|private|s3:\/\/|secret/);
  expect(output[0]).not.toContain('\n');
});

test('TC-L1-003: unknown errors, circular causes, pretty format and debug severity are bounded', () => {
  process.env.LOG_LEVEL = 'debug';
  process.env.LOG_FORMAT = 'pretty';
  const logged: string[] = [];
  vi.spyOn(console, 'log').mockImplementation(value => logged.push(String(value)));
  const context = new RequestLogContext(new Request('http://localhost/api/cad-files/not-a-id?password=canary'), 'api', 'cad_content');
  context.completed(200);
  expect(logged).toHaveLength(2);
  expect(logged.every(line => line.split('\n').length === 1)).toBe(true);
  expect(logged.every(line => !line.includes('canary') && !line.includes('not-a-id'))).toBe(true);
  expect(logged[0]).toContain('INFO http_request_started');
  expect(logged[1]).toContain('INFO http_request_completed');
  const fields = sanitizeLogFields({ nested: { password: 'secret', note: 'x'.repeat(500) } });
  expect(JSON.stringify(fields)).not.toContain('secret');
  expect((fields.nested as { note: string }).note.length).toBeLessThanOrEqual(256);
});


test('TC-L1-004: frequent successful health probes are debug-only, failures still error', () => {
  process.env.LOG_LEVEL = 'info';
  const info = vi.spyOn(console, 'log').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const health = new RequestLogContext(new Request('http://localhost/api/health'), 'api', 'health');
  health.completed(200);
  expect(info).not.toHaveBeenCalled();
  health.error('health_check_failed', new Error('/private/health'), { errorCode: 'HEALTH_UNAVAILABLE', outcome: 'failure' });
  health.completed(503, 'failure');
  expect(error).toHaveBeenCalledTimes(2);
  expect(error.mock.calls.map(call => JSON.parse(String(call[0]))).every(e => e.requestId === health.requestId)).toBe(true);
});


test('TC-L1-005: request lifecycle preserves a single requestId and fixed public failure code', () => {
  process.env.LOG_LEVEL = 'info';
  process.env.LOG_FORMAT = 'json';
  const info = vi.spyOn(console, 'log').mockImplementation(() => {});
  const failure = vi.spyOn(console, 'error').mockImplementation(() => {});
  const scope = new RequestLogContext(new Request('http://localhost/api/cad-files?token=canary', { method: 'POST' }), 'api', 'cad_upload');
  const error = Object.assign(new Error('secret/path: Authorization=canary'), { code: 'INVALID_LOCATION_CHAIN' });
  scope.error('http_request_failed', error, { errorCode: error.code, httpStatus: 400, outcome: 'failure' });
  scope.completed(400, 'failure');
  const events = [info, failure].flatMap(spy => spy.mock.calls.map(call => JSON.parse(String(call[0]))));
  expect(events).toHaveLength(3);
  expect(events.map(event => event.event).sort()).toEqual(['http_request_completed', 'http_request_failed', 'http_request_started']);
  expect(events.every(event => event.requestId === scope.requestId)).toBe(true);
  expect(events.find(event => event.event === 'http_request_failed')).toMatchObject({ errorCode: 'INVALID_LOCATION_CHAIN', httpStatus: 400 });
  expect(events.map(event => JSON.stringify(event)).join('\n')).not.toMatch(/canary|Authorization|secret\/path/);
  expect(scope.responseHeaders().get('x-request-id')).toBe(scope.requestId);
});

test('TC-L1-006: forged event/schema and circular sanitized error are bounded at the emitter', () => {
  const output: string[] = [];
  vi.spyOn(console, 'error').mockImplementation(value => output.push(String(value)));
  const cyclic: {name: string;code: string; cause?: unknown; stack: string } = { name: 'Error', code: 'EACCES', stack: '/private/secret.dxf' };
  cyclic.cause = cyclic;
  writeLog('error', 'private/path\nsecret', {
    component: 'api', operation: 'cad_upload', schemaVersion: 900, timestamp: 'forged', level: 'info',
    error: cyclic, unknown: { any: 'private' }, route: '/api/user-secret/path',
  });
  expect(output).toHaveLength(1);
  const entry = JSON.parse(output[0]);
  expect(entry).toMatchObject({schemaVersion: 1, level: 'error', event: 'unclassified_event', route: '/api/other'});
  expect(entry.error).toMatchObject({name: 'Error', code: 'EACCES', cause: {name: 'CircularCause'}});
  expect(entry).not.toHaveProperty('unknown');
  expect(output[0]).not.toMatch(/private|secret|forged|900/);
  expect(output[0]).not.toContain('\n');
});
