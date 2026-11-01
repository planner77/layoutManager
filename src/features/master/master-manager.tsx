"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { useGlobalLoading } from "@/components/global-loading";
import { runtimeCadHeaders } from "@/features/g7-runtime/client";
import {
  buildMasterTree,
  flattenMasterTree,
  hasActiveMasterPath,
  masterLevels,
  masterNodeLabel,
  searchMasterTree,
  visibleMasterTree,
  type MasterNode,
  type MasterTreeEntry,
} from "./master-tree";

type EditorMode = "view" | "create" | "edit" | "delete";
type RefreshTarget = { selectKey: string | null; parentKey?: string | null };

class MasterRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

async function responseError(response: Response): Promise<MasterRequestError> {
  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string };
  } | null;
  const message = payload?.error?.message ||
    (response.status === 401
      ? "세션 인증이 필요합니다. 다시 로그인해주세요."
      : response.status === 403
        ? "현재 계정 또는 사업장에 대한 작업 권한이 없습니다."
        : response.status === 503
          ? "기준정보 쓰기 기능이 준비되지 않았습니다. 운영 상태를 확인해주세요."
          : "요청을 처리하지 못했습니다. (HTTP " + response.status + ")");
  return new MasterRequestError(message, payload?.error?.code ?? "HTTP_" + response.status);
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : "기준정보 작업에 실패했습니다.";
}

export function MasterManager() {
  const [roots, setRoots] = useState<MasterTreeEntry[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [searchText, setSearchText] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [mode, setMode] = useState<EditorMode>("view");
  const [createParentKey, setCreateParentKey] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftKind, setDraftKind] = useState<"SITE" | "LEGAL_ENTITY">("SITE");
  const [draftActive, setDraftActive] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const treeRef = useRef<HTMLUListElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const initialExpansion = useRef(false);
  const busyRef = useRef(false);
  const selectedRef = useRef(selectedKey);
  const filterRef = useRef(showInactive);
  selectedRef.current = selectedKey;
  filterRef.current = showInactive;
  const { runWithLoading } = useGlobalLoading();

  const all = useMemo(() => flattenMasterTree(roots), [roots]);
  const index = useMemo(() => new Map(all.map((entry) => [entry.key, entry])), [all]);
  const search = useMemo(() => searchMasterTree(all, searchText), [all, searchText]);
  const visible = useMemo(() => visibleMasterTree(roots, expanded, search), [roots, expanded, search]);
  const visibleIndex = useMemo(() => new Map(visible.map((entry, pos) => [entry.key, pos])), [visible]);
  const selected = selectedKey ? index.get(selectedKey) ?? null : null;
  const creatingParent = createParentKey ? index.get(createParentKey) ?? null : null;
  const creatingLevel = creatingParent ? masterLevels[creatingParent.level + 1] : masterLevels[0];
  const creatingAllowed = mode === "create" &&
    (createParentKey === null || (creatingParent !== null &&
      creatingParent.level < 4 && hasActiveMasterPath(creatingParent, index)));

  const refresh = useCallback(async (preferred?: RefreshTarget): Promise<boolean> => {
    const requestNumber = ++sequence.current;
    setLoading(true);
    try {
      const response = await fetch("/api/masters?active=" + (filterRef.current ? "false" : "true"), {
        cache: "no-store",
      });
      if (!response.ok) throw await responseError(response);
      const data = (await response.json()) as { items?: MasterNode[] };
      if (!Array.isArray(data.items)) throw new Error("기준정보 응답의 계층 목록이 올바르지 않습니다.");
      if (requestNumber !== sequence.current) return false;
      const nextRoots = buildMasterTree(data.items);
      const entries = flattenMasterTree(nextRoots);
      const nextIndex = new Map(entries.map((entry) => [entry.key, entry]));
      const nextSelection = preferred
        ? (preferred.selectKey && nextIndex.has(preferred.selectKey)
            ? preferred.selectKey
            : preferred.parentKey && nextIndex.has(preferred.parentKey)
              ? preferred.parentKey : null)
        : (selectedRef.current && nextIndex.has(selectedRef.current) ? selectedRef.current : null);
      setRoots(nextRoots);
      setExpanded((previous) => {
        const next = new Set([...previous].filter((key) => nextIndex.has(key)));
        if (!initialExpansion.current) {
          for (const entry of entries)
            if (entry.level < 2 && entry.children.length) next.add(entry.key);
        }
        if (nextSelection) {
          for (const key of nextIndex.get(nextSelection)?.ancestorKeys ?? []) next.add(key);
        }
        if (preferred?.parentKey && nextIndex.has(preferred.parentKey)) next.add(preferred.parentKey);
        return next;
      });
      initialExpansion.current = true;
      if (nextSelection !== selectedRef.current) {
        setSelectedKey(nextSelection);
        setMode("view");
      }
      setFocusedKey((previous) => previous && nextIndex.has(previous)
        ? previous : nextSelection ?? nextRoots[0]?.key ?? null);
      setError("");
      setLoaded(true);
      return true;
    } catch (cause) {
      if (requestNumber !== sequence.current) return false;
      setRoots([]);
      setSelectedKey(null);
      setMode("view");
      setLoaded(true);
      setError(readableError(cause));
      return false;
    } finally {
      if (requestNumber === sequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMode("view");
    setNotice("");
    void refresh();
    return () => { sequence.current += 1; };
  }, [showInactive, refresh]);

  useEffect(() => {
    if (focusedKey && !visibleIndex.has(focusedKey))
      setFocusedKey(visible[0]?.key ?? null);
  }, [focusedKey, visible, visibleIndex]);

  useEffect(() => {
    if (mode === "create" || mode === "edit") nameRef.current?.focus();
  }, [mode, createParentKey, selectedKey]);

  function selectNode(entry: MasterTreeEntry) {
    setSelectedKey(entry.key);
    setFocusedKey(entry.key);
    setMode("view");
    setError("");
    setNotice("");
  }

  function toggleNode(entry: MasterTreeEntry) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(entry.key)) next.delete(entry.key);
      else next.add(entry.key);
      return next;
    });
  }

  function focusNode(key: string) {
    setFocusedKey(key);
    const target = [...(treeRef.current?.querySelectorAll<HTMLElement>("[data-master-tree-key]") ?? [])]
      .find((element) => element.dataset.masterTreeKey === key);
    target?.focus();
  }

  function onTreeKeyDown(event: KeyboardEvent<HTMLLIElement>, entry: MasterTreeEntry) {
    if (event.target !== event.currentTarget) return;
    const pos = visibleIndex.get(entry.key);
    let destination: string | undefined;
    switch (event.key) {
      case "ArrowDown":
        destination = pos === undefined ? undefined : visible[pos + 1]?.key;
        break;
      case "ArrowUp":
        destination = pos === undefined ? undefined : visible[pos - 1]?.key;
        break;
      case "Home":
        destination = visible[0]?.key;
        break;
      case "End":
        destination = visible[visible.length - 1]?.key;
        break;
      case "ArrowRight":
        if (entry.children.length) {
          if (!expanded.has(entry.key) && !search.opened.has(entry.key)) toggleNode(entry);
          else destination = visible[(pos ?? -1) + 1]?.key;
        }
        break;
      case "ArrowLeft":
        if (entry.children.length && expanded.has(entry.key) && !search.opened.has(entry.key))
          toggleNode(entry);
        else destination = entry.parentKey ?? undefined;
        break;
      case "Enter":
      case " ":
        selectNode(entry);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (destination) focusNode(destination);
  }

  function beginCreate(parent: MasterTreeEntry | null) {
    if (parent && (parent.level === 4 || !hasActiveMasterPath(parent, index))) {
      setError("비활성 상위 경로나 층 아래에는 새 기준정보를 추가할 수 없습니다.");
      return;
    }
    setCreateParentKey(parent?.key ?? null);
    setDraftName("");
    setDraftKind("SITE");
    setDraftActive(true);
    setMode("create");
    setNotice("");
    setError("");
  }

  function beginEdit(entry: MasterTreeEntry) {
    setDraftName(entry.node.name);
    setDraftKind(entry.node.kind ?? "SITE");
    setDraftActive(entry.node.active);
    setMode("edit");
    setNotice("");
    setError("");
  }

  async function mutate(
    action: "create" | "edit" | "delete",
    entry: MasterTreeEntry | null,
    data?: Record<string, unknown>,
  ) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const type = action === "create" ? creatingLevel.type : entry?.type;
    const path = type && entry ? "/api/masters/" + type + "/" + entry.node.id : "/api/masters";
    const method = action === "create" ? "POST" : action === "edit" ? "PATCH" : "DELETE";
    try {
      await runWithLoading("기준정보를 처리하는 중입니다...", async () => {
        const response = await fetch(path, {
          method,
          headers: await runtimeCadHeaders(data ? { "Content-Type": "application/json" } : undefined),
          ...(data ? { body: JSON.stringify(data) } : {}),
        });
        if (!response.ok) throw await responseError(response);
        const result = (await response.json().catch(() => null)) as { id?: string } | null;
        const preferred: RefreshTarget = action === "create"
          ? {
              selectKey: result?.id ? creatingLevel.type + ":" + result.id : null,
              parentKey: creatingParent?.key ?? null,
            }
          : action === "delete"
            ? { selectKey: entry?.parentKey ?? null }
            : { selectKey: entry?.key ?? null, parentKey: entry?.parentKey };
        const refreshed = await refresh(preferred);
        setMode("view");
        if (refreshed) {
          setNotice(action === "create" ? "새 항목을 등록했습니다."
            : action === "edit" ? "변경 내용을 저장했습니다."
              : "항목을 안전하게 삭제했습니다.");
        } else {
          setNotice("서버 작업은 완료되었지만 목록 갱신에 실패했습니다. '새로고침'을 눌러 확인하세요.");
        }
      });
    } catch (cause) {
      if (cause instanceof MasterRequestError && cause.code === "MASTER_REFERENCED")
        setError(cause.message + " 아래 '취소'를 누른 뒤 편집에서 비활성화할 수 있습니다.");
      else setError(readableError(cause));
      // Failed writes retain the user's draft and confirmation state.
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function saveCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draftName.trim().normalize("NFC");
    if (!name || name.length > 100) {
      setError("이름은 1~100자로 입력해주세요.");
      return;
    }
    if (!creatingAllowed) {
      setError("올바른 활성 상위 기준정보를 선택해주세요.");
      return;
    }
    void mutate("create", null, {
      type: creatingLevel.type,
      name,
      ...(creatingParent ? { parentId: creatingParent.node.id } : {}),
      ...(creatingLevel.type === "sites" ? { kind: draftKind } : {}),
    });
  }

  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const name = draftName.trim().normalize("NFC");
    if (!selected.node.isUnclassified && (!name || name.length > 100)) {
      setError("이름은 1~100자로 입력해주세요.");
      return;
    }
    void mutate("edit", selected, {
      ...(!selected.node.isUnclassified ? { name } : {}),
      active: draftActive,
      ...(selected.type === "sites" ? { kind: draftKind } : {}),
    });
  }

  function renderBranch(entries: readonly MasterTreeEntry[]) {
    return entries.filter((entry) => search.included.has(entry.key)).map((entry) => {
      const hasChildren = entry.children.length > 0;
      const opened = hasChildren && (expanded.has(entry.key) || search.opened.has(entry.key));
      const isSelected = selectedKey === entry.key;
      const label = masterNodeLabel(entry);
      return (
        <li
          key={entry.key}
          role="treeitem"
          data-master-tree-key={entry.key}
          aria-label={masterLevels[entry.level].label + ": " + label}
          aria-level={entry.level + 1}
          aria-expanded={hasChildren ? opened : undefined}
          aria-selected={isSelected}
          tabIndex={entry.key === (focusedKey ?? visible[0]?.key) ? 0 : -1}
          onFocus={() => setFocusedKey(entry.key)}
          onKeyDown={(event) => onTreeKeyDown(event, entry)}
          className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        >
          <div className={
            "flex min-h-10 items-center gap-1 rounded-md px-1 text-sm " +
            (isSelected ? "bg-teal-100 text-teal-950" : "hover:bg-slate-100") +
            (!entry.node.active ? " opacity-65" : "")
          }>
            {hasChildren ? (
              <button
                type="button"
                tabIndex={-1}
                className="h-9 w-8 shrink-0 rounded hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-teal-600"
                aria-label={(opened ? "접기: " : "펼치기: ") + label}
                disabled={busy || loading}
                onClick={(event) => {
                  toggleNode(entry);
                  (event.currentTarget.closest('[role="treeitem"]') as HTMLElement | null)?.focus();
                }}
              >
                <span aria-hidden="true">{opened ? "▾" : "▸"}</span>
              </button>
            ) : <span aria-hidden="true" className="inline-block w-8 shrink-0 text-center text-slate-400">·</span>}
            <button
              type="button"
              tabIndex={-1}
              className="min-w-0 flex-1 py-2 text-left focus-visible:ring-2 focus-visible:ring-teal-600"
              disabled={busy || loading}
              onClick={(event) => {
                selectNode(entry);
                (event.currentTarget.closest('[role="treeitem"]') as HTMLElement | null)?.focus();
              }}
            >
              <span className="block truncate font-medium" title={label}>{label}</span>
            </button>
            {entry.node.isUnclassified && (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">
                미분류
              </span>
            )}
            {!entry.node.active && (
              <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[11px] text-slate-700">
                비활성
              </span>
            )}
          </div>
          {opened && (
            <ul role="group" className="ml-5 border-l border-slate-200 pl-2">
              {renderBranch(entry.children)}
            </ul>
          )}
        </li>
      );
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">항목 검색</span>
          <input
            aria-label="항목 검색"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="전체 계층에서 이름 검색"
            className="h-10 rounded-lg border border-slate-300 px-3"
          />
        </label>
        {searchText && (
          <Button type="button" size="sm" variant="outline" onClick={() => setSearchText("")}>
            검색 초기화
          </Button>
        )}
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showInactive}
            disabled={busy}
            onChange={(event) => setShowInactive(event.target.checked)}
          />
          비활성 항목 표시
        </label>
        <Button type="button" size="sm" variant="outline" disabled={loading || busy}
          onClick={() => { void refresh(); }}>새로고침</Button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">{notice}</p>}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(270px,2fr)_minmax(320px,3fr)]">
        <section aria-labelledby="master-tree-heading" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="master-tree-heading" className="font-semibold">위치 계층 트리</h2>
            <span className="text-xs text-slate-500">전체 {all.length}개</span>
          </div>
          <div className="my-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={loading || busy}
              onClick={() => setExpanded(new Set(all.filter((entry) => entry.children.length).map((entry) => entry.key)))}>
              모두 펼치기
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={loading || busy}
              onClick={() => setExpanded(new Set())}>모두 접기</Button>
          </div>
          {loading && <p role="status" className="py-4 text-sm text-slate-600">계층을 불러오는 중입니다...</p>}
          {!loading && loaded && !roots.length && !error && (
            <p className="py-4 text-sm text-slate-600">
              {showInactive ? "등록된 사업부가 없습니다. 첫 사업부부터 추가하세요."
                : "활성 사업부가 없습니다. 비활성 항목 표시를 켜서 확인하세요."}
            </p>
          )}
          {!loading && roots.length > 0 && searchText.trim() && !search.matched.size && (
            <p className="py-4 text-sm text-slate-600">검색 결과가 없습니다. 검색어를 변경하거나 초기화하세요.</p>
          )}
          {!loading && roots.length > 0 && (!searchText.trim() || search.matched.size > 0) && (
            <ul
              ref={treeRef}
              role="tree"
              aria-label="위치 기준정보 계층"
              className="max-h-[62vh] min-h-20 space-y-1 overflow-y-auto rounded-lg border border-slate-100 p-2"
            >
              {renderBranch(roots)}
            </ul>
          )}
          <div className="mt-4 border-t border-slate-200 pt-4">
            <Button type="button" size="sm" disabled={busy || loading}
              onClick={() => beginCreate(null)}>+ 사업부 추가</Button>
            <p className="mt-2 text-xs text-slate-500">
              방향키로 이동, 오른쪽/왼쪽 키로 확장·접기, Enter 또는 Space로 선택합니다.
            </p>
          </div>
        </section>
        <section aria-labelledby="master-details-heading" className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
          <h2 id="master-details-heading" className="text-lg font-semibold">
            {mode === "create" ? "새 " + creatingLevel.label + " 등록" : mode === "edit"
              ? "선택 항목 편집" : mode === "delete" ? "삭제 확인" : "선택 항목 상세"}
          </h2>
          {mode === "create" ? (
            <form onSubmit={saveCreate} className="mt-4 space-y-4">
              <p className="text-sm text-slate-600">
                상위 경로: {creatingParent ? creatingParent.path.join(" > ") : "(최상위 사업부)"}
              </p>
              <label className="block space-y-1 text-sm">
                <span className="font-medium">새 {creatingLevel.label} 이름</span>
                <input ref={nameRef} required maxLength={100} value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  disabled={busy}
                  className="block h-10 w-full rounded-lg border border-slate-300 px-3" />
              </label>
              {creatingLevel.type === "sites" && (
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">종류</span>
                  <select value={draftKind} onChange={(event) => setDraftKind(event.target.value as "SITE" | "LEGAL_ENTITY")}
                    disabled={busy} className="block h-10 w-full rounded-lg border border-slate-300 px-3">
                    <option value="SITE">사업장</option>
                    <option value="LEGAL_ENTITY">법인</option>
                  </select>
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || loading || !creatingAllowed}>등록 저장</Button>
                <Button type="button" variant="outline" disabled={busy}
                  onClick={() => setMode("view")}>취소</Button>
              </div>
            </form>
          ) : !selected ? (
            <p className="mt-4 text-sm text-slate-600">
              트리에서 기준정보를 선택하면 전체 경로와 편집 작업이 표시됩니다. 첫 등록은 왼쪽의 사업부 추가를 사용하세요.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <p className="text-sm">
                <span className="block text-xs text-slate-500">전체 경로</span>
                <span data-testid="master-selected-path" className="break-words font-medium">
                  {selected.path.join(" > ")}
                </span>
              </p>
              <dl className="grid grid-cols-[minmax(96px,1fr)_2fr] gap-2 border-y border-slate-100 py-3 text-sm">
                <dt className="text-slate-500">유형</dt><dd>{masterLevels[selected.level].label}</dd>
                <dt className="text-slate-500">이름</dt><dd className="break-words">{masterNodeLabel(selected)}</dd>
                {selected.type === "sites" && <>
                  <dt className="text-slate-500">종류</dt>
                  <dd>{selected.node.kind === "LEGAL_ENTITY" ? "법인" : "사업장"}</dd>
                </>}
                <dt className="text-slate-500">상태</dt><dd>{selected.node.active ? "활성" : "비활성"}</dd>
                {selected.node.isUnclassified && <>
                  <dt className="text-slate-500">제품 구분</dt><dd>미분류 (이름 변경 불가)</dd>
                </>}
                <dt className="text-slate-500">ID</dt>
                <dd className="break-all text-xs text-slate-600">{selected.node.id}</dd>
              </dl>
              {mode === "view" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" disabled={busy || loading} onClick={() => beginEdit(selected)}>편집 / 상태 변경</Button>
                    {selected.level < 4 && (
                      <Button type="button" size="sm" variant="outline"
                        disabled={busy || loading || !hasActiveMasterPath(selected, index)}
                        onClick={() => beginCreate(selected)}>
                        + 하위 {masterLevels[selected.level + 1].label} 추가
                      </Button>
                    )}
                    {selected.type === "floors" && (
                      <Button size="sm" variant="outline" asChild>
                        <Link href={"/cad/locations/" + selected.node.id}>버전 이력</Link>
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" disabled={busy || loading}
                      onClick={() => { setMode("delete"); setError(""); }}>삭제</Button>
                  </div>
                  {!hasActiveMasterPath(selected, index) && (
                    <p className="text-sm text-amber-800">
                      비활성 경로는 새 기준정보 추가·새 도면 등록에 사용할 수 없습니다. 기존 도면 이력은 조회할 수 있습니다.
                    </p>
                  )}
                  <p className="text-xs text-slate-500">ID와 상위 소속은 변경할 수 없습니다.</p>
                </div>
              )}
              {mode === "edit" && (
                <form onSubmit={saveEdit} className="space-y-4">
                  <label className="block space-y-1 text-sm">
                    <span className="font-medium">기준정보 이름</span>
                    <input ref={nameRef} value={draftName} maxLength={100} required
                      disabled={busy || !!selected.node.isUnclassified}
                      onChange={(event) => setDraftName(event.target.value)}
                      className="block h-10 w-full rounded-lg border border-slate-300 px-3" />
                  </label>
                  {selected.node.isUnclassified && (
                    <p className="text-sm text-amber-800">미분류 제품은 이름을 수정할 수 없으며 활성 상태만 변경할 수 있습니다.</p>
                  )}
                  {selected.type === "sites" && (
                    <label className="block space-y-1 text-sm">
                      <span className="font-medium">종류</span>
                      <select value={draftKind} disabled={busy}
                        onChange={(event) => setDraftKind(event.target.value as "SITE" | "LEGAL_ENTITY")}
                        className="block h-10 w-full rounded-lg border border-slate-300 px-3">
                        <option value="SITE">사업장</option>
                        <option value="LEGAL_ENTITY">법인</option>
                      </select>
                    </label>
                  )}
                  <label className="flex min-h-9 items-center gap-2 text-sm">
                    <input type="checkbox" checked={draftActive} disabled={busy}
                      onChange={(event) => setDraftActive(event.target.checked)} />
                    활성 상태로 사용
                  </label>
                  {!draftActive && (
                    <p className="text-sm text-amber-800">
                      비활성화하면 이 경로로 새 도면을 등록할 수 없습니다. 이전 버전과 원본 이력은 유지됩니다.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={busy || loading}>변경 저장</Button>
                    <Button type="button" variant="outline" disabled={busy}
                      onClick={() => setMode("view")}>취소</Button>
                  </div>
                </form>
              )}
              {mode === "delete" && (
                <div role="alertdialog" aria-labelledby="master-delete-heading"
                  aria-describedby="master-delete-description" className="rounded-lg border border-red-200 p-4">
                  <h3 id="master-delete-heading" className="font-semibold text-red-800">정말 삭제하시겠습니까?</h3>
                  <p id="master-delete-description" className="mt-2 break-words text-sm">
                    [{masterLevels[selected.level].label}] {selected.path.join(" > ")}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    하위 항목이나 도면 이력이 있으면 서버에서 삭제를 거부합니다. 이 경우 편집에서 비활성화하세요.
                    이 작업은 자동 하위 삭제나 도면 이력 삭제를 수행하지 않습니다.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" disabled={busy || loading}
                      onClick={() => { void mutate("delete", selected); }}>삭제 확인</Button>
                    <Button type="button" variant="outline" disabled={busy}
                      onClick={() => { setMode("view"); setError(""); }}>취소</Button>
                    <Button type="button" variant="outline" disabled={busy}
                      onClick={() => beginEdit(selected)}>비활성화 대안</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
