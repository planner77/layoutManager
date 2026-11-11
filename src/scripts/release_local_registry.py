"""Fixed GHCR transport and fsynced one-attempt journal for #282.

Reuses the reviewed candidate_registry raw graph, HTTP and upload target checks.
It never accepts a repository/URL or DELETE route from an operator.
"""
from __future__ import annotations

import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.parse
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests/oci'))
import candidate_registry as old

REPO = 'planner77/layoutmanager'
PACKAGE = 'ghcr.io/' + REPO
HEX64 = re.compile(r'[a-f0-9]{64}\Z')


class Blocked(Exception):
    pass


def need(ok, code):
    if not ok:
        raise Blocked(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def sha(value):
    return hashlib.sha256(value).hexdigest()


class Journal:
    def __init__(self, path: Path, plan_sha: str, stage: str):
        need(stage in ('candidate', 'final') and HEX64.fullmatch(plan_sha), 'JOURNAL_SCOPE')
        self.path = path
        self.fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        self.seq = 0
        self.previous = '0' * 64
        self.append({'event': 'BEGIN', 'stage': stage, 'planSha256': plan_sha})
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)

    def append(self, value: dict):
        self.seq += 1
        body = {'seq': self.seq, 'previous': self.previous, **value}
        checksum = sha(canonical(body))
        raw = canonical({**body, 'sha256': checksum}) + b'\n'
        written = 0
        while written < len(raw):
            count = os.write(self.fd, raw[written:])
            need(count > 0, 'JOURNAL_SHORT_WRITE')
            written += count
        os.fsync(self.fd)
        self.previous = checksum

    def intent(self, method: str, kind: str, reference: str):
        need(method in ('POST', 'PUT') and kind in ('blob-upload-init', 'blob-by-digest', 'manifest'),
             'JOURNAL_INTENT')
        self.append({'event': 'REMOTE_INTENT', 'method': method, 'kind': kind,
                     'reference': reference})

    def close(self):
        os.close(self.fd)


def read_journal(path: Path, plan_sha: str, stage: str) -> list[dict]:
    need(path.is_file() and not path.is_symlink() and path.stat().st_mode & 0o077 == 0
         and path.stat().st_size <= 4 * 1024 * 1024, 'JOURNAL_MISSING_OR_UNSAFE')
    rows = []
    previous = '0' * 64
    for number, line in enumerate(path.read_bytes().splitlines(), 1):
        need(number <= 10000, 'JOURNAL_BOUND')
        row = json.loads(line)
        checksum = row.pop('sha256', None)
        need(row.get('seq') == number and row.get('previous') == previous
             and checksum == sha(canonical(row)), 'JOURNAL_TAMPER')
        previous = checksum
        rows.append({**row, 'sha256': checksum})
    need(rows and rows[0].get('event') == 'BEGIN'
         and rows[0].get('stage') == stage and rows[0].get('planSha256') == plan_sha,
         'JOURNAL_PLAN')
    return rows


class Lock:
    def __init__(self, path: Path):
        self.fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(self.fd)
            raise Blocked('PUBLISHER_LOCKED') from None

    def close(self):
        fcntl.flock(self.fd, fcntl.LOCK_UN)
        os.close(self.fd)


class NoWriteJournal:
    def intent(self, *_):
        raise Blocked('READ_ONLY')


class GHCR(old.GHCR):
    """Rebinds old exact fixed-route transport to new version-generic refs."""
    def __init__(self, token: str, allowed: set[str], journal=None, *, write=False, http=None):
        need(type(token) is str and token and not any(c in token for c in '\r\n')
             and type(allowed) is set and allowed
             and all(type(ref) is str and re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', ref)
                     for ref in allowed), 'GHCR_CREDENTIAL_OR_REF')
        self.allowed_tags = set(allowed)
        self.bound_objects = {}
        self.bound_tags = {}
        self._upload_session = None
        self.write_enabled = write
        self.journal = journal or NoWriteJournal()
        self.http = http or old.HTTP()
        scope = old.SCOPE if write else old.PULL_SCOPE
        status, headers, _, _, _ = self.http.request('GET', old.ORIGIN + '/v2/')
        challenge = headers.get('www-authenticate', '')
        need(status == 401 and challenge in (
            'Bearer realm="https://ghcr.io/token",service="ghcr.io"',
            'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:user/image:pull"',
            'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="' + scope + '"'),
            'GHCR_CHALLENGE')
        credentials = base64.b64encode(('planner77:' + token).encode()).decode()
        token_url = old.ORIGIN + '/token?' + urllib.parse.urlencode({'service': 'ghcr.io', 'scope': scope})
        status, _, raw, _, _ = self.http.request('GET', token_url,
                                                {'Authorization': 'Basic ' + credentials})
        result = old.decode(raw)
        need(status == 200 and type(result) is dict and type(result.get('token')) is str
             and result['token'] and not any(c in result['token'] for c in '\r\n'),
             'GHCR_TOKEN_EXCHANGE')
        self.bearer = result['token']

    def request(self, method, path, **kwargs):
        if not self.write_enabled:
            need(method in ('GET', 'HEAD') and kwargs.get('data') is None,
                 'READ_ONLY_REGISTRY_ROUTE')
        return super().request(method, path, **kwargs)

    def bind(self, graphs: dict, refs: dict):
        need(set(graphs) == {'app', 'migrator', 'cpu-worker'}
             and set(refs) == set(graphs), 'GHCR_BINDING')
        for role, graph in graphs.items():
            ref = refs[role].rsplit(':', 1)[-1]
            need(ref in self.allowed_tags and graph['digest'] in graph['objects'], 'GHCR_BINDING')
            for digest, value in graph['objects'].items():
                old_value = self.bound_objects.get(digest)
                need(old_value is None or all(old_value[k] == value[k]
                     for k in ('digest', 'size', 'mediaType')), 'GHCR_SHARED_OBJECT')
                self.bound_objects[digest] = value
            self.bound_tags[ref] = graph['objects'][graph['digest']]


def tags(refs: dict) -> dict:
    need(set(refs) == {'app', 'migrator', 'cpu-worker'}, 'GHCR_REFS')
    result = {}
    for role, ref in refs.items():
        need(type(ref) is str and ref.startswith(PACKAGE + ':'), 'GHCR_PACKAGE')
        tag = ref[len(PACKAGE) + 1:]
        need(re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', tag), 'GHCR_TAG')
        result[role] = tag
    return result


def check_baseline(client: GHCR, expected: dict) -> dict:
    need(set(expected) == {'0.61.0', '0.61.0-migrate', '0.61.0-cpu-worker', 'latest'},
         'BASELINE_SCHEMA')
    observed = {}
    for ref, digest in expected.items():
        need(ref in client.allowed_tags and type(digest) is str and digest.startswith('sha256:')
             and HEX64.fullmatch(digest[7:]), 'BASELINE_REF')
        item = client.manifest(ref)
        need(item is not None and item['digest'] == digest, 'BASELINE_DRIFT')
        observed[ref] = item['digest']
    return observed


def absent(client: GHCR, refs: dict):
    for tag in tags(refs).values():
        need(tag in client.allowed_tags and client.manifest(tag) is None,
             'TARGET_REF_EXISTS_OR_UNKNOWN')


def graph_readback(client: GHCR, refs: dict, graphs: dict, scratch: Path,
                   source: str, version: str) -> dict:
    result = {}
    for role, tag in tags(refs).items():
        checked = old.collect_graph(client, tag, scratch / role, role, source,
                                    version=version)
        old.same_graph(graphs[role], checked)
        result[role] = checked['digest']
    return result


def pull_smoke(refs: dict, graph_digests: dict):
    for role, digest in graph_digests.items():
        need(role in ('app', 'migrator', 'cpu-worker') and type(digest) is str
             and digest.startswith('sha256:') and HEX64.fullmatch(digest[7:]),
             'DIGEST_SMOKE_SCOPE')
        ref = PACKAGE + '@' + digest
        result = subprocess.run(['docker', 'pull', '--quiet', ref], capture_output=True, timeout=600)
        need(result.returncode == 0, 'DIGEST_PULL_FAILED')
        smoke_image(ref)


def smoke_image(ref: str):
        need(type(ref) is str and (ref.startswith(PACKAGE + '@sha256:')
             or re.fullmatch(r'r282local[a-f0-9]{12}:0\.[0-9]+\.[0-9]+(?:-migrate|-cpu-worker)?', ref)),
             'DIGEST_SMOKE_SCOPE')
        nonce = uuid.uuid4().hex
        name = 'r282-pull-' + nonce[:20]
        tmpfs = {'/tmp': 'rw,noexec,nosuid,nodev,size=96m,uid=10001,gid=10001',
                 '/data': 'rw,nosuid,nodev,size=16m,uid=10001,gid=10001'}
        try:
            test = subprocess.run(['docker', 'run', '--name', name,
                                   '--label', 'release282.smoke=' + nonce,
                                   '--network', 'none', '--read-only', '--user', '10001:10001',
                                   '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                                   '--pids-limit', '64', '--memory', '768m', '--cpus', '1',
                                   '--tmpfs', '/tmp:' + tmpfs['/tmp'],
                                   '--tmpfs', '/data:' + tmpfs['/data'],
                                   '--entrypoint', 'sh', ref, '-c',
                                   'test "$(id -u)" = 10001 && node -e "const D=require(\'better-sqlite3\');new D(\':memory:\').close()"'],
                                  capture_output=True, timeout=120)
            need(test.returncode == 0, 'DIGEST_RUNTIME_SMOKE_FAILED')
        finally:
            inspect = subprocess.run(['docker', 'container', 'inspect', name],
                                     capture_output=True, timeout=20)
            if inspect.returncode == 0:
                item = json.loads(inspect.stdout)[0]
                need(item.get('Name') == '/' + name
                     and item.get('Config', {}).get('Labels', {}).get('release282.smoke') == nonce
                     and item.get('Config', {}).get('Image') == ref
                     and item.get('HostConfig', {}).get('Tmpfs') == tmpfs
                     and item.get('HostConfig', {}).get('Binds') in (None, [])
                     and item.get('HostConfig', {}).get('Mounts') in (None, [])
                     and isinstance(item.get('Mounts'), list)
                     and all(m.get('Type') == 'tmpfs' and m.get('Destination') in tmpfs
                             for m in item['Mounts']), 'DIGEST_SMOKE_OWNERSHIP')
                removed = subprocess.run(['docker', 'rm', '-f', '-v', name],
                                         capture_output=True, timeout=20)
                need(removed.returncode == 0, 'DIGEST_SMOKE_CLEANUP')


def package_metadata() -> dict:
    # Uses existing gh CLI account for read-only package metadata; no token echo.
    result = subprocess.run(['gh', 'api', '-H', 'Accept: application/vnd.github+json',
                             '/user/packages/container/layoutmanager'],
                            capture_output=True, timeout=30)
    need(result.returncode == 0 and len(result.stdout) <= 1024 * 1024, 'PACKAGE_METADATA')
    info = json.loads(result.stdout)
    repo = info.get('repository') or {}
    need(info.get('name') == 'layoutmanager' and info.get('visibility') == 'private'
         and repo.get('full_name') == 'planner77/layoutManager', 'PACKAGE_LINK_OR_VISIBILITY')
    return {'name': info['name'], 'visibility': info['visibility'],
            'repository': repo['full_name'], 'id': info.get('id')}
