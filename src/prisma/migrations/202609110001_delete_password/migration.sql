ALTER TABLE "CadLocation" ADD COLUMN "next_version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CadFileVersion" ADD COLUMN "delete_password_hash" TEXT;
CREATE TABLE "CadDeletionJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "version_id" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ix_deletion_job_created" ON "CadDeletionJob"("created_at");
UPDATE "CadLocation" SET "next_version" = COALESCE((SELECT MAX("version") + 1 FROM "CadFileVersion" WHERE "location_id" = "CadLocation"."id"), 1);
