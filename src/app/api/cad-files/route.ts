import { context } from '@/server/context';
import { failure, requireSameOrigin } from '@/server/http';
import { uploadCad } from '@/server/services/upload';
import { revalidatePath } from 'next/cache';
export const runtime = 'nodejs';
export async function GET(request: Request) { try { return Response.json(await context().list.search(new URL(request.url).searchParams), { headers: { 'Cache-Control': 'no-store' } }); } catch (error) { return failure(error); } }
export async function POST(request: Request) { try { requireSameOrigin(request); const { repo, storage } = context(); const result = await uploadCad(request, repo, storage); revalidatePath('/'); revalidatePath(`/cad/locations/${result.locationId}`); return Response.json(result, { status: 201 }); } catch (error) { return failure(error); } }
