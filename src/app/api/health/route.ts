import { context } from '@/server/context';
import { resolveG7RuntimeGate } from '@/server/g7-operational/runtime-gate';
import { RequestLogContext } from '@/server/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const requestLog = new RequestLogContext(request, 'api', 'health');
  try {
    if (process.env.G7_GREENFIELD_AUTOMATED === 'true' && resolveG7RuntimeGate().state !== 'ACTIVE')
      throw new Error('G7_AUTO_RUNTIME_BLOCKED');
    await context().list.options();
    requestLog.completed(200);
    return Response.json({ status: 'ok' }, { headers: requestLog.responseHeaders({ 'Cache-Control': 'no-store' }) });
  } catch (error) {
    requestLog.error('health_check_failed', error, { outcome: 'failure', httpStatus: 503, errorCode: 'HEALTH_UNAVAILABLE' });
    requestLog.completed(503, 'failure');
    return Response.json({ status: 'unavailable' }, { status: 503, headers: requestLog.responseHeaders({ 'Cache-Control': 'no-store' }) });
  }
}
