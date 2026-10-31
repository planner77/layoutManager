/** #98/#83 new-empty-Greenfield business tables. NEVER apply to an existing volume. */
export const CAD_BUSINESS_DDL = [
  {
    "type": "table",
    "name": "CadOutline",
    "sql": "CREATE TABLE \"CadOutline\" (\"id\" TEXT NOT NULL PRIMARY KEY,\"version_id\" TEXT NOT NULL,\"source_sha256\" TEXT NOT NULL CHECK(length(\"source_sha256\")=64),\"scene_revision\" INTEGER NOT NULL CHECK(\"scene_revision\">=0),\"origin\" TEXT NOT NULL CHECK(\"origin\"='APP_CREATED'),\"validation_mode\" TEXT NOT NULL CHECK(\"validation_mode\" IN ('APP_CREATED','SOURCE_CANONICAL')),\"kind\" TEXT NOT NULL CHECK(\"kind\" IN ('CONVEX','PRECISE')),\"name\" TEXT NOT NULL CHECK(length(\"name\") BETWEEN 1 AND 100),\"base_geometry_json\" TEXT NOT NULL,\"geometry_json\" TEXT NOT NULL,\"source_refs_json\" TEXT NOT NULL,\"derived_from_json\" TEXT NOT NULL,\"transform_json\" TEXT NOT NULL,\"outline_type_id\" TEXT,\"revision\" INTEGER NOT NULL DEFAULT 0 CHECK(\"revision\">=0),\"created_by_id\" TEXT NOT NULL,\"updated_by_id\" TEXT NOT NULL,\"deleted_by_id\" TEXT,\"created_at\" TEXT NOT NULL,\"updated_at\" TEXT NOT NULL,\"deleted_at\" TEXT, CHECK((\"deleted_at\" IS NULL AND \"deleted_by_id\" IS NULL) OR (\"deleted_at\" IS NOT NULL AND \"deleted_by_id\" IS NOT NULL)), FOREIGN KEY(\"version_id\") REFERENCES \"CadFileVersion\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,FOREIGN KEY(\"created_by_id\") REFERENCES \"User\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,FOREIGN KEY(\"updated_by_id\") REFERENCES \"User\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,FOREIGN KEY(\"deleted_by_id\") REFERENCES \"User\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION)"
  },
  {
    "type": "table",
    "name": "CadMemo",
    "sql": "CREATE TABLE \"CadMemo\" (\"id\" TEXT NOT NULL PRIMARY KEY,\"version_id\" TEXT NOT NULL,\"source_sha256\" TEXT NOT NULL CHECK(length(\"source_sha256\")=64),\"title\" TEXT NOT NULL CHECK(length(\"title\") BETWEEN 1 AND 100),\"content\" TEXT NOT NULL CHECK(length(\"content\")<=2000),\"anchor_x\" REAL NOT NULL CHECK(abs(\"anchor_x\")<=1000000000000),\"anchor_y\" REAL NOT NULL CHECK(abs(\"anchor_y\")<=1000000000000),\"offset_x\" REAL NOT NULL CHECK(abs(\"offset_x\")<=1000000000000),\"offset_y\" REAL NOT NULL CHECK(abs(\"offset_y\")<=1000000000000),\"revision\" INTEGER NOT NULL DEFAULT 0 CHECK(\"revision\">=0),\"created_by_id\" TEXT NOT NULL,\"updated_by_id\" TEXT NOT NULL,\"deleted_by_id\" TEXT,\"created_at\" TEXT NOT NULL,\"updated_at\" TEXT NOT NULL,\"deleted_at\" TEXT,CHECK((\"deleted_at\" IS NULL AND \"deleted_by_id\" IS NULL) OR (\"deleted_at\" IS NOT NULL AND \"deleted_by_id\" IS NOT NULL)),FOREIGN KEY(\"version_id\") REFERENCES \"CadFileVersion\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,FOREIGN KEY(\"created_by_id\") REFERENCES \"User\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,FOREIGN KEY(\"updated_by_id\") REFERENCES \"User\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,FOREIGN KEY(\"deleted_by_id\") REFERENCES \"User\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION)"
  },
  {
    "type": "table",
    "name": "CadBusinessAudit",
    "sql": "CREATE TABLE \"CadBusinessAudit\" (\"id\" TEXT NOT NULL PRIMARY KEY,\"actor_user_id\" TEXT NOT NULL,\"site_id\" TEXT NOT NULL,\"version_id\" TEXT NOT NULL,\"target_kind\" TEXT NOT NULL CHECK(\"target_kind\" IN ('OUTLINE','MEMO')),\"target_id\" TEXT NOT NULL,\"action\" TEXT NOT NULL CHECK(\"action\" IN ('CREATE','EDIT','DELETE')),\"before_revision\" INTEGER,\"after_revision\" INTEGER,\"outcome\" TEXT NOT NULL CHECK(\"outcome\"='SUCCESS'),\"request_id\" TEXT NOT NULL,\"timestamp_utc\" TEXT NOT NULL,FOREIGN KEY(\"actor_user_id\") REFERENCES \"User\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION,FOREIGN KEY(\"site_id\") REFERENCES \"CadSite\"(\"id\") ON DELETE NO ACTION ON UPDATE NO ACTION)"
  },
  {
    "type": "index",
    "name": "ix_cad_outline_version_live",
    "sql": "CREATE INDEX \"ix_cad_outline_version_live\" ON \"CadOutline\"(\"version_id\",\"deleted_at\")"
  },
  {
    "type": "index",
    "name": "ix_cad_memo_version_live",
    "sql": "CREATE INDEX \"ix_cad_memo_version_live\" ON \"CadMemo\"(\"version_id\",\"deleted_at\")"
  },
  {
    "type": "index",
    "name": "ix_cad_business_audit_version_time",
    "sql": "CREATE INDEX \"ix_cad_business_audit_version_time\" ON \"CadBusinessAudit\"(\"version_id\",\"timestamp_utc\")"
  },
  {
    "type": "index",
    "name": "ix_cad_business_audit_actor_time",
    "sql": "CREATE INDEX \"ix_cad_business_audit_actor_time\" ON \"CadBusinessAudit\"(\"actor_user_id\",\"timestamp_utc\")"
  },
  {
    "type": "trigger",
    "name": "cad_outline_immutable_scope",
    "sql": "CREATE TRIGGER \"cad_outline_immutable_scope\" BEFORE UPDATE ON \"CadOutline\" WHEN NEW.\"id\"<>OLD.\"id\" OR NEW.\"version_id\"<>OLD.\"version_id\" OR NEW.\"source_sha256\"<>OLD.\"source_sha256\" OR NEW.\"created_by_id\"<>OLD.\"created_by_id\" OR NEW.\"created_at\"<>OLD.\"created_at\" OR (OLD.\"deleted_at\" IS NOT NULL) BEGIN SELECT RAISE(ABORT,'CAD_OUTLINE_IMMUTABLE'); END"
  },
  {
    "type": "trigger",
    "name": "cad_memo_immutable_scope",
    "sql": "CREATE TRIGGER \"cad_memo_immutable_scope\" BEFORE UPDATE ON \"CadMemo\" WHEN NEW.\"id\"<>OLD.\"id\" OR NEW.\"version_id\"<>OLD.\"version_id\" OR NEW.\"source_sha256\"<>OLD.\"source_sha256\" OR NEW.\"created_by_id\"<>OLD.\"created_by_id\" OR NEW.\"created_at\"<>OLD.\"created_at\" OR (OLD.\"deleted_at\" IS NOT NULL) BEGIN SELECT RAISE(ABORT,'CAD_MEMO_IMMUTABLE'); END"
  },
  {
    "type": "trigger",
    "name": "cad_business_audit_no_update",
    "sql": "CREATE TRIGGER \"cad_business_audit_no_update\" BEFORE UPDATE ON \"CadBusinessAudit\" BEGIN SELECT RAISE(ABORT,'CAD_BUSINESS_AUDIT_APPEND_ONLY'); END"
  },
  {
    "type": "trigger",
    "name": "cad_business_audit_no_delete",
    "sql": "CREATE TRIGGER \"cad_business_audit_no_delete\" BEFORE DELETE ON \"CadBusinessAudit\" BEGIN SELECT RAISE(ABORT,'CAD_BUSINESS_AUDIT_APPEND_ONLY'); END"
  }
] as const;
export const CAD_BUSINESS_OBJECT_NAMES = new Set<string>(CAD_BUSINESS_DDL.map(row=>row.name));

/** #65 latest EMPTY Greenfield baseline only. Historical CAD_BUSINESS_DDL is immutable. */
const previousOutline = CAD_BUSINESS_DDL.find(row => row.name === 'CadOutline');
if (!previousOutline || previousOutline.type !== 'table') throw new Error('OUTLINE_TYPE_DDL_BASE_MISSING');
const anchor = 'FOREIGN KEY("version_id") REFERENCES "CadFileVersion"("id")';
if (previousOutline.sql.split(anchor).length !== 2) throw new Error('OUTLINE_TYPE_DDL_BASE_CHANGED');
export const LATEST_CAD_OUTLINE_DDL = previousOutline.sql.replace(anchor,
  'FOREIGN KEY("outline_type_id") REFERENCES "OutlineType"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,' + anchor);
export const LATEST_CAD_BUSINESS_DDL = CAD_BUSINESS_DDL.map(row =>
  row.name === 'CadOutline' ? { type: row.type, name: row.name, sql: LATEST_CAD_OUTLINE_DDL } : row);

export const OUTLINE_TYPE_DDL = [
  { type: 'table', name: 'OutlineType', sql: `CREATE TABLE "OutlineType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL CHECK(length("name") BETWEEN 1 AND 100),
    "name_key" TEXT NOT NULL CHECK(length("name_key")>=1),
    "description" TEXT CHECK("description" IS NULL OR length("description")<=500),
    "active" INTEGER NOT NULL DEFAULT 1 CHECK("active" IN (0,1)),
    "sort_order" INTEGER NOT NULL CHECK("sort_order" BETWEEN 0 AND 9999),
    "revision" INTEGER NOT NULL DEFAULT 1 CHECK("revision">=1),
    "created_by_id" TEXT NOT NULL,"updated_by_id" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,"updated_at" TEXT NOT NULL,
    FOREIGN KEY("created_by_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    FOREIGN KEY("updated_by_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION)` },
  { type: 'table', name: 'OutlineTypeAudit', sql: `CREATE TABLE "OutlineTypeAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,"actor_user_id" TEXT NOT NULL,"outline_type_id" TEXT NOT NULL,
    "action" TEXT NOT NULL CHECK("action" IN ('CREATE','UPDATE','DEACTIVATE','REACTIVATE')),
    "before_revision" INTEGER CHECK("before_revision" IS NULL OR "before_revision">=1),
    "after_revision" INTEGER NOT NULL CHECK("after_revision">=1),
    "outcome" TEXT NOT NULL CHECK("outcome"='SUCCESS'),
    "timestamp_utc" TEXT NOT NULL,"request_id" TEXT NOT NULL CHECK(length("request_id") BETWEEN 1 AND 128),
    FOREIGN KEY("actor_user_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    FOREIGN KEY("outline_type_id") REFERENCES "OutlineType"("id") ON DELETE NO ACTION ON UPDATE NO ACTION)` },
  { type: 'index', name: 'uq_outline_type_name_key', sql:
    'CREATE UNIQUE INDEX "uq_outline_type_name_key" ON "OutlineType"("name_key")' },
  { type: 'index', name: 'ix_outline_type_order', sql:
    'CREATE INDEX "ix_outline_type_order" ON "OutlineType"("sort_order","name_key","id")' },
  { type: 'index', name: 'ix_outline_type_audit_type_time', sql:
    'CREATE INDEX "ix_outline_type_audit_type_time" ON "OutlineTypeAudit"("outline_type_id","timestamp_utc")' },
  { type: 'trigger', name: 'outline_type_immutable', sql: `CREATE TRIGGER "outline_type_immutable" BEFORE UPDATE ON "OutlineType"
    WHEN NEW."id"<>OLD."id" OR NEW."created_at"<>OLD."created_at" OR
      NEW."created_by_id"<>OLD."created_by_id" OR NEW."revision"<>OLD."revision"+1
    BEGIN SELECT RAISE(ABORT,'OUTLINE_TYPE_IMMUTABLE'); END` },
  { type: 'trigger', name: 'outline_type_no_delete', sql:
    'CREATE TRIGGER "outline_type_no_delete" BEFORE DELETE ON "OutlineType" BEGIN SELECT RAISE(ABORT,\'OUTLINE_TYPE_DELETE_DENIED\'); END' },
  { type: 'trigger', name: 'outline_type_audit_no_update', sql:
    'CREATE TRIGGER "outline_type_audit_no_update" BEFORE UPDATE ON "OutlineTypeAudit" BEGIN SELECT RAISE(ABORT,\'OUTLINE_TYPE_AUDIT_APPEND_ONLY\'); END' },
  { type: 'trigger', name: 'outline_type_audit_no_delete', sql:
    'CREATE TRIGGER "outline_type_audit_no_delete" BEFORE DELETE ON "OutlineTypeAudit" BEGIN SELECT RAISE(ABORT,\'OUTLINE_TYPE_AUDIT_APPEND_ONLY\'); END' },
] as const;
export const OUTLINE_TYPE_OBJECT_NAMES = new Set<string>(OUTLINE_TYPE_DDL.map(row => row.name));

/** #71/#73: only the newest EMPTY Greenfield baseline installs these objects. */
export const CAD_OUTLINE_RECEIPT_DDL = [
  {type:'table',name:'CadOutlineCreateReceipt',sql:`CREATE TABLE "CadOutlineCreateReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor_user_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_sha256" TEXT NOT NULL CHECK(length("request_sha256")=64 AND "request_sha256" NOT GLOB '*[^0-9a-f]*'),
    "outline_id" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    FOREIGN KEY("actor_user_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    FOREIGN KEY("version_id") REFERENCES "CadFileVersion"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
    FOREIGN KEY("outline_id") REFERENCES "CadOutline"("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`},
  {type:'index',name:'uq_cad_outline_receipt_actor_version_key',sql:
    'CREATE UNIQUE INDEX "uq_cad_outline_receipt_actor_version_key" ON "CadOutlineCreateReceipt"("actor_user_id","version_id","idempotency_key")'},
  {type:'index',name:'uq_cad_outline_receipt_outline',sql:
    'CREATE UNIQUE INDEX "uq_cad_outline_receipt_outline" ON "CadOutlineCreateReceipt"("outline_id")'},
  {type:'trigger',name:'cad_outline_receipt_scope',sql:`CREATE TRIGGER "cad_outline_receipt_scope" BEFORE INSERT ON "CadOutlineCreateReceipt"
    WHEN NOT EXISTS(SELECT 1 FROM "CadOutline" o WHERE o."id"=NEW."outline_id"
      AND o."version_id"=NEW."version_id" AND o."created_by_id"=NEW."actor_user_id")
    BEGIN SELECT RAISE(ABORT,'CAD_OUTLINE_RECEIPT_SCOPE'); END`},
  {type:'trigger',name:'cad_outline_receipt_no_update',sql:
    'CREATE TRIGGER "cad_outline_receipt_no_update" BEFORE UPDATE ON "CadOutlineCreateReceipt" BEGIN SELECT RAISE(ABORT,\'CAD_OUTLINE_RECEIPT_APPEND_ONLY\'); END'},
  {type:'trigger',name:'cad_outline_receipt_no_delete',sql:
    'CREATE TRIGGER "cad_outline_receipt_no_delete" BEFORE DELETE ON "CadOutlineCreateReceipt" BEGIN SELECT RAISE(ABORT,\'CAD_OUTLINE_RECEIPT_APPEND_ONLY\'); END'},
] as const;
export const CAD_OUTLINE_RECEIPT_OBJECT_NAMES = new Set<string>(CAD_OUTLINE_RECEIPT_DDL.map(row=>row.name));
