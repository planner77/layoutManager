-- CreateTable
CREATE TABLE "CadLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "business_unit" TEXT NOT NULL CHECK(length("business_unit") BETWEEN 1 AND 100 AND trim("business_unit") = "business_unit"),
    "site" TEXT NOT NULL CHECK(length("site") BETWEEN 1 AND 100 AND trim("site") = "site"),
    "building" TEXT NOT NULL CHECK(length("building") BETWEEN 1 AND 100 AND trim("building") = "building"),
    "floor" TEXT NOT NULL CHECK(length("floor") BETWEEN 1 AND 100 AND trim("floor") = "floor"),
    "current_version_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CadLocation_id_current_version_id_fkey" FOREIGN KEY ("id", "current_version_id") REFERENCES "CadFileVersion" ("location_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "CadFileVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "location_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL CHECK("version" > 0),
    "original_filename" TEXT NOT NULL,
    "file_format" TEXT NOT NULL CHECK("file_format" IN ('DXF','DWG')),
    "file_size" INTEGER NOT NULL CHECK("file_size" > 0),
    "sha256" TEXT NOT NULL CHECK(length("sha256") = 64 AND "sha256" NOT GLOB '*[^0-9a-f]*'),
    "storage_path" TEXT NOT NULL,
    "registered_at" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CadFileVersion_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "CadLocation" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateIndex
CREATE INDEX "ix_location_current" ON "CadLocation"("current_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_location_key" ON "CadLocation"("business_unit", "site", "building", "floor");

-- CreateIndex
CREATE UNIQUE INDEX "uq_location_current_owner" ON "CadLocation"("id", "current_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_storage_path" ON "CadFileVersion"("storage_path");

-- CreateIndex
CREATE INDEX "ix_version_registered" ON "CadFileVersion"("registered_at" DESC, "created_at" DESC, "id");

-- CreateIndex
CREATE INDEX "ix_version_format_registered" ON "CadFileVersion"("file_format", "registered_at" DESC);

-- CreateIndex
CREATE INDEX "ix_version_sha256" ON "CadFileVersion"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "uq_version_sequence" ON "CadFileVersion"("location_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "uq_version_owner_id" ON "CadFileVersion"("location_id", "id");
