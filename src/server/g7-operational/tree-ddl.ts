/** #201 additive Version tree schema. Historical baseline hashes remain frozen. */
import {createHash} from 'node:crypto';
export const TREE_MIGRATION_NAME='202611130001_unified_tree' as const;
export const TREE_DDL=[
 {type:'table',name:'TreeFolder',sql:`CREATE TABLE "TreeFolder" (
  "id" TEXT NOT NULL PRIMARY KEY,"version_id" TEXT NOT NULL,"parent_folder_id" TEXT,
  "name" TEXT NOT NULL CHECK(length("name") BETWEEN 1 AND 100),"name_key" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL CHECK("sort_order" BETWEEN 0 AND 9999),"revision" INTEGER NOT NULL CHECK("revision">=1),
  "created_by_id" TEXT NOT NULL,"updated_by_id" TEXT NOT NULL,"deleted_by_id" TEXT,
  "created_at" TEXT NOT NULL,"updated_at" TEXT NOT NULL,"deleted_at" TEXT,
  CHECK("parent_folder_id" IS NULL OR "parent_folder_id"<>"id"),
  CHECK(("deleted_at" IS NULL AND "deleted_by_id" IS NULL) OR ("deleted_at" IS NOT NULL AND "deleted_by_id" IS NOT NULL)),
  FOREIGN KEY("version_id") REFERENCES "CadFileVersion"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("created_by_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("updated_by_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("deleted_by_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("version_id","parent_folder_id") REFERENCES "TreeFolder"("version_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION)`},
 {type:'table',name:'TreeMembership',sql:`CREATE TABLE "TreeMembership" (
  "id" TEXT NOT NULL PRIMARY KEY,"version_id" TEXT NOT NULL,"kind" TEXT NOT NULL CHECK("kind" IN ('OUTLINE','ZONE')),
  "object_id" TEXT NOT NULL,"folder_id" TEXT,"sort_order" INTEGER NOT NULL CHECK("sort_order" BETWEEN 0 AND 9999),
  "revision" INTEGER NOT NULL CHECK("revision">=1),"created_by_id" TEXT NOT NULL,"updated_by_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,"updated_at" TEXT NOT NULL,
  FOREIGN KEY("version_id") REFERENCES "CadFileVersion"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("version_id","folder_id") REFERENCES "TreeFolder"("version_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("created_by_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("updated_by_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`},
 {type:'table',name:'TreeAudit',sql:`CREATE TABLE "TreeAudit" (
  "id" TEXT NOT NULL PRIMARY KEY,"actor_user_id" TEXT NOT NULL,"site_id" TEXT NOT NULL,"version_id" TEXT NOT NULL,
  "target_kind" TEXT NOT NULL CHECK("target_kind" IN ('FOLDER','OUTLINE','ZONE')),"target_id" TEXT NOT NULL,
  "action" TEXT NOT NULL CHECK("action" IN ('CREATE','EDIT','MOVE','DELETE')),
  "before_revision" INTEGER,"after_revision" INTEGER,"request_id" TEXT NOT NULL,"timestamp_utc" TEXT NOT NULL,
  FOREIGN KEY("actor_user_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("site_id") REFERENCES "CadSite"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("version_id") REFERENCES "CadFileVersion"("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`},
 {type:'index',name:'uq_tree_folder_version_id',sql:'CREATE UNIQUE INDEX "uq_tree_folder_version_id" ON "TreeFolder"("version_id","id")'},
 {type:'index',name:'uq_tree_folder_live_sibling',sql:'CREATE UNIQUE INDEX "uq_tree_folder_live_sibling" ON "TreeFolder"("version_id",coalesce("parent_folder_id",\'\'),"name_key") WHERE "deleted_at" IS NULL'},
 {type:'index',name:'ix_tree_folder_order',sql:'CREATE INDEX "ix_tree_folder_order" ON "TreeFolder"("version_id","parent_folder_id","sort_order")'},
 {type:'index',name:'uq_tree_membership_object',sql:'CREATE UNIQUE INDEX "uq_tree_membership_object" ON "TreeMembership"("version_id","kind","object_id")'},
 {type:'index',name:'ix_tree_membership_folder',sql:'CREATE INDEX "ix_tree_membership_folder" ON "TreeMembership"("version_id","folder_id","sort_order")'},
 {type:'index',name:'ix_tree_audit_version',sql:'CREATE INDEX "ix_tree_audit_version" ON "TreeAudit"("version_id","timestamp_utc")'},
 {type:'trigger',name:'tree_folder_insert_guard',sql:`CREATE TRIGGER "tree_folder_insert_guard" BEFORE INSERT ON "TreeFolder" WHEN NEW."parent_folder_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "TreeFolder" p WHERE p."id"=NEW."parent_folder_id" AND p."version_id"=NEW."version_id" AND p."deleted_at" IS NULL) BEGIN SELECT RAISE(ABORT,'tree parent invalid'); END`},
 {type:'trigger',name:'tree_folder_update_guard',sql:`CREATE TRIGGER "tree_folder_update_guard" BEFORE UPDATE ON "TreeFolder" BEGIN
  SELECT CASE WHEN NEW."id"<>OLD."id" OR NEW."version_id"<>OLD."version_id" OR NEW."created_by_id"<>OLD."created_by_id" OR NEW."created_at"<>OLD."created_at" OR NEW."revision"<>OLD."revision"+1 THEN RAISE(ABORT,'tree folder identity or revision') END;
  SELECT CASE WHEN OLD."deleted_at" IS NOT NULL OR NEW."deleted_at" IS NULL AND OLD."deleted_at" IS NOT NULL THEN RAISE(ABORT,'tree deleted folder immutable') END;
  SELECT CASE WHEN NEW."parent_folder_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "TreeFolder" p WHERE p."id"=NEW."parent_folder_id" AND p."version_id"=NEW."version_id" AND p."deleted_at" IS NULL) THEN RAISE(ABORT,'tree parent invalid') END;
  SELECT CASE WHEN NEW."parent_folder_id" IS NOT NULL AND EXISTS (WITH RECURSIVE ancestor(id,parent_id) AS (SELECT id,parent_folder_id FROM "TreeFolder" WHERE id=NEW."parent_folder_id" UNION ALL SELECT p.id,p.parent_folder_id FROM "TreeFolder" p JOIN ancestor a ON p.id=a.parent_id) SELECT 1 FROM ancestor WHERE id=NEW."id") THEN RAISE(ABORT,'tree folder cycle') END;
  SELECT CASE WHEN NEW."deleted_at" IS NOT NULL AND OLD."deleted_at" IS NULL AND (EXISTS (SELECT 1 FROM "TreeFolder" c WHERE c."parent_folder_id"=OLD."id" AND c."deleted_at" IS NULL) OR EXISTS (SELECT 1 FROM "TreeMembership" m WHERE m."folder_id"=OLD."id" AND (m."kind"='OUTLINE' AND EXISTS (SELECT 1 FROM "CadOutline" o WHERE o."id"=m."object_id" AND o."deleted_at" IS NULL) OR m."kind"='ZONE' AND EXISTS (SELECT 1 FROM "CadZone" z WHERE z."id"=m."object_id" AND z."deleted_at" IS NULL AND z."parent_zone_id" IS NULL)))) THEN RAISE(ABORT,'tree folder occupied') END;
 END`},
 {type:'trigger',name:'tree_membership_insert_guard',sql:`CREATE TRIGGER "tree_membership_insert_guard" BEFORE INSERT ON "TreeMembership" BEGIN
  SELECT CASE WHEN NEW."folder_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "TreeFolder" f WHERE f."id"=NEW."folder_id" AND f."version_id"=NEW."version_id" AND f."deleted_at" IS NULL) THEN RAISE(ABORT,'tree folder invalid') END;
  SELECT CASE WHEN NEW."kind"='OUTLINE' AND NOT EXISTS (SELECT 1 FROM "CadOutline" o WHERE o."id"=NEW."object_id" AND o."version_id"=NEW."version_id" AND o."deleted_at" IS NULL) THEN RAISE(ABORT,'tree outline invalid') END;
  SELECT CASE WHEN NEW."kind"='ZONE' AND NOT EXISTS (SELECT 1 FROM "CadZone" z JOIN "CadFileVersion" v ON v."location_id"=z."location_id" WHERE z."id"=NEW."object_id" AND v."id"=NEW."version_id" AND z."deleted_at" IS NULL AND z."parent_zone_id" IS NULL) THEN RAISE(ABORT,'tree zone invalid') END;
 END`},
 {type:'trigger',name:'tree_membership_update_guard',sql:`CREATE TRIGGER "tree_membership_update_guard" BEFORE UPDATE ON "TreeMembership" BEGIN
  SELECT CASE WHEN NEW."id"<>OLD."id" OR NEW."version_id"<>OLD."version_id" OR NEW."kind"<>OLD."kind" OR NEW."object_id"<>OLD."object_id" OR NEW."created_by_id"<>OLD."created_by_id" OR NEW."created_at"<>OLD."created_at" OR NEW."revision"<>OLD."revision"+1 THEN RAISE(ABORT,'tree membership identity or revision') END;
  SELECT CASE WHEN NEW."folder_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "TreeFolder" f WHERE f."id"=NEW."folder_id" AND f."version_id"=NEW."version_id" AND f."deleted_at" IS NULL) THEN RAISE(ABORT,'tree folder invalid') END;
  SELECT CASE WHEN NEW."kind"='OUTLINE' AND NOT EXISTS (SELECT 1 FROM "CadOutline" o WHERE o."id"=NEW."object_id" AND o."version_id"=NEW."version_id" AND o."deleted_at" IS NULL) THEN RAISE(ABORT,'tree outline invalid') END;
  SELECT CASE WHEN NEW."kind"='ZONE' AND NOT EXISTS (SELECT 1 FROM "CadZone" z JOIN "CadFileVersion" v ON v."location_id"=z."location_id" WHERE z."id"=NEW."object_id" AND v."id"=NEW."version_id" AND z."deleted_at" IS NULL AND z."parent_zone_id" IS NULL) THEN RAISE(ABORT,'tree zone invalid') END;
 END`},
 {type:'trigger',name:'tree_zone_reparent_guard',sql:`CREATE TRIGGER "tree_zone_reparent_guard" BEFORE UPDATE OF "parent_zone_id" ON "CadZone" WHEN NEW."parent_zone_id" IS NOT NULL AND OLD."parent_zone_id" IS NULL AND EXISTS (SELECT 1 FROM "TreeMembership" WHERE "kind"='ZONE' AND "object_id"=NEW."id" AND "folder_id" IS NOT NULL) BEGIN SELECT RAISE(ABORT,'tree zone classified'); END`},
 {type:'trigger',name:'tree_audit_insert_guard',sql:`CREATE TRIGGER "tree_audit_insert_guard" BEFORE INSERT ON "TreeAudit" WHEN NOT EXISTS (SELECT 1 FROM "CadFileVersion" v JOIN "CadLocation" l ON l."id"=v."location_id" JOIN "Building" b ON b."id"=l."building_id" WHERE v."id"=NEW."version_id" AND b."site_id"=NEW."site_id") BEGIN SELECT RAISE(ABORT,'tree audit site invalid'); END`},
 {type:'trigger',name:'tree_audit_immutable',sql:`CREATE TRIGGER "tree_audit_immutable" BEFORE UPDATE ON "TreeAudit" BEGIN SELECT RAISE(ABORT,'tree audit immutable'); END`},
 {type:'trigger',name:'tree_audit_no_delete',sql:`CREATE TRIGGER "tree_audit_no_delete" BEFORE DELETE ON "TreeAudit" BEGIN SELECT RAISE(ABORT,'tree audit immutable'); END`},
] as const;
export const TREE_OBJECT_NAMES=new Set<string>(TREE_DDL.map(x=>x.name));
export const TREE_MIGRATION_SQL=TREE_DDL.map(x=>x.sql+';').join('\n')+'\n';
export const TREE_MIGRATION_CHECKSUM=createHash('sha256').update(TREE_MIGRATION_SQL).digest('hex');
