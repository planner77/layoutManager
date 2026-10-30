/** #85/#86: sidecar objects for newly installed EMPTY Greenfield only. No legacy ALTER/adopt. */
export const CAD_MEMO_FEATURE_DDL=[
 {type:'table',name:'CadMemoGroup',sql:`CREATE TABLE "CadMemoGroup" (
 "id" TEXT NOT NULL PRIMARY KEY, "version_id" TEXT NOT NULL, "source_sha256" TEXT NOT NULL CHECK(length("source_sha256")=64),
 "name" TEXT NOT NULL CHECK(length("name") BETWEEN 1 AND 80),"sort_order" INTEGER NOT NULL CHECK("sort_order">=0),
 "revision" INTEGER NOT NULL DEFAULT 0 CHECK("revision">=0),
 "created_by_id" TEXT NOT NULL,"updated_by_id" TEXT NOT NULL,"deleted_by_id" TEXT,
 "created_at" TEXT NOT NULL,"updated_at" TEXT NOT NULL,"deleted_at" TEXT,
 CHECK(("deleted_at" IS NULL AND "deleted_by_id" IS NULL) OR ("deleted_at" IS NOT NULL AND "deleted_by_id" IS NOT NULL)),
 FOREIGN KEY("version_id") REFERENCES "CadFileVersion"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
 FOREIGN KEY("created_by_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
 FOREIGN KEY("updated_by_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
 FOREIGN KEY("deleted_by_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`},
 {type:'table',name:'CadMemoFeature',sql:`CREATE TABLE "CadMemoFeature" (
 "memo_id" TEXT NOT NULL PRIMARY KEY,"version_id" TEXT NOT NULL,"source_sha256" TEXT NOT NULL CHECK(length("source_sha256")=64),
 "group_id" TEXT,"visible" BOOLEAN NOT NULL DEFAULT 1 CHECK("visible" IN (0,1)),
 "schedule_enabled" BOOLEAN NOT NULL DEFAULT 0 CHECK("schedule_enabled" IN (0,1)),
 "start_date" TEXT,"due_date" TEXT,
 "completion_enabled" BOOLEAN NOT NULL DEFAULT 0 CHECK("completion_enabled" IN (0,1)),
 "is_completed" BOOLEAN NOT NULL DEFAULT 0 CHECK("is_completed" IN (0,1)),
 "completed_at" TEXT,
 CHECK("schedule_enabled"=1 OR ("start_date" IS NULL AND "due_date" IS NULL)),
 CHECK("start_date" IS NULL OR "start_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 CHECK("due_date" IS NULL OR "due_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 CHECK("start_date" IS NULL OR "due_date" IS NULL OR "start_date"<="due_date"),
 CHECK(("completion_enabled"=0 AND "is_completed"=0 AND "completed_at" IS NULL) OR
 ("completion_enabled"=1 AND (("is_completed"=0 AND "completed_at" IS NULL) OR ("is_completed"=1 AND "completed_at" IS NOT NULL)))),
 FOREIGN KEY("memo_id") REFERENCES "CadMemo"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
 FOREIGN KEY("group_id") REFERENCES "CadMemoGroup"("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`},
 {type:'index',name:'ix_cad_memo_group_version_live',sql:'CREATE INDEX "ix_cad_memo_group_version_live" ON "CadMemoGroup"("version_id","deleted_at","sort_order")'},
 {type:'index',name:'ix_cad_memo_feature_version_group',sql:'CREATE INDEX "ix_cad_memo_feature_version_group" ON "CadMemoFeature"("version_id","group_id")'},
 {type:'trigger',name:'cad_memo_group_immutable',sql:`CREATE TRIGGER "cad_memo_group_immutable" BEFORE UPDATE ON "CadMemoGroup"
 WHEN NEW."id"<>OLD."id" OR NEW."version_id"<>OLD."version_id" OR NEW."source_sha256"<>OLD."source_sha256" OR
 NEW."created_by_id"<>OLD."created_by_id" OR NEW."created_at"<>OLD."created_at" OR OLD."deleted_at" IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'CAD_MEMO_GROUP_IMMUTABLE'); END`},
 {type:'trigger',name:'cad_memo_feature_immutable',sql:`CREATE TRIGGER "cad_memo_feature_immutable" BEFORE UPDATE ON "CadMemoFeature"
 WHEN NEW."memo_id"<>OLD."memo_id" OR NEW."version_id"<>OLD."version_id" OR NEW."source_sha256"<>OLD."source_sha256"
 BEGIN SELECT RAISE(ABORT,'CAD_MEMO_FEATURE_SCOPE_IMMUTABLE'); END`}
] as const;
export const CAD_MEMO_FEATURE_OBJECT_NAMES=new Set<string>(CAD_MEMO_FEATURE_DDL.map(row=>row.name));
