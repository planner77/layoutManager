/** #84: new-empty-only G7 baseline extension. Previous business baseline is immutable. */
export const CAD_ANCHOR_DDL = [
 {type:'table',name:'CadMemoAnchor',sql:
  'CREATE TABLE "CadMemoAnchor" ("memo_id" TEXT NOT NULL PRIMARY KEY,"version_id" TEXT NOT NULL,"source_sha256" TEXT NOT NULL CHECK(length("source_sha256")=64),"status" TEXT NOT NULL CHECK("status" IN (\'ATTACHED\',\'BROKEN_ANCHOR\')),"target_origin" TEXT,"target_id" TEXT,"local_x" REAL,"local_y" REAL,"created_at" TEXT NOT NULL,"updated_at" TEXT NOT NULL,CHECK(("status"=\'ATTACHED\' AND "target_origin" IS NOT NULL AND "target_origin" IN (\'APP_CREATED\',\'DXF_IMPORTED\') AND "target_id" IS NOT NULL AND "local_x" IS NOT NULL AND "local_y" IS NOT NULL AND abs("local_x")<=1000000000000 AND abs("local_y")<=1000000000000) OR ("status"=\'BROKEN_ANCHOR\' AND "target_origin" IS NULL AND "target_id" IS NULL AND "local_x" IS NULL AND "local_y" IS NULL)),FOREIGN KEY("memo_id") REFERENCES "CadMemo"("id") ON DELETE NO ACTION ON UPDATE NO ACTION)' },
 {type:'index',name:'ix_cad_memo_anchor_target',sql:
  'CREATE INDEX "ix_cad_memo_anchor_target" ON "CadMemoAnchor"("version_id","target_origin","target_id","status")'},
 {type:'trigger',name:'cad_memo_anchor_immutable_scope',sql:
  'CREATE TRIGGER "cad_memo_anchor_immutable_scope" BEFORE UPDATE ON "CadMemoAnchor" WHEN NEW."memo_id"<>OLD."memo_id" OR NEW."version_id"<>OLD."version_id" OR NEW."source_sha256"<>OLD."source_sha256" OR OLD."status"=\'BROKEN_ANCHOR\' BEGIN SELECT RAISE(ABORT,\'CAD_MEMO_ANCHOR_IMMUTABLE\'); END'},
] as const;
export const CAD_ANCHOR_OBJECT_NAMES=new Set<string>(CAD_ANCHOR_DDL.map(row=>row.name));
