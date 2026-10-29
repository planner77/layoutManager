'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

/** Default OFF does not expose an inactive operating screen. */
export function RuntimeAccountLink() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/g7-runtime/status', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(value => setVisible(value?.state === 'ACTIVE'))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return visible ? <Link className="flex min-h-11 items-center gap-2" href="/g7-runtime">계정 / 로그인</Link> : null;
}
