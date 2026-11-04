import { randomUUID } from "node:crypto";
import { CadError, resolvedDrawingName, type Registration } from "@/domain/cad";
import { type Database, writeTransaction } from "../db";
import { hashDeletePassword, verifyDeletePassword } from "../password";
import { appendG7CadAudit, requireG7CadPermission, type G7CadWrite } from "../g7-operational/cad-guard";
import { enqueueSceneBuildTx, enqueueCpuSceneBuildTx, selectSceneEnqueueMode } from "../scene/scene-build-job-queue";
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
        tx, auth, allowed.actorId, allowed.siteId, 'CAD_UPLOADED', id, null, next);
      // #225: The feature is OFF unless explicitly configured after a registered
      // G7 schema upgrade. Never commit a DXF Version without its durable intent
      // when the feature is enabled; a failed enqueue rolls this transaction back.
      let sceneBuild: Awaited<ReturnType<typeof enqueueSceneBuildTx>> | undefined;
      if(process.env.SCENE_AUTO_BUILD_ENABLED==='true' && file.fileFormat==='DXF'){
        if(!auth?.runtime || !allowed)
          throw new CadError('SCENE_JOB_RUNTIME_REQUIRED',
            'Scene 자동 생성은 승인된 G7 Runtime에서만 사용할 수 있습니다.',503);
        // Select Builder from reviewed G7 schema, never merely from .env.
        let enqueueMode:'BROWSER'|'CPU';
        try{enqueueMode=selectSceneEnqueueMode();}
        catch{
          throw new CadError('SCENE_JOB_RELEASE_NOT_REGISTERED',
            'Scene 작업 스키마 릴리스가 승인되지 않았습니다.',503);
        }
        const registered=await tx.$queryRawUnsafe<{name:string}[]>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='SceneBuildJob'");
        if(registered.length!==1)
          throw new CadError('SCENE_JOB_SCHEMA_NOT_REGISTERED',
            'Scene 작업 저장 스키마가 등록되지 않았습니다.',503);
        const intent={versionId:id,sourceSha256:file.sha256,actorId:allowed.actorId,
          siteId:allowed.siteId,requestId:auth.requestId};
        sceneBuild=enqueueMode==='CPU'
          ?await enqueueCpuSceneBuildTx(tx,intent)
          :await enqueueSceneBuildTx(tx,intent);
      }
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
        ...(sceneBuild ? {sceneBuild} : {}),
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
      const before = await tx.cadLocation.findUnique({
        where: { id: locationId },
        select: { currentVersion: { select: { version: true } } },
      });
      const changed = await tx.cadLocation.update({
        where: { id: locationId },
        data: { currentVersionId: versionId },
      });
      if (auth && allowed) await appendG7CadAudit(
        tx, auth, allowed.actorId, allowed.siteId, 'CAD_CURRENT_CHANGED',
        versionId, before?.currentVersion?.version ?? null, version.version);
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
          version: true,
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
      // #225 B1: a live conversion must not race Version deletion. A failed
      // or completed job has no independent business retention beyond Audit,
      // so remove terminal intents before deleting their immutable Version.
      // In the old baseline no Job table exists; leave historical behavior alone.
      const sceneJobTables=await tx.$queryRawUnsafe<{name:string}[]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='SceneBuildJob'");
      if(sceneJobTables.length){
        const live=await tx.sceneBuildJob.count({where:{versionId:id,
          status:{in:['QUEUED','RUNNING','RETRY_WAIT']}}});
        if(live>0)throw new CadError('SCENE_JOB_IN_PROGRESS',
          'Scene 자동 생성 중인 도면은 작업 종료 후 삭제할 수 있습니다.',409);
        await tx.sceneBuildJob.deleteMany({where:{versionId:id}});
      }
      const sceneTables=await tx.$queryRawUnsafe<{name:string}[]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='SceneAsset'");
      if(sceneTables.length){
        const assets=await tx.sceneAsset.findMany({where:{versionId:id},
          select:{id:true,storageLocator:true}});
        await tx.currentScene.deleteMany({where:{versionId:id}});
        for(const asset of assets){
          await tx.sceneOrphanJob.create({data:{id:randomUUID(),assetId:asset.id,
            storageLocator:asset.storageLocator,state:'CLEANUP'}});
        }
        await tx.sceneAsset.deleteMany({where:{versionId:id}});
      }
      // #98/#83: no unapproved physical cascade of business/audit history.
      const businessTables=await tx.$queryRawUnsafe<{name:string}[]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('CadOutline','CadMemo')");
      if (businessTables.length===1) throw new CadError('CAD_BUSINESS_SCHEMA_DRIFT','업무 데이터 테이블이 불완전합니다.',503);
      if (businessTables.length===2 && ((await tx.cadOutline.count({where:{versionId:id}}))>0 ||
          (await tx.cadMemo.count({where:{versionId:id}}))>0))
        throw new CadError('CAD_BUSINESS_DATA_EXISTS','연결된 외곽선·메모의 감사/보존 정책 확정 전에는 이 버전을 삭제할 수 없습니다.',409);
      const zoneTables=await tx.$queryRawUnsafe<{name:string}[]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('CadZoneGeometry','CadZoneCreateReceipt')");
      if(zoneTables.length===1)
        throw new CadError('CAD_ZONE_SCHEMA_DRIFT','구역 데이터 테이블이 불완전합니다.',503);
      if(zoneTables.length===2 && ((await tx.cadZoneGeometry.count({where:{versionId:id}}))>0 ||
          (await tx.cadZoneCreateReceipt.count({where:{versionId:id}}))>0))
        throw new CadError('CAD_ZONE_DATA_EXISTS','연결된 구역 기록이 있어 버전을 삭제할 수 없습니다.',409);
      await tx.cadFileVersion.delete({ where: { id } });
      if (auth && allowed) await appendG7CadAudit(
        tx, auth, allowed.actorId, allowed.siteId, 'CAD_VERSION_DELETED',
        id, current.version, null);
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
