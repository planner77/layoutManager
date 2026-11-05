#!/usr/bin/env python3
"""RP: exact hosted source guard, sanitized subjects, and verified OIDC policy.

This code cannot create a signature. Only the pinned actions/attest action in a
trusted workflow can sign the four actual same-run subjects.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

import verified_negative as vn
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[3]
REPO = 'planner77/layoutManager'
REPO_ID = '1359528829'
OWNER_ID = '45478892'
WORKFLOW = '.github/workflows/release-proof.yml'
SIGNER = REPO + '/' + WORKFLOW
SIGNER_URI = 'https://github.com/' + SIGNER + '@refs/heads/main'
ROLES = ('app', 'migrator', 'cpu-worker')
STAGES = ('prepare', 'old_install', 'old_business', 'upgrade', 'current_start',
          'current_http_worker_viewer', 'formal_restore', 'old_digest_readback')
SUBJECTS = {role: 'proof-' + role + '-manifest.json' for role in ROLES}
SUBJECTS['receipt'] = 'proof-receipt.json'
SHA = re.compile(r'[0-9a-f]{40}\Z')
DIGEST = re.compile(r'sha256:[0-9a-f]{64}\Z')

class Blocked(Exception):
    pass

def require(ok, code):
    if not ok:
        raise Blocked(code)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def read_json(path):
    return json.loads(Path(path).read_text())

def write_new(path, raw):
    path = Path(path)
    require(not path.exists() and path.parent.is_dir() and not path.parent.is_symlink(),
            'RP_OUTPUT_EXISTS_OR_PARENT_INVALID')
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(raw)

def run(args, timeout=60, env=None):
    try:
        result = subprocess.run(args, cwd=ROOT, env=env, capture_output=True,
                                text=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise Blocked('RP_COMMAND_UNAVAILABLE') from error
    require(result.returncode == 0, 'RP_COMMAND_FAILED')
    return result.stdout.strip()

def guard(context, git=lambda *args: run(['git', *args], timeout=20)):
    source, tree = context.get('RP_SOURCE_COMMIT', ''), context.get('RP_EXPECTED_TREE', '')
    workflow = context.get('GITHUB_WORKFLOW_SHA', '')
    require(context.get('GITHUB_ACTIONS') == 'true' and
            context.get('GITHUB_EVENT_NAME') == 'workflow_dispatch' and
            context.get('GITHUB_REPOSITORY') == REPO and
            context.get('GITHUB_REPOSITORY_ID') == REPO_ID and
            context.get('GITHUB_REPOSITORY_OWNER_ID') == OWNER_ID and
            context.get('GITHUB_REF') == 'refs/heads/main' and
            context.get('GITHUB_WORKFLOW_REF') == SIGNER + '@refs/heads/main' and
            context.get('RUNNER_ENVIRONMENT') == 'github-hosted' and
            SHA.fullmatch(source) and SHA.fullmatch(workflow) and SHA.fullmatch(tree) and
            source == workflow == context.get('GITHUB_SHA') and
            re.fullmatch(r'[1-9][0-9]*', context.get('GITHUB_RUN_ID', '')) and
            re.fullmatch(r'[1-9][0-9]*', context.get('GITHUB_RUN_ATTEMPT', '')),
            'RP_TRUSTED_DISPATCH_INVALID')
    require(git('rev-parse', 'HEAD') == source and
            git('rev-parse', source + '^{tree}') == tree and
            git('cat-file', '-t', source) == 'commit',
            'RP_EXACT_SOURCE_TREE_INVALID')
    return {'sourceCommit': source, 'sourceTree': tree, 'workflowCommit': workflow,
            'runId': context['GITHUB_RUN_ID'], 'runAttempt': context['GITHUB_RUN_ATTEMPT']}

def rr1_module():
    spec = importlib.util.spec_from_file_location('rp_rr1', ROOT / 'src/tests/oci/rr1-registry-proof.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def subject_map(public):
    public = Path(public)
    require(public.is_dir() and not public.is_symlink(), 'RP_PUBLIC_DIR_INVALID')
    expected = set(SUBJECTS.values())
    entries = list(public.iterdir())
    require(all(item.is_file() and not item.is_symlink() for item in entries),
            'RP_PUBLIC_ARTIFACT_TYPE_INVALID')
    actual = {item.name for item in entries}
    require(expected <= actual and actual <= expected | {'SHA256SUMS', 'proof-bundle.sigstore.json',
                                                          'verification.json'},
            'RP_PUBLIC_ARTIFACT_ALLOWLIST_INVALID')
    return {role: sha((public / name).read_bytes()) for role, name in SUBJECTS.items()}

def public_allowlist(public):
    public = Path(public)
    if not public.exists():
        return
    require(public.is_dir() and not public.is_symlink(), 'RP_PUBLIC_DIR_INVALID')
    allowed = set(SUBJECTS.values()) | {'SHA256SUMS','proof-bundle.sigstore.json',
                                        'verification.json'}
    require(all(item.name in allowed and item.is_file() and not item.is_symlink()
                for item in public.iterdir()), 'RP_PUBLIC_ARTIFACT_ALLOWLIST_INVALID')

def validate_run(rr1, rr2, build, expected):
    require(rr1.get('kind') == 'RR1_LOCAL_UNSIGNED_REGISTRY_RECEIPT' and
            rr1.get('retainedForR2') is True and
            rr1.get('sourceCommit') == expected['sourceCommit'] and
            rr1.get('sourceTree') == expected['sourceTree'] and
            build.get('sourceCommit') == expected['sourceCommit'] and
            build.get('sourceTree') == expected['sourceTree'] and
            build.get('sourceMode') == 'CI_GIT_ARCHIVE' and
            re.fullmatch(r'[0-9a-f]{64}', build.get('sourceArchiveSha256', '')) and
            rr2.get('kind') == 'RR2_RR3_JOURNEY' and
            rr2.get('result') == 'PASS' and rr2.get('ownedCleanup') == 'PASS' and
            rr2.get('stages') == list(STAGES) and
            rr2.get('newSource') == expected['sourceCommit'] and
            rr2.get('oldSource') == '9eb8ac764ddb658bf8f9aaef9f15f18e099f9f63' and
            rr1.get('version') == '0.61.0' and
            set(rr1.get('manifests', {})) == set(ROLES), 'RP_SAME_RUN_ACTUAL_PROOF_INCOMPLETE')

def export_raw(rr1_path, rr2_path, build_path, public_dir, context):
    expected = guard(context)
    rr1, rr2, build = (read_json(path) for path in (rr1_path, rr2_path, build_path))
    validate_run(rr1, rr2, build, expected)
    public = Path(public_dir)
    require(not public.exists(), 'RP_PUBLIC_DIR_EXISTS')
    public.mkdir(mode=0o700, parents=True)
    module = rr1_module()
    host = rr1['host']
    require(re.fullmatch(r'127\.0\.0\.1:[0-9]{4,5}', host), 'RP_REGISTRY_HOST_INVALID')
    for role in ROLES:
        prior = rr1['manifests'][role]
        digest = prior.get('digest', '')
        require(DIGEST.fullmatch(digest) and
                rr1['refs'][role] == host + '/rr1-release@' + digest,
                'RP_ROLE_DIGEST_INVALID')
        try:
            verified = module.verify_registry_image('http://' + host, 'rr1-release', digest, {})
        except module.ProofError as error:
            raise Blocked('RP_REGISTRY_GRAPH_INVALID') from error
        require(all(prior.get(key) == verified[key] for key in
                    ('digest','manifestDigest','configDigest','topDescriptor',
                     'manifestDescriptor','layers')), 'RP_REGISTRY_GRAPH_CHANGED')
        request = Request('http://' + host + '/v2/rr1-release/manifests/' + digest,
                          headers={'Accept': module.MANIFEST_ACCEPT})
        try:
            with urlopen(request, timeout=20) as response:
                raw = response.read(2 * 1024 * 1024 + 1)
                media = response.headers.get('Content-Type', '').split(';', 1)[0]
        except OSError as error:
            raise Blocked('RP_REGISTRY_RAW_UNAVAILABLE') from error
        require(len(raw) <= 2 * 1024 * 1024 and 'sha256:' + sha(raw) == digest and
                len(raw) == verified['topDescriptor']['size'] and
                media == verified['topDescriptor']['mediaType'],
                'RP_REGISTRY_RAW_CHANGED')
        write_new(public / SUBJECTS[role], raw)
    print('RP_RAW_THREE_ROLE_MANIFESTS_EXPORTED')

def verify_rr2_absent(receipt_path, *, timeout_probe=False):
    receipt = read_json(receipt_path)
    nonce = receipt.get('nonce', '')
    prefix = 'rr2-timeout-' if timeout_probe else 'rr2-'
    require(re.fullmatch(r'[0-9a-f]{16}', nonce) and
            Path(receipt_path).resolve() ==
            (ROOT / 'data/release-proof' / (prefix + nonce) / 'receipt.json').resolve(),
            'RP_RR2_ABSENCE_RECEIPT_INVALID')
    module = rr1_module()
    resources = [('volume', receipt['liveVolume'])]
    if not timeout_probe:
        resources += [('container', receipt['appName']),
                      ('container', receipt['restoreAppName']),
                      ('volume', receipt['restoreVolume']),
                      ('network', receipt['network']),
                      ('network', receipt['restoreNetwork'])]
    resources += [('container', row['name']) for row in
                  receipt.get('children', []) + receipt.get('hostChildren', [])]
    for kind, name in resources:
        require(module.docker_optional_inspect(kind, name) is None,
                'RP_RR2_RESOURCE_REAPPEARED')
    if not timeout_probe:
        for project in (receipt['project'], receipt['restoreProject']):
            require(not run(['docker','ps','--all','--quiet','--filter',
                             'label=com.docker.compose.project=' + project], timeout=30),
                    'RP_RR2_PROJECT_RESOURCE_REAPPEARED')

def cleanup_scope(rr1_path, old_path, new_path, rr2_path, owned, timeout_receipts):
    private = os.environ.get('RP_PROOF_DIR', '')
    require(private and Path(private).is_absolute() and
            not Path(private).is_symlink(), 'RP_CLEANUP_PRIVATE_DIR_INVALID')
    private = Path(private).resolve()
    expected_paths = ((rr1_path, 'rr1-registry-receipt.json'),
                      (old_path, 'rr2-old-pair.json'),
                      (new_path, 'rr1-registry-receipt.json'),
                      (rr2_path, 'rr2-journey.json'))
    require(all(Path(path).resolve() == private / name for path, name in expected_paths),
            'RP_CLEANUP_PRIVATE_PATH_INVALID')
    expected_run = guard(os.environ)
    require(Path(rr1_path).is_file(), 'RP_RR1_CLEANUP_RECEIPT_MISSING')
    rr1 = read_json(rr1_path)
    require(rr1.get('kind') == 'RR1_LOCAL_UNSIGNED_REGISTRY_RECEIPT' and
            rr1.get('retainedForR2') is True and
            rr1.get('sourceCommit') == expected_run['sourceCommit'] and
            rr1.get('sourceTree') == expected_run['sourceTree'],
            'RP_RR1_CLEANUP_SOURCE_INVALID')
    resources = rr1.get('resources', {})
    for path in owned:
        require(Path(old_path).is_file(), 'RP_OLD_CLEANUP_RECEIPT_MISSING')
        receipt = read_json(path)
        images = receipt.get('images', {})
        require(receipt.get('kind') == 'RR2_OWNED_NAMESPACE' and
                receipt.get('nonce') == path.parent.name.removeprefix('rr2-') and
                images.get('newSource') == expected_run['sourceCommit'] and
                images.get('new') == rr1.get('refs') and
                images.get('newReceiptSha256') == sha(Path(rr1_path).read_bytes()) and
                images.get('oldReceiptSha256') == sha(Path(old_path).read_bytes()) and
                images.get('newRegistryCid') == resources.get('registryCid') and
                images.get('newRegistryNonce') == resources.get('nonce'),
                'RP_RR2_CLEANUP_RUN_BINDING_INVALID')
    for path in timeout_receipts:
        receipt = read_json(path)
        require(receipt.get('nonce') == path.parent.name.removeprefix('rr2-timeout-') and
                receipt.get('images', {}).get('new', {}).get('cpu-worker') ==
                rr1.get('refs', {}).get('cpu-worker'),
                'RP_TIMEOUT_CLEANUP_RUN_BINDING_INVALID')
    return expected_run, rr1

def cleanup(rr1_path, old_path, new_path, rr2_path):
    failures = []
    marker = Path(rr1_path).parent / 'rp-cleanup-complete.json'
    # This private marker is only a retry aid. It is never evidence of absence:
    # every invocation inspects the exact owned resources again below.
    marker_payload = None
    try:
        rr2 = read_json(rr2_path) if Path(rr2_path).is_file() else None
    except (ValueError, OSError):
        rr2 = None
        failures.append('RR2_RESULT')
    candidates = list((ROOT / 'data/release-proof').glob('rr2-*/receipt.json'))
    owned = [path for path in candidates
             if re.fullmatch(r'rr2-[0-9a-f]{16}', path.parent.name)]
    timeout_receipts = [path for path in candidates
                        if re.fullmatch(r'rr2-timeout-[0-9a-f]{16}', path.parent.name)]
    if Path(rr1_path).is_file() or owned or timeout_receipts or Path(rr2_path).is_file():
        expected_run, scoped_rr1 = cleanup_scope(rr1_path, old_path, new_path,
                                                   rr2_path, owned, timeout_receipts)
    else:
        print('RP_NO_OWNED_RECEIPTS_TO_CLEAN')
        return
    if owned or (rr2 and re.fullmatch(r'[0-9a-f]{16}', rr2.get('nonce', ''))):
        if rr2 is None:
            require(len(owned) == 1 and not Path(rr2_path).exists(),
                    'RP_RR2_PARTIAL_OWNED_SET_INVALID')
            expected = owned[0]
        else:
            require(re.fullmatch(r'[0-9a-f]{16}', rr2.get('nonce', '')),
                    'RP_RR2_SUMMARY_OWNERSHIP_MISSING')
            expected = ROOT / 'data/release-proof' / ('rr2-' + rr2['nonce']) / 'receipt.json'
            require(set(owned) == {expected}, 'RP_RR2_OWNED_SET_INVALID')
    if (rr2 and rr2.get('result') == 'PASS' and
            all(Path(path).is_file() for path in (rr1_path, old_path, rr2_path))):
        require(re.fullmatch(r'[0-9a-f]{16}', rr2.get('nonce', '')),
                'RP_RR2_NONCE_INVALID')
        rr1_for_marker = scoped_rr1
        require(rr2.get('ownedCleanup') == 'PASS' and
                rr2.get('stages') == list(STAGES) and
                rr2.get('newSource') == expected_run['sourceCommit'] and
                rr1_for_marker.get('sourceCommit') == expected_run['sourceCommit'] and
                rr1_for_marker.get('sourceTree') == expected_run['sourceTree'] and
                rr2.get('newImage') == rr1_for_marker.get('refs'),
                'RP_CLEANUP_RUN_BINDING_INVALID')
        marker_payload = {'kind':'RP_EXACT_OWNED_CLEANUP', **expected_run,
                          'rr1ReceiptSha256':sha(Path(rr1_path).read_bytes()),
                          'rr2ReceiptSha256':sha(Path(rr2_path).read_bytes()),
                          'oldReceiptSha256':sha(Path(old_path).read_bytes()),
                          'rr2OwnedReceiptSha256':sha(expected.read_bytes()),
                          'ownedReceipts':{str(path.relative_to(ROOT)):sha(path.read_bytes())
                                           for path in sorted(owned)},
                          'timeoutReceipts':{str(path.relative_to(ROOT)):sha(path.read_bytes())
                                             for path in sorted(timeout_receipts)},
                          'rr2Nonce':rr2['nonce']}
    if marker.exists():
        require(marker_payload is not None and read_json(marker) == marker_payload,
                'RP_CLEANUP_MARKER_CHANGED')
        verify_rr2_absent(expected)
        for receipt in timeout_receipts:
            verify_rr2_absent(receipt, timeout_probe=True)
    for receipt in ([] if marker.exists() else owned):
        env = dict(os.environ, RR2_OLD_PAIR_RECEIPT=str(Path(old_path).resolve()),
                   RR2_CURRENT_TRIPLET_RECEIPT=str(Path(new_path).resolve()))
        try:
            run([sys.executable, str(ROOT / 'src/tests/oci/rr2-recovery-proof.py'),
                 'cleanup', '--receipt', str(receipt)], timeout=180, env=env)
        except Blocked:
            failures.append('RR2')
    for receipt in ([] if marker.exists() else timeout_receipts):
        try:
            run([sys.executable, str(ROOT / 'src/tests/oci/rr2-timeout-probe.py'),
                 '--cleanup-receipt', str(receipt)], timeout=90)
        except Blocked:
            failures.append('RR2_TIMEOUT')
    if Path(rr1_path).is_file() and not marker.exists():
        try:
            run([sys.executable, str(ROOT / 'src/tests/oci/rr1-registry-proof.py'),
                 '--cleanup-receipt', str(rr1_path)], timeout=180)
        except Blocked:
            failures.append('RR1')
    require(not failures, 'RP_OWNED_CLEANUP_FAILED')
    if marker_payload is not None and not marker.exists():
        verify_rr2_absent(expected)
        for receipt in timeout_receipts:
            verify_rr2_absent(receipt, timeout_probe=True)
    if Path(rr1_path).is_file():
        rr1 = read_json(rr1_path)
        require(rr1.get('kind') == 'RR1_LOCAL_UNSIGNED_REGISTRY_RECEIPT' and
                rr1.get('retainedForR2') is True, 'RP_RR1_CLEANUP_RECEIPT_INVALID')
        module = rr1_module()
        resources = rr1['resources']
        for kind, name in (('container',resources['registryCid']),
                           ('container',resources['registryName']),
                           ('network',resources['network']),('volume',resources['volume'])):
            require(module.docker_optional_inspect(kind,name) is None,
                    'RP_RR1_CLEANUP_INCOMPLETE')
        for role in ROLES:
            tag = rr1['host'] + '/rr1-release:' + role.replace('-', '') + '-' + resources['nonce']
            for ref in (tag, rr1['refs'][role]):
                require(module.docker_optional_inspect('image',ref) is None,
                        'RP_RR1_REF_CLEANUP_INCOMPLETE')
        if not marker.exists() and marker_payload is not None:
            write_new(marker, (json.dumps(marker_payload,sort_keys=True)+'\n').encode())
    print('RP_PARTIAL_OWNED_CLEANUP_ONLY' if rr2 is None else
          'RP_OWNED_RR2_RR1_CLEANUP_PASS')

def sanitized(rr1, rr2, build, expected):
    validate_run(rr1, rr2, build, expected)
    require(set(rr2.get('oldImage', {})) == {'app','migrator'} and
            set(rr2.get('newImage', {})) == set(ROLES), 'RP_IMAGE_SET_INVALID')
    roles = {}
    for role in ROLES:
        entry = rr1['manifests'][role]
        require(rr2['newImage'][role] == rr1['refs'][role] and
                DIGEST.fullmatch(entry['digest']) and
                DIGEST.fullmatch(entry['manifestDigest']) and
                DIGEST.fullmatch(entry['configDigest']), 'RP_ROLE_MAPPING_INVALID')
        roles[role] = {'subjectName': SUBJECTS[role], 'manifestDigest': entry['digest'],
                       'platformManifestDigest': entry['manifestDigest'],
                       'configDigest': entry['configDigest'],
                       'mediaType': entry['topDescriptor']['mediaType']}
    old = {}
    for role in ('app','migrator'):
        ref = rr2['oldImage'][role]
        require(re.fullmatch(r'ghcr\.io/planner77/layoutmanager@sha256:[0-9a-f]{64}', ref),
                'RP_OLD_PAIR_REF_INVALID')
        old[role] = ref.split('@', 1)[1]
    return {'kind':'RP_SANITIZED_PROOF_RECEIPT', 'repository':REPO,
            'repositoryId':REPO_ID, 'repositoryOwnerId':OWNER_ID,
            **expected, 'archiveSha256':build['sourceArchiveSha256'],
            'version':rr1['version'], 'platform':'linux/amd64', 'roles':roles,
            'oldPair':{'sourceCommit':rr2['oldSource'],'manifestDigests':old},
            'execution':{'rr1':'PASS','rr2rr3':'PASS','stages':list(STAGES),
                         'rr2Cleanup':'PASS','rr1Cleanup':'PASS'},
            'limitations':['loopback_unsigned_registry_not_GHCR_publication',
                           'old_private_GHCR_pair_read_only',
                           'not_formal_publisher_or_owner_go']}

def finalize(rr1_path, rr2_path, build_path, old_path, public_dir, context):
    expected = guard(context)
    rr1, rr2, build = (read_json(path) for path in (rr1_path, rr2_path, build_path))
    validate_run(rr1, rr2, build, expected)
    public = Path(public_dir)
    require(public.is_dir() and set(SUBJECTS[role] for role in ROLES) <=
            {item.name for item in public.iterdir()}, 'RP_RAW_SUBJECTS_MISSING')
    for role in ROLES:
        require('sha256:' + sha((public / SUBJECTS[role]).read_bytes()) ==
                rr1['manifests'][role]['digest'], 'RP_RAW_SUBJECT_CHANGED')
    cleanup(rr1_path, old_path, rr1_path, rr2_path)
    receipt = sanitized(rr1, rr2, build, expected)
    write_new(public / SUBJECTS['receipt'],
              (json.dumps(receipt, sort_keys=True, separators=(',', ':')) + '\n').encode())
    mapping = subject_map(public)
    for role in ROLES:
        require('sha256:' + mapping[role] == receipt['roles'][role]['manifestDigest'],
                'RP_SUBJECT_ROLE_MISMATCH')
    checksums = ''.join(mapping[role] + '  ' + SUBJECTS[role] + '\n'
                        for role in (*ROLES, 'receipt'))
    write_new(public / 'SHA256SUMS', checksums.encode())
    print('RP_SANITIZED_FOUR_SUBJECTS_READY')

def checked_certificate(result, expected, mapping):
    require(isinstance(result, list) and result, 'RP_VERIFICATION_RESULT_EMPTY')
    wanted = {SUBJECTS[role]: mapping[role] for role in (*ROLES, 'receipt')}
    for item in result:
        value = item.get('verificationResult') or {}
        cert = ((value.get('signature') or {}).get('certificate') or {})
        statement = value.get('statement') or {}
        subjects = statement.get('subject') or []
        actual = {}
        for subject in subjects:
            name = subject.get('name')
            digest = (subject.get('digest') or {}).get('sha256')
            require(name not in actual and isinstance(name, str) and
                    re.fullmatch(r'[0-9a-f]{64}', digest or ''),
                    'RP_DUPLICATE_OR_INVALID_SUBJECT')
            actual[name] = digest
        if actual != wanted:
            continue
        require(cert.get('sourceRepositoryIdentifier') == REPO_ID and
                cert.get('sourceRepositoryOwnerIdentifier') == OWNER_ID and
                cert.get('sourceRepositoryURI') == 'https://github.com/' + REPO and
                cert.get('sourceRepositoryDigest') == expected['sourceCommit'] and
                cert.get('sourceRepositoryRef') == 'refs/heads/main' and
                cert.get('buildSignerURI') == SIGNER_URI and
                cert.get('buildSignerDigest') == expected['workflowCommit'] and
                cert.get('runnerEnvironment') == 'github-hosted' and
                cert.get('issuer') == 'https://token.actions.githubusercontent.com' and
                cert.get('runInvocationURI') ==
                'https://github.com/' + REPO + '/actions/runs/' + expected['runId'] +
                '/attempts/' + expected['runAttempt'] and
                statement.get('predicateType') == 'https://slsa.dev/provenance/v1',
                'RP_VERIFIED_CERTIFICATE_IDENTITY_INVALID')
        return True
    raise Blocked('RP_VERIFIED_SUBJECT_MAPPING_INVALID')

def negative_cause(label, result, approved):
    stderr = result.stderr
    require(result.returncode == 1 and not result.stdout.strip() and
            isinstance(stderr, str) and len(stderr) < 16384 and '\x00' not in stderr,
            'RP_NEGATIVE_EXIT_OR_OUTPUT_INVALID')
    # Pin each expected diagnostic to both the deliberately wrong probe value
    # and the independently approved actual identity. A generic CLI failure is
    # not evidence that the attestation policy rejected the intended mismatch.
    source = approved['sourceCommit']
    workflow = approved['workflowCommit']
    exact = {
        'wrongSource': ('expected SourceRepositoryDigest to be ' + '0' * 40 +
                        ', got ' + source, 'SOURCE_DIGEST_MISMATCH'),
        'wrongSignerCommit': ('expected BuildSignerDigest to be ' + '0' * 40 +
                              ', got ' + workflow, 'SIGNER_DIGEST_MISMATCH'),
        'wrongRef': ('expected SourceRepositoryRef to be refs/heads/wrong, got '
                     'refs/heads/main', 'SOURCE_REF_MISMATCH'),
    }
    forbidden = ('no attestations', 'unauthorized', 'authentication', 'permission denied',
                 'connection refused', 'network is unreachable', 'timed out', 'timeout',
                 'tuf', 'usage:', 'unknown flag', 'failed to fetch', 'failed to download',
                 'error parsing', 'invalid character', 'malformed json')
    require(not any(word in stderr.lower() for word in forbidden),
            'RP_NEGATIVE_INFRASTRUCTURE_OR_USAGE_FAILURE')
    if label in exact:
        phrase, cause = exact[label]
        require(phrase in stderr, 'RP_NEGATIVE_CAUSE_UNPROVEN_' + label.upper())
        return cause
    if label == 'wrongSignerWorkflow':
        # gh 2.103.3 policy.go signerWorkflowSANPattern uses regexp.QuoteMeta
        # plus an anchored optional ref. Match its exact wrong-workflow probe
        # pattern and approved actual SAN, not an arbitrary regex mentioning it.
        wrong_pattern = (r'^https://github\.com/' + REPO +
                         r'/\.github/workflows/wrong\.yml(@(refs/.*|[0-9a-fA-F]+))?$')
        mismatch = ('no matching CertificateIdentity found, last error: '
                    'expected SAN value to match regex "' + wrong_pattern +
                    '", got "' + SIGNER_URI + '"')
        require(mismatch in stderr,
                'RP_NEGATIVE_CAUSE_UNPROVEN_WRONGSIGNERWORKFLOW')
        return 'SIGNER_WORKFLOW_SAN_MISMATCH'
    if label in ('tamperedManifest', 'tamperedReceipt'):
        require('provided artifact digest does not match any digest in statement' in stderr,
                'RP_NEGATIVE_CAUSE_UNPROVEN_' + label.upper())
        return 'SUBJECT_DIGEST_MISMATCH'
    raise Blocked('RP_NEGATIVE_CASE_INVALID')

def negative_probe(gh, args, label, approved, classify=True):
    require(re.fullmatch(r'[A-Za-z]+', label), 'RP_NEGATIVE_LABEL_INVALID')
    private = Path(os.environ.get('RP_PROOF_DIR', ''))
    require(private.is_dir() and not private.is_symlink(),
            'RP_NEGATIVE_PRIVATE_DIR_INVALID')
    try:
        result = subprocess.run([gh, 'attestation', 'verify', *args],
                                capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.TimeoutExpired) as error:
        write_new(private / ('rp-negative-' + label + '.json'),
                  (json.dumps({'label':label,'class':'COMMAND_UNAVAILABLE_OR_TIMEOUT'},
                              sort_keys=True)+'\n').encode())
        raise Blocked('RP_NEGATIVE_COMMAND_UNAVAILABLE') from error
    write_new(private / ('rp-negative-' + label + '.json'),
              (json.dumps({'label':label,'exit':result.returncode,
                           'stdout':result.stdout,'stderr':result.stderr},
                          sort_keys=True)+'\n').encode())
    if not classify:
        return result
    cause = negative_cause(label, result, approved)
    print('RP_NEGATIVE_REJECTED case=' + label + ' class=' + cause +
          ' exit=' + str(result.returncode))
    return cause

def verify(public_dir, gh, context):
    expected = guard(context)
    public = Path(public_dir)
    mapping = subject_map(public)
    receipt = read_json(public / SUBJECTS['receipt'])
    old_spec = importlib.util.spec_from_file_location(
        'rp_old_pair', ROOT / 'src/tests/oci/rr2-old-pair.py')
    old_module = importlib.util.module_from_spec(old_spec)
    old_spec.loader.exec_module(old_module)
    expected_old = {role: 'sha256:' + old_module.ROLES[role][1]
                    for role in ('app','migrator')}
    require(receipt.get('kind') == 'RP_SANITIZED_PROOF_RECEIPT' and
            all(receipt.get(key) == expected[key] for key in expected) and
            receipt.get('repository') == REPO and
            receipt.get('repositoryId') == REPO_ID and
            receipt.get('repositoryOwnerId') == OWNER_ID and
            receipt.get('version') == '0.61.0' and
            receipt.get('platform') == 'linux/amd64' and
            re.fullmatch(r'[0-9a-f]{64}', receipt.get('archiveSha256', '')) and
            receipt.get('execution', {}).get('rr1Cleanup') == 'PASS' and
            receipt.get('execution', {}).get('rr2Cleanup') == 'PASS' and
            receipt.get('execution', {}).get('rr1') == 'PASS' and
            receipt.get('execution', {}).get('rr2rr3') == 'PASS' and
            receipt.get('execution', {}).get('stages') == list(STAGES) and
            receipt.get('oldPair') == {'sourceCommit':old_module.SOURCE,
                                       'manifestDigests':expected_old} and
            receipt.get('limitations') == [
                'loopback_unsigned_registry_not_GHCR_publication',
                'old_private_GHCR_pair_read_only',
                'not_formal_publisher_or_owner_go'] and
            set(receipt.get('roles', {})) == set(ROLES) and
            len(set(mapping[role] for role in ROLES)) == 3 and
            all(receipt['roles'][role]['subjectName'] == SUBJECTS[role] and
                receipt['roles'][role]['manifestDigest'] == 'sha256:' + mapping[role] and
                DIGEST.fullmatch(receipt['roles'][role].get('configDigest', '')) and
                DIGEST.fullmatch(receipt['roles'][role].get('platformManifestDigest', ''))
                for role in ROLES), 'RP_RECEIPT_SUBJECT_MAPPING_INVALID')
    bundle = public / 'proof-bundle.sigstore.json'
    require(bundle.is_file() and bundle.stat().st_size < 2 * 1024 * 1024,
            'RP_BUNDLE_MISSING')
    locked = {'binary': sha(Path(gh).read_bytes()), 'bundle': sha(bundle.read_bytes())}
    require(run([gh, '--version'], timeout=10).splitlines()[0].startswith('gh version 2.103.3 '),
            'RP_GH_VERSION_INVALID')
    flags = ['--repo', REPO, '--signer-workflow', SIGNER,
             '--signer-digest', expected['workflowCommit'],
             '--source-digest', expected['sourceCommit'],
             '--source-ref', 'refs/heads/main', '--deny-self-hosted-runners',
             '--format', 'json']
    for role in (*ROLES, 'receipt'):
        artifact = public / SUBJECTS[role]
        output = run([gh, 'attestation', 'verify', str(artifact), *flags], timeout=120)
        checked_certificate(json.loads(output), expected, mapping)
    checked_certificate(json.loads(run([gh, 'attestation', 'verify',
        str(public / SUBJECTS['app']), *flags, '--bundle', str(bundle)], timeout=120)),
        expected, mapping)
    # Both successful positives come from the same CLI/bundle around each
    # negative. Receipt predicates/booleans never establish this witness.
    evidence = []
    def reject(label, original, artifact, changed):
        positive_argv = [gh, 'attestation', 'verify', str(original), *flags, '--bundle', str(bundle)]
        negative_argv = [gh, 'attestation', 'verify', str(artifact), *changed, '--bundle', str(bundle)]
        def snapshot():
            paths = {'binary': Path(gh), 'bundle': bundle, 'original': original, 'probe': artifact}
            require(all(p.is_file() and not p.is_symlink() for p in paths.values()),
                    'RP_NEGATIVE_MATERIAL_PATH_INVALID')
            hashes = {k: sha(p.read_bytes()) for k, p in paths.items()}
            require(all(hashes[k] == v for k, v in locked.items()), 'RP_NEGATIVE_MATERIAL_CHANGED')
            return hashes
        def positive():
            before = snapshot()
            output = run(positive_argv, timeout=120)
            checked_certificate(json.loads(output), expected, mapping)
            require(snapshot() == before, 'RP_POSITIVE_MATERIAL_CHANGED')
            return {'argv': positive_argv, 'exit': 0, 'stdout': output, 'hashes': before}
        before = positive()
        result = negative_probe(gh, negative_argv[3:], label, expected, classify=False)
        after = positive()
        try:
            projected = vn.rp_negative(label, expected, mapping, str(original), str(artifact),
                gh, str(bundle), before, after, negative_argv, result, negative_cause)
        except vn.Rejected as error:
            raise Blocked(str(error)) from None
        evidence.append(projected)
        print('RP_NEGATIVE_VERIFIED case=' + label + ' boundary=' + projected['cliRejectionBoundary'])
    representative = public / SUBJECTS['app']
    negative = {
        'wrongSource': ['--source-digest', '0' * 40],
        'wrongSignerWorkflow': ['--signer-workflow', REPO + '/.github/workflows/wrong.yml'],
        'wrongSignerCommit': ['--signer-digest', '0' * 40],
        'wrongRef': ['--source-ref', 'refs/heads/wrong'],
    }
    for label, replacement in negative.items():
        changed = flags.copy()
        index = changed.index(replacement[0])
        changed[index + 1] = replacement[1]
        reject(label, representative, representative, changed)
    with tempfile.TemporaryDirectory(prefix='rp-tamper-') as directory:
        for role in ('app','receipt'):
            original = public / SUBJECTS[role]
            altered = Path(directory) / original.name
            raw = original.read_bytes()
            require(raw, 'RP_SUBJECT_EMPTY')
            altered.write_bytes(bytes([raw[0] ^ 1]) + raw[1:])
            label = 'tamperedManifest' if role == 'app' else 'tamperedReceipt'
            reject(label, original, altered, flags)
    require(all(sha((public / SUBJECTS[r]).read_bytes()) == mapping[r]
                for r in (*ROLES, 'receipt')) and
            sha(bundle.read_bytes()) == locked['bundle'] and
            sha(Path(gh).read_bytes()) == locked['binary'], 'RP_FINAL_VERIFIED_MATERIAL_CHANGED')
    metadata = {'kind':'RP_VERIFICATION_METADATA', 'sourceCommit':expected['sourceCommit'],
                'workflowCommit':expected['workflowCommit'], 'sourceTree':expected['sourceTree'],
                'runId':expected['runId'], 'runAttempt':expected['runAttempt'],
                'runUrl':'https://github.com/' + REPO + '/actions/runs/' + expected['runId'],
                'attestAction':'actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6',
                'ghVersion':'2.103.3', 'onlineVerification':True,
                'sameBundleVerification':True,
                'subjects':{SUBJECTS[role]:'sha256:' + mapping[role]
                            for role in (*ROLES,'receipt')},
                'certificateRepositoryId':REPO_ID, 'certificateOwnerId':OWNER_ID,
                'positiveSubjects':4,
                'negativeEvidence':evidence,
                'negativeEvidenceMeaning':'CLI rejection boundary plus verified-material own-policy projection',
                'actualNegativeChecks':['wrongSource','wrongSignerWorkflow',
                                        'wrongSignerCommit','wrongRef',
                                        'tamperedManifest','tamperedReceipt'],
                'verdict':'SIGNED_PROOF_VERIFIED_NOT_RELEASE_GO'}
    write_new(public / 'verification.json',
              (json.dumps(metadata, sort_keys=True, separators=(',', ':')) + '\n').encode())
    print('RP_GENUINE_ATTESTATION_VERIFIED')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('guard','export','finalize','cleanup','verify',
                                           'allowlist'))
    parser.add_argument('--rr1')
    parser.add_argument('--rr2')
    parser.add_argument('--build')
    parser.add_argument('--old')
    parser.add_argument('--public')
    parser.add_argument('--gh')
    options = parser.parse_args()
    try:
        if options.action == 'guard':
            guard(os.environ)
            print('RP_EXACT_DISPATCH_SOURCE_PASS')
        elif options.action == 'export':
            export_raw(options.rr1, options.rr2, options.build, options.public, os.environ)
        elif options.action == 'finalize':
            finalize(options.rr1, options.rr2, options.build, options.old,
                     options.public, os.environ)
        elif options.action == 'cleanup':
            cleanup(options.rr1, options.old, options.rr1, options.rr2)
        elif options.action == 'verify':
            verify(options.public, options.gh, os.environ)
        elif options.action == 'allowlist':
            public_allowlist(options.public)
            print('RP_PUBLIC_ARTIFACT_ALLOWLIST_PASS')
    except (Blocked, OSError, ValueError, TypeError, KeyError, AttributeError) as error:
        print('RP_PROOF_FAILED ' + (str(error) if isinstance(error, Blocked) else
                                   'RP_INVALID_STATE'), file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
