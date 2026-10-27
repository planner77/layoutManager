/** #109 S3-2: RESERVED Auth API path, NOT an operational activation.
 * Entire production build is forced to 404 (even with every env flag true).
 * Only Linux nonproduction + disposable candidate DB + loopback origin
 * enables this preview. S3-4 must implement separate trusted release binding.
 */
import { resolveG7S3PreviewGate } from '@/server/g7-operational/preview-gate';
import { handleG7S3PreviewApi } from '@/server/g7-operational/preview-handler';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Args = {params: Promise<{segments:string[]}>};
const disabled=()=>Response.json({error:{code:'NOT_FOUND'}},
  {status:404,headers:{'Cache-Control':'no-store'}});
async function execute(req:Request,args:Args) {
  // No runtime operation approval can ever be supplied through a request.
  const gate=resolveG7S3PreviewGate(process.env);
  if(!gate) return disabled();
  return handleG7S3PreviewApi(req,(await args.params).segments,gate);
}
export async function GET(req:Request,args:Args){return execute(req,args);}
export async function POST(req:Request,args:Args){return execute(req,args);}
export async function PUT(req:Request,args:Args){return execute(req,args);}
export async function DELETE(req:Request,args:Args){return execute(req,args);}
