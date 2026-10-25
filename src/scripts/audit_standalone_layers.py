#!/usr/bin/env python3
"""Inspect real local Docker layer TAR contents for Issue #67 (not GHCR OCI sizes)."""
from collections import defaultdict
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import tarfile
import tempfile

PREFIX = "app/src/node_modules/better-sqlite3/"


def inventory(archive):
    found = defaultdict(list)
    with tarfile.open(archive, "r:") as docker:
        entry = docker.extractfile("manifest.json")
        if entry is None:
            raise ValueError("Missing Docker manifest.json")
        manifest = json.load(entry)
        if len(manifest) != 1 or not manifest[0].get("Layers"):
            raise ValueError("Expected exactly one image with layers")
        layers = manifest[0]["Layers"]
        for ordinal, layer_name in enumerate(layers, 1):
            stream = docker.extractfile(layer_name)
            if stream is None:
                raise ValueError("Layer missing: " + layer_name)
            with tarfile.open(fileobj=stream, mode="r|") as layer:
                for item in layer:
                    name = item.name
                    while name.startswith("./"):
                        name = name[2:]
                    name = name.lstrip("/")
                    if not item.isfile() or not name.startswith(PREFIX):
                        continue
                    source = layer.extractfile(item)
                    if source is None:
                        raise ValueError("Unreadable layer file: " + name)
                    digest = hashlib.sha256()
                    for chunk in iter(lambda: source.read(1024 * 1024), b""):
                        digest.update(chunk)
                    found[name].append((ordinal, item.size, digest.hexdigest()))
    return dict(found), len(layers)


def compare_inventories(before, after):
    if not before or not after:
        raise ValueError("Missing better-sqlite3 package in web runtime")
    previous = {name: rows[-1][2] for name, rows in before.items()}
    current = {name: rows[-1][2] for name, rows in after.items()}
    if previous != current:
        raise ValueError("Final better-sqlite3 file paths or SHA256 changed")
    if not any(name.endswith(".node") for name in after):
        raise ValueError("Native .node binding absent")
    duplicates = {name: rows for name, rows in before.items() if len(rows) > 1}
    # Subsequent PRs can legitimately use an already-deduplicated main.
    # Always enforce identical package file hashes and no optimized duplicate,
    # but require baseline duplication only when measuring the transition.
    for name, rows in duplicates.items():
        if len({row[2] for row in rows}) != 1:
            raise ValueError("Nonidentical baseline layer writes: " + name)
    if any(len(rows) != 1 for rows in after.values()):
        raise ValueError("Optimized image still duplicates package files")
    wasted = sum(sum(size for _, size, _ in rows[1:]) for rows in duplicates.values())
    return duplicates, wasted


def validate_image_size(baseline_bytes, optimized_bytes, transition):
    """Require positive saving only for a real duplicate-layer transition."""
    if baseline_bytes <= 0 or optimized_bytes <= 0:
        raise ValueError("Invalid image size")
    if transition and baseline_bytes <= optimized_bytes:
        raise ValueError("Deduplication transition did not reduce uncompressed image size")


def inspect(image):
    data = json.loads(subprocess.check_output(["docker", "image", "inspect", image], text=True))
    if len(data) != 1 or (data[0]["Os"], data[0]["Architecture"]) != ("linux", "amd64"):
        raise ValueError("Unexpected image count/platform for " + image)
    return data[0]


def save_and_inventory(image, dest):
    subprocess.run(["docker", "save", "--output", str(dest), image], check=True)
    found = inventory(dest)
    dest.unlink()
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline")
    parser.add_argument("optimized")
    parser.add_argument("summary", nargs="?")
    args = parser.parse_args()
    old, new = inspect(args.baseline), inspect(args.optimized)
    with tempfile.TemporaryDirectory(prefix="issue67-layers-") as tmp:
        before, before_count = save_and_inventory(args.baseline, Path(tmp) / "before.tar")
        after, after_count = save_and_inventory(args.optimized, Path(tmp) / "after.tar")
    duplicates, wasted = compare_inventories(before, after)
    base_size, size = int(old["Size"]), int(new["Size"])
    transition = bool(duplicates)
    validate_image_size(base_size, size, transition)
    diffids = old["RootFS"]["Layers"]
    if len(diffids) != before_count or len(new["RootFS"]["Layers"]) != after_count:
        raise ValueError("Docker archive layer order differs from inspect diffIDs")
    report = [
        "## Issue #67 — Measured local web runtime layer deduplication (linux/amd64)",
        "",
        "| Metric | Same-source base Dockerfile | Optimized runtime |",
        "| --- | ---: | ---: |",
        f"| docker image inspect .Size (uncompressed bytes) | {base_size} | {size} |",
        f"| Local layer count | {before_count} | {after_count} |",
        f"| Final better-sqlite3 regular files | {len(before)} | {len(after)} |",
        f"| Repeated package paths in layer TARs | {len(duplicates)} | 0 |",
        "",
        f"- Baseline duplicate present: {'YES (deduplication transition)' if transition else 'NO (already deduplicated)'}.",
        f"- Local uncompressed delta (baseline minus current): {base_size - size} bytes ({(base_size-size)/base_size*100:.2f}%); {'positive saving REQUIRED' if transition else 'size delta INFORMATIONAL'}.",
        f"- Identical package bytes written AGAIN in baseline layers: {wasted} raw bytes (not GHCR compressed savings).",
        "- All final package file paths and SHA256 values match, including a native .node binding.",
        "- Source: actual docker-save TAR layer members and docker inspect RootFS diffIDs.",
        "",
        "| Duplicate file (top 12 extra raw bytes) | SHA256 prefix | Layer ordinals / diffID prefix | Extra bytes |",
        "| --- | --- | --- | ---: |",
    ]
    for name, rows in sorted(duplicates.items(),
                             key=lambda pair: sum(row[1] for row in pair[1][1:]),
                             reverse=True)[:12]:
        locations = ", ".join(f"{ordinal}/{diffids[ordinal-1][7:19]}" for ordinal, _, _ in rows)
        report.append(f"| {name} | {rows[-1][2][:16]} | {locations} | {sum(row[1] for row in rows[1:])} |")
    report += [
        "",
        "- Local Docker-exported uncompressed layer TARs are not OCI compressed GHCR layers.",
        "- Immutable version/digest linux/amd64 OCI layer size is measured after publication; exclude attestations/index/config.",
        "",
    ]
    rendered = "\n".join(report)
    print(rendered)
    if args.summary:
        with open(args.summary, "a", encoding="utf-8") as stream:
            stream.write(rendered + "\n")


if __name__ == "__main__":
    main()
