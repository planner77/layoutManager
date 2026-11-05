#!/usr/bin/env python3
"""Synthetic real-format CLI seams. No genuine signatures or live CLI calls."""
import copy
from contextlib import contextmanager
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import candidate_publish as candidate
import candidate_policy as policy
import test_candidate_publish as cf
import test_rp_provenance as rf
import verified_negative as vn

rp = rf.RP
# Independently transcribed known safe line from the existing upstream control.
# Do not derive diagnostics from production WRAPPER: that hid the quote defect.
ACTUAL_OPAQUE = 'Error: verifying with issuer "sigstore.dev"'


@contextmanager
def fixture(kind, change=None, original_module=None):
    with tempfile.TemporaryDirectory() as directory:
        private = Path(directory); public = private / 'public'; public.mkdir()
        gh = private / 'gh'; gh.write_bytes(b'SYNTHETIC pinned CLI binary, not executed')
        if kind == 'candidate':
            module = original_module or candidate
            _, graphs = cf.fixture(directory)
            receipt = candidate.orchestrate(cf.packet(), cf.expected(), cf.API(), b'',
                cf.FakeRunner(graphs), cf.MemoryJournal(), cf.Store)
            (public / 'candidate-receipt.json').write_bytes(policy.canonical(receipt))
            candidate.checksums(private, public, cf.expected())
            subjects = policy.SUBJECTS
            mapping = {r: graphs[r]['digest'][7:] for r in policy.ROLES}
            mapping['receipt'] = vn.sha((public / subjects['receipt']).read_bytes())
            expected = cf.expected(); signer = policy.SIGNER_URI
            bundle = public / 'candidate-bundle.sigstore.json'
        else:
            module = original_module or rp
            subjects = rp.SUBJECTS; expected = rf.expected(); signer = rp.SIGNER_URI
            old_spec = importlib.util.spec_from_file_location('vn_old', Path(__file__).with_name('rr2-old-pair.py'))
            old = importlib.util.module_from_spec(old_spec); old_spec.loader.exec_module(old)
            receipt = {'kind': 'RP_SANITIZED_PROOF_RECEIPT', **expected, 'repository': rp.REPO,
                'repositoryId': rp.REPO_ID, 'repositoryOwnerId': rp.OWNER_ID, 'version': '0.61.0',
                'platform': 'linux/amd64', 'archiveSha256': 'c' * 64,
                'execution': dict.fromkeys(('rr1Cleanup','rr2Cleanup','rr1','rr2rr3'), 'PASS'),
                'oldPair': {'sourceCommit': old.SOURCE, 'manifestDigests': {
                    r: 'sha256:' + old.ROLES[r][1] for r in ('app','migrator')}},
                'limitations': ['loopback_unsigned_registry_not_GHCR_publication',
                    'old_private_GHCR_pair_read_only', 'not_formal_publisher_or_owner_go'], 'roles': {}}
            receipt['execution']['stages'] = list(rp.STAGES)
            mapping = {}
            for role in rp.ROLES:
                raw = ('synthetic-' + role).encode(); (public / subjects[role]).write_bytes(raw)
                mapping[role] = vn.sha(raw)
                receipt['roles'][role] = {'subjectName': subjects[role],
                    'manifestDigest': 'sha256:' + mapping[role], 'configDigest': 'sha256:' + 'd'*64,
                    'platformManifestDigest': 'sha256:' + 'e'*64}
            (public / subjects['receipt']).write_bytes(policy.canonical(receipt))
            mapping['receipt'] = vn.sha((public / subjects['receipt']).read_bytes())
            bundle = public / 'proof-bundle.sigstore.json'
        bundle.write_bytes(b'{"synthetic":true}')
        cert = {'sourceRepositoryIdentifier': '1359528829', 'sourceRepositoryOwnerIdentifier': '45478892',
            'sourceRepositoryURI': 'https://github.com/' + rp.REPO, 'sourceRepositoryDigest': rf.SOURCE,
            'sourceRepositoryRef': 'refs/heads/main', 'buildSignerURI': signer, 'buildSignerDigest': rf.SOURCE,
            'runnerEnvironment': 'github-hosted', 'issuer': 'https://token.actions.githubusercontent.com',
            'runInvocationURI': 'https://github.com/' + rp.REPO + '/actions/runs/123/attempts/1'}
        response = [{'verificationResult': {'signature': {'certificate': cert}, 'statement': {
            'predicateType': 'https://slsa.dev/provenance/v1', 'subject': [
                {'name': subjects[r], 'digest': {'sha256': mapping[r]}} for r in vn.ROLES]}}}]
        state = SimpleNamespace(module=module, private=private, public=public, gh=gh,
            mapping=mapping, expected=expected, response=response, bundle=bundle, subjects=subjects,
            positives=[], negatives=[], events=[], after_negative=False)
        def cli(args, timeout=120):
            if args[0] == 'git':
                return rf.mock_git(*args[1:])
            state.positives.append(args)
            if args[-1] == '--version':
                return b'gh version 2.103.3 synthetic' if kind == 'candidate' else 'gh version 2.103.3 synthetic'
            state.events.append('positive')
            output = copy.deepcopy(state.response)
            if change:
                change('positive', state, args, output)
            raw = policy.canonical(output)
            return raw if kind == 'candidate' else raw.decode()
        def probe(args, **kwargs):
            state.negatives.append(args); state.events.append('negative'); state.after_negative = True
            diagnostic = ACTUAL_OPAQUE + '\n'
            if args[args.index('--source-digest') + 1] == '0' * 40:
                diagnostic = 'expected SourceRepositoryDigest to be ' + '0'*40 + ', got ' + rf.SOURCE
            elif args[args.index('--signer-digest') + 1] == '0' * 40:
                diagnostic = 'expected BuildSignerDigest to be ' + '0'*40 + ', got ' + rf.SOURCE
            elif args[args.index('--source-ref') + 1] == 'refs/heads/wrong':
                diagnostic = 'expected SourceRepositoryRef to be refs/heads/wrong, got refs/heads/main'
            result = SimpleNamespace(returncode=1, stdout='', stderr=diagnostic)
            if change:
                change('negative', state, args, result)
            return result
        state.cli = cli; state.probe = probe
        def perform():
            if kind == 'candidate':
                module.verify(private, public, expected, str(gh), cli, probe)
            else:
                with patch.dict(os.environ, {'RP_PROOF_DIR': str(private)}), \
                     patch.object(module, 'run', side_effect=cli), \
                     patch.object(module.subprocess, 'run', side_effect=probe):
                    module.verify(public, str(gh), rf.context())
        state.perform = perform
        yield state


class Entrypoints(unittest.TestCase):
    def test_both_fixed_entrypoints_accept_only_anchored_opaque_cases_synthetic(self):
        for kind in ('rp', 'candidate'):
            with self.subTest(kind=kind), fixture(kind) as state:
                state.perform()
                metadata = json.loads((state.public / 'verification.json').read_bytes())
                evidence = metadata['negativeEvidence']
                self.assertEqual(len(evidence), 6)
                self.assertEqual(sum(e['cliInternalCause'] == 'UNOBSERVABLE' for e in evidence), 3)
                self.assertEqual(sum(e['cliRejectionBoundary'] == 'SPECIFIC_CLI_POLICY_REJECTION' for e in evidence), 3)
                for e in evidence:
                    self.assertTrue(e['sameBundlePositiveBeforeAfter'])
                    self.assertEqual(e['bundleSha256'], vn.sha(state.bundle.read_bytes()))
                    self.assertEqual(e['binarySha256'], vn.sha(state.gh.read_bytes()))
                self.assertEqual(len(state.negatives), 6)
                for index, event in enumerate(state.events):
                    if event == 'negative':
                        self.assertEqual(state.events[index-1:index+2], ['positive','negative','positive'])

    def test_postpositive_failure_never_writes_metadata(self):
        def change(phase, state, args, result):
            if phase == 'positive' and state.after_negative:
                raise state.module.Pending('synthetic postpositive failure') if state.module is candidate else rp.Blocked('synthetic postpositive failure')
        for kind in ('rp', 'candidate'):
            with self.subTest(kind=kind), fixture(kind, change) as state:
                with self.assertRaises((rp.Blocked, policy.Pending)):
                    state.perform()
                self.assertFalse((state.public / 'verification.json').exists())
                self.assertEqual(len(state.negatives), 1)

    def test_binary_bundle_original_or_probe_mutation_fails_no_metadata(self):
        for kind in ('rp', 'candidate'):
            for target in ('binary', 'bundle', 'original', 'probe', 'otherRole'):
                def change(phase, state, args, result):
                    if phase != 'negative': return
                    if target == 'probe' and not Path(args[3]).name.startswith(('tampered-', 'proof-')): return
                    if target == 'probe' and args[3] == str(state.public / state.subjects['app']): return
                    if target == 'probe' and args[3] == str(state.private / state.subjects['app']): return
                    paths = {'binary': state.gh, 'bundle': state.bundle,
                        'original': (state.private if kind == 'candidate' else state.public) / state.subjects['app'],
                        'probe': Path(args[3]),
                        'otherRole': (state.private if kind == 'candidate' else state.public) / state.subjects['migrator']}
                    paths[target].write_bytes(paths[target].read_bytes() + b'changed')
                with self.subTest(kind=kind, target=target), fixture(kind, change) as state:
                    with self.assertRaises((rp.Blocked, policy.Pending)):
                        state.perform()
                    self.assertFalse((state.public / 'verification.json').exists())

    def test_invalid_cert_identity_and_subject_mapping_fail_before_negative(self):
        mutations = [('sourceRepositoryIdentifier', '212613049'), ('sourceRepositoryOwnerIdentifier', '59704711'),
            ('sourceRepositoryDigest', 'f'*40), ('sourceRepositoryRef', 'refs/heads/wrong'),
            ('buildSignerURI', 'https://github.com/cli/cli/.github/workflows/deployment.yml@refs/heads/main'),
            ('buildSignerDigest', 'f'*40), ('runnerEnvironment', 'self-hosted'),
            ('runInvocationURI', 'https://github.com/planner77/layoutManager/actions/runs/124/attempts/1')]
        for kind in ('rp', 'candidate'):
            for field, value in (*mutations, ('subject', 'wrong-role'), ('predicate', 'wrong')):
                def change(phase, state, args, result):
                    if phase != 'positive': return
                    verified = result[0]['verificationResult']
                    if field == 'subject': verified['statement']['subject'][0]['name'] = value
                    elif field == 'predicate': verified['statement']['predicateType'] = value
                    else: verified['signature']['certificate'][field] = value
                with self.subTest(kind=kind, field=field), fixture(kind, change) as state:
                    with self.assertRaises((rp.Blocked, policy.Pending)):
                        state.perform()
                    self.assertEqual(state.negatives, [])
                    self.assertFalse((state.public / 'verification.json').exists())

    def test_opaque_generic_infra_stdout_and_exit_fail_closed(self):
        cases = [(1, '', 'Error: verifying with issuer "other"'),
            (1, '', 'Error: verifying with issuer sigstore.dev'),
            (1, '', 'Error: verifying with issuer ""sigstore.dev""'),
            (1, '', 'prefix ' + ACTUAL_OPAQUE), (1, '', ACTUAL_OPAQUE + ' extra'), (1,'',ACTUAL_OPAQUE+'\nnetwork timeout'),
            (1,'','authentication failed'), (1,'','TUF root unavailable'), (1,'','unknown flag: --bundle'),
            (1,'','generic failure'), (1,' ','\n'+ACTUAL_OPAQUE), (0,'',ACTUAL_OPAQUE), (2,'',ACTUAL_OPAQUE)]
        for kind in ('rp', 'candidate'):
            for code, stdout, stderr in cases:
                def change(phase, state, args, result):
                    if phase == 'negative' and args[args.index('--signer-workflow')+1].endswith('/wrong.yml'):
                        result.returncode=code; result.stdout=stdout; result.stderr=stderr
                with self.subTest(kind=kind, stderr=stderr), fixture(kind, change) as state:
                    with self.assertRaises((rp.Blocked, policy.Pending)):
                        state.perform()
                    self.assertFalse((state.public / 'verification.json').exists())


class Projection(unittest.TestCase):
    """Pure witnesses below are synthetic CLI output, never self approval."""
    def material(self, label='wrongSignerWorkflow', kind='rp'):
        prefix = 'proof' if kind == 'rp' else 'candidate'
        workflow = '.github/workflows/release-' + ('proof' if kind == 'rp' else 'candidate') + '.yml'
        expected = rf.expected()
        raw = {r: ('synthetic-' + r).encode() for r in vn.ROLES}
        mapping = {r: vn.sha(raw[r]) for r in vn.ROLES}
        role = 'receipt' if label == 'tamperedReceipt' else 'app'
        names = {r: prefix + '-' + r + '-manifest.json' for r in vn.ROLES[:-1]}
        names['receipt'] = prefix + '-receipt.json'
        original = '/private/' + names[role]
        probe = original if label in vn.REPLACEMENTS else '/private/altered-' + names[role]
        flags = ['--repo', rp.REPO, '--signer-workflow', rp.REPO + '/' + workflow,
            '--signer-digest', rf.SOURCE, '--source-digest', rf.SOURCE,
            '--source-ref', 'refs/heads/main', '--deny-self-hosted-runners', '--format', 'json']
        positive = ['/private/gh', 'attestation', 'verify', original, *flags, '--bundle', '/public/bundle']
        negative = positive.copy(); negative[3] = probe
        if label in vn.REPLACEMENTS:
            flag, value = vn.REPLACEMENTS[label]; negative[negative.index(flag)+1] = value
        output = rf.verified_result(mapping)
        value = output[0]['verificationResult']
        value['signature']['certificate']['buildSignerURI'] = 'https://github.com/' + rp.REPO + '/' + workflow + '@refs/heads/main'
        for subject, r in zip(value['statement']['subject'], vn.ROLES): subject['name'] = names[r]
        hashes = {'binary': vn.sha(b'synthetic-binary'), 'bundle': vn.sha(b'synthetic-bundle'),
            'original': mapping[role], 'probe': mapping[role] if probe == original else vn.sha(b'altered')}
        witness = {'argv': positive, 'exit': 0, 'stdout': json.dumps(output), 'hashes': hashes}
        return [label, expected, mapping, original, probe, '/private/gh', '/public/bundle',
                witness, copy.deepcopy(witness), negative,
                SimpleNamespace(returncode=1, stdout='', stderr=ACTUAL_OPAQUE),
                rp.negative_cause if kind == 'rp' else candidate.negative_cause]

    def test_missing_boolean_selfreceipt_and_predicate_only_witnesses_rejected(self):
        for kind in ('rp', 'candidate'):
            project = vn.rp_negative if kind == 'rp' else vn.candidate_negative
            for bad in (None, True, {'ownerApproved': True}, {'exit': 0, 'stdout': '{}'},
                        {'argv': [], 'exit': 0, 'stdout': '[]'}):
                args = self.material(kind=kind); args[7] = bad
                with self.subTest(kind=kind, witness=bad), self.assertRaises(vn.Rejected): project(*args)
            for output in ('true', '{}', '[]', '[{"predicate":{"ownerApproved":true}}]'):
                args = self.material(kind=kind); args[7]['stdout'] = output
                with self.subTest(kind=kind, output=output), self.assertRaises(vn.Rejected): project(*args)

    def test_no_tamper_or_other_signed_role_digest_rejected(self):
        for kind in ('rp', 'candidate'):
            project = vn.rp_negative if kind == 'rp' else vn.candidate_negative
            for label in ('tamperedManifest', 'tamperedReceipt'):
                for role in vn.ROLES:
                    args = self.material(label, kind)
                    args[7]['hashes']['probe'] = args[8]['hashes']['probe'] = args[2][role]
                    with self.subTest(kind=kind, label=label, signedRole=role), self.assertRaises(vn.Rejected): project(*args)

    def test_wrong_arguments_or_missing_positive_before_after_rejected(self):
        for kind in ('rp', 'candidate'):
            project = vn.rp_negative if kind == 'rp' else vn.candidate_negative
            mutations = [lambda a: a[9].append('--insecure'),
                lambda a: a[9].__setitem__(0, '/other/gh'),
                lambda a: a[9].__setitem__(-1, '/other/bundle'),
                lambda a: a[9].__setitem__(3, '/other/artifact'),
                lambda a: a[9].__setitem__(a[9].index('--repo')+1, 'cli/cli'),
                lambda a: a[9].__setitem__(a[9].index('--signer-workflow')+1, rp.SIGNER),
                lambda a: a[8].__setitem__('exit', 1),
                lambda a: a[7].__setitem__('exit', 1),
                lambda a: a[8].__setitem__('stdout', '[]'),
                lambda a: a[8]['hashes'].__setitem__('bundle', 'e'*64),
                lambda a: a[8]['hashes'].__setitem__('binary', 'e'*64),
                lambda a: a[7]['hashes'].__setitem__('original', 'e'*64)]
            for index, change in enumerate(mutations):
                args = self.material(kind=kind); change(args)
                with self.subTest(kind=kind, mutation=index), self.assertRaises(vn.Rejected): project(*args)

    def test_wrong_role_original_path_and_opaque_label_rejected(self):
        for kind in ('rp', 'candidate'):
            project = vn.rp_negative if kind == 'rp' else vn.candidate_negative
            for label in ('wrongSource', 'wrongSignerCommit', 'wrongRef'):
                args = self.material(label, kind)
                with self.subTest(kind=kind, label=label), self.assertRaises(vn.Rejected): project(*args)
            args = self.material('tamperedReceipt', kind); args[3] = args[3].replace('receipt', 'app-manifest')
            with self.subTest(kind=kind), self.assertRaises(vn.Rejected): project(*args)

    def test_source_specific_cause_requires_verified_actual_and_intentional_wrong_values(self):
        for kind in ('rp', 'candidate'):
            project = vn.rp_negative if kind == 'rp' else vn.candidate_negative
            for label, phrase in (
                ('wrongSource', 'expected SourceRepositoryDigest to be ' + '0'*40 + ', got ' + rf.SOURCE),
                ('wrongSignerCommit', 'expected BuildSignerDigest to be ' + '0'*40 + ', got ' + rf.SOURCE),
                ('wrongRef', 'expected SourceRepositoryRef to be refs/heads/wrong, got refs/heads/main')):
                args = self.material(label, kind); args[10].stderr = phrase
                self.assertEqual(project(*args)['cliRejectionBoundary'], 'SPECIFIC_CLI_POLICY_REJECTION')
                for bad in (phrase.replace('got ', 'got other-'), phrase.replace('expected ', 'expected other-')):
                    args[10].stderr = bad
                    with self.subTest(kind=kind, label=label), self.assertRaises((vn.Rejected, rp.Blocked, policy.Pending)): project(*args)


if __name__ == '__main__':
    unittest.main()
