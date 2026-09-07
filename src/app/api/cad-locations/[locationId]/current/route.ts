import { validateId, CadError } from '@/domain/cad';
import { context } from '@/server/context';
import { failure, requireSameOrigin } from '@/server/http';
import { revalidatePath } from 'next/cache';
export const runtime = 'nodejs';
export async function PUT(request: Request, { params }: { params: Promise<{ locationId: string }> }) { try { requireSameOrigin(request); let body; try { body = await request.json(); } catch { throw new CadError('INVALID_JSON','요청 내용을 확인해주세요.'); } const result = await context().repo.setCurrent(validateId((await params).locationId), validateId(String(body?.versionId ?? ''))); revalidatePath('/'); revalidatePath(`/cad/locations/${result.id}`); return Response.json({ id: result.id, currentVersionId: result.currentVersionId }); } catch(error) { return failure(error); } }
