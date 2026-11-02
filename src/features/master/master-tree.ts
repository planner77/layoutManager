import type { MasterType } from "@/domain/master";

export type MasterNode = {
  id: string;
  name: string;
  active: boolean;
  kind?: "SITE" | "LEGAL_ENTITY";
  isUnclassified?: boolean;
  products?: MasterNode[];
  sites?: MasterNode[];
  buildings?: MasterNode[];
  floors?: MasterNode[];
};

export const masterLevels = [
  { type: "business-units", label: "사업부", children: "products" },
  { type: "products", label: "제품", children: "sites" },
  { type: "sites", label: "사업장 / 법인", children: "buildings" },
  { type: "buildings", label: "동", children: "floors" },
  { type: "floors", label: "층", children: null },
] as const satisfies readonly {
  type: MasterType;
  label: string;
  children: "products" | "sites" | "buildings" | "floors" | null;
}[];

export type MasterTreeEntry = {
  key: string;
  node: MasterNode;
  level: number;
  type: MasterType;
  parentKey: string | null;
  ancestorKeys: readonly string[];
  path: readonly string[];
  children: MasterTreeEntry[];
};

export function masterNodeLabel(entry: MasterTreeEntry): string {
  if (entry.type === "sites")
    return "[" + (entry.node.kind === "LEGAL_ENTITY" ? "법인" : "사업장") + "] " + entry.node.name;
  return entry.node.name;
}

export function buildMasterTree(nodes: readonly MasterNode[]): MasterTreeEntry[] {
  const visit = (
    node: MasterNode,
    level: number,
    parentKey: string | null,
    ancestorKeys: readonly string[],
    path: readonly string[],
  ): MasterTreeEntry => {
    const type = masterLevels[level].type;
    const key = type + ":" + node.id;
    const label = type === "sites"
      ? "[" + (node.kind === "LEGAL_ENTITY" ? "법인" : "사업장") + "] " + node.name
      : node.name;
    const entry: MasterTreeEntry = {
      key,
      node,
      level,
      type,
      parentKey,
      ancestorKeys,
      path: [...path, label],
      children: [],
    };
    const childKey = masterLevels[level].children;
    if (childKey) {
      entry.children = (node[childKey] ?? []).map((child) =>
        visit(child, level + 1, key, [...ancestorKeys, key], entry.path),
      );
    }
    return entry;
  };
  return nodes.map((node) => visit(node, 0, null, [], []));
}

export function flattenMasterTree(roots: readonly MasterTreeEntry[]): MasterTreeEntry[] {
  const items: MasterTreeEntry[] = [];
  const visit = (nodes: readonly MasterTreeEntry[]) => {
    for (const node of nodes) {
      items.push(node);
      visit(node.children);
    }
  };
  visit(roots);
  return items;
}

export type MasterTreeSearch = {
  matched: ReadonlySet<string>;
  included: ReadonlySet<string>;
  opened: ReadonlySet<string>;
};

export function searchMasterTree(
  all: readonly MasterTreeEntry[],
  term: string,
): MasterTreeSearch {
  const query = term.trim().toLocaleLowerCase();
  const matched = new Set<string>();
  const included = new Set<string>();
  const opened = new Set<string>();
  for (const entry of all) {
    if (!query || entry.node.name.toLocaleLowerCase().includes(query)) {
      matched.add(entry.key);
      included.add(entry.key);
      if (query) {
        for (const ancestor of entry.ancestorKeys) {
          included.add(ancestor);
          opened.add(ancestor);
        }
      }
    }
  }
  return { matched, included, opened };
}

export function visibleMasterTree(
  roots: readonly MasterTreeEntry[],
  expanded: ReadonlySet<string>,
  search: MasterTreeSearch,
): MasterTreeEntry[] {
  const visible: MasterTreeEntry[] = [];
  const visit = (items: readonly MasterTreeEntry[]) => {
    for (const item of items) {
      if (!search.included.has(item.key)) continue;
      visible.push(item);
      if (expanded.has(item.key) || search.opened.has(item.key)) visit(item.children);
    }
  };
  visit(roots);
  return visible;
}

export function hasActiveMasterPath(
  entry: MasterTreeEntry,
  index: ReadonlyMap<string, MasterTreeEntry>,
): boolean {
  return entry.node.active && entry.ancestorKeys.every((key) => index.get(key)?.node.active === true);
}
