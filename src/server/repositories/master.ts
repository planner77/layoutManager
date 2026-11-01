import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { CadError } from "@/domain/cad";
import type { MasterType } from "@/domain/master";
import { masterName } from "@/domain/master";
import { type Database, writeTransaction } from "../db";
import { requireG7MasterPermission, requireG7RuntimeWrite, appendG7MasterAudit, type G7CadWrite } from '../g7-operational/cad-guard';

type Tx = Prisma.TransactionClient;
async function masterSites(tx: Tx, type: MasterType, id: string): Promise<string[]> {
  if (type === 'business-units' || type === 'products') {
    const rows = await tx.cadSite.findMany({where:type === 'products'
      ? {productId:id} : {product:{businessUnitId:id}},select:{id:true}});
    return rows.map(row=>row.id);
  }
  if (type === 'sites') {
    const site = await tx.cadSite.findUnique({where:{id},select:{id:true}});
    return site ? [site.id] : [];
  }
  if (type === 'buildings') {
    const building = await tx.building.findUnique({where:{id},select:{siteId:true}});
    return building ? [building.siteId] : [];
  }
  const floor = await tx.cadLocation.findUnique({where:{id},select:{building:{select:{siteId:true}}}});
  return floor ? [floor.building.siteId] : [];
}
async function auditMaster(tx: Tx, proof: G7CadWrite, actor: string,
  sites: readonly string[], target: string): Promise<void> {
  if (!sites.length) await appendG7MasterAudit(tx,proof,actor,target);
  for (const site of new Set(sites)) await appendG7MasterAudit(tx,proof,actor,site,site);
}
function duplicate(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
    throw new CadError(
      "DUPLICATE_MASTER",
      "같은 상위 항목에 동일한 이름이 있습니다.",
      409,
    );
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  )
    throw new CadError(
      "INVALID_PARENT",
      "상위 기준정보를 찾을 수 없습니다.",
      409,
    );
  throw error;
}
function referenced(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  )
    throw new CadError(
      "MASTER_REFERENCED",
      "하위 항목이나 도면 이력이 있어 삭제할 수 없습니다. 비활성화를 사용해주세요.",
      409,
    );
  throw error;
}
// Prevent creating new masters under a disabled ancestor (even through direct API).
// This check runs in the same transaction as the insertion.
async function requireActiveMasterParent(tx: Tx, type: MasterType, parentId?: string): Promise<void> {
  if (type === "business-units") return;
  if (!parentId) throw new CadError("INVALID_PARENT", "상위 기준정보를 선택해주세요.", 409);
  let allowed = false;
  switch (type) {
    case "products": {
      const parent = await tx.businessUnit.findUnique({ where: { id: parentId }, select: { active: true } });
      allowed = parent?.active === true;
      break;
    }
    case "sites": {
      const parent = await tx.product.findUnique({
        where: { id: parentId }, select: { active: true, businessUnit: { select: { active: true } } },
      });
      allowed = parent?.active === true && parent.businessUnit.active;
      break;
    }
    case "buildings": {
      const parent = await tx.cadSite.findUnique({
        where: { id: parentId },
        select: { active: true, product: { select: { active: true, businessUnit: { select: { active: true } } } } },
      });
      allowed = parent?.active === true && parent.product.active && parent.product.businessUnit.active;
      break;
    }
    case "floors": {
      const parent = await tx.building.findUnique({
        where: { id: parentId },
        select: { active: true, site: { select: { active: true, product: { select: { active: true, businessUnit: { select: { active: true } } } } } } },
      });
      allowed = parent?.active === true && parent.site.active && parent.site.product.active &&
        parent.site.product.businessUnit.active;
      break;
    }
  }
  if (!allowed) throw new CadError(
    "INVALID_PARENT", "상위 기준정보가 없거나 비활성 상태입니다. 활성 경로를 선택해주세요.", 409,
  );
}

export class MasterRepository {
  constructor(private db: Database) {}
  tree(includeInactive = true) {
    const where = includeInactive ? {} : { active: true };
    return this.db.businessUnit.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        products: {
          where,
          orderBy: { name: "asc" },
          include: {
            sites: {
              where,
              orderBy: { name: "asc" },
              include: {
                buildings: {
                  where,
                  orderBy: { name: "asc" },
                  include: {
                    floors: {
                      where,
                      orderBy: { name: "asc" },
                      select: {
                        id: true,
                        name: true,
                        active: true,
                        buildingId: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }
  async create(
    type: MasterType,
    input: { name: string; parentId?: string; kind?: "SITE" | "LEGAL_ENTITY" },
    auth?: G7CadWrite,
  ) {
    input = { ...input, name: masterName(input.name) };
    return writeTransaction(this.db, async (tx) => {
      if (auth && type === 'sites' && requireG7RuntimeWrite(auth)?.operationMode !== 'SELF_HOSTED') throw new CadError('G7_SCOPE_EXTENSION_REQUIRED',
        '새 사업장은 운영 승인 범위를 갱신하기 전에 등록할 수 없습니다.',409);
      const sites = auth && input.parentId && (type === 'buildings' || type === 'floors')
        ? await masterSites(tx,type === 'buildings' ? 'sites' : 'buildings',input.parentId) : [];
      const actor = auth ? await requireG7MasterPermission(tx,auth,sites) : null;
      await requireActiveMasterParent(tx, type, input.parentId);
      const perform = async () => {
      try {
        switch (type) {
          case "business-units":
            return await tx.businessUnit.create({
              data: { id: randomUUID(), name: input.name },
            });
          case "products":
            if (!input.parentId) break;
            return await tx.product.create({
              data: {
                id: randomUUID(),
                businessUnitId: input.parentId,
                name: input.name,
              },
            });
          case "sites":
            if (!input.parentId || !input.kind) break;
            return await tx.cadSite.create({
              data: {
                id: randomUUID(),
                productId: input.parentId,
                name: input.name,
                kind: input.kind,
              },
            });
          case "buildings":
            if (!input.parentId) break;
            return await tx.building.create({
              data: {
                id: randomUUID(),
                siteId: input.parentId,
                name: input.name,
              },
            });
          case "floors":
            if (!input.parentId) break;
            return await tx.cadLocation.create({
              data: {
                id: randomUUID(),
                buildingId: input.parentId,
                name: input.name,
              },
            });
        }
      } catch (error) {
        duplicate(error);
      }
      throw new CadError(
        "INVALID_PARENT",
        "상위 기준정보를 찾을 수 없습니다.",
        409,
      );
      };
      const result = await perform();
      if (auth && actor) await auditMaster(tx,auth,actor,sites,result?.id ?? 'MASTER_CREATE');
      return result;
    });
  }
  async update(
    type: MasterType,
    id: string,
    input: { name?: string; kind?: "SITE" | "LEGAL_ENTITY"; active?: boolean },
    auth?: G7CadWrite,
  ) {
    if (input.name !== undefined)
      input = { ...input, name: masterName(input.name) };
    return writeTransaction(this.db, async (tx) => {
      const sites = auth ? await masterSites(tx,type,id) : [];
      const actor = auth ? await requireG7MasterPermission(tx,auth,sites) : null;
      const perform = async () => {
      const data = {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.active === undefined ? {} : { active: input.active }),
      };
      try {
        switch (type) {
          case "business-units":
            return await tx.businessUnit.update({ where: { id }, data });
          case "products": {
            const product = await tx.product.findUnique({
              where: { id },
              select: { isUnclassified: true },
            });
            if (!product)
              throw new CadError(
                "MASTER_NOT_FOUND",
                "기준정보를 찾을 수 없습니다.",
                404,
              );
            if (product.isUnclassified && input.name !== undefined)
              throw new CadError(
                "UNCLASSIFIED_IMMUTABLE",
                "미분류 제품의 이름은 변경할 수 없습니다.",
                409,
              );
            return await tx.product.update({ where: { id }, data });
          }
          case "sites":
            return await tx.cadSite.update({
              where: { id },
              data: {
                ...data,
                ...(input.kind === undefined ? {} : { kind: input.kind }),
              },
            });
          case "buildings":
            return await tx.building.update({ where: { id }, data });
          case "floors":
            return await tx.cadLocation.update({ where: { id }, data });
        }
      } catch (error) {
        if (error instanceof CadError) throw error;
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        )
          throw new CadError(
            "MASTER_NOT_FOUND",
            "기준정보를 찾을 수 없습니다.",
            404,
          );
        duplicate(error);
      }
      };
      const result = await perform();
      if (auth && actor) await auditMaster(tx,auth,actor,sites,id);
      return result;
    });
  }
  async remove(type: MasterType, id: string, auth?: G7CadWrite) {
    return writeTransaction(this.db, async (tx) => {
      const sites = auth ? await masterSites(tx,type,id) : [];
      const actor = auth ? await requireG7MasterPermission(tx,auth,sites) : null;
      const perform = async () => {
      try {
        switch (type) {
          case "business-units":
            await tx.businessUnit.delete({ where: { id } });
            break;
          case "products":
            await tx.product.delete({ where: { id } });
            break;
          case "sites":
            await tx.cadSite.delete({ where: { id } });
            break;
          case "buildings":
            await tx.building.delete({ where: { id } });
            break;
          case "floors":
            await tx.cadLocation.delete({ where: { id } });
            break;
        }
        return { deleted: true, id };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        )
          throw new CadError(
            "MASTER_NOT_FOUND",
            "기준정보를 찾을 수 없습니다.",
            404,
          );
        referenced(error);
      }
      };
      const result = await perform();
      if (auth && actor) await auditMaster(tx,auth,actor,sites,id);
      return result;
    });
  }
  async reclassifyFloor(id: string, buildingId: string, auth?: G7CadWrite) {
    return writeTransaction(this.db, async (tx) => {
      const [floor, target] = await Promise.all([
        tx.cadLocation.findUnique({
          where: { id },
          include: {
            building: { include: { site: { include: { product: true } } } },
          },
        }),
        tx.building.findUnique({
          where: { id: buildingId },
          include: {
            site: { include: { product: { include: { businessUnit: true } } } },
          },
        }),
      ]);
      if (!floor)
        throw new CadError("LOCATION_NOT_FOUND", "층을 찾을 수 없습니다.", 404);
      if (!floor.building.site.product.isUnclassified)
        throw new CadError(
          "RECLASSIFY_NOT_ALLOWED",
          "미분류 제품의 층만 재분류할 수 있습니다.",
          409,
        );
      if (
        !target ||
        target.site.product.isUnclassified ||
        !target.active ||
        !target.site.active ||
        !target.site.product.active ||
        !target.site.product.businessUnit.active
      )
        throw new CadError(
          "INACTIVE_MASTER",
          "활성 상태인 실제 제품의 전체 계층을 선택해주세요.",
          409,
        );
      const sites = [floor.building.siteId,target.siteId];
      const actor = auth ? await requireG7MasterPermission(tx,auth,sites) : null;
      const collision = await tx.cadLocation.findUnique({
        where: { buildingId_name: { buildingId, name: floor.name } },
      });
      if (collision && collision.id !== id)
        throw new CadError(
          "RECLASSIFY_COLLISION",
          "대상 동에 같은 이름의 층이 있어 재분류할 수 없습니다.",
          409,
        );
      const result = await tx.cadLocation.update({ where: { id }, data: { buildingId } });
      if (auth && actor) await auditMaster(tx,auth,actor,sites,id);
      return result;
    });
  }
}
