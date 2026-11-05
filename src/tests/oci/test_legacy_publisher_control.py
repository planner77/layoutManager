#!/usr/bin/env python3
"""Local injected transport tests; never evidence of a real disabled workflow."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
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
                return 200, {'total_count': 101 if self.page == 1 else 102,
                             'workflow_runs': [{}] * 100 if self.page == 1 else [{}]}
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
