#!/usr/bin/env python3
"""RF-A/B fixed candidate publisher. Default plan: explicit fixtures, zero HTTP.

Executing this code is NOT Owner authorization. The separate environment review
and Owner-observed UI evidence must exist for the exact reviewed packet/run.
No final version tag, alias, Git ref, policy or environment mutation is provided.
"""
import argparse
import importlib.util
import os
from pathlib import Path
import re
import subprocess
import sys

import candidate_policy as policy
import candidate_registry as registry
import verified_negative as vn

ROOT = Path(__file__).resolve().parents[3]
GH_VERSION = '2.103.3'
GH_ARCHIVE_SHA = '4c806978ffce1cec70853302a56d70ac6da4f19bae7adca4e1a8ab00633dd91d'
ATTEST = 'actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6'
need = policy.need
Pending = policy.Pending


def module(name):
    need(name in ('rr1-registry-proof', 'rp-provenance'), 'CA_MODULE_REFUSED')
    spec = importlib.util.spec_from_file_location('ca_' + name.replace('-', '_'),
                                                Path(__file__).with_name(name + '.py'))
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value)
    return value


def command(args, timeout=120, env=None, data=None):
    clean = dict(os.environ if env is None else env)
    for key in ('CA_JOB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_RUNTIME_TOKEN'):
        clean.pop(key, None)
    try:
        result = subprocess.run(args, cwd=ROOT, env=clean, input=data,
                                capture_output=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise Pending('CA_COMMAND_UNAVAILABLE_OR_TIMEOUT') from None
    need(result.returncode == 0, 'CA_COMMAND_FAILED')
    return result.stdout


def git(*args):
    return command(['git', *args], 20).decode().strip()


def write_new(path, raw):
    path = Path(path)
    need(path.parent.is_dir() and not path.parent.is_symlink(), 'CA_PRIVATE_PARENT_INVALID')
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as stream:
        stream.write(raw); stream.flush(); os.fsync(stream.fileno())


def read(path):
    path = Path(path)
    need(path.is_file() and not path.is_symlink(), 'CA_REQUIRED_FILE_PENDING')
    return policy.decode(path.read_bytes())


def paths(env):
    temporary = env.get('RUNNER_TEMP', '')
    need(temporary and Path(temporary).is_absolute()
         and not any(c in temporary for c in '\r\n') and not Path(temporary).is_symlink(), 'CA_RUNNER_PATH_INVALID')
    return Path(temporary) / 'issue225-candidate-private', Path(temporary) / 'issue225-candidate-public'


def binding(p, digest, env):
    expected = policy.guard(p, digest, env, git)
    event = read(env.get('GITHUB_EVENT_PATH', ''))
    inputs = event.get('inputs', {})
    need(event.get('sender', {}).get('id') == policy.OWNER_ID
         and inputs.get('mode') == 'publish' and inputs.get('packet_sha256') == digest
         and policy.sha(inputs.get('packet_json', '').encode()) == digest
         and (not inputs.get('environment_ui_json') if p['environmentUiObservationSha256'] is None
              else policy.sha(inputs.get('environment_ui_json', '').encode()) == p['environmentUiObservationSha256']),
         'CA_OWNER_SENDER_OR_INPUT_INVALID')
    return expected


def init(env):
    raw = env.get('CA_PACKET_JSON', '').encode(); digest = env.get('CA_PACKET_SHA256', '')
    p = policy.packet(raw, digest)
    ui = env.get('CA_UI_JSON', '').encode()
    if ui or p['environmentUiObservationSha256'] is not None:
        policy.ui_observation(ui, p)
    expected = binding(p, digest, env)
    private, public = paths(env)
    need(not private.exists() and not public.exists(), 'CA_RUN_PATH_EXISTS')
    private.mkdir(mode=0o700)
    (private / 'docker').mkdir(mode=0o700)
    write_new(private / 'packet.json', raw)
    write_new(private / 'environment-ui.json', ui)
    write_new(private / 'binding.json', policy.canonical(expected))
    with Path(env['GITHUB_ENV']).open('a', encoding='utf-8') as stream:
        for key, value in {'CA_PRIVATE': private, 'CA_PUBLIC': public,
                           'DOCKER_CONFIG': private / 'docker'}.items():
            stream.write(key + '=' + str(value) + '\n')


def load_run(env):
    private, public = paths(env)
    raw = (private / 'packet.json').read_bytes()
    p = policy.packet(raw, env.get('CA_PACKET_SHA256', ''))
    expected = binding(p, policy.sha(raw), env)
    need(read(private / 'binding.json') == expected, 'CA_SAME_RUN_BINDING_INVALID')
    need(env.get('DOCKER_CONFIG') == str(private / 'docker'), 'CA_DOCKER_CONFIG_NOT_ISOLATED')
    return p, expected, private, public


class Loopback:
    """Read only exact already-owned RR1 registry, before its cleanup."""
    def __init__(self, host, http=None):
        need(re.fullmatch(r'127\.0\.0\.1:[0-9]{4,5}', host), 'CA_LOOPBACK_HOST_INVALID')
        self.base = 'http://' + host + '/v2/rr1-release'
        self.http = http or registry.HTTP()

    def manifest(self, digest):
        need(registry.DIGEST.fullmatch(digest), 'CA_LOCAL_DIGEST_INVALID')
        status, headers, raw, size, actual = self.http.request('GET', self.base + '/manifests/' + digest,
                                                             {'Accept': registry.ACCEPT})
        need(status == 200 and actual == digest and headers.get('docker-content-digest') == digest,
             'CA_LOCAL_MANIFEST_CHANGED')
        return {'raw': raw, 'digest': actual, 'size': size,
                'mediaType': headers.get('content-type', '').split(';')[0]}

    def blob(self, descriptor, destination):
        digest = descriptor['digest']
        status, _, _, size, actual = self.http.request('GET', self.base + '/blobs/' + digest,
                                   destination=destination, limit=descriptor['size'])
        need(status == 200 and size == descriptor['size'] and actual == digest, 'CA_LOCAL_BLOB_CHANGED')


class Runner:
    def __init__(self, private, expected):
        self.private = Path(private); self.expected = expected
        self.rr1 = module('rr1-registry-proof')
        self.rp = module('rp-provenance')  # Locked RP signer/guard globals remain untouched.
        self.build_dir = self.private / 'build'
        self.rr1_path = self.build_dir / 'rr1-registry-receipt.json'
        self.rr2_path = self.private / 'rr2-journey.json'
        self.old_path = self.private / 'rr2-old-pair.json'
        self.local_blob_cache = {}
        self.remote_blob_cache = {}

    def receipt_hashes(self):
        paths = (self.build_dir / 'rr1-input.json', self.rr1_path, self.rr2_path, self.old_path)
        for path in paths:
            read(path)  # Reject missing/symlink/unreadable receipts, including on repeats.
        return {str(path.relative_to(self.private)): policy.sha(path.read_bytes()) for path in paths}

    def owned_receipt_hashes(self, owned):
        for path in owned:
            read(path)
        return {str(path.relative_to(ROOT)): policy.sha(path.read_bytes()) for path in owned}

    def verify_rr1_absent(self, rr1):
        resources = rr1['resources']
        for kind, name in (('container', resources['registryCid']), ('container', resources['registryName']),
                           ('network', resources['network']), ('volume', resources['volume'])):
            need(self.rr1.docker_optional_inspect(kind, name) is None, 'CA_CLEANED_RESOURCE_REAPPEARED')
        need(re.fullmatch(r'127\.0\.0\.1:[0-9]{4,5}', rr1.get('host', ''))
             and re.fullmatch('[0-9a-f]{16}', resources.get('nonce', ''))
             and set(rr1.get('refs', {})) == set(policy.ROLES), 'CA_CLEANUP_REF_SET_INVALID')
        for role in policy.ROLES:
            ref = rr1['refs'][role]
            need(ref == rr1['host'] + '/rr1-release@' + rr1['manifests'][role]['digest']
                 and registry.DIGEST.fullmatch(rr1['manifests'][role]['digest']), 'CA_CLEANUP_REF_INVALID')
            tag = rr1['host'] + '/rr1-release:' + role.replace('-', '') + '-' + resources['nonce']
            for original in (ref, tag):
                need(self.rr1.docker_optional_inspect('image', original) is None, 'CA_CLEANED_REF_REAPPEARED')

    def cleanup(self):
        """Receipt-bound cleanup for this candidate run, including partial RR2."""
        owned = [p for p in (ROOT / 'data/release-proof').glob('rr2-*/receipt.json')
                 if re.fullmatch(r'rr2-[0-9a-f]{16}', p.parent.name)]
        marker_path = self.private / 'proof-cleaned.json'
        if not self.rr1_path.exists():
            need(not marker_path.exists() and not owned and not self.rr2_path.exists(),
                 'CA_PARTIAL_RESOURCE_OWNERSHIP_PENDING')
            return
        rr1 = read(self.rr1_path)
        need(rr1.get('kind') == 'RR1_LOCAL_UNSIGNED_REGISTRY_RECEIPT'
             and rr1.get('sourceCommit') == self.expected['sourceCommit']
             and rr1.get('sourceTree') == self.expected['sourceTree']
             and rr1.get('retainedForR2') is True, 'CA_CLEANUP_SOURCE_MISMATCH')
        marker = None
        if marker_path.exists():
            marker = read(marker_path)
            need(set(marker) == {'kind', 'archiveSha256', 'receipts', 'ownedReceipts', *self.expected}
                 and marker.get('kind') == 'CANDIDATE_SAME_RUN_PROOF_CLEANED'
                 and all(marker.get(k) == v for k, v in self.expected.items())
                 and marker.get('receipts') == self.receipt_hashes()
                 and marker.get('ownedReceipts') == self.owned_receipt_hashes(owned), 'CA_CLEANUP_MARKER_MIXED')
        rr2 = read(self.rr2_path) if self.rr2_path.exists() else None
        if rr2:
            nonce = rr2.get('nonce', '')
            need(re.fullmatch('[0-9a-f]{16}', nonce)
                 and owned == [ROOT / 'data/release-proof' / ('rr2-' + nonce) / 'receipt.json'],
                 'CA_RR2_OWNED_SET_INVALID')
        need(len(owned) <= 1, 'CA_RR2_OWNED_SET_INVALID')
        for path in owned:
            receipt = read(path); images = receipt.get('images', {})
            need(receipt.get('kind') == 'RR2_OWNED_NAMESPACE'
                 and receipt.get('nonce') == path.parent.name.removeprefix('rr2-')
                 and images.get('newSource') == self.expected['sourceCommit']
                 and images.get('new') == rr1['refs']
                 and images.get('newReceiptSha256') == policy.sha(self.rr1_path.read_bytes())
                 and images.get('oldReceiptSha256') == policy.sha(self.old_path.read_bytes())
                 and images.get('newRegistryCid') == rr1['resources']['registryCid']
                 and images.get('newRegistryNonce') == rr1['resources']['nonce'], 'CA_CLEANUP_RECEIPT_MIXED')
        if marker is not None:
            build = read(self.build_dir / 'rr1-input.json')
            try:
                self.rp.validate_run(rr1, rr2, build, self.expected)
            except self.rp.Blocked:
                raise Pending('CA_CLEANUP_PROOF_MIXED') from None
            old = read(self.old_path)
            need(type(old) is list and len(old) == 2 and {r.get('role') for r in old} == {'app', 'migrator'}
                 and all(r.get('sourceCommit') == rr2['oldSource'] for r in old)
                 and rr2.get('oldImage') == {r['role']: r['ref'] for r in old}
                 and rr2.get('newImage') == rr1['refs']
                 and marker['archiveSha256'] == build['sourceArchiveSha256'], 'CA_CLEANUP_SOURCE_BINDING_INVALID')
            for path in owned:
                self.rp.verify_rr2_absent(path)
            self.verify_rr1_absent(rr1)
            return
        for path in owned:
            env = dict(os.environ, RR2_OLD_PAIR_RECEIPT=str(self.old_path),
                       RR2_CURRENT_TRIPLET_RECEIPT=str(self.rr1_path))
            command([sys.executable, str(ROOT / 'src/tests/oci/rr2-recovery-proof.py'),
                     'cleanup', '--receipt', str(path)], 180, env)
            self.rp.verify_rr2_absent(path)
        self.rr1.cleanup_registry_refs(rr1)
        self.rr1.cleanup_owned(rr1['resources'])
        self.verify_rr1_absent(rr1)

    def graphs_and_cleanup(self):
        build = self.rr1.check_build_receipt(self.build_dir / 'rr1-input.json')
        rr1 = read(self.rr1_path); rr2 = read(self.rr2_path)
        self.rp.validate_run(rr1, rr2, build, self.expected)  # Pure proof validation only.
        need(rr2.get('newImage') == rr1.get('refs'), 'CA_RR2_TRIPLET_MISMATCH')
        graphs = {}
        for role in policy.ROLES:
            graph = registry.collect_graph(Loopback(rr1['host']), rr1['manifests'][role]['digest'],
                       self.private / 'graphs' / role, role, self.expected['sourceCommit'], self.local_blob_cache)
            registry.same_graph(graph, rr1['manifests'][role])
            graphs[role] = graph
        # Cleanup must finish before constructing a remote write client.
        self.cleanup()
        proof = {'kind': 'CANDIDATE_SAME_RUN_PROOF_CLEANED', **self.expected,
                 'archiveSha256': build['sourceArchiveSha256'],
                 'receipts': self.receipt_hashes(),
                 'ownedReceipts': self.owned_receipt_hashes([p for p in (ROOT / 'data/release-proof').glob('rr2-*/receipt.json')
                     if re.fullmatch(r'rr2-[0-9a-f]{16}', p.parent.name)])}
        write_new(self.private / 'proof-cleaned.json', policy.canonical(proof))
        self.cleanup()  # Repeat is read-only; validate the completed marker/set before any remote client.
        return graphs, proof

    def remote_runtime(self, client, role, tag, prior):
        graph = registry.collect_graph(client, tag, self.private / 'remote' / role,
                                       role, self.expected['sourceCommit'], self.remote_blob_cache)
        registry.same_graph(graph, prior)
        payload = {'role': role, **self.expected, 'graph': {k: v for k, v in graph.items()
                    if k not in ('objects', 'manifestOrder')}}
        write_new(self.private / ('runtime-' + role + '.json'), policy.canonical(payload))
        # App/Worker proof subprocesses receive no registry/OIDC token env. The
        # isolated Docker config remains available only to their Docker pull.
        command([sys.executable, str(Path(__file__)), 'runtime', '--role', role], 1500)
        result = read(self.private / ('runtime-result-' + role + '.json'))
        need(result == {'role': role, 'state': 'PASS', **self.expected}, 'CA_RUNTIME_RESULT_PENDING')

    def runtime_only(self, role):
        payload = read(self.private / ('runtime-' + role + '.json'))
        need(payload.get('role') == role and all(payload.get(k) == v for k, v in self.expected.items()),
             'CA_RUNTIME_OTHER_RUN')
        graph = payload['graph']
        rr1 = read(self.rr1_path)
        registry.same_graph(graph, rr1['manifests'][role])
        ref = policy.PACKAGE + '@' + graph['digest']
        self.rr1.docker_absent('image', ref)
        engine = None
        try:
            command(['docker', 'pull', '--platform', 'linux/amd64', ref], 1200)
            pulled = self.rr1.docker_json('image', 'inspect', ref)
            engine = pulled['Id']
            write_new(self.private / ('runtime-owned-' + role + '.json'), policy.canonical(
                {'role': role, 'ref': ref, 'engineId': engine, **self.expected}))
            build = read(self.build_dir / 'rr1-input.json')
            self.rr1.verify_pulled_identity(pulled, build['images'][role]['id'], graph, ref)
            self.rr1.check_image_metadata(pulled, role, self.expected['sourceCommit'], '0.61.0')
            nonce = policy.sha((self.expected['runId'] + role).encode())[:16]
            name = 'layoutmanager-candidate-' + role.replace('-', '') + '-' + nonce
            self.rr1.smoke_digest(ref, role, engine, name, graph, nonce)
        finally:
            if engine:
                self.rr1.remove_ref_if_owned(ref, engine)
            need(self.rr1.docker_optional_inspect('image', ref) is None, 'CA_REMOTE_RUNTIME_CLEANUP_PENDING')
        write_new(self.private / ('runtime-result-' + role + '.json'), policy.canonical(
            {'role': role, 'state': 'PASS', **self.expected}))

    def cleanup_runtime(self):
        for role in policy.ROLES:
            path = self.private / ('runtime-' + role + '.json')
            if not path.exists():
                continue
            payload = read(path)
            need(payload.get('role') == role and all(payload.get(k) == v for k, v in self.expected.items()),
                 'CA_RUNTIME_CLEANUP_OTHER_RUN')
            ref = policy.PACKAGE + '@' + payload['graph']['digest']
            nonce = policy.sha((self.expected['runId'] + role).encode())[:16]
            name = 'layoutmanager-candidate-' + role.replace('-', '') + '-' + nonce
            self.rr1.remove_owned_smoke(name, ref, nonce)
            owned_path = self.private / ('runtime-owned-' + role + '.json')
            if owned_path.exists():
                owned = read(owned_path)
                need(owned.get('ref') == ref and owned.get('role') == role
                     and all(owned.get(k) == v for k, v in self.expected.items()), 'CA_RUNTIME_OWNER_MISMATCH')
                self.rr1.remove_ref_if_owned(ref, owned['engineId'])
            need(self.rr1.docker_optional_inspect('image', ref) is None, 'CA_RUNTIME_REF_OWNERSHIP_PENDING')


def orchestrate(p, expected, api, ui, runner, journal, client_factory):
    before = policy.approval_gate(api, p, expected, ui)
    graphs, proof = runner.graphs_and_cleanup()
    need(proof.get('kind') == 'CANDIDATE_SAME_RUN_PROOF_CLEANED'
         and all(proof.get(k) == v for k, v in expected.items()), 'CA_PROOF_RUN_MIXED')
    after = policy.approval_gate(api, p, expected, ui)
    need(after == before, 'CA_APPROVAL_GATE_CHANGED')
    client = client_factory()
    try:
        outcome = registry.publish_set(client, graphs, expected,
                                      lambda role, ref, graph: runner.remote_runtime(client, role, ref, graph))
        journal.append({'event': 'THREE_CANDIDATES_VERIFIED', 'outcome': outcome})
    except BaseException:
        journal.append({'event': 'HALT', 'state': 'PARTIAL_OR_UNCERTAIN' if journal.writes else 'PENDING',
                        'remoteIntents': journal.writes})
        raise
    return {'kind': 'GHCR_CANDIDATE_RECEIPT_V1', 'repository': policy.REPO,
            'repositoryId': policy.REPO_ID, 'repositoryOwnerId': policy.OWNER_ID,
            **expected, 'workflowPath': policy.WORKFLOW, 'version': '0.61.0', 'platform': 'linux/amd64',
            'packageId': policy.PACKAGE_ID, 'visibility': 'private',
            'archiveSha256': proof['archiveSha256'], 'proofReceiptSha256': policy.sha(policy.canonical(proof)),
            'approval': before, 'controlEvidenceSha256': p['controls'],
            'roles': {role: {'subjectName': policy.SUBJECTS[role],
                'candidateRef': policy.PACKAGE + ':' + policy.tags(expected)[role],
                'digestRef': policy.PACKAGE + '@' + graphs[role]['digest'],
                'manifestDigest': graphs[role]['digest'], 'configDigest': graphs[role]['configDigest'],
                'platformManifestDigest': graphs[role]['manifestDigest']}
                for role in policy.ROLES},
            'execution': {'rr1': 'PASS', 'rr2rr3': 'PASS', 'proofCleanup': 'PASS',
                          'ghcrGraph': 'PASS', 'digestRuntimeAndCleanup': 'PASS'},
            'limits': ['candidate_prefix_only_not_release_go', 'old0.60_disposable_not_operational0.58',
                       'non_atomic_external_writers_not_excluded', 'controls_are_separate_evidence']}


PUBLIC_NAMES = {'candidate-receipt.json', 'candidate-bundle.sigstore.json', 'verification.json', 'SHA256SUMS'}


def public_allowlist(public):
    public = Path(public)
    if not public.exists():
        return
    need(public.is_dir() and not public.is_symlink(), 'CA_PUBLIC_DIR_INVALID')
    need(all(p.name in PUBLIC_NAMES and p.is_file() and not p.is_symlink()
             for p in public.iterdir()), 'CA_PUBLIC_PAYLOAD_REFUSED')
    if (public / 'candidate-receipt.json').exists():
        receipt = read(public / 'candidate-receipt.json')
        validate_receipt(receipt)
        sums = public / 'SHA256SUMS'
        if sums.exists():
            mapping = {role: receipt['roles'][role]['manifestDigest'][7:] for role in policy.ROLES}
            mapping['receipt'] = policy.sha((public / 'candidate-receipt.json').read_bytes())
            expected_sums = ''.join(mapping[role] + '  ' + policy.SUBJECTS[role] + '\n'
                                    for role in (*policy.ROLES, 'receipt'))
            need(sums.read_text() == expected_sums, 'CA_PUBLIC_CHECKSUM_CONTENT_INVALID')
    need(all(item.stat().st_size <= 2 * 1024 * 1024 for item in public.iterdir()), 'CA_PUBLIC_FILE_SIZE_INVALID')


def validate_receipt(value, expected=None):
    policy.exact(value, ('kind', 'repository', 'repositoryId', 'repositoryOwnerId', 'sourceCommit',
        'sourceTree', 'workflowCommit', 'runId', 'runAttempt', 'packetSha256', 'workflowPath',
        'version', 'platform', 'packageId', 'visibility', 'archiveSha256', 'proofReceiptSha256',
        'approval', 'controlEvidenceSha256', 'roles', 'execution', 'limits'))
    need(value['kind'] == 'GHCR_CANDIDATE_RECEIPT_V1' and value['workflowPath'] == policy.WORKFLOW
         and value['repository'] == policy.REPO and value['repositoryId'] == policy.REPO_ID
         and value['repositoryOwnerId'] == policy.OWNER_ID and value['packageId'] == policy.PACKAGE_ID
         and value['visibility'] == 'private' and value['version'] == '0.61.0'
         and value['platform'] == 'linux/amd64' and value['runAttempt'] == '1'
         and value['workflowCommit'] == value['sourceCommit']
         and type(value['runId']) is str and re.fullmatch('[1-9][0-9]{0,19}', value['runId'])
         and all(policy.hash_value(value[key], 40) for key in ('sourceCommit', 'sourceTree'))
         and all(policy.hash_value(value[key]) for key in ('packetSha256', 'archiveSha256', 'proofReceiptSha256')),
         'CA_RECEIPT_IDENTITY_INVALID')
    if expected:
        need(all(value.get(k) == v for k, v in expected.items()), 'CA_RECEIPT_OTHER_RUN')
    policy.exact(value['roles'], policy.ROLES)
    need(value['execution'] == {'rr1': 'PASS', 'rr2rr3': 'PASS', 'proofCleanup': 'PASS',
          'ghcrGraph': 'PASS', 'digestRuntimeAndCleanup': 'PASS'}, 'CA_RECEIPT_EXECUTION_INCOMPLETE')
    for role, entry in value['roles'].items():
        policy.exact(entry, ('subjectName', 'candidateRef', 'digestRef', 'manifestDigest',
                             'configDigest', 'platformManifestDigest'))
        need(entry['subjectName'] == policy.SUBJECTS[role]
             and all(type(entry[key]) is str and registry.DIGEST.fullmatch(entry[key]) for key in
                     ('manifestDigest', 'configDigest', 'platformManifestDigest'))
             and entry['candidateRef'] == policy.PACKAGE + ':' + policy.tags(value)[role]
             and entry['digestRef'] == policy.PACKAGE + '@' + entry['manifestDigest'], 'CA_RECEIPT_ROLE_MAPPING_INVALID')
    need(len({entry['manifestDigest'] for entry in value['roles'].values()}) == 3, 'CA_DUPLICATE_ROLE_DIGEST')
    # Nested schemas are closed: a benign filename cannot smuggle raw config,
    # credentials, paths, diagnostics or CAD under an extra receipt field.
    approval = value['approval']
    policy.exact(approval, ('environment', 'adminBypassEvidence', 'jobId', 'reviewerId', 'reviewState',
                 'reviewBinding', 'reviewTimestamp', 'independentSecondHuman', 'requiredCiRunId',
                 'requiredCiHeadSha', 'requiredCiArchiveSha', 'candidateMainSha', 'ciArchiveBinding', 'controls'))
    policy.exact(approval['environment'], ('id', 'name', 'can_admins_bypass', 'prevent_self_review', 'reviewerId',
                                          'branchPolicies', 'protectionRuleTypes'))
    policy.exact(approval['adminBypassEvidence'], ('origin', 'sha256', 'observerId', 'observedAt', 'canAdminsBypass'))
    policy.exact(value['controlEvidenceSha256'], ('policyReceiptSha256', 'writerInventorySha256',
                                                'legacyControlReceiptSha256', 'rollbackPacketSha256'))
    need(all(policy.hash_value(v) for v in value['controlEvidenceSha256'].values())
         and approval['reviewerId'] == policy.OWNER_ID and approval['reviewState'] == 'approved'
         and approval['independentSecondHuman'] is False, 'CA_RECEIPT_APPROVAL_INVALID')
    summary = approval['environment']; bypass = approval['adminBypassEvidence']
    need(type(summary['id']) is int and summary['id'] > 0 and summary['name'] == policy.ENVIRONMENT
         and (summary['can_admins_bypass'] is False or summary['can_admins_bypass'] == 'NOT_EXPOSED_AS_BOOLEAN')
         and type(summary['prevent_self_review']) is bool and summary['reviewerId'] == policy.OWNER_ID
         and summary['branchPolicies'] == [{'name': 'main', 'type': 'branch'}]
         and type(summary['protectionRuleTypes']) is list
         and set(summary['protectionRuleTypes']) <= {'required_reviewers', 'branch_policy', 'wait_timer'}
         and 'required_reviewers' in summary['protectionRuleTypes']
         and approval['reviewBinding'] == 'run-attempt1-title-job-packet-sha'
         and approval['reviewTimestamp'] == 'NOT_EXPOSED_BY_API'
         and approval['controls'] == 'EXTERNAL_HASH_REFERENCES_ONLY'
         and all(policy.hash_value(approval[k], 40) for k in
                 ('requiredCiHeadSha', 'requiredCiArchiveSha', 'candidateMainSha'))
         and approval['candidateMainSha'] == value['sourceCommit']
         and approval['ciArchiveBinding'] == 'APPROVED_PACKET_SAME_TREE_PARENT_RELATION_NOT_RUN_API_FIELD'
         and type(approval['jobId']) is int and approval['jobId'] > 0
         and type(approval['requiredCiRunId']) is int and approval['requiredCiRunId'] > 0,
         'CA_PUBLIC_APPROVAL_FIELDS_INVALID')
    need(bypass['origin'] in ('API_RUNTIME_BOOLEAN', 'OWNER_OBSERVED_UI_NOT_API')
         and policy.hash_value(bypass['sha256']) and bypass['canAdminsBypass'] is False,
         'CA_BYPASS_EVIDENCE_INVALID')
    if bypass['origin'] == 'API_RUNTIME_BOOLEAN':
        need(bypass['observerId'] is None and bypass['observedAt'] is None, 'CA_API_EVIDENCE_RELABEL')
    else:
        need(bypass['observerId'] == policy.OWNER_ID and type(bypass['observedAt']) is str
             and re.fullmatch(r'[0-9T:+.Z-]{20,40}', bypass['observedAt']), 'CA_UI_EVIDENCE_INVALID')
    need(value['limits'] == ['candidate_prefix_only_not_release_go', 'old0.60_disposable_not_operational0.58',
                            'non_atomic_external_writers_not_excluded', 'controls_are_separate_evidence'],
         'CA_PUBLIC_LIMITS_INVALID')


def checksums(private, public, expected):
    receipt_path = Path(public) / 'candidate-receipt.json'
    value = read(receipt_path); validate_receipt(value, expected)
    mapping = {role: value['roles'][role]['manifestDigest'][7:] for role in policy.ROLES}
    mapping['receipt'] = policy.sha(receipt_path.read_bytes())
    for role in policy.ROLES:
        raw = Path(private) / 'graphs' / role / mapping[role]
        need(raw.is_file() and registry.file_digest(raw) == 'sha256:' + mapping[role], 'CA_PRIVATE_SUBJECT_MISSING')
        # Subject names are fixed by a private copy, not a public raw manifest.
        target = Path(private) / policy.SUBJECTS[role]
        write_new(target, raw.read_bytes())
    write_new(Path(private) / policy.SUBJECTS['receipt'], receipt_path.read_bytes())
    raw_sums = ''.join(mapping[role] + '  ' + policy.SUBJECTS[role] + '\n' for role in (*policy.ROLES, 'receipt'))
    write_new(Path(private) / 'SHA256SUMS', raw_sums.encode())
    write_new(Path(public) / 'SHA256SUMS', raw_sums.encode())


def negative_cause(label, result, expected):
    # Fixed candidate signer mismatch. Other source/subject causes are pure
    # RP classifier contracts with no signer substitution or global mutation.
    if label == 'wrongSignerWorkflow':
        need(result.returncode == 1 and not result.stdout.strip() and type(result.stderr) is str
             and len(result.stderr) < 16384 and '\x00' not in result.stderr, 'CA_NEGATIVE_EXIT_INVALID')
        pattern = (r'^https://github\.com/planner77/layoutManager/\.github/workflows/'
                   r'wrong\.yml(@(refs/.*|[0-9a-fA-F]+))?$')
        phrase = ('no matching CertificateIdentity found, last error: expected SAN value to match regex "'
                  + pattern + '", got "' + policy.SIGNER_URI + '"')
        need(phrase in result.stderr and not re.search(
            r'auth|permission|timeout|timed out|network|tuf|usage:|unknown flag|error parsing|failed to fetch',
            result.stderr, re.I), 'CA_NEGATIVE_CAUSE_UNPROVEN')
        return 'SIGNER_WORKFLOW_SAN_MISMATCH'
    rp = module('rp-provenance')
    try:
        return rp.negative_cause(label, result, expected)
    except rp.Blocked as error:
        raise Pending(str(error)) from None


def verify(private, public, expected, gh, runner=command, probe=subprocess.run):
    public_allowlist(public)
    receipt = read(Path(public) / 'candidate-receipt.json'); validate_receipt(receipt, expected)
    mapping = {role: receipt['roles'][role]['manifestDigest'][7:] for role in policy.ROLES}
    mapping['receipt'] = policy.sha((Path(public) / 'candidate-receipt.json').read_bytes())
    bundle = Path(public) / 'candidate-bundle.sigstore.json'
    need(bundle.is_file() and not bundle.is_symlink() and bundle.stat().st_size <= 2 * 1024 * 1024,
         'CA_BUNDLE_PENDING')
    locked = {'binary': policy.sha(Path(gh).read_bytes()), 'bundle': policy.sha(bundle.read_bytes())}
    need(runner([gh, '--version']).decode().startswith('gh version ' + GH_VERSION + ' '), 'CA_GH_VERSION_INVALID')
    flags = ['--repo', policy.REPO, '--signer-workflow', policy.SIGNER,
             '--signer-digest', expected['workflowCommit'], '--source-digest', expected['sourceCommit'],
             '--source-ref', 'refs/heads/main', '--deny-self-hosted-runners', '--format', 'json']
    # CLI needs the builtin token; command runner normally strips tokens from
    # child proof processes, so this isolated verifier supplies only GH_TOKEN.
    for role in (*policy.ROLES, 'receipt'):
        artifact = Path(private) / policy.SUBJECTS[role]
        need(artifact.is_file() and policy.sha(artifact.read_bytes()) == mapping[role], 'CA_SIGNED_SUBJECT_CHANGED')
        for suffix in ([], ['--bundle', str(bundle)]):
            result = runner([gh, 'attestation', 'verify', str(artifact), *flags, *suffix], 120)
            policy.certificate(policy.decode(result), expected, mapping)
    negatives = {'wrongSource': ['--source-digest', '0' * 40],
                 'wrongSignerCommit': ['--signer-digest', '0' * 40],
                 'wrongSignerWorkflow': ['--signer-workflow', policy.REPO + '/.github/workflows/wrong.yml'],
                 'wrongRef': ['--source-ref', 'refs/heads/wrong']}
    evidence = []
    def reject(label, artifact, changed):
        role = 'receipt' if label == 'tamperedReceipt' else 'app'
        original = Path(private) / policy.SUBJECTS[role]
        positive_argv = [gh, 'attestation', 'verify', str(original), *flags, '--bundle', str(bundle)]
        negative_argv = [gh, 'attestation', 'verify', str(artifact), *changed, '--bundle', str(bundle)]
        def snapshot():
            paths = {'binary': Path(gh), 'bundle': bundle, 'original': original, 'probe': artifact}
            need(all(p.is_file() and not p.is_symlink() for p in paths.values()),
                 'CA_NEGATIVE_MATERIAL_PATH_INVALID')
            hashes = {k: policy.sha(p.read_bytes()) for k, p in paths.items()}
            need(all(hashes[k] == v for k, v in locked.items()), 'CA_NEGATIVE_MATERIAL_CHANGED')
            return hashes
        def positive():
            before = snapshot()
            output = runner(positive_argv, 120)
            policy.certificate(policy.decode(output), expected, mapping)
            need(snapshot() == before, 'CA_POSITIVE_MATERIAL_CHANGED')
            return {'argv': positive_argv, 'exit': 0, 'stdout': output, 'hashes': before}
        before = positive()
        try:
            result = probe(negative_argv,
                           capture_output=True, text=True, timeout=120, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise Pending('CA_NEGATIVE_COMMAND_PENDING') from None
        write_new(Path(private) / ('negative-' + label + '.json'), policy.canonical(
            {'label': label, 'exit': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}))
        after = positive()
        try:
            projected = vn.candidate_negative(label, expected, mapping, str(original), str(artifact),
                gh, str(bundle), before, after, negative_argv, result, negative_cause)
        except vn.Rejected as error:
            raise Pending(str(error)) from None
        evidence.append(projected)
    for label, replacement in negatives.items():
        changed = list(flags); changed[changed.index(replacement[0]) + 1] = replacement[1]
        reject(label, Path(private) / policy.SUBJECTS['app'], changed)
    for role, label in (('app', 'tamperedManifest'), ('receipt', 'tamperedReceipt')):
        raw = (Path(private) / policy.SUBJECTS[role]).read_bytes()
        altered = Path(private) / ('tampered-' + policy.SUBJECTS[role])
        write_new(altered, bytes([raw[0] ^ 1]) + raw[1:]); reject(label, altered, flags)
    need(all(policy.sha((Path(private) / policy.SUBJECTS[r]).read_bytes()) == mapping[r]
             for r in (*policy.ROLES, 'receipt')) and
         policy.sha(bundle.read_bytes()) == locked['bundle'] and
         policy.sha(Path(gh).read_bytes()) == locked['binary'], 'CA_FINAL_VERIFIED_MATERIAL_CHANGED')
    write_new(Path(public) / 'verification.json', policy.canonical({
        'kind': 'GHCR_CANDIDATE_VERIFICATION_V1', **expected, 'signer': policy.SIGNER,
        'subjects': {policy.SUBJECTS[r]: 'sha256:' + mapping[r] for r in (*policy.ROLES, 'receipt')},
        'ghVersion': GH_VERSION, 'attestAction': ATTEST, 'onlineAndBundleSubjects': 4,
        'negativeEvidence': evidence,
        'negativeEvidenceMeaning': 'CLI rejection boundary plus verified-material own-policy projection',
        'actualNegativeCases': list(negatives) + ['tamperedManifest', 'tamperedReceipt'],
        'verdict': 'CANDIDATE_PROVENANCE_VERIFIED_NOT_RELEASE_GO'}))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', nargs='?', default='plan', choices=(
        'plan', 'init', 'environment', 'gate', 'publish', 'verify', 'allowlist', 'cleanup', 'runtime'))
    parser.add_argument('--packet', type=Path)
    parser.add_argument('--packet-sha256')
    parser.add_argument('--ui-observation', type=Path)
    parser.add_argument('--gh')
    parser.add_argument('--role', choices=policy.ROLES)
    args = parser.parse_args(argv)
    if args.action == 'plan':
        if args.packet:
            p = policy.packet(args.packet.read_bytes(), args.packet_sha256)
            if args.ui_observation:
                policy.ui_observation(args.ui_observation.read_bytes(), p)
        print('CA_PLAN_ONLY HTTP=0 CREDENTIALS=0 MUTATIONS=0 OWNER_AUTHORITY=NOT_VERIFIED')
        return
    if args.action == 'init':
        init(os.environ); return
    p, expected, private, public = load_run(os.environ)
    if args.action == 'allowlist':
        public_allowlist(public); return
    if args.action == 'environment':
        policy.environment_gate(registry.GitHubReadOnly(os.environ.get('CA_JOB_TOKEN')), p,
                                (private / 'environment-ui.json').read_bytes())
        return
    runner = Runner(private, expected)
    if args.action == 'runtime':
        need(args.role in policy.ROLES and not any(os.environ.get(k) for k in
            ('CA_JOB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_RUNTIME_TOKEN')),
             'CA_RUNTIME_TOKEN_ENV_REFUSED')
        runner.runtime_only(args.role); return
    if args.action == 'cleanup':
        try:
            runner.cleanup_runtime(); runner.cleanup()
        finally:
            credential_file = private / 'docker' / 'config.json'
            if credential_file.exists():
                need(not credential_file.is_symlink(), 'CA_DOCKER_CREDENTIAL_PATH_INVALID')
                credential_file.unlink()
        return
    if args.action == 'verify':
        token = os.environ.get('CA_JOB_TOKEN')
        need(bool(token), 'CA_JOB_TOKEN_MISSING')
        def cli(command_args, timeout=120):
            # No host gh config/credential helper. Only the explicit builtin token.
            env = {'PATH': os.environ['PATH'], 'GH_TOKEN': token,
                   'GH_CONFIG_DIR': str(private / 'gh-config')}
            result = subprocess.run(command_args, cwd=ROOT, env=env, capture_output=True, timeout=timeout)
            need(result.returncode == 0, 'CA_CLI_VERIFICATION_FAILED')
            return result.stdout
        def probe(command_args, **kwargs):
            return subprocess.run(command_args, cwd=ROOT, env={'PATH': os.environ['PATH'],
                'GH_TOKEN': token, 'GH_CONFIG_DIR': str(private / 'gh-config')}, **kwargs)
        verify(private, public, expected, args.gh, cli, probe); return
    token = os.environ.get('CA_JOB_TOKEN')
    api = registry.GitHubReadOnly(token)
    ui = (private / 'environment-ui.json').read_bytes()
    if args.action == 'gate':
        policy.approval_gate(api, p, expected, ui); return
    journal = registry.Journal(private / 'remote-journal.jsonl', expected)
    try:
        receipt = orchestrate(p, expected, api, ui, runner, journal,
            lambda: registry.GHCR(token, os.environ['GITHUB_ACTOR'], expected, journal))
        public.mkdir(mode=0o700)
        validate_receipt(receipt, expected)
        write_new(public / 'candidate-receipt.json', policy.canonical(receipt))
        checksums(private, public, expected)
        journal.append({'event': 'READY_FOR_CANDIDATE_OIDC_SIGNATURE'})
    finally:
        journal.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, Pending) else 'CA_FAILED_OR_PENDING', file=sys.stderr)
        raise SystemExit(1)
