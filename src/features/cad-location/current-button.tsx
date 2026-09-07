'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function CurrentButton({ locationId, versionId }: { locationId: string; versionId: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const router = useRouter();
  async function change() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/cad-locations/${locationId}/current`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error?.message ?? 'Current 변경에 실패했습니다.'); }
      router.refresh();
    } catch(error) { setError(error instanceof Error ? error.message : 'Current 변경에 실패했습니다.'); }
    finally { setBusy(false); }
  }
  return <span><Button type="button" variant="outline" size="sm" disabled={busy} onClick={change}>{busy ? '변경 중…' : 'Current 지정'}</Button>{error && <span role="alert" className="mt-2 block max-w-52 whitespace-normal text-xs text-red-700">{error}</span>}</span>;
}
