import { headers } from 'next/headers';
import Link from 'next/link';
import { OperationsLogsConsole } from '@/features/operations-logs/console';
import { authorizeOperationLogs } from '@/server/logging/access';
import { resolveG7RuntimeGate } from '@/server/g7-operational/runtime-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function OperationsLogsPage() {
  let allowed = false;
  try {
    const gate = resolveG7RuntimeGate();
    const origin = gate.state === 'ACTIVE' ? gate.origin : 'http://localhost';
    await authorizeOperationLogs(new Request(origin + '/operations/logs', { headers: await headers() }));
    allowed = true;
  } catch { /* A denied shell must not mount a reader or serialize any log data. */ }
  if (!allowed) return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
    <h1 className="text-xl font-semibold">서버 로그 접근 제한</h1>
    <p role="alert">운영 인증과 서버 로그 조회 권한이 필요합니다. 관리자에게 logs:read 권한을 확인하세요.</p>
    <Link href="/g7-runtime" className="inline-flex min-h-11 items-center text-teal-800 underline">계정 / 로그인</Link>
  </section>;
  return <OperationsLogsConsole/>;
}
