#!/usr/bin/env python3
"""Fixed RF-C preparation. Default plan uses no HTTP, credentials or mutation.

Only a future fresh Main/Owner/environment-reviewed exact packet can execute.
No rebuild, upload, re-sign, delete, retry, rollback, alias, Git ref or deployment.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys

import rf03_candidate_policy as ca
import candidate_registry as cr
import rf03_download as artifact_download
import rf03_candidate_publish as candidate
import rf03_promotion_policy as policy
import rf03_registry_promotion as rt

need = ca.need
ROOT = candidate.ROOT
DOWNLOAD_ACTION = 'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093'


class API(cr.GitHubReadOnly):
    """Only add exact artifact and legacy metadata GET routes; no API writes."""
    def get(self, path):
        extra = (r'/repos/planner77/layoutManager/actions/runs/[1-9][0-9]*/artifacts\?per_page=100&page=[1-9][0-9]*',
                 r'/repos/planner77/layoutManager/actions/artifacts/[1-9][0-9]*',
                 r'/repos/planner77/layoutManager/actions/workflows/355693716',
                 r'/repos/planner77/layoutManager/actions/workflows/355693716/runs\?per_page=100&page=[1-9][0-9]*')
        if not any(re.fullmatch(pattern, path) for pattern in extra):
            return super().get(path)
        status, _, raw, _, _ = self.http.request('GET', 'https://api.github.com' + path,
            {'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + self.token,
             'X-GitHub-Api-Version': '2022-11-28'})
        need(status == 200, 'RC_API_METADATA_PENDING')
        return ca.decode(raw)


class ReadRegistry(cr.GHCR):
    def __init__(self, token, actor, expected, http=None):
        super().__init__(token, actor, expected, None, http)
        self.allowed_tags.update(rt.FINALS.values())
        self.allowed_tags.update(('0.61.0', '0.61.0-migrate', '0.61.0-cpu-worker', 'latest'))

    def request(self, method, path, **kwargs):
        need(method in ('GET', 'HEAD'), 'RC_READ_REGISTRY_WRITE_REFUSED')
        return super().request(method, path, **kwargs)


class Journal:
    """Exclusive local attempt with file/directory fsync, never a remote ledger."""
    def __init__(self, path, p, expected):
        self.path = Path(path); self.rt_sha = rt.validate_packet(policy.rt_packet(p)); self.claimed = False
        self.last = None
        self.stream = os.fdopen(os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb')
        self.append({'event': 'OPERATION_BEGIN', 'ownerPacketSha256': expected['packetSha256'],
            'runId': expected['runId'], 'candidateSource': p['candidate']['sourceCommit'],
            'promotionSource': p['promotion']['sourceCommit']})
        parent = os.open(self.path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(parent)
        finally: os.close(parent)

    def begin(self, packet_sha256):
        need(not self.claimed and packet_sha256 == self.rt_sha, 'RC_JOURNAL_ATTEMPT_REUSED')
        self.append({'event': 'RT_BEGIN', 'packetSha256': packet_sha256}); self.claimed = True

    def append(self, event):
        self.stream.write(ca.canonical(event) + b'\n'); self.stream.flush(); os.fsync(self.stream.fileno())
        self.last = dict(event)  # Set only after durability acknowledgement.

    def permits(self, role, digest):
        return self.claimed and self.last == {'event': 'PUT_INTENT', 'packetSha256': self.rt_sha,
            'role': role, 'ref': ca.PACKAGE + ':' + rt.FINALS[role], 'digest': digest}

    def close(self):
        self.stream.close()


class Transport:
    """GET/HEAD plus only three locked final raw-manifest PUT routes."""
    def __init__(self, reader, p, journal):
        self.reader = reader; self.p = p; self.journal = journal

    def get_manifest(self, package, reference):
        need(package == ca.PACKAGE, 'RC_PACKAGE_REFUSED')
        value = self.reader.manifest(reference)
        return rt.AuthenticatedManifestAbsent() if value is None else rt.Manifest(value['raw'], value['mediaType'], value['digest'])

    def head_blob(self, package, digest):
        need(package == ca.PACKAGE and rt.digest_value(digest), 'RC_BLOB_ROUTE_REFUSED')
        status, headers, _, _, _ = self.reader.request('HEAD', cr.PREFIX + '/blobs/' + digest)
        need(status == 200 and headers.get('docker-content-digest') == digest
             and re.fullmatch('[0-9]+', headers.get('content-length', '')), 'RC_BLOB_HEAD_UNAVAILABLE')
        return rt.BlobHead(digest, int(headers['content-length']))

    def put_manifest(self, package, reference, raw, content_type):
        need(package == ca.PACKAGE and reference in rt.FINALS.values(), 'RC_FINAL_ROUTE_REFUSED')
        role = next(r for r, final in rt.FINALS.items() if final == reference)
        desc = self.p['roles'][role]
        need(type(raw) is bytes and rt.raw_digest(raw) == desc['digest'] and len(raw) == desc['size']
             and content_type == desc['mediaType'] and self.journal.permits(role, desc['digest']), 'RC_PUT_BINDING_OR_INTENT_INVALID')
        status, headers, _, _, _ = self.reader.http.request('PUT', cr.ORIGIN + cr.PREFIX + '/manifests/' + reference,
            {'Authorization': 'Bearer ' + self.reader.bearer, 'Content-Type': content_type,
             'Content-Length': str(len(raw)), 'Accept': cr.ACCEPT}, raw)
        need(status == 201 and headers.get('docker-content-digest') == desc['digest'], 'RC_PUT_UNCERTAIN')



def protected_baseline_readback(reader, p):
    """Read immutable old three-role and latest tags before and after new PUT.

    The Owner packet binds exact baseline digests; remote mismatch/unknown is
    always HALT and never a reason to delete, retry, overwrite or rollback.
    """
    baseline = p['rollbackBaseline']
    expected = {
        'app': ('0.61.0', baseline['appDigest']),
        'migrator': ('0.61.0-migrate', baseline['migratorDigest']),
        'cpu-worker': ('0.61.0-cpu-worker', baseline['cpuWorkerDigest']),
    }
    values = {}
    for role, (ref, digest) in expected.items():
        observed = reader.manifest(ref)
        need(type(observed) is dict and observed.get('digest') == digest,
             'RF03_HISTORICAL_0610_CHANGED_OR_UNKNOWN')
        values[role] = digest
    old_latest = reader.manifest('latest')
    expected_latest = baseline['latestDigest']
    need((old_latest is None and expected_latest is None)
         or (type(old_latest) is dict and
             old_latest.get('digest') == expected_latest),
         'RF03_HISTORICAL_LATEST_CHANGED_OR_UNKNOWN')
    return {'roles': values, 'latestDigest': expected_latest}

def artifact_files(directory, p):
    directory = Path(directory)
    need(directory.is_dir() and not directory.is_symlink()
         and {v.name for v in directory.iterdir()} == set(policy.FILES), 'RC_EXACT_ARTIFACT_FILES_REQUIRED')
    for name in policy.FILES:
        path = directory / name
        need(path.is_file() and not path.is_symlink() and 0 < path.stat().st_size <= 2 * 1024 * 1024
             and ca.sha(path.read_bytes()) == p['candidate']['artifact']['files'][name], 'RC_ARTIFACT_FILE_CHANGED')
    receipt = candidate.read(directory / 'candidate-receipt.json')
    a = p['candidate']; expected = {k: a[k] for k in ('sourceCommit', 'sourceTree', 'workflowCommit', 'runId', 'runAttempt', 'packetSha256')}
    candidate.validate_receipt(receipt, expected)
    for role in ca.ROLES:
        entry = receipt['roles'][role]; desc = p['roles'][role]
        need(entry['manifestDigest'] == desc['digest'] and entry['configDigest'] == desc['configDigest']
             and entry['platformManifestDigest'] == desc['platformManifestDigest'], 'RC_RECEIPT_DESCRIPTOR_MISMATCH')
    return receipt


def verify_material(reader, p, downloaded, private, gh, token, verifier=candidate.verify):
    """Actual fixed candidate crypto/VN and full graph; no fresh runtime claim."""
    receipt = artifact_files(downloaded, p)
    private = Path(private); verified = private / 'verified'; verified.mkdir(mode=0o700)
    graphs_dir = private / 'graphs'; graphs_dir.mkdir(mode=0o700)
    cache = {}
    for role in ca.ROLES:
        desc = p['roles'][role]
        graph = cr.collect_graph(reader, ca.tags(p['candidate'])[role], graphs_dir / role,
                                 role, p['candidate']['sourceCommit'], cache, version=p['version'])
        need(graph['topDescriptor'] == {k: desc[k] for k in ('digest', 'size', 'mediaType')}
             and graph['configDigest'] == desc['configDigest']
             and graph['manifestDigest'] == desc['platformManifestDigest'], 'RC_GRAPH_PACKET_MISMATCH')
    for name in ('candidate-receipt.json', 'candidate-bundle.sigstore.json'):
        candidate.write_new(verified / name, (Path(downloaded) / name).read_bytes())
    expected = {k: p['candidate'][k] for k in ('sourceCommit', 'sourceTree', 'workflowCommit', 'runId', 'runAttempt', 'packetSha256')}
    candidate.checksums(private, verified, expected)
    need((verified / 'SHA256SUMS').read_bytes() == (Path(downloaded) / 'SHA256SUMS').read_bytes(), 'RC_CHECKSUMS_MISMATCH')
    # Only exact explicit builtin token enters the isolated CLI subprocess.
    cli_env = {'PATH': os.environ['PATH'], 'GH_TOKEN': token, 'GH_CONFIG_DIR': str(private / 'gh-config')}
    def cli(args, timeout=120):
        try:
            result = subprocess.run(args, cwd=ROOT, env=cli_env, capture_output=True, timeout=timeout)
        except (OSError, subprocess.TimeoutExpired):
            raise ca.Pending('RC_CRYPTO_COMMAND_UNAVAILABLE') from None
        need(result.returncode == 0, 'RC_CRYPTO_VERIFICATION_FAILED')
        return result.stdout
    def probe(args, **kwargs):
        return subprocess.run(args, cwd=ROOT, env=cli_env, **kwargs)
    verifier(private, verified, expected, gh, cli, probe)
    need((verified / 'verification.json').read_bytes() == (Path(downloaded) / 'verification.json').read_bytes(),
         'RC_DOWNLOADED_VERIFICATION_DIFFERS_FROM_FRESH_CRYPTO')
    artifact_files(downloaded, p)  # Detect source artifacts changed during checks.
    return receipt


def perform(p, expected, api, ui, downloaded, private, gh, token, reader_factory, verify=verify_material):
    review = policy.approval_gate(api, p, expected, ui)
    policy.candidate_metadata(api, p)
    artifact_files(downloaded, p)
    archive_path = Path(private) / 'original-candidate.zip'
    need(artifact_download.archive.archive_digest(
         archive_path, p['candidate']['artifact']['size']) ==
         p['candidate']['artifact']['digest'], 'RF03_ORIGINAL_ARTIFACT_ZIP_CHANGED')
    reader = reader_factory()
    baseline_before = protected_baseline_readback(reader, p)
    journal = Journal(Path(private) / 'promotion-journal.jsonl', p, expected)
    transport = Transport(reader, p, journal); packet = policy.rt_packet(p)
    try:
        need(rt.read_final_set(packet, transport) != 'HALT', 'RC_FINAL_SET_PARTIAL_OR_UNKNOWN')
        verify(reader, p, downloaded, private, gh, token)
        # Recheck fresh operation review/source/baseline immediately before any PUT.
        review = policy.approval_gate(api, p, expected, ui)
        need(protected_baseline_readback(reader, p) == baseline_before,
             'RF03_HISTORICAL_BASELINE_DRIFT')
        contract = rt.VerifiedCandidateContract(rt.validate_packet(packet))
        result = rt.promote_for_transport_test(packet, transport, journal, contract)
        if result['state'] == 'NO_OP':
            need(rt.read_final_set(packet, transport) == 'NO_OP', 'RC_NO_OP_FINAL_SET_CHANGED')
            journal.append({'event': 'NO_OP_CONFIRMED'})
        if result['state'] in ('COMPLETE', 'NO_OP'):
            need(protected_baseline_readback(reader, p) == baseline_before,
                 'RF03_HISTORICAL_BASELINE_DRIFT')
            receipt = {'kind': 'PROMOTION_OPERATION_NOT_NEW_PROVENANCE_V1',
                'candidateSourceA': p['candidate']['sourceCommit'], 'candidateTreeA': p['candidate']['sourceTree'],
                'candidateRunId': p['candidate']['runId'], 'candidateReceiptSha256': p['candidate']['artifact']['files']['candidate-receipt.json'],
                'candidateBundleSha256': p['candidate']['artifact']['files']['candidate-bundle.sigstore.json'],
                'promotionCodeSourceB': p['promotion']['sourceCommit'], 'promotionCodeTreeB': p['promotion']['sourceTree'],
                'runId': expected['runId'], 'runAttempt': '1', 'ownerPacketSha256': expected['packetSha256'],
                'freshReview': review, 'state': result['state'],
                'finals': {role: {'ref': ca.PACKAGE + ':' + rt.FINALS[role], 'digest': p['roles'][role]['digest']} for role in ca.ROLES},
                'limits': ['existing_candidate_provenance_not_new_signature', 'no_fresh_runtime_claim',
                           'non_atomic_external_writers_not_excluded', 'no_auto_rollback_delete_retry_alias_deploy']}
            validate_operation(receipt, p, expected)
            candidate.write_new(Path(private) / 'operation-receipt.json', ca.canonical(receipt))
        return result
    finally:
        journal.close()


def build(inputs):
    ca.exact(inputs, ('artifactDirectory', 'artifactMetadata', 'roles', 'promotion', 'environment', 'controls', 'rollbackBaseline', 'nonce'))
    directory = Path(inputs['artifactDirectory']); receipt = candidate.read(directory / 'candidate-receipt.json')
    candidate.validate_receipt(receipt)
    p = policy.template(); p.update({k: inputs[k] for k in ('roles', 'promotion', 'controls', 'rollbackBaseline', 'nonce')})
    ca.exact(inputs['environment'], ('environmentId', 'environmentConfigSha256', 'environmentUiObservationSha256'))
    p.update(inputs['environment'])
    p['candidate'] = {k: receipt[k] for k in ('sourceCommit', 'sourceTree', 'workflowCommit', 'runId', 'runAttempt', 'packetSha256')}
    p['candidate']['artifact'] = dict(inputs['artifactMetadata'])
    p['candidate']['artifact']['files'] = {name: ca.sha((directory / name).read_bytes()) for name in policy.FILES}
    artifact_files(directory, p)
    return p  # Local preparation only: readiness/actual review are separate.


def git(*args):
    return candidate.command(['git', *args], env={'PATH': os.environ['PATH']}).decode().strip()


def load(env):
    raw = env.get('RC_PACKET_JSON', '').encode(); digest = env.get('RC_PACKET_SHA256', '')
    p = policy.packet(raw, digest); expected = policy.guard(p, digest, env, git)
    return p, expected


def paths(env):
    base = env.get('RUNNER_TEMP', '')
    need(type(base) is str and Path(base).is_absolute() and not re.search(r'[\x00-\x1f\x7f]', base), 'RC_RUNNER_TEMP_INVALID')
    root = Path(base)
    need(root.is_dir() and not root.is_symlink(), 'RC_RUNNER_TEMP_INVALID')
    return root / 'issue225-promotion-private', root / 'issue225-promotion-public', root / 'issue225-promotion-input'


def validate_operation(value, p, expected):
    ca.exact(value, ('kind', 'candidateSourceA', 'candidateTreeA', 'candidateRunId', 'candidateReceiptSha256',
        'candidateBundleSha256', 'promotionCodeSourceB', 'promotionCodeTreeB', 'runId', 'runAttempt',
        'ownerPacketSha256', 'freshReview', 'state', 'finals', 'limits'))
    need(value['kind'] == 'PROMOTION_OPERATION_NOT_NEW_PROVENANCE_V1'
         and value['candidateSourceA'] == p['candidate']['sourceCommit']
         and value['candidateTreeA'] == p['candidate']['sourceTree']
         and value['candidateRunId'] == p['candidate']['runId']
         and value['candidateReceiptSha256'] == p['candidate']['artifact']['files']['candidate-receipt.json']
         and value['candidateBundleSha256'] == p['candidate']['artifact']['files']['candidate-bundle.sigstore.json']
         and value['promotionCodeSourceB'] == expected['sourceCommit']
         and value['promotionCodeTreeB'] == expected['sourceTree']
         and value['runId'] == expected['runId'] and value['runAttempt'] == '1'
         and value['ownerPacketSha256'] == expected['packetSha256']
         and value['state'] in ('COMPLETE', 'NO_OP'), 'RC_OPERATION_RECEIPT_BINDING_INVALID')
    review = value['freshReview']
    ca.exact(review, ('reviewerId','reviewState','jobId','environmentId','adminBypassOrigin','independentSecondHuman','externalControls'))
    need(review['reviewerId'] == ca.OWNER_ID and review['reviewState'] == 'approved'
         and type(review['jobId']) is int and review['jobId'] > 0 and review['environmentId'] == p['environmentId']
         and review['adminBypassOrigin'] in ('API_RUNTIME_BOOLEAN','OWNER_OBSERVED_UI_NOT_API')
         and review['independentSecondHuman'] is False
         and review['externalControls'] == 'OWNER_REVIEWED_HASH_LINKS_NOT_LIVE_POLICY_OR_ALL_WRITER_VERIFICATION',
         'RC_OPERATION_REVIEW_FIELDS_INVALID')
    need(value['finals'] == {r:{'ref':ca.PACKAGE+':'+rt.FINALS[r],'digest':p['roles'][r]['digest']} for r in ca.ROLES}
         and value['limits'] == ['existing_candidate_provenance_not_new_signature','no_fresh_runtime_claim',
             'non_atomic_external_writers_not_excluded','no_auto_rollback_delete_retry_alias_deploy'], 'RC_OPERATION_FIELDS_INVALID')


def progress(private, public, expected, p):
    """Always publish only closed fields, never private journal/errors/files."""
    private, public = Path(private), Path(public)
    need(public.is_dir() and not public.is_symlink(), 'RC_PUBLIC_DIR_INVALID')
    state = 'NOT_STARTED'; attempted = []; confirmed = []
    journal = private / 'promotion-journal.jsonl'
    if journal.exists():
        need(journal.is_file() and not journal.is_symlink() and journal.stat().st_size < 1024 * 1024, 'RC_JOURNAL_UNAVAILABLE')
        try:
            events = [ca.decode(line) for line in journal.read_bytes().splitlines()]
            attempted = [v['role'] for v in events if v.get('event') == 'PUT_INTENT']
            confirmed = [v['role'] for v in events if v.get('event') == 'PUT_CONFIRMED']
            need(all(v in ca.ROLES for v in attempted + confirmed), 'RC_JOURNAL_ROLE_INVALID')
            state = 'PARTIAL_RELEASE' if confirmed else ('UNCERTAIN' if attempted else 'HALT')
            if events and events[-1].get('event') in ('COMPLETE', 'NO_OP_CONFIRMED'):
                state = 'COMPLETE' if events[-1]['event'] == 'COMPLETE' else 'NO_OP'
        except (ca.Pending, ValueError, KeyError, TypeError):
            state = 'UNKNOWN_JOURNAL'; attempted = []; confirmed = []
    result = {'kind': 'PROMOTION_PROGRESS_NOT_PROVENANCE_V1', 'ownerPacketSha256': expected['packetSha256'],
        'runId': expected['runId'], 'state': state, 'attempted': attempted, 'confirmed': confirmed,
        'candidateSourceA': p['candidate']['sourceCommit'], 'promotionCodeSourceB': p['promotion']['sourceCommit'],
        'expectedFinals': {r:{'ref':ca.PACKAGE+':'+rt.FINALS[r],'digest':p['roles'][r]['digest']} for r in ca.ROLES},
        'observation': 'JOURNAL_ONLY_NOT_NEW_REGISTRY_READBACK',
        'recovery': 'READ_ONLY_RECONCILE_EXACT_THREE_REFS_KEEP_HOLD_NO_AUTOMATIC_FILL_DELETE_ROLLBACK'}
    target = public / 'progress.json'; need(not target.is_symlink(), 'RC_PROGRESS_PATH_REFUSED')
    target.write_bytes(ca.canonical(result))
    receipt = private / 'operation-receipt.json'
    if state in ('COMPLETE', 'NO_OP') and receipt.exists():
        need(receipt.is_file() and not receipt.is_symlink() and receipt.stat().st_size <= 2 * 1024 * 1024, 'RC_OPERATION_PATH_INVALID')
        validate_operation(ca.decode(receipt.read_bytes()), p, expected)
        candidate.write_new(public / 'operation-receipt.json', receipt.read_bytes())
    names = {'progress.json', 'operation-receipt.json'}
    need(all(p.name in names and p.is_file() and not p.is_symlink() for p in public.iterdir()), 'RC_PUBLIC_PAYLOAD_REFUSED')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', nargs='?', default='plan', choices=('plan','template','build','init','environment','metadata','original-zip','publish','progress'))
    parser.add_argument('--input', type=Path); parser.add_argument('--gh')
    args = parser.parse_args(argv)
    if args.action in ('plan','template','build'):
        value = policy.template() if args.input is None else ca.decode(args.input.read_bytes())
        if args.action == 'build': value = build(value)
        print(json.dumps(value if args.action in ('template','build') else policy.plan(value), sort_keys=True)); return
    p, expected = load(os.environ); private, public, downloaded = paths(os.environ)
    if args.action == 'init':
        for directory in (private, public, downloaded): directory.mkdir(mode=0o700)
        progress(private, public, expected, p)
        with open(os.environ['GITHUB_ENV'], 'a') as stream:
            for k,v in (('RC_PRIVATE',private),('RC_PUBLIC',public),('RC_INPUT',downloaded)): stream.write(k+'='+str(v)+'\n')
        return
    if args.action == 'progress': progress(private, public, expected, p); return
    token = os.environ.get('RC_JOB_TOKEN'); api = API(token); ui = os.environ.get('RC_UI_JSON','').encode()
    if args.action == 'environment': ca.environment_gate(api, p, ui); return
    policy.approval_gate(api, p, expected, ui)
    if args.action == 'original-zip':
        artifact = policy.candidate_metadata(api, p)
        artifact_download.download(artifact['id'], artifact['size'], artifact['digest'],
                                   token, private / 'original-candidate.zip')
        return
    if args.action == 'metadata':
        artifact = policy.candidate_metadata(api, p)
        with open(os.environ['GITHUB_OUTPUT'],'a') as stream:
            stream.write('artifact_id='+str(artifact['id'])+'\nrun_id='+p['candidate']['runId']+'\n')
        return
    result = perform(p, expected, api, ui, downloaded, private, args.gh, token,
        lambda: ReadRegistry(token, os.environ['GITHUB_ACTOR'], p['candidate']))
    need(result['state'] in ('COMPLETE','NO_OP'), 'RC_RELEASE_HALTED_OR_UNCERTAIN')


if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(str(error) if isinstance(error,(ca.Pending,rt.Rejected)) else 'RC_FAILED_OR_PENDING',file=sys.stderr)
        sys.exit(1)
