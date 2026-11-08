#!/usr/bin/env python3
"""No live Docker calls: focused OR58 fail-closed control tests."""
import importlib.util
import io
import json
import os
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import unittest
from unittest.mock import Mock, patch

SPEC = importlib.util.spec_from_file_location("or58", Path(__file__).with_name("or58-proof.py"))
PROOF = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROOF)


class OR58Test(unittest.TestCase):
    def setUp(self):
        # Four-table fixtures below isolate local-reference controls. The full
        # release/schema integration lives in test_or58_schema.py after npm ci.
        checker = patch.object(PROOF, "assert_registered_058_schema")
        checker.start()
        self.addCleanup(checker.stop)

    def packet(self, root):
        packet = {"purpose": "OR58", "nonce": "a" * 32,
                  "appId": "876103488dce" + "a" * 52,
                  "imageId": PROOF.IMAGE_ID, "sourceVolume": PROOF.VOLUME,
                  "evidenceRoot": str(root), "configSha256": "c" * 64,
                  "attachments": []}
        packet["approvalHash"] = PROOF.sha(PROOF.canonical(packet))
        return packet

    def args(self, packet, root):
        authority = root / "root-authority.json"
        authority.write_text(json.dumps({"purpose": "OR58_ROOT_MAINTENANCE_AUTHORIZATION",
                                         "approvalHash": packet["approvalHash"],
                                         "appId": packet["appId"], "volume": PROOF.VOLUME,
                                         "nonce": packet["nonce"]}))
        authority.chmod(0o600)
        return type("Args", (), {"approval_hash": packet["approvalHash"],
                                  "maintenance_authorization": "OR58_EXACT_OPERATING_STOP_APPROVED",
                                  "root_authorization_file": authority,
                                  "host_writer_attestation": "HOST_WRITERS_EXCLUDED_FOR_CAPTURE_EPOCH"})()

    def test_capture_requires_exact_packet_and_separate_root_authority(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); packet = self.packet(root); args = self.args(packet, root)
            PROOF.validate_approval(packet, args)
            args.approval_hash = "b" * 64
            with self.assertRaisesRegex(PROOF.Blocked, "OR58_APPROVAL_MISMATCH"):
                PROOF.validate_approval(packet, args)
            args.approval_hash = packet["approvalHash"]
            args.root_authorization_file = None
            with self.assertRaisesRegex(PROOF.Blocked, "OR58_ROOT_AUTHORIZATION_REQUIRED"):
                PROOF.validate_approval(packet, args)
            args.root_authorization_file = root / "root-authority.json"
            args.host_writer_attestation = "UNKNOWN"
            with self.assertRaisesRegex(PROOF.Blocked, "OR58_HOST_WRITER_EXCLUSION_UNPROVEN"):
                PROOF.validate_approval(packet, args)

    def test_unknown_source_attachment_rejected(self):
        app = {"Id": "876103488dce" + "a" * 52}
        unknown = {"Id": "f" * 64, "State": {"Running": False}}
        with patch.object(PROOF, "original", return_value=(app, {})), \
             patch.object(PROOF, "attached", return_value=[app, unknown]):
            with self.assertRaisesRegex(PROOF.Blocked, "OR58_UNKNOWN_VOLUME_ATTACHMENT"):
                PROOF.inventory()

    def test_same_name_volume_recreation_is_rejected(self):
        app = {"Id": "876103488dce" + "a" * 52, "Config": {}, "HostConfig": {},
               "Mounts": [], "State": {"Running": True}}
        migrator = {"Id": "85fd2a44f81f" + "b" * 52, "Config": {},
                    "HostConfig": {}, "Mounts": [], "State": {"Running": False}}
        old_volume = {"Name": PROOF.VOLUME, "Driver": "local", "Scope": "local",
                      "CreatedAt": "old", "Options": {}, "Mountpoint": "/var/lib/docker/x",
                      "Labels": {}}
        packet = {"appId": app["Id"],
                  "configSha256": PROOF.sha(PROOF.canonical({
                      "Config": {}, "HostConfig": {}, "Mounts": []})),
                  "attachments": [PROOF.attachment_descriptor(app),
                                  PROOF.attachment_descriptor(migrator)],
                  "sourceVolumeIdentity": {
                      "name": PROOF.VOLUME, "driver": "local", "scope": "local",
                      "createdAt": "old", "optionsSha256": PROOF.sha(PROOF.canonical({})),
                      "mountpointSha256": PROOF.sha(b"/var/lib/docker/x"),
                      "labelsSha256": PROOF.sha(PROOF.canonical({}))}}
        new_volume = dict(old_volume, CreatedAt="new")
        with patch.object(PROOF, "inventory", return_value=(app, {}, [app, migrator])), \
             patch.object(PROOF, "inspect", return_value=new_volume):
            with self.assertRaisesRegex(PROOF.Blocked, "OR58_VOLUME_CHANGED"):
                PROOF.validate_original(packet)

    def test_stop_timeout_still_restarts_exact_original(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); packet = self.packet(root); args = self.args(packet, root)
            calls = []
            def fake_docker(*argv, **_):
                calls.append(argv)
                if argv[0] == "stop":
                    raise PROOF.Blocked("OR58_DOCKER_TIMEOUT")
                return b""
            with patch.object(PROOF, "validate_original", return_value={"Id": packet["appId"]}), \
                 patch.object(PROOF, "docker", side_effect=fake_docker), \
                 patch.object(PROOF, "inspect", return_value={"Id": packet["appId"],
                                                                "State": {"Running": False}}), \
                 patch.object(PROOF, "wait_healthy") as healthy:
                with self.assertRaisesRegex(PROOF.Blocked, "OR58_DOCKER_TIMEOUT"):
                    PROOF.capture(packet, args)
            self.assertEqual([step[0] for step in calls], ["stop", "start"])
            self.assertEqual(calls[1][-1], packet["appId"])
            self.assertEqual(healthy.call_args.args, (packet["appId"],))
            self.assertIn("deadline", healthy.call_args.kwargs)

    def test_capture_records_real_freeze_and_outage_times(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); packet = self.packet(root); args = self.args(packet, root)
            packet["installation"] = {}
            files = {"db/cad.sqlite": {"size": 3, "sha256": PROOF.sha(b"CAD")}}
            inventory = {"installation": packet.get("installation", {}), "files": files}
            process = Mock(stdout=Mock(), returncode=0)
            process.poll.return_value = 0
            def fake_inspect(kind, identity, **_):
                return {"Id": packet["appId"], "State": {"Running": False,
                                                       "ExitCode": 0, "OOMKilled": False}}
            with patch.object(PROOF, "validate_original", return_value={"Id": packet["appId"]}), \
                 patch.object(PROOF, "docker", return_value=b""), \
                 patch.object(PROOF, "inspect", side_effect=fake_inspect), \
                 patch.object(PROOF, "no_running_attachment"), \
                 patch.object(PROOF, "volume_hashes", return_value=inventory), \
                 patch.object(PROOF, "create_helper", return_value="d" * 64), \
                 patch.object(PROOF.subprocess, "Popen", return_value=process), \
                 patch.object(PROOF, "bounded_stream", return_value=(3, PROOF.sha(b"CAD"))), \
                 patch.object(PROOF, "cleanup_helper"), \
                 patch.object(PROOF, "wait_healthy"), \
                 patch.object(PROOF, "safe_tar_members", return_value=3), \
                 patch.object(PROOF, "tar_file_hashes", return_value=files):
                result = PROOF.capture(packet, args)
            receipt = json.loads((root / "capture.json").read_text())
            self.assertEqual(result["status"], "CAPTURED_ORIGINAL_HEALTHY")
            self.assertLessEqual(receipt["outageSeconds"], 120)
            self.assertLessEqual(receipt["writerZeroUnix"], receipt["captureStartUnix"])
            self.assertLessEqual(receipt["captureStartUnix"], receipt["captureCompleteUnix"])
            self.assertLessEqual(receipt["captureCompleteUnix"], receipt["originalHealthyUnix"])
            self.assertEqual(receipt["hostWriterExclusion"],
                             "ROOT_ATTESTED_NOT_INDEPENDENTLY_PROVEN")

    def test_archive_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            archive_path = Path(tmp) / "bad.tar"
            with tarfile.open(archive_path, "w") as archive:
                link = tarfile.TarInfo("./cad/link")
                link.type = tarfile.SYMTYPE; link.linkname = "/etc/passwd"
                archive.addfile(link)
            with self.assertRaisesRegex(PROOF.Blocked, "OR58_ARCHIVE_UNSAFE"):
                PROOF.safe_tar_members(archive_path)

    def test_existing_restore_target_rejected_before_volume_create(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); packet = self.packet(root); args = self.args(packet, root)
            archive_path = root / "capture.tar"
            with tarfile.open(archive_path, "w") as archive:
                for name in ("db/cad.sqlite", "db/g7-install.json", "cad/example"):
                    data = b"x"
                    info = tarfile.TarInfo(name); info.size = len(data)
                    archive.addfile(info, io.BytesIO(data))
            (root / "capture.json").write_text(json.dumps({
                "status": "CAPTURED_ORIGINAL_HEALTHY", "archiveSha256": PROOF.sha(archive_path.read_bytes()),
                "fileHashes": PROOF.tar_file_hashes(archive_path)}))
            (root / "original-restart.json").write_text('{"status":"HEALTHY"}')
            with patch.object(PROOF, "validate_original", return_value={
                    "State": {"Health": {"Status": "healthy"}}}), \
                 patch.object(PROOF, "sqlite_fingerprint", return_value={}), \
                 patch.object(PROOF, "volume_exists", return_value=True), \
                 patch.object(PROOF, "docker") as docker:
                with self.assertRaisesRegex(PROOF.Blocked, "OR58_RESTORE_TARGET_EXISTS"):
                    PROOF.restore(packet, args)
                docker.assert_not_called()

    def test_clone_environment_excludes_original_secrets(self):
        app = {"Config": {"Env": ["CAD_STORAGE_BACKEND=local", "G7_AUTH_ENABLED=true",
                                  "G7_DEPLOY_APP_IMAGE=" + PROOF.OLD_APP_REF,
                                  "G7_DEPLOY_MIGRATOR_IMAGE=" + PROOF.OLD_MIGRATOR_REF,
                                  "remote_repo_token=SECRET",
                                  "CAD_S3_SECRET_ACCESS_KEY=SECRET", "G7_RUNTIME_ORIGIN=https://private"]}}
        install = {"appImage": PROOF.OLD_APP_REF,
                   "migratorImage": PROOF.OLD_MIGRATOR_REF, "sourceCommit": ""}
        safe = PROOF.clone_env(app, install)
        serialized = json.dumps(safe)
        self.assertNotIn("SECRET", serialized)
        self.assertEqual(safe["G7_DEPLOY_APP_IMAGE"], PROOF.OLD_APP_REF)
        self.assertEqual(safe["G7_RUNTIME_ORIGIN"], "http://127.0.0.1:3000")
        self.assertEqual(safe["SCENE_AUTO_BUILD_ENABLED"], "false")

    def test_clone_rejects_mismatched_old_image_pair(self):
        app = {"Config": {"Env": ["G7_DEPLOY_APP_IMAGE=ghcr.io/foreign:0.58.0",
                                  "G7_DEPLOY_MIGRATOR_IMAGE=" + PROOF.OLD_MIGRATOR_REF]}}
        install = {"appImage": PROOF.OLD_APP_REF,
                   "migratorImage": PROOF.OLD_MIGRATOR_REF, "sourceCommit": ""}
        with self.assertRaisesRegex(PROOF.Blocked, "OR58_CLONE_PAIR_MISMATCH"):
            PROOF.clone_env(app, install)

    def isolated_clone_rows(self):
        nonce = "a" * 32; target = "or58-" + nonce; cid = "c" * 64; nid = "d" * 64
        network_name = target + "-net"
        row = {"Id": cid, "Name": "/" + target + "-app", "Image": PROOF.IMAGE_ID,
               "State": {"Running": True},
               "Config": {"Labels": {PROOF.OWNER_LABEL: nonce,
                                     "com.planner77.purpose": "or58-restore-proof"}},
               "Mounts": [{"Type": "volume", "Name": target, "Destination": "/data"}],
               "HostConfig": {"NetworkMode": network_name, "PortBindings": {}},
               "NetworkSettings": {"Networks": {network_name: {"NetworkID": nid}},
                                   "Ports": {"3000/tcp": None}}}
        network = {"Id": nid, "Name": network_name, "Internal": True,
                   "Labels": {PROOF.OWNER_LABEL: nonce,
                              "com.planner77.purpose": "or58-restore-proof"}}
        kwargs = {"cid": cid, "name": target + "-app", "network_name": network_name,
                  "network_id": nid, "volume": target, "nonce": nonce}
        return row, network, kwargs

    def test_internal_only_clone_accepts_null_port_mapping(self):
        row, network, kwargs = self.isolated_clone_rows()
        PROOF.validate_isolated_clone(row, network, **kwargs)
        with patch.object(PROOF, "docker", return_value=b'{"/api/health":200,"/api/g7-runtime/status":200}') as docker:
            result = PROOF.internal_http(kwargs["cid"])
        self.assertEqual(result["/api/health"], 200)
        command = docker.call_args.args
        self.assertEqual(command[:4], ("exec", "--user", "10001:10001", kwargs["cid"]))
        self.assertEqual(docker.call_args.kwargs["timeout"], 12)
        self.assertIn("AbortSignal.timeout(3000)", command[-1])

    def test_unexpected_host_port_publication_is_rejected(self):
        row, network, kwargs = self.isolated_clone_rows()
        row["HostConfig"]["PortBindings"] = {"3000/tcp": [{"HostIp": "127.0.0.1",
                                                               "HostPort": "49973"}]}
        with self.assertRaisesRegex(PROOF.Blocked, "OR58_CLONE_PORT_PUBLISHED"):
            PROOF.validate_isolated_clone(row, network, **kwargs)
        row["HostConfig"]["PortBindings"] = {}
        row["NetworkSettings"]["Ports"] = {"3000/tcp": [{"HostIp": "127.0.0.1",
                                                              "HostPort": "49973"}]}
        with self.assertRaisesRegex(PROOF.Blocked, "OR58_CLONE_PORT_PUBLISHED"):
            PROOF.validate_isolated_clone(row, network, **kwargs)

    def test_internal_http_non200_and_timeout_halt(self):
        with patch.object(PROOF, "docker", return_value=b'{"/api/health":200,"/api/g7-runtime/status":403}'):
            with self.assertRaisesRegex(PROOF.Blocked, "OR58_INTERNAL_HTTP_NOT_200"):
                PROOF.internal_http("c" * 64)
        with patch.object(PROOF, "docker", side_effect=PROOF.Blocked("OR58_DOCKER_TIMEOUT")):
            with self.assertRaisesRegex(PROOF.Blocked, "OR58_INTERNAL_HTTP_TIMEOUT"):
                PROOF.internal_http("c" * 64)

    def test_plan_is_private_and_redacts_full_container_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            evidence = Path(tmp) / "evidence"
            app = {"Id": "876103488dce" + "a" * 52, "Image": PROOF.IMAGE_ID,
                   "Config": {"Env": ["remote_repo_token=SECRET"]},
                   "HostConfig": {"PortBindings": {"3000/tcp": [{"HostPort": "3000"}]}},
                   "Mounts": [{"Type": "volume", "Name": PROOF.VOLUME,
                               "Destination": "/data", "RW": True}],
                   "NetworkSettings": {"Ports": {"3000/tcp": [{"HostIp": "0.0.0.0",
                                                            "HostPort": "3000"}]}},
                   "State": {"Running": True}}
            migrator = {"Id": "85fd2a44f81f" + "b" * 52, "Image": "sha256:" + "b" * 64,
                        "Config": {"Env": []}, "HostConfig": {}, "Mounts": [],
                        "State": {"Running": False}}
            volume = {"Name": PROOF.VOLUME, "Driver": "local", "Scope": "local",
                      "Mountpoint": "/var/lib/docker/volumes/private", "Labels": {},
                      "CreatedAt": "2026-11-01T00:00:00Z", "Options": {}}
            app_image = {"RepoDigests": ["ghcr.io/example/app@sha256:" + PROOF.APP_REPO_DIGEST]}
            migrator_image = {"Id": migrator["Image"], "RepoDigests": [
                "ghcr.io/example/migrate@sha256:" + PROOF.MIGRATOR_REPO_DIGEST]}
            def fake_inspect(kind, identity):
                return migrator_image if kind == "image" else volume
            inventory_path = Path(tmp) / "inventory.json"
            inventory_path.write_text(json.dumps({
                "kind": "OR58_READ_ONLY_LIVE_INVENTORY_NOT_SNAPSHOT",
                "unsafeEntries": 0, "fileCount": 6,
                "database": {"integrityOk": True, "foreignKeyErrors": 0},
                "installation": {"version": PROOF.VERSION,
                                 "schemaId": "G7-GREENFIELD-SEMANTIC-ZONES-20261101-1",
                                 "sourceCommitPresent": False,
                                 "appImageMatchesFixed": True,
                                 "migratorImageMatchesFixed": True,
                                 "manifestSha256": "a" * 64}}))
            inventory_path.chmod(0o600)
            with patch.object(PROOF, "EVIDENCE", evidence), \
                 patch.object(PROOF, "inventory", return_value=(app, app_image,
                                                               [app, migrator])), \
                 patch.object(PROOF, "inspect", side_effect=fake_inspect), \
                 patch.object(PROOF, "volume_hashes", return_value={
                     "files": {"db/cad.sqlite": {"size": 1, "sha256": "a" * 64}},
                     "installation": {"version": PROOF.VERSION,
                                      "schemaId": "G7-GREENFIELD-SEMANTIC-ZONES-20261101-1",
                                      "sourceCommitPresent": False,
                                      "manifestSha256": "a" * 64}}), \
                 patch.object(PROOF.shutil, "disk_usage", return_value=Mock(free=2**32)):
                result = PROOF.plan(inventory_path)
            packet_path = Path(result["packet"])
            packet_text = packet_path.read_text()
            self.assertNotIn("SECRET", packet_text)
            self.assertEqual(packet_path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(packet_path.parent.stat().st_mode & 0o777, 0o700)
            self.assertEqual(json.loads(packet_text)["appId"], app["Id"])
            self.assertEqual(result["status"], "READINESS_ONLY")

    def test_stalled_capture_reader_times_out(self):
        with tempfile.TemporaryDirectory() as tmp:
            read_fd, write_fd = os.pipe()
            try:
                process = Mock(stdout=os.fdopen(read_fd, "rb", buffering=0))
                with self.assertRaisesRegex(PROOF.Blocked, "OR58_CAPTURE_TIMEOUT"):
                    PROOF.bounded_stream(process, Path(tmp) / "capture.tar",
                                         deadline=PROOF.time.monotonic() + 0.02,
                                         max_bytes=100)
            finally:
                process.stdout.close(); os.close(write_fd)

    def test_timed_out_helper_create_cleans_only_cidfile_identity(self):
        with tempfile.TemporaryDirectory() as tmp:
            cid = "d" * 64
            def timed_out_create(*args, **_):
                Path(args[args.index("--cidfile") + 1]).write_text(cid + "\n")
                raise PROOF.Blocked("OR58_DOCKER_TIMEOUT")
            with patch.object(PROOF, "docker", side_effect=timed_out_create), \
                 patch.object(PROOF, "cleanup_helper") as cleanup:
                with self.assertRaisesRegex(PROOF.Blocked, "OR58_DOCKER_TIMEOUT"):
                    PROOF.create_helper(Path(tmp), "a" * 32, PROOF.VOLUME, "inspect",
                                        readonly=True,
                                        command=("--entrypoint", "node", PROOF.IMAGE_ID, "-"),
                                        deadline=PROOF.time.monotonic() + 10)
                self.assertEqual(cleanup.call_args.args, (cid,))
                self.assertEqual(cleanup.call_args.kwargs["volume"], PROOF.VOLUME)

    def test_timed_out_helper_start_still_cleans_exact_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            cid = "d" * 64
            with patch.object(PROOF, "create_helper", return_value=cid), \
                 patch.object(PROOF, "docker", side_effect=PROOF.Blocked("OR58_DOCKER_TIMEOUT")), \
                 patch.object(PROOF, "cleanup_helper") as cleanup:
                with self.assertRaisesRegex(PROOF.Blocked, "OR58_DOCKER_TIMEOUT"):
                    PROOF.volume_hashes(PROOF.VOLUME, nonce="a" * 32, root=Path(tmp),
                                        deadline=PROOF.time.monotonic() + 10)
                self.assertEqual(cleanup.call_args.args, (cid,))

    def test_stopped_epoch_writer_check_is_single_filtered_query(self):
        with patch.object(PROOF, "docker", return_value=b"f" * 64 + b"\n") as docker:
            with self.assertRaisesRegex(PROOF.Blocked, "OR58_SOURCE_WRITER_PRESENT"):
                PROOF.no_running_attachment(PROOF.VOLUME,
                    deadline=PROOF.time.monotonic() + 5)
            docker.assert_called_once()
            self.assertIn("volume=" + PROOF.VOLUME, docker.call_args.args)
            self.assertLessEqual(docker.call_args.kwargs["timeout"], 3)

    def test_helper_mount_disables_copyup_and_journals_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); cid = "d" * 64
            def fake_create(*args, **_):
                Path(args[args.index("--cidfile") + 1]).write_text(cid + "\n")
                return (cid + "\n").encode()
            with patch.object(PROOF, "docker", side_effect=fake_create) as docker:
                result = PROOF.create_helper(root, "a" * 32, "or58-" + "a" * 32,
                    "target-init", readonly=False,
                    command=("--user", "0:0", "--entrypoint", "sh", PROOF.IMAGE_ID, "-ec", "true"),
                    deadline=PROOF.time.monotonic() + 5)
            self.assertEqual(result, cid)
            mount = docker.call_args.args[docker.call_args.args.index("--mount") + 1]
            self.assertIn("volume-nocopy", mount)
            self.assertNotIn("readonly", mount)
            self.assertTrue(list(root.glob("helper-*.json")))

    def test_new_target_is_initialized_as_uid_10001_before_restore(self):
        with tempfile.TemporaryDirectory() as tmp:
            cid = "d" * 64
            with patch.object(PROOF, "create_helper", return_value=cid) as create, \
                 patch.object(PROOF, "docker", return_value=b""), \
                 patch.object(PROOF, "cleanup_helper") as cleanup:
                PROOF.init_empty_target(Path(tmp), "a" * 32, "or58-" + "a" * 32)
            command = create.call_args.kwargs["command"]
            self.assertIn("0:0", command)
            self.assertIn("chown 10001:10001 /data", command[-1])
            self.assertIn("find /data -mindepth 1", command[-1])
            cleanup.assert_called_once()

    def test_partial_startup_journal_allows_exact_owned_cleanup(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); packet = self.packet(root); args = self.args(packet, root)
            nonce = packet["nonce"]; target = "or58-" + nonce
            network_id, clone_id = "e" * 64, "f" * 64
            (root / "startup-network.json").write_text(json.dumps({
                "id": network_id, "name": target + "-net", "nonce": nonce}))
            (root / "startup-clone.cid").write_text(clone_id + "\n")
            clone = {"Id": clone_id, "Name": "/" + target + "-app", "Image": PROOF.IMAGE_ID,
                     "Config": {"Labels": {PROOF.OWNER_LABEL: nonce,
                                           "com.planner77.purpose": "or58-restore-proof"}},
                     "Mounts": [{"Name": target, "Destination": "/data"}],
                     "NetworkSettings": {"Networks": {target + "-net": {}}},
                     "State": {"Running": False}}
            network = {"Id": network_id, "Name": target + "-net", "Internal": True,
                       "Labels": {PROOF.OWNER_LABEL: nonce,
                                  "com.planner77.purpose": "or58-restore-proof"},
                       "Containers": {clone_id: {}}}
            empty_network = dict(network, Containers={})
            calls = []
            def fake_inspect(kind, identity):
                calls.append((kind, identity))
                if kind == "container": return clone
                return network if len([x for x in calls if x[0] == "network"]) == 1 else empty_network
            with patch.object(PROOF, "inspect", side_effect=fake_inspect), \
                 patch.object(PROOF, "docker", return_value=b"") as docker:
                result = PROOF.cleanup(packet, args)
            self.assertEqual(result["status"], "OWNED_CLONE_REMOVED")
            self.assertEqual([call.args[:2] for call in docker.call_args_list],
                             [("rm", clone_id), ("network", "rm")])
            self.assertFalse((root / "startup.json").exists())

    def test_partial_cleanup_refuses_foreign_clone_replacement(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); packet = self.packet(root); args = self.args(packet, root)
            nonce = packet["nonce"]; target = "or58-" + nonce
            network_id, clone_id = "e" * 64, "f" * 64
            (root / "startup-network.json").write_text(json.dumps({
                "id": network_id, "name": target + "-net", "nonce": nonce}))
            (root / "startup-clone.cid").write_text(clone_id + "\n")
            network = {"Id": network_id, "Name": target + "-net", "Internal": True,
                       "Labels": {PROOF.OWNER_LABEL: nonce,
                                  "com.planner77.purpose": "or58-restore-proof"},
                       "Containers": {clone_id: {}}}
            foreign = {"Id": "9" * 64, "Name": "/" + target + "-app"}
            with patch.object(PROOF, "inspect", side_effect=[network, foreign]), \
                 patch.object(PROOF, "docker") as docker:
                with self.assertRaisesRegex(PROOF.Blocked, "OR58_CLEANUP_CLONE_FOREIGN"):
                    PROOF.cleanup(packet, args)
                docker.assert_not_called()

    def test_network_response_or_receipt_loss_uses_precreate_intent(self):
        for receipt_state in ("missing", "partial"):
            with self.subTest(receipt_state=receipt_state), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp); packet = self.packet(root); args = self.args(packet, root)
                nonce = packet["nonce"]; target = "or58-" + nonce; network_id = "e" * 64
                (root / "startup-attempt.json").write_text(json.dumps({
                    "status": "ARMED", "clone": target + "-app", "network": target + "-net"}))
                if receipt_state == "partial":
                    (root / "startup-network.json").write_text('{"id":')
                network = {"Id": network_id, "Name": target + "-net", "Internal": True,
                           "Labels": {PROOF.OWNER_LABEL: nonce,
                                      "com.planner77.purpose": "or58-restore-proof"},
                           "Containers": {}}
                with patch.object(PROOF, "inspect", return_value=network) as inspect, \
                     patch.object(PROOF, "docker", return_value=b"") as docker:
                    result = PROOF.cleanup(packet, args)
                self.assertEqual(result["status"], "OWNED_CLONE_REMOVED")
                self.assertEqual(inspect.call_args_list[0].args, ("network", target + "-net"))
                self.assertEqual(docker.call_args.args, ("network", "rm", network_id))
                recovered = json.loads((root / "startup-network-recovered.json").read_text())
                self.assertEqual(recovered["id"], network_id)

    def test_precreate_intent_never_deletes_foreign_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); packet = self.packet(root); args = self.args(packet, root)
            nonce = packet["nonce"]; target = "or58-" + nonce
            (root / "startup-attempt.json").write_text(json.dumps({
                "status": "ARMED", "clone": target + "-app", "network": target + "-net"}))
            foreign = {"Id": "e" * 64, "Name": target + "-net", "Internal": True,
                       "Labels": {PROOF.OWNER_LABEL: "foreign",
                                  "com.planner77.purpose": "or58-restore-proof"},
                       "Containers": {}}
            with patch.object(PROOF, "inspect", return_value=foreign), \
                 patch.object(PROOF, "docker") as docker:
                with self.assertRaisesRegex(PROOF.Blocked, "OR58_CLEANUP_NETWORK_FOREIGN"):
                    PROOF.cleanup(packet, args)
                docker.assert_not_called()
            self.assertFalse((root / "startup-network-recovered.json").exists())

    def local_archive(self, root, *, cad_locator=None, scene_locator=None,
                      orphan_locator=None, deletion_locator=None, cad_bytes=b"CAD",
                      stored_cad_sha=None):
        dbpath = root / "cad.sqlite"
        db = sqlite3.connect(dbpath)
        db.executescript('CREATE TABLE "CadFileVersion"(id TEXT,location_id TEXT,file_format TEXT,'
                         'file_size INTEGER,sha256 TEXT,storage_path TEXT);'
                         'CREATE TABLE "SceneAsset"(id TEXT,storage_locator TEXT,'
                         'byte_length INTEGER,digest TEXT);'
                         'CREATE TABLE "SceneOrphanJob"(storage_locator TEXT);'
                         'CREATE TABLE "CadDeletionJob"(storage_path TEXT);')
        location = "a" * 8 + "-" + "a" * 4 + "-4aaa-8aaa-" + "a" * 12
        version = "b" * 8 + "-" + "b" * 4 + "-4bbb-8bbb-" + "b" * 12
        local = f"{location}/{version}/original.dxf"
        db.execute('INSERT INTO "CadFileVersion" VALUES(?,?,?,?,?,?)',
                   (version, location, "DXF", len(cad_bytes), stored_cad_sha or PROOF.sha(cad_bytes),
                    cad_locator or local))
        if scene_locator:
            db.execute('INSERT INTO "SceneAsset" VALUES(?,?,?,?)',
                       ("c" * 36, scene_locator, 3, PROOF.sha(b"XYZ")))
        if orphan_locator:
            db.execute('INSERT INTO "SceneOrphanJob" VALUES(?)', (orphan_locator,))
        if deletion_locator:
            db.execute('INSERT INTO "CadDeletionJob" VALUES(?)', (deletion_locator,))
        db.commit(); db.close()
        archive_path = root / "fixture.tar"
        with tarfile.open(archive_path, "w") as archive:
            for name, data in (("db/cad.sqlite", dbpath.read_bytes()),
                               ("db/g7-install.json", json.dumps({
                                   "appImage": PROOF.OLD_APP_REF,
                                   "installId": "a" * 8 + "-aaaa-4aaa-8aaa-" + "a" * 12,
                                   "migratorImage": PROOF.OLD_MIGRATOR_REF,
                                   "schemaId": "G7-GREENFIELD-SEMANTIC-ZONES-20261101-1",
                                   "sourceCommit": "", "version": PROOF.VERSION,
                               }).encode()),
                               ("cad/" + local, cad_bytes)):
                info = tarfile.TarInfo(name); info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
        return archive_path

    def test_local_reference_bytes_verified_in_disposable_copy(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with patch.object(PROOF, "EVIDENCE", root):
                result = PROOF.sqlite_fingerprint(self.local_archive(root))
            self.assertEqual(result["localReferenceCounts"],
                             {"cad": 1, "scene": 0, "orphan": 0, "deletion": 0})

    def test_restored_db_only_copy_uses_verified_raw_file_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = self.local_archive(root)
            hashes = PROOF.tar_file_hashes(archive)
            db_only = root / "db-only.tar"
            with tarfile.open(archive, "r") as source, tarfile.open(db_only, "w") as target:
                for member in source:
                    if member.name.startswith("db/"):
                        target.addfile(member, source.extractfile(member))
            with patch.object(PROOF, "EVIDENCE", root):
                before = PROOF.sqlite_fingerprint(archive)
                after = PROOF.sqlite_fingerprint(db_only, raw_file_hashes=hashes)
            self.assertEqual(before, after)

    def test_historical_s3_reference_refuses_local_snapshot_proof(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = self.local_archive(root, cad_locator="s3:bucket:key")
            with patch.object(PROOF, "EVIDENCE", root):
                with self.assertRaisesRegex(PROOF.Blocked, "OR58_CAD_LOCATOR_NOT_LOCAL"):
                    PROOF.sqlite_fingerprint(archive)

    def test_scene_and_job_remote_references_refused(self):
        cases = [("scene_locator", "OR58_SCENE_LOCATOR_NOT_LOCAL"),
                 ("orphan_locator", "OR58_ORPHAN_LOCATOR_NOT_LOCAL"),
                 ("deletion_locator", "OR58_DELETION_LOCATOR_NOT_LOCAL")]
        for key, code in cases:
            with self.subTest(key=key), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                archive = self.local_archive(root, **{key: "s3:bucket:key"})
                with patch.object(PROOF, "EVIDENCE", root):
                    with self.assertRaisesRegex(PROOF.Blocked, code):
                        PROOF.sqlite_fingerprint(archive)

    def test_cad_reference_sha_mismatch_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = self.local_archive(root, stored_cad_sha=PROOF.sha(b"OTHER"))
            with patch.object(PROOF, "EVIDENCE", root):
                with self.assertRaisesRegex(PROOF.Blocked, "OR58_CAD_REFERENCE_BYTES_MISMATCH"):
                    PROOF.sqlite_fingerprint(archive)


if __name__ == "__main__":
    unittest.main()
