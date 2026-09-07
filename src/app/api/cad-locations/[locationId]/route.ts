import { context } from '@/server/context';
import { failure } from '@/server/http';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ locationId: string }> }) {
  try { return Response.json(await context().list.location((await params).locationId), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return failure(error); }
}
