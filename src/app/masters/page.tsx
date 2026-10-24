import { MasterManager } from "@/features/master/master-manager";
export default function Page() {
  return (
    <section>
      <h1 className="text-2xl font-bold">위치 기준정보</h1>
      <p className="mb-7 mt-2 text-sm text-slate-500">
        사업부 → 제품 → 사업장/법인 → 동 → 층 순서로 등록하고 관리합니다. 이력이
        있는 항목은 비활성화할 수 있습니다. 이전 버전 또는 Current가 없는 도면은 해당 층을 선택한 뒤 &apos;버전 이력&apos;에서 확인·지정할 수 있습니다.
      </p>
      <MasterManager />
    </section>
  );
}
