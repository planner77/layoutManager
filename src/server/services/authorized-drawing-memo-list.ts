/** Shared G7 authority for memo-filtered drawing listings on the home page and API. */
import { CadError } from '@/domain/cad';
import { requireG7PublicAuthority } from '@/server/g7-operational/cad-guard';
import { resolveG7RuntimeGate } from '@/server/g7-operational/runtime-gate';
import { openG7RuntimeDb } from '@/server/g7-operational/runtime-db';
import { createDb } from '@/server/db';
import { requireMemoSearchSites } from '@/server/scene/scene-context';
import { CadListRepository } from '@/server/repositories/cad-list';

export async function withAuthorizedDrawingMemoList<T>(
  request: Request,
  action: (repo: CadListRepository, siteIds: readonly string[]) => Promise<T>,
): Promise<T> {
  const gate = resolveG7RuntimeGate();
  if (gate.state !== 'ACTIVE')
    throw new CadError('BUSINESS_AUTH_REQUIRED', '메모 검색에는 로그인이 필요합니다.', gate.state === 'OFF' ? 401 : 503);
  requireG7PublicAuthority(request, gate.origin);
  const probe = openG7RuntimeDb(gate, true);
  probe.close();
  const db = createDb('file:' + gate.databasePath);
  try {
    const sites = await requireMemoSearchSites(request, db, gate);
    return await action(new CadListRepository(db), sites);
  } finally {
    await db.$disconnect();
  }
}
