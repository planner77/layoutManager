import { context } from '@/server/context';
import { resolveG7RuntimeGate } from '@/server/g7-operational/runtime-gate';
import { RequestLogContext } from '@/server/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Record first/sampled failures and a recovery; never flood logs on 30s health polls.
let unhealthy = false;
let lastFailureLog = 0;
export async function GET(request: Request) {
  const requestLog = new RequestLogContext(request, 'api', 'health');
  try {
    if (process.env.G7_GREENFIELD_AUTOMATED === 'true' && resolveG7RuntimeGate().state !== 'ACTIVE')
      throw new Error('G7_AUTO_RUNTIME_BLOCKED');
    await context().list.options();
    if (unhealthy) requestLog.info('health_check_recovered', { outcome: 'success' });
    unhealthy = false;
    requestLog.completed(200);
    return Response.json({ status: 'ok' }, { headers: requestLog.responseHeaders({ 'Cache-Control': 'no-store' }) });
  } catch (error) {
    const now = Date.now();
    if (!unhealthy || now - lastFailureLog >= 300_000) {
      requestLog.error('health_check_failed', error, { outcome: 'failure', httpStatus: 503, errorCode: 'HEALTH_UNAVAILABLE' });
      requestLog.completed(503, 'failure');
      lastFailureLog = now;
    }
    unhealthy = true;
    return Response.json({ status: 'unavailable' }, { status: 503, headers: requestLog.responseHeaders({ 'Cache-Control': 'no-store' }) });
  }
}
