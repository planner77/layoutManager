"""Disposable host-tool regressions. No daemon, real volume or credentials used."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("g7_upgrade", Path(__file__).with_name("g7-upgrade.py"))
upgrade = importlib.util.module_from_spec(spec)
spec.loader.exec_module(upgrade)
SOURCE = "a" * 40
APP = "ghcr.io/planner77/layoutmanager:0.58.0"
MIGRATOR = APP + "-migrate"


def image(role):
    return {"Id": "sha256:" + ("b" if role == "app" else "c") * 64,
            "Os": "linux", "Architecture": "amd64", "Config": {"Labels": {
                "org.opencontainers.image.version": "0.58.0",
                "org.opencontainers.image.source": "https://github.com/planner77/layoutManager",
                "org.opencontainers.image.revision": SOURCE,
                "com.planner77.g7.image-role": role}}}


def config():
    return {"services": {"app": {"image": APP}, "migrate": {
        "image": MIGRATOR, "environment": {"G7_GREENFIELD_AUTOMATED": "true",
            "G7_GREENFIELD_MODE": "true", "CAD_STORAGE_BACKEND": "local",
            "G7_DEPLOY_APP_IMAGE": APP, "G7_DEPLOY_MIGRATOR_IMAGE": MIGRATOR,
            "G7_RELEASE_SOURCE_COMMIT": SOURCE},
        "volumes": [{"type": "volume", "source": "data", "target": "/data"}]}},
        "volumes": {"data": {"name": "synthetic-209"}}}


class PairTests(unittest.TestCase):
    def test_tagged_and_digest_references_bind_distinct_actual_ids(self):
        for refs in ((APP, MIGRATOR), (APP + "@sha256:" + "d" * 64, MIGRATOR + "@sha256:" + "e" * 64),
                    (APP.split(":")[0] + "@sha256:" + "d" * 64,
                                      APP.split(":")[0] + "@sha256:" + "e" * 64)):
            pair = upgrade.inspect_pair(*refs, SOURCE,
                                        lambda ref: image("app" if ref == refs[0] else "migrator"))
            self.assertNotEqual(pair[0], pair[1])

    def test_drifted_role_source_architecture_version_are_rejected(self):
        for field, value in (("Architecture", "arm64"), ("Os", "windows"),
                             ("org.opencontainers.image.version", "0.57.0"),
                             ("org.opencontainers.image.revision", "d" * 40),
                             ("com.planner77.g7.image-role", "app")):
            with self.subTest(field=field):
                bad = image("migrator")
                if field in ("Architecture", "Os"):
                    bad[field] = value
                else:
                    bad["Config"]["Labels"][field] = value
                with self.assertRaisesRegex(upgrade.Blocked, "PAIR_MISMATCH"):
                    upgrade.inspect_pair(APP, MIGRATOR, SOURCE, lambda ref: image("app") if ref == APP else bad)

    def test_unbound_source_cross_repository_and_same_image_fail(self):
        with self.assertRaisesRegex(upgrade.Blocked, "SOURCE_REQUIRED"):
            upgrade.inspect_pair(APP, MIGRATOR, "", lambda _: image("app"))
        for ref in ("other.example/app:0.58.0-migrate", MIGRATOR):
            with self.assertRaisesRegex(upgrade.Blocked, "PAIR_MISMATCH"):
                upgrade.inspect_pair(APP, ref, SOURCE, lambda _: image("app"))

    def test_mistagged_and_malformed_digest_refs_fail_before_maintenance(self):
        for refs in ((APP.replace("0.58.0", "0.57.0"), MIGRATOR),
                     (APP + "@sha256:bad", MIGRATOR),
                     (APP.rsplit(":", 1)[0], MIGRATOR)):
            with self.subTest(refs=refs), self.assertRaisesRegex(upgrade.Blocked, "PAIR_MISMATCH"):
                upgrade.inspect_pair(*refs, SOURCE, lambda ref: image("app" if ref == refs[0] else "migrator"))


class HostTests(unittest.TestCase):
    def invoke(self, action, *, writer=False, source_exists=True, cli_output=None, foreign_app=False):
        calls = []
        def fake(command, **kwargs):
            calls.append(command)
            output, status = "", 0
            if "config" in command:
                output = json.dumps(config())
            elif command[:3] == ["docker", "image", "inspect"]:
                output = json.dumps([image("app" if command[-1] == APP else "migrator")])
            elif command[:3] == ["docker", "volume", "inspect"] and not source_exists:
                raise upgrade.Blocked("G7_UPGRADE_HOST_COMMAND_FAILED")
            elif command[:2] == ["docker", "ps"]:
                output = "active-writer" if writer else ""
            elif command[-4:] == ["ps", "--all", "--quiet", "app"] and foreign_app:
                output = "foreign-app-id"
            elif command[:2] == ["docker", "inspect"]:
                output = json.dumps([{"Mounts": [{"Destination": "/data", "Type": "volume", "Name": "other-installation"}]}])
            elif command[:2] == ["docker", "run"]:
                output = cli_output or '{"state":"G7_GREENFIELD_READY"}\n'
            return subprocess.CompletedProcess(command, status, output, "")
        output = io.StringIO()
        with patch.object(upgrade, "run", side_effect=fake), contextlib.redirect_stdout(output):
            try:
                result = upgrade.main([".env.example", action])
            except upgrade.Blocked as error:
                return calls, str(error), output.getvalue()
        return calls, result, output.getvalue()

    def test_auto_stops_then_checks_all_writers_and_runs_immutable_migrator_id(self):
        calls, result, _ = self.invoke("auto")
        self.assertEqual(result, 0)
        stop = next(i for i, call in enumerate(calls) if call[-2:] == ["stop", "app"])
        check = next(i for i, call in enumerate(calls) if call[:2] == ["docker", "ps"])
        execute = next(i for i, call in enumerate(calls) if call[:2] == ["docker", "run"])
        self.assertLess(stop, check)
        self.assertLess(check, execute)
        self.assertIn(image("migrator")["Id"], calls[execute])
        self.assertIn("G7_UPGRADE_MAINTENANCE_ACK=APP_STOPPED_BY_HOST_HELPER", calls[execute])

    def test_second_project_writer_blocks_before_migrator(self):
        calls, result, _ = self.invoke("auto", writer=True)
        self.assertEqual(result, "G7_UPGRADE_WRITER_NOT_STOPPED")
        self.assertFalse(any(call[:2] == ["docker", "run"] for call in calls))

    def test_mistyped_env_volume_never_stops_another_installation(self):
        calls, result, _ = self.invoke("auto", foreign_app=True)
        self.assertEqual(result, "G7_UPGRADE_VOLUME_MISMATCH")
        self.assertFalse(any(call[-2:] == ["stop", "app"] for call in calls))
        self.assertFalse(any(call[:2] == ["docker", "run"] for call in calls))

    def test_plan_is_read_only_and_missing_source_volume_cannot_create_fresh_install(self):
        calls, result, _ = self.invoke("plan")
        self.assertEqual(result, 0)
        self.assertFalse(any(call[-2:] == ["stop", "app"] for call in calls))
        self.assertFalse(any("G7_UPGRADE_MAINTENANCE_ACK=APP_STOPPED_BY_HOST_HELPER" in call for call in calls))
        calls, result, _ = self.invoke("auto", source_exists=False)
        self.assertEqual(result, "G7_UPGRADE_HOST_COMMAND_FAILED")
        self.assertFalse(any(call[:2] == ["docker", "run"] for call in calls))

    def test_real_cli_plan_fields_survive_filter_and_private_fields_do_not(self):
        plan = {"state": "UPGRADE_COMPATIBLE", "planId": "d" * 64, "from": "0.56.0",
                "to": "0.58.0", "requiresApproval": False, "privatePath": "/private/canary",
                "secret": "never-forward-this"}
        _, result, output = self.invoke("plan", cli_output=json.dumps(plan))
        self.assertEqual(result, 0)
        forwarded = json.loads(output)
        self.assertEqual(forwarded["planId"], plan["planId"])
        self.assertEqual(forwarded["from"], "0.56.0")
        self.assertFalse(forwarded["requiresApproval"])
        self.assertNotIn("private", output)
        self.assertNotIn("never-forward", output)

    def test_restore_racing_existing_volume_never_mkdir_or_chown(self):
        calls = []
        def fake(command, **kwargs):
            calls.append(command)
            output = ""
            if "config" in command:
                output = json.dumps(config())
            elif command[:3] == ["docker", "image", "inspect"]:
                output = json.dumps([image("app" if command[-1] == APP else "migrator")])
            elif command[:3] == ["docker", "volume", "inspect"] and command[-1] == "new-recovery":
                # Another actor created this name after our ls check. Docker
                # create is idempotent; it MUST NOT authorize touching its data.
                output = json.dumps([{"Labels": {"owner": "someone-else"}}])
            return subprocess.CompletedProcess(command, 0, output, "")
        with patch.object(upgrade, "run", side_effect=fake), self.assertRaisesRegex(upgrade.Blocked, "RESTORE_TARGET_NOT_EMPTY"):
            upgrade.main([".env.example", "restore", "--backup", "a" * 36, "--restore-volume", "new-recovery"])
        self.assertFalse(any(call[:2] == ["docker", "run"] for call in calls))


if __name__ == "__main__":
    unittest.main()
