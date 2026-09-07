import { validateId, CadError } from '@/domain/cad';
import { context } from '@/server/context';
import { failure } from '@/server/http';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ versionId: string }> }) { try { const { repo, storage } = context(); const id = validateId((await params).versionId); const file = await repo.db.cadFileVersion.findUnique({ where: { id } }); if (!file) throw new CadError('FILE_NOT_FOUND', '도면을 찾을 수 없습니다.', 404); const content = await storage.content(file.storagePath); return new Response(content.stream as ReadableStream<Uint8Array>, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(content.size), 'Content-Disposition': `attachment; filename="original.${file.fileFormat.toLowerCase()}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' } }); } catch(error) { return failure(error); } }
