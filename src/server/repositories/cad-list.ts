import { Prisma } from "@/generated/prisma/client";
import { type CadListItem, type CadListQuery } from "@/domain/cad-list";
import { CadError, resolvedDrawingName } from "@/domain/cad";
import { type Database, writeTransaction } from "../db";
const joins = Prisma.sql`JOIN CadLocation l ON l.id=v.location_id JOIN Building bl ON bl.id=l.building_id JOIN CadSite s ON s.id=bl.site_id JOIN Product p ON p.id=s.product_id JOIN BusinessUnit bu ON bu.id=p.business_unit_id`;
const columns = Prisma.sql`v.id,v.location_id AS locationId,v.version,v.original_filename AS originalFilename,v.drawing_name AS drawingName,v.description,v.file_format AS fileFormat,v.file_size AS fileSize,v.registered_at AS registeredAt,bu.name AS businessUnit,p.name AS product,s.name AS site,s.kind AS siteKind,bl.name AS building,l.name AS floor,CASE WHEN l.current_version_id=v.id THEN 1 ELSE 0 END AS isCurrent`;
type Row = Omit<
  CadListItem,
  "displayName" | "isCurrent" | "version" | "fileSize"
> & {
  drawingName: string | null;
  isCurrent: number | bigint;
  version: number | bigint;
  fileSize: number | bigint;
};
function item(row: Row): CadListItem {
  const { drawingName, ...rest } = row;
  const version = Number(row.version);
  return {
    ...rest,
    displayName: resolvedDrawingName(row, version, drawingName),
    isCurrent: Boolean(Number(row.isCurrent)),
    version,
    fileSize: Number(row.fileSize),
  };
}
export class CadListRepository {
  constructor(private db: Database) {}
  async version(id: string) {
    const file = await this.db.cadFileVersion.findUnique({
      where: { id },
      select: {
        id: true,
        originalFilename: true,
        drawingName: true,
        description: true,
        fileFormat: true,
        version: true,
        fileSize: true,
        registeredAt: true,
        location: {
          include: {
            building: {
              include: {
                site: {
                  include: { product: { include: { businessUnit: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!file)
      throw new CadError("FILE_NOT_FOUND", "CAD 파일을 찾을 수 없습니다.", 404);
    const l = {
      id: file.location.id,
      businessUnit: file.location.building.site.product.businessUnit.name,
      product: file.location.building.site.product.name,
      site: file.location.building.site.name,
      siteKind: file.location.building.site.kind,
      building: file.location.building.name,
      floor: file.location.name,
    };
    const { drawingName, location, ...publicFile } = file;
    void location;
    return {
      ...publicFile,
      location: l,
      displayName: resolvedDrawingName(l, file.version, drawingName),
    };
  }
  async list(query: CadListQuery) {
    const c: Prisma.Sql[] = [Prisma.sql`1=1`];
    if (query.filename)
      c.push(Prisma.sql`instr(v.original_filename,${query.filename})>0`);
    if (query.description)
      c.push(Prisma.sql`instr(v.description,${query.description})>0`);
    if (query.businessUnit) c.push(Prisma.sql`bu.name=${query.businessUnit}`);
    if (query.product) c.push(Prisma.sql`p.name=${query.product}`);
    if (query.site) c.push(Prisma.sql`s.name=${query.site}`);
    if (query.building) c.push(Prisma.sql`bl.name=${query.building}`);
    if (query.floor) c.push(Prisma.sql`l.name=${query.floor}`);
    if (query.format) c.push(Prisma.sql`v.file_format=${query.format}`);
    if (query.current === "true") c.push(Prisma.sql`l.current_version_id=v.id`);
    if (query.current === "false")
      c.push(
        Prisma.sql`(l.current_version_id IS NULL OR l.current_version_id!=v.id)`,
      );
    const where = Prisma.join(c, " AND ");
    return writeTransaction(this.db, async (tx) => {
      const count = await tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT count(*) total FROM CadFileVersion v ${joins} WHERE ${where}`,
      );
      const rows = await tx.$queryRaw<Row[]>(
        Prisma.sql`SELECT ${columns} FROM CadFileVersion v ${joins} WHERE ${where} ORDER BY v.registered_at DESC,v.created_at DESC,v.id ASC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
      );
      return {
        items: rows.map(item),
        total: Number(count[0].total),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }
  async options() {
    const tree = await this.db.cadLocation.findMany({
      select: {
        name: true,
        building: {
          select: {
            name: true,
            site: {
              select: {
                name: true,
                product: {
                  select: {
                    name: true,
                    businessUnit: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    const values = (fn: (x: (typeof tree)[number]) => string) =>
      [...new Set(tree.map(fn))].sort((a, b) => a.localeCompare(b, "ko"));
    return {
      businessUnit: values((x) => x.building.site.product.businessUnit.name),
      product: values((x) => x.building.site.product.name),
      site: values((x) => x.building.site.name),
      building: values((x) => x.building.name),
      floor: values((x) => x.name),
    };
  }
  async location(id: string) {
    return writeTransaction(this.db, async (tx) => {
      const f = await tx.cadLocation.findUnique({
        where: { id },
        include: {
          building: {
            include: {
              site: {
                include: { product: { include: { businessUnit: true } } },
              },
            },
          },
        },
      });
      if (!f)
        throw new CadError(
          "LOCATION_NOT_FOUND",
          "등록된 위치를 찾을 수 없습니다.",
          404,
        );
      const rows = await tx.$queryRaw<Row[]>(
        Prisma.sql`SELECT ${columns} FROM CadFileVersion v ${joins} WHERE l.id=${id} ORDER BY v.version DESC`,
      );
      return {
        id: f.id,
        businessUnit: f.building.site.product.businessUnit.name,
        product: f.building.site.product.name,
        isUnclassified: f.building.site.product.isUnclassified,
        site: f.building.site.name,
        siteKind: f.building.site.kind,
        building: f.building.name,
        floor: f.name,
        active: f.active,
        currentVersionId: f.currentVersionId,
        versions: rows.map(item),
      };
    });
  }
}
