import packageInfo from '../package.json';
import { randomUUID } from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFormat = 'json' | 'pretty';
export type LogOutcome = 'started' | 'success' | 'warning' | 'failure';

const priorities: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const sensitiveKey = /(password|authorization|cookie|token|secret|credential|access[_-]?key|session)/i;
const allowedScalar = new Set(['string', 'number', 'boolean']);
const safeErrorCodes = /^(?:E[A-Z0-9_]+|P\d{4}|SQLITE_[A-Z0-9_]+|[A-Z][A-Z0-9_]{2,63})$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function configuredLevel(): LogLevel {
  const value = process.env.LOG_LEVEL?.toLowerCase();
  return value === 'debug' || value === 'warn' || value === 'error' ? value : 'info';
}

function configuredFormat(): LogFormat {
  return process.env.LOG_FORMAT?.toLowerCase() === 'pretty' ? 'pretty' : 'json';
}

function safeString(value: string) {
  const normalized = value.replace(/[\r\n\t]+/g, ' ').trim();
  return normalized.length <= 256 ? normalized : `${normalized.slice(0, 253)}...`;
}

function safeError(error: Error) {
  const value = error as Error & { code?: unknown; cause?: unknown };
  const code = typeof value.code === 'string' && safeErrorCodes.test(value.code) ? value.code : undefined;
  return {
    name: /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name) ? error.name : 'Error',
    ...(code ? { code } : {}),
    message: 'Internal error details suppressed.',
    ...(value.cause instanceof Error ? { cause: { name: value.cause.name || 'Error', message: 'Internal error details suppressed.' } } : {}),
  };
}

function sanitizeValue(key: string, value: unknown, depth = 0): unknown {
  if (sensitiveKey.test(key)) return '[REDACTED]';
  if (value === null || value === undefined) return value;
  if (depth >= 3) return '[TRUNCATED]';
  if (value instanceof Error) return safeError(value);
  if (allowedScalar.has(typeof value)) return typeof value === 'string' ? safeString(value) : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item, index) => sanitizeValue(String(index), item, depth + 1));
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      result[childKey] = sanitizeValue(childKey, childValue, depth + 1);
    }
    return result;
  }
  return String(value).slice(0, 128);
}

export function sanitizeLogFields(fields: Record<string, unknown> = {}) {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) safe[key] = sanitizeValue(key, value);
  return safe;
}

export function writeLog(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  if (priorities[level] < priorities[configuredLevel()]) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event: safeString(event),
    appVersion: packageInfo.version,
    ...sanitizeLogFields(fields),
  };
  const line = configuredFormat() === 'pretty'
    ? `${entry.timestamp} ${level.toUpperCase()} ${entry.event} ${JSON.stringify(entry)}`
    : JSON.stringify(entry);
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
    this.info('http_request_started', { outcome: 'started' });
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
