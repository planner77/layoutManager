import type { APIRequestContext, Page } from "@playwright/test";
type Names = {
  businessUnit: string;
  product?: string;
  site: string;
  siteKind?: "SITE" | "LEGAL_ENTITY";
  building: string;
  floor: string;
};
async function create(
  request: APIRequestContext,
  type: string,
  name: string,
  parentId?: string,
  kind?: string,
) {
  const response = await request.post("/api/masters", {
    data: {
      type,
      name,
      ...(parentId ? { parentId } : {}),
      ...(kind ? { kind } : {}),
    },
  });
  if (!response.ok())
    throw new Error(
      `master ${type} create failed: ${response.status()} ${await response.text()}`,
    );
  return (await response.json()).id as string;
}
type TreeBu = {
  id: string;
  name: string;
  products: {
    id: string;
    name: string;
    sites: {
      id: string;
      name: string;
      kind: string;
      buildings: {
        id: string;
        name: string;
        floors: { id: string; name: string }[];
      }[];
    }[];
  }[];
};
export async function masterFields(request: APIRequestContext, names: Names) {
  const response = await request.get("/api/masters"),
    tree = (await response.json()).items as TreeBu[];
  const bu = tree.find((x) => x.name === names.businessUnit),
    businessUnitId =
      bu?.id ?? (await create(request, "business-units", names.businessUnit));
  const product = bu?.products.find(
      (x) => x.name === (names.product ?? "제품"),
    ),
    productId =
      product?.id ??
      (await create(
        request,
        "products",
        names.product ?? "제품",
        businessUnitId,
      ));
  const site = product?.sites.find((x) => x.name === names.site),
    siteId =
      site?.id ??
      (await create(
        request,
        "sites",
        names.site,
        productId,
        names.siteKind ?? "SITE",
      ));
  const building = site?.buildings.find((x) => x.name === names.building),
    buildingId =
      building?.id ??
      (await create(request, "buildings", names.building, siteId));
  const floor = building?.floors.find((x) => x.name === names.floor),
    floorId =
      floor?.id ?? (await create(request, "floors", names.floor, buildingId));
  return { businessUnitId, productId, siteId, buildingId, floorId };
}
export async function selectMasterChain(page: Page, names: Names) {
  await masterFields(page.request, names);
  await page.goto("/cad/upload", { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "새 도면 등록" }).waitFor();
  await page
    .getByRole("combobox", { name: "사업부", exact: true })
    .selectOption({ label: names.businessUnit });
  await page
    .getByRole("combobox", { name: "제품", exact: true })
    .selectOption({ label: names.product ?? "제품" });
  await page
    .getByRole("combobox", { name: "사업장 / 법인", exact: true })
    .selectOption({
      label: `[${names.siteKind === "LEGAL_ENTITY" ? "법인" : "사업장"}] ${names.site}`,
    });
  await page
    .getByRole("combobox", { name: "동", exact: true })
    .selectOption({ label: names.building });
  await page
    .getByRole("combobox", { name: "층", exact: true })
    .selectOption({ label: names.floor });
}
