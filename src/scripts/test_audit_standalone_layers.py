#!/usr/bin/env python3
"""Layer archive analyzer regressions without a Docker daemon."""
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from audit_standalone_layers import inventory, compare_inventories

NATIVE = "app/src/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
JS = "app/src/node_modules/better-sqlite3/lib/database.js"


def make_archive(path, files_by_layer):
    with tarfile.open(path, "w") as outer:
        for i, files in enumerate(files_by_layer):
            buf = io.BytesIO()
            with tarfile.open(fileobj=buf, mode="w") as layer:
                for name, content in files.items():
                    info = tarfile.TarInfo("./" + name)
                    info.size = len(content)
                    layer.addfile(info, io.BytesIO(content))
            data = buf.getvalue()
            info = tarfile.TarInfo(f"{i}/layer.tar")
            info.size = len(data)
            outer.addfile(info, io.BytesIO(data))
        data = json.dumps([{"Layers": [f"{i}/layer.tar" for i in range(len(files_by_layer))]}]).encode()
        info = tarfile.TarInfo("manifest.json")
        info.size = len(data)
        outer.addfile(info, io.BytesIO(data))


class TestAudit(unittest.TestCase):
    def test_duplicate_copy_with_identical_sha_and_single_optimized_copy(self):
        package = {NATIVE: b"native", JS: b"module"}
        with tempfile.TemporaryDirectory() as tmp:
            base, optimized = Path(tmp) / "base.tar", Path(tmp) / "new.tar"
            make_archive(base, [package, package])
            make_archive(optimized, [package])
            a, a_count = inventory(base)
            b, b_count = inventory(optimized)
            duplicates, wasted = compare_inventories(a, b)
            self.assertEqual((a_count, b_count), (2, 1))
            self.assertEqual(len(duplicates), 2)
            self.assertEqual(wasted, len(b"native") + len(b"module"))

    def test_reject_missing_native(self):
        with self.assertRaisesRegex(ValueError, "paths or SHA256 changed"):
            compare_inventories({NATIVE: [(1, 1, "a")]}, {JS: [(1, 1, "b")]})

    def test_reject_baseline_not_identical(self):
        with self.assertRaisesRegex(ValueError, "Nonidentical"):
            compare_inventories({NATIVE: [(1, 1, "a"), (2, 1, "b")]},
                                {NATIVE: [(1, 1, "b")]})

    def test_reject_false_duplicate_claim(self):
        with self.assertRaisesRegex(ValueError, "no duplicate"):
            compare_inventories({NATIVE: [(1, 1, "a")]}, {NATIVE: [(1, 1, "a")]})

    def test_reject_remaining_optimized_duplication(self):
        with self.assertRaisesRegex(ValueError, "still duplicates"):
            compare_inventories({NATIVE: [(1, 1, "a"), (2, 1, "a")]},
                                {NATIVE: [(1, 1, "a"), (2, 1, "a")]})


if __name__ == "__main__":
    unittest.main(verbosity=2)
