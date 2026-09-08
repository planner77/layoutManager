import { randomUUID } from 'node:crypto';
import { CadError, type Registration } from '@/domain/cad';
import { type Database, writeTransaction } from '../db';
export type FileRecord = { originalFilename: string; fileFormat: 'DXF' | 'DWG'; fileSize: number; sha256: string; storagePath: string };
export class CadRepository {
  constructor(public db: Database) {}
  async register(input: Registration, file: FileRecord, store?: (locationId: string, versionId: string) => Promise<string>) {
    return writeTransaction(this.db, async tx => {
      const key = { businessUnit: input.businessUnit, site: input.site, building: input.building, floor: input.floor };
      const location = await tx.cadLocation.upsert({ where: { businessUnit_site_building_floor: key }, create: { id: randomUUID(), ...key }, update: {} });
      const latest = await tx.cadFileVersion.aggregate({ where: { locationId: location.id }, _max: { version: true } });
      const id = randomUUID();
      const storagePath = store ? await store(location.id, id) : file.storagePath;
      const duplicateCount = await tx.cadFileVersion.count({ where: { sha256: file.sha256 } });
      const version = await tx.cadFileVersion.create({ data: { ...file, storagePath, id, locationId: location.id, version: (latest._max.version ?? 0) + 1, registeredAt: input.registeredAt, description: input.description } });
      if (input.makeCurrent) await tx.cadLocation.update({ where: { id: location.id }, data: { currentVersionId: id } });
      return { id, locationId: location.id, version: version.version, duplicateCount, description: version.description };
    });
  }
  async setCurrent(locationId: string, versionId: string) {
    return writeTransaction(this.db, async tx => {
      const version = await tx.cadFileVersion.findUnique({ where: { id: versionId } });
      if (!version) throw new CadError('FILE_NOT_FOUND', '도면 버전을 찾을 수 없습니다.', 404);
      if (version.locationId !== locationId) throw new CadError('LOCATION_MISMATCH', '다른 위치의 버전은 지정할 수 없습니다.', 409);
      return tx.cadLocation.update({ where: { id: locationId }, data: { currentVersionId: versionId } });
    });
  }
}
