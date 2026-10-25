'use client';

import { useState, type FormEvent } from 'react';
import {
  addPreviewOutlineType,
  sortedPreviewOutlineTypes,
  updatePreviewOutlineType,
  type OutlineType,
} from '@/domain/outline-type';

const emptyForm = { name: '', description: '', sortOrder: '0' };

/**
 * Unprivileged design sandbox. All changes live only in React state and are
 * discarded on reload. No production management capability is implied.
 */
export function OutlineTypeManagerPreview() {
  const [items, setItems] = useState<OutlineType[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function resetForm() {
    setSelectedId(null);
    setSelectedRevision(null);
    setForm(emptyForm);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const draft = {
      name: form.name,
      description: form.description,
      sortOrder: form.sortOrder.trim() === '' ? Number.NaN : Number(form.sortOrder),
    };
    try {
      const next = selectedId === null
        ? addPreviewOutlineType(items, draft, crypto.randomUUID(), new Date().toISOString())
        : updatePreviewOutlineType(items, selectedId, selectedRevision ?? -1, draft, new Date().toISOString());
      setItems(next);
      setNotice(selectedId === null ? '시안에 타입을 추가했습니다. 서버에는 저장되지 않았습니다.' :
        '시안 항목을 수정했습니다. 서버에는 저장되지 않았습니다.');
      resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '시안 데이터 검증에 실패했습니다.');
    }
  }

  function beginEdit(item: OutlineType) {
    setSelectedId(item.id);
    setSelectedRevision(item.revision);
    setForm({ name: item.name, description: item.description ?? '', sortOrder: String(item.sortOrder) });
    setError(null);
    setNotice(null);
  }

  function toggleActive(item: OutlineType) {
    setError(null);
    setNotice(null);
    try {
      setItems(updatePreviewOutlineType(items, item.id, item.revision, {
        active: !item.active,
      }, new Date().toISOString()));
      setNotice(item.active ? '시안 항목을 비활성화했습니다. 기존 ID는 유지됩니다.' :
        '시안 항목을 복구했습니다. 서버에는 저장되지 않았습니다.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '상태 변경에 실패했습니다.');
    }
  }

  return (
    <div data-testid="outline-type-prototype" data-persistence="none" className="space-y-5">
      <aside role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <strong>설계 검증용 시안 — 운영 관리 기능 아님</strong>
        <p className="mt-1">
          로그인·Admin 권한·적용 범위·감사 보존 정책 미승인으로 운영 메뉴 및 저장 API가 차단되어 있습니다.
          아래 항목은 이 브라우저 화면의 메모리에만 존재하며 새로고침 시 사라집니다. 실제 외곽선과 연결되지 않습니다.
        </p>
      </aside>
      <section aria-label="외곽선 업무 타입 시안 편집" className="rounded-xl border border-slate-200 p-4">
        <h2 className="mb-3 text-lg font-semibold">{selectedId ? '타입 수정 시안' : '타입 추가 시안'}</h2>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            타입 이름 (1~100자)
            <input
              data-testid="outline-type-name" className="rounded border p-2" required maxLength={100}
              value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            정렬 순서 (0~9999)
            <input
              data-testid="outline-type-sort" className="rounded border p-2"
              type="number" min={0} max={9999} step={1} required
              value={form.sortOrder} onChange={event => setForm({ ...form, sortOrder: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            설명 (최대 500자)
            <textarea
              data-testid="outline-type-description" className="rounded border p-2" maxLength={500}
              value={form.description} onChange={event => setForm({ ...form, description: event.target.value })}
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" className="rounded bg-teal-700 px-4 py-2 text-sm text-white">
              {selectedId ? '시안 수정' : '시안 추가'}
            </button>
            {selectedId && <button type="button" className="rounded border px-4 py-2 text-sm" onClick={resetForm}>수정 취소</button>}
          </div>
        </form>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="mt-3 text-sm text-teal-800">{notice}</p>}
      </section>
      <section aria-label="외곽선 업무 타입 시안 목록" className="overflow-x-auto rounded-xl border border-slate-200 p-4">
        <h2 className="mb-3 text-lg font-semibold">최상위 업무 타입 시안 ({items.length}건)</h2>
        <p className="mb-3 text-sm text-slate-600">
          업무 타입은 외곽선 기하 알고리즘(CONVEX/PRECISE)과 무관합니다.
          비활성 타입도 목록 및 고정 ID를 유지하며, 신규 선택에서는 제외하도록 향후 연계합니다.
        </p>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead><tr className="border-b">
            <th className="p-2">이름</th><th className="p-2">설명</th>
            <th className="p-2">순서</th><th className="p-2">상태</th><th className="p-2">관리(시안)</th>
          </tr></thead>
          <tbody>
            {sortedPreviewOutlineTypes(items).map(item => (
              <tr key={item.id} data-testid="outline-type-row" className="border-b">
                <td className="p-2">
                  <span className="font-semibold">{item.name}</span>
                  <span className="block text-xs text-slate-500">ID {item.id.slice(0, 8)}… · rev {item.revision}</span>
                </td>
                <td className="p-2">{item.description ?? '—'}</td>
                <td className="p-2">{item.sortOrder}</td>
                <td className="p-2">{item.active ? '활성' : '비활성'}</td>
                <td className="flex gap-2 p-2">
                  <button type="button" className="rounded border px-2 py-1" onClick={() => beginEdit(item)}
                    aria-label={item.name + ' 수정'}>수정</button>
                  <button type="button" className="rounded border px-2 py-1" onClick={() => toggleActive(item)}
                    aria-label={item.name + (item.active ? ' 비활성화' : ' 복구')}>
                    {item.active ? '비활성화' : '복구'}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="p-5 text-center text-slate-500">
              등록된 시안 항목이 없습니다. (운영 기준정보와 무관)
            </td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
