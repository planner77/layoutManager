import { expect, test } from "vitest";
import {
  buildMasterTree, flattenMasterTree, hasActiveMasterPath, masterNodeLabel,
  searchMasterTree, visibleMasterTree,
} from "../../features/master/master-tree";

const fixture = buildMasterTree([
  {
    id: "bu-a", name: "사업부 A", active: true, products: [
      {
        id: "product-a", name: "미분류", active: true, isUnclassified: true, sites: [
          {
            id: "site-a", name: "베트남 Site", active: true, kind: "SITE", buildings: [
              {
                id: "building-a", name: "A동", active: true, floors: [
                  { id: "floor-a", name: "1F", active: true },
                  { id: "floor-b", name: "2F", active: false },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "bu-b", name: "사업부 B", active: true, products: [
      { id: "product-b", name: "제품 B", active: true, sites: [
        { id: "site-b", name: "법인 B", active: true, kind: "LEGAL_ENTITY", buildings: [] },
      ] },
    ],
  },
]);

test("TC-191-UNIT-01: five-level hierarchy keeps immutable keys, parent and full path", () => {
  const nodes = flattenMasterTree(fixture);
  expect(nodes).toHaveLength(9);
  const floor = nodes.find((item) => item.node.id === "floor-a")!;
  expect(floor.type).toBe("floors");
  expect(floor.level).toBe(4);
  expect(floor.parentKey).toBe("buildings:building-a");
  expect(floor.path).toEqual(["사업부 A", "미분류", "[사업장] 베트남 Site", "A동", "1F"]);
  expect(nodes.find((item) => item.node.id === "site-b")?.path)
    .toEqual(["사업부 B", "제품 B", "[법인] 법인 B"]);
  expect(masterNodeLabel(nodes.find((item) => item.node.id === "site-b")!)).toBe("[법인] 법인 B");
  expect(nodes.find((item) => item.node.id === "product-a")?.node.isUnclassified).toBe(true);
});

test("TC-191-UNIT-02: search includes matching descendants and ancestors, not unrelated branches", () => {
  const nodes = flattenMasterTree(fixture);
  const matches = searchMasterTree(nodes, "2f");
  expect([...matches.matched]).toEqual(["floors:floor-b"]);
  expect([...matches.opened]).toEqual([
    "business-units:bu-a", "products:product-a", "sites:site-a", "buildings:building-a",
  ]);
  expect(visibleMasterTree(fixture, new Set(), matches).map((item) => item.node.id))
    .toEqual(["bu-a", "product-a", "site-a", "building-a", "floor-b"]);
  const normal = searchMasterTree(nodes, "");
  expect(visibleMasterTree(fixture, new Set(), normal).map((item) => item.node.id))
    .toEqual(["bu-a", "bu-b"]);
  expect(visibleMasterTree(fixture, new Set(["business-units:bu-b"]), normal)
    .map((item) => item.node.id)).toEqual(["bu-a", "bu-b", "product-b"]);
  expect(visibleMasterTree(fixture, new Set(), searchMasterTree(nodes, "없는 값"))).toEqual([]);
});

test("TC-191-UNIT-03: child creation is blocked under inactive ancestors", () => {
  const nodes = flattenMasterTree(fixture);
  const index = new Map(nodes.map((entry) => [entry.key, entry]));
  expect(hasActiveMasterPath(nodes.find((item) => item.node.id === "floor-a")!, index)).toBe(true);
  expect(hasActiveMasterPath(nodes.find((item) => item.node.id === "floor-b")!, index)).toBe(false);
  const parent = nodes.find((item) => item.node.id === "site-a")!;
  parent.node.active = false;
  expect(hasActiveMasterPath(nodes.find((item) => item.node.id === "building-a")!, index)).toBe(false);
});
