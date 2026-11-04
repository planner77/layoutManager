#!/usr/bin/env python3
"""#209 real image upgrade of a uniquely owned disposable Greenfield volume.

Never accepts an existing volume or a production environment file. Only fixed
synthetic credentials/DXF from smoke_greenfield_runtime are used. No DB, CAD,
setup code or cookie is emitted. No registry publication takes place.
"""
import argparse
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

from smoke_greenfield_runtime import create, verify

PHASE = "arguments"

def call(command, *, failure=False):
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode and not failure:
        # Native stacks/config/logs may contain private material. Never echo it.
        raise RuntimeError("G7_209_SMOKE_COMMAND_FAILED")
    return result.stdout.strip()


def wait_health(origin):
    for _ in range(60):
        try:
            with urllib.request.urlopen(origin + "/api/health", timeout=2) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(1)
    raise RuntimeError("G7_209_SMOKE_HEALTH_TIMEOUT")


def main():
    global PHASE
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("old-app", "old-migrator", "app", "migrator", "source"):
        parser.add_argument("--" + option, required=True)
    parser.add_argument("--port", type=int, default=3197)
    options = parser.parse_args()
    if not re.fullmatch(r"[a-f0-9]{40}", options.source):
        raise RuntimeError("G7_209_SMOKE_SOURCE_INVALID")
    old_images = [json.loads(call(["docker", "image", "inspect", ref]))[0]
                  for ref in (options.old_app, options.old_migrator)]
    old_revisions = set()
    for old_image in old_images:
        labels = old_image.get("Config", {}).get("Labels") or {}
        old_revisions.add(labels.get("org.opencontainers.image.revision", ""))
        if (labels.get("org.opencontainers.image.version") != "0.56.0"
                or old_image.get("Os") != "linux" or old_image.get("Architecture") != "amd64"):
            raise RuntimeError("G7_209_SMOKE_OLD_IMAGE_MISMATCH")
    if len(old_revisions) != 1 or not re.fullmatch(r"[a-f0-9]{40}", next(iter(old_revisions))):
        raise RuntimeError("G7_209_SMOKE_OLD_IMAGE_MISMATCH")
    owned = "ci-issue209-" + uuid.uuid4().hex
    container = owned + "-app"
    origin = "http://127.0.0.1:" + str(options.port)
    scripts = Path(__file__).resolve().parent
    spec = importlib.util.spec_from_file_location("upgrade_host", scripts / "g7-upgrade.py")
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    with tempfile.TemporaryDirectory(prefix="g7-209-smoke-") as temporary:
        env_file = Path(temporary) / ".env"
        state = Path(temporary) / "synthetic.json"
        call(["docker", "volume", "create", "--label", "com.planner77.g7.synthetic=" + owned, owned])
        def settings(app, migrator, source):
            return {"G7_GREENFIELD_MODE": "true", "G7_GREENFIELD_AUTOMATED": "true",
                    "CAD_STORAGE_BACKEND": "local", "DATABASE_URL": "file:/data/db/cad.sqlite",
                    "CAD_STORAGE_PATH": "/data/cad", "G7_DEPLOY_APP_IMAGE": app,
                    "G7_DEPLOY_MIGRATOR_IMAGE": migrator, "G7_RELEASE_SOURCE_COMMIT": source,
                    "G7_RUNTIME_ORIGIN": origin, "G7_RUNTIME_ALLOW_HTTP": "true"}
        def run_image(image, env, *, app=False, args=()):
            command = ["docker", "run", "--mount", "type=volume,source=" + owned + ",target=/data"]
            for key, value in env.items():
                command += ["--env", key + "=" + value]
            command += ["--env", "G7_AUTH_ENABLED=" + ("true" if app else "false"),
                        "--env", "G7_CAD_WRITE_CUTOVER_ENABLED=" + ("true" if app else "false")]
            if app:
                command += ["--detach", "--name", container, "--publish", "127.0.0.1:" + str(options.port) + ":3000", image]
            else:
                command += ["--rm", "--entrypoint", "node", image, "--import", "tsx", "scripts/g7-greenfield.ts"] + list(args)
            return call(command)
        def fingerprint(image):
            # Logical row fingerprint is independent of WAL/page layout. Never
            # publish row values, password hashes, CAD or session content.
            script = """const D=require('better-sqlite3'),f=require('fs'),c=require('crypto');
const d=new D('/data/db/cad.sqlite',{readonly:true}),h=c.createHash('sha256');
// Compare business/data rows, not intentionally different schema histories.\nfor(const {name} of d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_prisma_migrations','SceneBuildJob') ORDER BY name").all()){
if(!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name))throw Error('schema');h.update(name);
for(const r of d.prepare('SELECT * FROM "'+name+'"').all().map(x=>JSON.stringify(x)).sort())h.update(r);}
d.close();function walk(p){for(const n of f.readdirSync(p).sort()){const q=p+'/'+n,s=f.lstatSync(q);
if(s.isDirectory())walk(q);else{h.update(q.slice('/data/cad'.length));h.update(f.readFileSync(q));}}}walk('/data/cad');
process.stdout.write(h.digest('hex'));"""
            result = call(["docker", "run", "--rm", "--network", "none", "--mount",
                           "type=volume,source=" + owned + ",target=/data,readonly", "--entrypoint", "node", image, "-e", script])
            if not re.fullmatch(r"[a-f0-9]{64}", result):
                raise RuntimeError("G7_209_SMOKE_FINGERPRINT_INVALID")
            return result
        try:
            # The old release uses its real packaged auto/install/schema code.
            PHASE = "old-install"
            old_env = settings(options.old_app, options.old_migrator, "")
            run_image(options.old_migrator, old_env, args=("auto",))
            run_image(options.old_app, old_env, app=True)
            wait_health(origin)
            PHASE = "old-business-fixture"
            setup_code = call(["docker", "exec", container, "cat", "/data/db/first-admin.code"])
            os.environ["G7_CI_FIRST_SETUP_CODE"] = setup_code
            create(origin, state)
            os.environ.pop("G7_CI_FIRST_SETUP_CODE", None)
            call(["docker", "stop", container])
            call(["docker", "rm", container])
            before = fingerprint(options.old_migrator)
            env_file.write_text("\n".join(("GHCR_IMAGE=" + options.app,
                "GHCR_MIGRATION_IMAGE=" + options.migrator, "G7_RELEASE_SOURCE_COMMIT=" + options.source,
                "CAD_DATA_VOLUME_NAME=" + owned, "G7_RUNTIME_ORIGIN=" + origin,
                "G7_RUNTIME_ALLOW_HTTP=true", "CAD_HOST_PORT=" + str(options.port))) + "\n")
            env_file.chmod(0o600)
            # Host assertions, real backup and actual native SQLite CLI run.
            PHASE = "upgrade-plan-apply"
            # Real 0.60 migration changes DDL and therefore requires an
            # operator-style explicit approved plan. This uniquely owned,
            # disposable CI volume may approve exactly the plan it inspected.
            # Never bypass the engine or disable its backup/restore gate.
            plan_output = io.StringIO()
            with contextlib.redirect_stdout(plan_output):
                if helper.main([str(env_file), "plan", "--project-name", owned]) != 0:
                    raise RuntimeError("G7_209_SMOKE_PLAN_FAILED")
            lines = [line for line in plan_output.getvalue().splitlines() if line.strip()]
            if len(lines) != 1:
                raise RuntimeError("G7_209_SMOKE_PLAN_INVALID")
            plan = json.loads(lines[0])
            plan_id = plan.get("planId")
            if (plan.get("state") != "UPGRADE_MIGRATION_REQUIRED"
                    or plan.get("requiresApproval") is not True
                    or plan.get("from") != "0.56.0"
                    or plan.get("to") != "0.61.0"
                    or not isinstance(plan_id, str)
                    or not re.fullmatch(r"[a-f0-9]{64}", plan_id)):
                raise RuntimeError("G7_209_SMOKE_PLAN_INVALID")
            with contextlib.redirect_stdout(io.StringIO()):
                if helper.main([str(env_file), "apply", "--approve-plan",
                                plan_id, "--project-name", owned]) != 0:
                    raise RuntimeError("G7_209_SMOKE_APPLY_FAILED")
            after = fingerprint(options.migrator)
            if before != after:
                raise RuntimeError("G7_209_SMOKE_DATA_CHANGED")
            target = settings(options.app, options.migrator, options.source)
            PHASE = "target-restart"
            run_image(options.migrator, target, args=("auto",))
            run_image(options.app, target, app=True)
            wait_health(origin)
            PHASE = "target-health-login-crud"
            verify(origin, state)  # Login, explicit Site grant, read, protected delete.
            print("G7_209_REAL_056_TO_CANDIDATE_UPGRADE_PRESERVATION_HEALTH_CRUD_PASS")
        finally:
            os.environ.pop("G7_CI_FIRST_SETUP_CODE", None)
            call(["docker", "rm", "--force", container], failure=True)
            # This tool created and labeled this unpredictable disposable name.
            label = call(["docker", "volume", "inspect", owned, "--format", '{{index .Labels "com.planner77.g7.synthetic"}}'], failure=True)
            if label == owned:
                call(["docker", "volume", "rm", owned], failure=True)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(json.dumps({"code": "G7_209_DISPOSABLE_UPGRADE_SMOKE_FAILED", "stage": PHASE}), file=__import__("sys").stderr)
        raise SystemExit(1)
