#!/usr/bin/env python3
"""Offline regression tests: no GitHub, GHCR, Docker, or credential calls."""
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock
import urllib.error
from email.message import Message

sys.path.insert(0, str(Path(__file__).resolve().parent))
import candidate_policy as cp
import registry_upload_diagnostic as ul


SHA = 'a' * 40
TREE = 'b' * 40
CI_HEAD = 'c' * 40
CI_ARCHIVE = 'd' * 40


def packet_data():
    return {'kind': 'GHCR_UPLOAD_LOCATION_DIAGNOSTIC_V1', 'repository': cp.REPO,
            'repositoryId': cp.REPO_ID, 'ownerId': cp.OWNER_ID, 'package': cp.PACKAGE,
            'packageId': cp.PACKAGE_ID, 'sourceCommit': SHA, 'sourceTree': TREE,
            'workflowCommit': SHA, 'workflowPath': ul.WORKFLOW,
            'environmentId': ul.ENV_ID, 'environmentConfigSha256': ul.ENV_HASH,
            'environmentUiObservationSha256': None,
            'requiredCi': {'runId': 10, 'headSha': CI_HEAD, 'archiveSha': CI_ARCHIVE,
                           'treeSha': TREE, 'workflowId': 20, 'runAttempt': 1},
            'nonce': '1' * 16, 'purpose': ul.PURPOSE, 'fixedEndpoint': ul.ENDPOINT,
            'postBudget': 1}


def raw_packet(p=None):
    return cp.canonical(p or packet_data())


class FakeHTTP:
    def __init__(self, location='https://ghcr.io/v2/planner77/layoutmanager/blobs/uploads/opaque-canary?_state=value-canary', fail=False, intent_path=None):
        self.location = location
        self.fail = fail
        self.intent_path = intent_path
        self.calls = []

    def request(self, method, url, headers=None, data=None, destination=None, limit=None):
        self.calls.append((method, url, data))
        if url == 'https://ghcr.io/v2/':
            return 401, {'www-authenticate': 'Bearer realm="https://ghcr.io/token",service="ghcr.io"'}, b'', 0, cp.sha(b'')
        if url.startswith('https://ghcr.io/token?'):
            self.token_url = url
            body = b'{"token":"synthetic-bearer-canary"}'
            return 200, {}, body, len(body), cp.sha(body)
        if method == 'POST':
            assert url == ul.ENDPOINT and data == b''
            assert headers.get('Accept') == 'application/octet-stream, application/json'
            assert headers.get('Content-Length') == '0'
            if self.intent_path is not None:
                assert self.intent_path.is_file() and json.loads(self.intent_path.read_text())['event'] == 'REMOTE_INTENT'
            if self.fail:
                raise ul.Pending('UL_HTTP_UNAVAILABLE_OR_UNCERTAIN')
            return 202, {'location': self.location, 'x-github-request-id': 'request-canary'}, b'', 0, cp.sha(b'')
        raise AssertionError('unexpected HTTP route')


class FakeAPI:
    def __init__(self, digest):
        base = cp.BASE
        title = ul.TITLE_PREFIX + digest
        job = ul.JOB_PREFIX + digest
        self.data = {
            base + '/actions/runs/123/attempts/1': {'id': 123, 'repository': {'id': cp.REPO_ID},
                'head_sha': SHA, 'head_branch': 'main', 'path': ul.WORKFLOW,
                'event': 'workflow_dispatch', 'run_attempt': 1, 'status': 'in_progress',
                'actor': {'id': cp.OWNER_ID}, 'triggering_actor': {'id': cp.OWNER_ID},
                'display_title': title, 'workflow_id': 30},
            base + '/actions/workflows/30/runs?event=workflow_dispatch&per_page=100&page=1':
                {'total_count': 1, 'workflow_runs': [{'id': 123, 'display_title': title}]},
            base + '/git/ref/heads/main': {'ref': 'refs/heads/main', 'object': {'sha': SHA}},
            base + '/git/commits/' + SHA: {'sha': SHA, 'tree': {'sha': TREE}},
            base + '/actions/runs/123/attempts/1/jobs?per_page=100&page=1':
                {'total_count': 1, 'jobs': [{'id': 77, 'name': job, 'run_id': 123,
                                            'head_sha': SHA, 'status': 'in_progress'}]},
            base + '/actions/runs/123/approvals': [{'state': 'approved',
                'user': {'id': cp.OWNER_ID}, 'environments':
                [{'id': ul.ENV_ID, 'name': cp.ENVIRONMENT}]}],
            base + '/actions/runs/10': {'id': 10, 'workflow_id': 20,
                'repository': {'id': cp.REPO_ID}, 'path': '.github/workflows/pr-ci.yml',
                'head_sha': CI_HEAD, 'status': 'completed', 'conclusion': 'success', 'run_attempt': 1},
            base + '/git/commits/' + CI_HEAD: {'sha': CI_HEAD, 'tree': {'sha': TREE}},
            base + '/git/commits/' + CI_ARCHIVE: {'sha': CI_ARCHIVE, 'tree': {'sha': TREE},
                'parents': [{'sha': CI_HEAD}]},
            base + '/actions/runs/10/attempts/1/jobs?per_page=100&page=1':
                {'total_count': len(cp.REQUIRED_JOBS), 'jobs': [
                    {'name': name, 'status': 'completed', 'conclusion': 'success',
                     'run_id': 10, 'head_sha': CI_HEAD} for name in cp.REQUIRED_JOBS]},
            '/users/planner77/packages/container/layoutmanager':
                {'id': cp.PACKAGE_ID, 'name': 'layoutmanager', 'package_type': 'container',
                 'visibility': 'private', 'owner': {'id': cp.OWNER_ID},
                 'repository': {'id': cp.REPO_ID}},
        }

    def get(self, path):
        return self.data[path]


class UploadDiagnosticTest(unittest.TestCase):
    def test_default_plan_has_no_http_or_token(self):
        raw = raw_packet()
        env = {'UL_PACKET_JSON': raw.decode(), 'UL_PACKET_SHA256': cp.sha(raw)}
        with mock.patch.object(ul, 'api', side_effect=AssertionError('HTTP invoked')):
            self.assertEqual(ul.execute('plan', env)['kind'], 'GHCR_UPLOAD_LOCATION_DIAGNOSTIC_PLAN_V1')

    def test_packet_is_distinct_and_binds_fixed_identity_purpose_endpoint(self):
        raw = raw_packet(); self.assertEqual(ul.packet(raw, cp.sha(raw))['postBudget'], 1)
        for key, value in [('packageId', 1), ('workflowPath', cp.WORKFLOW),
                           ('fixedEndpoint', 'https://evil.invalid/'), ('postBudget', 2),
                           ('environmentConfigSha256', '0' * 64), ('sourceTree', '0' * 40)]:
            wrong = packet_data(); wrong[key] = value; body = raw_packet(wrong)
            with self.subTest(key=key), self.assertRaises(cp.Pending):
                ul.packet(body, cp.sha(body))
        with self.assertRaises(cp.Pending):
            ul.packet(raw, '0' * 64)

    def test_wrong_source_dispatch_and_review_prevent_http(self):
        p = packet_data(); raw = raw_packet(p); digest = cp.sha(raw)
        with tempfile.TemporaryDirectory() as td:
            event = Path(td) / 'event.json'
            event.write_text(json.dumps({'sender': {'id': cp.OWNER_ID}, 'inputs': {
                'mode': 'diagnose', 'packet_sha256': digest, 'packet_json': raw.decode(),
                'environment_ui_json': ''}}))
            env = {'UL_PACKET_JSON': raw.decode(), 'UL_PACKET_SHA256': digest,
                   'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': 'workflow_dispatch',
                   'GITHUB_REPOSITORY': cp.REPO, 'GITHUB_REPOSITORY_ID': str(cp.REPO_ID),
                   'GITHUB_REPOSITORY_OWNER_ID': str(cp.OWNER_ID),
                   'GITHUB_ACTOR_ID': str(cp.OWNER_ID), 'GITHUB_ACTOR': 'planner77',
                   'GITHUB_TRIGGERING_ACTOR': 'planner77', 'GITHUB_REF': 'refs/heads/main',
                   'GITHUB_WORKFLOW_REF': ul.SIGNER + '@refs/heads/main',
                   'GITHUB_WORKFLOW_SHA': SHA, 'GITHUB_SHA': SHA,
                   'RUNNER_ENVIRONMENT': 'github-hosted', 'GITHUB_RUN_ATTEMPT': '1',
                   'GITHUB_RUN_ID': '123', 'GITHUB_EVENT_PATH': str(event),
                   'UL_JOB_TOKEN': 'synthetic-token'}
            with mock.patch.object(ul, 'git', side_effect=[SHA, TREE, '']):
                self.assertEqual(ul.binding(p, digest, env)['runId'], '123')
            for key, bad in [('GITHUB_REF', 'refs/heads/other'),
                             ('GITHUB_RUN_ATTEMPT', '2'), ('GITHUB_WORKFLOW_SHA', '0' * 40)]:
                altered = {**env, key: bad}
                with self.subTest(key=key), self.assertRaises(cp.Pending):
                    ul.binding(p, digest, altered)
            api = FakeAPI(digest)
            expected = {'runId': '123', 'packetSha256': digest}
            with mock.patch.object(ul, 'environment', return_value={}):
                approved = ul.approval(api, p, expected, b'')
                self.assertEqual(approved['jobId'], 77)
                self.assertEqual(approved['sourceCommit'], SHA)
                self.assertEqual(approved['sourceTree'], TREE)
                api.data[cp.BASE + '/actions/runs/123/approvals'][0]['state'] = 'rejected'
                with self.assertRaises(cp.Pending): ul.approval(api, p, expected, b'')
                http = FakeHTTP()
                with mock.patch.object(ul, 'git', side_effect=[SHA, TREE, '']):
                    with self.assertRaises(cp.Pending):
                        ul.execute('observe', env, http=http, api_client=api)
                self.assertEqual(http.calls, [])
                api.data[cp.BASE + '/actions/runs/123/approvals'][0]['state'] = 'approved'
                jobs = api.data[cp.BASE + '/actions/runs/10/attempts/1/jobs?per_page=100&page=1']['jobs']
                jobs[0]['conclusion'] = 'failure'
                with self.assertRaises(cp.Pending): ul.approval(api, p, expected, b'')

    def test_environment_requires_existing_main_only_owner_protection(self):
        class EnvironmentAPI:
            def __init__(self, bypass=False, branch='main'):
                self.bypass = bypass; self.branch = branch
            def get(self, path):
                if path.endswith('/deployment-branch-policies?per_page=100&page=1'):
                    return {'total_count': 1, 'branch_policies': [{'type': 'branch', 'name': self.branch}]}
                return {'id': ul.ENV_ID, 'name': cp.ENVIRONMENT,
                        'can_admins_bypass': self.bypass,
                        'deployment_branch_policy': {'protected_branches': False, 'custom_branch_policies': True},
                        'protection_rules': [{'type': 'required_reviewers', 'prevent_self_review': False,
                            'reviewers': [{'type': 'User', 'reviewer': {'id': cp.OWNER_ID}}]},
                            {'type': 'branch_policy'}]}
        for api in (EnvironmentAPI(bypass=True), EnvironmentAPI(branch='feature')):
            with self.assertRaises(cp.Pending): ul.environment(api, packet_data(), b'')

    def test_location_shape_does_not_emit_opaque_values_or_host(self):
        samples = [
            'https://evil-canary.invalid/v2/planner77/layoutmanager/blobs/uploads/opaque-canary?token=secret-canary',
            'https://user-canary:pass-canary@ghcr.io/v2/planner77/layoutmanager/blobs/uploads/x#fragment-canary',
            'https://ghcr.io/v2/planner77/layoutmanager/blobs/uploads/%2fopaque-canary?_state=secret-canary&_state=again',
            'https://ghcr.io/v2/planner77/layoutmanager/blobs/uploads/x?' + 'bad-key-canary=secret-canary',
            'https://ghcr.io/v2/planner77/layoutmanager/blobs/uploads/' + 'opaque-canary' * 2000,
        ]
        for value in samples:
            with self.subTest(value=value[:25]):
                output = json.dumps(ul.shape(value), sort_keys=True)
                self.assertNotIn('canary', output)
                self.assertNotIn('secret', output)
                self.assertLess(len(output), 4096)
        self.assertTrue(ul.shape(samples[1])['userInfoPresent'])
        self.assertTrue(ul.shape(samples[2])['duplicateQueryKeys'])
        self.assertEqual(ul.shape(samples[4])['parseCode'], 'SIZE_INVALID')

    def test_location_component_summary_matches_current_candidate_predicate(self):
        prefix = 'https://ghcr.io/v2/planner77/layoutmanager/blobs/uploads/'
        cases = [
            ('plain', prefix + 'opaque-canary?_state=value-canary', True, None),
            ('dot', prefix + 'opaque.canary', False, 'dot'),
            ('tilde', prefix + 'opaque~canary', False, 'tilde'),
            ('equals', prefix + 'opaque=canary', False, 'equals'),
            ('plus', prefix + 'opaque+canary', False, 'plus'),
            ('colon', prefix + 'opaque:canary', False, 'colon'),
            ('nonascii', prefix + 'opaque-cañary', False, 'nonASCII'),
            ('longid', prefix + 'a' * 201 + 'canary', False, None),
            ('encoded', prefix + 'opaque%2fcanary', False, 'percent'),
            ('port443', prefix.replace('ghcr.io/', 'ghcr.io:443/') + 'opaque-canary', False, None),
            ('port444', prefix.replace('ghcr.io/', 'ghcr.io:444/') + 'opaque-canary', False, None),
            ('querykey', prefix + 'opaque-canary?token=secret-canary', False, None),
            ('querymalformed', prefix + 'opaque-canary?bad-canary', False, None),
            ('duplicate', prefix + 'opaque-canary?_state=one-canary&_state=two-canary', False, None),
        ]
        for name, location, accepted, label in cases:
            with self.subTest(name=name):
                value = ul.shape(location)
                self.assertEqual(value['currentCandidatePredicate']['allComponents'], accepted)
                self.assertNotIn('canary', json.dumps(value))
                if label: self.assertIn(label, value['remainderClasses'])
                if name == 'port443':
                    self.assertEqual(value['portClass'], '443')
                    self.assertEqual(value['rawNetlocClass'], 'exact-ghcr.io:443')
                    self.assertFalse(value['currentCandidatePredicate']['exactNetloc'])
                if name == 'port444':
                    self.assertEqual(value['portClass'], 'other')
                    self.assertEqual(value['rawNetlocClass'], 'other-hash')
                    self.assertNotIn('ghcr.io:444', json.dumps(value))
                if name == 'querymalformed':
                    self.assertFalse(value['currentCandidatePredicate']['strictQueryParse'])
                if name == 'querykey':
                    self.assertFalse(value['currentCandidatePredicate']['queryKeysAllowed'])

    def test_taxonomy_unknown_path_retains_structure_without_values(self):
        opaque = '12345678-1234-1234-1234-123456789abc'
        for middle in ('upload', 'uploads'):
            location = '/v2/planner77/layoutmanager/blobs/' + middle + '/7/' + opaque + '/'
            result = ul.shape(location)
            for key in ('rawPath', 'resolvedPath'):
                path = result[key]
                self.assertEqual(path['leadingSlashes'], 1)
                self.assertEqual(path['trailingSlashes'], 1)
                self.assertFalse(path['segmentsTruncated'])
                self.assertEqual(path['segments'][-2]['length'], 36)
                self.assertTrue(path['lastNonEmptyUuidShape'])
                self.assertEqual(path['segments'][-3]['length'], 1)
            text = json.dumps(result)
            self.assertNotIn(opaque, text)
            self.assertNotIn('"7"', text)
            self.assertFalse(result['currentCandidatePredicate']['allComponents'])

    def test_taxonomy_raw_resolution_slashes_encoding_and_bounds(self):
        value = ul.shape('/v2/planner77/layoutmanager/blobs/upload/../opaque-canary//42')
        self.assertTrue(value['rawPath']['dotSegmentPresent'])
        self.assertFalse(value['resolvedPath']['dotSegmentPresent'])
        self.assertTrue(value['rawPath']['repeatedSlash'])
        self.assertTrue(value['rawPath']['lastNonEmptyDecimalOnly'])
        encoded = ul.shape('/v2/%2fopaque-canary/%5C?bad-canary=value-canary')
        self.assertTrue(encoded['rawPath']['encodedSeparator'])
        self.assertNotIn('canary', json.dumps(encoded))
        worst = ul.shape('/' + '/'.join(['opaque-canary'] * 500) + '?' +
                         '&'.join('key-canary' + str(i) + '=value-canary' for i in range(64)))
        self.assertLessEqual(len(cp.canonical(worst)), 6144)
        self.assertTrue(worst['rawPath']['segmentsTruncated'])
        self.assertTrue(worst['queryKeysTruncated'])
        self.assertNotIn('canary', json.dumps(worst))

    def test_taxonomy_projection_matches_actual_finite_uploader(self):
        from candidate_registry import upload_target
        prefix = '/v2/planner77/layoutmanager/blobs/'
        cases = [None, 12, '', 'a' * 16385, '//evil-canary.invalid/x',
                 'https://user-canary@ghcr.io' + prefix + 'upload/x',
                 'https://ghcr.io:443' + prefix + 'upload/x',
                 prefix + 'upload/../x', prefix + 'upload/%2fx', prefix + 'upload/x\\canary',
                 prefix + 'upload/x\t', prefix + 'upload/canãry']
        for middle in ('upload', 'uploads'):
            for suffix in ('x', 'x#', 'x#fragment', 'x?', 'x?_state=abc%2F%3d+X',
                           'x?_state=', 'x?_state=abc%', 'x?digest=bad',
                           'x?_state=a&_state=b', 'x?_state=a&digest=b', 'x?bad'):
                cases.append(prefix + middle + '/' + suffix)
        for location in cases:
            with self.subTest(location=repr(location)[:30]):
                try:
                    upload_target(location, 'sha256:' + 'a' * 64)
                    accepted = True
                except cp.Pending:
                    accepted = False
                self.assertEqual(ul.candidate_components(location)['allComponents'], accepted)

    def test_one_post_intent_then_redacted_result_and_uncertain_no_resend(self):
        with tempfile.TemporaryDirectory() as td, mock.patch.dict(os.environ, {'GITHUB_ACTOR': 'planner77'}):
            private, public = Path(td) / 'private', Path(td) / 'public'
            expected = {'runId': 123, 'jobId': 77, 'packetSha256': 'f' * 64}
            http = FakeHTTP(intent_path=private / 'intent.jsonl')
            result = ul.observe('synthetic-job-token', http, private, public, expected)
            self.assertEqual(result['httpStatus'], 202)
            self.assertEqual([method for method, _, _ in http.calls], ['GET', 'GET', 'POST'])
            self.assertEqual(http.token_url, 'https://ghcr.io/token?service=ghcr.io&scope=repository%3Aplanner77%2Flayoutmanager%3Apull%2Cpush')
            saved = (public / 'result.json').read_text()
            self.assertNotIn('canary', saved)
            self.assertNotIn('synthetic', saved)
            self.assertEqual(result['location']['hostClass'], 'fixed-ghcr.io')
            self.assertEqual(json.loads((private / 'intent.jsonl').read_text())['method'], 'POST')
            with self.assertRaises(cp.Pending): ul.observe('synthetic-job-token', http, private, public, expected)
            self.assertEqual([method for method, _, _ in http.calls].count('POST'), 1)
        with tempfile.TemporaryDirectory() as td, mock.patch.dict(os.environ, {'GITHUB_ACTOR': 'planner77'}):
            private, public = Path(td) / 'private', Path(td) / 'public'
            http = FakeHTTP(fail=True)
            result = ul.observe('synthetic-job-token', http, private, public, expected)
            self.assertEqual(result['outcome'], 'UNCERTAIN_NO_RETRY')
            with self.assertRaises(cp.Pending): ul.observe('synthetic-job-token', http, private, public, expected)
            self.assertEqual([method for method, _, _ in http.calls].count('POST'), 1)

    def test_bounded_transport_rejects_redirect_follow_and_second_post(self):
        http = ul.BoundedHTTP()
        headers = Message()
        headers['Location'] = 'https://evil-canary.invalid/next?credential=secret-canary'
        redirect = urllib.error.HTTPError(ul.ENDPOINT, 307, 'redirect', headers, io.BytesIO(b''))
        calls = []
        class Opener:
            def open(self, request, timeout):
                calls.append((request.get_method(), request.full_url, timeout, request.data))
                raise redirect
        http.opener = Opener()
        status, response_headers, _, _, _ = http.request('POST', ul.ENDPOINT, {}, data=b'', limit=100)
        self.assertEqual(status, 307)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0], ('POST', ul.ENDPOINT, 10, b''))
        self.assertIn('evil-canary', response_headers['location'])  # memory only
        with self.assertRaises(cp.Pending):
            http.request('POST', ul.ENDPOINT, {}, data=b'', limit=100)
        with self.assertRaises(cp.Pending):
            http.request('PUT', ul.ENDPOINT, {}, data=b'bytes', limit=100)
        self.assertEqual(len(calls), 1)

    def test_workflow_has_protected_only_write_and_no_oidc_or_untrusted_source(self):
        workflow = Path(__file__).resolve().parents[3] / '.github/workflows/registry-upload-diagnostic.yml'
        text = workflow.read_text()
        self.assertIn('environment: issue225-candidate-publish', text)
        self.assertIn('needs: environment-readback', text)
        self.assertEqual(text.count('packages: write'), 1)
        self.assertNotIn('id-token: write', text)
        self.assertNotIn('pull_request:', text)
        self.assertNotIn('docker login', text)
        self.assertNotIn('github.head_ref', text)
        self.assertIn('persist-credentials: false', text)


if __name__ == '__main__':
    unittest.main()
