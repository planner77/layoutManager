-- #225 B1 / proposed forward-only G7 schema step.
-- NOT active in 0.59.0; do not apply ad hoc or silently modify current baseline.
-- Future release must register exact DDL/history/checksum and backup/upgrade.
CREATE TABLE "SceneBuildJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "version_id" TEXT NOT NULL,
  "source_sha256" TEXT NOT NULL
    CHECK (length("source_sha256")=64 AND "source_sha256" NOT GLOB '*[^0-9a-f]*'),
  "builder" TEXT NOT NULL CHECK (length("builder") BETWEEN 1 AND 128),
  "payload_schema" INTEGER NOT NULL CHECK ("payload_schema"=2),
  "actor_id" TEXT NOT NULL,
  "site_id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL CHECK (length("request_id") BETWEEN 1 AND 128),
  "status" TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK ("status" IN ('QUEUED','RUNNING','RETRY_WAIT','READY','FAILED','BLOCKED')),
  "stage" TEXT,
  "attempt" INTEGER NOT NULL DEFAULT 0 CHECK ("attempt" BETWEEN 0 AND 10),
  "due_at" DATETIME NOT NULL,
  "started_at" DATETIME,
  "finished_at" DATETIME,
  "last_code" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_scene_build_version" FOREIGN KEY ("version_id")
    REFERENCES "CadFileVersion"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_scene_build_actor" FOREIGN KEY ("actor_id")
    REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_scene_build_site" FOREIGN KEY ("site_id")
    REFERENCES "CadSite"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "uq_scene_build_identity"
  ON "SceneBuildJob"("version_id","source_sha256","builder","payload_schema");
CREATE INDEX "ix_scene_build_due"
  ON "SceneBuildJob"("status","due_at","created_at");
CREATE INDEX "ix_scene_build_version"
  ON "SceneBuildJob"("version_id","status");
