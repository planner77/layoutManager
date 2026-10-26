import packageInfo from '../package.json';
import { randomUUID } from 'node:crypto';
import { safeMessages, safeCadMessages, objectStorageCodes, categories } from './upload-error-catalog';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFormat = 'json' | 'pretty';
export type LogOutcome = 'started' | 'success' | 'warning' | 'failure';

// L1: The emitter owns the schema. Callers cannot override these fields.
export const LOG_SCHEMA_VERSION = 1;
const priorities: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const sensitiveKey = /(password|authorization|cookie|token|secret|credential|access[_-]?key|session|path|locator|filename|stack|bytes|payload|sql|query|url|header)/i;
const stableToken = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const stableEvent = /^[a-z][a-z0-9_]{0,63}$/;
const machineCode = /^[A-Z][A-Z0-9_]{0,63}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const knownUploadCodes = new Set([...Object.keys(safeMessages), ...Object.keys(safeCadMessages), ...objectStorageCodes]);
const knownErrorNames = new Set([
  'Error', 'CadError', 'TypeError', 'RangeError', 'SyntaxError', 'AbortError', 'TimeoutError',
  'S3ServiceException', 'PrismaClientKnownRequestError', 'PrismaClientInitializationError',
  'SqliteError', 'ExternalError', 'UnknownError', 'CircularCause', ...objectStorageCodes,
]);
const uploadStages = new Set([
  'request_received', 'origin_validation', 'context_initialization', 'upload_receive',
  'upload_validation', 'storage_publish', 'database_registration', 'compensation',
  'temporary_cleanup', 'response',
]);
const outcomes = new Set<LogOutcome>(['started', 'success', 'warning', 'failure']);
const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

function configuredLevel(): LogLevel {
  const value = process.env.LOG_LEVEL?.toLowerCase();
  return value === 'debug' || value === 'warn' || value === 'error' ? value : 'info';
}

function configuredFormat(): LogFormat {
  return process.env.LOG_FORMAT?.toLowerCase() === 'pretty' ? 'pretty' : 'json';
}

function safeToken(value: unknown, fallback: string): string {
  return typeof value === 'string' && stableToken.test(value) ? value : fallback;
}

function safeErrorName(name: unknown): string {
  return typeof name === 'string' && knownErrorNames.has(name) ? name : 'ExternalError';
}

function safeCode(value: unknown): string | undefined {
  return typeof value === 'string' && machineCode.test(value) && !sensitiveKey.test(value)
    ? value : undefined;
}

function validHttpStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value : undefined;
}

function validElapsed(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(Math.round(value), 86_400_000) : undefined;
}

// Only known HTTP route templates are emitted; never log user-controlled path segments.
function safeRoute(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value === '/api/cad-files' || value === '/api/health' || value === '/api/masters') return value;
  if (/^\/api\/cad-files\/[^/]+\/content$/.test(value)) return '/api/cad-files/:versionId/content';
  if (/^\/api\/cad-files\/[^/]+$/.test(value)) return '/api/cad-files/:versionId';
  if (/^\/api\/cad-locations\/[^/]+\/current$/.test(value)) return '/api/cad-locations/:locationId/current';
  if (/^\/api\/cad-locations\/[^/]+\/reclassify$/.test(value)) return '/api/cad-locations/:locationId/reclassify';
  if (/^\/api\/cad-locations\/[^/]+$/.test(value)) return '/api/cad-locations/:locationId';
  if (/^\/api\/masters\/[^/]+\/[^/]+$/.test(value)) return '/api/masters/:type/:id';
  return '/api/other';
}

function rawError(value: Error) {
  const error = value as Error & { code?: unknown };
  const code = safeCode(error.code);
  return {
    name: safeErrorName(error.name),
    ...(code ? { code } : {}),
    message: 'Internal error details suppressed.',
  };
}

function loggedError(value: unknown, depth = 0, seen = new WeakSet<object>()): Record<string, unknown> {
  if (value instanceof Error) return rawError(value);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { name: 'UnknownError', message: 'Internal error details suppressed.' };
  }
  if (seen.has(value)) return { name: 'CircularCause', message: 'Circular error cause suppressed.' };
  seen.add(value);
  // A sanitized UploadDiagnostics error is *re-derived* from a fixed catalog:
  // never trust arbitrary .message, .stack, .category, .path or nested properties.
  const object = value as Record<string, unknown>;
  const code = typeof object.code === 'string' && knownUploadCodes.has(object.code) ? object.code : undefined;
  const name = safeErrorName(object.name);
  const message = code
    ? (safeMessages[code] ?? safeCadMessages[code] ?? 'Internal error details suppressed.')
    : name === 'CircularCause'
      ? 'Circular error cause suppressed.'
      : name === 'UnknownError'
        ? 'Non-error value suppressed.'
        : name === 'CadError'
          ? 'Application error details suppressed.'
          : 'Internal error details suppressed.';
  const httpStatus = validHttpStatus(object.httpStatus);
  const recoveryId = typeof object.recoveryId === 'string' && uuid.test(object.recoveryId)
    ? object.recoveryId : undefined;
  return {
    name,
    ...(code ? { code } : {}),
    ...(code && categories[code] ? { category: categories[code] } : {}),
    message,
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    ...(recoveryId ? { recoveryId } : {}),
    ...(depth < 2 && object.cause !== undefined ? { cause: loggedError(object.cause, depth + 1, seen) } : {}),
  };
}

// General-purpose legacy helper; the emitter below uses a stricter field allowlist.
function safeString(value: string) {
  if (/https?:\/\/|(?:^|[\s])(?:\/[^\s]+|[A-Za-z]:\\)/i.test(value)) return '[REDACTED]';
  const normalized = value.replace(/[\r\n\t]+/g, ' ').trim();
  return normalized.length <= 256 ? normalized : normalized.slice(0, 253) + '...';
}

function sanitizeValue(key: string, value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (sensitiveKey.test(key)) return '[REDACTED]';
  if (key.toLowerCase() === 'error') return loggedError(value);
  if (value === null || value === undefined) return value;
  if (depth >= 3) return '[TRUNCATED]';
  if (value instanceof Error) return rawError(value);
  if (typeof value === 'string') return safeString(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'object') return '[TRUNCATED]';
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return '[REDACTED]';
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item, index) => sanitizeValue(String(index), item, depth + 1, seen));
  const safe: Record<string, unknown> = {};
  for (const [childKey, child] of Object.entries(value).slice(0, 40)) {
    safe[childKey] = sanitizeValue(childKey, child, depth + 1, seen);
  }
  return safe;
}

export function sanitizeLogFields(fields: Record<string, unknown> = {}) {
  const safe: Record<string, unknown> = {};
  const seen = new WeakSet<object>();
  for (const [key, value] of Object.entries(fields).slice(0, 40)) safe[key] = sanitizeValue(key, value, 0, seen);
  return safe;
}

function allowedFields(fields: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  if (typeof fields.requestId === 'string' && uuid.test(fields.requestId)) safe.requestId = fields.requestId;
  if (typeof fields.jobId === 'string' && uuid.test(fields.jobId)) safe.jobId = fields.jobId;
  if (typeof fields.method === 'string' && methods.has(fields.method)) safe.method = fields.method;
  const route = safeRoute(fields.route);
  if (route) safe.route = route;
  if (typeof fields.outcome === 'string' && outcomes.has(fields.outcome as LogOutcome)) safe.outcome = fields.outcome;
  const elapsed = validElapsed(fields.elapsedMs);
  if (elapsed !== undefined) safe.elapsedMs = elapsed;
  const httpStatus = validHttpStatus(fields.httpStatus);
  if (httpStatus !== undefined) safe.httpStatus = httpStatus;
  const code = safeCode(fields.errorCode);
  if (code) safe.errorCode = code;
  if (typeof fields.stage === 'string' && uploadStages.has(fields.stage)) safe.stage = fields.stage;
  if (fields.backend === 'local' || fields.backend === 's3') safe.backend = fields.backend;
  if (typeof fields.recoveryId === 'string' && uuid.test(fields.recoveryId)) safe.recoveryId = fields.recoveryId;
  const status = validHttpStatus(fields.status);
  if (status !== undefined) safe.status = status; // legacy upload-stage field
  if (typeof fields.jobCount === 'number' && Number.isSafeInteger(fields.jobCount) && fields.jobCount >= 0 && fields.jobCount <= 1_000_000) safe.jobCount = fields.jobCount;
  if (fields.error !== undefined) safe.error = loggedError(fields.error);
  return safe;
}

export function writeLog(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  if (priorities[level] < priorities[configuredLevel()]) return;
  const safeEvent = stableEvent.test(event) ? event : 'unclassified_event';
  const entry = {
    timestamp: new Date().toISOString(),
    schemaVersion: LOG_SCHEMA_VERSION,
    level,
    event: safeEvent,
    component: safeToken(fields.component, 'application'),
    operation: safeToken(fields.operation, 'unspecified'),
    appVersion: packageInfo.version,
    ...allowedFields(fields),
  };
  const json = JSON.stringify(entry);
  const line = configuredFormat() === 'pretty'
    ? entry.timestamp + ' ' + level.toUpperCase() + ' ' + entry.event + ' ' + json
    : json;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export class RequestLogContext {
  readonly requestId: string;
  readonly startedAt = Date.now();

  constructor(
    readonly request: Request,
    readonly component = 'api',
    readonly operation?: string,
    requestId?: string,
  ) {
    this.requestId = requestId && uuid.test(requestId) ? requestId : randomUUID();
    // Avoid two info logs for every successful read. The completion stays at info.
    this.debug('http_request_started', { outcome: 'started' });
  }

  private base(extra: Record<string, unknown> = {}) {
    const url = new URL(this.request.url);
    return {
      requestId: this.requestId,
      component: this.component,
      ...(this.operation ? { operation: this.operation } : {}),
      method: this.request.method,
      route: url.pathname,
      elapsedMs: Math.max(0, Date.now() - this.startedAt),
      ...extra,
    };
  }

  debug(event: string, fields: Record<string, unknown> = {}) { writeLog('debug', event, this.base(fields)); }
  info(event: string, fields: Record<string, unknown> = {}) { writeLog('info', event, this.base(fields)); }
  warn(event: string, fields: Record<string, unknown> = {}) { writeLog('warn', event, this.base(fields)); }
  error(event: string, error: unknown, fields: Record<string, unknown> = {}) {
    writeLog('error', event, this.base({ ...fields, error }));
  }

  completed(status: number, outcome: Exclude<LogOutcome, 'started'> = status >= 400 ? 'failure' : 'success') {
    const level: LogLevel = outcome === 'failure' ? 'error' : outcome === 'warning' ? 'warn' : 'info';
    writeLog(level, 'http_request_completed', this.base({ httpStatus: status, outcome }));
  }

  responseHeaders(extra?: HeadersInit) {
    const headers = new Headers(extra);
    headers.set('X-Request-Id', this.requestId);
    return headers;
  }
}
