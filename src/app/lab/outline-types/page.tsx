import { OutlineTypeManagerPreview } from '@/features/cad-viewer/outline-type-manager-preview';

export default function OutlineTypePreviewPage() {
  return (
    <section className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-bold">외곽선 최상위 업무 타입 — 비영속 설계 시안 (Issue #41)</h1>
      <p className="text-sm text-slate-700">
        관리자 타입 등록 흐름을 검토하기 위한 격리된 테스트 화면입니다.
        실제 Viewer 상단 관리 메뉴는 권한 정책 확정 전까지 비활성 상태입니다.
      </p>
      <OutlineTypeManagerPreview />
    </section>
  );
}
