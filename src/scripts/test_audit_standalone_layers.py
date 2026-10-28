#!/usr/bin/env python3
"""Layer archive analyzer regressions without a Docker daemon."""
import io
import gzip
import json
import sys
from pathlib import Path
import tarfile
import tempfile
import unittest
from audit_standalone_layers import inventory, compare_inventories, validate_image_size

NATIVE = "app/src/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
JS = "app/src/node_modules/better-sqlite3/lib/database.js"


def make_archive(path, files_by_layer, *, compression=None, override_first_layer=None):
    with tarfile.open(path, "w") as outer:
        for i, files in enumerate(files_by_layer):
            buf = io.BytesIO()
            mode = "w:" + compression if compression else "w"
            with tarfile.open(fileobj=buf, mode=mode) as layer:
                for name, content in files.items():
                    info = tarfile.TarInfo("./" + name)
                    info.size = len(content)
                    layer.addfile(info, io.BytesIO(content))
            data = (override_first_layer if i == 0 and override_first_layer is not None
                    else buf.getvalue())
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

    def test_compressed_inner_layers_are_fully_audited(self):
        # A docker-save outer TAR may have compressed inner layer.tar entries.
        package = {NATIVE: b"native", JS: b"module"}
        for compression in ("gz", "bz2", "xz"):
            with self.subTest(compression=compression), tempfile.TemporaryDirectory() as tmp:
                before, after = Path(tmp) / "before.tar", Path(tmp) / "after.tar"
                make_archive(before, [package, package], compression=compression)
                make_archive(after, [package], compression=compression)
                a, before_layers = inventory(before)
                b, after_layers = inventory(after)
                duplicates, wasted = compare_inventories(a, b)
                self.assertEqual((before_layers, after_layers), (2, 1))
                self.assertEqual(set(a), {NATIVE, JS})
                self.assertEqual(len(duplicates), 2)
                self.assertEqual(wasted, len(b"native") + len(b"module"))

    @unittest.skipUnless(sys.version_info >= (3, 14), "Zstandard TAR requires Python 3.14")
    def test_zstandard_inner_layer_when_python_supports_it(self):
        try:
            from compression import zstd  # noqa: F401 (Python 3.14+)
        except ImportError:
            self.skipTest("Python installation has no compression.zstd")
        package = {NATIVE: b"native", JS: b"module"}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "zstd-save.tar"
            make_archive(path, [package], compression="zst")
            found, layers = inventory(path)
            self.assertEqual((layers, set(found)), (1, {NATIVE, JS}))

    def test_corrupt_inner_layer_remains_blocked(self):
        # A failed TAR parse must never be silently omitted from the inventory.
        for invalid in (b"NOT_A_TAR", gzip.compress(b"NOT_A_TAR")):
            with self.subTest(kind=invalid[:4]), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "bad-save.tar"
                make_archive(path, [{NATIVE: b"native"}], override_first_layer=invalid)
                with self.assertRaises((tarfile.TarError, EOFError, OSError)):
                    inventory(path)

    def test_reject_missing_native(self):
        with self.assertRaisesRegex(ValueError, "paths or SHA256 changed"):
            compare_inventories({NATIVE: [(1, 1, "a")]}, {JS: [(1, 1, "b")]})

    def test_reject_baseline_not_identical(self):
        with self.assertRaisesRegex(ValueError, "Nonidentical"):
            compare_inventories({NATIVE: [(1, 1, "a"), (2, 1, "b")]},
                                {NATIVE: [(1, 1, "b")]})

    def test_accept_already_deduplicated_baseline(self):
        duplicates, wasted = compare_inventories(
            {NATIVE: [(1, 1, "a")], JS: [(1, 1, "b")]},
            {NATIVE: [(1, 1, "a")], JS: [(1, 1, "b")]},
        )
        self.assertEqual(duplicates, {})
        self.assertEqual(wasted, 0)

    def test_reject_duplicate_reintroduced_after_deduplicated_baseline(self):
        with self.assertRaisesRegex(ValueError, "still duplicates"):
            compare_inventories(
                {NATIVE: [(1, 1, "a")]},
                {NATIVE: [(1, 1, "a"), (2, 1, "a")]},
            )

    def test_equal_size_is_valid_if_baseline_was_already_deduplicated(self):
        validate_image_size(364008031, 364008031, False)

    def test_transition_requires_positive_size_saving(self):
        with self.assertRaisesRegex(ValueError, "did not reduce"):
            validate_image_size(364008031, 364008031, True)

    def test_reject_remaining_optimized_duplication(self):
        with self.assertRaisesRegex(ValueError, "still duplicates"):
            compare_inventories({NATIVE: [(1, 1, "a"), (2, 1, "a")]},
                                {NATIVE: [(1, 1, "a"), (2, 1, "a")]})


if __name__ == "__main__":
    unittest.main(verbosity=2)
