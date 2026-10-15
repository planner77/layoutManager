"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useGlobalLoading } from "@/components/global-loading";
type Building = { id: string; name: string };
type Site = { id: string; name: string; kind: string; buildings: Building[] };
type Product = {
  id: string;
  name: string;
  isUnclassified: boolean;
  sites: Site[];
};
type Bu = { id: string; name: string; products: Product[] };
export function FloorReclassify({ locationId }: { locationId: string }) {
  const [tree, setTree] = useState<Bu[]>([]),
    [ids, setIds] = useState({ bu: "", product: "", site: "", building: "" }),
    [error, setError] = useState("");
  const router = useRouter(),
    { runWithLoading } = useGlobalLoading();
  useEffect(() => {
    let active = true;
    fetch("/api/masters?active=true")
      .then((r) => r.json())
      .then((v) => {
        if (active) setTree(v.items);
      })
      .catch(() => {
        if (active) setError("대상 기준정보를 불러오지 못했습니다.");
      });
    return () => {
      active = false;
    };
  }, []);
  const bu = tree.find((x) => x.id === ids.bu),
    product = bu?.products.find((x) => x.id === ids.product),
    site = product?.sites.find((x) => x.id === ids.site);
  function choose(key: keyof typeof ids, value: string) {
    const order = ["bu", "product", "site", "building"] as const,
      index = order.indexOf(key);
    setIds(
      (old) =>
        Object.fromEntries(
          order.map((k, i) => [
            k,
            i < index ? old[k] : i === index ? value : "",
          ]),
        ) as typeof ids,
    );
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    await runWithLoading("층 이력을 재분류하는 중입니다...", async () => {
      const response = await fetch(
        `/api/cad-locations/${locationId}/reclassify`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ buildingId: ids.building }),
        },
      );
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error?.message ?? "재분류하지 못했습니다.");
      }
      router.refresh();
    }).catch((cause) =>
      setError(
        cause instanceof Error ? cause.message : "재분류하지 못했습니다.",
      ),
    );
  }
  return (
    <form
      onSubmit={submit}
      className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5"
    >
      <h2 className="font-semibold">미분류 층 재분류</h2>
      <p className="mb-4 mt-1 text-xs text-slate-600">
        이 층의 모든 버전, Current, 순번과 ID를 유지한 채 실제 제품 계층으로
        옮깁니다.
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <label>
          사업부
          <select
            value={ids.bu}
            required
            onChange={(e) => choose("bu", e.target.value)}
          >
            <option value="">선택</option>
            {tree
              .filter((x) => x.products.some((p) => !p.isUnclassified))
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          제품
          <select
            value={ids.product}
            required
            disabled={!bu}
            onChange={(e) => choose("product", e.target.value)}
          >
            <option value="">선택</option>
            {bu?.products
              .filter((x) => !x.isUnclassified)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          사업장 / 법인
          <select
            value={ids.site}
            required
            disabled={!product}
            onChange={(e) => choose("site", e.target.value)}
          >
            <option value="">선택</option>
            {product?.sites.map((x) => (
              <option key={x.id} value={x.id}>
                [{x.kind === "SITE" ? "사업장" : "법인"}] {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          동
          <select
            value={ids.building}
            required
            disabled={!site}
            onChange={(e) => choose("building", e.target.value)}
          >
            <option value="">선택</option>
            {site?.buildings.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <Button className="mt-4" type="submit">
        전체 이력 재분류
      </Button>
    </form>
  );
}
