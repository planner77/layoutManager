#!/usr/bin/env python3
"""Disposable local three-role OCI build and negative runtime checks."""
import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import socket
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]


@contextmanager
def owned_volume(run_id, purpose):
    """Create one fresh labelled volume and remove only that volume."""
    name = "verify-local-" + run_id.lower() + "-" + purpose + "-" + uuid.uuid4().hex[:8]
    existing = subprocess.run(["docker", "volume", "inspect", name], cwd=ROOT,
                              capture_output=True, timeout=15)
    if existing.returncode == 0:
        raise RuntimeError("refusing pre-existing Docker volume")
    run("docker", "volume", "create", "--name", name,
        "--label", "com.planner77.purpose=verify-local",
        "--label", "com.planner77.run-id=" + run_id)
    try:
        yield name
    finally:
        run("docker", "volume", "rm", name)


def run(*argv, cwd=ROOT, expected=0):
    p = subprocess.run(argv, cwd=cwd, text=True, capture_output=True, timeout=1800)
    # Never print uncontrolled command output; parent CLI captures/redacts this
    # script's bounded diagnostics.
    if (p.returncode == 0) != (expected == 0):
        raise RuntimeError(f"{argv[0]} {argv[1]} unexpected exit {p.returncode}: {p.stderr[-300:]}")
    return p.stdout.strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", required=True, choices=("release", "worktree"))
    args = parser.parse_args()
    run_id = os.environ.get("VERIFY_LOCAL_RUN_ID", "")
    if not run_id or not all(char.isalnum() or char == "-" for char in run_id) or len(run_id) > 80:
        raise RuntimeError("valid isolated VERIFY_LOCAL_RUN_ID required")
    prefix = "cad-layout-viewer:vl-" + run_id.lower()
    app_image, migrator_image, worker_image = (prefix + "-app", prefix + "-migrator", prefix + "-worker")
    roles = (("runtime", "app", app_image), ("migrator", "migrator", migrator_image),
             ("cpu-worker", "cpu-worker", worker_image))
    commit = run("git", "rev-parse", "HEAD")
    tree = run("git", "rev-parse", "HEAD^{tree}")
    status = subprocess.check_output(["git", "status", "--porcelain=v1", "-z", "--untracked-files=all"], cwd=ROOT)
    dirty = any(not row[3:].startswith((b"data/", b"out/IssueEvidence/", b"out/FailureLedger.md"))
                for row in status.split(b"\0") if row)
    fingerprint = os.environ.get("VERIFY_LOCAL_SOURCE_FINGERPRINT", "unavailable")
    if args.mode == "release" and dirty:
        raise RuntimeError("release requires exact clean source; dirty worktree")
    run("docker", "info", "--format", "{{.ServerVersion}}")
    with tempfile.TemporaryDirectory(prefix="verify-local-docker-") as tmp:
        context = ROOT
        if args.mode == "release":
            context = Path(tmp) / "source"
            context.mkdir()
            archive = Path(tmp) / "source.tar"
            with archive.open("wb") as stream:
                p = subprocess.run(["git", "archive", "--format=tar", commit], cwd=ROOT, stdout=stream, timeout=90)
            if p.returncode:
                raise RuntimeError("git archive failed")
            with tarfile.open(archive) as source:
                source.extractall(context, filter="data")
        version = json.loads((context / "src/package.json").read_text())["version"]
        for target, role, tag in roles:
            run("docker", "build", "--platform", "linux/amd64", "--target", target,
                "--label", "org.opencontainers.image.source=https://github.com/planner77/layoutManager",
                "--label", "org.opencontainers.image.revision=" + commit,
                "--label", "org.opencontainers.image.version=" + version,
                "--label", "com.planner77.local.source-mode=" + ("exact-git-archive" if args.mode == "release" else "dirty-worktree" if dirty else "worktree"),
                "--label", "com.planner77.local.source-fingerprint=" + fingerprint,
                "-f", "src/Dockerfile", "-t", tag, ".", cwd=context)
            image = json.loads(run("docker", "image", "inspect", tag))[0]
            labels = image["Config"]["Labels"]
            if (labels.get("com.planner77.g7.image-role") != role or
                labels.get("org.opencontainers.image.revision") != commit or
                labels.get("org.opencontainers.image.version") != version or
                labels.get("org.opencontainers.image.source") != "https://github.com/planner77/layoutManager" or
                labels.get("com.planner77.local.source-fingerprint") != fingerprint or
                image["Architecture"] != "amd64"):
                raise RuntimeError("image role/source metadata mismatch: " + role)
            print(json.dumps({"role": role, "image_id": image["Id"], "commit": commit,
                              "tree": tree, "mode": args.mode, "dirty": dirty, "fingerprint": fingerprint}))
        for tag, script in ((app_image, "set -eu; test -f server.js; test \"$(id -u)\" = 10001; node -e 'const D=require(\"better-sqlite3\");new D(\":memory:\").close()'"),
                            (migrator_image, "set -eu; test -f prisma.config.ts; test \"$(id -u)\" = 10001; node -e 'const D=require(\"better-sqlite3\");new D(\":memory:\").close()'"),
                            (worker_image, "set -eu; test -f scripts/scene-cpu-worker.ts; test \"$(id -u)\" = 10001; node -e 'const D=require(\"better-sqlite3\");new D(\":memory:\").close()'")):
            run("docker", "run", "--rm", "--network", "none", "--entrypoint", "sh", tag, "-c", script)
        with owned_volume(run_id, "positive") as volume:
            run("docker", "run", "--rm", "--network", "none",
                "--mount", f"type=volume,source={volume},target=/data",
                "-e", "DATABASE_URL=file:/data/db/cad.sqlite", migrator_image)
            check = ("const fs=require('node:fs');const D=require('better-sqlite3');"
                     "const p='/data/db/cad.sqlite';if(fs.statSync(p).size<=0)process.exit(2);"
                     "const db=new D(p,{readonly:true,fileMustExist:true});"
                     "if(db.pragma('integrity_check',{simple:true})!=='ok')process.exit(3);db.close()")
            run("docker", "run", "--rm", "--network", "none",
                "--mount", f"type=volume,source={volume},target=/data,readonly",
                "--entrypoint", "node", migrator_image, "-e", check)
            with socket.socket() as sock:
                sock.bind(("127.0.0.1", 0))
                port = sock.getsockname()[1]
            name = "verify-local-app-" + str(os.getpid())
            run("docker", "run", "-d", "--name", name, "--publish", f"127.0.0.1:{port}:3000",
                "--mount", f"type=volume,source={volume},target=/data", "-e", "DATABASE_URL=file:/data/db/cad.sqlite",
                app_image)
            try:
                deadline = time.monotonic() + 60
                while time.monotonic() < deadline:
                    try:
                        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=2) as response:
                            if response.status == 200:
                                break
                    except Exception:
                        time.sleep(.5)
                else:
                    raise RuntimeError("local OCI app health timeout")
            finally:
                run("docker", "rm", "-f", name)
        bad_path = subprocess.run(["docker", "run", "--rm", "--network", "none",
                                   "-e", "DATABASE_URL=file:/proc/cad.sqlite", "-e", "CAD_STORAGE_PATH=/data/cad",
                                   migrator_image], cwd=ROOT, text=True, capture_output=True, timeout=120)
        if bad_path.returncode == 0 or not any(marker in (bad_path.stdout + bad_path.stderr).lower() for marker in ("unable to open database", "readonly", "permission denied", "p1003")):
            raise RuntimeError("unwritable migration did not fail for intended DB reason")
        with tempfile.TemporaryDirectory(prefix="verify-local-bad-migration-") as fixture:
            fixture = Path(fixture)
            migrations = fixture / "migrations"
            migrations.mkdir()
            import shutil
            shutil.copytree(context / "src/prisma/migrations", migrations, dirs_exist_ok=True)
            invalid = migrations / "99999999999999_invalid_local"
            invalid.mkdir()
            (invalid / "migration.sql").write_text("THIS IS NOT VALID SQL;\n")
            os.chmod(fixture, 0o755)
            for path in migrations.rglob("*"):
                os.chmod(path, 0o755 if path.is_dir() else 0o644)
            with owned_volume(run_id, "invalid-sql") as volume:
                bad_sql = subprocess.run(["docker", "run", "--rm", "--network", "none",
                    "--mount", f"type=bind,source={migrations},target=/app/src/prisma/migrations,readonly",
                    "--mount", f"type=volume,source={volume},target=/data",
                    "-e", "DATABASE_URL=file:/data/db/cad.sqlite", migrator_image],
                    cwd=ROOT, text=True, capture_output=True, timeout=120)
                if bad_sql.returncode == 0 or not any(marker in (bad_sql.stdout + bad_sql.stderr).lower() for marker in ("syntax error", "p3018", "invalid sql")):
                    raise RuntimeError("invalid SQL migration did not fail for intended SQL reason")
    print("local OCI build, roles, native SQLite and negative migrations PASS")


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
        print("LOCAL_DOCKER_FAILED: " + str(exc), file=sys.stderr)
        raise SystemExit(1)
