import { CadError, validateId } from "./cad";
export const masterTypes = [
  "business-units",
  "products",
  "sites",
  "buildings",
  "floors",
] as const;
export type MasterType = (typeof masterTypes)[number];
export function masterType(value: string): MasterType {
  if (!(masterTypes as readonly string[]).includes(value))
    throw new CadError(
      "INVALID_MASTER_TYPE",
      "올바르지 않은 기준정보 종류입니다.",
    );
  return value as MasterType;
}
export function masterName(value: unknown) {
  if (typeof value !== "string")
    throw new CadError("INVALID_MASTER_NAME", "이름을 입력해주세요.");
  const name = value.trim().normalize("NFC");
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f-\u009f]/.test(name))
    throw new CadError(
      "INVALID_MASTER_NAME",
      "이름은 1~100자의 일반 문자로 입력해주세요.",
    );
  return name;
}
export function siteKind(value: unknown) {
  if (value !== "SITE" && value !== "LEGAL_ENTITY")
    throw new CadError("INVALID_SITE_KIND", "사업장/법인 종류를 선택해주세요.");
  return value;
}
export function optionalParentId(value: unknown) {
  if (typeof value !== "string")
    throw new CadError("INVALID_PARENT", "상위 기준정보를 선택해주세요.");
  try {
    return validateId(value);
  } catch {
    throw new CadError("INVALID_PARENT", "상위 기준정보를 선택해주세요.");
  }
}
