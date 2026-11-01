#!/usr/bin/env python3
"""Fail-closed PR scope: docs-only CI and expensive Docker baseline selection.

The full browser/native Docker smoke remains required for EVERY non-doc PR.
A manual dispatch always executes the full suite and baseline comparison.
"""
from __future__ import annotations

import sys
from pathlib import Path

BASELINE_FILES = frozenset({
    ".github/workflows/pr-ci.yml",
    ".dockerignore",
    "src/.dockerignore",
    "src/Dockerfile",
    "src/next.config.ts",
    "src/package.json",
    "src/package-lock.json",
    "src/scripts/audit_standalone_layers.py",
    "src/scripts/measure-images.sh",
    "src/scripts/measure-migrator.sh",
    "src/scripts/prepare-migrator-package.mjs",
    "src/scripts/standalone.mjs",
})


def parse_paths(raw: bytes) -> list[str]:
    if not raw or not raw.endswith(b"\0"):
        raise ValueError("No complete NUL-delimited Git diff; refusing docs-only scope")
    try:
        paths = [path.decode("utf-8", errors="strict") for path in raw[:-1].split(b"\0")]
    except UnicodeDecodeError as error:
        raise ValueError("Invalid Git diff path encoding") from error
    if not paths or any(not p or p.startswith("/") or "\\" in p or ".." in p.split("/") for p in paths):
        raise ValueError("Unsafe or empty Git diff path")
    return paths


def classify(paths: list[str], manual: bool = False) -> tuple[bool, bool]:
    """Return (full_ci, measure_baseline). Never skip on empty/unknown paths."""
    if manual:
        return True, True
    if not paths:
        raise ValueError("Empty changed-path set: fail closed")
    docs_only = all(path.endswith(".md") for path in paths)
    baseline = any(path in BASELINE_FILES for path in paths)
    return not docs_only, baseline


def main() -> int:
    if len(sys.argv) != 4 or sys.argv[1] not in {"pr", "manual"}:
        print("Usage: pr_ci_scope.py pr|manual changed-paths.nul GITHUB_OUTPUT", file=sys.stderr)
        return 2
    mode, changed_file, output_file = sys.argv[1:]
    try:
        paths = [] if mode == "manual" else parse_paths(Path(changed_file).read_bytes())
        full, baseline = classify(paths, manual=mode == "manual")
    except (OSError, ValueError) as error:
        print(f"Scope classification failed closed: {error}", file=sys.stderr)
        return 1
    Path(output_file).open("a", encoding="utf-8").write(
        f"full={'true' if full else 'false'}\n"
        f"baseline={'true' if baseline else 'false'}\n"
    )
    print(f"PR CI scope: full={full}, docker_baseline={baseline}, changed={len(paths)}")
    if not full:
        print("Documentation-only PR: application tests intentionally delegated to required final gate.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
