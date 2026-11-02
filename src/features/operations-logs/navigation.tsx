'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export function OperationsLogsLink() {
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let current: AbortController | undefined;
    const check = async () => {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      try {
        const status = await fetch('/api/g7-runtime/status', {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        });
        if (!status.ok || (await status.json()).state !== 'ACTIVE') {
          if (!controller.signal.aborted) setAllowed(false);
          return;
        }
        // A fresh Greenfield install has no identity yet. Do not generate log
        // access denials while the operator is still creating the first Admin.
        const session = await fetch('/api/g7-runtime/auth/session', {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        });
        if (!session.ok) {
          if (!controller.signal.aborted) setAllowed(false);
          return;
        }
        const response = await fetch('/api/operations/logs/access', {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        });
        const body = response.ok ? await response.json() : null;
        if (!controller.signal.aborted) setAllowed(body?.allowed === true);
      } catch {
        if (!controller.signal.aborted) setAllowed(false);
      }
    };
    void check();
    window.addEventListener('focus', check);
    return () => { current?.abort(); window.removeEventListener('focus', check); };
  }, [pathname]);
  return allowed ? <Link href="/operations/logs" className="flex min-h-11 items-center gap-2">운영 · 서버 로그</Link> : null;
}
