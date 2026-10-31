import { context } from '@/server/context';
import { failure } from '@/server/http';
import { RequestLogContext } from '@/server/logger';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ locationId: string }> }) {
  const requestLog = new RequestLogContext(request, 'api', 'cad_location');
  try {
    requestLog.phase('database_read');
    const result = await context().list.location((await params).locationId);
    requestLog.phase('database_read', 'success');
    requestLog.completed(200);
    return Response.json(result, { headers: requestLog.responseHeaders({ 'Cache-Control': 'no-store' }) });
  } catch (error) {
    return failure(error, { request: requestLog });
  }
}
