#!/usr/bin/env python3
"""Issue #282: explicit local release plan/build/preflight/publish/reconcile.

No Git push, workflow dispatch, repository settings, Docker deployment, tag
deletion or `latest` mutation exists in this CLI. A checksum is never Owner GO.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import tempfile
import uuid

import release_local_oci as oci
import release_local_registry as registry
import release_local_compat as compat
import verify_local_recovery as recovery
import verify_local

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'src'
PACKAGE = 'ghcr.io/planner77/layoutmanager'
ORIGIN = 'https://github.com/planner77/layoutManager'
ROLES = {'app': ('runtime', 'app'), 'migrator': ('migrator', 'migrator'),
         'cpu-worker': ('cpu-worker', 'cpu-worker')}
BASELINE = {'0.61.0': 'sha256:c4f8b576278067d990856c4f908a32982f8cbe0d2b1e96969a428472456d19ba',
            '0.61.0-migrate': 'sha256:cc40e88172685694306686d521e439ecb058a1a79267ab862a6ddbf5ebf74269',
            '0.61.0-cpu-worker': 'sha256:b97a58c964af766ad7fa9b4b2c7b5db526cf3e55faeb371f7444fd42aefed92b',
            'latest': 'sha256:c5d133a0335d3f8391f499880a3e8d38e197375b3cc298118e2701f2796aaf2c'}
HEX40 = re.compile(r'[a-f0-9]{40}\Z')
HEX64 = re.compile(r'[a-f0-9]{64}\Z')
VERSION = re.compile(r'0\.(?:[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\Z')


class Halt(Exception):
    pass


def need(ok: bool, code: str) -> None:
    if not ok:
        raise Halt(code)


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def file_sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def command(*args: str, cwd: Path = ROOT, timeout: int = 60, check: bool = True) -> bytes:
    result = subprocess.run(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=timeout)
    if check and result.returncode != 0:
        raise Halt('COMMAND_FAILED')
    return result.stdout


def git(*args: str) -> str:
    return command('git', *args).decode().strip()


def version() -> str:
    value = json.loads((SRC / 'package.json').read_text())['version']
    need(type(value) is str and VERSION.fullmatch(value), 'VERSION_INVALID')
    return value


def refs(release: str, commit: str) -> dict:
    need(VERSION.fullmatch(release) and HEX40.fullmatch(commit), 'REF_SOURCE')
    candidate = 'candidate-' + release + '-' + commit[:16] + '-'
    return {'candidate': {role: PACKAGE + ':' + candidate + role for role in ROLES},
            'final': {'app': PACKAGE + ':' + release,
                      'migrator': PACKAGE + ':' + release + '-migrate',
                      'cpu-worker': PACKAGE + ':' + release + '-cpu-worker'}}


def source_state(*, online: bool = False) -> dict:
    commit, tree = git('rev-parse', 'HEAD'), git('rev-parse', 'HEAD^{tree}')
    need(HEX40.fullmatch(commit) and HEX40.fullmatch(tree), 'SOURCE_IDENTITY')
    raw_status = command('git', 'status', '--porcelain=v1', '-z', '--untracked-files=all')
    # Runtime proof belongs in ignored data/. Tracked Markdown changes still
    # change the release worktree and must never be excused here.
    dirty = bool(raw_status)
    remote = git('remote', 'get-url', 'origin')
    # Never echo a credential URL. Only fixed public canonical forms are allowed.
    remote_ok = remote in (ORIGIN, ORIGIN + '.git',
                           'git@github.com:planner77/layoutManager.git')
    branch = git('branch', '--show-current')
    main_matches = False
    if online and remote_ok:
        lines = command('git', 'ls-remote', '--heads', 'origin', 'main', timeout=30).decode().splitlines()
        main_matches = len(lines) == 1 and lines[0] == commit + '\trefs/heads/main'
    return {'commit': commit, 'tree': tree, 'version': version(), 'branch': branch,
            'clean': not dirty, 'originMatches': remote_ok, 'originMainMatches': main_matches}


def public_plan(build_record: dict | None = None, *, online: bool = False) -> dict:
    state = source_state(online=online)
    refs_map = refs(state['version'], state['commit'])
    issues = []
    if not state['clean']:
        issues.append('DIRTY_SOURCE')
    if not state['originMatches']:
        issues.append('ORIGIN_MISMATCH')
    if online and not state['originMainMatches']:
        issues.append('REMOTE_MAIN_MISMATCH')
    if not build_record:
        issues.append('THREE_ROLE_BUILD_MISSING')
    elif build_record.get('sourceCommit') != state['commit'] or build_record.get('sourceTree') != state['tree']:
        issues.append('BUILD_SOURCE_MISMATCH')
    return {'format': 'RELEASE282-PLAN-V1', 'source': state, 'refs': refs_map,
            'baseline': BASELINE, 'roleDigests': {role: build_record['roles'][role]['topDigest']
                                                  for role in ROLES} if build_record and not any(
                x == 'BUILD_SOURCE_MISMATCH' for x in issues) else None,
            'unready': issues, 'ready': False}


def fresh_private_dir(value: str) -> Path:
    path = Path(value)
    need(path.is_absolute() and not path.exists() and not path.is_symlink(), 'PRIVATE_OUTPUT_EXISTS')
    current = Path(path.anchor)
    for part in path.parent.parts[1:]:
        current = current / part
        need(current.is_dir() and not current.is_symlink(), 'PRIVATE_PARENT')
    parent = path.parent.stat()
    need(parent.st_uid == os.getuid() and parent.st_mode & 0o077 == 0, 'PRIVATE_PARENT')
    path.mkdir(mode=0o700)
    return path


def private_json(path: Path, value: dict) -> None:
    need(path.parent.stat().st_mode & 0o077 == 0 and not path.exists(), 'PRIVATE_FILE')
    data = canonical(value) + b'\n'
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb', closefd=False) as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    finally:
        os.close(fd)
    oci.fsync_dir(path.parent)


def read_private_json(value: str, max_bytes: int = 2 * 1024 * 1024) -> dict:
    path = recovery.private_file(value, max_bytes)
    result = json.loads(path.read_text())
    need(type(result) is dict, 'PRIVATE_JSON')
    return result


def source_archive(commit: str, destination: Path) -> None:
    with destination.open('xb') as output:
        run = subprocess.run(['git', 'archive', '--format=tar', commit], cwd=ROOT,
                             stdout=output, stderr=subprocess.PIPE, timeout=120)
        need(run.returncode == 0, 'SOURCE_ARCHIVE')
        output.flush()
        os.fsync(output.fileno())


def extract_source(archive: Path, destination: Path) -> None:
    destination.mkdir(mode=0o700)
    total = 0
    with tarfile.open(archive, 'r:') as tar:
        members = list(tar)
        need(len(members) <= 100000, 'SOURCE_ARCHIVE_BOUND')
        for member in members:
            parts = member.name.rstrip('/').split('/')
            need(not member.name.startswith('/') and '\\' not in member.name
                 and all(part not in ('', '.', '..') for part in parts)
                 and (member.isfile() or member.isdir()), 'SOURCE_ARCHIVE_MEMBER')
            total += member.size
            need(total <= 2 * 1024 ** 3, 'SOURCE_ARCHIVE_BOUND')
            if member.isfile():
                base = parts[-1].lower()
                need(base not in ('.env',) and not base.startswith('.env.') or base == '.env.example',
                     'SOURCE_SECRET_IN_ARCHIVE')
                need(not re.search(r'\.(?:dxf|dwg|sqlite|sqlite3|db)(?:-wal|-shm)?$', base)
                     and parts[0] != 'data', 'SOURCE_RUNTIME_IN_ARCHIVE')
        tar.extractall(destination, members=members, filter='data')


def build(output: str) -> dict:
    state = source_state()
    dest = fresh_private_dir(output)
    source_archive(state['commit'], dest / 'source.tar')
    context = dest / 'source'
    extract_source(dest / 'source.tar', context)
    archived_version = json.loads((context / 'src/package.json').read_text())['version']
    need(archived_version == state['version'], 'SOURCE_VERSION_DRIFT')
    repository = 'r282local' + uuid.uuid4().hex[:12]
    tags = {'app': repository + ':' + state['version'],
            'migrator': repository + ':' + state['version'] + '-migrate',
            'cpu-worker': repository + ':' + state['version'] + '-cpu-worker'}
    roles = {}
    for role, (target, expected_role) in ROLES.items():
        tag = tags[role]
        command('docker', 'build', '--platform', 'linux/amd64', '--pull=false',
                '--target', target, '--label', 'org.opencontainers.image.source=' + ORIGIN,
                '--label', 'org.opencontainers.image.revision=' + state['commit'],
                '--label', 'org.opencontainers.image.version=' + state['version'],
                '-f', 'src/Dockerfile', '-t', tag, '.', cwd=context, timeout=3600)
        inspected = json.loads(command('docker', 'image', 'inspect', tag, timeout=30))[0]
        labels = inspected.get('Config', {}).get('Labels') or {}
        need(inspected.get('Architecture') == 'amd64' and inspected.get('Os') == 'linux'
             and inspected.get('Config', {}).get('User') in ('cad', '10001', '10001:10001')
             and labels.get('com.planner77.g7.image-role') == expected_role
             and labels.get('org.opencontainers.image.revision') == state['commit']
             and labels.get('org.opencontainers.image.version') == state['version'],
             'LOCAL_IMAGE_IDENTITY')
        registry.smoke_image(tag)
        docker_save = dest / (role + '.docker.tar')
        command('docker', 'save', '-o', str(docker_save), tag, timeout=600)
        layout = dest / ('oci-' + role)
        packed = oci.docker_archive_to_oci(docker_save, layout, role=expected_role,
                                           source=state['commit'], version=state['version'])
        graph = oci.validate_layout(layout, dest / ('graph-' + role), expected_role,
                                    state['commit'], state['version'])
        need(graph['digest'] == packed['topDigest'], 'LOCAL_OCI_MISMATCH')
        roles[role] = {'imageId': inspected['Id'], 'localTag': tag,
                       'topDigest': packed['topDigest'],
                       'manifestDigest': packed['manifestDigest'],
                       'configDigest': packed['configDigest'],
                       'layerCount': len(packed['layers']),
                       'dockerArchiveSha256': file_sha(docker_save)}
    record = {'format': 'RELEASE282-BUILD-V1', 'sourceCommit': state['commit'],
              'sourceTree': state['tree'], 'version': state['version'],
              'cleanAtBuild': state['clean'], 'branchAtBuild': state['branch'],
              'sourceArchiveSha256': file_sha(dest / 'source.tar'), 'roles': roles}
    private_json(dest / 'build.json', record)
    return {'state': 'LOCAL_BUILD_VERIFIED', 'sourceCommit': state['commit'],
            'sourceTree': state['tree'], 'version': state['version'],
            'buildRecordSha256': file_sha(dest / 'build.json'),
            'roleDigests': {r: roles[r]['topDigest'] for r in ROLES},
            'releaseReady': False}


def check_image_binding(graph: dict, role_record: dict, inspected: dict) -> None:
    need(inspected.get('Id') == role_record['imageId']
         and inspected.get('Id') == graph['configDigest'], 'BUILD_IMAGE_CHANGED')


def load_build(value: str, *, check_graphs: bool = True,
               graph_root: Path | None = None) -> tuple[dict, Path, dict]:
    file = recovery.private_file(value, 2 * 1024 * 1024)
    record = json.loads(file.read_text())
    need(record.get('format') == 'RELEASE282-BUILD-V1' and set(record.get('roles', {})) == set(ROLES)
         and HEX40.fullmatch(record.get('sourceCommit', ''))
         and HEX40.fullmatch(record.get('sourceTree', ''))
         and VERSION.fullmatch(record.get('version', '')), 'BUILD_RECORD')
    graphs = {}
    if check_graphs:
        context = tempfile.TemporaryDirectory(prefix='r282-graph-check-') if graph_root is None else None
        scratch = Path(context.name) if context else graph_root
        try:
            for role, (_, expected) in ROLES.items():
                role_record = record['roles'][role]
                layout = file.parent / ('oci-' + role)
                graph = oci.validate_layout(layout, scratch / role, expected,
                                            record['sourceCommit'], record['version'])
                need(graph['digest'] == role_record['topDigest']
                     and graph['manifestDigest'] == role_record['manifestDigest']
                     and graph['configDigest'] == role_record['configDigest']
                     and oci.file_digest(file.parent / (role + '.docker.tar'))
                         == 'sha256:' + role_record['dockerArchiveSha256'],
                     'BUILD_BYTES_CHANGED')
                image = json.loads(command('docker', 'image', 'inspect', role_record['localTag']))[0]
                check_image_binding(graph, role_record, image)
                graphs[role] = graph
        finally:
            if context:
                context.cleanup()
    return record, file, graphs


def verify_run(value: str, state: dict, recovery_input: str | None = None) -> tuple[dict, str]:
    file = recovery.private_file(value, 4 * 1024 * 1024)
    run = json.loads(file.read_text())
    need(type(run) is dict and run.get('issue') == '282' and run.get('status') == 'PASS'
         and run.get('stale') is False and run.get('start', {}).get('profile') == 'release',
         'VERIFY_RUN_STATUS')
    first = run.get('start', {}).get('source', {})
    last = run.get('end', {}).get('source', {})
    current = verify_local.source_state(first.get('base', ''))
    inferred, _ = verify_local.infer_risks(current['paths'], [], 'release')
    declared_risks = run.get('start', {}).get('risks')
    need(type(declared_risks) is list and set(inferred) <= set(declared_risks),
         'VERIFY_RISK_DOWNGRADED')
    clock_mode = run.get('start', {}).get('synthetic_auth_clock')
    need(clock_mode in ('native', 'monotonic')
         and run.get('end', {}).get('synthetic_auth_clock') == clock_mode,
         'VERIFY_CLOCK_MODE')
    expected_cases = verify_local.manifest('release', declared_risks, current['paths'],
                                           recovery_input=recovery_input,
                                           synthetic_auth_clock=clock_mode)
    expected = {case['id']: case for case in expected_cases if case.get('required')}
    for field, want in (('head', state['commit']), ('tree', state['tree']),
                        ('fingerprint', current['fingerprint'])):
        need(first.get(field) == last.get(field) == want, 'VERIFY_RUN_SOURCE')
    need(first.get('dirty') is False and last.get('dirty') is False, 'VERIFY_RUN_DIRTY')
    cases = run.get('cases')
    need(type(cases) is list and len(cases) <= 200, 'VERIFY_RUN_CASES')
    required = set(expected)
    seen = set()
    for case in cases:
        need(type(case) is dict and type(case.get('id')) is str
             and case['id'] not in seen, 'VERIFY_RUN_CASES')
        seen.add(case['id'])
        if case.get('id') in required:
            spec = expected[case['id']]
            need(case.get('required') is True and not spec.get('missing')
                 and case.get('argv') == spec['argv'] and case.get('cwd') == spec['cwd'],
                 'VERIFY_CASE_DOWNGRADED')
        if case.get('required'):
            need(case.get('status') == 'PASS' and case.get('exit_code') == 0
                 and type(case.get('log')) is str
                 and HEX64.fullmatch(case.get('logSha256', '')), 'VERIFY_REQUIRED_CASE')
            log = ROOT / case['log']
            need(log.is_file() and not log.is_symlink()
                 and log.resolve().is_relative_to((ROOT / 'data/verify-local').resolve())
                 and log.stat().st_size <= 64 * 1024 * 1024
                 and file_sha(log) == case['logSha256'], 'VERIFY_LOG_BYTES')
    need(required <= seen, 'VERIFY_CASE_MISSING')
    return run, file_sha(file)


def ghcr_token() -> str:
    token = os.environ.get('RELEASE282_GHCR_TOKEN') or os.environ.get('GHCR_TOKEN', '')
    need(type(token) is str and 8 <= len(token) <= 4096
         and not any(ch in token for ch in '\r\n'), 'GHCR_TOKEN_REQUIRED')
    return token


def allowed_tags(release_refs: dict) -> set[str]:
    return set(BASELINE) | set(registry.tags(release_refs['candidate']).values()) | \
        set(registry.tags(release_refs['final']).values())


def preflight(build_path: str, recovery_input: str, verify_path: str,
              output: str, *, client_factory=None, package_check=None,
              compat_check=None) -> dict:
    state = source_state(online=True)
    need(state['clean'] and state['originMatches'] and state['originMainMatches'],
         'SOURCE_NOT_CURRENT_MAIN')
    record, build_file, graphs = load_build(build_path)
    need(record['sourceCommit'] == state['commit'] and record['sourceTree'] == state['tree']
         and record['version'] == state['version'] and record['cleanAtBuild'] is True,
         'BUILD_NOT_CURRENT_SOURCE')
    run, run_sha = verify_run(verify_path, state, recovery_input)
    recovery_proof = recovery.input_paths(recovery_input)
    recovery_path = recovery.private_file(recovery_input, 1024 * 1024)
    proof_sha = file_sha(recovery_path)
    release_refs = refs(state['version'], state['commit'])
    package = (package_check or registry.package_metadata)()
    need(package.get('name') == 'layoutmanager' and package.get('visibility') == 'private'
         and package.get('repository') == 'planner77/layoutManager', 'PACKAGE_SCOPE')
    client = client_factory(allowed_tags(release_refs)) if client_factory else registry.GHCR(
        ghcr_token(), allowed_tags(release_refs), write=False)
    previous = registry.check_baseline(client, BASELINE)
    registry.absent(client, release_refs['candidate'])
    registry.absent(client, release_refs['final'])
    compatible = (compat_check or compat.prove)(recovery_input, record)
    need(compatible.get('state') == 'CANDIDATE_COMPATIBLE'
         and compatible.get('sourceCommit') == state['commit']
         and compatible.get('to') == state['version']
         and compatible.get('appHealth') == 'PASS'
         and compatible.get('worker') in ('IDLE', 'PUBLISHED'),
         'CANDIDATE_COMPATIBILITY')
    registry.check_baseline(client, BASELINE)
    registry.absent(client, release_refs['candidate'])
    registry.absent(client, release_refs['final'])
    body = {'format': 'RELEASE282-PREFLIGHT-V1', 'source': state,
            'refs': release_refs, 'baseline': previous,
            'roles': {role: {'topDescriptor': graphs[role]['topDescriptor'],
                              'manifestDescriptor': graphs[role]['manifestDescriptor'],
                              'imageId': record['roles'][role]['imageId']}
                      for role in ROLES},
            'package': package, 'verifyRunSha256': run_sha,
            'verifySourceFingerprint': run['start']['source']['fingerprint'],
            'recoveryProofSha256': proof_sha,
            'recoveryArchiveSha256': recovery_proof['archiveSha256'],
            'buildRecordSha256': file_sha(build_file),
            'paths': {'build': str(build_file), 'verifyRun': verify_path,
                      'recoveryInput': recovery_input},
            'compatibility': compatible,
            'toolSha256': {name: file_sha(SRC / 'scripts' / name)
                           for name in ('release_local.py', 'release_local_oci.py',
                                        'release_local_registry.py', 'release_local_compat.py',
                                        'verify_local_recovery.py')}}
    body['planSha256'] = sha(canonical(body))
    dest = fresh_private_dir(output)
    private_json(dest / 'preflight.json', body)
    return {'state': 'REVIEWABLE_PREFLIGHT', 'planSha256': body['planSha256'],
            'sourceCommit': state['commit'], 'sourceTree': state['tree'],
            'version': state['version'], 'refs': release_refs,
            'roleDigests': {role: body['roles'][role]['topDescriptor']['digest'] for role in ROLES},
            'baseline': previous, 'verifyRunSha256': run_sha,
            'recoveryProofSha256': proof_sha, 'buildRecordSha256': body['buildRecordSha256'],
            'preflightRecordSha256': file_sha(dest / 'preflight.json'),
            'ownerReleaseGo': 'REQUIRED_EXTERNAL_RECORD'}


def checked_preflight(value: str, graph_root: Path | None = None) -> tuple[dict, dict, dict]:
    path = recovery.private_file(value, 2 * 1024 * 1024)
    plan = read_private_json(value)
    need(plan.get('format') == 'RELEASE282-PREFLIGHT-V1'
         and plan.get('planSha256') == sha(canonical({k: v for k, v in plan.items()
                                                    if k != 'planSha256'})), 'PREFLIGHT_TAMPER')
    state = source_state(online=True)
    need(state['clean'] and state['originMatches'] and state['originMainMatches']
         and all(state[key] == plan['source'][key]
                 for key in ('commit', 'tree', 'version', 'clean', 'originMatches',
                             'originMainMatches')), 'PREFLIGHT_SOURCE_DRIFT')
    need(plan['refs'] == refs(state['version'], state['commit'])
         and plan['baseline'] == BASELINE, 'PREFLIGHT_REFS')
    for name, digest in plan['toolSha256'].items():
        need(name in ('release_local.py', 'release_local_oci.py', 'release_local_registry.py',
                      'release_local_compat.py', 'verify_local_recovery.py')
             and file_sha(SRC / 'scripts' / name) == digest, 'PREFLIGHT_TOOL_DRIFT')
    paths = plan['paths']
    record, build_file, graphs = load_build(paths['build'], graph_root=graph_root)
    need(record['sourceCommit'] == state['commit'] and record['sourceTree'] == state['tree']
         and record['version'] == state['version'] and record['cleanAtBuild'] is True
         and file_sha(build_file) == plan['buildRecordSha256'], 'PREFLIGHT_BUILD_DRIFT')
    _, run_sha = verify_run(paths['verifyRun'], state, paths['recoveryInput'])
    need(run_sha == plan['verifyRunSha256'], 'PREFLIGHT_VERIFY_DRIFT')
    proof = recovery.input_paths(paths['recoveryInput'])
    need(file_sha(recovery.private_file(paths['recoveryInput'], 1024 * 1024))
         == plan['recoveryProofSha256'] and proof['archiveSha256']
         == plan['recoveryArchiveSha256'], 'PREFLIGHT_RECOVERY_DRIFT')
    for role in ROLES:
        need(graphs[role]['topDescriptor'] == plan['roles'][role]['topDescriptor']
             and graphs[role]['manifestDescriptor'] == plan['roles'][role]['manifestDescriptor']
             and record['roles'][role]['imageId'] == plan['roles'][role]['imageId'],
             'PREFLIGHT_GRAPH_DRIFT')
    return plan, record, graphs


def approval(value: str, plan: dict) -> dict:
    """Operator records a real Owner conversation; this is not identity proof."""
    path = recovery.private_file(value, 128 * 1024)
    item = read_private_json(str(path), 128 * 1024)
    expected = {role: plan['roles'][role]['topDescriptor']['digest'] for role in ROLES}
    need(item.get('format') == 'RELEASE282-OWNER-GO-V1'
         and item.get('conversationRef') and isinstance(item.get('conversationRef'), str)
         and len(item['conversationRef']) <= 300
         and item.get('recordedBy') and isinstance(item.get('recordedBy'), str)
         and item.get('verbatimOwnerReply') and isinstance(item.get('verbatimOwnerReply'), str)
         and 1 <= len(item['verbatimOwnerReply']) <= 4000
         and any(word in item['verbatimOwnerReply'].casefold()
                 for word in ('go', 'approve', '승인', '진행'))
         and item.get('presentedPlanSha256') == plan['planSha256']
         and item.get('sourceCommit') == plan['source']['commit']
         and item.get('version') == plan['source']['version']
         and item.get('roleDigests') == expected
         and item.get('candidateRefs') == plan['refs']['candidate']
         and item.get('finalRefs') == plan['refs']['final'], 'OWNER_GO_BINDING')
    return {'recordSha256': file_sha(path), 'conversationRef': item['conversationRef'],
            'authority': 'OPERATOR_RECORDED_OWNER_CONVERSATION_NOT_CRYPTOGRAPHIC'}


def credential(value: str | None) -> str:
    if value:
        path = recovery.private_file(value, 4096)
        token = path.read_text().strip()
        need(token and len(token) <= 4096 and not any(c in token for c in '\r\n'),
             'GHCR_TOKEN_REQUIRED')
        return token
    return ghcr_token()


def readback(client, refs_map: dict, graphs: dict, source: dict) -> dict:
    with tempfile.TemporaryDirectory(prefix='r282-remote-graph-') as scratch:
        return registry.graph_readback(client, refs_map, graphs, Path(scratch),
                                       source['commit'], source['version'])


def publisher_lock() -> registry.Lock:
    # Fixed owner-private path serializes all local worktrees for this GHCR repo.
    directory = Path(tempfile.gettempdir()) / ('layoutmanager-release282-' + str(os.getuid()))
    if not directory.exists():
        directory.mkdir(mode=0o700)
    need(not directory.is_symlink() and directory.is_dir()
         and directory.stat().st_uid == os.getuid()
         and directory.stat().st_mode & 0o077 == 0, 'PUBLISHER_LOCK_DIR')
    return registry.Lock(directory / 'publisher.lock')


def checked_candidate_receipt(workspace: Path, plan: dict, owner: dict) -> dict:
    receipt_path = workspace / 'candidate.receipt.json'
    receipt = read_private_json(str(receipt_path))
    journal_path = workspace / 'candidate.journal.jsonl'
    rows = registry.read_journal(journal_path, plan['planSha256'], 'candidate')
    need(receipt.get('state') == 'CANDIDATE_VERIFIED'
         and receipt.get('planSha256') == plan['planSha256']
         and receipt.get('ownerRecordSha256') == owner['recordSha256']
         and receipt.get('refs') == plan['refs']['candidate']
         and receipt.get('baseline') == BASELINE
         and receipt.get('journalSha256') == file_sha(journal_path)
         and receipt.get('journalLastSha256') == rows[-1]['sha256']
         and rows[-1].get('event') == 'VERIFIED'
         and rows[-1].get('readback') == receipt.get('readback')
         and all(row.get('event') != 'HALT' for row in rows),
         'CANDIDATE_RECEIPT_JOURNAL')
    return receipt


def publish_stage(stage: str, preflight_path: str, owner_path: str,
                  credential_path: str | None, *, execute: bool) -> dict:
    need(execute and stage in ('candidate', 'final'), 'EXPLICIT_EXECUTE_REQUIRED')
    plan_file = recovery.private_file(preflight_path, 2 * 1024 * 1024)
    workspace = plan_file.parent
    lock = publisher_lock()
    try:
        with tempfile.TemporaryDirectory(prefix='r282-publish-graph-') as scratch:
            plan, _, graphs = checked_preflight(preflight_path, Path(scratch))
            owner = approval(owner_path, plan)
            journal_path = workspace / (stage + '.journal.jsonl')
            receipt_path = workspace / (stage + '.receipt.json')
            need(not journal_path.exists() and not receipt_path.exists(), 'ATTEMPT_ALREADY_EXISTS')
            if stage == 'final':
                candidate_receipt = checked_candidate_receipt(workspace, plan, owner)
            token = credential(credential_path)
            reader = registry.GHCR(token, allowed_tags(plan['refs']), write=False)
            registry.check_baseline(reader, BASELINE)
            if stage == 'final':
                candidate = readback(reader, plan['refs']['candidate'], graphs, plan['source'])
                need(candidate == candidate_receipt['readback'], 'CANDIDATE_DRIFT')
            registry.absent(reader, plan['refs'][stage])
            journal = registry.Journal(journal_path, plan['planSha256'], stage)
            try:
                writer = registry.GHCR(token, allowed_tags(plan['refs']), journal,
                                       write=True)
                writer.bind(graphs, plan['refs'][stage])
                registry.check_baseline(writer, BASELINE)
                registry.absent(writer, plan['refs'][stage])
                target_tags = registry.tags(plan['refs'][stage])
                for role in ROLES:
                    graph = graphs[role]
                    if stage == 'candidate':
                        for item in graph['objects'].values():
                            if item['kind'] == 'blob':
                                writer.upload_blob(item, Path(item['path']))
                                journal.append({'event': 'BLOB_CONFIRMED', 'role': role,
                                                'digest': item['digest']})
                        for digest in graph['manifestOrder'][:-1]:
                            item = graph['objects'][digest]
                            existing = writer.manifest(digest)
                            if existing is None:
                                writer.put_manifest(digest, item, Path(item['path']).read_bytes())
                                journal.append({'event': 'CHILD_CONFIRMED', 'role': role,
                                                'digest': digest})
                            else:
                                need(existing['digest'] == digest
                                     and existing['mediaType'] == item['mediaType'],
                                     'CHILD_CONFLICT')
                    need(writer.manifest(target_tags[role]) is None,
                         'TARGET_REF_APPEARED')
                    top = graph['objects'][graph['digest']]
                    writer.put_manifest(target_tags[role], top,
                                        Path(top['path']).read_bytes())
                    journal.append({'event': 'ROLE_CONFIRMED', 'role': role,
                                    'ref': target_tags[role], 'digest': graph['digest']})
                observed = readback(writer, plan['refs'][stage], graphs, plan['source'])
                registry.pull_smoke(plan['refs'][stage], observed)
                registry.check_baseline(writer, BASELINE)
                if stage == 'final':
                    need(readback(writer, plan['refs']['candidate'], graphs,
                                  plan['source']) == candidate, 'CANDIDATE_DRIFT')
                journal.append({'event': 'VERIFIED', 'readback': observed})
                rows = registry.read_journal(journal_path, plan['planSha256'], stage)
                receipt = {'format': 'RELEASE282-RECEIPT-V1',
                           'state': 'CANDIDATE_VERIFIED' if stage == 'candidate' else 'COMPLETE',
                           'planSha256': plan['planSha256'], 'ownerRecordSha256': owner['recordSha256'],
                           'ownerConversationRef': owner['conversationRef'],
                           'ownerAuthority': owner['authority'], 'source': plan['source'],
                           'refs': plan['refs'][stage], 'readback': observed,
                           'baseline': BASELINE, 'journalSha256': file_sha(journal_path),
                           'journalLastSha256': rows[-1]['sha256'],
                           'limits': {'offHost': 'NOT_RUN', 'actualUserLogin': 'NOT_RUN',
                                      'hostWriterExclusion': 'NOT_PROVEN',
                                      'readyScene': 'NOT_EXERCISED'}}
                private_json(receipt_path, receipt)
                return {'state': receipt['state'], 'planSha256': plan['planSha256'],
                        'readback': observed, 'receiptSha256': file_sha(receipt_path)}
            except BaseException:
                try:
                    journal.append({'event': 'HALT', 'partialState': 'UNKNOWN_OR_PARTIAL'})
                except BaseException:
                    pass
                raise
            finally:
                journal.close()
    finally:
        lock.close()


def reconcile(preflight_path: str, credential_path: str | None) -> dict:
    path = recovery.private_file(preflight_path, 2 * 1024 * 1024)
    plan = read_private_json(str(path))
    need(plan.get('format') == 'RELEASE282-PREFLIGHT-V1', 'PREFLIGHT_RECORD')
    reader = registry.GHCR(credential(credential_path), allowed_tags(plan['refs']), write=False)
    observed = {}
    for stage in ('candidate', 'final'):
        journal = path.parent / (stage + '.journal.jsonl')
        rows = registry.read_journal(journal, plan['planSha256'], stage) if journal.exists() else []
        refs_map = registry.tags(plan['refs'][stage])
        observed[stage] = {'journalEvents': len(rows), 'refs': {}}
        for role, tag in refs_map.items():
            item = reader.manifest(tag)
            observed[stage]['refs'][role] = item['digest'] if item else None
    observed['baseline'] = registry.check_baseline(reader, BASELINE)
    observed['state'] = 'READ_ONLY_RECONCILE_NO_AUTO_RESUME'
    return observed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('plan', 'build', 'preflight', 'candidate', 'final', 'reconcile'))
    parser.add_argument('--output-dir')
    parser.add_argument('--build-record')
    parser.add_argument('--recovery-input')
    parser.add_argument('--verify-run')
    parser.add_argument('--credential-file')
    parser.add_argument('--owner-record')
    parser.add_argument('--preflight-record')
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    try:
        if args.action == 'plan':
            build_record = read_private_json(args.build_record) if args.build_record else None
            print(json.dumps(public_plan(build_record), sort_keys=True))
        elif args.action == 'build':
            need(args.output_dir is not None, 'OUTPUT_REQUIRED')
            print(json.dumps(build(args.output_dir), sort_keys=True))
        elif args.action == 'preflight':
            need(all((args.output_dir, args.build_record, args.recovery_input, args.verify_run)),
                 'PREFLIGHT_ARGUMENTS')
            print(json.dumps(preflight(args.build_record, args.recovery_input,
                                       args.verify_run, args.output_dir), sort_keys=True))
        elif args.action in ('candidate', 'final'):
            need(args.preflight_record and args.owner_record, 'PUBLISH_ARGUMENTS')
            print(json.dumps(publish_stage(args.action, args.preflight_record,
                                           args.owner_record, args.credential_file,
                                           execute=args.execute), sort_keys=True))
        elif args.action == 'reconcile':
            need(args.preflight_record, 'RECONCILE_ARGUMENTS')
            print(json.dumps(reconcile(args.preflight_record, args.credential_file), sort_keys=True))
        else:
            raise Halt('ACTION_NOT_IMPLEMENTED')
        return 0
    except (Halt, registry.Blocked, oci.Invalid, recovery.Rejected, compat.Incompatible,
            OSError, ValueError, TypeError,
            KeyError, subprocess.TimeoutExpired, tarfile.TarError, json.JSONDecodeError) as error:
        code = str(error) if isinstance(error, (Halt, registry.Blocked, oci.Invalid,
                                                recovery.Rejected, compat.Incompatible)) else 'RELEASE282_HALT'
        print(code, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
