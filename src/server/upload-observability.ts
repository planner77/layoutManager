import { randomUUID } from 'node:crypto';
import { writeLog } from './logger';
import { safeMessages, safeCadMessages, objectStorageCodes, categories } from './upload-error-catalog';
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

const allowedExternalCodes = new Set([...Object.keys(safeMessages), ...Object.keys(safeCadMessages), ...objectStorageCodes]);
const allowedErrorNames = new Set(['Error', 'CadError', 'TypeError', 'RangeError', 'SyntaxError', 'AbortError', 'TimeoutError', 'S3ServiceException', 'PrismaClientKnownRequestError', 'PrismaClientInitializationError', 'SqliteError', ...objectStorageCodes]);
const recoveryIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


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
    writeLog(level, event, {
      component: 'upload',
      operation: 'cad_upload',
      requestId: this.requestId,
      stage,
      elapsedMs: Math.max(0, Date.now() - this.startedAt),
      outcome,
      ...(this.backend ? { backend: this.backend } : {}),
      ...(status ? { status, httpStatus: status } : {}),
      ...(recoveryId && recoveryIdPattern.test(recoveryId) ? { recoveryId } : {}),
      ...(error ? { error, errorCode: error.code } : {}),
    });
  }
}
