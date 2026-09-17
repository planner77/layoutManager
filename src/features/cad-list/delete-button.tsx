'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { useGlobalLoading } from '@/components/global-loading';

export function DeleteButton({ versionId, filename, version, location, isCurrent }: { versionId: string; filename: string; version: number; location: string; isCurrent: boolean }) {
  const router = useRouter();
  const { runWithLoading } = useGlobalLoading();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const deletingRef = useRef(false);
  const acknowledgeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (pending) acknowledgeRef.current?.focus();
  }, [pending]);

  function close() {
    setOpen(false);
    setPassword('');
    setError('');
    setPending(false);
  }

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      setOpen(true);
      setError('');
      setPending(false);
    } else if (!busy && !pending) {
      close();
    }
  }

  async function remove() {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setBusy(true);
    setError('');
    try {
      await runWithLoading('도면을 삭제하는 중입니다...', async () => {
        let r: Response;
        try {
          r = await fetch(`/api/cad-files/${versionId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
        } catch {
          throw new Error('OUTCOME_UNKNOWN');
        }
        let d: unknown;
        try {
          d = await r.json();
        } catch {
          throw new Error('OUTCOME_UNKNOWN');
        }
        if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('OUTCOME_UNKNOWN');
        const body = d as { deleted?: unknown; cleanupPending?: unknown; error?: { code?: unknown } };
        if (!r.ok) {
          const messages: Record<string, string> = { INVALID_DELETE_PASSWORD: '삭제 비밀번호가 올바르지 않습니다.', DELETE_RATE_LIMITED: '요청이 많습니다. 잠시 후 다시 시도해주세요.', FILE_NOT_FOUND: '도면 버전을 찾을 수 없습니다.' };
          throw new Error(messages[String(body.error?.code)] ?? '삭제 요청을 처리하지 못했습니다.');
        }
        if (body.deleted !== true || typeof body.cleanupPending !== 'boolean') throw new Error('OUTCOME_UNKNOWN');
        setPassword('');
        if (r.status === 202 || body.cleanupPending) {
          setPending(true);
          return;
        }
        close();
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error && e.message === 'OUTCOME_UNKNOWN' ? '서버 응답을 확인할 수 없습니다. 삭제 결과가 불확실하므로 목록을 새로고침해 확인해주세요.' : e instanceof Error ? e.message : '삭제에 실패했습니다.');
    } finally {
      deletingRef.current = false;
      setBusy(false);
    }
  }

  function acknowledge() {
    close();
    router.refresh();
  }

  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild>
      <Button type="button" variant="outline" size="sm" className="text-red-700">삭제</Button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
      <Dialog.Content
        className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto overflow-x-hidden whitespace-normal rounded-xl bg-white p-6 shadow-xl [overflow-wrap:anywhere]"
        onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}
        onPointerDownOutside={event => { if (busy) event.preventDefault(); }}
        onInteractOutside={event => { if (busy) event.preventDefault(); }}
      >
        <Dialog.Title className="font-semibold">도면 삭제</Dialog.Title>
        {pending ? <>
          <Dialog.Description role="status" className="mt-3 text-sm">도면 정보는 삭제되었고 원본 파일 정리는 대기 중입니다. 관리 작업에서 안전하게 다시 처리됩니다.</Dialog.Description>
          <div className="mt-5 flex justify-end"><Button ref={acknowledgeRef} type="button" onClick={acknowledge}>확인</Button></div>
        </> : <>
          <Dialog.Description className="mt-3 text-sm">{location}의 {filename} · V{version}을 삭제하시겠습니까?</Dialog.Description>
          {isCurrent && <p className="mt-2 text-sm font-medium text-amber-700">이 버전은 Current입니다. 삭제하면 이 위치의 Current가 비어 있으며 자동으로 다른 버전을 지정하지 않습니다.</p>}
          <label className="mt-4 block min-w-0 text-sm">삭제 비밀번호
            <input autoFocus type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 block w-full min-w-0" autoComplete="current-password" />
          </label>
          {error && <div role="alert" className="mt-2 text-sm text-red-700">{error}</div>}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={close}>취소</Button>
            <Button type="button" disabled={busy || password.length < 4} onClick={remove}>{busy ? '삭제 중…' : '삭제 확인'}</Button>
          </div>
        </>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
