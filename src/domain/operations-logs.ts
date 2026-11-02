export type LogEntryDto = Readonly<{
  logId: string; timestamp: string; level: 'debug'|'info'|'warn'|'error'; event: string;
  source: 'app'|'maintenance'; component: string; operation: string; appVersion: string;
  requestId?: string; jobId?: string; outcome?: 'started'|'success'|'warning'|'failure';
  elapsedMs?: number; errorCode?: string; httpStatus?: number; stage?: string;
}>;
export type OperationLogsResult = Readonly<{
  items: LogEntryDto[]; nextCursor: string|null; sourceCoverage: 'app-structured-only';
  status: 'ok'|'disabled'|'partial'; skippedLines: number; scanTruncated: boolean;
}>;
