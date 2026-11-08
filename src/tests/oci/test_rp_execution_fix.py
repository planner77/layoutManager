#!/usr/bin/env python3
"""Local deterministic RE01–07 regressions; synthetic startup != hosted cause."""
import importlib.util
import inspect
import json
from pathlib import Path
import re
import signal
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch, Mock

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location('timeout_probe', Path(__file__).with_name('rr2-timeout-probe.py'))
PROBE = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(PROBE)


def audit_build_records(text):
    """Closed proof job layout: job-level false, no runtime/step true override."""
    job = text.split('  signed-proof:\n', 1)[1]
    header = job.split('    steps:\n', 1)[0]
    if re.search(r"^      DOCKER_BUILD_RECORD_UPLOAD: ['\"]false['\"]$", header, re.M) is None:
        return False
    steps = re.split(r'\n      - ', job.split('    steps:\n', 1)[1])
    builds = [step for step in steps if 'uses: docker/build-push-action@' in step]
    if len(builds) != 3:
        return False
    if any(re.search(r'^        env:', step, re.M) for step in builds):
        return False
    # Any other reference may write GITHUB_ENV or override the inherited value.
    if 'DOCKER_BUILD_RECORD_UPLOAD' in job.split('    steps:\n', 1)[1]:
        return False
    uses = re.findall(r'^\s*uses: ([^\s#]+)', job, re.M)
    allowed = ('actions/checkout@', 'docker/setup-buildx-action@', 'docker/build-push-action@',
               'actions/setup-node@', 'docker/login-action@', 'actions/attest@', 'actions/upload-artifact@')
    return all(action.startswith(allowed) for action in uses) and sum(
        action.startswith('actions/upload-artifact@') for action in uses) == 1


class ExecutionFix(unittest.TestCase):
    def test_all_proof_build_record_uploads_disabled_without_overrides(self):
        self.assertTrue(audit_build_records((ROOT / '.github/workflows/release-proof.yml').read_text()))

    def test_upload_override_runtime_override_unknown_producer_and_missing_build_fail(self):
        text = (ROOT / '.github/workflows/release-proof.yml').read_text()
        samples = (
            text.replace("DOCKER_BUILD_RECORD_UPLOAD: 'false'", "DOCKER_BUILD_RECORD_UPLOAD: 'true'"),
            text.replace('      - name: Build App', "      - run: echo DOCKER_BUILD_RECORD_UPLOAD=true >> GITHUB_ENV\n      - name: Build App", 1),
            text.replace('        uses: docker/build-push-action@v7', "        env:\n          DOCKER_BUILD_RECORD_UPLOAD: 'true'\n        uses: docker/build-push-action@v7", 1),
            text.replace('uses: actions/setup-node@v4', 'uses: unknown/implicit-artifact@v1'),
            text.replace('uses: docker/build-push-action@v7', 'uses: unknown/build@v7', 1),
            text.replace('        uses: docker/build-push-action@v7', '        env: *unreviewed\n        uses: docker/build-push-action@v7', 1),
        )
        for sample in samples:
            self.assertFalse(audit_build_records(sample))

    def clock(self):
        value = SimpleNamespace(now=0.0)
        value.time = lambda: value.now
        value.sleep = lambda seconds: setattr(value, 'now', value.now + seconds)
        return value

    def process(self, clock, *, early=False):
        value = SimpleNamespace(args=['synthetic-fixture'], returncode=0 if early else None)
        value.poll = lambda: value.returncode
        def communicate(timeout):
            clock.now += timeout
            raise subprocess.TimeoutExpired(value.args, timeout)
        value.communicate = Mock(side_effect=communicate)
        return value

    def ready(self, clock, after, *, identity=False):
        class Ready:
            diagnostics = {'identityVerified': identity, 'childRunning': identity, 'readinessObserved': False}
            def __call__(self, process, remaining):
                if clock.now >= after:
                    self.diagnostics.update(identityVerified=True, childRunning=True, readinessObserved=True)
                    return True
                return False
        return Ready()

    def test_delayed_startup_does_not_consume_four_second_execution_timeout(self):
        clock = self.clock(); process = self.process(clock); ready = self.ready(clock, 5)
        stop = Mock()
        with self.assertRaisesRegex(PROBE.PROOF.Blocked, '^RR2_COMMAND_TIMEOUT$'):
            PROBE.PROOF.ready_process(process, ready, startup_timeout=10, timeout=4,
                stop=stop, timeout_code='RR2_COMMAND_TIMEOUT', clock=clock.time, sleep=clock.sleep)
        process.communicate.assert_called_once_with(timeout=4)
        self.assertGreaterEqual(ready.diagnostics['startupElapsedMs'], 5000)
        self.assertEqual(ready.diagnostics['executionElapsedMs'], 4000)
        self.assertTrue(ready.diagnostics['runningAtArm']); stop.assert_called_once()

    def test_startup_deadline_and_missing_readiness_do_not_arm_execution(self):
        for identity, code in ((False, 'STARTUP_DEADLINE'), (True, 'READINESS_MISSING')):
            clock = self.clock(); process = self.process(clock); ready = self.ready(clock, 5, identity=identity)
            stop = Mock()
            with self.subTest(identity=identity), self.assertRaisesRegex(PROBE.PROOF.Blocked, code):
                PROBE.PROOF.ready_process(process, ready, startup_timeout=1, timeout=4,
                    stop=stop, timeout_code='RR2_COMMAND_TIMEOUT', clock=clock.time, sleep=clock.sleep)
            self.assertFalse(ready.diagnostics['executionArmed']); process.communicate.assert_not_called(); stop.assert_called_once()

    def test_early_exit_and_unknown_inspect_are_not_execution_timeout(self):
        clock = self.clock(); process = self.process(clock, early=True); ready = self.ready(clock, 0)
        stop = Mock()
        with self.assertRaisesRegex(PROBE.PROOF.Blocked, 'EARLY_EXIT'):
            PROBE.PROOF.ready_process(process, ready, startup_timeout=1, timeout=4,
                stop=stop, timeout_code='RR2_COMMAND_TIMEOUT', clock=clock.time, sleep=clock.sleep)
        self.assertEqual(ready.diagnostics['exitClass'], 'ZERO_EXIT'); self.assertFalse(ready.diagnostics['executionArmed'])
        process = self.process(clock); ready = self.ready(clock, 0)
        class Unavailable:
            diagnostics = ready.diagnostics
            def __call__(self, *args): raise PROBE.PROOF.Blocked('RR2_PROBE_INSPECT_UNAVAILABLE')
        with self.assertRaisesRegex(PROBE.PROOF.Blocked, 'INSPECT_UNAVAILABLE'):
            PROBE.PROOF.ready_process(process, Unavailable(), startup_timeout=1, timeout=4,
                stop=stop, timeout_code='RR2_COMMAND_TIMEOUT', clock=clock.time, sleep=clock.sleep)
        self.assertEqual(stop.call_count, 2)

    def test_boolean_readiness_without_identity_never_arms(self):
        clock = self.clock(); process = self.process(clock); stop = Mock()
        class Unproven:
            diagnostics = {'identityVerified': False, 'childRunning': False, 'readinessObserved': False}
            def __call__(self, *args): return True
        ready = Unproven()
        with self.assertRaisesRegex(PROBE.PROOF.Blocked, 'READY_STATE_UNPROVEN'):
            PROBE.PROOF.ready_process(process, ready, startup_timeout=1, timeout=4,
                stop=stop, timeout_code='RR2_COMMAND_TIMEOUT', clock=clock.time, sleep=clock.sleep)
        self.assertFalse(ready.diagnostics['executionArmed']); process.communicate.assert_not_called(); stop.assert_called_once()

    def monitor_fixture(self, directory):
        nonce = '0' * 16; name = 'layoutmanager-rr2-child-' + nonce + '-12345678'; cid = 'b' * 64
        engine = 'sha256:' + 'a' * 64; volume = 'layoutmanager-rr2-timeout-' + nonce
        row = {'name': name, 'nonce': nonce, 'engineImageId': engine, 'image': 'known-image',
               'volume': volume, 'cidFile': str(Path(directory) / (name + '.cid'))}
        receipt = {'root': directory, 'nonce': nonce, 'liveVolume': volume, 'children': [row]}
        Path(row['cidFile']).write_text(cid)
        (Path(directory) / 'receipt.json').write_text(json.dumps(receipt))
        labels = {'com.planner77.purpose': PROBE.PROOF.PURPOSE, 'com.planner77.rr2.nonce': nonce}
        item = {'Id': cid, 'Name': '/' + name, 'Image': engine,
                'Config': {'Image': 'known-image', 'Labels': labels, 'User': '10001:10001'},
                'Mounts': [{'Name': volume, 'Destination': '/data', 'RW': False}],
                'HostConfig': {'NetworkMode': 'none', 'ReadonlyRootfs': True},
                'State': {'Running': True, 'Status': 'running'}}
        return receipt, item, {'Name': volume, 'Labels': labels}

    def test_marker_requires_actual_owned_cid_engine_labels_volume_and_running(self):
        with tempfile.TemporaryDirectory() as directory:
            receipt, item, volume = self.monitor_fixture(directory)
            monitor = PROBE.Readiness(receipt, item['Image'])
            def inspect(kind, name, deadline): return item if kind == 'container' else volume
            with patch.object(monitor, 'inspect', side_effect=inspect), patch.object(PROBE.PROOF, 'run',
                    return_value=SimpleNamespace(returncode=0, stdout='RR2_TIMEOUT_FIXTURE_READY:' + receipt['nonce'], stderr='')):
                self.assertTrue(monitor(None, 5))
                self.assertTrue(monitor.diagnostics['identityVerified'])

    def test_wrong_cid_label_engine_volume_never_reads_logs_or_arms(self):
        for case in ('cid', 'label', 'engine', 'volume'):
            with tempfile.TemporaryDirectory() as directory:
                receipt, item, volume = self.monitor_fixture(directory)
                monitor = PROBE.Readiness(receipt, item['Image'])
                if case == 'cid': item['Id'] = 'c' * 64
                if case == 'label': item['Config']['Labels']['com.planner77.rr2.nonce'] = '1' * 16
                if case == 'engine': item['Image'] = 'sha256:' + 'c' * 64
                if case == 'volume': item['Mounts'][0]['Name'] = 'foreign'
                with patch.object(monitor, 'inspect', return_value=item), patch.object(PROBE.PROOF, 'run') as run:
                    with self.subTest(case=case), self.assertRaisesRegex(PROBE.PROOF.Blocked, 'OWNERSHIP_INVALID'):
                        monitor(None, 5)
                    run.assert_not_called()

    def test_missing_marker_does_not_become_ready_or_publish_raw_logs(self):
        with tempfile.TemporaryDirectory() as directory:
            receipt, item, volume = self.monitor_fixture(directory)
            monitor = PROBE.Readiness(receipt, item['Image'])
            with patch.object(monitor, 'inspect', side_effect=lambda kind, *args: item if kind == 'container' else volume), \
                 patch.object(PROBE.PROOF, 'run', return_value=SimpleNamespace(returncode=0, stdout='synthetic-untrusted-output', stderr='')):
                self.assertFalse(monitor(None, 5))
            self.assertNotIn('synthetic-untrusted-output', json.dumps(monitor.diagnostics))
            self.assertTrue(monitor.diagnostics['identityVerified']); self.assertFalse(monitor.diagnostics['readinessObserved'])

    def test_transient_receipt_write_is_pending_not_ready_or_absence(self):
        with tempfile.TemporaryDirectory() as directory:
            receipt, item, _ = self.monitor_fixture(directory)
            monitor = PROBE.Readiness(receipt, item['Image'])
            (Path(directory) / 'receipt.json').write_text('{')
            self.assertFalse(monitor(None, 5))
            self.assertFalse(monitor.diagnostics['identityVerified']); self.assertFalse(monitor.diagnostics['readinessObserved'])

    def test_actual_subprocess_timeout_at_exhausted_inspect_budget_is_observation_deadline(self):
        with tempfile.TemporaryDirectory() as directory:
            receipt, item, _ = self.monitor_fixture(directory)
            monitor = PROBE.Readiness(receipt, item['Image']); monitor.startup_started = 0.0
            clock = SimpleNamespace(now=0.95)
            def timed_out(*args, **kwargs):
                clock.now = 1.0
                raise subprocess.TimeoutExpired(args[0], kwargs['timeout'])
            # Execute the actual PROOF.run -> Blocked.__cause__ -> inspect catch
            # seam. This is injected timing, not a live daemon diagnosis.
            with patch.object(PROBE.time, 'monotonic', side_effect=lambda: clock.now), \
                 patch.object(PROBE.PROOF.subprocess, 'run', side_effect=timed_out), \
                 self.assertRaisesRegex(PROBE.PROOF.Blocked, 'STARTUP_OBSERVATION_DEADLINE'):
                monitor.inspect('container', 'owned-synthetic-name', 1.0)

    def test_within_budget_timeout_and_unproven_inspect_errors_remain_unavailable(self):
        for case in ('timeoutBefore', 'blockedWithoutCauseAfter', 'authAfter', 'nonzeroAfter', 'malformedAfter'):
            with tempfile.TemporaryDirectory() as directory:
                receipt, item, _ = self.monitor_fixture(directory)
                monitor = PROBE.Readiness(receipt, item['Image']); monitor.startup_started = 0.0
                clock = SimpleNamespace(now=0.1 if case == 'timeoutBefore' else 0.95)
                def response(*args, **kwargs):
                    clock.now = 0.2 if case == 'timeoutBefore' else 1.05
                    if case == 'timeoutBefore': raise subprocess.TimeoutExpired(args[0], kwargs['timeout'])
                    if case == 'blockedWithoutCauseAfter': raise PROBE.PROOF.Blocked('RR2_COMMAND_TIMEOUT')
                    if case == 'authAfter': return SimpleNamespace(returncode=1, stdout='', stderr='permission denied')
                    if case == 'nonzeroAfter': return SimpleNamespace(returncode=2, stdout='', stderr='daemon unavailable')
                    return SimpleNamespace(returncode=0, stdout='{', stderr='')
                with self.subTest(case=case), patch.object(PROBE.time, 'monotonic', side_effect=lambda: clock.now), \
                     patch.object(PROBE.PROOF.subprocess, 'run', side_effect=response), \
                     self.assertRaisesRegex(PROBE.PROOF.Blocked, '^RR2_PROBE_INSPECT_UNAVAILABLE$'):
                    monitor.inspect('container', 'owned-synthetic-name', 1.0)
                self.assertNotEqual(monitor.diagnostics.get('phase'), 'STARTUP_OBSERVATION_DEADLINE')
                self.assertFalse(monitor.diagnostics.get('executionArmed', False))

    def test_readiness_log_timeout_distinguishes_before_and_after_absolute_deadline(self):
        for ended in (0.99, 1.05):
            with tempfile.TemporaryDirectory() as directory:
                receipt, item, volume = self.monitor_fixture(directory)
                monitor = PROBE.Readiness(receipt, item['Image'])
                monitor.startup_started = 0.0; monitor.startup_deadline = 1.0
                clock = SimpleNamespace(now=0.95)
                def timeout(*args, **kwargs):
                    self.assertAlmostEqual(kwargs['timeout'], 0.05)
                    clock.now = ended
                    raise subprocess.TimeoutExpired(args[0], kwargs['timeout'])
                code = 'RR2_PROBE_READINESS_UNAVAILABLE' if ended < 1.0 else 'RR2_PROBE_STARTUP_OBSERVATION_DEADLINE'
                with self.subTest(ended=ended), patch.object(PROBE.time, 'monotonic', side_effect=lambda: clock.now), \
                     patch.object(monitor, 'inspect', side_effect=lambda kind, *args: item if kind == 'container' else volume), \
                     patch.object(PROBE.PROOF.subprocess, 'run', side_effect=timeout), \
                     self.assertRaisesRegex(PROBE.PROOF.Blocked, '^' + code + '$'):
                    # Reconstructing deadline from this remaining value would
                    # wrongly extend it to1.45; the original absolute1.0 wins.
                    monitor(None, 0.5)
                self.assertFalse(monitor.diagnostics.get('executionArmed', False))

    def test_observation_deadline_keeps_running_child_unarmed_and_stops_owned_group(self):
        with tempfile.TemporaryDirectory() as directory:
            receipt, item, volume = self.monitor_fixture(directory)
            monitor = PROBE.Readiness(receipt, item['Image']); clock = self.clock()
            process = self.process(clock); stop = Mock()
            def inspect(kind, *args):
                clock.now = 0.95
                return item if kind == 'container' else volume
            def timeout(*args, **kwargs):
                clock.now = 1.05
                raise subprocess.TimeoutExpired(args[0], kwargs['timeout'])
            with patch.object(PROBE.time, 'monotonic', side_effect=clock.time), \
                 patch.object(monitor, 'inspect', side_effect=inspect), \
                 patch.object(PROBE.PROOF.subprocess, 'run', side_effect=timeout), \
                 self.assertRaisesRegex(PROBE.PROOF.Blocked, 'STARTUP_OBSERVATION_DEADLINE'):
                PROBE.PROOF.ready_process(process, monitor, startup_timeout=1, timeout=4,
                    stop=stop, timeout_code='RR2_COMMAND_TIMEOUT', clock=clock.time, sleep=clock.sleep)
            self.assertTrue(monitor.diagnostics['identityVerified']); self.assertTrue(monitor.diagnostics['childRunning'])
            self.assertFalse(monitor.diagnostics['executionArmed']); self.assertFalse(monitor.diagnostics['runningAtArm'])
            self.assertEqual(monitor.diagnostics['startupElapsedMs'], 1050)
            process.communicate.assert_not_called(); stop.assert_called_once()

    def test_input_image_source_role_and_typed_identity_stay_receipt_bound(self):
        with tempfile.TemporaryDirectory() as directory:
            image = '127.0.0.1:12345/rr1-release@sha256:' + 'a' * 64
            source = 'd' * 40; engine = 'sha256:' + 'b' * 64
            candidate_version = PROBE.PROOF.current_candidate_version()
            receipt = {'kind': 'RR1_LOCAL_UNSIGNED_REGISTRY_RECEIPT', 'version': candidate_version,
                'sourceCommit': source, 'refs': {'cpu-worker': image},
                'manifests': {'cpu-worker': {'digest': 'sha256:' + 'a' * 64, 'configDigest': engine}}}
            path = Path(directory) / 'triplet.json'; path.write_text(json.dumps(receipt))
            observed = {'Id': engine, 'RepoDigests': [image], 'Os': 'linux', 'Architecture': 'amd64',
                'Config': {'Labels': {'org.opencontainers.image.source': 'https://github.com/planner77/layoutManager',
                    'org.opencontainers.image.revision': source, 'org.opencontainers.image.version': candidate_version,
                    'com.planner77.g7.image-role': 'cpu-worker'}}}
            with patch.object(PROBE.PROOF, 'docker_one', return_value=observed):
                self.assertEqual(PROBE.checked_input(path), (image, engine))
                observed['Config']['Labels']['org.opencontainers.image.revision'] = 'f' * 40
                with self.assertRaisesRegex(PROBE.PROOF.Blocked, 'IMAGE_SOURCE_MISMATCH'): PROBE.checked_input(path)
                observed['Config']['Labels']['org.opencontainers.image.revision'] = source
                observed['Descriptor'] = {'digest': 'sha256:' + 'a' * 64}
                observed['Id'] = 'sha256:' + 'a' * 64
                with self.assertRaisesRegex(PROBE.PROOF.Blocked, 'TARGET_IDENTITY_UNPROVEN'): PROBE.checked_input(path)

    def test_group_term_wait_kill_reap_is_preserved(self):
        process = SimpleNamespace(pid=12345, communicate=Mock(side_effect=[subprocess.TimeoutExpired('fixture', 5), ('', '')]))
        with patch.object(PROBE.PROOF.os, 'killpg') as kill:
            PROBE.PROOF.stop_probe_group(process)
        self.assertEqual([call.args for call in kill.call_args_list], [(12345, signal.SIGTERM), (12345, signal.SIGKILL)])
        self.assertEqual([call.kwargs for call in process.communicate.call_args_list], [{'timeout': 5}, {'timeout': 5}])

    def test_default_journey_timeout_and_runner_paths_are_unchanged(self):
        self.assertEqual(inspect.signature(PROBE.PROOF.run_owned_child).parameters['timeout'].default, 120)
        self.assertEqual(inspect.signature(PROBE.PROOF.host_run).parameters['timeout'].default, 600)
        self.assertEqual(PROBE.EXECUTION_SECONDS, 4); self.assertEqual(PROBE.STARTUP_SECONDS, 30)
        with tempfile.TemporaryDirectory() as directory:
            receipt = {'root': directory, 'nonce': '0' * 16, 'liveVolume': 'owned', 'restoreVolume': 'other',
                       'images': {'old': {}, 'new': {'cpu-worker': 'known'}}, 'children': []}
            with patch.object(PROBE.PROOF, 'docker_one', return_value={'Id': 'sha256:' + 'a' * 64}), \
                 patch.object(PROBE.PROOF, 'optional_docker', return_value=None), \
                 patch.object(PROBE.PROOF, 'run') as run, patch.object(PROBE.PROOF.subprocess, 'Popen') as popen:
                PROBE.PROOF.run_owned_child(receipt, ['docker', 'run', '--rm', 'known'],
                                           kind='default-contract', volume='owned', image='known')
                self.assertEqual(run.call_args.kwargs['timeout'], 120); popen.assert_not_called()
            process = SimpleNamespace(returncode=0, communicate=Mock(return_value=('synthetic', '')))
            with patch.object(PROBE.PROOF.shutil, 'which', return_value='/usr/bin/docker'), \
                 patch.object(PROBE.PROOF.subprocess, 'Popen', return_value=process), \
                 patch.object(PROBE.PROOF.os, 'killpg') as kill:
                PROBE.PROOF.host_run(receipt, ['synthetic-command'])
            process.communicate.assert_called_once_with(timeout=600); kill.assert_not_called()

    def test_late_child_after_initial_absence_keeps_cleanup_pending(self):
        with tempfile.TemporaryDirectory() as temp:
            nonce = '0' * 16; root = Path(temp) / 'data/release-proof' / ('rr2-timeout-' + nonce)
            root.mkdir(parents=True)
            receipt, item, _ = self.monitor_fixture(str(root))
            receipt['restoreVolume'] = 'unused'
            calls = 0
            def optional(kind, name):
                nonlocal calls
                if kind == 'volume': return None
                calls += 1
                return None if calls == 1 else item
            with patch.object(PROBE, 'ROOT', Path(temp)), patch.object(PROBE.PROOF, 'optional_docker', side_effect=optional), \
                 patch.object(PROBE.PROOF, 'run') as run:
                with self.assertRaisesRegex(PROBE.PROOF.Blocked, 'CLEANUP_INCOMPLETE'):
                    PROBE.cleanup(receipt)
                run.assert_not_called()

    def test_host_probe_uses_byte_identical_g7_command_only_not_deployment_main(self):
        source = inspect.getsource(PROBE.main)
        self.assertIn("ROOT / 'src/scripts/g7-deploy.py'", source)
        self.assertIn("copied.read_bytes() == source.read_bytes()", source)
        self.assertIn('helper.command(sys.argv[3:])', source)
        self.assertNotIn('helper.main(', source)


if __name__ == '__main__': unittest.main()
