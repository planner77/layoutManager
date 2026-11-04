#!/usr/bin/env python3
"""#229 persistent GHCR hold after B2-B Main code integration.

No commit-subject exception and no unsupported 2-image release for >=0.61.0.
A separate reviewed release PR must implement approved App/Migrator/CPU Worker
image verification before changing this policy.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

MIN_GATED_VERSION = (0, 61, 0)
SEMVER = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\Z")
TAG = re.compile(r"refs/tags/v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\Z")


class ReleaseHoldError(ValueError):
    pass


def version(value: object) -> tuple[int, int, int]:
    if not isinstance(value, str):
        raise ReleaseHoldError("G7_RELEASE_HOLD_VERSION_INVALID")
    match = SEMVER.fullmatch(value)
    if match is None:
        raise ReleaseHoldError("G7_RELEASE_HOLD_VERSION_INVALID")
    parts = tuple(int(part) for part in match.groups())
    if any(part > 2**31 - 1 for part in parts):
        raise ReleaseHoldError("G7_RELEASE_HOLD_VERSION_INVALID")
    return parts


def decide(ref: str, package_version: str) -> str:
    candidate = version(package_version)
    if ref != "refs/heads/main" and TAG.fullmatch(ref) is None:
        raise ReleaseHoldError("G7_RELEASE_HOLD_REF_INVALID")
    if candidate >= MIN_GATED_VERSION:
        if ref == "refs/heads/main":
            return "HOLD_MAIN"
        # A tag must not bypass the hold via its name or commit subject.
        raise ReleaseHoldError("G7_RELEASE_HOLD_TAG_BLOCKED")
    # Earlier versions keep their existing, separate approval/tag/digest checks.
    return "ALLOW_LEGACY"


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("G7_RELEASE_HOLD_ARGUMENT_INVALID", file=sys.stderr)
        return 2
    try:
        data = json.loads(Path(argv[2]).read_text(encoding="utf-8"))
        if not isinstance(data, dict) or not isinstance(data.get("version"), str):
            raise ReleaseHoldError("G7_RELEASE_HOLD_PACKAGE_INVALID")
        result = decide(argv[1], data["version"])
    except (OSError, UnicodeError, json.JSONDecodeError):
        print("G7_RELEASE_HOLD_PACKAGE_INVALID", file=sys.stderr)
        return 1
    except ReleaseHoldError as error:
        print(str(error), file=sys.stderr)
        return 1
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
