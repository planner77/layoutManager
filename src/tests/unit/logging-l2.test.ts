import { afterEach, expect, test, vi } from 'vitest';
import { JobLogContext, RequestLogContext, writeLog } from '../../server/logger';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.G7_RELEASE_SOURCE_COMMIT;
  delete process.env.LOG_STORE_ENABLED;
  delete process.env.LOG_LEVEL;
  delete process.env.LOG_FORMAT;
});

test('TC-L2-001: request stages share X-Request-Id and separate success from warning', () => {
  process.env.LOG_LEVEL = 'info';
  const info = vi.spyOn(console, 'log').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const context = new RequestLogContext(new Request('http://localhost/api/cad-files?password=secret'));
  context.phase('database_read');
  context.phase('database_read', 'success');
  context.warn('cache_revalidation_failed', { outcome: 'warning', error: new Error('/private') });
  context.completed(200, 'warning');
  const logs = [info, warn].flatMap(spy => spy.mock.calls.map(c => JSON.parse(String(c[0]))));
  expect(logs.map(x => x.event).filter(e => e === 'http_request_stage')).toHaveLength(2);
  expect(logs.every(x => x.requestId === context.requestId)).toBe(true);
  expect(logs.find(x => x.event === 'http_request_completed')).toMatchObject({ httpStatus: 200, outcome: 'warning' });
  expect(JSON.stringify(logs)).not.toMatch(/secret|private/);
});

test('TC-L2-002: job phases, status and elapsed time share a generated UUID', () => {
  const info = vi.spyOn(console, 'log').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const job = new JobLogContext('database_check');
  job.phase('connection', 'started');
  job.phase('connection', 'failure', { errorCode: 'DATABASE_CHECK_FAILED', error: new Error('secret') });
  job.completed('failure', { errorCode: 'DATABASE_CHECK_FAILED' });
  const rows = [info, error].flatMap(spy => spy.mock.calls.map(c => JSON.parse(String(c[0]))));
  expect(rows).toHaveLength(4);
  expect(rows.every(x => x.jobId === job.jobId && x.elapsedMs >= 0)).toBe(true);
  expect(rows[rows.length - 1]).toMatchObject({ outcome: 'failure', event: 'maintenance_job_completed' });
  expect(JSON.stringify(rows)).not.toContain('secret');
});

test('TC-L2-003: verified revision appears, user-supplied revision cannot overwrite it', () => {
  const info = vi.spyOn(console, 'log').mockImplementation(() => {});
  process.env.G7_RELEASE_SOURCE_COMMIT = 'a'.repeat(40);
  writeLog('info', 'request_test', { buildRevision: 'bad-revision' });
  expect(JSON.parse(String(info.mock.calls[0][0])).buildRevision).toBe('a'.repeat(40));
  process.env.G7_RELEASE_SOURCE_COMMIT = 'malicious';
  writeLog('info', 'request_test');
  expect(JSON.parse(String(info.mock.calls[1][0]))).not.toHaveProperty('buildRevision');
});
