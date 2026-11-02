-- #164 candidate only. Applied to a disposable clone or constructed into a
-- new Greenfield final baseline; never included in the active legacy migrator.
-- Existing append-only Audit rows are copied verbatim. The revised CHECK adds
-- exactly SCENE_PUBLISHED for VERSION+Site and retains every older constraint.
DROP TRIGGER "g1_audit_no_update";
DROP TRIGGER "g1_audit_no_delete";
CREATE TABLE "AuditEvent_scene" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actor_user_id" TEXT,
  "action" TEXT NOT NULL CHECK("action" IN (
    'LOGIN_SUCCESS','LOGIN_DENIED','SESSION_REVOKED','ACCOUNT_CREATED',
    'ACCOUNT_DISABLED','PASSWORD_RESET','ADMIN_BOOTSTRAP','ADMIN_RECOVERY',
    'ROLE_GRANTED','ROLE_REVOKED','SITE_GRANTED','SITE_REVOKED',
    'OUTLINE_CREATED','OUTLINE_EDITED','OUTLINE_DELETED','AUTHORIZATION_DENIED',
    'AUTHORIZATION_GRANTED','CAD_UPLOADED','CAD_CURRENT_CHANGED','CAD_VERSION_DELETED','SCENE_PUBLISHED')),
  "affected_user_id" TEXT,
  "site_id" TEXT,
  "target_kind" TEXT NOT NULL CHECK("target_kind" IN ('ACCOUNT','SESSION','SITE','VERSION','OUTLINE','ROLE')),
  "target_id" TEXT NOT NULL CHECK(length("target_id") BETWEEN 1 AND 128),
  "before_revision" INTEGER CHECK("before_revision" IS NULL OR "before_revision">=0),
  "after_revision" INTEGER CHECK("after_revision" IS NULL OR "after_revision">=0),
  "outcome" TEXT NOT NULL CHECK("outcome" IN ('SUCCESS','DENIED','FAILED')),
  "timestamp_utc" TEXT NOT NULL,
  "request_id" TEXT NOT NULL CHECK(length("request_id") BETWEEN 1 AND 128),
  CHECK(
    ("action" IN ('SITE_GRANTED','SITE_REVOKED')
      AND "affected_user_id" IS NOT NULL AND "site_id" IS NOT NULL)
    OR ("action" NOT IN ('SITE_GRANTED','SITE_REVOKED') AND (
      ("action" IN ('OUTLINE_CREATED','OUTLINE_EDITED','OUTLINE_DELETED')
        AND "target_kind"='OUTLINE' AND "site_id" IS NOT NULL)
      OR ("action" IN ('CAD_UPLOADED','CAD_CURRENT_CHANGED','CAD_VERSION_DELETED','SCENE_PUBLISHED')
        AND "target_kind"='VERSION' AND "site_id" IS NOT NULL)
      OR ("action" IN ('AUTHORIZATION_GRANTED','AUTHORIZATION_DENIED')
        AND ("site_id" IS NULL OR "target_kind" IN ('SITE','VERSION','OUTLINE')))
      OR ("action" NOT IN (
        'OUTLINE_CREATED','OUTLINE_EDITED','OUTLINE_DELETED',
        'AUTHORIZATION_GRANTED','AUTHORIZATION_DENIED',
        'CAD_UPLOADED','CAD_CURRENT_CHANGED','CAD_VERSION_DELETED','SCENE_PUBLISHED')
        AND "site_id" IS NULL)
    ))
  ),
  FOREIGN KEY("actor_user_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("affected_user_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("site_id") REFERENCES "CadSite"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
INSERT INTO "AuditEvent_scene" SELECT * FROM "AuditEvent";
DROP TABLE "AuditEvent";
ALTER TABLE "AuditEvent_scene" RENAME TO "AuditEvent";
CREATE INDEX "ix_g1_audit_time" ON "AuditEvent"("timestamp_utc");
CREATE INDEX "ix_g1_audit_actor_time" ON "AuditEvent"("actor_user_id","timestamp_utc");
CREATE INDEX "ix_g1_audit_affected_site_time" ON "AuditEvent"("affected_user_id","site_id","timestamp_utc");
CREATE TRIGGER "g1_audit_no_update" BEFORE UPDATE ON "AuditEvent"
BEGIN SELECT RAISE(ABORT,'G1_AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER "g1_audit_no_delete" BEFORE DELETE ON "AuditEvent"
BEGIN SELECT RAISE(ABORT,'G1_AUDIT_APPEND_ONLY'); END;

CREATE TABLE "SceneAsset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "version_id" TEXT NOT NULL,
  "source_sha256" TEXT NOT NULL,
  "manifest_json" TEXT NOT NULL,
  "digest" TEXT NOT NULL,
  "byte_length" INTEGER NOT NULL CHECK ("byte_length" > 0),
  "format" TEXT NOT NULL CHECK ("format" = 'CUSTOM_DTO'),
  "storage_locator" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_scene_asset_version" FOREIGN KEY ("version_id") REFERENCES "CadFileVersion" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "uq_scene_storage_locator" ON "SceneAsset" ("storage_locator");
CREATE UNIQUE INDEX "uq_scene_asset_version_id" ON "SceneAsset" ("version_id", "id");
CREATE INDEX "ix_scene_asset_version_created" ON "SceneAsset" ("version_id", "created_at");

CREATE TABLE "CurrentScene" (
  "version_id" TEXT NOT NULL PRIMARY KEY,
  "asset_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL CHECK ("revision" >= 0),
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_current_scene_version" FOREIGN KEY ("version_id") REFERENCES "CadFileVersion" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_current_scene_asset" FOREIGN KEY ("version_id", "asset_id") REFERENCES "SceneAsset" ("version_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "ix_current_scene_asset" ON "CurrentScene" ("asset_id");
CREATE UNIQUE INDEX "uq_current_scene_version_asset" ON "CurrentScene" ("version_id", "asset_id");

CREATE TABLE "SceneOrphanJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "asset_id" TEXT NOT NULL,
  "storage_locator" TEXT NOT NULL,
  "state" TEXT NOT NULL CHECK ("state" IN ('PREPARING','VERIFIED','UNCERTAIN','CLEANUP')),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "uq_scene_orphan_asset" ON "SceneOrphanJob" ("asset_id");
CREATE UNIQUE INDEX "uq_scene_orphan_locator" ON "SceneOrphanJob" ("storage_locator");
CREATE INDEX "ix_scene_orphan_state_created" ON "SceneOrphanJob" ("state", "created_at");
