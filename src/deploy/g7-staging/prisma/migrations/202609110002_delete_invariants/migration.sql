CREATE UNIQUE INDEX "uq_deletion_job_storage_path" ON "CadDeletionJob"("storage_path");

CREATE TRIGGER "cad_location_next_version_insert"
BEFORE INSERT ON "CadLocation"
WHEN NEW."next_version" <= 0
BEGIN
  SELECT RAISE(ABORT, 'next version must be positive');
END;

CREATE TRIGGER "cad_location_next_version_update"
BEFORE UPDATE OF "next_version" ON "CadLocation"
WHEN NEW."next_version" <= 0
BEGIN
  SELECT RAISE(ABORT, 'next version must be positive');
END;
