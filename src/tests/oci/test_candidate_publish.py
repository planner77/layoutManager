#!/usr/bin/env python3
"""Synthetic local RF-A/B fixtures only; no Docker, live API, registry or OIDC."""
import copy
import datetime as dt
import io
import json
import os
import re
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
import urllib.parse
from unittest.mock import patch, Mock

import candidate_policy as p
import candidate_registry as r
import candidate_publish as c

SOURCE = 'a' * 40
TREE = 'b' * 40
ENV = {'id': 71, 'name': p.ENVIRONMENT, 'can_admins_bypass': False,
       'deployment_branch_policy': {'protected_branches': False, 'custom_branch_policies': True},
       'protection_rules': [{'type': 'required_reviewers', 'prevent_self_review': False,
                            'reviewers': [{'type': 'User', 'reviewer': {'id': p.OWNER_ID}}]},
                            {'type': 'branch_policy'}]}
POLICIES = [{'id': 72, 'name': 'main', 'type': 'branch'}]


def packet(config=None, ui=None):
    config = config or ENV
    return {'kind': 'CANDIDATE_PREFIX_AUTHORIZATION_V1', 'repository': p.REPO,
        'repositoryId': p.REPO_ID, 'ownerId': p.OWNER_ID, 'sourceCommit': SOURCE,
        'sourceTree': TREE, 'workflowCommit': SOURCE, 'workflowPath': p.WORKFLOW,
        'version': '0.61.0', 'package': p.PACKAGE, 'packageId': p.PACKAGE_ID,
        'visibility': 'private', 'roles': list(p.ROLES),
        'candidatePrefixTemplate': 'candidate-{sourceCommit}-{runId}-1-',
        'environmentId': 71, 'environmentConfigSha256': p.sha(p.canonical(p.environment_summary(config, POLICIES))),
        'environmentUiObservationSha256': p.sha(ui) if ui else None,
        'requiredCi': {'runId': 100, 'workflowId': 55, 'headSha': 'c' * 40,
                       'archiveSha': 'c' * 40, 'treeSha': TREE, 'runAttempt': 1},
        'controls': {key: 'd' * 64 for key in ('policyReceiptSha256', 'writerInventorySha256',
                                             'legacyControlReceiptSha256', 'rollbackPacketSha256')},
        'permissionScope': 'candidate-prefix-only-not-release-go',
        'stopPolicy': 'HALT-no-retry-delete-overwrite-rollback',
        'runScope': 'fresh-owner-dispatch-attempt-1', 'nonce': '0' * 16}


def expected(packet_value=None):
    packet_value = packet_value or packet()
    return {'sourceCommit': SOURCE, 'sourceTree': TREE, 'workflowCommit': SOURCE,
            'runId': '123', 'runAttempt': '1', 'packetSha256': p.sha(p.canonical(packet_value))}


def context(packet_value=None):
    value = expected(packet_value)
    return {'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': 'workflow_dispatch',
            'GITHUB_REPOSITORY': p.REPO, 'GITHUB_REPOSITORY_ID': str(p.REPO_ID),
            'GITHUB_REPOSITORY_OWNER_ID': str(p.OWNER_ID), 'GITHUB_ACTOR_ID': str(p.OWNER_ID),
            'GITHUB_ACTOR': 'planner77', 'GITHUB_TRIGGERING_ACTOR': 'planner77',
            'GITHUB_REF': 'refs/heads/main', 'GITHUB_WORKFLOW_REF': p.SIGNER + '@refs/heads/main',
            'GITHUB_WORKFLOW_SHA': SOURCE, 'GITHUB_SHA': SOURCE, 'RUNNER_ENVIRONMENT': 'github-hosted',
            'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_RUN_ID': '123', 'CA_PACKET_SHA256': value['packetSha256']}


def fake_git(*args):
    if args[0] == 'status': return ''
    return TREE if args[-1] == 'HEAD^{tree}' else SOURCE


class API:
    def __init__(self, packet_value=None):
        self.packet = packet_value or packet(); self.calls = []; self.change = None
        self.config = copy.deepcopy(ENV); self.reviews = [{'state': 'approved',
            'user': {'id': p.OWNER_ID}, 'environments': [{'id': 71, 'name': p.ENVIRONMENT}]}]

    def get(self, path):
        self.calls.append(path)
        if path.endswith('/actions/runs/123/attempts/1'):
            value = {'id': 123, 'workflow_id': 88, 'repository': {'id': p.REPO_ID},
                'head_sha': SOURCE, 'head_branch': 'main', 'path': p.WORKFLOW,
                'event': 'workflow_dispatch', 'run_attempt': 1, 'status': 'in_progress',
                'actor': {'id': p.OWNER_ID}, 'triggering_actor': {'id': p.OWNER_ID},
                'display_title': p.title(expected(self.packet)['packetSha256'])}
        elif '/actions/workflows/88/runs?' in path:
            value = {'total_count': 1, 'workflow_runs': [{'id': 123,
                      'display_title': p.title(expected(self.packet)['packetSha256'])}]}
        elif path.endswith('/git/ref/heads/main'):
            value = {'ref': 'refs/heads/main', 'object': {'sha': SOURCE}}
        elif '/git/commits/' in path:
            value = {'sha': path.rsplit('/', 1)[1], 'tree': {'sha': TREE}, 'parents': [{'sha': 'c' * 40}]}
        elif '/actions/runs/123/attempts/1/jobs?' in path:
            value = {'total_count': 1, 'jobs': [{'id': 7, 'run_id': 123, 'head_sha': SOURCE,
                    'name': p.job_name(expected(self.packet)['packetSha256']), 'status': 'in_progress'}]}
        elif path.endswith('/environments/' + p.ENVIRONMENT):
            value = copy.deepcopy(self.config)
        elif '/deployment-branch-policies?' in path:
            value = {'total_count': 1, 'branch_policies': copy.deepcopy(POLICIES)}
        elif path.endswith('/approvals'):
            value = copy.deepcopy(self.reviews)
        elif path.endswith('/actions/runs/100'):
            value = {'id': 100, 'workflow_id': 55, 'repository': {'id': p.REPO_ID},
                'path': '.github/workflows/pr-ci.yml', 'head_sha': 'c' * 40,
                'status': 'completed', 'conclusion': 'success', 'run_attempt': 1}
        elif '/actions/runs/100/attempts/1/jobs?' in path:
            value = {'total_count': len(p.REQUIRED_JOBS), 'jobs': [{'name': name,
                'run_id': 100, 'status': 'completed', 'conclusion': 'success', 'head_sha': 'c' * 40}
                for name in p.REQUIRED_JOBS]}
        elif path == '/users/planner77/packages/container/layoutmanager':
            value = {'id': p.PACKAGE_ID, 'name': 'layoutmanager', 'package_type': 'container',
                'visibility': 'private', 'owner': {'id': p.OWNER_ID}, 'repository': {'id': p.REPO_ID}}
        else:
            raise AssertionError('Unexpected synthetic API route: ' + path)
        return self.change(path, value) if self.change else value


def ui_record():
    return p.canonical({'kind': 'OWNER_OBSERVED_ENVIRONMENT_UI_V1', 'repositoryId': p.REPO_ID,
        'ownerId': p.OWNER_ID, 'environmentId': 71, 'environmentName': p.ENVIRONMENT,
        'canAdminsBypass': False, 'observerId': p.OWNER_ID,
        'observedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
        'source': 'https://github.com/' + p.REPO + '/settings/environments'})


def desc(raw, media):
    return {'digest': 'sha256:' + p.sha(raw), 'size': len(raw), 'mediaType': media}


class Store:
    def __init__(self):
        self.manifests = {}; self.blobs = {}; self.events = []; self.failure = None; self.rewrite = False
    def manifest(self, reference):
        self.events.append(('GET', reference))
        if self.failure:
            self.failure('GET', reference)
        return self.manifests.get(reference)
    def blob(self, descriptor, destination):
        raw = self.blobs[descriptor['digest']]
        p.need(len(raw) == descriptor['size'] and 'sha256:' + p.sha(raw) == descriptor['digest'], 'FAKE_BLOB_INVALID')
        Path(destination).write_bytes(raw)
    def upload_blob(self, descriptor, path):
        self.events.append(('UPLOAD_BLOB', descriptor['digest']))
        if self.failure:
            self.failure('WRITE', descriptor['digest'])
        self.blobs[descriptor['digest']] = Path(path).read_bytes()
    def put_manifest(self, reference, descriptor, raw):
        self.events.append(('PUT', reference, raw))
        if self.failure:
            self.failure('WRITE', reference)
        p.need(not self.rewrite, 'FAKE_REGISTRY_REWRITTEN')
        value = {'raw': raw, **desc(raw, descriptor['mediaType'])}
        self.manifests[reference] = value; self.manifests[value['digest']] = value


def fixture(directory, index=False):
    store = Store(); graphs = {}
    for role in p.ROLES:
        layer = (role + ' synthetic layer').encode()
        config = p.canonical({'os': 'linux', 'architecture': 'amd64',
            'rootfs': {'type': 'layers', 'diff_ids': ['sha256:' + 'f' * 64]},
            'config': {'Labels': {'org.opencontainers.image.source': 'https://github.com/' + p.REPO,
                'org.opencontainers.image.revision': SOURCE, 'org.opencontainers.image.version': '0.61.0',
                'com.planner77.g7.image-role': role}}})
        config_desc = desc(config, 'application/vnd.oci.image.config.v1+json')
        layer_desc = desc(layer, 'application/vnd.oci.image.layer.v1.tar+gzip')
        store.blobs[config_desc['digest']] = config; store.blobs[layer_desc['digest']] = layer
        media = 'application/vnd.oci.image.manifest.v1+json'
        raw = p.canonical({'schemaVersion': 2, 'mediaType': media,
                           'config': config_desc, 'layers': [layer_desc]}) + b'\n'
        value = {'raw': raw, **desc(raw, media)}; store.manifests[value['digest']] = value
        if index:
            child = {**desc(raw, media), 'platform': {'os': 'linux', 'architecture': 'amd64'}}
            media = 'application/vnd.oci.image.index.v1+json'
            raw = p.canonical({'schemaVersion': 2, 'mediaType': media, 'manifests': [child]})
            value = {'raw': raw, **desc(raw, media)}; store.manifests[value['digest']] = value
        graphs[role] = r.collect_graph(store, value['digest'], Path(directory) / 'graphs' / role, role, SOURCE)
    return store, graphs


class MemoryJournal:
    def __init__(self): self.events = []; self.writes = 0
    def append(self, event): self.events.append(event)
    def intent(self, *args): self.writes += 1; self.events.append(('INTENT', *args))


class FakeRunner:
    def __init__(self, graphs, proof=None):
        self.graphs = graphs; self.cleaned = False; self.proof = proof; self.fail = None; self.checked = []
    def graphs_and_cleanup(self):
        if self.fail == 'cleanup': raise p.Pending('FAKE_CLEANUP_FAILED')
        self.cleaned = True
        return self.graphs, self.proof or {'kind': 'CANDIDATE_SAME_RUN_PROOF_CLEANED',
                   **expected(), 'archiveSha256': 'e' * 64}
    def remote_runtime(self, client, role, tag, graph):
        self.checked.append(role)
        if self.fail == role: raise p.Pending('FAKE_RUNTIME_CLEANUP_FAILED')


def result(status=200, raw=b'', headers=None):
    return status, headers or {}, raw, len(raw), 'sha256:' + p.sha(raw)


class FakeHTTP:
    def __init__(self, responses): self.responses = list(responses); self.calls = []
    def request(self, method, url, headers=None, data=None, destination=None, limit=2 * 1024 * 1024):
        self.calls.append((method, url, headers or {}, data))
        value = self.responses.pop(0)
        if isinstance(value, Exception): raise value
        if destination is not None and value[0] == 200:
            p.need(value[3] <= limit, 'CA_RESPONSE_LIMIT'); Path(destination).write_bytes(value[2])
        return value


class DistributionHTTP:
    """Exercise the actual GHCR client without sockets, using OCI API shapes."""
    def __init__(self, journal_path):
        self.blobs = {}; self.manifests = {}; self.calls = []; self.journal_path = journal_path
        self.timeout_manifest = False; self.rewrite_manifest = False
    def request(self, method, url, headers=None, data=None, destination=None, limit=2 * 1024 * 1024):
        self.calls.append((method, url, headers or {}))
        path = urllib.parse.urlsplit(url).path
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
        raw = data.read() if hasattr(data, 'read') else data
        if path == '/v2/':
            return result(401, headers={'www-authenticate': 'Bearer realm="https://ghcr.io/token",service="ghcr.io"'})
        if path == '/token': return result(raw=b'{"token":"synthetic-bearer"}')
        if method in ('PUT', 'POST'):
            entries = [json.loads(line) for line in self.journal_path.read_text().splitlines()]
            assert entries[-1]['event'] == 'REMOTE_INTENT', 'Mutation before durable intent'
        if method == 'HEAD':
            digest = path.rsplit('/', 1)[1]
            if digest not in self.blobs: return result(404)
            return result(headers={'docker-content-digest': digest, 'content-length': str(len(self.blobs[digest]))})
        if method == 'POST': return result(202, headers={'location': r.PREFIX + '/blobs/uploads/test-upload?_state=opaque'})
        if method == 'PUT' and '/blobs/uploads/' in path:
            digest = query['digest'][0]; assert 'sha256:' + p.sha(raw) == digest
            self.blobs[digest] = raw
            return result(201, headers={'docker-content-digest': digest})
        if method == 'GET' and '/blobs/' in path:
            raw = self.blobs[path.rsplit('/', 1)[1]]
            p.need(len(raw) <= limit, 'CA_RESPONSE_LIMIT')
            if destination is not None: Path(destination).write_bytes(raw)
            return result(raw=raw)
        reference = path.rsplit('/', 1)[1]
        if method == 'PUT':
            if self.timeout_manifest: raise p.Pending('SYNTHETIC_AMBIGUOUS_HTTP_PUT')
            if self.rewrite_manifest: raw += b' '
            media = headers['Content-Type']; self.manifests[reference] = (raw, media)
            self.manifests['sha256:' + p.sha(raw)] = (raw, media)
            return result(201, headers={'docker-content-digest': 'sha256:' + p.sha(raw)})
        if reference not in self.manifests:
            return result(404, b'{"errors":[{"code":"MANIFEST_UNKNOWN"}]}')
        raw, media = self.manifests[reference]
        return result(raw=raw, headers={'docker-content-digest': 'sha256:' + p.sha(raw), 'content-type': media})


def bare_client(http):
    value = object.__new__(r.GHCR); value.http = http; value.bearer = 'synthetic-token'
    value.allowed_tags = set(p.tags(expected()).values()); value.journal = MemoryJournal()
    value.bound_objects = {}; value.bound_tags = {}; value._upload_session = None
    return value


def blob_client(http, descriptor, path):
    client = bare_client(http)
    client.bound_objects[descriptor['digest']] = {**descriptor, 'kind': 'blob', 'path': str(path)}
    return client


def build_records_disabled(text):
    job = text.split('  publish:\n', 1)[1]
    header, body = job.split('    steps:\n', 1)
    if re.search(r"^      DOCKER_BUILD_RECORD_UPLOAD: ['\"]false['\"]$", header, re.M) is None:
        return False
    builds = [step for step in re.split(r'\n      - ', body) if 'uses: docker/build-push-action@' in step]
    if len(builds) != 3 or any(re.search(r'^        env:', step, re.M) for step in builds):
        return False
    if 'DOCKER_BUILD_RECORD_UPLOAD' in body:
        return False
    allowed = ('actions/checkout@', 'docker/setup-buildx-action@', 'docker/build-push-action@',
               'actions/setup-node@', 'actions/attest@', 'actions/upload-artifact@')
    actions = re.findall(r'^\s*(?:-\s+)?uses\s*:\s*([^\s#]+)', job, re.M)
    return all(action.startswith(allowed) for action in actions) and sum(
        action.startswith('actions/upload-artifact@') for action in actions) == 1


class CandidateTests(unittest.TestCase):
    def test_fs01_singular_fixed_repo_upload_session_red(self):
        raw = b'synthetic blob bytes'
        descriptor = desc(raw, next(iter(r.LAYERS)))
        location = r.PREFIX + '/blobs/upload/session_1?_state=opaque'
        http = FakeHTTP([result(404), result(202, headers={'location': location}),
                         result(201, headers={'docker-content-digest': descriptor['digest']})])
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'blob'; path.write_bytes(raw)
            client = blob_client(http, descriptor, path)
            client.upload_blob(descriptor, path)
        self.assertEqual([call[0] for call in http.calls], ['HEAD', 'POST', 'PUT'])
        self.assertEqual(http.calls[-1][1], r.ORIGIN + location + '&digest=' +
                         urllib.parse.quote(descriptor['digest'], safe=''))

    def test_dot01_observed_class_identifier_preserves_single_use_upload(self):
        raw = b'observed-class synthetic blob'; descriptor = desc(raw, next(iter(r.LAYERS)))
        identifier = '0a1b2c3d-4e5f-6789-abcd-0123456789ab.zz'
        self.assertEqual(len(identifier), 39)  # Synthetic shape, never the actual opaque ID.
        location = r.PREFIX + '/blobs/upload/' + identifier + '?_state=AB%2fC+%3D'
        http = FakeHTTP([result(404), result(202, headers={'location': location}),
                         result(201, headers={'docker-content-digest': descriptor['digest']})])
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'blob'; path.write_bytes(raw)
            client = blob_client(http, descriptor, path); client.upload_blob(descriptor, path)
            self.assertIsNone(client._upload_session)
            with self.assertRaises(p.Pending):
                client.request('PUT', r.upload_target(location, descriptor['digest']), data=path,
                               media='application/octet-stream')
        self.assertEqual([call[0] for call in http.calls], ['HEAD', 'POST', 'PUT'])
        self.assertIn('/blobs/upload/' + identifier + '?_state=AB%2fC+%3D&digest=', http.calls[-1][1])
        self.assertNotIn(identifier, str(client.journal.events))

    def test_dot02_identifier_positions_bounds_and_plural_restriction(self):
        digest = 'sha256:' + 'a' * 64
        for identifier in ('.a', 'a.b', 'a.', 'a..b', 'a' * 199 + '.'):
            self.assertIn('/blobs/upload/' + identifier + '?digest=',
                          r.upload_target(r.PREFIX + '/blobs/upload/' + identifier, digest))
        for location in (r.PREFIX + '/blobs/upload/.', r.PREFIX + '/blobs/upload/..',
                         r.PREFIX + '/blobs/upload/a%2eb', r.PREFIX + '/blobs/upload/a/../b',
                         r.PREFIX + '/blobs/upload/' + 'a' * 200 + '.',
                         r.PREFIX + '/blobs/uploads/a.b', r.PREFIX + '/manifests/a.b',
                         '/v2/other/repo/blobs/upload/a.b',
                         'https://evil.invalid' + r.PREFIX + '/blobs/upload/a.b'):
            with self.subTest(location=location[:60]), self.assertRaises(p.Pending):
                r.upload_target(location, digest)

    def test_fs02_plural_relative_and_raw_query_bytes_survive_one_put(self):
        raw = b'blob bytes'; descriptor = desc(raw, next(iter(r.LAYERS)))
        for location in (r.PREFIX + '/blobs/uploads/session_1?_state=AB%2fC+%3D',
                         'v2/planner77/layoutmanager/blobs/upload/session_1?_state=AB%2fC+%3D',
                         'https://ghcr.io' + r.PREFIX + '/blobs/upload/session_1'):
            with tempfile.TemporaryDirectory() as temp, self.subTest(location=location):
                path = Path(temp) / 'blob'; path.write_bytes(raw)
                http = FakeHTTP([result(404), result(202, headers={'location': location}),
                                 result(201, headers={'docker-content-digest': descriptor['digest']})])
                client = blob_client(http, descriptor, path)
                client.upload_blob(descriptor, path)
                self.assertEqual([call[0] for call in http.calls], ['HEAD', 'POST', 'PUT'])
                self.assertEqual(http.calls[-1][1], r.ORIGIN + r.upload_target(location, descriptor['digest']))
                if '_state=' in location:
                    self.assertIn('_state=AB%2fC+%3D&digest=', http.calls[-1][1])
                self.assertEqual(client._upload_session, None)

    def test_fs03_hostile_location_never_reaches_put_or_journal(self):
        raw = b'blob bytes'; descriptor = desc(raw, next(iter(r.LAYERS)))
        good = r.PREFIX + '/blobs/upload/session_1'
        hostile = (
            'https://evil.example' + good, 'https://ghcr.io:443' + good,
            'http://ghcr.io' + good, 'https://user:pass@ghcr.io' + good,
            '/v2/other/repo/blobs/upload/session_1',
            r.PREFIX + '/manifests/session_1', r.PREFIX + '/blobs/upload/../upload/session_1',
            r.PREFIX + '/blobs/upload/%2Fsecret', r.PREFIX + '/blobs/upload/%2e%2e',
            r.PREFIX + '/blobs/uploads/session.1', r.PREFIX + '/blobs/upload/' + 'x' * 201,
            good + '\\other', good + '#fragment', good + '#',
            good + '?_state=opaque#',
            r.PREFIX + '/blobs/uploads/session_1#',
            r.PREFIX + '/blobs/uploads/session_1?_state=opaque#', good + '\n',
            good + '?_state=a&_state=b', good + '?digest=sha256%3Aabc',
            good + '?_state=a&digest=sha256%3Aabc', good + '?_state=%XX',
            good + '?_state=', good + '?other=x', good + '?_state=x&bad',
        )
        for location in hostile:
            with tempfile.TemporaryDirectory() as temp, self.subTest(case=location[:65]):
                path = Path(temp) / 'blob'; path.write_bytes(raw)
                http = FakeHTTP([result(404), result(202, headers={'location': location})])
                client = blob_client(http, descriptor, path)
                with self.assertRaises(p.Pending): client.upload_blob(descriptor, path)
                self.assertEqual([call[0] for call in http.calls], ['HEAD', 'POST'])
                self.assertEqual(client._upload_session, None)
                self.assertNotIn('session_1', str(client.journal.events))

    def test_fs04_wrong_blob_descriptor_path_and_unsolicited_put_are_refused(self):
        raw = b'blob bytes'; descriptor = desc(raw, next(iter(r.LAYERS)))
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'blob'; path.write_bytes(raw)
            alternate = Path(temp) / 'other'; alternate.write_bytes(raw)
            http = FakeHTTP([]); client = blob_client(http, descriptor, path)
            target = r.PREFIX + '/blobs/upload/session_1?digest=' + urllib.parse.quote(descriptor['digest'], safe='')
            with self.assertRaises(p.Pending): client.request('PUT', target, data=path, media='application/octet-stream')
            wrong = {**descriptor, 'size': descriptor['size'] + 1}
            with self.assertRaises(p.Pending): client.upload_blob(wrong, path)
            with self.assertRaises(p.Pending): client.upload_blob(descriptor, alternate)
            self.assertEqual(http.calls, [])
            client._upload_session = {'target': target, 'digest': descriptor['digest'],
                'size': descriptor['size'], 'path': str(path)}
            with self.assertRaises(p.Pending):
                client.request('PUT', target + '&other=x', data=path, media='application/octet-stream')
            self.assertIsNone(client._upload_session)
            client._upload_session = {'target': target, 'digest': descriptor['digest'],
                'size': descriptor['size'], 'path': str(path)}
            with self.assertRaises(p.Pending):
                client.request('PUT', '/v2/other/repo/blobs/upload/session_1',
                               data=path, media='application/octet-stream')
            self.assertIsNone(client._upload_session)
            self.assertEqual(http.calls, [])

    def test_fs05_put_session_consumed_on_error_and_uncertain_transport(self):
        raw = b'blob bytes'; descriptor = desc(raw, next(iter(r.LAYERS)))
        location = r.PREFIX + '/blobs/upload/session_1?_state=opaque'
        for response in (result(500), result(201, headers={'docker-content-digest': 'sha256:' + '0' * 64}),
                         p.Pending('SYNTHETIC_UNCERTAIN')):
            with tempfile.TemporaryDirectory() as temp, self.subTest(response=type(response).__name__):
                path = Path(temp) / 'blob'; path.write_bytes(raw)
                http = FakeHTTP([result(404), result(202, headers={'location': location}), response])
                client = blob_client(http, descriptor, path)
                with self.assertRaises(p.Pending): client.upload_blob(descriptor, path)
                target = r.upload_target(location, descriptor['digest'])
                with self.assertRaises(p.Pending):
                    client.request('PUT', target, data=path, media='application/octet-stream')
                self.assertEqual([call[0] for call in http.calls], ['HEAD', 'POST', 'PUT'])
                self.assertEqual(client._upload_session, None)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'blob'; path.write_bytes(raw)
            http = FakeHTTP([result(404), result(202, headers={'location': location})])
            client = blob_client(http, descriptor, path)
            original_intent = client.journal.intent
            def fail_put_intent(method, kind, reference):
                if method == 'PUT': raise p.Pending('SYNTHETIC_JOURNAL_FAILURE')
                original_intent(method, kind, reference)
            client.journal.intent = fail_put_intent
            with self.assertRaises(p.Pending): client.upload_blob(descriptor, path)
            self.assertIsNone(client._upload_session)
            self.assertEqual([call[0] for call in http.calls], ['HEAD', 'POST'])

    def cleanup_fixture(self, root):
        private = root / 'private'; (private / 'build').mkdir(parents=True)
        runner = c.Runner(private, expected())
        rr1 = {'kind': 'RR1_LOCAL_UNSIGNED_REGISTRY_RECEIPT', 'sourceCommit': SOURCE,
            'sourceTree': TREE, 'retainedForR2': True, 'version': '0.61.0', 'host': '127.0.0.1:12345',
            'resources': {'registryCid': 'a' * 64, 'registryName': 'owned-registry',
                          'network': 'owned-network', 'volume': 'owned-volume', 'nonce': '0' * 16},
            'refs': {role: '127.0.0.1:12345/rr1-release@sha256:' + str(i) * 64
                     for i, role in enumerate(p.ROLES, 1)},
            'manifests': {role: {'digest': 'sha256:' + str(i) * 64}
                          for i, role in enumerate(p.ROLES, 1)}}
        build = {'sourceMode': 'CI_GIT_ARCHIVE', 'sourceCommit': SOURCE, 'sourceTree': TREE,
                 'sourceArchiveSha256': 'e' * 64}
        old_source = '9eb8ac764ddb658bf8f9aaef9f15f18e099f9f63'
        old = [{'role': role, 'sourceCommit': old_source, 'ref': p.PACKAGE + '@sha256:' + str(i) * 64}
               for i, role in enumerate(('app', 'migrator'), 7)]
        rr2 = {'kind': 'RR2_RR3_JOURNEY', 'result': 'PASS', 'ownedCleanup': 'PASS',
            'stages': list(runner.rp.STAGES), 'newSource': SOURCE, 'oldSource': old_source,
            'newImage': rr1['refs'], 'oldImage': {row['role']: row['ref'] for row in old}, 'nonce': '1' * 16}
        files = (runner.build_dir / 'rr1-input.json', runner.rr1_path, runner.rr2_path, runner.old_path)
        for path, value in zip(files, (build, rr1, rr2, old)):
            path.write_bytes(p.canonical(value))
        owned_path = root / 'data/release-proof' / ('rr2-' + rr2['nonce']) / 'receipt.json'
        owned_path.parent.mkdir(parents=True)
        owned_path.write_bytes(p.canonical({'kind': 'RR2_OWNED_NAMESPACE', 'nonce': rr2['nonce'],
            'images': {'newSource': SOURCE, 'new': rr1['refs'],
                'newReceiptSha256': p.sha(runner.rr1_path.read_bytes()),
                'oldReceiptSha256': p.sha(runner.old_path.read_bytes()),
                'newRegistryCid': rr1['resources']['registryCid'], 'newRegistryNonce': rr1['resources']['nonce']}}))
        marker = {'kind': 'CANDIDATE_SAME_RUN_PROOF_CLEANED', **expected(), 'archiveSha256': 'e' * 64,
            'receipts': {str(path.relative_to(private)): p.sha(path.read_bytes()) for path in files},
            'ownedReceipts': {str(owned_path.relative_to(root)): p.sha(owned_path.read_bytes())}}
        marker_path = private / 'proof-cleaned.json'; marker_path.write_bytes(p.canonical(marker))
        runner.rr1.docker_optional_inspect = Mock(return_value=None)
        runner.rr1.cleanup_owned = Mock(); runner.rr1.cleanup_registry_refs = Mock()
        runner.rp.verify_rr2_absent = Mock()
        return runner, marker_path, marker, owned_path

    def test_completion_marker_empty_receipts_fail_before_mutation_or_absence_claim(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(c, 'ROOT', Path(temp)):
            runner, marker_path, marker, _ = self.cleanup_fixture(Path(temp))
            marker['receipts'] = {}; marker_path.write_bytes(p.canonical(marker))
            with patch.object(c, 'command') as command, self.assertRaises(p.Pending): runner.cleanup()
            command.assert_not_called(); runner.rr1.cleanup_owned.assert_not_called()
            runner.rr1.docker_optional_inspect.assert_not_called()

    def test_repeat_cleanup_foreign_registry_name_is_not_absence_or_a_deletion_target(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(c, 'ROOT', Path(temp)):
            runner, _, _, _ = self.cleanup_fixture(Path(temp))
            runner.rr1.docker_optional_inspect.side_effect = lambda kind, name: {'Id': 'foreign'} if name == 'owned-registry' else None
            with patch.object(c, 'command') as command, self.assertRaises(p.Pending): runner.cleanup()
            command.assert_not_called(); runner.rr1.cleanup_owned.assert_not_called()
            runner.rr1.cleanup_registry_refs.assert_not_called()

    def test_candidate_build_record_upload_disabled_at_job_scope(self):
        self.assertTrue(build_records_disabled((c.ROOT / '.github/workflows/release-candidate.yml').read_text()))

    def test_build_record_true_step_runtime_override_and_unknown_producer_are_rejected(self):
        text = (c.ROOT / '.github/workflows/release-candidate.yml').read_text()
        variants = (
            text.replace("DOCKER_BUILD_RECORD_UPLOAD: 'false'", "DOCKER_BUILD_RECORD_UPLOAD: 'true'"),
            text.replace('        uses: docker/build-push-action@', "        env:\n          DOCKER_BUILD_RECORD_UPLOAD: 'true'\n        uses: docker/build-push-action@", 1),
            text.replace('      - name: Build App', '      - run: echo DOCKER_BUILD_RECORD_UPLOAD=true >> GITHUB_ENV\n      - name: Build App', 1),
            text.replace('uses: actions/setup-node@', 'uses: unknown/implicit-producer@'),
        )
        for value in variants:
            self.assertFalse(build_records_disabled(value))

    def test_complete_marker_repeat_is_read_only_checks_cid_name_original_refs_and_tags(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(c, 'ROOT', Path(temp)):
            runner, _, _, _ = self.cleanup_fixture(Path(temp))
            with patch.object(c, 'command') as command:
                runner.cleanup()
            command.assert_not_called(); runner.rr1.cleanup_owned.assert_not_called()
            runner.rr1.cleanup_registry_refs.assert_not_called()
            lookups = [call.args for call in runner.rr1.docker_optional_inspect.call_args_list]
            self.assertIn(('container', 'a' * 64), lookups)
            self.assertIn(('container', 'owned-registry'), lookups)
            self.assertEqual(len([row for row in lookups if row[0] == 'image']), 6)
            runner.rp.verify_rr2_absent.assert_called_once()

    def test_missing_extra_changed_and_resealed_receipts_or_owned_set_fail_before_mutation(self):
        for case in ('missingHash', 'extraHash', 'changedFile', 'missingFile', 'missingAllFiles',
                     'ownedRemoved', 'ownedRemovedResealed', 'ownedChangedResealed', 'sourceResealed'):
            with tempfile.TemporaryDirectory() as temp, patch.object(c, 'ROOT', Path(temp)):
                runner, marker_path, marker, owned = self.cleanup_fixture(Path(temp))
                if case == 'missingHash': marker['receipts'].pop('rr2-old-pair.json')
                if case == 'extraHash': marker['receipts']['../unapproved.json'] = '0' * 64
                if case == 'changedFile': runner.old_path.write_text('[]')
                if case == 'missingFile': runner.old_path.unlink()
                if case == 'missingAllFiles':
                    for path in (runner.build_dir / 'rr1-input.json', runner.rr1_path, runner.rr2_path, runner.old_path): path.unlink()
                    owned.unlink()
                if case in ('ownedRemoved', 'ownedRemovedResealed'):
                    owned.unlink()
                    if case == 'ownedRemovedResealed': marker['ownedReceipts'] = {}
                if case == 'ownedChangedResealed':
                    value = json.loads(owned.read_text()); value['images']['newRegistryNonce'] = 'f' * 16
                    owned.write_bytes(p.canonical(value)); marker['ownedReceipts'][str(owned.relative_to(Path(temp)))] = p.sha(owned.read_bytes())
                if case == 'sourceResealed':
                    path = runner.build_dir / 'rr1-input.json'; value = json.loads(path.read_text())
                    value['sourceTree'] = 'f' * 40; path.write_bytes(p.canonical(value))
                    marker['receipts']['build/rr1-input.json'] = p.sha(path.read_bytes())
                marker_path.write_bytes(p.canonical(marker))
                with self.subTest(case=case), patch.object(c, 'command') as command, self.assertRaises(p.Pending):
                    runner.cleanup()
                command.assert_not_called(); runner.rr1.cleanup_owned.assert_not_called()
                runner.rr1.cleanup_registry_refs.assert_not_called()
                runner.rr1.docker_optional_inspect.assert_not_called()

    def test_actual_client_full_fake_distribution_upload_graph_readback_and_journal(self):
        with tempfile.TemporaryDirectory() as temp:
            _, graphs = fixture(temp, index=True)
            path = Path(temp) / 'journal.jsonl'; journal = r.Journal(path, expected())
            http = DistributionHTTP(path)
            client = r.GHCR('synthetic-job-token', 'planner77', expected(), journal, http)
            def verify(role, ref, graph):
                checked = r.collect_graph(client, ref, Path(temp) / 'remote' / role, role, SOURCE)
                r.same_graph(checked, graph)
            self.assertEqual(r.publish_set(client, graphs, expected(), verify), 'CANDIDATES_VERIFIED')
            self.assertEqual(set(k for k in http.manifests if not k.startswith('sha256:')), set(p.tags(expected()).values()))
            self.assertEqual(journal.writes, 18)  # six blob init/finish pairs + child/top manifests
            journal.close()
            text = path.read_text()
            self.assertNotIn('synthetic-job-token', text); self.assertNotIn('_state', text)

    def test_actual_client_ambiguous_or_rewritten_put_stops_with_no_later_tag(self):
        for case in ('timeout', 'rewrite'):
            with tempfile.TemporaryDirectory() as temp:
                _, graphs = fixture(temp)
                path = Path(temp) / 'journal.jsonl'; journal = r.Journal(path, expected())
                http = DistributionHTTP(path); http.timeout_manifest = case == 'timeout'; http.rewrite_manifest = case == 'rewrite'
                client = r.GHCR('synthetic-job-token', 'planner77', expected(), journal, http)
                with self.subTest(case=case), self.assertRaises(p.Pending):
                    r.publish_set(client, graphs, expected(), lambda *args: None)
                puts = [url for method, url, _ in http.calls if method == 'PUT' and '/manifests/' in url]
                self.assertEqual(len(puts), 1)
                self.assertNotIn(p.tags(expected())['migrator'], http.manifests)
                journal.close()

    def test_default_plan_and_import_have_zero_http_token_or_mutation(self):
        source = Path(c.__file__).read_text()
        with patch.object(r, 'HTTP', side_effect=AssertionError('HTTP in plan')), \
             patch('builtins.open', side_effect=AssertionError('application I/O')), \
             patch.object(os, 'getenv', side_effect=AssertionError('token discovery')), \
             patch('sys.stdout', new_callable=io.StringIO):
            exec(compile(source, c.__file__, 'exec'), {'__name__': 'candidate_import_probe', '__file__': c.__file__})
            c.main([])

    def test_strict_packet_scope_hash_roles_signer_refs_and_no_future_run_id(self):
        value = packet(); raw = p.canonical(value)
        self.assertEqual(p.packet(raw, p.sha(raw)), value)
        for key, bad in [('workflowPath', '.github/workflows/release-proof.yml'), ('version', 'latest'),
                         ('package', 'ghcr.io/other/repo'), ('roles', ['app', 'migrator']),
                         ('candidatePrefixTemplate', 'latest'), ('ownerId', 1),
                         ('workflowCommit', 'f' * 40), ('nonce', 'x'), ('runId', 123), ('ownerApproved', True)]:
            changed = dict(value, **{key: bad}); raw = p.canonical(changed)
            with self.subTest(key=key), self.assertRaises(p.Pending): p.packet(raw, p.sha(raw))
        with self.assertRaises(p.Pending): p.packet(p.canonical(value), '0' * 64)

    def test_owner_main_source_tree_attempt_and_packet_context_guards(self):
        self.assertEqual(p.guard(packet(), expected()['packetSha256'], context(), fake_git), expected())
        for key, bad in [('GITHUB_ACTOR_ID', '1'), ('GITHUB_RUN_ATTEMPT', '2'),
                         ('GITHUB_EVENT_NAME', 'pull_request'), ('GITHUB_REF', 'refs/heads/other'),
                         ('GITHUB_WORKFLOW_SHA', 'f' * 40), ('GITHUB_WORKFLOW_REF', p.REPO + '/.github/workflows/release-proof.yml@refs/heads/main'),
                         ('CA_PACKET_SHA256', 'f' * 64), ('GITHUB_TRIGGERING_ACTOR', 'other')]:
            with self.subTest(key=key), self.assertRaises(p.Pending):
                p.guard(packet(), expected()['packetSha256'], dict(context(), **{key: bad}), fake_git)
        with self.assertRaises(p.Pending):
            p.guard(packet(), expected()['packetSha256'], context(), lambda *args: 'f' * 40)

    def test_api_approval_and_owner_only_review_are_observed_not_invented(self):
        gate = p.approval_gate(API(), packet(), expected(), b'')
        self.assertFalse(gate['independentSecondHuman'])
        self.assertFalse(gate['environment']['prevent_self_review'])
        self.assertEqual(gate['reviewTimestamp'], 'NOT_EXPOSED_BY_API')
        self.assertEqual(gate['adminBypassEvidence']['origin'], 'API_RUNTIME_BOOLEAN')

    def test_unknown_bypass_uses_separate_ui_evidence_but_true_cannot_be_overridden(self):
        ui = ui_record(); config = copy.deepcopy(ENV); config.pop('can_admins_bypass')
        value = packet(config, ui); api = API(value); api.config = config
        gate = p.approval_gate(api, value, expected(value), ui)
        self.assertEqual(gate['adminBypassEvidence']['origin'], 'OWNER_OBSERVED_UI_NOT_API')
        for raw in (b'', ui.replace(b'"canAdminsBypass":false', b'"canAdminsBypass":true')):
            with self.assertRaises(p.Pending): p.approval_gate(api, value, expected(value), raw)
        api.config['can_admins_bypass'] = True
        value['environmentConfigSha256'] = p.sha(p.canonical(p.environment_summary(api.config, POLICIES)))
        with self.assertRaisesRegex(p.Pending, 'ADMIN_BYPASS_ENABLED'):
            p.approval_gate(api, value, expected(value), ui)

    def test_owner_only_prevent_self_review_true_cannot_claim_approved_run(self):
        config = copy.deepcopy(ENV); config['protection_rules'][0]['prevent_self_review'] = True
        value = packet(config); api = API(value); api.config = config
        with self.assertRaisesRegex(p.Pending, 'SELF_REVIEW_IMPOSSIBLE'):
            p.approval_gate(api, value, expected(value), b'')

    def test_missing_or_ambiguous_review_and_unprotected_environment_fail_closed(self):
        for case in ('missing', 'rejected', 'wrongOwner', 'otherEnv', 'duplicate', 'noRules', 'wildcard', 'selfReviewForbidden'):
            api = API()
            if case == 'missing': api.reviews = []
            if case == 'rejected': api.reviews[0]['state'] = 'rejected'
            if case == 'wrongOwner': api.reviews[0]['user']['id'] = 1
            if case == 'otherEnv': api.reviews[0]['environments'][0]['id'] = 999
            if case == 'duplicate': api.reviews *= 2
            if case == 'noRules': api.config['protection_rules'] = []
            if case == 'wildcard': api.config['deployment_branch_policy']['custom_branch_policies'] = False
            if case == 'selfReviewForbidden':
                # The active Owner-dispatched job cannot honestly claim self-review
                # succeeded when config forbids it; packet/config mismatch blocks.
                api.config['protection_rules'][0]['prevent_self_review'] = True
            with self.subTest(case=case), self.assertRaises(p.Pending):
                p.approval_gate(api, packet(), expected(), b'')

    def test_run_job_packet_ci_tree_package_and_dispatch_reuse_binding(self):
        cases = ('wrongRun', 'wrongTitle', 'otherJobPacket', 'staleMain', 'ciFailed',
                 'ciOtherTree', 'publicPackage', 'reusedDispatch', 'truncatedInventory')
        for case in cases:
            api = API()
            def change(path, value):
                if case == 'wrongRun' and path.endswith('/attempts/1'): value['id'] = 124
                if case == 'wrongTitle' and path.endswith('/attempts/1'): value['display_title'] = 'untrusted'
                if case == 'otherJobPacket' and '/123/attempts/1/jobs?' in path: value['jobs'][0]['name'] += 'other'
                if case == 'staleMain' and path.endswith('/heads/main'): value['object']['sha'] = 'f' * 40
                if case == 'ciFailed' and path.endswith('/runs/100'): value['conclusion'] = 'failure'
                if case == 'ciOtherTree' and '/commits/' + 'c' * 40 in path: value['tree']['sha'] = 'f' * 40
                if case == 'publicPackage' and '/packages/' in path: value['visibility'] = 'public'
                if case == 'reusedDispatch' and '/workflows/88/runs?' in path:
                    value['workflow_runs'].append(dict(value['workflow_runs'][0], id=122)); value['total_count'] = 2
                if case == 'truncatedInventory' and '/workflows/88/runs?' in path: value['total_count'] = 100
                return value
            api.change = change
            with self.subTest(case=case), self.assertRaises(p.Pending): p.approval_gate(api, packet(), expected(), b'')

    def test_graph_hash_media_size_role_and_index_linkage(self):
        with tempfile.TemporaryDirectory() as temp:
            store, graphs = fixture(temp, index=True)
            self.assertEqual(set(graphs), set(p.ROLES))
            graph = graphs['app']; self.assertNotEqual(graph['digest'], graph['manifestDigest'])
            for case in ('bytes', 'media', 'size', 'child', 'blob', 'source'):
                bad = copy.deepcopy(store)
                top = bad.manifests[graph['digest']]
                if case == 'bytes': top['raw'] += b' '
                if case == 'media': top['mediaType'] = 'invalid'
                if case == 'size': top['size'] += 1
                if case == 'child': bad.manifests.pop(graph['manifestDigest'])
                if case == 'blob': bad.blobs[graph['layers'][0]] += b' '
                with self.subTest(case=case), self.assertRaises((p.Pending, KeyError)):
                    r.collect_graph(bad, graph['digest'], Path(temp) / ('bad-' + case), 'app', 'f' * 40 if case == 'source' else SOURCE)

    def test_candidate_set_copies_only_raw_tags_and_noops_exact_triplet(self):
        with tempfile.TemporaryDirectory() as temp:
            _, graphs = fixture(temp, index=True); remote = Store(); verified = []
            self.assertEqual(r.publish_set(remote, graphs, expected(), lambda role, *args: verified.append(role)), 'CANDIDATES_VERIFIED')
            self.assertEqual(verified, list(p.ROLES))
            for role in p.ROLES:
                tag = p.tags(expected())[role]
                self.assertEqual(remote.manifests[tag]['raw'], Path(graphs[role]['objects'][graphs[role]['digest']]['path']).read_bytes())
            writes = len([e for e in remote.events if e[0] != 'GET'])
            self.assertEqual(r.publish_set(remote, graphs, expected(), lambda *args: None), 'NO_OP')
            self.assertEqual(len([e for e in remote.events if e[0] != 'GET']), writes)
            self.assertFalse(any('latest' in str(e) or '0.61.0' in str(e) for e in remote.events if e[0] == 'PUT'))

    def test_noop_final_triplet_reread_rejects_changed_missing_or_unknown_without_writes(self):
        for case in ('changed', 'missing', 'unknown'):
            with tempfile.TemporaryDirectory() as temp:
                source, graphs = fixture(temp); remote = Store()
                for role in p.ROLES:
                    remote.manifests[p.tags(expected())[role]] = source.manifests[graphs[role]['digest']]
                first = p.tags(expected())['app']
                verified = []
                def verify(role, *args):
                    verified.append(role)
                    if role == p.ROLES[-1]:
                        if case == 'changed': remote.manifests[first] = dict(remote.manifests[first], digest='sha256:' + 'f' * 64)
                        if case == 'missing': remote.manifests.pop(first)
                        if case == 'unknown':
                            def unavailable(method, ref):
                                if method == 'GET' and ref == first: raise p.Pending('SYNTHETIC_READBACK_UNKNOWN')
                            remote.failure = unavailable
                with self.subTest(case=case), self.assertRaises(p.Pending):
                    r.publish_set(remote, graphs, expected(), verify)
                self.assertEqual(verified, list(p.ROLES))
                self.assertTrue(all(event[0] == 'GET' for event in remote.events))

    def test_partial_or_mismatched_candidates_and_unknown_reads_never_write(self):
        for case in ('partial', 'mismatch', 'auth404', 'network'):
            with tempfile.TemporaryDirectory() as temp:
                source, graphs = fixture(temp); remote = Store()
                if case in ('partial', 'mismatch'):
                    remote.manifests[p.tags(expected())['app']] = source.manifests[graphs['migrator' if case == 'mismatch' else 'app']['digest']]
                else:
                    remote.failure = lambda *args: (_ for _ in ()).throw(p.Pending('UNCLASSIFIED_READ'))
                with self.subTest(case=case), self.assertRaises(p.Pending):
                    r.publish_set(remote, graphs, expected(), lambda *args: None)
                self.assertTrue(all(e[0] == 'GET' for e in remote.events))

    def test_manifest_rewrite_timeout_and_runtime_cleanup_failure_stop_followup_writes(self):
        for case in ('rewrite', 'timeout', 'runtimeCleanup'):
            with tempfile.TemporaryDirectory() as temp:
                _, graphs = fixture(temp); remote = Store(); runtime = []
                remote.rewrite = case == 'rewrite'
                if case == 'timeout':
                    def failure(method, ref):
                        if method == 'WRITE' and ref in p.tags(expected()).values(): raise TimeoutError('synthetic ambiguous PUT')
                    remote.failure = failure
                def check(role, *args):
                    runtime.append(role)
                    if case == 'runtimeCleanup': raise p.Pending('CLEANUP_PENDING')
                with self.subTest(case=case), self.assertRaises((p.Pending, TimeoutError)):
                    r.publish_set(remote, graphs, expected(), check)
                self.assertEqual(len([e for e in remote.events if e[0] == 'PUT']), 1)
                self.assertNotIn(p.tags(expected())['migrator'], remote.manifests)

    def test_cleanup_and_same_source_other_run_proof_block_client_creation(self):
        for case in ('cleanup', 'otherRun'):
            with tempfile.TemporaryDirectory() as temp:
                _, graphs = fixture(temp); runner = FakeRunner(graphs)
                if case == 'cleanup': runner.fail = 'cleanup'
                if case == 'otherRun': runner.proof = {'kind': 'CANDIDATE_SAME_RUN_PROOF_CLEANED', **expected(), 'runId': '124'}
                with self.subTest(case=case), self.assertRaises(p.Pending):
                    c.orchestrate(packet(), expected(), API(), b'', runner, MemoryJournal(),
                                  lambda: (_ for _ in ()).throw(AssertionError('remote client before cleanup/proof')))

    def test_approval_changed_during_local_proof_blocks_all_registry_writes(self):
        with tempfile.TemporaryDirectory() as temp:
            _, graphs = fixture(temp); api = API(); runner = FakeRunner(graphs)
            original = runner.graphs_and_cleanup
            def revoke():
                value = original(); api.reviews = []; return value
            runner.graphs_and_cleanup = revoke
            with self.assertRaises(p.Pending):
                c.orchestrate(packet(), expected(), api, b'', runner, MemoryJournal(),
                              lambda: (_ for _ in ()).throw(AssertionError('registry after approval revoked')))

    def test_required_ci_keeps_distinct_main_pr_head_and_archive_same_tree(self):
        value = packet(); value['requiredCi']['archiveSha'] = 'e' * 40
        gate = p.approval_gate(API(value), value, expected(value), b'')
        self.assertEqual(gate['candidateMainSha'], SOURCE)
        self.assertEqual(gate['requiredCiHeadSha'], 'c' * 40)
        self.assertEqual(gate['requiredCiArchiveSha'], 'e' * 40)
        api = API(value)
        def no_parent(path, response):
            if path.endswith('/git/commits/' + 'e' * 40): response['parents'] = []
            return response
        api.change = no_parent
        with self.assertRaisesRegex(p.Pending, 'ARCHIVE_RELATION'):
            p.approval_gate(api, value, expected(value), b'')

    def test_ui_observation_stale_missing_or_other_owner_cannot_be_confirmation(self):
        raw = ui_record(); value = packet(ui=raw)
        observed = json.loads(raw)
        for key, bad in (('observerId', 1), ('canAdminsBypass', True),
                         ('observedAt', '2000-01-01T00:00:00+00:00'), ('ownerApproved', True)):
            changed = dict(observed, **{key: bad}); altered = p.canonical(changed)
            changed_packet = dict(value, environmentUiObservationSha256=p.sha(altered))
            with self.subTest(key=key), self.assertRaises(p.Pending): p.ui_observation(altered, changed_packet)

    def test_real_cleanup_marker_other_run_is_rejected_before_resource_commands(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); private = root / 'private'; private.mkdir()
            build = private / 'build'; build.mkdir()
            rr1_path = build / 'rr1-registry-receipt.json'
            rr1_path.write_bytes(p.canonical({'kind': 'RR1_LOCAL_UNSIGNED_REGISTRY_RECEIPT',
                'sourceCommit': SOURCE, 'sourceTree': TREE, 'retainedForR2': True}))
            marker = {'kind': 'CANDIDATE_SAME_RUN_PROOF_CLEANED', **expected(), 'runId': '124', 'receipts': {}}
            (private / 'proof-cleaned.json').write_bytes(p.canonical(marker))
            runner = object.__new__(c.Runner); runner.private = private; runner.expected = expected()
            runner.rr1_path = rr1_path; runner.rr2_path = private / 'rr2-journey.json'
            runner.old_path = private / 'rr2-old-pair.json'
            runner.rr1 = SimpleNamespace(); runner.rp = SimpleNamespace()
            with patch.object(c, 'ROOT', root), self.assertRaisesRegex(p.Pending, 'MARKER_MIXED'):
                runner.cleanup()

    def test_full_fake_candidate_receipt_and_public_leak_rejection(self):
        with tempfile.TemporaryDirectory() as temp:
            _, graphs = fixture(temp); runner = FakeRunner(graphs); remote = Store()
            def factory(): self.assertTrue(runner.cleaned); return remote
            receipt = c.orchestrate(packet(), expected(), API(), b'', runner, MemoryJournal(), factory)
            c.validate_receipt(receipt, expected())
            public = Path(temp) / 'public'; public.mkdir()
            (public / 'candidate-receipt.json').write_bytes(p.canonical(receipt)); c.public_allowlist(public)
            for name in ('config.json', 'source.tar', 'candidate-app-manifest.json', 'credentials.json'):
                target = public / name; target.write_text('synthetic private payload')
                with self.subTest(name=name), self.assertRaises(p.Pending): c.public_allowlist(public)
                target.unlink()
            bad = copy.deepcopy(receipt); bad['limits'].append('arbitrary private payload')
            with self.assertRaises(p.Pending): c.validate_receipt(bad)
            bad = copy.deepcopy(receipt); bad['roles']['app']['configDump'] = 'private'
            with self.assertRaises(p.Pending): c.validate_receipt(bad)
            bad = copy.deepcopy(receipt); bad['kind'] = 'RP_SANITIZED_PROOF_RECEIPT'
            with self.assertRaises(p.Pending): c.validate_receipt(bad)

    def test_ghcr_fixed_token_realm_scope_and_no_redirect_or_host_auth_fallback(self):
        challenge = {'www-authenticate': 'Bearer realm="https://ghcr.io/token",service="ghcr.io"'}
        http = FakeHTTP([result(401, headers=challenge), result(raw=b'{"token":"synthetic-bearer"}')])
        client = r.GHCR('synthetic-job-token', 'planner77', expected(), MemoryJournal(), http)
        self.assertEqual(client.bearer, 'synthetic-bearer')
        self.assertIn('scope=repository%3Aplanner77%2Flayoutmanager%3Apull%2Cpush', http.calls[1][1])
        for realm in ('https://invalid.example/token', 'http://ghcr.io/token'):
            http = FakeHTTP([result(401, headers={'www-authenticate': 'Bearer realm="' + realm + '",service="ghcr.io"'})])
            with self.subTest(realm=realm), self.assertRaises(p.Pending):
                r.GHCR('synthetic-job-token', 'planner77', expected(), MemoryJournal(), http)
            self.assertEqual(len(http.calls), 1)

    def test_observed_root_placeholder_challenge_never_controls_token_scope(self):
        literal = 'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:user/image:pull"'
        http = FakeHTTP([result(401, headers={'www-authenticate': literal}),
                         result(raw=b'{"token":"synthetic-bearer"}')])
        client = r.GHCR('synthetic-job-token', 'planner77', expected(), MemoryJournal(), http)
        self.assertEqual(client.bearer, 'synthetic-bearer')
        self.assertEqual(http.calls[0], ('GET', 'https://ghcr.io/v2/', {}, None))
        self.assertEqual(http.calls[1][0:2], ('GET',
            'https://ghcr.io/token?service=ghcr.io&scope=repository%3Aplanner77%2Flayoutmanager%3Apull%2Cpush'))
        self.assertEqual(set(http.calls[1][2]), {'Authorization'})
        self.assertTrue(http.calls[1][2]['Authorization'].startswith('Basic '))
        self.assertNotIn('user%2Fimage', http.calls[1][1])
        self.assertIsNone(http.calls[1][3])
        for bad in (
            literal.replace('https://ghcr.io/token', 'https://evil.example/token'),
            literal.replace('service="ghcr.io"', 'service="evil.example"'),
            literal.replace('repository:user/image:pull', 'repository:user/image:pull,push'),
            literal.replace('repository:user/image:pull', 'repository:planner77/layoutmanager:pull'),
            literal + ',extra="value"',
            'bearer' + literal[len('Bearer'):],
            ' ' + literal,
            literal + ' ',
        ):
            denied = FakeHTTP([result(401, headers={'www-authenticate': bad})])
            with self.subTest(challenge=bad), self.assertRaises(p.Pending):
                r.GHCR('synthetic-job-token', 'planner77', expected(), MemoryJournal(), denied)
            self.assertEqual(denied.calls, [('GET', 'https://ghcr.io/v2/', {}, None)])
        for status in (200, 301, 403, 429):
            denied = FakeHTTP([result(status, headers={'www-authenticate': literal})])
            with self.subTest(status=status), self.assertRaises(p.Pending):
                r.GHCR('synthetic-job-token', 'planner77', expected(), MemoryJournal(), denied)
            self.assertEqual(denied.calls, [('GET', 'https://ghcr.io/v2/', {}, None)])

    def test_authenticated_explicit_manifest_unknown_only_and_digest_header_raw_binding(self):
        for status, headers, raw in (
            (404, {}, b'{"errors":[{"code":"MANIFEST_UNKNOWN"}]}'),
            (404, {}, b'{"message":"Not Found"}'), (401, {}, b'{}'),
            (404, {'www-authenticate': 'Bearer'}, b'{"errors":[{"code":"MANIFEST_UNKNOWN"}]}'),
            (307, {'location': 'https://invalid.example'}, b'')):
            http = FakeHTTP([result(status, raw, headers)]); client = bare_client(http)
            if raw == b'{"errors":[{"code":"MANIFEST_UNKNOWN"}]}' and not headers:
                self.assertIsNone(client.manifest(p.tags(expected())['app']))
            else:
                with self.subTest(status=status, headers=headers), self.assertRaises(p.Pending):
                    client.manifest(p.tags(expected())['app'])
        http = FakeHTTP([result(200, b'{}', {'content-type': next(iter(r.IMAGES)), 'docker-content-digest': 'sha256:' + '0' * 64})])
        with self.assertRaises(p.Pending): bare_client(http).manifest(p.tags(expected())['app'])

    def test_blob_cdn_one_hop_without_any_forwarded_credentials(self):
        raw = b'synthetic compressed layer'; descriptor = desc(raw, next(iter(r.LAYERS)))
        url = 'https://pkg-containers.githubusercontent.com/private/blob?sig=synthetic-only'
        http = FakeHTTP([result(307, headers={'location': url, 'docker-content-digest': descriptor['digest']}), result(raw=raw)])
        with tempfile.TemporaryDirectory() as temp:
            bare_client(http).blob(descriptor, Path(temp) / 'blob')
        self.assertEqual(http.calls[0][2]['Authorization'], 'Bearer synthetic-token')
        self.assertEqual(http.calls[1][:3], ('GET', url, {}))

    def test_cdn_host_scheme_userinfo_fragment_control_second_hop_digest_and_size_denials(self):
        raw = b'layer'; descriptor = desc(raw, next(iter(r.LAYERS)))
        good = 'https://pkg-containers.githubusercontent.com/blob?sig=synthetic'
        for bad in ('https://pkg-containers.githubusercontent.com.attacker.example/blob',
                    'http://pkg-containers.githubusercontent.com/blob',
                    'https://user@pkg-containers.githubusercontent.com/blob', good + '#fragment',
                    'https://pkg-containers.githubusercontent.com:444/blob', good + '\n'):
            http = FakeHTTP([result(307, headers={'location': bad})])
            with tempfile.TemporaryDirectory() as temp, self.subTest(url=bad), self.assertRaises(p.Pending):
                bare_client(http).blob(descriptor, Path(temp) / 'blob')
            self.assertEqual(len(http.calls), 1)
        for response in (result(307, headers={'location': good}), result(raw=raw + b'X'), result(raw=b'wrong')):
            http = FakeHTTP([result(307, headers={'location': good}), response])
            with tempfile.TemporaryDirectory() as temp, self.assertRaises(p.Pending):
                bare_client(http).blob(descriptor, Path(temp) / 'blob')
            self.assertEqual(len(http.calls), 2)

    def test_registry_and_github_clients_reject_unauthorized_endpoints(self):
        http = FakeHTTP([]); client = bare_client(http)
        for method, path in (('PUT', r.PREFIX + '/manifests/latest'), ('DELETE', r.PREFIX + '/manifests/0.61.0'),
                             ('POST', '/v2/other/repo/blobs/uploads/'), ('PUT', r.PREFIX + '/manifests/0.61.0')):
            with self.subTest(method=method, path=path), self.assertRaises(p.Pending): client.request(method, path)
        api = r.GitHubReadOnly('synthetic-job-token', http)
        for path in ('/user', p.BASE + '/actions/workflows/88/disable', '/repos/other/repo/actions/runs/1'):
            with self.assertRaises(p.Pending): api.get(path)
        self.assertEqual(http.calls, [])

    def test_real_private_journal_is_exclusive_and_intent_precedes_mutation(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'journal.jsonl'; journal = r.Journal(path, expected())
            journal.intent('PUT', 'manifest', p.tags(expected())['app'])
            entries = [json.loads(line) for line in path.read_text().splitlines()]
            self.assertEqual(entries[0]['event'], 'BEGIN'); self.assertEqual(entries[-1]['event'], 'REMOTE_INTENT')
            self.assertEqual(journal.writes, 1)
            with self.assertRaises(FileExistsError): r.Journal(path, expected())
            journal.close()

    def test_runtime_command_strips_job_and_oidc_credentials_from_children(self):
        response = SimpleNamespace(returncode=0, stdout=b'OK')
        with patch.dict(os.environ, {'CA_JOB_TOKEN': 'synthetic', 'GITHUB_TOKEN': 'synthetic',
                'GH_TOKEN': 'synthetic', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN': 'synthetic',
                'ACTIONS_RUNTIME_TOKEN': 'synthetic'}), \
             patch.object(c.subprocess, 'run', return_value=response) as run:
            c.command(['synthetic-readonly-command'])
        child = run.call_args.kwargs['env']
        self.assertTrue(all(key not in child for key in ('CA_JOB_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN',
                                                       'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_RUNTIME_TOKEN')))

    def test_direct_runtime_entry_refuses_each_credential_before_runtime_execution(self):
        with tempfile.TemporaryDirectory() as temp:
            private = Path(temp); public = private / 'public'
            for credential in ('CA_JOB_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN',
                               'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_RUNTIME_TOKEN'):
                with self.subTest(credential=credential), patch.dict(os.environ, {credential: 'synthetic'}, clear=True), \
                     patch.object(c, 'load_run', return_value=(packet(), expected(), private, public)), \
                     patch.object(c, 'Runner') as runner:
                    with self.assertRaisesRegex(p.Pending, 'CA_RUNTIME_TOKEN_ENV_REFUSED'):
                        c.main(['runtime', '--role', 'app'])
                    runner.return_value.runtime_only.assert_not_called()
            with patch.dict(os.environ, {}, clear=True), \
                 patch.object(c, 'load_run', return_value=(packet(), expected(), private, public)), \
                 patch.object(c, 'Runner') as runner:
                c.main(['runtime', '--role', 'app'])
                runner.return_value.runtime_only.assert_called_once_with('app')

    def test_candidate_certificate_policy_never_accepts_rp_signer_other_run_or_wrong_subjects(self):
        mapping = {role: str(i) * 64 for i, role in enumerate((*p.ROLES, 'receipt'), 1)}
        cert = {'sourceRepositoryIdentifier': str(p.REPO_ID), 'sourceRepositoryOwnerIdentifier': str(p.OWNER_ID),
            'sourceRepositoryURI': 'https://github.com/' + p.REPO, 'sourceRepositoryDigest': SOURCE,
            'sourceRepositoryRef': 'refs/heads/main', 'buildSignerURI': p.SIGNER_URI,
            'buildSignerDigest': SOURCE, 'runnerEnvironment': 'github-hosted',
            'issuer': 'https://token.actions.githubusercontent.com',
            'runInvocationURI': 'https://github.com/' + p.REPO + '/actions/runs/123/attempts/1'}
        value = [{'verificationResult': {'signature': {'certificate': cert}, 'statement': {
            'predicateType': 'https://slsa.dev/provenance/v1', 'subject': [
                {'name': p.SUBJECTS[role], 'digest': {'sha256': mapping[role]}} for role in (*p.ROLES, 'receipt')]}}}]
        p.certificate(value, expected(), mapping)
        for key, bad in [('buildSignerURI', p.SIGNER_URI.replace('release-candidate.yml', 'release-proof.yml')),
                         ('runInvocationURI', cert['runInvocationURI'].replace('/123/', '/124/')),
                         ('sourceRepositoryIdentifier', '1'), ('sourceRepositoryDigest', 'f' * 40)]:
            changed = copy.deepcopy(value); changed[0]['verificationResult']['signature']['certificate'][key] = bad
            with self.subTest(key=key), self.assertRaises(p.Pending): p.certificate(changed, expected(), mapping)
        changed = copy.deepcopy(value); changed[0]['verificationResult']['statement']['subject'].pop()
        with self.assertRaises(p.Pending): p.certificate(changed, expected(), mapping)

    def test_negative_classifier_rejects_generic_and_rp_signer_diagnostic(self):
        pattern = r'^https://github\.com/planner77/layoutManager/\.github/workflows/wrong\.yml(@(refs/.*|[0-9a-fA-F]+))?$'
        diagnostic = 'no matching CertificateIdentity found, last error: expected SAN value to match regex "' + pattern + '", got "' + p.SIGNER_URI + '"'
        result_value = SimpleNamespace(returncode=1, stdout='', stderr=diagnostic)
        self.assertEqual(c.negative_cause('wrongSignerWorkflow', result_value, expected()), 'SIGNER_WORKFLOW_SAN_MISMATCH')
        for bad in ('generic failure', diagnostic + '\nnetwork error', diagnostic.replace('release-candidate.yml', 'release-proof.yml')):
            with self.assertRaises(p.Pending):
                c.negative_cause('wrongSignerWorkflow', SimpleNamespace(returncode=1, stdout='', stderr=bad), expected())

    def test_verifier_executes_all_fixed_online_bundle_and_causal_negative_cases_synthetic(self):
        with tempfile.TemporaryDirectory() as temp:
            private = Path(temp); _, graphs = fixture(temp)
            receipt = c.orchestrate(packet(), expected(), API(), b'', FakeRunner(graphs), MemoryJournal(), Store)
            public = private / 'public'; public.mkdir()
            (public / 'candidate-receipt.json').write_bytes(p.canonical(receipt))
            (public / 'candidate-bundle.sigstore.json').write_text('{}')  # Synthetic, not a real bundle.
            c.checksums(private, public, expected())
            mapping = {role: graphs[role]['digest'][7:] for role in p.ROLES}
            mapping['receipt'] = p.sha((public / 'candidate-receipt.json').read_bytes())
            cert = {'sourceRepositoryIdentifier': str(p.REPO_ID), 'sourceRepositoryOwnerIdentifier': str(p.OWNER_ID),
                'sourceRepositoryURI': 'https://github.com/' + p.REPO, 'sourceRepositoryDigest': SOURCE,
                'sourceRepositoryRef': 'refs/heads/main', 'buildSignerURI': p.SIGNER_URI, 'buildSignerDigest': SOURCE,
                'runnerEnvironment': 'github-hosted', 'issuer': 'https://token.actions.githubusercontent.com',
                'runInvocationURI': 'https://github.com/' + p.REPO + '/actions/runs/123/attempts/1'}
            response = [{'verificationResult': {'signature': {'certificate': cert}, 'statement': {
                'predicateType': 'https://slsa.dev/provenance/v1', 'subject': [
                    {'name': p.SUBJECTS[role], 'digest': {'sha256': mapping[role]}} for role in (*p.ROLES, 'receipt')]}}}]
            positives = []; negatives = []
            def cli(args, timeout=120):
                positives.append(args)
                return b'gh version 2.103.3 synthetic' if args[-1] == '--version' else p.canonical(response)
            def probe(args, **kwargs):
                negatives.append(args)
                if args[args.index('--source-digest') + 1] == '0' * 40:
                    diagnostic = 'expected SourceRepositoryDigest to be ' + '0' * 40 + ', got ' + SOURCE
                elif args[args.index('--signer-digest') + 1] == '0' * 40:
                    diagnostic = 'expected BuildSignerDigest to be ' + '0' * 40 + ', got ' + SOURCE
                elif args[args.index('--source-ref') + 1] == 'refs/heads/wrong':
                    diagnostic = 'expected SourceRepositoryRef to be refs/heads/wrong, got refs/heads/main'
                elif args[args.index('--signer-workflow') + 1].endswith('/wrong.yml'):
                    pattern = r'^https://github\.com/planner77/layoutManager/\.github/workflows/wrong\.yml(@(refs/.*|[0-9a-fA-F]+))?$'
                    diagnostic = 'no matching CertificateIdentity found, last error: expected SAN value to match regex "' + pattern + '", got "' + p.SIGNER_URI + '"'
                else:
                    diagnostic = 'provided artifact digest does not match any digest in statement'
                return SimpleNamespace(returncode=1, stdout='', stderr=diagnostic)
            gh = private / 'synthetic-gh'; gh.write_bytes(b'synthetic binary, never executed')
            c.verify(private, public, expected(), str(gh), cli, probe)
            self.assertEqual(len(positives), 21); self.assertEqual(len(negatives), 6)
            metadata = json.loads((public / 'verification.json').read_text())
            self.assertEqual(metadata['verdict'], 'CANDIDATE_PROVENANCE_VERIFIED_NOT_RELEASE_GO')
            self.assertEqual(metadata['signer'], p.SIGNER)

    def test_workflow_locked_environment_permissions_pin_and_token_scope(self):
        text = (c.ROOT / '.github/workflows/release-candidate.yml').read_text()
        self.assertIn('environment: issue225-candidate-publish', text)
        self.assertIn('github.run_attempt == 1', text)
        for line in text.splitlines():
            if 'uses:' in line: self.assertRegex(line, r'@[0-9a-f]{40}')
        job_env = text.split('    env:\n', 1)[1].split('    steps:', 1)[0]
        self.assertNotIn('TOKEN', job_env); self.assertNotIn('github.token', job_env)
        self.assertNotIn('docker push', text); self.assertNotIn('secrets.', text)
        self.assertIn("steps.verify.outcome == 'success'", text)


if __name__ == '__main__': unittest.main()
