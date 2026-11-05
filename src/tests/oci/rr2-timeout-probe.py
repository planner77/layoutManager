#!/usr/bin/env python3
"""Actual disposable Docker timeout/owned-child cleanup probe for RX-10."""
import importlib.util
import argparse
import json
from pathlib import Path
import re
import secrets
import shutil
import sys
import time

STARTUP_SECONDS = 30
EXECUTION_SECONDS = 4

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location("rr2_proof", Path(__file__).with_name("rr2-recovery-proof.py"))
PROOF = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROOF)


class Readiness:
    """Observe only this fixture's typed ownership and fixed readiness marker."""
    def __init__(self, receipt, engine, *, host=False):
        self.path = Path(receipt['root']) / 'receipt.json'
        self.nonce = receipt['nonce']; self.volume = receipt['liveVolume']
        self.engine = engine; self.host = host
        self.startup_started = None; self.startup_deadline = None
        self.diagnostics = {'identityVerified': False, 'childRunning': False,
                            'readinessObserved': False, 'runningAtArm': False}

    def observation_failure(self, error, deadline, unavailable_code):
        now = time.monotonic()
        if self.startup_started is not None:
            self.diagnostics['startupElapsedMs'] = max(0, int((now - self.startup_started) * 1000))
        # Only the actual subprocess.run timeout cause plus observed exhaustion
        # of the shared startup deadline proves this class. A generic error,
        # auth/nonzero/malformed response or earlier timeout stays unavailable.
        if (str(error) == 'RR2_COMMAND_TIMEOUT'
                and isinstance(error.__cause__, PROOF.subprocess.TimeoutExpired)
                and now >= deadline):
            self.diagnostics.update(phase='STARTUP_OBSERVATION_DEADLINE', exitClass='OBSERVATION_TIMEOUT')
            raise PROOF.Blocked('RR2_PROBE_STARTUP_OBSERVATION_DEADLINE') from error
        raise PROOF.Blocked(unavailable_code) from error

    def inspect(self, kind, name, deadline):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return None
        try:
            result = PROOF.run(['docker', kind, 'inspect', name], timeout=min(2, remaining), allow_failure=True)
        except PROOF.Blocked as error:
            self.observation_failure(error, deadline, 'RR2_PROBE_INSPECT_UNAVAILABLE')
        if result.returncode:
            expected = ('No such container: ' + name) if kind == 'container' else ('get ' + name + ': no such volume')
            PROOF.check(result.returncode == 1 and result.stdout.strip() in ('', '[]')
                        and result.stderr.strip() == 'Error response from daemon: ' + expected,
                        'RR2_PROBE_INSPECT_UNAVAILABLE')
            return None
        try:
            value = json.loads(result.stdout)
        except (TypeError, ValueError) as error:
            raise PROOF.Blocked('RR2_PROBE_INSPECT_UNAVAILABLE') from error
        PROOF.check(not result.stderr.strip() and isinstance(value, list) and len(value) == 1
                    and isinstance(value[0], dict), 'RR2_PROBE_INSPECT_UNAVAILABLE')
        return value[0]

    def __call__(self, process, remaining):
        deadline = time.monotonic() + remaining
        if self.startup_deadline is not None:
            deadline = min(deadline, self.startup_deadline)
        try:
            receipt = json.loads(self.path.read_text())
        except (OSError, ValueError):
            # The wrapper may be in its existing truncate/write receipt update.
            # This is pending readiness, never typed absence or a timeout PASS.
            return False
        rows = receipt.get('hostChildren' if self.host else 'children', [])
        PROOF.check(receipt.get('nonce') == self.nonce and len(rows) <= 1, 'RR2_PROBE_RECEIPT_CHANGED')
        if not rows:
            return False
        row = rows[0]; name = row.get('name', '')
        expected_name = 'layoutmanager-rr2-' + ('host-' if self.host else 'child-') + self.nonce + r'-[0-9a-f]{8}'
        PROOF.check(re.fullmatch(expected_name, name) and row.get('nonce') == self.nonce
                    and row.get('engineImageId') == self.engine
                    and row.get('cidFile') == str(self.path.parent / (name + '.cid')),
                    'RR2_PROBE_RECEIPT_OWNERSHIP_INVALID')
        item = self.inspect('container', name, deadline)
        if item is None:
            return False
        cidfile = Path(row['cidFile'])
        if not cidfile.exists():
            return False  # Docker may be between create and cidfile write; never arm.
        cid = cidfile.read_text().strip()
        labels = item.get('Config', {}).get('Labels') or {}
        mounts = item.get('Mounts', [])
        PROOF.check(re.fullmatch('[0-9a-f]{64}', cid) and item.get('Id') == cid
                    and item.get('Name', '').lstrip('/') == name
                    and item.get('Image') == self.engine and item.get('Config', {}).get('Image') == row.get('image')
                    and labels.get('com.planner77.purpose') == PROOF.PURPOSE
                    and labels.get('com.planner77.rr2.nonce') == self.nonce
                    and (row.get('volumes') == [self.volume] if self.host else row.get('volume') == self.volume)
                    and len(mounts) == 1 and mounts[0].get('Name') == self.volume
                    and mounts[0].get('Destination') == '/data' and mounts[0].get('RW') is False
                    and item.get('HostConfig', {}).get('NetworkMode') == 'none'
                    and item.get('HostConfig', {}).get('ReadonlyRootfs') is True
                    and item.get('Config', {}).get('User') == '10001:10001', 'RR2_PROBE_CHILD_OWNERSHIP_INVALID')
        volume = self.inspect('volume', self.volume, deadline)
        if volume is None:
            return False
        labels = volume.get('Labels') or {}
        PROOF.check(volume.get('Name') == self.volume
                    and labels.get('com.planner77.purpose') == PROOF.PURPOSE
                    and labels.get('com.planner77.rr2.nonce') == self.nonce, 'RR2_PROBE_VOLUME_OWNERSHIP_INVALID')
        self.diagnostics['identityVerified'] = True
        self.diagnostics['childRunning'] = item.get('State', {}).get('Running') is True
        state = item.get('State', {})
        if state.get('Status') in ('exited', 'dead'):
            self.diagnostics.update(phase='EARLY_EXIT', exitClass='ZERO_EXIT' if state.get('ExitCode') == 0 else 'NONZERO_EXIT')
            raise PROOF.Blocked('RR2_PROBE_EARLY_EXIT')
        if not self.diagnostics['childRunning'] or time.monotonic() >= deadline:
            return False
        budget = deadline - time.monotonic()
        if budget <= 0:
            return False
        try:
            result = PROOF.run(['docker', 'logs', '--tail', '2', cid],
                               timeout=min(2, budget), allow_failure=True)
        except PROOF.Blocked as error:
            self.observation_failure(error, deadline, 'RR2_PROBE_READINESS_UNAVAILABLE')
        PROOF.check(result.returncode == 0 and not result.stderr.strip(), 'RR2_PROBE_READINESS_UNAVAILABLE')
        ready = result.stdout.strip() == 'RR2_TIMEOUT_FIXTURE_READY:' + self.nonce
        self.diagnostics['readinessObserved'] = ready
        if not ready:
            return False
        again = self.inspect('container', name, deadline)
        return bool(again and again.get('Id') == cid and again.get('Image') == self.engine
                    and again.get('State', {}).get('Running') is True)


def checked_input(path):
    triplet = json.loads(path.read_text())
    image = triplet['refs']['cpu-worker']; entry = triplet['manifests']['cpu-worker']
    PROOF.check(triplet.get('kind') == 'RR1_LOCAL_UNSIGNED_REGISTRY_RECEIPT'
                and triplet.get('version') == '0.61.0'
                and re.fullmatch('[0-9a-f]{40}', triplet.get('sourceCommit', ''))
                and re.fullmatch(r'127\.0\.0\.1:[0-9]{4,5}/rr1-release@sha256:[0-9a-f]{64}', image)
                and image.endswith('@' + entry['digest']), 'RR2_PROBE_INPUT_RECEIPT_INVALID')
    observed = PROOF.docker_one('image', 'inspect', image)
    labels = observed.get('Config', {}).get('Labels') or {}
    PROOF.check(image in observed.get('RepoDigests', []) and observed.get('Os') == 'linux'
                and observed.get('Architecture') == 'amd64'
                and labels.get('org.opencontainers.image.source') == 'https://github.com/planner77/layoutManager'
                and labels.get('org.opencontainers.image.revision') == triplet['sourceCommit']
                and labels.get('org.opencontainers.image.version') == '0.61.0'
                and labels.get('com.planner77.g7.image-role') == 'cpu-worker', 'RR2_PROBE_IMAGE_SOURCE_MISMATCH')
    descriptor = observed.get('Descriptor')
    if descriptor is None:
        PROOF.check(observed.get('Id') == entry['configDigest'], 'RR2_PROBE_CLASSIC_IMAGE_ID_MISMATCH')
    else:
        PROOF.check('topDescriptor' in entry and 'manifestDescriptor' in entry
                    and PROOF.rr1_identity().descriptor_matches(descriptor, entry)
                    and observed.get('Id') == descriptor['digest'], 'RR2_PROBE_TARGET_IDENTITY_UNPROVEN')
    return image, observed['Id']

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
    parser.add_argument('--startup-seconds', type=float, default=STARTUP_SECONDS,
                        help='Bound readiness separately; execution proof remains four seconds')
    parser.add_argument('--startup-delay-seconds', type=float, default=0,
                        help='Controlled synthetic fixture delay before readiness; test only')
    options = parser.parse_args()
    if options.cleanup_receipt:
        receipt = json.loads(options.cleanup_receipt.read_text())
        PROOF.check(options.cleanup_receipt.resolve() ==
                    (Path(receipt['root']) / 'receipt.json').resolve(),
                    'RR2_TIMEOUT_RECEIPT_PATH_INVALID')
        cleanup(receipt)
        print('RR2_TIMEOUT_OWNED_RESOURCES_REMOVED')
        return 0
    PROOF.check(0 < options.startup_seconds <= 60 and 0 <= options.startup_delay_seconds <= 30,
                'RR2_PROBE_TIMING_ARGUMENT_INVALID')
    nonce = secrets.token_hex(8)
    root = ROOT / 'data/release-proof' / ('rr2-timeout-' + nonce)
    root.mkdir(mode=0o700, parents=True)
    volume = "layoutmanager-rr2-timeout-" + nonce
    image, engine = checked_input(options.triplet_receipt)
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
    readiness = Readiness(receipt, engine, host=options.host_helper)
    try:
        PROOF.run(["docker", "volume", "create", "--label", "com.planner77.purpose=" + PROOF.PURPOSE,
                   "--label", "com.planner77.rr2.nonce=" + nonce, volume], timeout=30)
        try:
            docker_args = ["docker", "run", "--rm", "--pull", "never", "--network", "none", "--read-only",
                           "--user", "10001:10001", "--mount",
                           "type=volume,source=" + volume + ",target=/data,readonly",
                           "--entrypoint", "node", image, "-e",
                           "setTimeout(()=>{process.stdout.write('RR2_TIMEOUT_FIXTURE_READY:" + nonce +
                           "\\n');setTimeout(()=>{},30000)}," + str(int(options.startup_delay_seconds * 1000)) + ")"]
            if options.host_helper:
                docker_args[docker_args.index('--entrypoint')+2] = engine
                pidfile = root / 'host-helper.pid'
                source = ROOT / 'src/scripts/g7-deploy.py'
                copied = root / 'g7-deploy.py'
                shutil.copyfile(source, copied)
                PROOF.check(copied.read_bytes() == source.read_bytes(), 'RR2_PROBE_HOST_HELPER_CHANGED')
                receipt['hostHelperSha256'] = PROOF.digest(copied.read_bytes())
                PROOF.save_receipt(receipt)
                script = ('import os, pathlib, importlib.util, sys; '
                          'pathlib.Path(sys.argv[2]).write_text(str(os.getpid())); '
                          'spec=importlib.util.spec_from_file_location("owned_host_helper",sys.argv[1]); '
                          'helper=importlib.util.module_from_spec(spec); spec.loader.exec_module(helper); '
                          'helper.command(sys.argv[3:])')
                PROOF.host_run(receipt, [sys.executable, '-c', script,
                                         str(copied), str(pidfile), *docker_args],
                               timeout=EXECUTION_SECONDS, readiness=readiness,
                               startup_timeout=options.startup_seconds)
            else:
                PROOF.run_owned_child(receipt, docker_args, kind="timeout-probe",
                                      volume=volume, image=image, timeout=EXECUTION_SECONDS,
                                      readiness=readiness, startup_timeout=options.startup_seconds)
            result["timeoutVerdict"] = "UNEXPECTED_COMPLETION"
        except PROOF.Blocked as error:
            result["timeoutVerdict"] = str(error)
        receipt = json.loads((root / 'receipt.json').read_text())
        rows = receipt["hostChildren"] if options.host_helper else receipt["children"]
        result['readiness'] = readiness.diagnostics
        result['childObserved'] = all(readiness.diagnostics.get(key) is True for key in
                                     ('identityVerified', 'readinessObserved', 'runningAtArm', 'executionArmed'))
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
            receipt = json.loads((root / 'receipt.json').read_text())
            cleanup(receipt)
            result["cleanup"] = "PASS"
        except (PROOF.Blocked, OSError, KeyError, ValueError) as error:
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
