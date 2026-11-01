import { MasterManager } from "@/features/master/master-manager";
export default function Page() {
  return (
    <section>
      <h1 className="text-2xl font-bold">위치 기준정보</h1>
      <p className="mb-7 mt-2 text-sm text-slate-500">
        사업부 → 제품 → 사업장/법인 → 동 → 층의 계층을 펼쳐 탐색하고, 선택한 항목의 상세에서 등록·편집·비활성화·안전 삭제를 관리합니다.
        층별 &apos;버전 이력&apos;에서는 Current가 없는 도면과 이전 버전도 확인할 수 있습니다.
      </p>
      <MasterManager />
    </section>
  );
}
