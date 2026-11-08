#!/usr/bin/env python3
"""Full synthetic 0.58 archive contract; run after npm ci, without Docker."""
import importlib.util
import io
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("or58_schema_proof", Path(__file__).with_name("or58-proof.py"))
PROOF = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROOF)
FIXTURE = Path(__file__).with_name("or58-schema-fixture.ts")
LOCATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
VERSION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
ASSET = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
CAD_LOCATOR = f"{LOCATION}/{VERSION}/original.dxf"
SCENE_LOCATOR = f"scenes/{ASSET}.json"


class OR58SchemaTest(unittest.TestCase):
    def archive(self, root, *, mutation=None, manifest_mutation=None,
                cad_locator=CAD_LOCATOR, scene_locator=SCENE_LOCATOR, cad_bytes=b"CAD",
                wal=False):
        (root / "db").mkdir()
        (root / "cad").mkdir()
        dbpath = root / "db/cad.sqlite"
        subprocess.run((shutil.which("node") or "node", "--import", "tsx", str(FIXTURE),
                        str(dbpath), str(root / "cad")), cwd=PROOF.ROOT / "src",
                       check=True, capture_output=True, timeout=30)
        db = sqlite3.connect(dbpath)
        try:
            db.execute("PRAGMA foreign_keys=ON")
            db.execute('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)', ("u", "unit"))
            db.execute('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)',
                       ("p", "u", "product"))
            db.execute('INSERT INTO "CadSite"(id,product_id,name) VALUES(?,?,?)',
                       ("s", "p", "site"))
            db.execute('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)',
                       ("b", "s", "building"))
            db.execute('INSERT INTO "CadLocation"(id,building_id,name) VALUES(?,?,?)',
                       (LOCATION, "b", "floor"))
            db.execute('INSERT INTO "CadFileVersion"(id,location_id,version,original_filename,'
                       'file_format,file_size,sha256,storage_path,registered_at,delete_password_hash) '
                       'VALUES(?,?,?,?,?,?,?,?,?,?)',
                       (VERSION, LOCATION, 1, "original.dxf", "DXF", len(cad_bytes),
                        PROOF.sha(cad_bytes), cad_locator, "2026-01-01T00:00:00Z", "hash"))
            db.execute('INSERT INTO "SceneAsset"(id,version_id,source_sha256,manifest_json,'
                       'digest,byte_length,format,storage_locator) VALUES(?,?,?,?,?,?,?,?)',
                       (ASSET, VERSION, PROOF.sha(cad_bytes), "{}", PROOF.sha(b"XYZ"), 3,
                        "CUSTOM_DTO", scene_locator))
            if mutation:
                mutation(db)
            db.commit()
        finally:
            db.close()
        manifest = {"appImage": PROOF.OLD_APP_REF, "installId": LOCATION,
                    "migratorImage": PROOF.OLD_MIGRATOR_REF,
                    "schemaId": "G7-GREENFIELD-SEMANTIC-ZONES-20261101-1",
                    "sourceCommit": "", "version": PROOF.VERSION}
        if manifest_mutation:
            manifest_mutation(manifest)
        wal_db = None
        if wal:
            wal_db = sqlite3.connect(dbpath)
            wal_db.execute("PRAGMA journal_mode=WAL")
            wal_db.execute("PRAGMA wal_autocheckpoint=0")
            wal_db.execute('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)', ("u2", "unit2"))
            wal_db.commit()
        archive_path = root / "fixture.tar"
        try:
            with tarfile.open(archive_path, "w") as archive:
                files = [("db/cad.sqlite", dbpath.read_bytes()),
                         ("db/g7-install.json", json.dumps(manifest).encode()),
                         ("cad/" + CAD_LOCATOR, cad_bytes),
                         ("cad/" + SCENE_LOCATOR, b"XYZ")]
                if wal:
                    files += [("db/cad.sqlite-wal", Path(str(dbpath) + "-wal").read_bytes()),
                              ("db/cad.sqlite-shm", Path(str(dbpath) + "-shm").read_bytes())]
                for name, data in files:
                    info = tarfile.TarInfo(name); info.size = len(data)
                    archive.addfile(info, io.BytesIO(data))
        finally:
            if wal_db:
                wal_db.close()
        return archive_path

    def check(self, archive, root):
        with patch.object(PROOF, "EVIDENCE", root):
            return PROOF.sqlite_fingerprint(archive)

    def test_registered_schema_and_local_bytes_pass_without_mutating_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); archive = self.archive(root)
            before = PROOF.sha(archive.read_bytes())
            result = self.check(archive, root)
            self.assertEqual(result["localReferenceCounts"]["cad"], 1)
            self.assertEqual(result["localReferenceCounts"]["scene"], 1)
            self.assertEqual(PROOF.sha(archive.read_bytes()), before)

    def test_wal_is_read_from_disposable_copy(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); archive = self.archive(root, wal=True)
            before = PROOF.sha(archive.read_bytes())
            result = self.check(archive, root)
            self.assertEqual(result["tables"]["BusinessUnit"]["count"], 2)
            self.assertEqual(PROOF.sha(archive.read_bytes()), before)

    def test_identically_drifted_schema_is_rejected(self):
        edits = (lambda db: db.execute('CREATE TABLE "Extra"(id TEXT)'),
                 lambda db: db.execute('CREATE INDEX "extra_idx" ON "BusinessUnit"("name")'),
                 lambda db: db.execute('CREATE TRIGGER "extra_trig" AFTER INSERT ON "BusinessUnit" BEGIN SELECT 1; END'),
                 lambda db: db.execute('ALTER TABLE "BusinessUnit" ADD COLUMN extra TEXT'),
                 lambda db: db.execute('DROP INDEX "ix_scene_asset_version_created"'))
        for edit in edits:
            with self.subTest(edit=edits.index(edit)), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); archive = self.archive(root, mutation=edit)
                with self.assertRaisesRegex(PROOF.Blocked, "OR58_SCHEMA_CHECK_FAILED"):
                    self.check(archive, root)

    def test_history_and_newer_release_rejected(self):
        changes = (lambda db: db.execute('DELETE FROM "_prisma_migrations"'),
                   lambda db: db.execute('UPDATE "_prisma_migrations" SET checksum=?', ('x'*64,)),
                   lambda db: db.execute('UPDATE "_prisma_migrations" SET finished_at=NULL'),
                   lambda db: db.execute('UPDATE "_prisma_migrations" SET rolled_back_at=?', ('now',)),
                   lambda db: db.execute('INSERT INTO "_prisma_migrations" SELECT id||"x",checksum,finished_at,migration_name||"x",logs,rolled_back_at,started_at,applied_steps_count FROM "_prisma_migrations"'),
                   lambda db: db.execute('UPDATE "_prisma_migrations" SET migration_name=?', ('202611040002_greenfield_scene_jobs_baseline',)),
                   lambda db: db.execute('UPDATE "_prisma_migrations" SET migration_name=?', ('202611040004_greenfield_cpu_worker_baseline',)))
        for index, edit in enumerate(changes):
            with self.subTest(index=index), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); archive = self.archive(root, mutation=edit)
                with self.assertRaisesRegex(PROOF.Blocked, "OR58_SCHEMA_CHECK_FAILED"):
                    self.check(archive, root)

    def test_manifest_schema_mismatch_and_bridge_failure_rejected(self):
        changes = (lambda m: m.update(schemaId="newer"),
                   lambda m: m.update(version="0.61.0"),
                   lambda m: m.update(appImage="ghcr.io/planner77/layoutmanager:0.61.0"))
        for index, change in enumerate(changes):
            with self.subTest(index=index), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); archive = self.archive(root, manifest_mutation=change)
                with self.assertRaises(PROOF.Blocked):
                    self.check(archive, root)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); archive = self.archive(root)
            with patch.object(PROOF, "SCHEMA_CHECK", root / "missing"):
                with self.assertRaisesRegex(PROOF.Blocked, "OR58_SCHEMA_CHECK_UNAVAILABLE"):
                    self.check(archive, root)
            results = (type("R", (), {"returncode": 1, "stdout": b"", "stderr": b""})(),
                       type("R", (), {"returncode": 0, "stdout": b"invalid", "stderr": b""})(),
                       type("R", (), {"returncode": 0, "stdout": b"OR58_SCHEMA_OK\n",
                                               "stderr": b"secret"})(),
                       subprocess.TimeoutExpired("node", 30), OSError("missing runtime"))
            for index, result in enumerate(results):
                with self.subTest(result=index), patch.object(PROOF.subprocess, "run",
                        side_effect=result if isinstance(result, Exception) else None,
                        return_value=None if isinstance(result, Exception) else result):
                    with self.assertRaisesRegex(PROOF.Blocked, "OR58_SCHEMA_CHECK_FAILED"):
                        self.check(archive, root)

    def test_restore_preflight_rejects_before_docker(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); archive = self.archive(root, mutation=lambda db: db.execute(
                'CREATE TABLE "Extra"(id TEXT)'))
            (root / "capture.tar").write_bytes(archive.read_bytes())
            capture = root / "capture.tar"
            (root / "capture.json").write_text(json.dumps({"status":"CAPTURED_ORIGINAL_HEALTHY",
                "archiveSha256":PROOF.sha(capture.read_bytes()),
                "fileHashes":PROOF.tar_file_hashes(capture)}))
            (root / "original-restart.json").write_text(json.dumps({"status":"HEALTHY"}))
            args = type("Args", (), {"approval_hash":"a"*64})()
            with patch.object(PROOF, "EVIDENCE", root), patch.object(PROOF, "docker") as docker, \
                 patch.object(PROOF, "validate_original") as original:
                with self.assertRaisesRegex(PROOF.Blocked, "OR58_SCHEMA_CHECK_FAILED"):
                    PROOF.restore({"approvalHash":"a"*64,"evidenceRoot":str(root)},args)
                docker.assert_not_called(); original.assert_not_called()


if __name__ == "__main__":
    unittest.main()
