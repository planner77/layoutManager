/** #196: tables installed only into a brand-new, empty G7 Greenfield database. */
export const CAD_ZONE_DDL = [
 {type:'table',name:'ZoneCategory',sql:`CREATE TABLE "ZoneCategory" (
  "id" TEXT NOT NULL PRIMARY KEY,"site_id" TEXT NOT NULL,"name" TEXT NOT NULL CHECK(length("name") BETWEEN 1 AND 100),
  "name_key" TEXT NOT NULL,"active" INTEGER NOT NULL DEFAULT 1 CHECK("active" IN (0,1)),
  "sort_order" INTEGER NOT NULL CHECK("sort_order" BETWEEN 0 AND 9999),
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK("revision">=1),
  "created_by_id" TEXT NOT NULL,"updated_by_id" TEXT NOT NULL,"created_at" TEXT NOT NULL,"updated_at" TEXT NOT NULL,
  FOREIGN KEY("site_id") REFERENCES "CadSite"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("created_by_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("updated_by_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`},
 {type:'table',name:'CadZone',sql:`CREATE TABLE "CadZone" (
  "id" TEXT NOT NULL PRIMARY KEY,"location_id" TEXT NOT NULL,"site_id" TEXT NOT NULL,
  "name" TEXT NOT NULL CHECK(length("name") BETWEEN 1 AND 100),"name_key" TEXT NOT NULL CHECK(length("name_key")>=1),"category_id" TEXT,
  "description" TEXT NOT NULL CHECK(length("description")<=2000),"code" TEXT NOT NULL CHECK(length("code")<=100),
  "tags_json" TEXT NOT NULL CHECK(json_valid("tags_json")),"sort_order" INTEGER NOT NULL CHECK("sort_order" BETWEEN 0 AND 9999),
  "parent_zone_id" TEXT,"references_json" TEXT NOT NULL CHECK(json_valid("references_json")),
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK("revision">=1),
  "created_by_id" TEXT NOT NULL,"updated_by_id" TEXT NOT NULL,"deleted_by_id" TEXT,
  "created_at" TEXT NOT NULL,"updated_at" TEXT NOT NULL,"deleted_at" TEXT,
  CHECK(("deleted_at" IS NULL AND "deleted_by_id" IS NULL) OR ("deleted_at" IS NOT NULL AND "deleted_by_id" IS NOT NULL)),
  CHECK("parent_zone_id" IS NULL OR "parent_zone_id"<>"id"),
  FOREIGN KEY("location_id") REFERENCES "CadLocation"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("site_id") REFERENCES "CadSite"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("site_id","category_id") REFERENCES "ZoneCategory"("site_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("location_id","parent_zone_id") REFERENCES "CadZone"("location_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("created_by_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("updated_by_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("deleted_by_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`},
 {type:'table',name:'CadZoneGeometry',sql:`CREATE TABLE "CadZoneGeometry" (
  "zone_id" TEXT NOT NULL,"location_id" TEXT NOT NULL,"version_id" TEXT NOT NULL,"source_sha256" TEXT NOT NULL CHECK(length("source_sha256")=64),
  "scene_revision" INTEGER NOT NULL CHECK("scene_revision">=0),"polygon_json" TEXT NOT NULL CHECK(json_valid("polygon_json")),
  "bounds_json" TEXT NOT NULL CHECK(json_valid("bounds_json")),"area" REAL NOT NULL CHECK("area">0),
  "state" TEXT NOT NULL CHECK("state" IN ('MAPPED','UNMAPPED')),"reason" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK("revision">=1),"created_at" TEXT NOT NULL,"updated_at" TEXT NOT NULL,
  PRIMARY KEY("zone_id","version_id"),
  FOREIGN KEY("location_id","zone_id") REFERENCES "CadZone"("location_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("location_id","version_id") REFERENCES "CadFileVersion"("location_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION)`},
 {type:'table',name:'CadZoneCreateReceipt',sql:`CREATE TABLE "CadZoneCreateReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,"actor_user_id" TEXT NOT NULL,"version_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL CHECK(length("idempotency_key") BETWEEN 1 AND 128),
  "request_sha256" TEXT NOT NULL CHECK(length("request_sha256")=64),"zone_id" TEXT NOT NULL,"created_at" TEXT NOT NULL,
  FOREIGN KEY("actor_user_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("version_id") REFERENCES "CadFileVersion"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("zone_id") REFERENCES "CadZone"("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`},
 {type:'table',name:'CadZoneAudit',sql:`CREATE TABLE "CadZoneAudit" (
  "id" TEXT NOT NULL PRIMARY KEY,"actor_user_id" TEXT NOT NULL,"site_id" TEXT NOT NULL,
  "location_id" TEXT,"version_id" TEXT,"target_kind" TEXT NOT NULL CHECK("target_kind" IN ('ZONE','CATEGORY','GEOMETRY')),
  "target_id" TEXT NOT NULL,"action" TEXT NOT NULL CHECK("action" IN ('CREATE','EDIT','DELETE','UNMAP')),
  "before_revision" INTEGER,"after_revision" INTEGER,"request_id" TEXT NOT NULL,"timestamp_utc" TEXT NOT NULL,
  FOREIGN KEY("actor_user_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("site_id") REFERENCES "CadSite"("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`},
 {type:'index',name:'uq_zone_category_site_id',sql:'CREATE UNIQUE INDEX "uq_zone_category_site_id" ON "ZoneCategory"("site_id","id")'},
 {type:'index',name:'uq_zone_category_site_name',sql:'CREATE UNIQUE INDEX "uq_zone_category_site_name" ON "ZoneCategory"("site_id","name_key")'},
 {type:'index',name:'ix_zone_category_site_order',sql:'CREATE INDEX "ix_zone_category_site_order" ON "ZoneCategory"("site_id","active","sort_order")'},
 {type:'index',name:'uq_cad_zone_floor_id',sql:'CREATE UNIQUE INDEX "uq_cad_zone_floor_id" ON "CadZone"("location_id","id")'},
 {type:'index',name:'uq_cad_zone_live_name',sql:'CREATE UNIQUE INDEX "uq_cad_zone_live_name" ON "CadZone"("location_id","name_key") WHERE "deleted_at" IS NULL'},
 {type:'index',name:'ix_cad_zone_floor_live',sql:'CREATE INDEX "ix_cad_zone_floor_live" ON "CadZone"("location_id","deleted_at","sort_order")'},
 {type:'index',name:'ix_cad_zone_category',sql:'CREATE INDEX "ix_cad_zone_category" ON "CadZone"("site_id","category_id")'},
 {type:'index',name:'ix_cad_zone_parent',sql:'CREATE INDEX "ix_cad_zone_parent" ON "CadZone"("location_id","parent_zone_id")'},
 {type:'index',name:'ix_cad_zone_geometry_version',sql:'CREATE INDEX "ix_cad_zone_geometry_version" ON "CadZoneGeometry"("version_id","state")'},
 {type:'index',name:'uq_cad_zone_receipt_zone',sql:'CREATE UNIQUE INDEX "uq_cad_zone_receipt_zone" ON "CadZoneCreateReceipt"("zone_id")'},
 {type:'index',name:'uq_cad_zone_receipt_actor_version_key',sql:'CREATE UNIQUE INDEX "uq_cad_zone_receipt_actor_version_key" ON "CadZoneCreateReceipt"("actor_user_id","version_id","idempotency_key")'},
 {type:'index',name:'ix_cad_zone_audit_site_time',sql:'CREATE INDEX "ix_cad_zone_audit_site_time" ON "CadZoneAudit"("site_id","timestamp_utc")'},
 {type:'trigger',name:'zone_category_identity_guard',sql:`CREATE TRIGGER "zone_category_identity_guard" BEFORE UPDATE ON "ZoneCategory" WHEN
  NEW."id"<>OLD."id" OR NEW."site_id"<>OLD."site_id" OR NEW."created_by_id"<>OLD."created_by_id" OR
  NEW."created_at"<>OLD."created_at" OR NEW."revision"<>OLD."revision"+1
  BEGIN SELECT RAISE(ABORT,'ZONE_CATEGORY_IMMUTABLE'); END`},
 {type:'trigger',name:'cad_zone_parent_insert_guard',sql:`CREATE TRIGGER "cad_zone_parent_insert_guard" BEFORE INSERT ON "CadZone" WHEN
  NEW."parent_zone_id" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CadZone" WHERE "id"=NEW."parent_zone_id" AND
  "location_id"=NEW."location_id" AND "deleted_at" IS NULL)
  BEGIN SELECT RAISE(ABORT,'CAD_ZONE_PARENT_UNAVAILABLE'); END`},
 {type:'trigger',name:'cad_zone_parent_update_guard',sql:`CREATE TRIGGER "cad_zone_parent_update_guard" BEFORE UPDATE OF "parent_zone_id" ON "CadZone" WHEN
  NEW."parent_zone_id" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CadZone" WHERE "id"=NEW."parent_zone_id" AND
  "location_id"=NEW."location_id" AND "deleted_at" IS NULL)
  BEGIN SELECT RAISE(ABORT,'CAD_ZONE_PARENT_UNAVAILABLE'); END`},
 {type:'trigger',name:'cad_zone_parent_cycle_guard',sql:`CREATE TRIGGER "cad_zone_parent_cycle_guard" BEFORE UPDATE OF "parent_zone_id" ON "CadZone" WHEN
  NEW."parent_zone_id" IS NOT NULL AND EXISTS(
   WITH RECURSIVE ancestors(id,parent_id) AS (
    SELECT "id","parent_zone_id" FROM "CadZone" WHERE "id"=NEW."parent_zone_id"
    UNION SELECT p."id",p."parent_zone_id" FROM "CadZone" p JOIN ancestors a ON p."id"=a.parent_id
   ) SELECT 1 FROM ancestors WHERE id=NEW."id")
  BEGIN SELECT RAISE(ABORT,'CAD_ZONE_PARENT_CYCLE'); END`},
 {type:'trigger',name:'cad_zone_parent_delete_guard',sql:`CREATE TRIGGER "cad_zone_parent_delete_guard" BEFORE UPDATE OF "deleted_at" ON "CadZone" WHEN
  OLD."deleted_at" IS NULL AND NEW."deleted_at" IS NOT NULL AND EXISTS(SELECT 1 FROM "CadZone" WHERE
  "parent_zone_id"=OLD."id" AND "location_id"=OLD."location_id" AND "deleted_at" IS NULL)
  BEGIN SELECT RAISE(ABORT,'CAD_ZONE_CHILDREN_EXIST'); END`},
 {type:'trigger',name:'cad_zone_receipt_no_update',sql:'CREATE TRIGGER "cad_zone_receipt_no_update" BEFORE UPDATE ON "CadZoneCreateReceipt" BEGIN SELECT RAISE(ABORT,\'CAD_ZONE_RECEIPT_IMMUTABLE\'); END'},
 {type:'trigger',name:'cad_zone_receipt_no_delete',sql:'CREATE TRIGGER "cad_zone_receipt_no_delete" BEFORE DELETE ON "CadZoneCreateReceipt" BEGIN SELECT RAISE(ABORT,\'CAD_ZONE_RECEIPT_IMMUTABLE\'); END'},
 {type:'trigger',name:'cad_zone_identity_guard',sql:`CREATE TRIGGER "cad_zone_identity_guard" BEFORE UPDATE ON "CadZone" WHEN
  NEW."id"<>OLD."id" OR NEW."location_id"<>OLD."location_id" OR NEW."site_id"<>OLD."site_id" OR
  NEW."created_by_id"<>OLD."created_by_id" OR NEW."created_at"<>OLD."created_at" OR OLD."deleted_at" IS NOT NULL OR
  NEW."revision"<>OLD."revision"+1 BEGIN SELECT RAISE(ABORT,'CAD_ZONE_IMMUTABLE'); END`},
 {type:'trigger',name:'cad_zone_site_insert',sql:`CREATE TRIGGER "cad_zone_site_insert" BEFORE INSERT ON "CadZone" WHEN
  (SELECT b."site_id" FROM "CadLocation" l JOIN "Building" b ON b."id"=l."building_id" WHERE l."id"=NEW."location_id")<>NEW."site_id"
  BEGIN SELECT RAISE(ABORT,'CAD_ZONE_SITE_MISMATCH'); END`},
 {type:'trigger',name:'cad_zone_geometry_scope',sql:`CREATE TRIGGER "cad_zone_geometry_scope" BEFORE UPDATE ON "CadZoneGeometry" WHEN
  NEW."zone_id"<>OLD."zone_id" OR NEW."location_id"<>OLD."location_id" OR NEW."version_id"<>OLD."version_id" OR
  NEW."source_sha256"<>OLD."source_sha256" OR NEW."created_at"<>OLD."created_at" OR NEW."revision"<>OLD."revision"+1
  BEGIN SELECT RAISE(ABORT,'CAD_ZONE_GEOMETRY_IMMUTABLE'); END`},
 {type:'trigger',name:'cad_zone_geometry_source_insert',sql:`CREATE TRIGGER "cad_zone_geometry_source_insert" BEFORE INSERT ON "CadZoneGeometry" WHEN
  (SELECT "sha256" FROM "CadFileVersion" WHERE "id"=NEW."version_id")<>NEW."source_sha256"
  BEGIN SELECT RAISE(ABORT,'CAD_ZONE_SOURCE_MISMATCH'); END`},
 {type:'trigger',name:'cad_zone_no_delete',sql:'CREATE TRIGGER "cad_zone_no_delete" BEFORE DELETE ON "CadZone" BEGIN SELECT RAISE(ABORT,\'CAD_ZONE_DELETE_DENIED\'); END'},
 {type:'trigger',name:'zone_category_no_delete',sql:'CREATE TRIGGER "zone_category_no_delete" BEFORE DELETE ON "ZoneCategory" BEGIN SELECT RAISE(ABORT,\'ZONE_CATEGORY_DELETE_DENIED\'); END'},
 {type:'trigger',name:'cad_zone_audit_no_update',sql:'CREATE TRIGGER "cad_zone_audit_no_update" BEFORE UPDATE ON "CadZoneAudit" BEGIN SELECT RAISE(ABORT,\'CAD_ZONE_AUDIT_APPEND_ONLY\'); END'},
 {type:'trigger',name:'cad_zone_audit_no_delete',sql:'CREATE TRIGGER "cad_zone_audit_no_delete" BEFORE DELETE ON "CadZoneAudit" BEGIN SELECT RAISE(ABORT,\'CAD_ZONE_AUDIT_APPEND_ONLY\'); END'},
] as const;
export const CAD_ZONE_OBJECT_NAMES = new Set<string>(CAD_ZONE_DDL.map(row=>row.name));
