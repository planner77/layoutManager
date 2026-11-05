#!/usr/bin/env python3
"""Local injected transport tests; never evidence of a real disabled workflow."""
import hashlib
import io
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import urllib.parse
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location('lp', ROOT / 'src/deploy/release-control/legacy-publisher-control.py')
LP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LP)
SOURCE = 'a' * 40


def packet():
    inventory = [{'id': LP.SAFE_RUN, 'attempt': 1, 'status': 'completed'}]
    return {'schemaVersion': 1, 'repository': LP.REPO, 'repositoryId': LP.REPO_ID,
            'ownerId': LP.OWNER_ID, 'sourceCommit': SOURCE, 'sourceTree': 'b' * 40,
            'helperSha256': 'c' * 64, 'replacementWorkflowSha256': 'd' * 64,
            'replacementRunId': 999, 'replacementWorkflowId': 888,
            'legacyWorkflowId': LP.LEGACY, 'legacyWorkflowPath': LP.LEGACY_PATH,
            'expectedLegacyState': 'active', 'safeRunId': LP.SAFE_RUN,
            'safeRunSource': LP.SAFE_SOURCE, 'safeRunAttempt': 1,
            'inventorySha256': LP.inventory_digest(inventory),
            'credentialPath': 'existing-owner-credential'}


class Fake:
    def __init__(self):
        self.calls = []
        self.state = 'active'
        self.attempt = 1
        self.active = False
        self.active_status = None
        self.owner = LP.OWNER_ID
        self.reply_status = 422
        self.reply_message = 'Workflow is disabled'
        self.failed_read = False

    def request(self, method, path, body=None):
        self.calls.append((method, path, body))
        if method == 'PUT':
            self.state = 'disabled_manually'
            return 204, None
        if method == 'POST':
            if self.reply_status == 201:
                self.attempt += 1
            return self.reply_status, {'message': self.reply_message}
        if self.failed_read:
            return 403, {'message': 'Resource not accessible'}
        if path == LP.BASE:
            return 200, {'id': LP.REPO_ID, 'owner': {'id': LP.OWNER_ID}, 'permissions': {'admin': True}}
        if path == '/user':
            return 200, {'id': self.owner}
        if path.endswith('/git/ref/heads/main'):
            return 200, {'ref': 'refs/heads/main', 'object': {'sha': SOURCE}}
        if path == LP.BASE + f'/actions/workflows/{LP.LEGACY}':
            return 200, {'id': LP.LEGACY, 'path': LP.LEGACY_PATH, 'state': self.state}
        if path == LP.BASE + '/actions/workflows/888':
            return 200, {'id': 888, 'path': LP.REPLACEMENT_PATH, 'state': 'active'}
        if '/workflows/' in path and '/runs?' in path:
            return 200, {'total_count': 1, 'workflow_runs': [{'id': LP.SAFE_RUN, 'workflow_id': LP.LEGACY,
                'status': self.active_status or ('in_progress' if self.active else 'completed'),
                'run_attempt': self.attempt}]}
        if path.startswith(LP.BASE + f'/actions/runs/{LP.SAFE_RUN}/jobs?'):
            return 200, {'total_count': 2, 'jobs': [
                {'name': 'Main CI - verify release scope', 'conclusion': 'success'},
                {'name': 'Build and push to GHCR', 'conclusion': 'skipped'}]}
        if path.startswith(LP.BASE + '/actions/runs/999/jobs?'):
            return 200, {'total_count': 1, 'jobs': [{'name': 'Verify read-only GHCR release HOLD', 'conclusion': 'success'}]}
        if path == LP.BASE + f'/actions/runs/{LP.SAFE_RUN}':
            return 200, {'id': LP.SAFE_RUN, 'workflow_id': LP.LEGACY, 'head_sha': LP.SAFE_SOURCE,
                'head_branch': 'main', 'event': 'push', 'run_number': 160,
                'run_attempt': self.attempt, 'status': 'completed', 'conclusion': 'success',
                'actor': {'id': LP.OWNER_ID}}
        if path == LP.BASE + '/actions/runs/999':
            return 200, {'id': 999, 'workflow_id': 888, 'head_sha': SOURCE, 'head_branch': 'main',
                         'path': LP.REPLACEMENT_PATH, 'event': 'push',
                         'status': 'completed', 'conclusion': 'success'}
        raise AssertionError('Unexpected fake route')


class InventoryOpener:
    """Fake urllib opener; the actual GitHub.request cap/decoder is untouched."""
    def __init__(self, count=164, padding=12_500):
        self.runs = [{'id': LP.SAFE_RUN + index, 'workflow_id': LP.LEGACY,
            'status': 'completed', 'run_attempt': 1, 'synthetic_padding': 'x' * padding}
            for index in range(count)]
        self.calls = []; self.read_limits = []; self.pages = []; self.change = None
        self.status = 200; self.raw_override = None; self.job_rows = {}; self.metadata = Fake()

    def open(self, request, timeout):
        split = urllib.parse.urlsplit(request.full_url)
        path = split.path + ('?' + split.query if split.query else '')
        self.calls.append((request.method, path, timeout))
        if request.method != 'GET' or request.data is not None:
            raise AssertionError('Mutation reached synthetic GET-only inventory opener')
        assert split.scheme == 'https' and split.netloc == 'api.github.com'
        if split.query:
            query = urllib.parse.parse_qs(split.query)
            size = int(query['per_page'][0]); page = int(query['page'][0])
            if split.path.endswith('/runs'):
                rows, field = self.runs, 'workflow_runs'
            else:
                identifier = int(split.path.split('/')[-2]); field = 'jobs'
                if identifier in self.job_rows:
                    rows = self.job_rows[identifier]
                else:
                    _, value = self.metadata.request('GET', path); rows = value[field]
            value = {'total_count': len(rows), field: rows[(page-1)*size:page*size]}
            if self.change:
                self.change(page, value)
        else:
            _, value = self.metadata.request('GET', path)
        raw = self.raw_override if self.raw_override is not None else json.dumps(value).encode()
        self.pages.append({'path': path, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
        opener = self
        class Response(io.BytesIO):
            status = opener.status
            def read(self, count=-1):
                opener.read_limits.append(count)
                return super().read(count)
        return Response(raw)


class InventoryClientTest(unittest.TestCase):
    def api(self, opener):
        return LP.GitHub('synthetic-only-not-a-credential', opener)

    def assert_get_only(self, opener):
        self.assertTrue(opener.calls)
        self.assertTrue(all(method == 'GET' and timeout == 30 for method, _, timeout in opener.calls))
        self.assertEqual(opener.read_limits, [1_048_577] * len(opener.calls))

    def test_real_client_164_run_full_observe_traversal_and_inventory_digest(self):
        opener = InventoryOpener(); report = {}
        LP.perform(self.api(opener), packet(), 'observe', report)
        self.assertEqual(report['result'], 'READ_ONLY_OBSERVATIONS_NOT_CONTROL_ACCEPTANCE')
        expected = [{'id': row['id'], 'attempt': 1, 'status': 'completed'} for row in opener.runs]
        self.assertEqual(report['before']['inventory'], expected)
        self.assertEqual(report['freshInventorySha256'], LP.inventory_digest(expected))
        pages = [path for _, path, _ in opener.calls if '/workflows/' in path and '/runs?' in path]
        self.assertEqual(pages, [LP.BASE + f'/actions/workflows/{LP.LEGACY}/runs?per_page=30&page={n}' for n in range(1,7)])
        self.assertTrue(all('?per_page=30&page=' in path for _, path, _ in opener.calls if '?' in path))
        self.assertTrue(all(row['bytes'] <= 1_048_576 for row in opener.pages))
        self.assert_get_only(opener)

    def test_exact30_multiple_requires_extra_empty_page(self):
        opener = InventoryOpener(60, 0)
        self.assertEqual(len(LP.no_active_runs(self.api(opener))), 60)
        self.assertEqual([path.rsplit('page=',1)[1] for _, path, _ in opener.calls], ['1','2','3'])
        self.assert_get_only(opener)

    def test_jobs_use_same30_page_and_exhaustion_contract(self):
        opener = InventoryOpener(1,0); opener.job_rows[999] = [{'id': n} for n in range(60)]
        rows = LP.all_rows(self.api(opener), LP.BASE + '/actions/runs/999/jobs', 'jobs')
        self.assertEqual(rows, opener.job_rows[999])
        self.assertEqual([path for _,path,_ in opener.calls], [LP.BASE + f'/actions/runs/999/jobs?per_page=30&page={n}' for n in range(1,4)])
        self.assert_get_only(opener)

    def test_30_row_response_can_still_exceed_unchanged_cap(self):
        opener = InventoryOpener(164,40_000)
        with self.assertRaisesRegex(LP.Blocked, 'LP_RESPONSE_TOO_LARGE'):
            LP.perform(self.api(opener), packet(), 'disable', {})
        self.assertGreater(opener.pages[-1]['bytes'], 1_048_576)
        self.assertTrue(opener.calls[-1][1].endswith('per_page=30&page=1'))
        self.assert_get_only(opener)

    def test_changed_truncated_and_malformed_pages_block_before_mutation(self):
        cases = [
            ('changed', lambda page,v: v.__setitem__('total_count',165) if page==2 else None, 'INVENTORY_CHANGED'),
            ('truncated', lambda page,v: v.__setitem__('workflow_runs',[]) if page==2 else None, 'INVENTORY_TRUNCATED'),
            ('overfull', lambda page,v: v['workflow_runs'].append(v['workflow_runs'][0]), 'INVENTORY_INVALID'),
            ('boolean-total', lambda page,v: v.__setitem__('total_count',True), 'INVENTORY_INVALID'),
            ('missing-rows', lambda page,v: v.pop('workflow_runs'), 'INVENTORY_INVALID'),
        ]
        for name, change, code in cases:
            with self.subTest(name=name):
                opener = InventoryOpener(164,0)
                opener.change = lambda page,v: change(page,v) if 'workflow_runs' in v else None
                with self.assertRaisesRegex(LP.Blocked, code):
                    LP.perform(self.api(opener), packet(), 'disable', {})
                self.assert_get_only(opener)
        for status, raw, code in ((403,None,'READBACK_UNAVAILABLE'),(200,b'not-json','RESPONSE_INVALID')):
            with self.subTest(status=status, raw=raw):
                opener = InventoryOpener(164,0); opener.status = status; opener.raw_override = raw
                with self.assertRaisesRegex(LP.Blocked, code): LP.no_active_runs(self.api(opener))
                self.assert_get_only(opener)

    def test_duplicate_active_unknown_wrongworkflow_and_safe_run_absence_block(self):
        for mode in ('duplicate','in_progress','queued','waiting','unknown','foreign-workflow','missing-safe'):
            with self.subTest(mode=mode):
                opener = InventoryOpener(164,0)
                if mode == 'duplicate': opener.runs[100]['id'] = opener.runs[0]['id']; code = 'DUPLICATE_RUN'
                elif mode == 'foreign-workflow': opener.runs[100]['workflow_id'] = 1; code = 'ACTIVE_OR_UNKNOWN'
                elif mode == 'missing-safe': opener.runs[0]['id'] = LP.SAFE_RUN+1000; code = 'SAFE_RUN_NOT_IN_INVENTORY'
                else: opener.runs[100]['status'] = mode; code = 'ACTIVE_OR_UNKNOWN'
                with self.assertRaisesRegex(LP.Blocked, code): LP.perform(self.api(opener), packet(), 'disable', {})
                self.assert_get_only(opener)

    def test_100_page_limit_stays_fail_closed_even_at_exact3000(self):
        opener = InventoryOpener(3000,0)
        with self.assertRaisesRegex(LP.Blocked,'LP_INVENTORY_INCOMPLETE'): LP.no_active_runs(self.api(opener))
        self.assertEqual(len(opener.calls),100)
        self.assertTrue(opener.calls[-1][1].endswith('per_page=30&page=100'))
        self.assert_get_only(opener)

    def test_strict30_get_queries_reject_before_open_and_mutations_are_unchanged(self):
        opener = InventoryOpener(1,0); api = self.api(opener)
        base = LP.BASE + f'/actions/workflows/{LP.LEGACY}/runs'
        denied = [base+q for q in ('?per_page=100&page=1','?per_page=31&page=1','?page=1&per_page=30',
            '?per_page=30&page=0','?per_page=30&page=01','?per_page=30&page=-1','?per_page=30&page=1&extra=1',
            '?per_page=30&page=1&page=2','?per_page=30&page=1#fragment')]
        denied += [LP.BASE+'/actions/workflows/1/runs?per_page=30&page=1',
            LP.BASE+f'/actions/runs/{LP.SAFE_RUN}/jobs?per_page=100&page=1']
        for path in denied:
            with self.subTest(path=path), self.assertRaisesRegex(LP.Blocked,'ENDPOINT_NOT_ALLOWED'): api.request('GET',path)
        for method,body in (('GET',b'{}'),('POST',None),('DELETE',None)):
            with self.assertRaisesRegex(LP.Blocked,'ENDPOINT_NOT_ALLOWED'): api.request(method,base+'?per_page=30&page=1',body)
        self.assertEqual(opener.calls,[])
        self.assertTrue(LP.allowed_route('PUT',LP.BASE+f'/actions/workflows/{LP.LEGACY}/disable'))
        self.assertTrue(LP.allowed_route('POST',LP.BASE+f'/actions/runs/{LP.SAFE_RUN}/rerun'))


class ControlTest(unittest.TestCase):
    def test_every_non_completed_state_blocks_before_mutation(self):
        for state in ('queued', 'waiting', 'requested', 'pending', 'in_progress', 'unknown'):
            api = Fake(); api.active_status = state
            with self.subTest(state=state), self.assertRaisesRegex(LP.Blocked, 'ACTIVE_OR_UNKNOWN'):
                LP.perform(api, packet(), 'disable', {})
            self.assertTrue(all(method == 'GET' for method, _, _ in api.calls))

    def test_post_mutation_state_readback_cannot_be_skipped(self):
        class NoDisable(Fake):
            def request(self, method, path, body=None):
                if method == 'PUT':
                    self.calls.append((method, path, body)); return 204, None
                return super().request(method, path, body)
        with self.assertRaisesRegex(LP.Blocked, 'WORKFLOW_STATE_MISMATCH'):
            LP.perform(NoDisable(), packet(), 'disable', {})
        class Reactivated(Fake):
            def request(self, method, path, body=None):
                if method == 'POST':
                    self.calls.append((method, path, body)); self.state = 'active'
                    return 422, {'message': 'Workflow is disabled'}
                return super().request(method, path, body)
        api = Reactivated(); api.state = 'disabled_manually'
        with self.assertRaisesRegex(LP.Blocked, 'WORKFLOW_STATE_MISMATCH'):
            LP.perform(api, packet(), 'probe', {})

    def test_disable_requires_explicit_request_before_any_http(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); source = root / 'packet.json'; output = root / 'result.json'
            raw = json.dumps(packet()).encode(); source.write_bytes(raw)
            def forbidden(*args): raise AssertionError('HTTP before execution request')
            with self.assertRaisesRegex(LP.Blocked, 'EXPLICIT_EXECUTION_REQUIRED'):
                LP.main(['--packet', str(source), '--packet-sha256', hashlib.sha256(raw).hexdigest(),
                         '--mode', 'disable', '--output', str(output)], api_factory=forbidden)
            self.assertEqual(json.loads(output.read_text())['mutationAttempt'], 'NOT_SENT')

    def test_local_source_and_content_pins_fail_closed(self):
        p = packet()
        p['helperSha256'] = hashlib.sha256(Path(LP.__file__).read_bytes()).hexdigest()
        p['replacementWorkflowSha256'] = hashlib.sha256((ROOT / LP.REPLACEMENT_PATH).read_bytes()).hexdigest()
        def source(*args):
            return '' if args[0] == 'status' else ('b' * 40 if args[-1].endswith('^{tree}') else SOURCE)
        with patch.object(LP, 'git', side_effect=source):
            LP.local_source(p)
            for key, bad in [('sourceCommit', '0' * 40), ('sourceTree', '0' * 40),
                             ('helperSha256', '0' * 64), ('replacementWorkflowSha256', '0' * 64)]:
                changed = dict(p, **{key: bad})
                with self.subTest(key=key), self.assertRaises(LP.Blocked):
                    LP.local_source(changed)
        with patch.object(LP, 'git', side_effect=lambda *args: ' M tracked' if args[0] == 'status' else source(*args)):
            with self.assertRaisesRegex(LP.Blocked, 'SOURCE_DIRTY'):
                LP.local_source(p)

    def test_actual_read_only_main_step_and_wrong_ref(self):
        text = (ROOT / LP.REPLACEMENT_PATH).read_text()
        source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
        body = text.split('        run: |\n', 1)[1]
        script = '\n'.join(line[10:] if line.startswith('          ') else line
                           for line in body.splitlines())
        with tempfile.TemporaryDirectory() as directory:
            summary = Path(directory) / 'summary'
            environment = {'PATH': os.environ['PATH'], 'GITHUB_SHA': source,
                'GITHUB_REPOSITORY': LP.REPO, 'GITHUB_REPOSITORY_ID': str(LP.REPO_ID),
                'GITHUB_REPOSITORY_OWNER_ID': str(LP.OWNER_ID), 'GITHUB_REF': 'refs/heads/main',
                'GITHUB_EVENT_NAME': 'push', 'GITHUB_STEP_SUMMARY': str(summary)}
            good = subprocess.run(['bash', '-euo', 'pipefail', '-c', script], cwd=ROOT,
                                  env=environment, capture_output=True, text=True)
            self.assertEqual(good.returncode, 0, good.stderr)
            self.assertIn('LP_MAIN_READ_ONLY_HOLD source=' + source, good.stdout)
            self.assertIn('no publication job', summary.read_text())
            summary.unlink()
            bad = subprocess.run(['bash', '-euo', 'pipefail', '-c', script], cwd=ROOT,
                env=dict(environment, GITHUB_REF='refs/heads/foreign'), capture_output=True, text=True)
            self.assertNotEqual(bad.returncode, 0)
            self.assertFalse(summary.exists())

    def test_incomplete_and_changed_pagination_is_not_empty_inventory(self):
        class Truncated:
            def request(self, *args):
                return 200, {'total_count': 100, 'workflow_runs': []}
        with self.assertRaisesRegex(LP.Blocked, 'INVENTORY_TRUNCATED'):
            LP.no_active_runs(Truncated())
        class Changed:
            def __init__(self): self.page = 0
            def request(self, *args):
                self.page += 1
                return 200, {'total_count': 31 if self.page == 1 else 32,
                             'workflow_runs': [{}] * 30 if self.page == 1 else [{}]}
        with self.assertRaisesRegex(LP.Blocked, 'INVENTORY_CHANGED'):
            LP.all_rows(Changed(), '/ignored-fixture', 'workflow_runs')

    def test_default_plan_never_instantiates_http_client(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            raw = json.dumps(packet()).encode()
            source = root / 'packet.json'; source.write_bytes(raw)
            output = root / 'result.json'
            def forbidden(*args):
                raise AssertionError('HTTP client in default plan')
            LP.main(['--packet', str(source), '--packet-sha256', hashlib.sha256(raw).hexdigest(),
                     '--output', str(output)], api_factory=forbidden)
            observed = json.loads(output.read_text())
            self.assertEqual(observed['result'], 'PLAN_ONLY')
            self.assertEqual(observed['mutationAttempt'], 'NOT_SENT')

    def test_packet_rejects_wrong_scope_and_hash(self):
        for key, wrong in [('repositoryId', 1), ('ownerId', 1), ('legacyWorkflowId', 1),
                           ('safeRunId', 1), ('safeRunSource', '0' * 40),
                           ('sourceCommit', 'main'), ('helperSha256', 'x'),
                           ('safeRunAttempt', True), ('credentialPath', 'arbitrary')]:
            p = packet(); p[key] = wrong; raw = json.dumps(p).encode()
            with self.subTest(key=key), self.assertRaises(LP.Blocked):
                LP.validate_packet(raw, hashlib.sha256(raw).hexdigest())
        raw = json.dumps(packet()).encode()
        with self.assertRaises(LP.Blocked):
            LP.validate_packet(raw, '0' * 64)

    def test_only_exact_disable_and_safe_rerun_mutations_allowed(self):
        self.assertTrue(LP.allowed_route('PUT', LP.BASE + f'/actions/workflows/{LP.LEGACY}/disable'))
        self.assertTrue(LP.allowed_route('POST', LP.BASE + f'/actions/runs/{LP.SAFE_RUN}/rerun'))
        for method, suffix in [('PUT', f'/actions/workflows/{LP.LEGACY}/enable'),
                               ('PUT', '/actions/workflows/1/disable'),
                               ('POST', '/actions/runs/41762192190/rerun'),
                               ('POST', f'/actions/runs/{LP.SAFE_RUN}/cancel'),
                               ('DELETE', '/actions/workflows/355693716'),
                               ('PATCH', '/git/refs/heads/main')]:
            self.assertFalse(LP.allowed_route(method, LP.BASE + suffix))
        class Opener:
            def open(self, *args, **kwargs):
                raise AssertionError('Unsafe request reached transport')
        with self.assertRaises(LP.Blocked):
            LP.GitHub('synthetic', Opener()).request('PUT', LP.BASE + '/actions/workflows/1/disable')

    def test_disable_then_specific_safe_denial(self):
        api = Fake(); p = packet(); report = {}
        LP.perform(api, p, 'disable', report)
        self.assertEqual(api.state, 'disabled_manually')
        self.assertEqual(report['result'], 'DISABLED_STATE_OBSERVED_NOT_RERUN_DENIAL_PROOF')
        report = {}
        LP.perform(api, p, 'probe', report)
        self.assertEqual(report['result'], 'SAFE_HOLD_RERUN_DENIED_BY_DISABLED_WORKFLOW')
        self.assertEqual(api.attempt, 1)
        self.assertEqual([m for m, _, _ in api.calls if m != 'GET'], ['PUT', 'POST'])

    def test_preflight_failure_cannot_mutate(self):
        for changed in ('active', 'wrongOwner', 'readUnavailable', 'staleInventory', 'wrongSafeAttempt'):
            api = Fake(); p = packet()
            if changed == 'active': api.active = True
            if changed == 'wrongOwner': api.owner = 1
            if changed == 'readUnavailable': api.failed_read = True
            if changed == 'staleInventory': p['inventorySha256'] = '0' * 64
            if changed == 'wrongSafeAttempt': p['safeRunAttempt'] = 2
            with self.subTest(case=changed), self.assertRaises(LP.Blocked):
                LP.perform(api, p, 'disable', {})
            self.assertTrue(all(method == 'GET' for method, _, _ in api.calls))

    def test_auth_generic_and_unknown_refusal_are_not_disabled_proof(self):
        for status, message in [(403, 'Authentication failed; workflow is disabled'),
                                (403, 'Resource not accessible'), (422, 'Validation failed'),
                                (404, 'Workflow is disabled'), (500, 'Workflow is disabled')]:
            api = Fake(); api.state = 'disabled_manually'
            api.reply_status = status; api.reply_message = message
            with self.subTest(status=status, message=message), self.assertRaises(LP.Blocked):
                LP.perform(api, packet(), 'probe', {})

    def test_negated_ambiguous_or_qualified_disabled_messages_never_prove_denial(self):
        for message in (
            'Cannot rerun workflow because this workflow is not disabled',
            'Cannot rerun workflow because it is not disabled',
            'Workflow is not disabled',
            'Workflow is disabled?',
            'Cannot rerun workflow; disabled status is unknown',
            'Workflow is disabled or unavailable',
            'Workflow is disabled but validation failed',
            'Workflow is disabled. Authentication failed',
            'Generic failure: workflow is disabled',
        ):
            api = Fake(); api.state = 'disabled_manually'; api.reply_message = message
            report = {}
            with self.subTest(message=message), self.assertRaisesRegex(
                    LP.Blocked, 'RERUN_REFUSAL_UNCLASSIFIED'):
                LP.perform(api, packet(), 'probe', report)
            self.assertFalse(report['explicitDisabledCause'])
            self.assertNotEqual(report['result'], 'SAFE_HOLD_RERUN_DENIED_BY_DISABLED_WORKFLOW')
            self.assertEqual([m for m, _, _ in api.calls if m != 'GET'], ['POST'])

    def test_narrow_affirmative_disabled_formats_require_unchanged_complete_readback(self):
        for message in ('Workflow is disabled', 'The workflow has been disabled.',
                        'Cannot rerun workflow because it is disabled',
                        'Cannot re-run the workflow because the workflow has been disabled.'):
            api = Fake(); api.state = 'disabled_manually'; api.reply_message = message
            report = {}
            with self.subTest(message=message):
                LP.perform(api, packet(), 'probe', report)
                self.assertEqual(report['result'], 'SAFE_HOLD_RERUN_DENIED_BY_DISABLED_WORKFLOW')
                self.assertEqual(report['before']['safeRun'], report['after']['safeRun'])

    def test_unexpected_accepted_attempt_halts_without_cancel_or_enable(self):
        api = Fake(); api.state = 'disabled_manually'; api.reply_status = 201
        report = {}
        with self.assertRaisesRegex(LP.Blocked, 'UNEXPECTEDLY_ACCEPTED'):
            LP.perform(api, packet(), 'probe', report)
        self.assertEqual(report['result'], 'HALT_UNEXPECTED_ACCEPTED_SAFE_RERUN')
        self.assertEqual(report['acceptedAttemptObservation']['run_attempt'], 2)
        self.assertEqual(report['acceptedAttemptObservation']['state'], 'NEW_ATTEMPT_OBSERVED_SAFETY_PENDING')
        self.assertEqual(report['acceptedAttemptObservation']['safety'], 'PENDING')
        self.assertEqual([m for m, _, _ in api.calls if m != 'GET'], ['POST'])

    def test_accepted202_stale_original_snapshot_keeps_new_attempt_pending(self):
        api = Fake(); api.state = 'disabled_manually'; api.reply_status = 202
        report = {}
        with self.assertRaisesRegex(LP.Blocked, 'UNEXPECTEDLY_ACCEPTED'):
            LP.perform(api, packet(), 'probe', report)
        self.assertEqual(report['result'], 'HALT_UNEXPECTED_ACCEPTED_SAFE_RERUN')
        self.assertEqual(report['acceptedAttemptObservation']['run_attempt'], 1)
        self.assertEqual(report['acceptedAttemptObservation']['state'], 'NEW_ATTEMPT_NOT_YET_OBSERVED')
        self.assertEqual(report['acceptedAttemptObservation']['safety'], 'PENDING')
        self.assertEqual([m for m, _, _ in api.calls if m != 'GET'], ['POST'])

    def test_accepted_new_attempt_with_wrong_source_is_not_verified(self):
        class WrongSource(Fake):
            def request(self, method, path, body=None):
                status, data = super().request(method, path, body)
                if self.attempt > 1 and path == LP.BASE + f'/actions/runs/{LP.SAFE_RUN}':
                    data['head_sha'] = '0' * 40
                return status, data
        api = WrongSource(); api.state = 'disabled_manually'; api.reply_status = 201
        report = {}
        with self.assertRaisesRegex(LP.Blocked, 'UNEXPECTEDLY_ACCEPTED'):
            LP.perform(api, packet(), 'probe', report)
        self.assertEqual(report['acceptedAttemptObservation']['run_attempt'], 2)
        self.assertEqual(report['acceptedAttemptObservation']['state'], 'NEW_ATTEMPT_NOT_YET_OBSERVED')
        self.assertEqual(report['acceptedAttemptObservation']['safety'], 'PENDING')


if __name__ == '__main__':
    unittest.main()
