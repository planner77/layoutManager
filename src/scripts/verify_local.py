#!/usr/bin/env python3
"""Issue #281: local, fail-closed verification with immutable run evidence.

Only fixed argv manifests are executed. No shell, remote, publisher, or deployment
entrypoint is reachable from this module.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
import signal
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"
EVIDENCE = ROOT / "out" / "IssueEvidence"
LOGS = ROOT / "data" / "verify-local"
RISK_PATHS = {
    "db": re.compile(r"(^|/)(prisma|migrations|db|database)(/|\.|-|$)", re.I),
    "auth": re.compile(r"auth|csrf|rbac|permission|g7-operational|g7-runtime", re.I),
    "scene": re.compile(r"(^|/)(scene|viewers)(/|\.|$)", re.I),
    "worker": re.compile(r"worker", re.I),
    "storage": re.compile(r"storage|s3|upload", re.I),
    "deploy": re.compile(r"(^|/)(deploy|docker|compose|oci|workflows)(/|\.|-)|Dockerfile", re.I),
    "recovery": re.compile(r"backup|restore|recovery|snapshot", re.I),
}
SECRET_KEYS = re.compile(r"(?i)(token|secret|password|credential|(?:api|access)[_-]?key|authorization)")
FORBIDDEN_ENV = re.compile(r"(?i)^(?:GH_|GIT_|GITHUB_|remote_repo)")
SECRET_LINE = re.compile(r"(?im)(\b(?:authorization|x-api-key|token|secret|password|credential)\s*[:=]\s*)([^\s,;]+)")
AUTH_HEADER = re.compile(r"(?im)(\bAuthorization\s*[:=]\s*)(?:Bearer|Basic)\s+[^\s,;]+")
QUOTED_SECRET = re.compile(r'(?i)("(?:authorization|x-api-key|token|secret|password|credential)"\s*:\s*")[^"\\]*(?:\\.[^"\\]*)*"')
URL_CREDENTIAL = re.compile(r"(?i)(https?://)[^/@\s]+@")
TOKEN_PATTERN = re.compile(r"(?i)(\b(?:gh[pousr]_|github_pat_|sk-|Bearer\s+))[A-Za-z0-9_./+=-]{12,}")
EXCLUDED = ("out/IssueEvidence/", "out/FailureLedger.md", "data/", "src/.next/", "src/node_modules/", "src/generated/", "src/test-results/", "src/playwright-report/")


def utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git(*args: str) -> bytes:
    p = subprocess.run(["git", *args], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    if p.returncode:
        raise ValueError("git " + args[0] + " failed: " + p.stderr.decode(errors="replace")[:300])
    return p.stdout


def source_state(base: str) -> dict:
    if not re.fullmatch(r"[0-9a-fA-F]{7,40}", base):
        raise ValueError("--base must be a commit SHA")
    commit = git("rev-parse", "--verify", base + "^{commit}").decode().strip()
    head = git("rev-parse", "HEAD").decode().strip()
    tree = git("rev-parse", "HEAD^{tree}").decode().strip()
    changed = set(git("diff", "--no-renames", "--name-only", "-z", "--diff-filter=ACDMRTUXB", commit, "HEAD").decode().split("\0"))
    changed.update(git("diff", "--no-renames", "--name-only", "-z", "--diff-filter=ACDMRTUXB", "HEAD").decode().split("\0"))
    status = git("status", "--porcelain=v1", "-z", "--untracked-files=all")
    entries = status.decode(errors="surrogateescape").split("\0")
    dirty_paths: set[str] = set()
    i = 0
    while i < len(entries) and entries[i]:
        row = entries[i]
        changed.add(row[3:])
        dirty_paths.add(row[3:])
        if row[:2].strip() in ("R", "C") or "R" in row[:2] or "C" in row[:2]:
            i += 1
            if i < len(entries):
                changed.add(entries[i])
                dirty_paths.add(entries[i])
        i += 1
    paths = sorted(p for p in changed if p and not p.startswith(EXCLUDED))
    tracked = set(git("ls-files", "-z").decode().split("\0"))
    untracked = set(git("ls-files", "--others", "--exclude-standard", "-z").decode().split("\0"))
    all_paths = sorted(p for p in tracked | untracked if p and not p.startswith(EXCLUDED) and not p.endswith(".tsbuildinfo"))
    digest = hashlib.sha256()
    for rel in all_paths:
        path = ROOT / rel
        digest.update(rel.encode(errors="surrogateescape") + b"\0")
        if path.is_symlink():
            digest.update(b"SYMLINK:" + os.readlink(path).encode())
        elif path.is_file():
            digest.update(path.read_bytes())
        else:
            digest.update(b"MISSING")
        digest.update(b"\0")
    return {"base": commit, "head": head, "tree": tree, "dirty": any(not p.startswith(EXCLUDED) for p in dirty_paths),
            "paths": paths, "fingerprint": digest.hexdigest()}


def infer_risks(paths: list[str], user_risk: list[str], profile: str) -> tuple[list[str], str]:
    risks = set(user_risk)
    code = False
    unknown = False
    for path in paths:
        if path.endswith(".md"):
            continue
        if path.startswith("src/") or path.startswith(".github/") or path in (".dockerignore", ".gitignore"):
            code = True
            matched = False
            for name, pattern in RISK_PATHS.items():
                if pattern.search(path):
                    risks.add(name)
                    matched = True
            if not matched and not (path.endswith((".ts", ".tsx", ".js", ".mjs", ".py", ".json", ".sh", ".css", ".prisma")) or path == ".dockerignore"):
                unknown = True
        else:
            unknown = True
    if unknown:
        risks.add("unknown")
    if profile == "docs" and (code or unknown):
        raise ValueError("docs profile cannot cover source/config changes")
    if risks & {"db", "auth", "scene", "worker", "storage", "deploy", "oci", "recovery"} and profile in ("docs", "standard"):
        raise ValueError("high-risk changes require high-risk or release profile")
    if unknown and profile == "docs":
        raise ValueError("unknown path requires standard profile and explicit review")
    return sorted(risks), "source path inference + user risk union; unknown paths require review"


def command(argv: list[str], cwd: str = "src", required: bool = True, why: str = "", timeout: int = 900) -> dict:
    return {"id": "", "argv": argv, "cwd": cwd, "required": required, "why": why, "timeout_seconds": timeout}


def manifest(profile: str, risks: list[str], paths: list[str], fixture: str | None = None,
             selected_unit: list[str] | None = None, selected_e2e: list[str] | None = None,
             docs_review: str | None = None, recovery_input: str | None = None,
             synthetic_auth_clock: str = "native") -> list[dict]:
    if synthetic_auth_clock not in ("native", "monotonic"):
        raise ValueError("invalid synthetic auth clock mode")
    items: list[dict] = []
    def add(id: str, argv: list[str], why: str, cwd: str = "src", timeout: int = 900):
        item = command(argv, cwd, True, why, timeout)
        item["id"] = id
        items.append(item)
    if profile == "docs":
        add("docs-links", ["python3", "scripts/verify_local_docs.py", *["../" + p for p in paths if p.endswith(".md")]], "changed Markdown local links", timeout=60)
        if docs_review:
            add("docs-policy-review", ["python3", "scripts/verify_local_docs_review.py", docs_review], "named reviewer policy/content review record", timeout=30)
        else:
            item = command([], required=True, why="named policy/content review required")
            item.update(id="docs-policy-review", missing="--docs-review")
            items.append(item)
    else:
        add("preflight", ["python3", "scripts/verify_local_preflight.py"], "Node/lockfile and local dependencies", timeout=60)
        add("prisma-generate", ["npm", "run", "db:generate"], "generated client", timeout=180)
        add("typecheck", ["npm", "run", "typecheck"], "source type safety")
        add("lint", ["npm", "run", "lint"], "source lint")
        tests: list[str] = []
        patterns = [("auth", "g7-runtime-auth.test.ts"), ("db", "g7-runtime-auth.test.ts"),
                    ("db", "g7-runtime-migration.test.ts"), ("auth", "g7-runtime-migration.test.ts"),
                    ("db", "g7-greenfield-upgrade.test.ts"), ("db", "g7-greenfield-upgrade-qa.test.ts"),
                    ("scene", "scene-persistence.test.ts"), ("storage", "storage.s3.ts")]
        for risk, name in patterns:
            if risk in risks:
                tests.append("tests/integration/" + name)
        if "storage" in risks:
            tests = [p for p in tests if not p.endswith("storage.s3.ts")]
            tests.extend(["tests/integration/scene-storage-s3.test.ts", "tests/integration/storage-cleanup.test.ts"])
        application_paths = [p for p in paths if p.startswith(("src/app/", "src/components/", "src/server/", "src/domain/", "src/viewers/"))]
        application = bool(application_paths)
        unmapped_application = [p for p in application_paths if not any(pattern.search(p) for pattern in RISK_PATHS.values())]
        unmapped_ui = [p for p in unmapped_application if p.startswith("src/components/") or
                       p.startswith("src/app/") and not p.startswith("src/app/api/")]
        tests.extend(selected_unit or [])
        tests = sorted(set(tests))
        if tests:
            add("affected-integration", ["npx", "vitest", "run", *tests], "risk/path mapped existing integration", timeout=1200)
        if "worker" in risks:
            add("worker-release-contract", ["npx", "vitest", "run", "tests/unit/scene-cpu-release-contract.test.ts"], "existing worker packaging and security contract", timeout=300)
        if any("verify_local" in p for p in paths):
            add("cli-contract", ["python3", "-m", "unittest", "tests/test_verify_local.py"], "CLI risk, evidence and failure contract", timeout=300)
        if profile == "release" or any("release_local" in p for p in paths):
            add("release-local-contract", ["npm", "run", "test:release-local"],
                "local three-role release and registry journal contract", timeout=300)
        if "recovery" in risks or profile == "release":
            add("recovery-contract", ["npm", "run", "test:recovery-local"], "authenticated archive and local recovery contract", timeout=300)
        add("build", ["npm", "run", "build"], "production build", timeout=1800)
        if "auth" in risks or "db" in risks:
            argv = ["npx", "playwright", "test", "--config", "playwright.g7-runtime.config.ts", "--reporter=line"]
            if synthetic_auth_clock == "monotonic":
                argv = ["env", "G7_RUNTIME_E2E_MONOTONIC_CLOCK=true", *argv]
            add("g7-browser", argv, "G7 browser flow", timeout=1200)
        if "db" in risks:
            add("master-migration-browser", ["npm", "run", "test:master-migration", "--", "--reporter=line"], "isolated migration browser", timeout=1200)
        if "scene" in risks or "worker" in risks:
            add("scene-browser", ["npx", "playwright", "test", "tests/e2e/scene-poc.spec.ts", "--reporter=line"], "affected Scene browser flow", timeout=900)
        if "storage" in risks or "deploy" in risks or "oci" in risks:
            add("affected-browser", ["npx", "playwright", "test", "tests/e2e/upload.spec.ts", "--reporter=line"], "bounded upload/browser smoke", timeout=900)
        if selected_e2e:
            add("selected-browser", ["npx", "playwright", "test", *selected_e2e, "--reporter=line"], "explicit affected browser selection", timeout=900)
        mapped = bool(tests or selected_e2e or set(risks) & {"auth", "db", "scene", "worker", "storage", "deploy", "oci", "recovery"})
        needs_unit = bool(unmapped_application) and not selected_unit
        needs_e2e = bool(unmapped_ui) and not selected_e2e
        if needs_unit or needs_e2e or ((application or "unknown" in risks) and not mapped):
            item = command([], required=True, why="unmapped application requires affected unit; unmapped UI also requires browser selection")
            missing = ", ".join(flag for needed, flag in ((needs_unit, "--unit"), (needs_e2e, "--e2e")) if needed)
            item.update(id="affected-review", missing=missing or "affected test selection")
            items.append(item)
        add("app-smoke", ["python3", "scripts/verify_local_smoke.py"], "local built app health", timeout=120)
        if set(risks) & {"db", "auth", "scene", "worker", "storage", "deploy", "oci", "recovery"} or profile == "release":
            add("g7-policy", ["python3", "scripts/test_g7_deploy.py"], "existing G7 deployment negative regression", cwd="src", timeout=300)
            add("g7-upgrade-policy", ["python3", "scripts/test_g7_upgrade.py"], "existing G7 upgrade regression", timeout=300)
            add("oci-negative", ["python3", "tests/oci/test_verified_negative.py"], "existing OCI negative regression", timeout=300)
            add("docker-roles", ["python3", "scripts/verify_local_docker.py", "--mode", "release" if profile == "release" else "worktree"], "actual disposable three-role build, runtime and migration", timeout=3600)
        if "recovery" in risks or profile == "release":
            add("recovery-docker", ["npm", "run", "test:recovery-local:docker"], "disposable G7 volume capture and isolated restore", timeout=600)
        if "worker" in risks or "scene" in risks or profile == "release":
            add("scene-worker-integration", ["npx", "vitest", "run", "tests/integration/g7-scene-worker-upgrade-recovery.test.ts", "tests/integration/scene-cpu-worker-real-g7.test.ts"], "real worker persistence/recovery integration", timeout=1200)
            add("scene-worker-oci", ["bash", "src/tests/oci/scene-cpu-worker-proof.sh", "--local"], "disposable actual OCI worker proof", cwd=".", timeout=1800)
        if profile == "release":
            if recovery_input:
                add("external-baseline-upgrade", ["python3", "scripts/verify_local_recovery.py", "--input", recovery_input],
                    "independent sealed previous-release restore and baseline clone probe; candidate upgrade is release-local gate", timeout=1200)
            else:
                item = command([], required=True, why="sealed prior-version baseline restore required")
                item.update(id="external-baseline-upgrade", missing="--recovery-input")
                items.append(item)
    if fixture:
        add("fixture-check", ["python3", "scripts/verify_local_fixture.py", fixture], "disposable FAIL/fix/PASS proof", timeout=30)
    if profile in ("docs", "standard"):
        item = command([], required=False, why="unrelated broad regression outside selected change scope")
        item.update(id="full-e2e", skip="entire browser suite is unrelated to selected change")
        items.append(item)
    for item in items:
        if item.get("missing") or item.get("skip"):
            continue
        executable = item["argv"][0]
        if not shutil.which(executable):
            item["missing"] = executable
        elif (item["argv"][1:2] == ["scripts/verify_local_docker.py"] or item["id"] == "scene-worker-oci") and not shutil.which("docker"):
            item["missing"] = "docker"
        elif item["id"] in ("docker-roles", "scene-worker-oci"):
            try:
                daemon = subprocess.run(["docker", "info", "--format", "{{.ServerVersion}}"],
                                        cwd=ROOT, capture_output=True, timeout=5)
                if daemon.returncode:
                    item["missing"] = "Docker daemon unavailable"
            except (OSError, subprocess.TimeoutExpired):
                item["missing"] = "Docker daemon unavailable"
        if item["id"] == "preflight" and not shutil.which("node"):
            item["missing"] = "Node unavailable"
    return items


def redact(value: str, secrets: list[str]) -> str:
    for secret in secrets:
        if len(secret) >= 4:
            value = value.replace(secret, "[REDACTED]")
    value = URL_CREDENTIAL.sub(r"\1[REDACTED]@", value)
    value = AUTH_HEADER.sub(r"\1[REDACTED]", value)
    value = QUOTED_SECRET.sub(r'\1[REDACTED]"', value)
    value = SECRET_LINE.sub(r"\1[REDACTED]", value)
    return TOKEN_PATTERN.sub("[REDACTED]", value)


def redact_object(value, secrets: list[str]):
    if isinstance(value, str):
        return redact(value, secrets)
    if isinstance(value, list):
        return [redact_object(item, secrets) for item in value]
    if isinstance(value, dict):
        return {key: redact_object(item, secrets) for key, item in value.items()}
    return value


def secret_values() -> list[str]:
    # Environment names only; never render the values before redaction.
    return [v for k, v in os.environ.items() if SECRET_KEYS.search(k) and len(v) >= 4]


def probe(argv: list[str]) -> str:
    try:
        p = subprocess.run(argv, cwd=ROOT, capture_output=True, timeout=8, text=True)
        return (p.stdout or p.stderr).strip()[:240] if p.returncode == 0 else "unavailable (exit " + str(p.returncode) + ")"
    except (OSError, subprocess.TimeoutExpired):
        return "unavailable"


def metadata(state: dict, profile: str, risks: list[str], synthetic_auth_clock: str = "native") -> dict:
    return {"utc": utc(), "source": state, "profile": profile, "risks": risks,
            "synthetic_auth_clock": synthetic_auth_clock,
            "environment": {"node": probe(["node", "--version"]), "npm": probe(["npm", "--version"]),
                            "python": platform.python_version(), "os": platform.platform(),
                            "docker_client": probe(["docker", "--version"]),
                            "docker_server": probe(["docker", "info", "--format", "{{.ServerVersion}}"]),
                            "compose": probe(["docker", "compose", "version"]),
                            "package_sha256": sha((SRC / "package.json").read_bytes()),
                            "lock_sha256": sha((SRC / "package-lock.json").read_bytes())}}


def safe_target(path: Path) -> None:
    if path.is_symlink() or any(parent.is_symlink() for parent in path.parents if parent != Path("/")):
        raise ValueError("symlink evidence/log path rejected")


def append_private_release(directory: str, run: dict) -> str:
    target = Path(directory)
    safe_target(target)
    if not target.is_absolute() or not target.resolve().is_relative_to((ROOT / "data").resolve()):
        raise ValueError("private release proof must be below ignored data/")
    target.mkdir(parents=True, mode=0o700, exist_ok=True)
    info = target.stat()
    if info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError("private release proof directory unsafe")
    result = target / (run["id"] + ".json")
    safe_target(result)
    raw = json.dumps(run, ensure_ascii=False, sort_keys=True, indent=2).encode()
    fd = os.open(result, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    try:
        os.write(fd, raw)
        os.fsync(fd)
    finally:
        os.close(fd)
    directory_fd = os.open(target, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
    return str(result)


def append_evidence(issue: str, run: dict, logs: dict[str, str]) -> None:
    for target in (EVIDENCE, LOGS):
        safe_target(target)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    LOGS.mkdir(parents=True, exist_ok=True)
    md = EVIDENCE / (issue + ".md")
    ledger = ROOT / "out" / "FailureLedger.md"
    lock = LOGS / (issue + ".lock")
    json_path = LOGS / (run["id"] + ".json")
    global_lock = LOGS / "failure-ledger.lock"
    for target in (md, ledger, lock, global_lock, json_path):
        safe_target(target)
    with global_lock.open("a+") as ledger_handle, lock.open("a+") as handle:
        fcntl.flock(ledger_handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        raw = json.dumps(run, ensure_ascii=False, indent=2, sort_keys=True).encode()
        digest = sha(raw)
        existing_md = md.read_text() if md.exists() else ""
        existing_ledger = ledger.read_text() if ledger.exists() else ""
        for prior in LOGS.glob("issue-" + issue + "-*.json"):
            safe_target(prior)
            if "<!-- run:" + prior.stem + " -->" not in existing_md:
                raise ValueError("partial prior run evidence requires repair: " + prior.stem)
            prior_record = json.loads(prior.read_text())
            if prior_record.get("status") == "FAIL" and prior.stem not in existing_ledger:
                raise ValueError("partial prior failure ledger requires repair: " + prior.stem)
        if json_path.exists() or ("<!-- run:" + run["id"] + " -->") in existing_md:
            raise ValueError("duplicate or partial run evidence")
        # Exclusive create makes the export immutable. An incomplete append leaves a
        # detectable run ID in JSON and never turns an execution into PASS.
        with json_path.open("xb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        failures = [c for c in run["cases"] if c["required"] and c["status"] in ("FAIL", "NOT RUN")]
        lines = [f"\n<!-- run:{run['id']} -->\n", f"## {run['id']} — {run['status']}\n",
                 f"UTC {run['started']} → {run['ended']} · JSON `{json_path.relative_to(ROOT)}` SHA256 `{digest}`\n",
                 f"Source `{run['start']['source'].get('fingerprint', 'UNAVAILABLE')}` → `{run['end']['source'].get('fingerprint', 'UNAVAILABLE')}`; HEAD `{run['start']['source'].get('head', 'UNAVAILABLE')}`; dirty `{run['start']['source'].get('dirty', 'UNAVAILABLE')}`.\n",
                 f"Profile `{run['start']['profile']}`; risks `{', '.join(run['start']['risks'])}`.\n\n",
                 "<details><summary>Reproduction inputs and environment</summary>\n\n```json\n",
                 json.dumps({"base": run['start']['source'].get('base'), "tree": run['start']['source'].get('tree'),
                             "paths": run['start']['source'].get('paths'), "environment": run['start'].get('environment'),
                             "commands": [{"id": c['id'], "argv": c.get('argv'), "cwd": c.get('cwd'), "why": c.get('why')} for c in run['cases']]},
                            ensure_ascii=False, indent=2), "\n```\n\n</details>\n\n",
                 "| ID | Required | Result | Exit | Reason | Log |\n|---|---|---|---:|---|---|\n"]
        for case in run["cases"]:
            reason = str(case['reason']).replace("|", "\\|").replace("\n", " ")
            lines.append(f"| {case['id']} | {case['required']} | {case['status']} | {case.get('exit_code')} | {reason} | {case.get('log','')} |\n")
        if failures or run["stale"]:
            lines.append("\nFailure cause: UNKNOWN when unresolved. Fix commit: pending + end fingerprint. Additional regression: pending. Linked retest: pending.\n")
        with md.open("a", encoding="utf-8") as stream:
            stream.write("".join(lines))
            stream.flush()
            os.fsync(stream.fileno())
        if failures or run["stale"]:
            with ledger.open("a", encoding="utf-8") as stream:
                for case in failures:
                    stream.write(f"\n- Issue #{issue} · [evidence](IssueEvidence/{issue}.md) · run `{run['id']}` · `{case['id']}` · `{case['status']}` · code `{case.get('exit_code')}` · module `{case['id']}` · cause UNKNOWN · fix pending fingerprint `{run['end']['source']['fingerprint']}` · retest pending.\n")
                if run["stale"]:
                    stream.write(f"\n- Issue #{issue} · [evidence](IssueEvidence/{issue}.md) · run `{run['id']}` · `SOURCE_DRIFT` · FAIL · cause source fingerprint changed during verification · fix pending · retest required.\n")
                stream.flush()
                os.fsync(stream.fileno())


def append_failure_interpretation(issue: str, run_id: str, cause: str, fix: str,
                                  regression: str, retest: str, secrets: list[str]) -> None:
    if not re.fullmatch(r"issue-" + re.escape(issue) + r"-[A-Za-z0-9-]+", run_id):
        raise ValueError("run ID does not match issue")
    source = LOGS / (run_id + ".json")
    md = EVIDENCE / (issue + ".md")
    ledger = ROOT / "out" / "FailureLedger.md"
    lock = LOGS / (issue + ".lock")
    global_lock = LOGS / "failure-ledger.lock"
    for path in (source, md, ledger, lock, global_lock):
        safe_target(path)
    if not source.is_file() or not md.is_file():
        raise ValueError("run evidence missing")
    record = json.loads(source.read_text())
    if record.get("status") != "FAIL" or record.get("issue") != issue:
        raise ValueError("interpretation requires a failed run for this issue")
    fields = [cause, fix, regression, retest]
    if any(not field or len(field) > 500 or "\n" in field for field in fields):
        raise ValueError("cause/fix/regression/retest each require one bounded line")
    fields = [redact(field, secrets).replace("|", "\\|") for field in fields]
    if retest != "pending":
        candidate = LOGS / (retest + ".json")
        safe_target(candidate)
        if not candidate.is_file() or json.loads(candidate.read_text()).get("status") != "PASS":
            raise ValueError("linked retest must be an existing PASS run")
    with global_lock.open("a+") as shared, lock.open("a+") as owned:
        fcntl.flock(shared, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fcntl.flock(owned, fcntl.LOCK_EX | fcntl.LOCK_NB)
        line = f"- {utc()} interpretation of `{run_id}`: cause {fields[0]}; fix {fields[1]}; regression {fields[2]}; retest {fields[3]}.\n"
        with md.open("a", encoding="utf-8") as stream:
            stream.write("\n" + line)
            stream.flush(); os.fsync(stream.fileno())
        with ledger.open("a", encoding="utf-8") as stream:
            stream.write("\n- Issue #" + issue + " · " + line)
            stream.flush(); os.fsync(stream.fileno())


def run_case(item: dict, run_id: str, secrets: list[str], fingerprint: str) -> dict:
    result = {k: item[k] for k in ("id", "argv", "cwd", "required", "why")}
    result["started"] = utc()
    result["exit_code"] = None
    result["status"] = "NOT RUN"
    result["reason"] = "not started"
    if item.get("skip"):
        result["status"] = "SKIP"
        result["reason"] = item["skip"]
    elif item.get("missing"):
        result["reason"] = "missing prerequisite: " + item["missing"]
    else:
        try:
            child_env = {k: v for k, v in os.environ.items()
                         if not SECRET_KEYS.search(k) and not FORBIDDEN_ENV.search(k)
                         and not k.upper().startswith(("AWS_", "G7_", "CAD_"))}
            runtime = LOGS / run_id / "runtime"
            safe_target(runtime)
            runtime.mkdir(parents=True, exist_ok=True)
            child_env.update({"DATABASE_URL": "file:" + str(runtime / "verify.sqlite"),
                              "CAD_STORAGE_PATH": str(runtime / "cad"), "CAD_STORAGE_BACKEND": "local",
                              "CAD_S3_ENDPOINT": "", "CAD_S3_BUCKET": "", "CAD_S3_REGION": "",
                              "CAD_S3_ACCESS_KEY_ID": "", "CAD_S3_SECRET_ACCESS_KEY": "",
                              "CAD_S3_SESSION_TOKEN": "", "CAD_S3_FORCE_PATH_STYLE": "",
                              "CAD_S3_TIMEOUT_MS": ""})
            child_env["VERIFY_LOCAL_SOURCE_FINGERPRINT"] = fingerprint
            child_env["VERIFY_LOCAL_RUN_ID"] = run_id
            p = subprocess.Popen(item["argv"], cwd=ROOT / item["cwd"], stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, text=True, errors="replace", start_new_session=True,
                                 env=child_env)
            try:
                stdout, stderr = p.communicate(timeout=item["timeout_seconds"])
            except subprocess.TimeoutExpired:
                os.killpg(p.pid, signal.SIGTERM)
                try:
                    stdout, stderr = p.communicate(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(p.pid, signal.SIGKILL)
                    stdout, stderr = p.communicate()
                raise subprocess.TimeoutExpired(item["argv"], item["timeout_seconds"], stdout, stderr)
            except KeyboardInterrupt:
                os.killpg(p.pid, signal.SIGTERM)
                try:
                    p.communicate(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(p.pid, signal.SIGKILL)
                    p.communicate()
                result["reason"] = "interrupted; child process group terminated"
                output = "interrupted"
                raise
            result["exit_code"] = p.returncode
            result["status"] = "PASS" if p.returncode == 0 else "FAIL"
            result["reason"] = "exit 0" if p.returncode == 0 else "exit " + str(p.returncode)
            output = stdout + "\n[stderr]\n" + stderr
        except subprocess.TimeoutExpired as exc:
            result["reason"] = "timeout after " + str(item["timeout_seconds"]) + "s"
            output = str(exc.stdout or b"") + "\n" + str(exc.stderr or b"")
        except OSError as exc:
            result["reason"] = "spawn error: " + exc.__class__.__name__
            output = str(exc)
        log_dir = LOGS / run_id
        safe_target(log_dir)
        log_dir.mkdir(parents=True, exist_ok=False) if not log_dir.exists() else None
        log = log_dir / (item["id"] + ".log")
        safe_target(log)
        with log.open("x", encoding="utf-8") as stream:
            stream.write(redact(output, secrets))
        result["log"] = str(log.relative_to(ROOT))
        result["logSha256"] = sha(log.read_bytes())
    result["ended"] = utc()
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Local-only verification and append-only evidence; never publishes")
    parser.add_argument("mode", nargs="?", choices=("plan", "run", "lookup", "annotate"), default="run")
    parser.add_argument("--issue", type=str)
    parser.add_argument("--profile", choices=("docs", "standard", "high-risk", "release"), default="standard")
    parser.add_argument("--base")
    parser.add_argument("--risk", action="append", choices=(*RISK_PATHS, "oci", "unknown"), default=[])
    parser.add_argument("--fixture-check", help="test-only disposable file whose exact contents must be PASS\\n")
    parser.add_argument("--unit", action="append", default=[], help="explicit affected existing tests/integration or tests/unit .test.ts")
    parser.add_argument("--e2e", action="append", default=[], help="explicit affected existing tests/e2e/*.spec.ts")
    parser.add_argument("--docs-review", help="named reviewer plus short policy/content review conclusion")
    parser.add_argument("--recovery-input", help="private #283 locator for independent sealed baseline restore")
    parser.add_argument("--synthetic-auth-clock", choices=("native", "monotonic"), default="native",
                        help="G7 browser only: explicit disposable monotonic clock fixture")
    parser.add_argument("--private-run-dir", help="release-only ignored private evidence directory; no tracked Markdown write")
    parser.add_argument("--query", help="lookup Issue number, module, or error code")
    parser.add_argument("--run-id", help="failed run ID for append-only interpretation")
    parser.add_argument("--cause")
    parser.add_argument("--fix")
    parser.add_argument("--regression")
    parser.add_argument("--retest", default="pending")
    parser.add_argument("--root", help="isolated test fixture repository root")
    args = parser.parse_args()
    if args.private_run_dir and (args.profile != "release" or args.mode != "run"):
        parser.error("--private-run-dir requires release run")
    if args.root:
        global ROOT, SRC, EVIDENCE, LOGS
        ROOT = Path(args.root).resolve(strict=True)
        SRC = ROOT / "src"
        EVIDENCE = ROOT / "out" / "IssueEvidence"
        LOGS = ROOT / "data" / "verify-local"
        if not (SRC / "package.json").is_file() or not (SRC / "package-lock.json").is_file():
            parser.error("--root requires a local fixture with src/package.json and lockfile")
    if args.mode == "lookup":
        if not args.query or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,80}", args.query):
            parser.error("lookup requires safe --query")
        for path in [ROOT / "out" / "FailureLedger.md", *sorted(EVIDENCE.glob("*.md"))]:
            safe_target(path)
            if path.exists():
                for line in path.read_text().splitlines():
                    if args.query.casefold() in line.casefold():
                        print(redact(f"{path.relative_to(ROOT)}: {line[:400]}", secret_values()))
        return 0
    if args.mode == "annotate":
        if not args.issue or not re.fullmatch(r"[1-9][0-9]{0,7}", args.issue):
            parser.error("annotate requires --issue N")
        try:
            append_failure_interpretation(args.issue, args.run_id or "", args.cause or "",
                                          args.fix or "", args.regression or "", args.retest, secret_values())
            print("append-only interpretation recorded")
            return 0
        except (ValueError, OSError, json.JSONDecodeError) as exc:
            print("verify:local annotate: " + redact(str(exc), secret_values()), file=sys.stderr)
            return 2
    if not args.issue or not re.fullmatch(r"[1-9][0-9]{0,7}", args.issue) or not args.base:
        parser.error("plan/run require --issue N --base COMMIT_SHA")
    run_id = "issue-" + args.issue + "-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:12]
    started = utc()
    start_state = None
    start = None
    risks = []
    items = []
    cases = []
    secrets = secret_values()
    try:
        start_state = source_state(args.base)
        risks, reason = infer_risks(start_state["paths"], args.risk, args.profile)
        for choice, prefix, suffix in ((args.unit, "tests/", ".test.ts"), (args.e2e, "tests/e2e/", ".spec.ts")):
            for rel in choice:
                if not rel.startswith(prefix) or (choice is args.unit and not rel.startswith(("tests/unit/", "tests/integration/"))) or not rel.endswith(suffix) or not re.fullmatch(r"[A-Za-z0-9_./-]+", rel) or ".." in Path(rel).parts or not (SRC / rel).is_file():
                    raise ValueError("selected test must be an existing bounded in-repo test: " + rel)
        items = manifest(args.profile, risks, start_state["paths"], args.fixture_check, args.unit, args.e2e,
                         args.docs_review, args.recovery_input, args.synthetic_auth_clock)
        if not items:
            raise ValueError("no required gates selected")
        if args.mode == "plan":
            print(json.dumps({"source": start_state, "profile": args.profile, "risks": risks,
                              "synthetic_auth_clock": args.synthetic_auth_clock,
                              "selection_reason": reason, "cases": items}, indent=2))
            return 0
        start = metadata(start_state, args.profile, risks, args.synthetic_auth_clock)
        stopped = False
        for item in items:
            if stopped:
                cases.append({**{k: item[k] for k in ("id", "argv", "cwd", "required", "why")},
                              "started": None, "ended": None, "exit_code": None,
                              "status": "NOT RUN", "reason": "blocked by prior mandatory gate"})
                continue
            case = run_case(item, run_id, secrets, start_state["fingerprint"])
            cases.append(case)
            if case["required"] and case["status"] != "PASS":
                stopped = True
        try:
            end_state = source_state(args.base)
            end = metadata(end_state, args.profile, risks, args.synthetic_auth_clock)
            stale = any(start_state[key] != end_state[key] for key in ("fingerprint", "head", "tree"))
        except (ValueError, OSError, subprocess.TimeoutExpired) as exc:
            end = {"source": {"fingerprint": "UNAVAILABLE", "head": "UNAVAILABLE", "tree": "UNAVAILABLE"},
                   "environment": {}, "error": redact(str(exc), secrets)}
            stale = True
            cases.append({"id": "source-end-identity", "argv": [], "cwd": ".", "required": True,
                          "why": "exact post-run source identity", "started": None, "ended": utc(),
                          "exit_code": None, "status": "NOT RUN", "reason": "post-run source read failed"})
        status = "PASS" if not stale and any(c["required"] and c["status"] == "PASS" for c in cases) and all(c["status"] == "PASS" for c in cases if c["required"]) else "FAIL"
        run = {"id": run_id, "issue": args.issue, "started": started, "ended": utc(), "start": start,
               "end": end, "stale": stale, "status": status, "cases": cases}
        if args.private_run_dir:
            evidence = append_private_release(args.private_run_dir, redact_object(run, secrets))
        else:
            append_evidence(args.issue, redact_object(run, secrets), {})
            evidence = f"out/IssueEvidence/{args.issue}.md"
        print(json.dumps({"run": run_id, "status": status, "stale": stale,
                          "evidence": evidence}))
        return 0 if status == "PASS" else 1
    except (ValueError, OSError, subprocess.TimeoutExpired, KeyboardInterrupt) as exc:
        message = redact(str(exc) or exc.__class__.__name__, secrets)
        if args.mode == "run":
            try:
                if not start:
                    start = {"source": start_state or {}, "profile": args.profile, "risks": risks, "environment": {}}
                planned = {c["id"] for c in cases}
                for item in items:
                    if item["id"] not in planned:
                        cases.append({**{k: item[k] for k in ("id", "argv", "cwd", "required", "why")},
                                      "started": None, "ended": None, "exit_code": None, "status": "NOT RUN",
                                      "reason": "verification interrupted before gate"})
                cases.append({"id": "planning-or-evidence", "argv": [], "cwd": ".", "required": True,
                              "why": "fail-closed planning and evidence", "started": None, "ended": utc(),
                              "exit_code": None, "status": "NOT RUN", "reason": message})
                run = {"id": run_id, "issue": args.issue, "started": started, "ended": utc(),
                       "start": start, "end": {"source": {"fingerprint": "UNAVAILABLE"}},
                       "stale": True, "status": "FAIL", "cases": cases}
                if args.private_run_dir:
                    append_private_release(args.private_run_dir, redact_object(run, secrets))
                else:
                    append_evidence(args.issue, redact_object(run, secrets), {})
            except (ValueError, OSError) as write_error:
                print("verify:local: evidence write failed: " + redact(str(write_error), secrets), file=sys.stderr)
                return 2
        print("verify:local: " + message, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
