import { handleGreenfieldFirstSetup } from '@/server/g7-operational/greenfield-first-setup';
import { resolveG7RuntimeGate } from '@/server/g7-operational/runtime-gate';
import { handleG7RuntimeApi, runtimeReply } from '@/server/g7-operational/runtime-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Args = { params: Promise<{ segments: string[] }> };

async function execute(request: Request, args: Args) {
  const gate = resolveG7RuntimeGate();
  const segments = (await args.params).segments;
  if (request.method === 'GET' && segments.length === 1 && segments[0] === 'status') {
    return runtimeReply(200, { state: gate.state, authEnabled: gate.authEnabled,
      cadWriteEnabled: gate.cadWriteEnabled });
  }
  if (gate.state !== 'ACTIVE') {
    return runtimeReply(gate.state === 'OFF' ? 404 : 503,
      { error: { code: gate.state === 'OFF' ? 'NOT_FOUND' : 'G7_RUNTIME_BLOCKED' } });
  }
  if (segments.length === 1 && segments[0] === 'setup')
    return handleGreenfieldFirstSetup(request, gate);
  return handleG7RuntimeApi(request, segments, gate);
}

export async function GET(request: Request, args: Args) { return execute(request, args); }
export async function POST(request: Request, args: Args) { return execute(request, args); }
export async function PUT(request: Request, args: Args) { return execute(request, args); }
export async function DELETE(request: Request, args: Args) { return execute(request, args); }
