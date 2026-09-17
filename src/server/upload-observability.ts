import { randomUUID } from 'node:crypto';
import packageInfo from '../package.json';
import { CadError } from '@/domain/cad';

export type UploadStage =
  | 'request_received'
  | 'origin_validation'
  | 'context_initialization'
  | 'upload_receive'
  | 'upload_validation'
  | 'storage_publish'
  | 'database_registration'
  | 'compensation'
  | 'temporary_cleanup'
  | 'response';

type Outcome = 'started' | 'success' | 'failure' | 'warning';
type ErrorLike = { name?: unknown; code?: unknown; stack?: unknown; cause?: unknown; recoveryId?: unknown; $metadata?: { httpStatusCode?: unknown } };

export type SafeServerError = {
  name: string;
  code?: string;
  category?: string;
  message: string;
  stack?: string;
  httpStatus?: number;
  recoveryId?: string;
  cause?: SafeServerError;
};

const safeMessages: Record<string, string> = {
  EACCES: 'Filesystem permission denied.',
  EPERM: 'Filesystem operation not permitted.',
  ENOSPC: 'Filesystem has no free space.',
  EROFS: 'Filesystem is read-only.',
  ETIMEDOUT: 'Operation timed out.',
  ECONNREFUSED: 'Connection was refused.',
  ECONNRESET: 'Connection was reset.',
  ENOTFOUND: 'Remote host was not found.',
  EAI_AGAIN: 'Remote name lookup timed out.',
  ABORT_ERR: 'Operation was aborted.',
  P1003: 'Database file was not found.',
  P1008: 'Database operation timed out.',
  P1017: 'Database connection was closed.',
  P2002: 'Database uniqueness constraint failed.',
  P2003: 'Database foreign key constraint failed.',
  P2021: 'Required database table was not found.',
  P2022: 'Required database column was not found.',
  P2024: 'Database connection acquisition timed out.',
  P2025: 'Required database record was not found.',
  P2028: 'Database transaction failed.',
  P2034: 'Database write conflict occurred.',
  SQLITE_BUSY: 'Database is busy.',
  SQLITE_BUSY_SNAPSHOT: 'Database snapshot is busy.',
  SQLITE_LOCKED: 'Database is locked.',
  SQLITE_LOCKED_SHAREDCACHE: 'Shared database cache is locked.',
  SQLITE_CANTOPEN: 'Database could not be opened.',
  SQLITE_READONLY: 'Database is read-only.',
  SQLITE_FULL: 'Database or disk is full.',
  SQLITE_IOERR: 'Database I/O failed.',
  SQLITE_CORRUPT: 'Database file is corrupt.',
  SQLITE_NOTADB: 'Configured file is not a database.',
  SQLITE_CONSTRAINT: 'Database constraint failed.',
  SQLITE_CONSTRAINT_UNIQUE: 'Database uniqueness constraint failed.',
  SQLITE_CONSTRAINT_FOREIGNKEY: 'Database foreign key constraint failed.',
  SQLITE_CONSTRAINT_NOTNULL: 'Database required-value constraint failed.',
  SQLITE_CONSTRAINT_CHECK: 'Database check constraint failed.',
  AccessDenied: 'Object storage access was denied.',
  InvalidAccessKeyId: 'Object storage access key was rejected.',
  SignatureDoesNotMatch: 'Object storage signature validation failed.',
  NoSuchBucket: 'Object storage bucket was not found.',
  ExpiredToken: 'Object storage session token expired.',
  InvalidToken: 'Object storage session token is invalid.',
  RequestTimeTooSkewed: 'Object storage request time was rejected.',
  RequestTimeout: 'Object storage request timed out.',
  SlowDown: 'Object storage throttled the request.',
  ServiceUnavailable: 'Object storage service is unavailable.',
  NoSuchKey: 'Object storage key was not found.',
  PreconditionFailed: 'Object storage write precondition failed.',
};
const safeCadMessages: Record<string, string> = {
  EMPTY_FILE: 'Uploaded file was empty.', FILE_NOT_FOUND: 'Stored file was not found.', FILE_TOO_LARGE: 'Upload size limit exceeded.',
  INVALID_ID: 'Identifier validation failed.', INVALID_JSON: 'JSON validation failed.', INVALID_METADATA: 'Upload metadata validation failed.',
  INVALID_ORIGIN: 'Origin validation failed.', INVALID_QUERY: 'Query validation failed.', INVALID_UPLOAD: 'Multipart upload validation failed.',
  LOCATION_MISMATCH: 'Location ownership validation failed.', LOCATION_NOT_FOUND: 'Location was not found.', MISSING_FILE: 'Upload file was missing.',
  STORAGE_UNAVAILABLE: 'Storage operation failed.', UNSAFE_PATH: 'Storage path validation failed.', UNSUPPORTED_FILE: 'File format validation failed.',
};
const objectStorageCodes = ['AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch', 'NoSuchBucket', 'ExpiredToken', 'InvalidToken', 'RequestTimeTooSkewed', 'RequestTimeout', 'SlowDown', 'ServiceUnavailable', 'NoSuchKey', 'PreconditionFailed'];
const allowedExternalCodes = new Set([...Object.keys(safeMessages), ...Object.keys(safeCadMessages), ...objectStorageCodes]);
const allowedErrorNames = new Set(['Error', 'CadError', 'TypeError', 'RangeError', 'SyntaxError', 'AbortError', 'TimeoutError', 'S3ServiceException', 'PrismaClientKnownRequestError', 'PrismaClientInitializationError', 'SqliteError', ...objectStorageCodes]);
const recoveryIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const categories: Record<string, string> = {
  EACCES: 'filesystem_permission', EPERM: 'filesystem_permission', ENOSPC: 'filesystem_capacity', EROFS: 'filesystem_permission',
  ETIMEDOUT: 'network_timeout', ECONNREFUSED: 'network_connection', ECONNRESET: 'network_connection', ENOTFOUND: 'network_dns', EAI_AGAIN: 'network_dns', ABORT_ERR: 'operation_aborted',
  P1003: 'database_open', P1008: 'database_timeout', P1017: 'database_connection', P2002: 'database_constraint', P2003: 'database_constraint',
  P2021: 'database_schema', P2022: 'database_schema', P2024: 'database_timeout', P2025: 'database_record', P2028: 'database_transaction', P2034: 'database_conflict',
  SQLITE_BUSY: 'database_lock', SQLITE_BUSY_SNAPSHOT: 'database_lock', SQLITE_LOCKED: 'database_lock', SQLITE_LOCKED_SHAREDCACHE: 'database_lock', SQLITE_CANTOPEN: 'database_open', SQLITE_READONLY: 'database_permission', SQLITE_FULL: 'database_capacity',
  SQLITE_IOERR: 'database_io', SQLITE_CORRUPT: 'database_integrity', SQLITE_NOTADB: 'database_integrity', SQLITE_CONSTRAINT: 'database_constraint', SQLITE_CONSTRAINT_UNIQUE: 'database_constraint', SQLITE_CONSTRAINT_FOREIGNKEY: 'database_constraint', SQLITE_CONSTRAINT_NOTNULL: 'database_constraint', SQLITE_CONSTRAINT_CHECK: 'database_constraint',
  AccessDenied: 'object_storage_auth', InvalidAccessKeyId: 'object_storage_auth', SignatureDoesNotMatch: 'object_storage_auth', ExpiredToken: 'object_storage_auth', InvalidToken: 'object_storage_auth',
  NoSuchBucket: 'object_storage_configuration', NoSuchKey: 'object_storage_not_found', RequestTimeTooSkewed: 'object_storage_clock', RequestTimeout: 'object_storage_timeout',
  SlowDown: 'object_storage_throttle', ServiceUnavailable: 'object_storage_unavailable', PreconditionFailed: 'object_storage_conflict',
};

function safeToken(value: unknown, fallback: string) {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value) ? value : fallback;
}

function errorCode(error: ErrorLike) {
  const code = safeToken(error.code, '');
  if (allowedExternalCodes.has(code)) return code;
  const name = safeToken(error.name, '');
  return objectStorageCodes.includes(name) ? name : undefined;
}

function safeStack(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const allowed = new Set(['CadStorage.receive', 'S3ObjectStorage.prepare', 'ConfiguredCadStorage.prepare', 'CadRepository.register', 'uploadCad', 'writeTransaction', 'requireSameOrigin', 'POST', 'failure']);
  const frames: string[] = [];
  for (const line of value.split(/\r?\n/).slice(1, 9)) {
    const match = line.match(/^\s*at\s+(?:async\s+)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/);
    if (match && allowed.has(match[1])) frames.push(match[1]);
  }
  return frames.length ? frames.join(' > ').slice(0, 512) : undefined;
}

function safeMessage(error: unknown, code?: string) {
  if (error instanceof CadError) return (code && safeCadMessages[code]) || 'Application error details suppressed.';
  if (code && safeMessages[code]) return safeMessages[code];
  return 'Internal error details suppressed.';
}

export function sanitizeServerError(error: unknown, depth = 0, seen = new WeakSet<object>()): SafeServerError {
  if ((typeof error !== 'object' && typeof error !== 'function') || error === null) {
    return { name: 'UnknownError', message: 'Non-error value suppressed.' };
  }
  if (seen.has(error)) return { name: 'CircularCause', message: 'Circular error cause suppressed.' };
  seen.add(error);
  const value = error as ErrorLike;
  const code = errorCode(value);
  const result: SafeServerError = {
    name: allowedErrorNames.has(safeToken(value.name, '')) ? safeToken(value.name, 'Error') : (error instanceof Error ? 'ExternalError' : 'UnknownError'),
    ...(code ? { code } : {}),
    message: safeMessage(error, code),
  };
  if (code && categories[code]) result.category = categories[code];
  const stack = safeStack(value.stack);
  if (stack) result.stack = stack;
  const httpStatus = value.$metadata?.httpStatusCode;
  if (typeof httpStatus === 'number' && Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599) result.httpStatus = httpStatus;
  if (typeof value.recoveryId === 'string' && recoveryIdPattern.test(value.recoveryId)) result.recoveryId = value.recoveryId;
  if (depth < 2 && value.cause !== undefined) result.cause = sanitizeServerError(value.cause, depth + 1, seen);
  return result;
}

export class UploadDiagnostics {
  readonly requestId = randomUUID();
  readonly startedAt = Date.now();
  private firstFailure?: { stage: UploadStage; error: SafeServerError };
  private backend?: 'local' | 's3';

  constructor() {
    this.write('cad_upload_request', 'request_received', 'started');
  }

  setBackend(value: unknown) {
    if (value === 'local' || value === 's3') this.backend = value;
  }

  record(stage: UploadStage, outcome: Outcome, options: { error?: unknown; status?: number; recoveryId?: string } = {}) {
    const error = options.error === undefined ? undefined : sanitizeServerError(options.error);
    if (outcome === 'failure' && error) {
      if (this.firstFailure) return;
      this.firstFailure = { stage, error };
    }
    this.write('cad_upload_stage', stage, outcome, options.status, error, options.recoveryId);
  }

  finishSuccess(status = 201) {
    this.write('cad_upload_completed', 'response', 'success', status);
  }

  finishFailure(error: unknown, stage: UploadStage = 'response', status = 500) {
    if (!this.firstFailure) this.record(stage, 'failure', { error, status });
    this.write('cad_upload_completed', this.firstFailure?.stage ?? stage, 'failure', status, this.firstFailure?.error ?? sanitizeServerError(error));
  }

  private write(event: string, stage: UploadStage, outcome: Outcome, status?: number, error?: SafeServerError, recoveryId?: string) {
    const level = outcome === 'failure' ? 'error' : outcome === 'warning' ? 'warn' : 'info';
    const entry = {
      event,
      timestamp: new Date().toISOString(),
      level,
      appVersion: packageInfo.version,
      requestId: this.requestId,
      stage,
      elapsedMs: Math.max(0, Date.now() - this.startedAt),
      outcome,
      ...(this.backend ? { backend: this.backend } : {}),
      ...(status ? { status } : {}),
      ...(recoveryId && recoveryIdPattern.test(recoveryId) ? { recoveryId } : {}),
      ...(error ? { error } : {}),
    };
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }
}
