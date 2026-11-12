'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSessionStatusSnapshot } from '@/features/g7-runtime/session-status';

export function OperationsLogsLink() {
  const pathname = usePathname();
  const session=useSessionStatusSnapshot();
  const [allowedFor, setAllowedFor] = useState<typeof session|null>(null);
  useEffect(() => {
    const controller=new AbortController();
    if(session.kind!=='signed-in')return ()=>controller.abort();
    const check = async () => {
      try {
        const response = await fetch('/api/operations/logs/access', {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        });
        const body = response.ok ? await response.json() : null;
        if (!controller.signal.aborted) setAllowedFor(body?.allowed === true?session:null);
      } catch {
        if (!controller.signal.aborted) setAllowedFor(null);
      }
    };
    void check();
    return () => controller.abort();
  }, [pathname,session]);
  return allowedFor===session&&session.kind==='signed-in' ? <Link href="/operations/logs" className="flex min-h-11 items-center gap-2">운영 · 서버 로그</Link> : null;
}
