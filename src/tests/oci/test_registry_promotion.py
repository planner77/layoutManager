#!/usr/bin/env python3
"""Local fake transport tests only. No credentials, Docker or external requests."""
import copy
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import registry_promotion as rt


def encoded(value):
    # Fixture generation only. The promotion algorithm must preserve these bytes.
    return json.dumps(value, indent=2).encode() + b'\n'


def descriptor(raw, media):
    return {'digest': rt.raw_digest(raw), 'size': len(raw), 'mediaType': media}


class FakeRegistry:
    def __init__(self):
        self.manifests = {}
        self.blobs = {}
        self.events = []
        self.get_failure = None
        self.put_failure = None
        self.rewrite = False

    def get_manifest(self, package, reference):
        assert package == rt.PACKAGE
        self.events.append(('GET', reference))
        if self.get_failure:
            result = self.get_failure(reference)
            if result is not None:
                return result
        return self.manifests.get(reference, rt.AuthenticatedManifestAbsent())

    def head_blob(self, package, digest):
        assert package == rt.PACKAGE
        self.events.append(('HEAD', digest))
        return self.blobs.get(digest)

    def put_manifest(self, package, reference, raw, content_type):
        assert package == rt.PACKAGE
        assert reference in rt.FINALS.values()
        self.events.append(('PUT', reference, raw, content_type))
        stored = raw + b' ' if self.rewrite else raw
        result = rt.Manifest(stored, content_type, rt.raw_digest(stored))
        self.manifests[reference] = result
        self.manifests[result.digest] = result
        if self.put_failure:
            self.put_failure(reference)


class MemoryJournal:
    """Synthetic acknowledged journal. No claim of actual disk durability."""
    def __init__(self, registry):
        self.registry = registry
        self.entries = []
        self.claimed = False
        self.fail_event = None

    def begin(self, packet_sha256):
        if self.claimed:
            raise ValueError('already attempted')
        self.claimed = True

    def append(self, event):
        if event['event'] == self.fail_event:
            raise OSError('synthetic journal failure')
        self.entries.append(copy.deepcopy(event))
        self.registry.events.append(('JOURNAL', event['event'], event.get('role')))


def fixture(index=False):
    registry = FakeRegistry()
    packet = {'schema': 'RT_PLAN_V1', 'package': rt.PACKAGE, 'version': rt.VERSION,
              'sourceCommit': 'a' * 40, 'sourceTree': 'b' * 40,
              'workflowPath': rt.WORKFLOW, 'workflowCommit': 'a' * 40,
              'candidateReceiptSha256': 'c' * 64, 'runId': '123', 'runAttempt': '1',
              'candidates': {}}
    for role, final in rt.FINALS.items():
        config = encoded({'role': role, 'fixtureOnly': True})
        layer = (role + ' local fake layer').encode()
        config_desc = descriptor(config, 'application/vnd.oci.image.config.v1+json')
        layer_desc = descriptor(layer, 'application/vnd.oci.image.layer.v1.tar+gzip')
        for blob in (config_desc, layer_desc):
            registry.blobs[blob['digest']] = rt.BlobHead(blob['digest'], blob['size'])
        raw = encoded({'schemaVersion': 2, 'mediaType': rt.OCI_MANIFEST,
                       'config': config_desc, 'layers': [layer_desc]})
        media = rt.OCI_MANIFEST
        if index:
            child = descriptor(raw, media)
            child['platform'] = {'os': 'linux', 'architecture': 'amd64'}
            registry.manifests[child['digest']] = rt.Manifest(raw, media, child['digest'])
            media = rt.OCI_INDEX
            raw = encoded({'schemaVersion': 2, 'mediaType': media, 'manifests': [child]})
        candidate = {key: packet[key] for key in ('sourceCommit', 'sourceTree',
                       'workflowCommit', 'candidateReceiptSha256')}
        tag = 'candidate-%s-123-1-%s' % (packet['sourceCommit'], role)
        candidate.update(role=role, candidateRef=rt.PACKAGE + ':' + tag,
                         finalRef=rt.PACKAGE + ':' + final, **descriptor(raw, media))
        packet['candidates'][role] = candidate
        response = rt.Manifest(raw, media, candidate['digest'])
        registry.manifests[tag] = response
        registry.manifests[response.digest] = response
    return packet, registry, MemoryJournal(registry)


def run(packet, registry, journal):
    contract = rt.VerifiedCandidateContract(rt.validate_packet(packet))
    return rt.promote_for_transport_test(packet, registry, journal, contract)


def put_count(registry):
    return len([event for event in registry.events if event[0] == 'PUT'])


class TransportTests(unittest.TestCase):
    def test_all_absent_copies_identical_raw_and_preflights_all_roles(self):
        for index in (False, True):
            with self.subTest(index=index):
                packet, registry, journal = fixture(index)
                result = run(packet, registry, journal)
                self.assertEqual(result['state'], 'COMPLETE')
                self.assertEqual(result['confirmed'], list(rt.FINALS))
                events = registry.events
                self.assertEqual(events[:3], [('GET', final) for final in rt.FINALS.values()])
                first_put = next(i for i, event in enumerate(events) if event[0] == 'PUT')
                for candidate in packet['candidates'].values():
                    self.assertIn(('GET', candidate['candidateRef'].split(':')[-1]), events[:first_put])
                self.assertTrue(any(event[0] == 'HEAD' for event in events[:first_put]))
                for role, final in rt.FINALS.items():
                    candidate = packet['candidates'][role]
                    source = registry.manifests[candidate['candidateRef'].split(':')[-1]]
                    put = next(i for i, event in enumerate(events)
                               if event[0] == 'PUT' and event[1] == final)
                    self.assertEqual(events[put - 2], ('GET', final))
                    self.assertEqual(events[put - 1], ('JOURNAL', 'PUT_INTENT', role))
                    self.assertIs(events[put][2], source.raw)
                    self.assertEqual(events[put][3], source.media_type)
                    self.assertEqual(events[put + 1:put + 3], [('GET', final), ('GET', source.digest)])
                self.assertEqual(put_count(registry), 3)
                self.assertEqual(journal.entries[-1]['event'], 'COMPLETE')
                self.assertEqual(events[-4:-1], [('GET', final) for final in rt.FINALS.values()])

    def test_target_appearance_during_preflight_never_overwrites_or_starts_puts(self):
        for source_role in ('app', 'migrator'):
            with self.subTest(source_role=source_role):
                packet, registry, journal = fixture()
                concurrent = registry.manifests[packet['candidates'][source_role]['digest']]
                last_candidate = packet['candidates']['cpu-worker']['candidateRef'].split(':')[-1]
                def appear(ref):
                    if ref == last_candidate:
                        registry.manifests[rt.VERSION] = concurrent
                registry.get_failure = appear
                result = run(packet, registry, journal)
                self.assertEqual(result['state'], 'HALT')
                self.assertEqual(put_count(registry), 0)
                self.assertIs(registry.manifests[rt.VERSION], concurrent)
                self.assertFalse(any(entry['event'] == 'PUT_INTENT' for entry in journal.entries))

    def test_next_target_appearance_after_first_confirmation_stops_further_puts(self):
        packet, registry, journal = fixture()
        concurrent = registry.manifests[packet['candidates']['app']['digest']]
        original_append = journal.append
        def appear(event):
            original_append(event)
            if event['event'] == 'PUT_CONFIRMED' and event['role'] == 'app':
                registry.manifests[rt.FINALS['migrator']] = concurrent
        journal.append = appear
        result = run(packet, registry, journal)
        self.assertEqual(result['state'], 'PARTIAL_RELEASE')
        self.assertEqual(result['confirmed'], ['app'])
        self.assertEqual(result['attempted'], ['app'])
        self.assertEqual(put_count(registry), 1)
        self.assertIs(registry.manifests[rt.FINALS['migrator']], concurrent)
        self.assertNotIn(rt.FINALS['cpu-worker'], registry.manifests)

    def test_changed_earlier_final_before_completion_blocks_complete_journal(self):
        packet, registry, journal = fixture()
        replacement = registry.manifests[packet['candidates']['migrator']['digest']]
        original_append = journal.append
        def replace(event):
            original_append(event)
            if event['event'] == 'PUT_CONFIRMED' and event['role'] == 'cpu-worker':
                registry.manifests[rt.VERSION] = replacement
        journal.append = replace
        result = run(packet, registry, journal)
        self.assertEqual(result['state'], 'PARTIAL_RELEASE')
        self.assertEqual(put_count(registry), 3)
        self.assertIs(registry.manifests[rt.VERSION], replacement)
        self.assertFalse(any(entry['event'] == 'COMPLETE' for entry in journal.entries))
        self.assertEqual(registry.events[-4:-1], [('GET', final) for final in rt.FINALS.values()])

    def test_unknown_target_recheck_halts_before_intent_or_put(self):
        packet, registry, journal = fixture()
        reads = 0
        def fail(ref):
            nonlocal reads
            if ref == rt.VERSION:
                reads += 1
                if reads == 2:
                    raise TimeoutError('synthetic target recheck')
        registry.get_failure = fail
        result = run(packet, registry, journal)
        self.assertEqual(result['state'], 'HALT')
        self.assertEqual(put_count(registry), 0)
        self.assertFalse(any(entry['event'] == 'PUT_INTENT' for entry in journal.entries))

    def test_exact_triplet_is_readonly_noop(self):
        packet, registry, journal = fixture()
        for role, final in rt.FINALS.items():
            registry.manifests[final] = registry.manifests[packet['candidates'][role]['digest']]
        self.assertEqual(run(packet, registry, journal)['state'], 'NO_OP')
        self.assertEqual(len(registry.events), 3)
        self.assertEqual(journal.entries, [])
        self.assertFalse(journal.claimed)

    def test_partial_mismatch_and_unknown_read_all_finals_zero_put(self):
        for case in ('partial', 'different', 'auth404', 'network', 'generic404', 'untyped'):
            with self.subTest(case=case):
                packet, registry, journal = fixture()
                if case == 'partial':
                    registry.manifests[rt.VERSION] = registry.manifests[packet['candidates']['app']['digest']]
                elif case == 'different':
                    registry.manifests[rt.VERSION] = registry.manifests[packet['candidates']['migrator']['digest']]
                else:
                    def fail(ref):
                        if ref == rt.VERSION:
                            if case == 'untyped':
                                return {'status': 404}
                            raise TimeoutError(case)
                    registry.get_failure = fail
                self.assertEqual(run(packet, registry, journal)['state'], 'HALT')
                self.assertEqual(registry.events, [('GET', final) for final in rt.FINALS.values()])
                self.assertEqual(put_count(registry), 0)
                self.assertEqual(journal.entries, [])

    def test_every_candidate_preflight_failure_has_zero_put(self):
        for case in ('raw', 'media', 'size', 'missing', 'blob', 'blob-size', 'timeout',
                     'child-bytes', 'child-size', 'child-media', 'child-missing', 'foreign-url'):
            with self.subTest(case=case):
                packet, registry, journal = fixture(index=case.startswith('child'))
                candidate = packet['candidates']['cpu-worker']
                tag = candidate['candidateRef'].split(':')[-1]
                original = registry.manifests[tag]
                if case == 'raw':
                    registry.manifests[tag] = rt.Manifest(original.raw + b' ', original.media_type, original.digest)
                elif case == 'media':
                    registry.manifests[tag] = rt.Manifest(original.raw, rt.DOCKER_MANIFEST, original.digest)
                elif case == 'size':
                    candidate['size'] += 1
                elif case == 'missing':
                    del registry.manifests[tag]
                elif case == 'timeout':
                    def fail(ref):
                        if ref == tag:
                            raise TimeoutError('local')
                    registry.get_failure = fail
                elif case in ('blob', 'blob-size'):
                    blob_digest = json.loads(original.raw)['layers'][0]['digest']
                    registry.blobs[blob_digest] = None if case == 'blob' else rt.BlobHead(blob_digest, 999)
                elif case.startswith('child'):
                    index = json.loads(original.raw)
                    child_desc = index['manifests'][0]
                    child = registry.manifests[child_desc['digest']]
                    if case == 'child-bytes':
                        registry.manifests[child.digest] = rt.Manifest(child.raw + b' ', child.media_type, child.digest)
                    elif case == 'child-missing':
                        del registry.manifests[child.digest]
                    else:
                        child_desc['size' if case == 'child-size' else 'mediaType'] = (
                            child_desc['size'] + 1 if case == 'child-size' else rt.DOCKER_MANIFEST)
                        raw = encoded(index)
                        candidate.update(descriptor(raw, original.media_type))
                        registry.manifests[tag] = rt.Manifest(raw, original.media_type, candidate['digest'])
                elif case == 'foreign-url':
                    obj = json.loads(original.raw)
                    obj['layers'][0]['urls'] = ['https://invalid.example/blob']
                    raw = encoded(obj)
                    candidate.update(descriptor(raw, original.media_type))
                    registry.manifests[tag] = rt.Manifest(raw, original.media_type, candidate['digest'])
                self.assertEqual(run(packet, registry, journal)['state'], 'HALT')
                self.assertEqual(put_count(registry), 0)
                self.assertEqual(journal.entries, [])

    def test_put_timeout_stops_without_retry_or_subsequent_put(self):
        for failing_role in rt.FINALS:
            with self.subTest(role=failing_role):
                packet, registry, journal = fixture()
                def fail(ref):
                    if ref == rt.FINALS[failing_role]:
                        raise TimeoutError('may have written')
                registry.put_failure = fail
                result = run(packet, registry, journal)
                count = list(rt.FINALS).index(failing_role) + 1
                self.assertEqual(put_count(registry), count)
                self.assertEqual(result['state'], 'UNCERTAIN' if count == 1 else 'PARTIAL_RELEASE')
                self.assertEqual(result['attempted'], list(rt.FINALS)[:count])
                self.assertEqual(journal.entries[-1]['event'], 'HALT')

    def test_rewritten_raw_or_readback_error_stops_at_first_put(self):
        for case in ('rewritten', 'tag-read', 'digest-read', 'absent-read'):
            with self.subTest(case=case):
                packet, registry, journal = fixture()
                registry.rewrite = case == 'rewritten'
                digest = packet['candidates']['app']['digest']
                def fail(ref):
                    if put_count(registry) and ref == (digest if case == 'digest-read' else rt.VERSION):
                        if case == 'absent-read':
                            return rt.AuthenticatedManifestAbsent()
                        if case in ('tag-read', 'digest-read'):
                            raise TimeoutError('readback')
                registry.get_failure = fail
                self.assertEqual(run(packet, registry, journal)['state'], 'UNCERTAIN')
                self.assertEqual(put_count(registry), 1)

    def test_journal_intent_failure_prevents_put_and_uncertain_attempt_cannot_restart(self):
        packet, registry, journal = fixture()
        journal.fail_event = 'PUT_INTENT'
        self.assertEqual(run(packet, registry, journal)['state'], 'HALT')
        self.assertEqual(put_count(registry), 0)
        journal.fail_event = None
        self.assertEqual(run(packet, registry, journal)['state'], 'HALT')
        self.assertEqual(put_count(registry), 0)
        packet, registry, journal = fixture()
        journal.fail_event = 'PUT_CONFIRMED'
        self.assertEqual(run(packet, registry, journal)['state'], 'UNCERTAIN')
        self.assertEqual(put_count(registry), 1)

    def test_later_readback_and_journal_failure_preserve_partial_release(self):
        for case in ('readback', 'journal'):
            with self.subTest(case=case):
                packet, registry, journal = fixture()
                if case == 'readback':
                    def fail(ref):
                        if put_count(registry) == 2 and ref == rt.FINALS['migrator']:
                            raise TimeoutError('synthetic readback')
                    registry.get_failure = fail
                else:
                    original_append = journal.append
                    def fail(event):
                        if event['event'] == 'PUT_INTENT' and event['role'] == 'migrator':
                            raise OSError('synthetic journal')
                        original_append(event)
                    journal.append = fail
                result = run(packet, registry, journal)
                self.assertEqual(result['state'], 'PARTIAL_RELEASE')
                self.assertEqual(result['confirmed'], ['app'])
                self.assertEqual(put_count(registry), 2 if case == 'readback' else 1)

    def test_packet_rejects_wrong_scope_roles_sources_refs_credentials_and_authority(self):
        mutations = [
            lambda p: p.update(package='ghcr.io/other/repository'),
            lambda p: p.update(version='latest'),
            lambda p: p.update(token='never-a-real-secret'),
            lambda p: p.update(ownerApproved=True),
            lambda p: p.update(workflowPath='.github/workflows/other.yml'),
            lambda p: p.update(workflowPath='.github/workflows/release-proof.yml'),
            lambda p: p.update(workflowCommit='d' * 40),
            lambda p: p['candidates'].pop('cpu-worker'),
            lambda p: p['candidates'].update(other=p['candidates']['app']),
            lambda p: p['candidates']['app'].update(role='migrator'),
            lambda p: p['candidates']['app'].update(sourceCommit='d' * 40),
            lambda p: p['candidates']['app'].update(sourceTree='d' * 40),
            lambda p: p['candidates']['app'].update(candidateReceiptSha256='d' * 64),
            lambda p: p['candidates']['app'].update(candidateRef=rt.PACKAGE + ':other-source-run'),
            lambda p: p['candidates']['app'].update(finalRef=rt.PACKAGE + ':latest'),
            lambda p: p['candidates']['app'].update(finalRef=rt.PACKAGE + ':0.61.0-migrate'),
            lambda p: p['candidates']['app'].update(candidateRef='https://invalid.example/file'),
            lambda p: p.update(runId='001'),
            lambda p: p['candidates']['app'].update(size=True),
            lambda p: p['candidates']['app'].update(mediaType=[]),
            lambda p: p['candidates']['migrator'].update(digest=p['candidates']['app']['digest']),
        ]
        for mutate in mutations:
            packet, registry, journal = fixture()
            mutate(packet)
            with self.subTest(mutation=mutate):
                with self.assertRaises(rt.Rejected):
                    rt.promote_for_transport_test(packet, registry, journal, True)
                self.assertEqual(registry.events, [])
        packet, registry, journal = fixture()
        for contract in (True, {'ownerApproved': True}, rt.VerifiedCandidateContract('0' * 64)):
            with self.assertRaises(rt.Rejected):
                rt.promote_for_transport_test(packet, registry, journal, contract)
            self.assertEqual(registry.events, [])

    def test_duplicate_json_keys_are_rejected(self):
        with self.assertRaises(rt.Rejected):
            rt.parse_json(b'{"package":"one","package":"two"}')

    def test_plan_and_import_do_no_adapter_creation_network_env_or_writes(self):
        # Load source before patching: executing the module itself must do no I/O.
        source = Path(rt.__file__).read_text()
        import socket
        import os
        with patch('builtins.open', side_effect=AssertionError('unexpected I/O')), \
             patch.object(socket, 'socket', side_effect=AssertionError('network')), \
             patch.object(os, 'getenv', side_effect=AssertionError('credential lookup')), \
             patch.object(rt, 'Transport', side_effect=AssertionError('adapter creation')), \
             patch('sys.stdout', new_callable=io.StringIO):
            exec(compile(source, 'registry_promotion.py', 'exec'), {'__name__': 'rt_import_probe'})
            self.assertEqual(rt.main([]), 0)
        packet, _, _ = fixture()
        observations = {role: {'state': 'ABSENT'} for role in rt.FINALS}
        self.assertEqual(rt.plan_fixture(packet, observations)['decision'], 'COPY_PLAN')
        observations['app'] = {'state': 'UNKNOWN'}
        self.assertEqual(rt.plan_fixture(packet, observations)['decision'], 'HALT')
        exact = {role: {'state': 'PRESENT', **{key: packet['candidates'][role][key]
                         for key in ('digest', 'sourceCommit', 'candidateReceiptSha256')}}
                 for role in rt.FINALS}
        self.assertEqual(rt.plan_fixture(packet, exact)['decision'], 'NO_OP')
        exact['migrator']['sourceCommit'] = 'e' * 40
        self.assertEqual(rt.plan_fixture(packet, exact)['decision'], 'HALT')
        with tempfile.TemporaryDirectory() as temp:
            packet_path = Path(temp) / 'packet.json'
            observations_path = Path(temp) / 'observations.json'
            packet_path.write_text(json.dumps(packet))
            observations_path.write_text(json.dumps(observations))
            before = {p.name: p.read_bytes() for p in Path(temp).iterdir()}
            cli = subprocess.run([sys.executable, '-B', rt.__file__, '--packet', str(packet_path),
                                  '--observations', str(observations_path)],
                                 capture_output=True, text=True, env={})
            self.assertEqual(cli.returncode, 0, cli.stderr)
            result = json.loads(cli.stdout)
            self.assertEqual(result['httpRequests'], 0)
            self.assertEqual(result['authority'], 'NOT_VERIFIED')
            self.assertEqual(before, {p.name: p.read_bytes() for p in Path(temp).iterdir()})


if __name__ == '__main__':
    unittest.main()
