import { afterEach, expect, test, vi } from 'vitest';
import { CadError } from '../../domain/cad';
import { sanitizeServerError, UploadDiagnostics } from '../../server/upload-observability';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

test('TC-OBS-004/007: upload logs are correlated one-line JSON with safe fields', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-09T02:00:00.000Z'));
  const output: string[] = [];
  vi.spyOn(console, 'log').mockImplementation(value => output.push(String(value)));
  vi.spyOn(console, 'error').mockImplementation(value => output.push(String(value)));
  const diagnostics = new UploadDiagnostics(); diagnostics.setBackend('s3');
  diagnostics.record('storage_publish', 'failure', { error: new CadError('STORAGE_UNAVAILABLE', 'Authorization=Bearer canary\n/home/secret.dxf', 503, { cause: Object.assign(new Error('https://user:canary@example.invalid/private'), { code: 'ETIMEDOUT', $metadata: { httpStatusCode: 504 } }) }), status: 503 });
  diagnostics.finishFailure(new Error('ignored'), 'response', 503);
  expect(output.length).toBe(3);
  const entries = output.map(line => JSON.parse(line));
  expect(entries.every(entry => entry.requestId === diagnostics.requestId && entry.appVersion && entry.elapsedMs === 0)).toBe(true);
  expect(entries[1]).toMatchObject({ stage: 'storage_publish', outcome: 'failure', backend: 's3', status: 503, error: { name: 'CadError', code: 'STORAGE_UNAVAILABLE', message: 'Storage operation failed.', cause: { name: 'Error', code: 'ETIMEDOUT', message: 'Operation timed out.', httpStatus: 504 } } });
  expect(output.join('\n')).not.toMatch(/canary|Authorization|\/home\/|example\.invalid|secret\.dxf/);
  expect(output.every(line => !line.includes('\n'))).toBe(true);
});

test('TC-OBS-007: sanitizer limits circular causes, arbitrary values and stack paths', () => {
  const error = Object.assign(new Error('token=canary'), { code: 'EACCES' }) as Error & { cause?: unknown };
  error.cause = error;
  const safe = sanitizeServerError(error);
  expect(safe).toMatchObject({ name: 'Error', code: 'EACCES', message: 'Filesystem permission denied.', cause: { name: 'CircularCause' } });
  expect(JSON.stringify(safe)).not.toMatch(/canary|\/home\//);
  expect(sanitizeServerError('canary')).toEqual({ name: 'UnknownError', message: 'Non-error value suppressed.' });
  const injected = Object.assign(new Error('private'), { name: 'AuthorizationCanary', code: 'CANARY_SECRET', stack: 'Error\n at AuthorizationCanary (/private/file:1:1)' });
  expect(sanitizeServerError(injected)).toEqual({ name: 'ExternalError', message: 'Internal error details suppressed.' });
});

test('TC-OBS-004: simultaneous diagnostic scopes have distinct server identifiers', () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const first = new UploadDiagnostics(), second = new UploadDiagnostics();
  expect(first.requestId).not.toBe(second.requestId);
  expect(first.requestId).toMatch(/^[0-9a-f-]{36}$/);
});

test('TC-OBS-005/007: known database, SQLite and object-storage errors keep only safe codes and categories', () => {
  const prisma = Object.assign(new Error('SELECT secret FROM /private/canary'), { name: 'PrismaClientKnownRequestError', code: 'P2002', meta: { target: 'private filename' } });
  expect(sanitizeServerError(prisma)).toEqual({ name: 'PrismaClientKnownRequestError', code: 'P2002', category: 'database_constraint', message: 'Database uniqueness constraint failed.' });
  const sqlite = Object.assign(new Error('unable to open /private/canary.sqlite'), { name: 'SqliteError', code: 'SQLITE_CANTOPEN' });
  expect(sanitizeServerError(sqlite)).toEqual({ name: 'SqliteError', code: 'SQLITE_CANTOPEN', category: 'database_open', message: 'Database could not be opened.' });
  const s3 = Object.assign(new Error('credential URL https://user:canary@example.invalid'), { name: 'SignatureDoesNotMatch', $metadata: { httpStatusCode: 403 }, requestId: 'private-sdk-id' });
  expect(sanitizeServerError(s3)).toEqual({ name: 'SignatureDoesNotMatch', code: 'SignatureDoesNotMatch', category: 'object_storage_auth', message: 'Object storage signature validation failed.', httpStatus: 403 });
});

test('TC-OBS-007: arbitrary Prisma-like, SQLite-like and S3-like codes remain suppressed', () => {
  for (const error of [
    Object.assign(new Error('SQL canary'), { name: 'PrismaClientKnownRequestError', code: 'P9999' }),
    Object.assign(new Error('/private/canary'), { name: 'SqliteError', code: 'SQLITE_CANARY' }),
    Object.assign(new Error('Authorization canary'), { name: 'CanaryBucketError', code: 'CanaryBucketError' }),
  ]) {
    const safe = sanitizeServerError(error);
    expect(safe.code).toBeUndefined();
    expect(safe.category).toBeUndefined();
    expect(JSON.stringify(safe)).not.toMatch(/canary|Authorization|\/private\//i);
  }
});
