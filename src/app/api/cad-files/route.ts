import { context } from '@/server/context';
import { failure, requireSameOrigin } from '@/server/http';
import { uploadCad } from '@/server/services/upload';
export const runtime = 'nodejs';
export async function POST(request: Request) { try { requireSameOrigin(request); const { repo, storage } = context(); return Response.json(await uploadCad(request, repo, storage), { status: 201 }); } catch (error) { return failure(error); } }
