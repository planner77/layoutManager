#!/usr/bin/env python3
"""Disposable acceptance fixture: intentionally broken first, fixed later."""
from pathlib import Path
import sys

path = Path(sys.argv[1]).resolve()
if not path.is_relative_to(Path.cwd().parent.resolve()):
    sys.exit("fixture must be inside repository")
if path.read_bytes() != b"PASS\n":
    sys.exit("fixture is not PASS\\n")
print("fixture PASS")
