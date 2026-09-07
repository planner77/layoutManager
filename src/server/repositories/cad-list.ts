import { Prisma } from '@/generated/prisma/client';
import { type CadListItem, type CadListQuery } from '@/domain/cad-list';
import { CadError } from '@/domain/cad';
import { type Database, writeTransaction } from '../db';

const columns = Prisma.sql`
  v.id, v.location_id AS locationId, v.version,
  v.original_filename AS originalFilename, v.file_format AS fileFormat,
  v.file_size AS fileSize, v.registered_at AS registeredAt,
  l.business_unit AS businessUnit, l.site, l.building, l.floor,
  CASE WHEN l.current_version_id = v.id THEN 1 ELSE 0 END AS isCurrent`;
type Row = Omit<CadListItem, 'isCurrent' | 'version' | 'fileSize'> & { isCurrent: number | bigint; version: number | bigint; fileSize: number | bigint };
function item(row: Row): CadListItem { return { ...row, isCurrent: Boolean(Number(row.isCurrent)), version: Number(row.version), fileSize: Number(row.fileSize) }; }

export class CadListRepository {
  constructor(private db: Database) {}

  async version(id: string) {
    const file = await this.db.cadFileVersion.findUnique({where:{id},select:{id:true,originalFilename:true,fileFormat:true,version:true,fileSize:true,registeredAt:true,location:{select:{id:true,businessUnit:true,site:true,building:true,floor:true}}}});
    if (!file) throw new CadError('FILE_NOT_FOUND','CAD 파일을 찾을 수 없습니다.',404);
    return file;
  }

  async list(query: CadListQuery) {
    const conditions: Prisma.Sql[] = [Prisma.sql`1 = 1`];
    // instr treats %, _ and quotes literally; all values remain bound SQL parameters.
    if (query.filename) conditions.push(Prisma.sql`instr(v.original_filename, ${query.filename}) > 0`);
    if (query.businessUnit) conditions.push(Prisma.sql`l.business_unit = ${query.businessUnit}`);
    if (query.site) conditions.push(Prisma.sql`l.site = ${query.site}`);
    if (query.building) conditions.push(Prisma.sql`l.building = ${query.building}`);
    if (query.floor) conditions.push(Prisma.sql`l.floor = ${query.floor}`);
    if (query.format) conditions.push(Prisma.sql`v.file_format = ${query.format}`);
    if (query.current === 'true') conditions.push(Prisma.sql`l.current_version_id = v.id`);
    if (query.current === 'false') conditions.push(Prisma.sql`(l.current_version_id IS NULL OR l.current_version_id != v.id)`);
    const where = Prisma.join(conditions, ' AND ');
    // Share the transaction queue with writes so count and rows use one consistent snapshot.
    return writeTransaction(this.db, async tx => {
      const count = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total FROM CadFileVersion v JOIN CadLocation l ON l.id = v.location_id WHERE ${where}`);
      const rows = await tx.$queryRaw<Row[]>(Prisma.sql`SELECT ${columns} FROM CadFileVersion v JOIN CadLocation l ON l.id = v.location_id WHERE ${where} ORDER BY v.registered_at DESC, v.created_at DESC, v.id ASC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`);
      return { items: rows.map(item), total: Number(count[0].total), page: query.page, pageSize: query.pageSize };
    });
  }

  async options() {
    const locations = await this.db.cadLocation.findMany({ select: { businessUnit: true, site: true, building: true, floor: true } });
    const distinct = (key: keyof typeof locations[number]) => [...new Set(locations.map(row => row[key]))].sort((a, b) => a.localeCompare(b, 'ko'));
    return { businessUnit: distinct('businessUnit'), site: distinct('site'), building: distinct('building'), floor: distinct('floor') };
  }

  async location(id: string) {
    return writeTransaction(this.db, async tx => {
      const location = await tx.cadLocation.findUnique({ where: { id }, select: { id: true, businessUnit: true, site: true, building: true, floor: true, currentVersionId: true } });
      if (!location) throw new CadError('LOCATION_NOT_FOUND', '등록된 위치를 찾을 수 없습니다.', 404);
      const versions = await tx.$queryRaw<Row[]>(Prisma.sql`SELECT ${columns} FROM CadFileVersion v JOIN CadLocation l ON l.id = v.location_id WHERE l.id = ${id} ORDER BY v.version DESC`);
      return { ...location, versions: versions.map(item) };
    });
  }
}
