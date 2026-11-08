"""Focused G2 guard tests. No Docker daemon or operating volume is used."""
import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock

SCRIPT = Path(__file__).with_name('or58-g2-upgrade.py')
spec = importlib.util.spec_from_file_location('or58_g2_tested', SCRIPT)
g2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g2)


class G2GuardTests(unittest.TestCase):
    def test_created_empty_network_id_only_until_start(self):
        nonce='a'*32
        state={'nonce':nonce,'network':'owned-net','networkId':'n'*64}
        network={'Id':state['networkId'],'Name':state['network'],'Internal':True,
                 'Labels':{g2.proof.OWNER_LABEL:nonce,
                           'com.planner77.purpose':'or58-restore-proof'}}
        row={'HostConfig':{'NetworkMode':state['network']},
             'NetworkSettings':{'Networks':{state['network']:{'NetworkID':''}}}}
        g2.check_app_network(state,row,network,started=False)
        with self.assertRaisesRegex(ValueError,'G2_NEW_APP_NETWORK_ID'):
            g2.check_app_network(state,row,network,started=True)
        row['NetworkSettings']['Networks'][state['network']]['NetworkID']='foreign'
        with self.assertRaisesRegex(ValueError,'G2_NEW_APP_NETWORK_ID'):
            g2.check_app_network(state,row,network,started=False)
        row['NetworkSettings']['Networks'][state['network']]['NetworkID']=state['networkId']
        g2.check_app_network(state,row,network,started=True)

    def test_snapshot_source_syntax(self):
        result = subprocess.run(['node', '--check', str(SCRIPT.with_name('g2-volume-snapshot.mjs'))],
                                capture_output=True, timeout=30, check=False)
        self.assertEqual(result.returncode, 0)

    def test_registered_schema_bridge_precedes_any_restore(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'archive.tar'
            archive.write_bytes(b'fixture')
            refs = root / 'refs.json'
            refs.write_text(json.dumps({role: {'ref': value} for role, value in g2.PINS.items()}))
            evidence = root / 'private'
            evidence.mkdir(mode=0o700)
            calls = []

            def reject_schema(_archive):
                calls.append('schema')
                raise g2.proof.Blocked('OR58_SCHEMA_CHECK_FAILED')

            with mock.patch.object(g2.fup1, 'EXPECTED_ARCHIVE', hashlib.sha256(b'fixture').hexdigest()), \
                 mock.patch.object(g2, 'image_pair', side_effect=lambda *_: calls.append('images')), \
                 mock.patch.object(g2.proof, 'sqlite_fingerprint', side_effect=reject_schema), \
                 mock.patch.object(g2.fup1, 'prepare', side_effect=AssertionError('restore called')):
                with self.assertRaises(g2.proof.Blocked):
                    g2.execute(evidence, archive, refs)
            self.assertEqual(calls, ['images', 'schema'])
            self.assertFalse((evidence / 'fup1' / 'state.json').exists())
            self.assertFalse((evidence / 'g2' / 'receipt.json').exists())

    def test_failure_codes_never_echo_exception_detail(self):
        self.assertEqual(g2.failure_code(ValueError('G2_PLAN_INVALID')), 'G2_PLAN_INVALID')
        self.assertEqual(g2.failure_code(ValueError('OR58_SCHEMA_CHECK_FAILED')),
                         'OR58_SCHEMA_CHECK_FAILED')
        for detail in ('secret=abc', 'G2_SECRET path=/tmp/private', 'g2_lowercase'):
            self.assertEqual(g2.failure_code(RuntimeError(detail)), 'G2_UNEXPECTED')

    def test_new_app_create_timeout_keeps_exact_cleanup_intent(self):
        with tempfile.TemporaryDirectory() as directory:
            nonce = 'a' * 32
            receipt = {'root': directory}
            state = {'nonce': nonce, 'network': 'owned-net', 'volume': 'owned-volume'}
            saved = []
            def fail_create(*args, **_kwargs):
                self.assertEqual(args[0], 'create')
                self.assertIn('--cidfile', args)
                self.assertEqual(args[args.index('--cidfile')+1], receipt['newAppCidFile'])
                self.assertTrue(saved)
                raise g2.proof.Blocked('OR58_DOCKER_TIMEOUT')
            with mock.patch.object(g2.rr2, 'optional_docker', return_value=None), \
                 mock.patch.object(g2.rr2, 'save_receipt', side_effect=lambda value: saved.append(dict(value))), \
                 mock.patch.object(g2.proof, 'docker', side_effect=fail_create):
                with self.assertRaises(g2.proof.Blocked):
                    g2.start_current_app(receipt, state, g2.PINS)
            self.assertEqual(receipt['newAppName'], 'or58-g2-current-'+nonce)
            self.assertEqual(saved[0]['newAppCidFile'], receipt['newAppCidFile'])

    def test_bad_digest_pin_rejected_before_clone_creation(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            archive=root/'archive.tar';archive.write_bytes(b'fixture')
            refs=root/'refs.json'
            refs.write_text(json.dumps({role:{'ref':value+'bad'} for role,value in g2.PINS.items()}))
            evidence=root/'private';evidence.mkdir(mode=0o700)
            with mock.patch.object(g2.fup1,'EXPECTED_ARCHIVE',hashlib.sha256(b'fixture').hexdigest()), \
                 mock.patch.object(g2.rr2,'docker_one',side_effect=AssertionError('Docker inspect called')):
                with self.assertRaisesRegex(ValueError,'G2_REFS_FIELDS'):
                    g2.execute(evidence,archive,refs)
            self.assertFalse((evidence/'fup1').exists())

    def test_host_timeout_reloads_durable_child_journal(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            receipt={'root':directory,'nonce':'a'*16,'liveVolume':'owned','images':{'new':{}},
                     'project':'owned-project','children':[]}
            durable={**receipt,'hostChildren':[{'name':'child'}]}
            (root/'receipt.json').write_text(json.dumps(durable))
            with mock.patch.object(g2.rr2,'host_run',side_effect=g2.rr2.Blocked('RR2_HOST_COMMAND_TIMEOUT')):
                with self.assertRaises(g2.rr2.Blocked):
                    g2.run_host(receipt,root/'helper.py',root/'env','plan')
            self.assertEqual(receipt['hostChildren'],[{'name':'child'}])

    def test_foreign_app_cid_is_rejected_before_removal(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);clone=root/'fup1';work=root/'g2'
            clone.mkdir();work.mkdir()
            archive=root/'archive.tar';archive.write_bytes(b'fixture')
            nonce='a'*32;cid='b'*64
            state={'nonce':nonce,'volume':'or58-'+nonce}
            (clone/'state.json').write_text(json.dumps(state))
            receipt={'kind':'G2_OR58_UPGRADE','fup1Root':str(clone),
                     'liveVolume':state['volume'],'nonce':nonce[:16],
                     'archiveSha256':hashlib.sha256(b'fixture').hexdigest(),
                     'newAppName':'or58-g2-current-'+nonce,
                     'newAppCidFile':str(work/('or58-g2-current-'+nonce+'.cid'))}
            (work/'receipt.json').write_text(json.dumps(receipt))
            Path(receipt['newAppCidFile']).write_text('c'*64)
            foreign={'Id':cid,'Config':{'Labels':{}},'State':{'Running':False}}
            with mock.patch.object(g2.fup1,'EXPECTED_ARCHIVE',receipt['archiveSha256']), \
                 mock.patch.object(g2.rr2,'cleanup_owned_children'), \
                 mock.patch.object(g2.rr2,'optional_docker',return_value=foreign), \
                 mock.patch.object(g2.proof,'docker',side_effect=AssertionError('removed foreign app')):
                with self.assertRaisesRegex(ValueError,'G2_CLEANUP_APP_IDENTITY'):
                    g2.cleanup(root,archive)

    def test_snapshot_passes_only_column_names_to_nonroot_container(self):
        receipt={'images':{'new':{'cpu-worker':'pinned-worker'}},'liveVolume':'owned'}
        baseline={'tables':{'CadFileVersion':{'columns':['id','sha256'],
                   'count':1,'sha256':'private-row-hash'}},'cad':{'private-path':'private-digest'}}
        def capture(_receipt,command,**_kwargs):
            self.assertIn('--user',command)
            self.assertEqual(command[command.index('--user')+1],'10001:10001')
            self.assertNotIn('/input/baseline.json', ' '.join(command))
            encoded=next(item.split('=',1)[1] for item in command if item.startswith('G2_BASELINE_JSON='))
            self.assertEqual(json.loads(encoded),{'tables':{'CadFileVersion':{'columns':['id','sha256']}}})
            self.assertNotIn('private-row-hash',encoded)
            return SimpleNamespace(stdout=json.dumps({'kind':'G2_VOLUME_SNAPSHOT',
                                    'integrity':True,'fk':0}))
        with mock.patch.object(g2.rr2,'run_owned_child',side_effect=capture):
            g2.snapshot(receipt,baseline)


if __name__ == '__main__':
    unittest.main()
