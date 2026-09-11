import { context } from '@/server/context';
import { failure, requireSameOrigin } from '@/server/http';
import { validateDeletePassword, validateId, CadError } from '@/domain/cad';
import { revalidatePath } from 'next/cache';
import { verifyDeletePassword } from '@/server/password';
import { randomUUID } from 'node:crypto';
export const runtime = 'nodejs';
const attempts = new Map<string, { count: number; until: number }>();
function pruneAttempts(now: number) { for (const [key, state] of attempts) if (state.until <= now) attempts.delete(key); if (attempts.size > 10000) attempts.clear(); }
export async function DELETE(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const requestId = randomUUID();
  try {
    requireSameOrigin(request);
    const id = validateId((await params).versionId);
    if (Number(request.headers.get('content-length') ?? 0) > 1024) throw new CadError('INVALID_DELETE_PASSWORD', '요청이 너무 큽니다.');
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new CadError('INVALID_DELETE_PASSWORD', 'JSON 비밀번호를 입력해주세요.');
    let body: unknown;
    try {
      if (!request.body) throw new Error('missing body');
      const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
      for (;;) { const part = await reader.read(); if (part.done) break; total += part.value.byteLength; if (total > 1024) { await reader.cancel(); throw new CadError('INVALID_DELETE_PASSWORD', '요청이 너무 큽니다.'); } chunks.push(part.value); }
      body = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks.map(chunk => Buffer.from(chunk)))));
    } catch (error) { if (error instanceof CadError) throw error; throw new CadError('INVALID_DELETE_PASSWORD', 'JSON 비밀번호를 입력해주세요.'); }
    const password = validateDeletePassword((body as { password?: unknown })?.password);
    const key = id, now = Date.now(); pruneAttempts(now); const state = attempts.get(key);
    if (state && state.until > now && state.count >= 5) { const e = new CadError('DELETE_RATE_LIMITED', '잠시 후 다시 시도해주세요.', 429); throw e; }
    const { repo, storage } = context();
    const file = await repo.db.cadFileVersion.findUnique({ where: { id }, select: { deletePasswordHash: true } });
    if (!file) throw new CadError('FILE_NOT_FOUND', '도면 버전을 찾을 수 없습니다.', 404);
    if (!await verifyDeletePassword(password, file.deletePasswordHash)) {
      const next = state && state.until > now ? { count: state.count + 1, until: state.until } : { count: 1, until: now + 60_000 }; attempts.set(key, next);
      if (next.count > 5) throw new CadError('DELETE_RATE_LIMITED', '잠시 후 다시 시도해주세요.', 429);
      throw new CadError('INVALID_DELETE_PASSWORD', '삭제 비밀번호가 올바르지 않습니다.', 403);
    }
    attempts.delete(key);
    const deleted = await repo.deleteVersion(id, password);
    let cleanupPending = false;
    try { await storage.removeUncommitted(deleted.storagePath); await repo.db.cadDeletionJob.delete({ where: { id: deleted.jobId } }); }
    catch { cleanupPending = true; }
    try { revalidatePath('/'); } catch { /* cache refresh is best effort */ }
    return Response.json({ deleted: true, cleanupPending, requestId }, { status: cleanupPending ? 202 : 200, headers: { 'X-Request-Id': requestId } });
  } catch (error) { return failure(error); }
}
