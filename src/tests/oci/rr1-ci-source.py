#!/usr/bin/env python3
"""Prepare one exact Git archive for the required Docker job's three builds.

The receipt records local CI build inputs and observed image IDs. It is not a
signed provenance statement; the registry proof verifies distribution bytes.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile


ROOT = Path(__file__).resolve().parents[3]
ROLES = {"app": ("runtime", "cad-layout-viewer:ci"),
         "migrator": ("migrator", "cad-layout-viewer:ci-migrate"),
         "cpu-worker": ("cpu-worker", "cad-layout-viewer:ci-cpu-worker")}


def require(value, code):
    if not value:
        raise RuntimeError(code)


def run(*args):
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True,
                            timeout=30, check=False)
    require(result.returncode == 0, "RR1_CI_COMMAND_FAILED")
    return result.stdout.strip()


def digest_file(path):
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest()


def file_from_commit(sha, name):
    result = subprocess.run(["git", "show", sha + ":" + name], cwd=ROOT,
                            capture_output=True, timeout=30, check=False)
    require(result.returncode == 0, "RR1_CI_GIT_OBJECT_MISSING")
    return hashlib.sha256(result.stdout).hexdigest()


def prepare(out_dir):
    require(os.environ.get("GITHUB_ACTIONS") == "true", "RR1_CI_ONLY")
    sha = os.environ.get("GITHUB_SHA", "")
    require(re.fullmatch(r"[0-9a-f]{40}", sha) and run("git", "rev-parse", "HEAD") == sha,
            "RR1_CI_SOURCE_MISMATCH")
    require(not out_dir.exists(), "RR1_CI_OUTPUT_EXISTS")
    out_dir.mkdir(mode=0o700, parents=True)
    archive = out_dir / "source.tar"
    with archive.open("wb") as stream:
        result = subprocess.run(["git", "archive", "--format=tar", sha], cwd=ROOT,
                                stdout=stream, stderr=subprocess.DEVNULL,
                                timeout=60, check=False)
    require(result.returncode == 0, "RR1_CI_ARCHIVE_FAILED")
    context = out_dir / "source"
    context.mkdir(mode=0o700)
    with tarfile.open(archive, "r") as stream:
        stream.extractall(context, filter="data")
    require((context / "src/Dockerfile").is_file() and
            (context / "src/package-lock.json").is_file(),
            "RR1_CI_CONTEXT_INCOMPLETE")
    version = json.loads((context / "src/package.json").read_text())["version"]
    receipt = {
        "sourceMode": "CI_GIT_ARCHIVE", "sourceCommit": sha,
        "sourceTree": run("git", "rev-parse", "HEAD^{tree}"),
        "sourceArchive": str(archive), "archiveSha256": digest_file(archive),
        "context": str(context), "version": version,
        "dockerfileSha256": file_from_commit(sha, "src/Dockerfile"),
        "packageLockSha256": file_from_commit(sha, "src/package-lock.json"),
    }
    (out_dir / "prepare.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print("RR1_CI_ARCHIVE_READY source=" + sha + " tree=" + receipt["sourceTree"])


def finish(out_dir):
    require(os.environ.get("GITHUB_ACTIONS") == "true", "RR1_CI_ONLY")
    prepared = json.loads((out_dir / "prepare.json").read_text())
    require(prepared["sourceCommit"] == os.environ.get("GITHUB_SHA") and
            digest_file(Path(prepared["sourceArchive"])) == prepared["archiveSha256"],
            "RR1_CI_ARCHIVE_CHANGED")
    full = {key: prepared[key] for key in ("sourceMode", "sourceCommit", "sourceTree",
                                         "archiveSha256", "sourceArchive", "context", "version")}
    full["images"] = []
    images = {}
    for role, (target, tag) in ROLES.items():
        rows = json.loads(run("docker", "image", "inspect", tag))
        require(len(rows) == 1, "RR1_CI_IMAGE_MISSING")
        image = rows[0]
        labels = image.get("Config", {}).get("Labels") or {}
        require(image.get("Os") == "linux" and image.get("Architecture") == "amd64" and
                labels.get("com.planner77.g7.image-role") == role and
                labels.get("org.opencontainers.image.revision") == prepared["sourceCommit"] and
                labels.get("org.opencontainers.image.version") == prepared["version"] and
                labels.get("org.opencontainers.image.source") ==
                "https://github.com/planner77/layoutManager",
                "RR1_CI_IMAGE_METADATA_MISMATCH")
        images[role] = {"tag": tag, "id": image["Id"]}
        full["images"].append({
            "role": role, "target": target, "tag": tag, "imageId": image["Id"],
            "command": ["docker/build-push-action@v7", "context=" + prepared["context"],
                        "file=" + prepared["context"] + "/src/Dockerfile", "target=" + target,
                        "platform=linux/amd64", "load=true", "tag=" + tag],
        })
    full_path = out_dir / "rr1-clean-build-receipt.json"
    full_path.write_text(json.dumps(full, indent=2) + "\n")
    proof_input = {
        "sourceMode": "CI_GIT_ARCHIVE", "sourceCommit": prepared["sourceCommit"],
        "sourceTree": prepared["sourceTree"], "version": prepared["version"],
        "sourceArchive": prepared["sourceArchive"],
        "sourceArchiveSha256": prepared["archiveSha256"],
        "dockerfileSha256": prepared["dockerfileSha256"],
        "packageLockSha256": prepared["packageLockSha256"],
        "cleanBuildReceiptSha256": digest_file(full_path), "images": images,
    }
    (out_dir / "rr1-input.json").write_text(json.dumps(proof_input, indent=2) + "\n")
    print("RR1_CI_BUILD_RECEIPT_READY roles=3 source=" + prepared["sourceCommit"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare", "finish"))
    parser.add_argument("--out-dir", required=True, type=Path)
    args = parser.parse_args()
    try:
        (prepare if args.action == "prepare" else finish)(args.out_dir)
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        print("RR1_CI_RECEIPT_FAILED " +
              (str(error) if isinstance(error, RuntimeError) else "INVALID_INPUT"),
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
