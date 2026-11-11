#!/usr/bin/env python3
"""#282/#281: independently replay a sealed #283 baseline in a fresh owned clone.

The input JSON only locates private objects. Its PASS/status fields are ignored.
No operational source volume or container is mounted, inspected, stopped or started.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import uuid

SRC = Path(__file__).resolve().parents[1]
CLI = SRC / 'scripts/recovery-local.mjs'
HELPER = SRC / 'scripts/recovery-local-volume.mjs'
HEX64 = re.compile(r'[a-f0-9]{64}\Z')


class Rejected(Exception):
    pass


def require(ok: bool, code: str) -> None:
    if not ok:
        raise Rejected(code)


def private_file(value: str, max_bytes: int) -> Path:
    path = Path(value)
    require(path.is_absolute(), 'RECOVERY_PATH')
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current = current / part
        s = current.lstat()
        require(not current.is_symlink(), 'RECOVERY_SYMLINK')
        if current != path:
            require(current.is_dir(), 'RECOVERY_PARENT')
    s = path.stat()
    require(path.is_file() and s.st_nlink == 1 and s.st_uid == os.getuid()
            and s.st_mode & 0o077 == 0 and 1 <= s.st_size <= max_bytes,
            'RECOVERY_PRIVATE_FILE')
    parent = path.parent.stat()
    require(parent.st_uid == os.getuid() and parent.st_mode & 0o077 == 0,
            'RECOVERY_PRIVATE_PARENT')
    return path


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def input_paths(input_file: str) -> dict:
    source = json.loads(private_file(input_file, 1024 * 1024).read_text())
    require(type(source) is dict and source.get('format') == 'RECOVERY283-OPERATIONAL-PROOF-V1',
            'RECOVERY_INPUT_SCHEMA')
    # These are locators and fingerprints only. Discard every self-reported PASS.
    plan = private_file(source.get('plan'), 2 * 1024 * 1024)
    key = private_file(source.get('keyFile'), 32)
    archive = Path(source.get('archiveDirectory'))
    require(archive.is_absolute() and archive.is_dir() and not archive.is_symlink()
            and archive.stat().st_uid == os.getuid()
            and archive.stat().st_mode & 0o077 == 0, 'RECOVERY_ARCHIVE_DIR')
    receipt = private_file(str(archive / 'receipt.json'), 1024 * 1024)
    sealed = private_file(str(archive / 'archive.gcm'), 20 * 1024 ** 3 + 1024 * 1024)
    settings = private_file(str(archive / 'settings.gcm'), 16 * 1024 * 1024)
    plan_data = json.loads(plan.read_text())
    receipt_data = json.loads(receipt.read_text())
    require(source.get('toolCommit') == plan_data.get('inventory', {}).get('source', {}).get('head')
            and HEX64.fullmatch(source.get('toolCliSha256', ''))
            and HEX64.fullmatch(source.get('toolHelperSha256', ''))
            and source['toolCliSha256'] == digest(CLI)
            and source['toolHelperSha256'] == digest(HELPER)
            and source['toolCliSha256'] == plan_data['inventory']['source']['cliSha256']
            and source['toolHelperSha256'] == plan_data['inventory']['source']['helperSha256'],
            'RECOVERY_TOOL_DRIFT')
    require(plan_data.get('sha256') == receipt_data.get('planSha256')
            and receipt_data.get('archiveSha256') == digest(sealed)
            and receipt_data.get('settingsSha256') == digest(settings)
            and source.get('planSha256') == plan_data['sha256'],
            'RECOVERY_SEAL_DRIFT')
    return {'plan': plan, 'key': key, 'archive': archive, 'planData': plan_data,
            'archiveSha256': digest(sealed), 'receiptSha256': digest(receipt)}


def run(*args: str, timeout: int = 300) -> dict:
    result = subprocess.run(args, cwd=SRC, capture_output=True, timeout=timeout)
    # Never include raw subprocess output (which may contain private details).
    require(result.returncode == 0 and len(result.stdout) <= 1024 * 1024,
            'RECOVERY_REPLAY_FAILED')
    result_json = json.loads(result.stdout)
    require(type(result_json) is dict, 'RECOVERY_REPLAY_FORMAT')
    return result_json


def replay(input_file: str, *, with_probe: bool = True) -> dict:
    data = input_paths(input_file)
    nonce = data['planData']['nonce']
    require(type(nonce) is str and re.fullmatch(r'[a-f0-9]{32}', nonce), 'RECOVERY_NONCE')
    volume = 'r282-baseline-' + uuid.uuid4().hex[:20]
    common = ('--plan', str(data['plan']), '--out', str(data['archive']), '--key', str(data['key']))
    try:
        restored = run('node', str(CLI), 'restore', *common,
                       '--destination', volume, '--execute', timeout=600)
        require(restored.get('state') == 'RESTORED_ISOLATED'
                and restored.get('planSha256') == data['planData']['sha256'], 'RECOVERY_RESTORE')
        verified = run('node', str(CLI), 'verify', *common, '--destination', volume, timeout=300)
        require(verified.get('state') == 'VERIFIED_ISOLATED'
                and verified.get('logicalSha256') == restored.get('logicalSha256')
                and verified.get('schema') == 'G7_DECLARED_SCHEMA_MATCH'
                and verified.get('images') == 'THREE_ROLE_IDENTITY_MATCH', 'RECOVERY_VERIFY')
        probed = None
        if with_probe:
            probed = run('node', str(CLI), 'probe', *common,
                         '--destination', volume, '--execute', timeout=240)
            require(probed.get('state') == 'CLONE_PROBED'
                    and probed.get('baseline') == 'VERIFIED_ISOLATED'
                    and probed.get('appHealth') == 'PASS'
                    and probed.get('appRead') in ('PASS', 'AUTH_BOUNDARY')
                    and probed.get('worker') in ('IDLE', 'PUBLISHED', 'RETRY_WAIT', 'CAS_LOST', 'FAILED'),
                    'RECOVERY_PROBE')
        return {'state': 'BASELINE_VERIFIED', 'planSha256': data['planData']['sha256'],
                'archiveSha256': data['archiveSha256'], 'receiptSha256': data['receiptSha256'],
                'sourceVersion': verified['release'], 'appHealth': probed['appHealth'] if probed else 'NOT_RUN',
                'worker': probed['worker'] if probed else 'NOT_RUN',
                'offHost': 'NOT_RUN', 'actualUserLogin': 'NOT_RUN'}
    finally:
        check = subprocess.run(['docker', 'volume', 'inspect', volume], capture_output=True, timeout=20)
        if check.returncode == 0:
            observed = json.loads(check.stdout)[0]
            labels = observed.get('Labels') or {}
            require(observed.get('Name') == volume
                    and labels.get('recovery283.nonce') == nonce
                    and labels.get('recovery283.plan') == data['planData']['sha256'],
                    'RECOVERY_CLONE_OWNERSHIP')
            attached = subprocess.run(['docker', 'ps', '-aq', '--filter', 'volume=' + volume,
                                       '--filter', 'label=recovery283.probe=' + data['planData']['sha256']],
                                      capture_output=True, text=True, timeout=20)
            require(attached.returncode == 0, 'RECOVERY_CLONE_CLEANUP')
            for cid in attached.stdout.splitlines():
                container = subprocess.run(['docker', 'container', 'inspect', cid], capture_output=True, timeout=20)
                require(container.returncode == 0, 'RECOVERY_CLONE_CLEANUP')
                info = json.loads(container.stdout)[0]
                require(info.get('Config', {}).get('Labels', {}).get('recovery283.probe')
                        == data['planData']['sha256'] and any(m.get('Name') == volume for m in info.get('Mounts', [])),
                        'RECOVERY_CLONE_CLEANUP')
                removed_container = subprocess.run(['docker', 'rm', '-f', cid], capture_output=True, timeout=20)
                require(removed_container.returncode == 0, 'RECOVERY_CLONE_CLEANUP')
            removed = subprocess.run(['docker', 'volume', 'rm', volume], capture_output=True, timeout=20)
            require(removed.returncode == 0, 'RECOVERY_CLONE_CLEANUP')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    options = parser.parse_args()
    try:
        print(json.dumps(replay(options.input), sort_keys=True))
        return 0
    except (Rejected, OSError, ValueError, KeyError, TypeError,
            subprocess.TimeoutExpired, json.JSONDecodeError) as error:
        code = str(error) if isinstance(error, Rejected) else 'RECOVERY_REPLAY_HALT'
        print(code, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
