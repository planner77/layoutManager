"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useGlobalLoading } from "@/components/global-loading";
type Node = {
  id: string;
  name: string;
  active: boolean;
  kind?: "SITE" | "LEGAL_ENTITY";
  products?: Node[];
  sites?: Node[];
  buildings?: Node[];
  floors?: Node[];
};
const levels = [
  { type: "business-units", label: "사업부", children: "products" },
  { type: "products", label: "제품", children: "sites" },
  { type: "sites", label: "사업장 / 법인", children: "buildings" },
  { type: "buildings", label: "동", children: "floors" },
  { type: "floors", label: "층", children: "" },
] as const;
async function responseError(response: Response) {
  const body = await response.json().catch(() => null);
  return body?.error?.message || "요청을 처리하지 못했습니다.";
}
export function MasterManager() {
  const [tree, setTree] = useState<Node[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [showInactive, setShowInactive] = useState(true),
    [loaded, setLoaded] = useState(false);
  const mutating = useRef(false);
  const { runWithLoading } = useGlobalLoading();
  async function load() {
    const response = await fetch(
      `/api/masters?active=${showInactive ? "false" : "true"}`,
    );
    if (!response.ok) throw new Error(await responseError(response));
    setTree((await response.json()).items);
    setLoaded(true);
  }
  useEffect(() => {
    let active = true;
    fetch(`/api/masters?active=${showInactive ? "false" : "true"}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response));
        return response.json();
      })
      .then((value) => {
        if (active) {
          setTree(value.items);
          setLoaded(true);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "기준정보를 불러오지 못했습니다.",
          );
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [showInactive]);
  function children(
    node: Node,
    key: (typeof levels)[number]["children"],
  ): Node[] {
    if (!key) return [];
    return node[key] ?? [];
  }
  const lists: Node[][] = [tree];
  for (let i = 1; i < 5; i++) {
    const parent = lists[i - 1].find((x) => x.id === selected[i - 1]);
    lists.push(parent ? children(parent, levels[i - 1].children) : []);
  }
  async function mutate<T>(message: string, action: () => Promise<T>) {
    if (mutating.current) return;
    mutating.current = true;
    try {
      return await runWithLoading(message, action);
    } finally {
      mutating.current = false;
    }
  }
  async function create(index: number, form: FormData) {
    setError("");
    await mutate("기준정보를 저장하는 중입니다...", async () => {
      const body: Record<string, FormDataEntryValue | undefined> = {
        type: levels[index].type,
        name: form.get("name") ?? undefined,
      };
      if (index) body.parentId = selected[index - 1];
      if (index === 2) body.kind = form.get("kind") ?? undefined;
      const r = await fetch("/api/masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await responseError(r));
      await load();
    });
  }
  async function update(
    index: number,
    node: Node,
    data: Record<string, unknown>,
  ) {
    setError("");
    try {
      await mutate("기준정보를 변경하는 중입니다...", async () => {
        const r = await fetch(`/api/masters/${levels[index].type}/${node.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!r.ok) throw new Error(await responseError(r));
        await load();
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "변경하지 못했습니다.");
      throw cause;
    }
  }
  async function remove(index: number, node: Node) {
    setError("");
    await mutate("기준정보를 삭제하는 중입니다...", async () => {
      const r = await fetch(`/api/masters/${levels[index].type}/${node.id}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error(await responseError(r));
      setSelected((s) => s.map((id) => (id === node.id ? "" : id)));
      await load();
    });
  }
  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          비활성 항목 표시
        </label>
        <p className="text-xs text-slate-500">
          ID와 상위 소속은 일반 편집으로 변경되지 않습니다.
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {loaded && !tree.length && (
        <p className="mb-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          등록된 사업부가 없습니다. 첫 사업부부터 추가하세요.
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-5">
        {levels.map((level, index) => {
          const parentReady =
            !index ||
            lists[index - 1].some((node) => node.id === selected[index - 1]);
          return (
            <section
              key={level.type}
              className="min-w-0 rounded-xl border border-slate-200 bg-white p-4"
              aria-labelledby={`master-${level.type}`}
            >
              <h2 id={`master-${level.type}`} className="font-semibold">
                {index + 1}. {level.label}
              </h2>
              <p className="mt-1 min-h-8 text-xs text-slate-500">
                {index && !parentReady
                  ? "상위 항목을 먼저 선택하세요."
                  : `${lists[index].length}개 항목`}
              </p>
              <div className="my-3 max-h-80 space-y-2 overflow-auto">
                {lists[index].map((node) => (
                  <MasterRow
                    key={node.id}
                    node={node}
                    selected={selected[index] === node.id}
                    site={index === 2}
                    onSelect={() =>
                      setSelected((old) => old.slice(0, index).concat(node.id))
                    }
                    onUpdate={(data) => update(index, node, data)}
                    onDelete={() =>
                      remove(index, node).catch((e) => setError(e.message))
                    }
                  />
                ))}
              </div>
              <form
                action={(form) =>
                  create(index, form).catch((e) => setError(e.message))
                }
                className="space-y-2"
              >
                <label>
                  새 {level.label}
                  <input
                    name="name"
                    maxLength={100}
                    required
                    disabled={!parentReady}
                  />
                </label>
                {index === 2 && (
                  <label>
                    종류
                    <select name="kind">
                      <option value="SITE">사업장</option>
                      <option value="LEGAL_ENTITY">법인</option>
                    </select>
                  </label>
                )}
                <Button
                  className="w-full"
                  size="sm"
                  type="submit"
                  disabled={!parentReady}
                >
                  추가
                </Button>
              </form>
            </section>
          );
        })}
      </div>
    </div>
  );
}
function MasterRow({
  node,
  selected,
  site,
  onSelect,
  onUpdate,
  onDelete,
}: {
  node: Node;
  selected: boolean;
  site: boolean;
  onSelect: () => void;
  onUpdate: (x: Record<string, unknown>) => Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(node.name),
    [kind, setKind] = useState(node.kind ?? "SITE");
  if (editing)
    return (
      <div className="rounded-lg border border-teal-300 p-2">
        <label>
          이름
          <input
            aria-label="기준정보 이름"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {site && (
          <label className="mt-2">
            종류
            <select
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as "SITE" | "LEGAL_ENTITY")
              }
            >
              <option value="SITE">사업장</option>
              <option value="LEGAL_ENTITY">법인</option>
            </select>
          </label>
        )}
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            onClick={() =>
              onUpdate({ name, ...(site ? { kind } : {}) })
                .then(() => setEditing(false))
                .catch(() => {})
            }
          >
            저장
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
            취소
          </Button>
        </div>
      </div>
    );
  return (
    <div
      className={`rounded-lg border p-2 ${selected ? "border-teal-500 bg-teal-50" : "border-slate-200"} ${node.active ? "" : "opacity-60"}`}
    >
      <button
        type="button"
        className="min-h-11 w-full text-left text-sm"
        onClick={onSelect}
      >
        <span className="font-medium">
          {site && `[${node.kind === "SITE" ? "사업장" : "법인"}] `}
          {node.name}
        </span>
        <span className="block text-xs text-slate-500">
          {node.active ? "활성" : "비활성"}
        </span>
      </button>
      <div className="mt-1 flex flex-wrap gap-1">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          편집
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onUpdate({ active: !node.active }).catch(() => {})}
        >
          {node.active ? "비활성화" : "재활성화"}
        </Button>
        <Button size="sm" variant="outline" onClick={onDelete}>
          삭제
        </Button>
      </div>
    </div>
  );
}
