#!/usr/bin/env python3
"""Local toolchain/lockfile prerequisite; no package installation."""
import json
from pathlib import Path
import subprocess
import sys

src = Path(__file__).resolve().parents[1]
package = json.loads((src / "package.json").read_text())
lock = json.loads((src / "package-lock.json").read_text())
if package["name"] != lock["name"] or package["version"] != lock["version"]:
    sys.exit("package and lockfile identity differs")
root_entry = lock.get("packages", {}).get("", {})
for field in ("dependencies", "devDependencies", "engines"):
    if package.get(field, {}) != root_entry.get(field, {}):
        sys.exit("package and lockfile " + field + " differs")
node = subprocess.check_output(["node", "--version"], text=True).strip()
major, minor, *_ = map(int, node[1:].split("."))
if (major, minor) < (22, 14) or major >= 23:
    sys.exit("Node 22.14.x or later in major 22 required")
if not (src / "node_modules" / ".bin" / "vitest").exists():
    sys.exit("local dependencies missing: run npm ci")
print("Node", node, "package/lock identity and local dependencies OK")
