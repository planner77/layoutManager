import { CadError } from "./cad";

export type CadListQuery = {
  filename: string;
  description: string;
  businessUnit: string;
  product: string;
  site: string;
  building: string;
  floor: string;
  format: "" | "DXF" | "DWG";
  current: "" | "true" | "false";
  page: number;
  pageSize: number;
};

export type CadListItem = {
  id: string;
  locationId: string;
  businessUnit: string;
  product: string;
  site: string;
  siteKind: string;
  building: string;
  floor: string;
  version: number;
  originalFilename: string;
  displayName: string;
  description: string;
  fileFormat: string;
  fileSize: number;
  registeredAt: string;
  isCurrent: boolean;
};

export function listQuery(params = new URLSearchParams()): CadListQuery {
  function value(key: string, maximum = 100) {
    if (params.getAll(key).length > 1)
      throw new CadError(
        "INVALID_QUERY",
        "검색 조건을 중복으로 지정할 수 없습니다.",
      );
    const text = (params.get(key) ?? "").trim().normalize("NFC");
    if (text.length > maximum || /[\x00-\x1f]/.test(text))
      throw new CadError(
        "INVALID_QUERY",
        "검색 조건의 길이와 문자를 확인해주세요.",
      );
    return text;
  }
  function integer(key: string, fallback: number, maximum: number) {
    const text = value(key, 10);
    if (!text) return fallback;
    const number = Number(text);
    if (
      !/^[1-9]\d*$/.test(text) ||
      !Number.isSafeInteger(number) ||
      number > maximum
    )
      throw new CadError("INVALID_QUERY", "페이지와 표시 개수를 확인해주세요.");
    return number;
  }
  const format = value("format"),
    current = value("current");
  if (
    !["", "DXF", "DWG"].includes(format) ||
    !["", "true", "false"].includes(current)
  )
    throw new CadError(
      "INVALID_QUERY",
      "파일 형식과 Current 검색 조건을 확인해주세요.",
    );
  const location = Object.fromEntries(
    ["businessUnit", "product", "site", "building", "floor"].map((key) => [
      key,
      value(key),
    ]),
  ) as Pick<
    CadListQuery,
    "businessUnit" | "product" | "site" | "building" | "floor"
  >;
  return {
    ...location,
    filename: value("filename", 255),
    description: value("description", 2000),
    format: format as CadListQuery["format"],
    current: current as CadListQuery["current"],
    page: integer("page", 1, 1_000_000),
    pageSize: integer("pageSize", 25, 100),
  };
}

export function listUrl(query: CadListQuery, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, page }))
    if (value !== "") params.set(key, String(value));
  return `/?${params}`;
}

// Library-only display mode. Unlike this UI, the API current=false means
// non-Current records ONLY, so keep the shared listQuery contract unchanged.
export type DrawingListMode = "current" | "all";

export function drawingListUrl(query: CadListQuery, page: number, mode: DrawingListMode) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, page })) {
    if (key !== "current" && value !== "") params.set(key, String(value));
  }
  if (mode === "all") params.set("versions", "all");
  return "/?" + params.toString();
}

export function drawingListParams(input: URLSearchParams) {
  const parsed = listQuery(input);
  const versions = input.getAll("versions");
  if (versions.length > 1 || (versions.length === 1 && versions[0] !== "all")) {
    throw new CadError("INVALID_QUERY", "버전 표시 조건을 확인해주세요.");
  }
  if (versions.length && parsed.current === "true") {
    throw new CadError("INVALID_QUERY", "서로 충돌하는 버전 표시 조건입니다.");
  }
  // Previously shared library URLs used current=false to mean all versions.
  const mode: DrawingListMode = versions.length || parsed.current === "false" ? "all" : "current";
  const params = new URLSearchParams(input);
  params.delete("versions");
  params.delete("current");
  if (mode === "current") params.set("current", "true");
  const query: CadListQuery = { ...parsed, current: mode === "current" ? "true" : "" };
  return { mode, query, params };
}
