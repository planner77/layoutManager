#!/usr/bin/env python3
"""Actual disposable Docker timeout/owned-child cleanup probe for RX-10."""
import importlib.util
import argparse
import json
from pathlib import Path
import re
import secrets
import sys

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location("rr2_proof", Path(__file__).with_name("rr2-recovery-proof.py"))
PROOF = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROOF)

def cleanup(receipt):
    nonce = receipt['nonce']
    root = Path(receipt['root'])
    volume = receipt['liveVolume']
    PROOF.check(re.fullmatch(r'[0-9a-f]{16}', nonce) and
                root.resolve() == (ROOT / 'data/release-proof' /
                                   ('rr2-timeout-' + nonce)).resolve() and
                volume == 'layoutmanager-rr2-timeout-' + nonce,
                'RR2_TIMEOUT_RECEIPT_INVALID')
    PROOF.cleanup_owned_children(receipt)
    item = PROOF.optional_docker('volume', volume)
    if item is not None:
        labels = item.get('Labels') or {}
        PROOF.check(labels.get('com.planner77.purpose') == PROOF.PURPOSE and
                    labels.get('com.planner77.rr2.nonce') == nonce,
                    'RR2_TIMEOUT_VOLUME_NOT_OWNED')
        PROOF.run(['docker', 'volume', 'rm', volume], timeout=30)
    PROOF.check(PROOF.optional_docker('volume', volume) is None and
                all(PROOF.optional_docker('container', row['name']) is None
                    for row in receipt.get('children', []) + receipt.get('hostChildren', [])),
                'RR2_TIMEOUT_CLEANUP_INCOMPLETE')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cleanup-receipt', type=Path)
    parser.add_argument('--triplet-receipt', type=Path,
                        default=ROOT / 'data/release-proof/rr1-registry-receipt.json')
    parser.add_argument('--host-helper', action='store_true')
    options = parser.parse_args()
    if options.cleanup_receipt:
        receipt = json.loads(options.cleanup_receipt.read_text())
        PROOF.check(options.cleanup_receipt.resolve() ==
                    (Path(receipt['root']) / 'receipt.json').resolve(),
                    'RR2_TIMEOUT_RECEIPT_PATH_INVALID')
        cleanup(receipt)
        print('RR2_TIMEOUT_OWNED_RESOURCES_REMOVED')
        return 0
    nonce = secrets.token_hex(8)
    root = ROOT / 'data/release-proof' / ('rr2-timeout-' + nonce)
    root.mkdir(mode=0o700, parents=True)
    volume = "layoutmanager-rr2-timeout-" + nonce
    image = json.loads(options.triplet_receipt.read_text())["refs"]["cpu-worker"]
    receipt = {"root": str(root), "nonce": nonce, "liveVolume": volume,
               "restoreVolume": "layoutmanager-rr2-unused-" + nonce,
               "images": {"old": {}, "new": {"cpu-worker": image}},
               "children": [], "hostChildren": []}
    result = {"kind": ("RR2_ACTUAL_HOST_TIMEOUT_CLEANUP" if options.host_helper else
                       "RR2_ACTUAL_TIMEOUT_CLEANUP"), "nonce": nonce,
              "timeoutVerdict": "NOT_RUN", "childObserved": False,
              "groupStopped": None, "cleanup": "PENDING", "journeyPass": False}
    PROOF.check(PROOF.optional_docker('volume', volume) is None,
                'RR2_TIMEOUT_VOLUME_EXISTS')
    PROOF.save_receipt(receipt)
    try:
        PROOF.run(["docker", "volume", "create", "--label", "com.planner77.purpose=" + PROOF.PURPOSE,
                   "--label", "com.planner77.rr2.nonce=" + nonce, volume], timeout=30)
        try:
            docker_args = ["docker", "run", "--rm", "--network", "none", "--read-only",
                           "--user", "10001:10001", "--mount",
                           "type=volume,source=" + volume + ",target=/data,readonly",
                           "--entrypoint", "node", image, "-e", "setTimeout(()=>{},30000)"]
            if options.host_helper:
                docker_args[docker_args.index('--entrypoint')+2] = \
                    PROOF.docker_one('image', 'inspect', image)['Id']
                pidfile = root / 'host-helper.pid'
                script = ('import os, pathlib, subprocess, sys; '
                          'pathlib.Path(sys.argv[1]).write_text(str(os.getpid())); '
                          'subprocess.run(sys.argv[2:], check=True)')
                PROOF.host_run(receipt, [sys.executable, '-c', script,
                                         str(pidfile), *docker_args], timeout=4)
            else:
                PROOF.run_owned_child(receipt, docker_args, kind="timeout-probe",
                                      volume=volume, image=image, timeout=4)
            result["timeoutVerdict"] = "UNEXPECTED_COMPLETION"
        except PROOF.Blocked as error:
            result["timeoutVerdict"] = str(error)
        receipt = json.loads((root / 'receipt.json').read_text())
        rows = receipt["hostChildren"] if options.host_helper else receipt["children"]
        result["childObserved"] = bool(rows) and PROOF.optional_docker("container", rows[0]["name"]) is not None
        if options.host_helper and (root / 'host-helper.pid').exists():
            pgid = int((root / 'host-helper.pid').read_text())
            running = []
            for stat in Path('/proc').glob('[0-9]*/stat'):
                try:
                    fields = stat.read_text().rsplit(')', 1)[1].split()
                    if int(fields[2]) == pgid and fields[0] != 'Z':
                        running.append(stat.parent.name)
                except (OSError, ValueError, IndexError):
                    continue
            result['groupStopped'] = not running
    finally:
        try:
            cleanup(receipt)
            result["cleanup"] = "PASS"
        except (PROOF.Blocked, OSError, KeyError) as error:
            result["cleanup"] = "FAILED"
            result["cleanupCode"] = str(error) if isinstance(error, PROOF.Blocked) else "RR2_TIMEOUT_CLEANUP_INVALID"
        (root / "result.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
        print(json.dumps(result, sort_keys=True))
    expected = 'RR2_HOST_COMMAND_TIMEOUT' if options.host_helper else 'RR2_COMMAND_TIMEOUT'
    return 0 if (result["timeoutVerdict"] == expected and result["childObserved"] and
                 (not options.host_helper or result['groupStopped']) and
                 result["cleanup"] == "PASS") else 1

if __name__ == "__main__":
    raise SystemExit(main())
