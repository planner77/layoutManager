import { context } from '@/server/context';
import { RequestLogContext } from '@/server/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request = new Request('http://localhost/api/health')) {
  const requestLog = new RequestLogContext(request, 'api', 'health');
  try {
    await context().list.options();
    requestLog.completed(200);
    return Response.json({ status: 'ok' }, { headers: requestLog.responseHeaders({ 'Cache-Control': 'no-store' }) });
  } catch (error) {
    requestLog.error('health_check_failed', error, { outcome: 'failure', httpStatus: 503, errorCode: 'HEALTH_UNAVAILABLE' });
    requestLog.completed(503, 'failure');
    return Response.json({ status: 'unavailable' }, { status: 503, headers: requestLog.responseHeaders({ 'Cache-Control': 'no-store' }) });
  }
}
