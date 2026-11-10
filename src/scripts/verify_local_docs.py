#!/usr/bin/env python3
"""Bounded local Markdown link and policy check for changed files."""
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
bad = []
for name in sys.argv[1:]:
    path = (Path.cwd() / name).resolve()
    if not path.is_relative_to(root):
        bad.append(f"outside repository: {name}")
        continue
    if not path.is_file():
        bad.append(f"missing Markdown: {name}")
        continue
    text = path.read_text(encoding="utf-8")
    if not text.strip():
        bad.append(f"empty Markdown: {name}")
    for target in re.findall(r"(?<!!)\[[^\]]+\]\(([^)]+)\)", text):
        target = target.split("#", 1)[0].strip("<>")
        if not target or "://" in target or target.startswith(("mailto:", "#")):
            continue
        dest = (root / target.lstrip("/")) if target.startswith("/") else (path.parent / target)
        if not dest.resolve().is_relative_to(root) or not dest.exists():
            bad.append(f"broken local link in {name}: {target}")
if bad:
    print("\n".join(bad), file=sys.stderr)
    raise SystemExit(1)
print(f"checked {len(sys.argv) - 1} changed Markdown files; policy text requires reviewer signoff in run evidence")
