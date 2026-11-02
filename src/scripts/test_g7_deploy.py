#!/usr/bin/env python3
"""Issue #211: synthetic host policy tests; no Docker state or data are touched."""
import importlib.util
import json
import subprocess
from pathlib import Path
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location("g7_deploy", Path(__file__).with_name("g7-deploy.py"))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


def fixture():
    return {
        "compose": ["docker", "compose", "--env-file", "/tmp/example.env", "-f", "/tmp/compose.yml"],
        "config": {"name": "test-g7"}, "app": {"container_name": "sample-app"},
        "migrate": {}, "volume": "g7-explicit-unused-volume", "project": "test-g7",
        "envSha": "a" * 64, "appId": "sha256:" + "a" * 64,
        "migrateId": "sha256:" + "b" * 64, "targetVersion": "0.58.1", "projectName": None,
    }


def app(state="absent", image_id=None):
    return {"containerId": "container-id" if state != "absent" else None,
            "imageId": image_id, "version": "0.58.1" if image_id else None,
            "state": state, "health": "UNKNOWN"}


class G7DeployPolicyTests(unittest.TestCase):
    def setUp(self):
        self.context = fixture()
        self.env = Path("/tmp/example.env")

    def inspect_with(self, volume, app_data, *, empty=False, engine=None):
        def upgrade_stub(_env, action, project_name=None, approved=None):
            if engine and engine["state"] == "RESTORE_REQUIRED":
                return engine
            if action == "status":
                return {"state": engine["state"], "planId": engine["planId"]}
            return engine

        with (mock.patch.object(deploy, "_compose_context", return_value=self.context),
              mock.patch.object(deploy, "_volume_info", return_value=volume),
              mock.patch.object(deploy, "_app_state", return_value=app_data),
              mock.patch.object(deploy, "_foreign_attachments"),
              mock.patch.object(deploy, "_is_empty", return_value=empty),
              mock.patch.object(deploy, "upgrade", side_effect=upgrade_stub)):
            return deploy.inspect(self.env)

    def test_fresh_absent_volume_does_not_probe_or_create(self):
        with (mock.patch.object(deploy, "_compose_context", return_value=self.context),
              mock.patch.object(deploy, "_volume_info", return_value=None),
              mock.patch.object(deploy, "_app_state", return_value=app()),
              mock.patch.object(deploy, "_is_empty") as probe,
              mock.patch.object(deploy, "upgrade") as helper,
              mock.patch.object(deploy, "command") as runner):
            _, view, stamp = deploy.inspect(self.env)
        self.assertEqual(view["decision"], "FRESH_INSTALL")
        self.assertEqual(view["volumeState"], "ABSENT")
        self.assertEqual(view["installedVersion"], "UNKNOWN")
        self.assertEqual(len(deploy.build_plan(view, stamp)["planId"]), 64)
        probe.assert_not_called()
        helper.assert_not_called()
        runner.assert_not_called()

    def test_fresh_existing_empty_volume_no_adoption(self):
        _, view, stamp = self.inspect_with({"Name": self.context["volume"], "Driver": "local"},
                                            app(), empty=True)
        self.assertEqual(view["decision"], "FRESH_INSTALL")
        self.assertEqual(view["volumeState"], "EXISTS")
        self.assertIn("RUN_MIGRATOR_CREATE_SCHEMA_SETUP_CODE",
                      deploy.build_plan(view, stamp)["effects"])

    def test_restart_plan_binding_and_noop(self):
        engine = {"state": "RESTART_SAME_RELEASE", "planId": "e" * 64,
                  "from": "0.58.1", "to": "0.58.1", "steps": []}
        _, view, stamp = self.inspect_with({"Name": self.context["volume"], "Driver": "local"},
                                            app("running", self.context["appId"]), engine=engine)
        self.assertEqual(view["installedVersion"], "0.58.1")
        self.assertEqual(view["appState"], "running")
        self.assertEqual(view["businessAcceptance"], "NOT_VERIFIED")
        execute = deploy.build_plan(view, stamp)
        start = deploy.build_plan(view, stamp, "start")
        self.assertNotEqual(execute["planId"], start["planId"])
        self.assertEqual(start["effects"], ["NOOP_ALREADY_RUNNING"])
        self.assertEqual(deploy.apply(self.env, None, self.context, start)["state"],
                         "NOOP_ALREADY_RUNNING")

    def test_compatible_upgrade_delegates_to_209_helper(self):
        engine = {"state": "UPGRADE_COMPATIBLE", "planId": "f" * 64,
                  "from": "0.56.0", "to": "0.58.1", "steps": ["COMPATIBLE", "COMPATIBLE", "COMPATIBLE"]}
        _, view, stamp = self.inspect_with({"Name": self.context["volume"], "Driver": "local"},
                                            app("running", "sha256:" + "f" * 64), engine=engine)
        plan = deploy.build_plan(view, stamp)
        self.assertIn("SQLITE_WAL_AWARE_BACKUP_AND_CAD_RECOVERY_SET", plan["effects"])
        with (mock.patch.object(deploy, "upgrade", return_value={
                "state": "G7_UPGRADE_HOST_COMPLETE_APP_STOPPED"}) as helper,
              mock.patch.object(deploy, "_postcheck", return_value={"decision": "RESTART_SAME_RELEASE"})):
            result = deploy.apply(self.env, None, self.context, plan)
        self.assertEqual(result["state"], "UPGRADED_APP_STOPPED")
        helper.assert_called_once_with(self.env, "auto", None, None)

    def test_real_209_helper_filter_to_frontend_chain(self):
        # Exercise the actual #209 output filter, then the #211 subprocess
        # boundary. A mocked upgrade() return would hide the P2 regression.
        source = Path(__file__).with_name("test_g7_upgrade.py")
        spec = importlib.util.spec_from_file_location("g7_upgrade_regression_211", source)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        plan = {"state": "UPGRADE_COMPATIBLE", "planId": "a" * 64,
                "from": "0.56.0", "to": "0.58.1",
                "steps": ["COMPATIBLE", "COMPATIBLE", "COMPATIBLE"],
                "secret": "must-not-appear", "privatePath": "/secret"}
        _, code, stdout = module.HostTests().invoke("plan", cli_output=json.dumps(plan))
        self.assertEqual(code, 0)
        self.assertNotIn("must-not-appear", stdout)
        self.assertNotIn("/secret", stdout)
        wrapped = subprocess.CompletedProcess(["host"], 0, stdout, "")
        with mock.patch.object(deploy, "command", return_value=wrapped):
            visible = deploy.upgrade(self.env, "plan")
        self.assertEqual(visible["steps"], ["COMPATIBLE", "COMPATIBLE"])
        self.assertEqual(visible["from"], "0.56.0")
        self.assertEqual(visible["to"], "0.58.1")

    def test_frontend_rejects_missing_or_incompatible_real_chain(self):
        base = {"state": "UPGRADE_COMPATIBLE", "planId": "a" * 64,
                "from": "0.56.0", "to": "0.58.1"}
        for payload in ({**base},
                        {**base, "steps": []},
                        {**base, "steps": ["MIGRATION"]},
                        {**base, "steps": ["COMPATIBLE", {"secret": 1}]},
                        {**base, "steps": ["COMPATIBLE"] * 65},
                        {**base, "planId": "bad", "steps": ["COMPATIBLE"]}):
            with self.subTest(payload=repr(payload)[:90]):
                completed = subprocess.CompletedProcess(
                    ["host"], 0, json.dumps(payload) + "\n", "")
                with mock.patch.object(deploy, "command", return_value=completed):
                    with self.assertRaisesRegex(deploy.Blocked, "CHAIN_INVALID"):
                        deploy.upgrade(self.env, "plan")

    def test_schema_upgrade_binds_engine_exact_plan(self):
        engine = {"state": "UPGRADE_MIGRATION_REQUIRED", "planId": "f" * 64,
                  "from": "0.58.1", "to": "0.59.0", "steps": ["MIGRATION"]}
        self.context["targetVersion"] = "0.59.0"
        _, view, stamp = self.inspect_with({"Name": self.context["volume"], "Driver": "local"},
                                            app(), engine=engine)
        plan = deploy.build_plan(view, stamp)
        with (mock.patch.object(deploy, "upgrade", return_value={
                "state": "G7_UPGRADE_HOST_COMPLETE_APP_STOPPED"}) as helper,
              mock.patch.object(deploy, "_postcheck", return_value={"decision": "RESTART_SAME_RELEASE"})):
            deploy.apply(self.env, None, self.context, plan)
        helper.assert_called_once_with(self.env, "apply", None, engine["planId"])

    def test_restore_required_never_offers_execution(self):
        _, view, stamp = self.inspect_with({"Name": self.context["volume"], "Driver": "local"},
                                            app(), engine={"state": "RESTORE_REQUIRED", "phase": "LOCKED"})
        self.assertEqual(view["decision"], "RESTORE_REQUIRED")
        self.assertIn("RECOVERY_HOLD", view["blockers"])
        with self.assertRaises(deploy.Blocked):
            deploy.build_plan(view, stamp)

    def test_stale_plan_denied_before_apply(self):
        engine = {"state": "RESTART_SAME_RELEASE", "planId": "e" * 64,
                  "from": "0.58.1", "to": "0.58.1", "steps": []}
        _, view, stamp = self.inspect_with({"Name": self.context["volume"], "Driver": "local"},
                                            app(), engine=engine)
        expected = deploy.build_plan(view, stamp)["planId"]
        changed = {**stamp, "envSha": "changed"}
        with (mock.patch.object(deploy, "inspect", side_effect=[
                (self.context, view, stamp), (self.context, view, changed)]),
              mock.patch.object(deploy, "apply") as apply,
              mock.patch.object(deploy, "emit") as emit,
              mock.patch.object(Path, "resolve", return_value=self.env)):
            code = deploy.main(["/tmp/example.env", "execute", "--approve-plan", expected, "--json"])
        self.assertEqual(code, 1)
        self.assertEqual(emit.call_args.args[0]["code"], "G7_DEPLOY_STALE_PLAN")
        apply.assert_not_called()

    def test_wrong_mode_cannot_start(self):
        view = {"decision": "FRESH_INSTALL", "appState": "absent"}
        with self.assertRaises(deploy.Blocked):
            deploy.build_plan(view, {"envSha": "test"}, "start")

    def test_probe_uses_nocopy_readonly(self):
        def runner(argv, **_kwargs):
            self.assertIn("volume-nocopy", " ".join(argv))
            self.assertIn("readonly", " ".join(argv))
            self.assertNotIn("volume create", " ".join(argv))
            return mock.Mock(stdout='{"empty":true}', returncode=0)
        with mock.patch.object(deploy, "command", side_effect=runner):
            self.assertTrue(deploy._is_empty(self.context["volume"], self.context["migrateId"]))

    def test_source_guidance_does_not_echo_secrets(self):
        message = deploy._field_action("G7_UPGRADE_SOURCE_REQUIRED")
        self.assertIn("SOURCE_COMMIT", message)
        self.assertNotIn("SECRET", message)


if __name__ == "__main__":
    unittest.main()
