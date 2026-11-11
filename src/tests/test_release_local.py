"""Local release fail-closed checks; no Docker or network access."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
import subprocess
import copy
import contextlib
import io
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import release_local as release
import release_local_registry as registry


class FakeHTTP:
    def request(self, method, url, headers=None, data=None, destination=None, limit=None):
        if url == 'https://ghcr.io/v2/':
            return 401, {'www-authenticate': 'Bearer realm="https://ghcr.io/token",service="ghcr.io"'}, b'', 0, None
        if url.startswith('https://ghcr.io/token?'):
            raw = b'{"token":"fake"}'
            return 200, {}, raw, len(raw), None
        raise AssertionError('Unexpected HTTP call')


class ReleaseLocalTests(unittest.TestCase):
    def test_shared_blob_uses_inherited_transport_with_each_role_path(self):
        class UploadHTTP(FakeHTTP):
            def __init__(self):
                self.writes = []

            def request(self, method, url, headers=None, data=None, destination=None, limit=None):
                if method == 'HEAD' and '/blobs/sha256:' in url:
                    return 404, {}, b'', 0, None
                if method == 'POST' and url.endswith('/blobs/uploads/'):
                    self.writes.append(('POST', url, None, None))
                    return 202, {'location': '/v2/planner77/layoutmanager/blobs/uploads/session'}, b'', 0, None
                if method == 'PUT' and '/blobs/uploads/session?' in url:
                    self.writes.append(('PUT', url, data.name, data.read()))
                    return 201, {'docker-content-digest': blob_digest}, b'', 0, None
                return super().request(method, url, headers, data, destination, limit)

        class IntentJournal:
            def __init__(self):
                self.intents = []

            def intent(self, method, kind, reference):
                self.intents.append((method, kind, reference))

        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            data = b'shared OCI blob'
            blob_digest = 'sha256:' + hashlib.sha256(data).hexdigest()
            graphs = {}
            refs = release.refs('0.61.1', 'b' * 40)['candidate']
            for role, letter in zip(release.ROLES, 'cde'):
                path = workspace / (role + '.blob')
                path.write_bytes(data)
                top_digest = 'sha256:' + letter * 64
                graphs[role] = {'digest': top_digest, 'objects': {
                    blob_digest: {'kind': 'blob', 'path': str(path), 'digest': blob_digest,
                                  'size': len(data), 'mediaType': 'application/vnd.oci.image.layer.v1.tar'},
                    top_digest: {'kind': 'manifest', 'path': str(workspace / (role + '.manifest')),
                                 'digest': top_digest, 'size': 1,
                                 'mediaType': 'application/vnd.oci.image.manifest.v1+json'}}}
            original = copy.deepcopy(graphs)
            http = UploadHTTP()
            journal = IntentJournal()
            client = registry.GHCR('fake-token', set(registry.tags(refs).values()), journal,
                                   write=True, http=http)
            client.bind(graphs, refs)
            app_item = graphs['app']['objects'][blob_digest]
            for changed in ('digest', 'size', 'mediaType', 'kind'):
                with self.subTest(changed=changed):
                    bad = dict(app_item)
                    bad[changed] = {'digest': 'sha256:' + 'f' * 64,
                                    'size': len(data) + 1,
                                    'mediaType': 'application/octet-stream',
                                    'kind': 'manifest'}[changed]
                    with self.assertRaisesRegex(registry.Blocked, 'CA_LOCAL_BLOB_CHANGED'):
                        client.upload_blob(bad, Path(app_item['path']))
            unbound = workspace / 'unbound.blob'
            unbound.write_bytes(data)
            with self.assertRaisesRegex(registry.Blocked, 'CA_LOCAL_BLOB_CHANGED'):
                client.upload_blob(app_item, unbound)
            app_path = Path(app_item['path'])
            app_path.write_bytes(b'tampered OCI blob')
            with self.assertRaisesRegex(registry.Blocked, 'CA_LOCAL_BLOB_CHANGED'):
                client.upload_blob(app_item, app_path)
            app_path.write_bytes(data)
            # A role's own descriptor/path must still be rejected when the
            # bytes are tampered without changing their length.
            migrator_item = graphs['migrator']['objects'][blob_digest]
            migrator_path = Path(migrator_item['path'])
            migrator_path.write_bytes(b'broken OCI blob')
            self.assertEqual(migrator_path.stat().st_size, len(data))
            with self.assertRaisesRegex((registry.Blocked, registry.old.Pending), 'CA_LOCAL_BLOB_CHANGED'):
                client.upload_blob(migrator_item, migrator_path)
            migrator_path.write_bytes(data)

            # The inherited transport uploads the canonical app path even
            # when called through another role. Validate that path at upload
            # time too, before it can emit a journal intent or HTTP write.
            app_path.write_bytes(b'broken OCI blob')
            self.assertEqual(app_path.stat().st_size, len(data))
            with self.assertRaisesRegex((registry.Blocked, registry.old.Pending), 'CA_LOCAL_BLOB_CHANGED'):
                client.upload_blob(migrator_item, migrator_path)
            app_path.write_bytes(data)
            self.assertEqual(http.writes, [])
            self.assertEqual(journal.intents, [])
            conflicting = copy.deepcopy(graphs)
            conflicting['cpu-worker']['objects'][blob_digest]['mediaType'] = 'application/octet-stream'
            separate = registry.GHCR('fake-token', set(registry.tags(refs).values()),
                                     IntentJournal(), write=True, http=UploadHTTP())
            with self.assertRaisesRegex(registry.Blocked, 'GHCR_SHARED_OBJECT'):
                separate.bind(conflicting, refs)
            self.assertEqual(separate.bound_objects, {})
            for role in release.ROLES:
                item = graphs[role]['objects'][blob_digest]
                client.upload_blob(item, Path(item['path']))
            self.assertEqual(graphs, original)
            self.assertEqual([method for method, *_ in http.writes], ['POST', 'PUT'] * 3)
            self.assertEqual([(path, sent) for method, _, path, sent in http.writes
                              if method == 'PUT'], [(str(app_path), data)] * 3)
            self.assertEqual([kind for _, kind, _ in journal.intents],
                             ['blob-upload-init', 'blob-by-digest'] * 3)

    def test_owner_record_binds_exact_three_digests(self):
        with tempfile.TemporaryDirectory() as directory:
            plan = {'planSha256': 'a' * 64,
                    'source': {'commit': 'b' * 40, 'version': '0.61.1'},
                    'roles': {r: {'topDescriptor': {'digest': 'sha256:' + c * 64}}
                              for r, c in zip(release.ROLES, 'cde')},
                    'refs': release.refs('0.61.1', 'b' * 40)}
            record = {'format': 'RELEASE282-OWNER-GO-V1', 'conversationRef': 'conversation-282',
                      'recordedBy': 'release operator', 'verbatimOwnerReply': 'GO for this exact plan',
                      'presentedPlanSha256': plan['planSha256'],
                      'sourceCommit': plan['source']['commit'], 'version': '0.61.1',
                      'roleDigests': {r: plan['roles'][r]['topDescriptor']['digest']
                                      for r in release.ROLES},
                      'candidateRefs': plan['refs']['candidate'],
                      'finalRefs': plan['refs']['final']}
            path = Path(directory) / 'go.json'
            with self.assertRaises(Exception):
                release.approval(str(path), plan)
            path.write_text(json.dumps(record))
            path.chmod(0o600)
            self.assertEqual(release.approval(str(path), plan)['conversationRef'], 'conversation-282')
            record['roleDigests']['migrator'] = 'sha256:' + 'f' * 64
            path.write_text(json.dumps(record))
            with self.assertRaisesRegex(release.Halt, 'OWNER_GO_BINDING'):
                release.approval(str(path), plan)

    def test_publish_failures_halt_and_never_resume(self):
        class FakeRegistry:
            def __init__(self, tags, failure):
                self.allowed_tags = tags
                self.failure = failure
                self.values = dict(release.BASELINE)
                self.puts = []
                self.baselines = 0
                self.journal = None
            def manifest(self, ref):
                if ref in release.BASELINE:
                    self.baselines += 1
                    if self.failure == 'post-baseline' and self.puts and self.baselines > 8:
                        return {'digest': 'sha256:' + 'f' * 64}
                digest = self.values.get(ref)
                return {'digest': digest} if digest else None
            def bind(self, graphs, refs):
                pass
            def put_manifest(self, ref, descriptor, raw):
                self.journal.intent('PUT', 'manifest', ref)
                self.puts.append(ref)
                if self.failure in ('401', '403', 'timeout', 'pending') or (
                        self.failure == 'second-role' and len(self.puts) == 2):
                    if self.failure == 'timeout':
                        raise TimeoutError('synthetic timeout')
                    if self.failure == 'pending':
                        raise registry.old.Pending('https://private.invalid/?token=synthetic-secret')
                    raise registry.Blocked('HTTP_' + self.failure)
                self.values[ref] = descriptor['digest']

        for failure in ('401', '403', 'timeout', 'pending', 'second-role', 'readback', 'post-baseline', 'existing'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                workspace = Path(directory)
                plan_path = workspace / 'preflight.json'
                plan_path.write_text('{}')
                plan_path.chmod(0o600)
                refs = release.refs('0.61.1', 'b' * 40)
                plan = {'planSha256': 'a' * 64, 'source': {'commit': 'b' * 40,
                        'version': '0.61.1'}, 'refs': refs}
                graphs = {}
                for role, character in zip(release.ROLES, 'cde'):
                    digest = 'sha256:' + character * 64
                    raw_path = workspace / (role + '.manifest')
                    raw_path.write_bytes(b'raw')
                    graphs[role] = {'digest': digest, 'objects': {digest: {
                        'kind': 'manifest', 'path': str(raw_path), 'digest': digest,
                        'size': 3, 'mediaType': 'application/vnd.oci.image.index.v1+json'}},
                        'manifestOrder': [digest]}
                fake = FakeRegistry(release.allowed_tags(refs), failure)
                if failure == 'existing':
                    fake.values[registry.tags(refs['candidate'])['app']] = graphs['app']['digest']
                def make_client(token, tags, journal=None, **kwargs):
                    fake.journal = journal
                    return fake
                def readback(client, target_refs, candidate_graphs, source):
                    if failure == 'readback':
                        raise registry.Blocked('READBACK_FAILED')
                    tags = registry.tags(target_refs)
                    return {role: fake.values[tags[role]] for role in release.ROLES}
                patches = [mock.patch.object(release, 'checked_preflight', return_value=(plan, {}, graphs)),
                           mock.patch.object(release, 'approval', return_value={'recordSha256': 'f' * 64,
                                                                               'conversationRef': 'test',
                                                                               'authority': 'test'}),
                           mock.patch.object(release, 'credential', return_value='opaque'),
                           mock.patch.object(release.registry, 'GHCR', side_effect=make_client),
                           mock.patch.object(release, 'readback', side_effect=readback),
                           mock.patch.object(release.registry, 'pull_smoke')]
                for patch in patches:
                    patch.start()
                try:
                    with self.assertRaises((release.Halt, registry.Blocked,
                                            registry.old.Pending, TimeoutError)):
                        release.publish_stage('candidate', str(plan_path), 'owner-record',
                                              None, execute=True)
                    journal_path = workspace / 'candidate.journal.jsonl'
                    if failure == 'existing':
                        self.assertFalse(journal_path.exists())
                        self.assertEqual(fake.puts, [])
                    else:
                        rows = registry.read_journal(journal_path, plan['planSha256'], 'candidate')
                        self.assertEqual(rows[-1]['event'], 'HALT')
                        before = len(fake.puts)
                        with self.assertRaisesRegex(release.Halt, 'ATTEMPT_ALREADY_EXISTS'):
                            release.publish_stage('candidate', str(plan_path), 'owner-record',
                                                  None, execute=True)
                        self.assertEqual(len(fake.puts), before)
                finally:
                    for patch in reversed(patches):
                        patch.stop()

    def test_cli_sanitizes_inherited_pending(self):
        secret = 'https://private.invalid/?token=synthetic-secret'
        stderr = io.StringIO()
        with mock.patch.object(sys, 'argv', ['release_local.py', 'candidate',
                                             '--preflight-record', 'preflight.json',
                                             '--owner-record', 'owner.json', '--execute']), \
             mock.patch.object(release, 'publish_stage', side_effect=registry.old.Pending(secret)), \
             contextlib.redirect_stderr(stderr):
            self.assertEqual(release.main(), 1)
        self.assertEqual(stderr.getvalue(), 'RELEASE282_HALT\n')

    def test_all_workspaces_contend_for_one_publisher_lock(self):
        first = release.publisher_lock()
        try:
            with self.assertRaisesRegex(registry.Blocked, 'PUBLISHER_LOCKED'):
                release.publisher_lock()
        finally:
            first.close()

    def test_final_rejects_candidate_journal_halt_after_verified(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            plan = {'planSha256': 'a' * 64,
                    'refs': {'candidate': {'app': 'ghcr.io/planner77/layoutmanager:candidate-app'}}}
            owner = {'recordSha256': 'b' * 64}
            journal_path = workspace / 'candidate.journal.jsonl'
            journal = registry.Journal(journal_path, plan['planSha256'], 'candidate')
            journal.append({'event': 'VERIFIED', 'readback': {'app': 'sha256:' + 'c' * 64}})
            journal.append({'event': 'HALT', 'partialState': 'UNKNOWN_OR_PARTIAL'})
            journal.close()
            rows = registry.read_journal(journal_path, plan['planSha256'], 'candidate')
            receipt = {'state': 'CANDIDATE_VERIFIED', 'planSha256': plan['planSha256'],
                       'ownerRecordSha256': owner['recordSha256'],
                       'refs': plan['refs']['candidate'], 'baseline': release.BASELINE,
                       'journalSha256': release.file_sha(journal_path),
                       'journalLastSha256': rows[-1]['sha256'],
                       'readback': {'app': 'sha256:' + 'c' * 64}}
            receipt_path = workspace / 'candidate.receipt.json'
            receipt_path.write_text(json.dumps(receipt))
            receipt_path.chmod(0o600)
            with self.assertRaisesRegex(release.Halt, 'CANDIDATE_RECEIPT_JOURNAL'):
                release.checked_candidate_receipt(workspace, plan, owner)
            journal_path.write_bytes(journal_path.read_bytes()[:-4])
            with self.assertRaises((registry.Blocked, json.JSONDecodeError)):
                release.checked_candidate_receipt(workspace, plan, owner)

    def test_smoke_timeout_cleans_only_owned_container_with_private_data_mount(self):
        image = 'r282local' + 'a' * 12 + ':0.61.1'
        calls = []
        def fake(args, **kwargs):
            calls.append(args)
            if args[1] == 'run':
                self.assertIn('/data:rw,nosuid,nodev,size=16m,uid=10001,gid=10001', args)
                raise subprocess.TimeoutExpired(args, 120)
            if args[1:3] == ['container', 'inspect']:
                nonce = calls[0][calls[0].index('--label') + 1].split('=', 1)[1]
                item = {'Name': '/' + args[3], 'Config': {'Image': image,
                        'Labels': {'release282.smoke': nonce}},
                        'HostConfig': {'Tmpfs': {
                            '/tmp': 'rw,noexec,nosuid,nodev,size=96m,uid=10001,gid=10001',
                            '/data': 'rw,nosuid,nodev,size=16m,uid=10001,gid=10001'}},
                        'Mounts': []}
                return subprocess.CompletedProcess(args, 0, json.dumps([item]).encode(), b'')
            return subprocess.CompletedProcess(args, 0, b'', b'')
        with mock.patch.object(registry.subprocess, 'run', side_effect=fake):
            with self.assertRaises(subprocess.TimeoutExpired):
                registry.smoke_image(image)
        self.assertEqual(calls[-1][1:4], ['rm', '-f', '-v'])

    def test_smoke_docker29_tmpfs_only_inspect_cleans_owned_container(self):
        image = 'r282local' + 'a' * 12 + ':0.61.1'
        calls = []
        def fake(args, **kwargs):
            calls.append(args)
            if args[1:3] == ['container', 'inspect']:
                nonce = calls[0][calls[0].index('--label') + 1].split('=', 1)[1]
                item = {'Name': '/' + args[3], 'Config': {'Image': image,
                        'Labels': {'release282.smoke': nonce}},
                        'HostConfig': {'Tmpfs': {
                            '/tmp': 'rw,noexec,nosuid,nodev,size=96m,uid=10001,gid=10001',
                            '/data': 'rw,nosuid,nodev,size=16m,uid=10001,gid=10001'}},
                        'Mounts': []}
                return subprocess.CompletedProcess(args, 0, json.dumps([item]).encode(), b'')
            return subprocess.CompletedProcess(args, 0, b'', b'')
        with mock.patch.object(registry.subprocess, 'run', side_effect=fake):
            registry.smoke_image(image)
        self.assertEqual(calls[-1][1:4], ['rm', '-f', '-v'])

    def test_smoke_rejects_foreign_data_mount_without_cleanup(self):
        image = 'r282local' + 'a' * 12 + ':0.61.1'
        for mount_type in ('bind', 'volume'):
            with self.subTest(mount_type=mount_type):
                calls = []
                def fake(args, **kwargs):
                    calls.append(args)
                    if args[1:3] == ['container', 'inspect']:
                        nonce = calls[0][calls[0].index('--label') + 1].split('=', 1)[1]
                        item = {'Name': '/' + args[3], 'Config': {'Image': image,
                                'Labels': {'release282.smoke': nonce}},
                                'HostConfig': {'Tmpfs': {
                                    '/tmp': 'rw,noexec,nosuid,nodev,size=96m,uid=10001,gid=10001',
                                    '/data': 'rw,nosuid,nodev,size=16m,uid=10001,gid=10001'}},
                                'Mounts': [{'Destination': '/data', 'Type': mount_type}]}
                        return subprocess.CompletedProcess(args, 0, json.dumps([item]).encode(), b'')
                    return subprocess.CompletedProcess(args, 0, b'', b'')
                with mock.patch.object(registry.subprocess, 'run', side_effect=fake):
                    with self.assertRaisesRegex(registry.Blocked, 'DIGEST_SMOKE_OWNERSHIP'):
                        registry.smoke_image(image)
                self.assertEqual(len(calls), 2)

    def test_published_config_must_match_actual_local_image(self):
        image = {'Id': 'sha256:' + 'a' * 64}
        record = {'imageId': image['Id']}
        graph = {'configDigest': 'sha256:' + 'b' * 64}
        with self.assertRaisesRegex(release.Halt, 'BUILD_IMAGE_CHANGED'):
            release.check_image_binding(graph, record, image)

    def test_read_only_transport_rejects_mutation_before_http(self):
        client = registry.GHCR('fake-token', {'0.61.0'}, http=FakeHTTP(), write=False)
        with self.assertRaisesRegex(registry.Blocked, 'READ_ONLY_REGISTRY_ROUTE'):
            client.request('POST', '/v2/planner77/layoutmanager/blobs/uploads/', data=b'')

    def test_journal_short_writes_are_completed_and_chained(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'attempt.jsonl'
            original = os.write
            count = 0
            def short(fd, data):
                nonlocal count
                count += 1
                return original(fd, data[:1] if count == 1 else data)
            with mock.patch.object(registry.os, 'write', side_effect=short):
                journal = registry.Journal(path, 'a' * 64, 'candidate')
                journal.intent('PUT', 'manifest', 'candidate-ref')
                journal.close()
            rows = registry.read_journal(path, 'a' * 64, 'candidate')
            self.assertEqual([r['event'] for r in rows], ['BEGIN', 'REMOTE_INTENT'])

    def test_required_case_downgrade_and_tampered_log(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            log = root / 'data/verify-local/run/case.log'
            log.parent.mkdir(parents=True)
            log.write_bytes(b'PASS\n')
            digest = hashlib.sha256(log.read_bytes()).hexdigest()
            state = {'commit': 'a' * 40, 'tree': 'b' * 40}
            source = {'base': 'c' * 40, 'head': state['commit'], 'tree': state['tree'],
                      'fingerprint': 'd' * 64, 'dirty': False, 'paths': []}
            case = {'id': 'preflight', 'required': True, 'status': 'PASS', 'exit_code': 0,
                    'argv': ['python3', 'scripts/verify_local_preflight.py'], 'cwd': 'src',
                    'log': 'data/verify-local/run/case.log', 'logSha256': digest}
            browser_argv = ['npx', 'playwright', 'test', '--config',
                            'playwright.g7-runtime.config.ts', '--reporter=line']
            browser = {**case, 'id': 'g7-browser', 'argv': browser_argv}
            run = {'issue': '282', 'status': 'PASS', 'stale': False,
                   'start': {'profile': 'release', 'source': source, 'risks': [],
                             'synthetic_auth_clock': 'native'},
                   'end': {'source': source, 'synthetic_auth_clock': 'native'},
                   'cases': [case, browser]}
            path = root / 'run.json'
            def check_run(changed):
                path.write_text(json.dumps(changed))
                def expected_manifest(*args, synthetic_auth_clock='native', **kwargs):
                    expected_browser = (["env", "G7_RUNTIME_E2E_MONOTONIC_CLOCK=true"]
                                        if synthetic_auth_clock == 'monotonic' else []) + browser_argv
                    return [{'id': 'preflight', 'required': True, 'argv': case['argv'], 'cwd': 'src'},
                            {'id': 'g7-browser', 'required': True, 'argv': expected_browser, 'cwd': 'src'}]
                with mock.patch.object(release, 'ROOT', root), \
                     mock.patch.object(release.recovery, 'private_file', return_value=path), \
                     mock.patch.object(release.verify_local, 'source_state', return_value=source), \
                     mock.patch.object(release.verify_local, 'infer_risks', return_value=([], '')), \
                     mock.patch.object(release.verify_local, 'manifest', side_effect=expected_manifest):
                    release.verify_run(str(path), state)
            check_run(run)
            run['start']['synthetic_auth_clock'] = 'monotonic'
            with self.assertRaisesRegex(release.Halt, 'VERIFY_CLOCK_MODE'):
                check_run(run)
            run['start']['synthetic_auth_clock'] = 'native'
            run['start']['synthetic_auth_clock'] = run['end']['synthetic_auth_clock'] = 'monotonic'
            with self.assertRaisesRegex(release.Halt, 'VERIFY_CASE_DOWNGRADED'):
                check_run(run)
            run['start']['synthetic_auth_clock'] = run['end']['synthetic_auth_clock'] = 'native'
            case['required'] = False
            with self.assertRaisesRegex(release.Halt, 'VERIFY_CASE_DOWNGRADED'):
                check_run(run)
            case['required'] = True
            log.write_bytes(b'FAIL\n')
            with self.assertRaisesRegex(release.Halt, 'VERIFY_LOG_BYTES'):
                check_run(run)


if __name__ == '__main__':
    unittest.main()
