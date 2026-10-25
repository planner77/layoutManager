-- #103 G1: isolated SQLite fixture ONLY. Never add this to src/prisma/migrations.
-- Requires the existing CAD schema (CadSite comes from 202610150001_master_hierarchy).
-- Run under BEGIN IMMEDIATE with foreign_keys=ON in a disposable cloned database.
CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "login_name" TEXT NOT NULL CHECK(length("login_name") BETWEEN 3 AND 64 AND "login_name"=lower(trim("login_name"))),
  "password_hash" TEXT NOT NULL CHECK(length("password_hash") > 0),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK("status" IN ('ACTIVE','DISABLED')),
  "must_change_password" INTEGER NOT NULL DEFAULT 1 CHECK("must_change_password" IN (0,1)),
  "created_at" INTEGER NOT NULL CHECK("created_at">=0),
  "updated_at" INTEGER NOT NULL CHECK("updated_at">=0)
);
CREATE UNIQUE INDEX "uq_user_login_name" ON "User"("login_name" COLLATE NOCASE);
CREATE TRIGGER "g1_user_id_immutable" BEFORE UPDATE OF "id" ON "User"
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_USER_ID'); END;

CREATE TABLE "UserRoleGrant" (
  "user_id" TEXT NOT NULL,
  "role" TEXT NOT NULL CHECK("role" IN ('Reader','Editor','Admin')),
  "granted_by_user_id" TEXT,
  "granted_at" INTEGER NOT NULL CHECK("granted_at">=0),
  PRIMARY KEY ("user_id","role"),
  FOREIGN KEY("user_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("granted_by_user_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE TABLE "UserSiteGrant" (
  "user_id" TEXT NOT NULL,
  "site_id" TEXT NOT NULL,
  "granted_by_user_id" TEXT,
  "granted_at" INTEGER NOT NULL CHECK("granted_at">=0),
  PRIMARY KEY ("user_id","site_id"),
  FOREIGN KEY("user_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("site_id") REFERENCES "CadSite"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("granted_by_user_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "ix_g1_site_grant_site" ON "UserSiteGrant"("site_id");
CREATE TABLE "SpecialGrant" (
  "user_id" TEXT NOT NULL,
  "permission" TEXT NOT NULL CHECK("permission" IN ('audit:read','logs:read')),
  "granted_by_user_id" TEXT,
  "granted_at" INTEGER NOT NULL CHECK("granted_at">=0),
  PRIMARY KEY ("user_id","permission"),
  FOREIGN KEY("user_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  FOREIGN KEY("granted_by_user_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL CHECK(length("token_hash")=64 AND "token_hash" NOT GLOB '*[^0-9a-f]*'),
  "issued_at" INTEGER NOT NULL CHECK("issued_at">=0),
  "last_seen_at" INTEGER NOT NULL CHECK("last_seen_at">="issued_at"),
  "expires_at" INTEGER NOT NULL CHECK("expires_at"-"issued_at"=28800000),
  "revoked_at" INTEGER CHECK("revoked_at" IS NULL OR "revoked_at">="issued_at"),
  FOREIGN KEY("user_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "uq_g1_session_token_hash" ON "AuthSession"("token_hash");
CREATE INDEX "ix_g1_session_slots" ON "AuthSession"("user_id","revoked_at","expires_at","last_seen_at");
CREATE TRIGGER "g1_session_slot_check" BEFORE INSERT ON "AuthSession"
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM "User" u
    WHERE u."id"=NEW."user_id" AND u."status"='ACTIVE' AND u."must_change_password"=0
  ) THEN RAISE(ABORT,'G1_ACCOUNT_INELIGIBLE') END;
  SELECT CASE WHEN NEW."issued_at" < COALESCE(
    (SELECT MAX(s."issued_at") FROM "AuthSession" s WHERE s."user_id"=NEW."user_id"), 0
  ) THEN RAISE(ABORT,'G1_CLOCK_ROLLBACK') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM "AuthSession" s
    WHERE s."user_id"=NEW."user_id" AND s."revoked_at" IS NULL
      AND s."issued_at"<=NEW."issued_at" AND s."expires_at">NEW."issued_at"
      AND s."last_seen_at"+1800000>NEW."issued_at"
  )>=3 THEN RAISE(ABORT,'G1_SESSION_CAP') END;
END;
CREATE TRIGGER "g1_session_no_reactivation" BEFORE UPDATE ON "AuthSession"
WHEN NEW."id"<>OLD."id" OR NEW."user_id"<>OLD."user_id"
  OR NEW."token_hash"<>OLD."token_hash" OR NEW."issued_at"<>OLD."issued_at"
  OR NEW."expires_at"<>OLD."expires_at"
  OR (OLD."revoked_at" IS NOT NULL AND NEW."revoked_at" IS NULL)
  OR NEW."last_seen_at"<OLD."last_seen_at"
  OR (NEW."last_seen_at">OLD."last_seen_at" AND
      (OLD."revoked_at" IS NOT NULL OR NEW."last_seen_at">=OLD."expires_at"
        OR NEW."last_seen_at"-OLD."last_seen_at">=1800000))
BEGIN SELECT RAISE(ABORT,'G1_SESSION_IMMUTABLE_OR_EXPIRED'); END;

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actor_user_id" TEXT,
  "action" TEXT NOT NULL CHECK("action" IN (
    'LOGIN_SUCCESS','LOGIN_DENIED','SESSION_REVOKED','ACCOUNT_CREATED',
    'ACCOUNT_DISABLED','PASSWORD_RESET','ADMIN_BOOTSTRAP','ADMIN_RECOVERY',
    'ROLE_GRANTED','ROLE_REVOKED','SITE_GRANTED','SITE_REVOKED',
    'OUTLINE_CREATED','OUTLINE_EDITED','OUTLINE_DELETED','AUTHORIZATION_DENIED')),
  "target_kind" TEXT NOT NULL CHECK("target_kind" IN ('ACCOUNT','SESSION','SITE','VERSION','OUTLINE','ROLE')),
  "target_id" TEXT NOT NULL CHECK(length("target_id") BETWEEN 1 AND 128),
  "before_revision" INTEGER CHECK("before_revision" IS NULL OR "before_revision">=0),
  "after_revision" INTEGER CHECK("after_revision" IS NULL OR "after_revision">=0),
  "outcome" TEXT NOT NULL CHECK("outcome" IN ('SUCCESS','DENIED','FAILED')),
  "timestamp_utc" TEXT NOT NULL,
  "request_id" TEXT NOT NULL CHECK(length("request_id") BETWEEN 1 AND 128),
  FOREIGN KEY("actor_user_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "ix_g1_audit_time" ON "AuditEvent"("timestamp_utc");
CREATE INDEX "ix_g1_audit_actor_time" ON "AuditEvent"("actor_user_id","timestamp_utc");
CREATE TRIGGER "g1_audit_no_update" BEFORE UPDATE ON "AuditEvent"
BEGIN SELECT RAISE(ABORT,'G1_AUDIT_APPEND_ONLY'); END;
CREATE TRIGGER "g1_audit_no_delete" BEFORE DELETE ON "AuditEvent"
BEGIN SELECT RAISE(ABORT,'G1_AUDIT_APPEND_ONLY'); END;

-- One hash is consumed globally once. Never store the plaintext recovery nonce.
-- Purging consumed nonces is not allowed until a distinct approved policy exists.
CREATE TABLE "AdminRecoveryNonce" (
  "nonce_hash" TEXT NOT NULL PRIMARY KEY CHECK(length("nonce_hash")=64 AND "nonce_hash" NOT GLOB '*[^0-9a-f]*'),
  "user_id" TEXT NOT NULL,
  "consumed_at" INTEGER NOT NULL CHECK("consumed_at">=0),
  FOREIGN KEY("user_id") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "ix_g1_recovery_user" ON "AdminRecoveryNonce"("user_id");
CREATE TRIGGER "g1_nonce_no_update" BEFORE UPDATE ON "AdminRecoveryNonce"
BEGIN SELECT RAISE(ABORT,'G1_NONCE_IMMUTABLE'); END;
CREATE TRIGGER "g1_nonce_no_delete" BEFORE DELETE ON "AdminRecoveryNonce"
BEGIN SELECT RAISE(ABORT,'G1_NONCE_IMMUTABLE'); END;
