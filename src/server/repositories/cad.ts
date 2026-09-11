import { randomUUID } from 'node:crypto';
import { CadError, type Registration } from '@/domain/cad';
import { type Database, writeTransaction } from '../db';
import { hashDeletePassword } from '../password';
export type FileRecord = { originalFilename: string; fileFormat: 'DXF' | 'DWG'; fileSize: number; sha256: string; storagePath: string };
export class CadRepository {
  constructor(public db: Database) {}
  async register(input: Registration, file: FileRecord, store?: (locationId: string, versionId: string) => Promise<string>) {
    const deletePasswordHash = await hashDeletePassword(input.deletePassword);
    return writeTransaction(this.db, async tx => {
      const key = { businessUnit: input.businessUnit, site: input.site, building: input.building, floor: input.floor };
      const location = await tx.cadLocation.upsert({ where: { businessUnit_site_building_floor: key }, create: { id: randomUUID(), ...key }, update: {} });
      const next = location.nextVersion;
      const id = randomUUID();
      const storagePath = store ? await store(location.id, id) : file.storagePath;
      const duplicateCount = await tx.cadFileVersion.count({ where: { sha256: file.sha256 } });
      const version = await tx.cadFileVersion.create({ data: { ...file, storagePath, id, locationId: location.id, version: next, deletePasswordHash, registeredAt: input.registeredAt, description: input.description } });
      await tx.cadLocation.update({ where: { id: location.id }, data: { nextVersion: { increment: 1 } } });
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
  async deleteVersion(id: string, _password: string) {
    const file = await this.db.cadFileVersion.findUnique({ where: { id }, select: { id:true, locationId:true, storagePath:true, deletePasswordHash:true } });
    if (!file) throw new CadError('FILE_NOT_FOUND', '도면 버전을 찾을 수 없습니다.', 404);
    return writeTransaction(this.db, async tx => {
      const current = await tx.cadFileVersion.findUnique({ where: { id }, select: { id:true, locationId:true, storagePath:true, deletePasswordHash:true } });
      if (!current || current.deletePasswordHash !== file.deletePasswordHash) throw new CadError('FILE_NOT_FOUND', '도면 버전을 찾을 수 없습니다.', 404);
      await tx.cadLocation.updateMany({ where: { id: current.locationId, currentVersionId: id }, data: { currentVersionId: null } });
      const job = await tx.cadDeletionJob.create({ data: { id: randomUUID(), versionId: id, storagePath: current.storagePath } });
      await tx.cadFileVersion.delete({ where: { id } });
      return { id, storagePath: current.storagePath, jobId: job.id };
    });
  }
}
