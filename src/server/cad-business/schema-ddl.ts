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
