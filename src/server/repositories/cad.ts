import { randomUUID } from "node:crypto";
import { CadError, resolvedDrawingName, type Registration } from "@/domain/cad";
import { type Database, writeTransaction } from "../db";
import { hashDeletePassword, verifyDeletePassword } from "../password";
import { appendG7CadAudit, requireG7CadPermission, type G7CadWrite } from "../g7-operational/cad-guard";
export type FileRecord = {
  originalFilename: string;
  fileFormat: "DXF" | "DWG";
  fileSize: number;
  sha256: string;
  storagePath: string;
};
const locationDto = (floor: {
  name: string;
  building: {
    name: string;
    site: {
      name: string;
      kind: string;
      product: { name: string; businessUnit: { name: string } };
    };
  };
}) => ({
  businessUnit: floor.building.site.product.businessUnit.name,
  product: floor.building.site.product.name,
  site: floor.building.site.name,
  siteKind: floor.building.site.kind,
  building: floor.building.name,
  floor: floor.name,
});
export class CadRepository {
  constructor(public db: Database) {}
  async register(
    input: Registration,
    file: FileRecord,
    store?: (locationId: string, versionId: string) => Promise<string>,
    auth?: G7CadWrite,
  ) {
    const deletePasswordHash = await hashDeletePassword(input.deletePassword);
    return writeTransaction(this.db, async (tx) => {
      const floor = await tx.cadLocation.findUnique({
        where: { id: input.floorId },
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
      if (
        !floor ||
        floor.buildingId !== input.buildingId ||
        floor.building.siteId !== input.siteId ||
        floor.building.site.productId !== input.productId ||
        floor.building.site.product.businessUnitId !== input.businessUnitId
      )
        throw new CadError(
          "INVALID_LOCATION_CHAIN",
          "선택한 위치 기준정보의 소속 관계가 올바르지 않습니다.",
          409,
        );
      if (
        !floor.active ||
        !floor.building.active ||
        !floor.building.site.active ||
        !floor.building.site.product.active ||
        !floor.building.site.product.businessUnit.active
      )
        throw new CadError(
          "INACTIVE_LOCATION_CHAIN",
          "비활성 기준정보에는 새 도면을 등록할 수 없습니다.",
          409,
        );
      const allowed = auth ? await requireG7CadPermission(tx, auth,
        'cad:upload', { kind: 'site', siteId: input.siteId }, floor.building.siteId) : null;
      const next = floor.nextVersion,
        id = randomUUID();
      const storagePath = store ? await store(floor.id, id) : file.storagePath;
      const duplicateCount = await tx.cadFileVersion.count({
        where: { sha256: file.sha256 },
      });
      const version = await tx.cadFileVersion.create({
        data: {
          ...file,
          storagePath,
          id,
          locationId: floor.id,
          version: next,
          drawingName: input.drawingName,
          deletePasswordHash,
          registeredAt: input.registeredAt,
          description: input.description,
        },
      });
      await tx.cadLocation.update({
        where: { id: floor.id },
        data: {
          nextVersion: { increment: 1 },
          ...(input.makeCurrent ? { currentVersionId: id } : {}),
        },
      });
      if (auth && allowed) await appendG7CadAudit(
        tx, auth, allowed.actorId, allowed.siteId, 'CAD_UPLOADED', id);
      const names = locationDto(floor);
      return {
        id,
        locationId: floor.id,
        version: version.version,
        displayName: resolvedDrawingName(
          names,
          version.version,
          version.drawingName,
        ),
        originalFilename: version.originalFilename,
        duplicateCount,
        description: version.description,
      };
    });
  }
  async setCurrent(locationId: string, versionId: string, auth?: G7CadWrite) {
    return writeTransaction(this.db, async (tx) => {
      const version = await tx.cadFileVersion.findUnique({
        where: { id: versionId },
      });
      if (!version)
        throw new CadError(
          "FILE_NOT_FOUND",
          "도면 버전을 찾을 수 없습니다.",
          404,
        );
      if (version.locationId !== locationId)
        throw new CadError(
          "LOCATION_MISMATCH",
          "다른 위치의 버전은 지정할 수 없습니다.",
          409,
        );
      const allowed = auth ? await requireG7CadPermission(
        tx, auth, 'cad:current', { kind: 'version', versionId }) : null;
      const changed = await tx.cadLocation.update({
        where: { id: locationId },
        data: { currentVersionId: versionId },
      });
      if (auth && allowed) await appendG7CadAudit(
        tx, auth, allowed.actorId, allowed.siteId, 'CAD_CURRENT_CHANGED', versionId);
      return changed;
    });
  }
  async deleteVersion(id: string, password: string, auth?: G7CadWrite) {
    // A Reader without access cannot use the legacy delete-password check
    // as an oracle for a Version in a different Site. Revalidate inside the
    // final business+Audit transaction below after slow scrypt verification.
    if (auth) await writeTransaction(this.db, async (tx) => {
      await requireG7CadPermission(tx, auth, 'cad:delete',
        { kind: 'version', versionId: id });
    });
    const file = await this.db.cadFileVersion.findUnique({
      where: { id },
      select: {
        id: true,
        locationId: true,
        storagePath: true,
        deletePasswordHash: true,
      },
    });
    if (!file)
      throw new CadError(
        "FILE_NOT_FOUND",
        "도면 버전을 찾을 수 없습니다.",
        404,
      );
    if (!(await verifyDeletePassword(password, file.deletePasswordHash)))
      throw new CadError(
        "INVALID_DELETE_PASSWORD",
        "삭제 비밀번호가 올바르지 않습니다.",
        403,
      );
    return writeTransaction(this.db, async (tx) => {
      const current = await tx.cadFileVersion.findUnique({
        where: { id },
        select: {
          id: true,
          locationId: true,
          storagePath: true,
          deletePasswordHash: true,
        },
      });
      if (!current || current.deletePasswordHash !== file.deletePasswordHash)
        throw new CadError(
          "FILE_NOT_FOUND",
          "도면 버전을 찾을 수 없습니다.",
          404,
        );
      const allowed = auth ? await requireG7CadPermission(
        tx, auth, 'cad:delete', { kind: 'version', versionId: id }) : null;
      const cleared = await tx.cadLocation.updateMany({
        where: { id: current.locationId, currentVersionId: id },
        data: { currentVersionId: null },
      });
      const job = await tx.cadDeletionJob.create({
        data: {
          id: randomUUID(),
          versionId: id,
          storagePath: current.storagePath,
        },
      });
      await tx.cadFileVersion.delete({ where: { id } });
      if (auth && allowed) await appendG7CadAudit(
        tx, auth, allowed.actorId, allowed.siteId, 'CAD_VERSION_DELETED', id);
      return {
        id,
        locationId: current.locationId,
        wasCurrent: cleared.count === 1,
        storagePath: current.storagePath,
        jobId: job.id,
      };
    });
  }
}
