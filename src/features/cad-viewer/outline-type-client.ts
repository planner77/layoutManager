'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GlobalOutlineTypeDto, OutlineTypeAccessDto, OutlineTypePageDto } from '@/domain/outline-type-catalog';
import { runtimeCadHeaders, RuntimeClientError } from '@/features/g7-runtime/client';

export class OutlineTypeClientError extends Error {
  constructor(readonly status: number, readonly code: string) {
    const message = status === 401 ? '로그인이 필요하거나 세션이 만료되었습니다.'
      : status === 403 ? '관리자 권한 또는 쓰기 승인이 없습니다.'
      : status === 409 ? '이름이 중복되거나 다른 수정이 반영되었습니다. 목록을 다시 조회한 뒤 선택하세요.'
      : status === 404 ? '수정 대상 타입을 찾지 못했습니다. 목록을 다시 조회하세요.'
      : status === 400 ? '입력값을 확인하세요. 이름·설명·정렬 순서와 변경 버전을 확인해주세요.'
      : '서버 업무 타입을 사용할 수 없습니다. 운영 인증과 설치 버전을 확인하세요.';
    super(message);
  }
}
async function json<T>(path: string, signal: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, signal, credentials: 'same-origin', cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new OutlineTypeClientError(response.status, String(body?.error?.code ?? 'TYPE_UNAVAILABLE'));
  return body as T;
}
export function readOutlineTypeAccess(signal: AbortSignal) {
  return json<OutlineTypeAccessDto>('/api/outline-types/access', signal);
}
export function readOutlineTypes(q: string, offset: number, signal: AbortSignal) {
  const params = new URLSearchParams({ includeInactive: 'true', offset: String(offset), limit: '50' });
  if (q) params.set('q', q);
  return json<OutlineTypePageDto>('/api/outline-types?' + params, signal);
}
export async function writeOutlineType(id: string | null, body: object, signal: AbortSignal) {
  let headers: Headers;
  try { headers = await runtimeCadHeaders({ 'Content-Type': 'application/json' }); }
  catch (error) {
    throw new OutlineTypeClientError(error instanceof RuntimeClientError ? error.status : 503,
      error instanceof RuntimeClientError ? error.code : 'TYPE_UNAVAILABLE');
  }
  return json<{ item: GlobalOutlineTypeDto }>('/api/outline-types' + (id ? '/' + encodeURIComponent(id) : ''), signal, {
    method: id ? 'PATCH' : 'POST', headers, body: JSON.stringify(body),
  });
}

export function useOutlineTypeAccess(scope: string) {
  const [access, setAccess] = useState<OutlineTypeAccessDto | null>(null);
  const [reason, setReason] = useState('관리자 인증과 업무 타입 저장소 확인이 필요합니다.');
  const current = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    current.current?.abort();
    const controller = new AbortController(); current.current = controller;
    try {
      const status = await fetch('/api/g7-runtime/status', { signal: controller.signal, credentials: 'same-origin', cache: 'no-store' });
      if (!status.ok || (await status.json()).state !== 'ACTIVE') throw new OutlineTypeClientError(503, 'RUNTIME_OFF');
      const value = await readOutlineTypeAccess(controller.signal);
      if (controller.signal.aborted) return;
      setAccess(value);
      setReason(!value.canManage ? '외곽선 타입 관리는 관리자만 사용할 수 있습니다.'
        : !value.writeEnabled ? '서버 쓰기 승인이 비활성화되어 있습니다.' : '');
    } catch (error) {
      if (!controller.signal.aborted) {
        setAccess(null);
        setReason(error instanceof OutlineTypeClientError ? error.message : '업무 타입 권한을 확인하지 못했습니다.');
      }
    }
  }, []);
  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => { if (!disposed) void refresh(); });
    const focus = () => { void refresh(); };
    window.addEventListener('focus', focus);
    return () => { disposed = true; current.current?.abort(); window.removeEventListener('focus', focus); };
  }, [scope, refresh]);
  return { access, reason, refresh };
}
