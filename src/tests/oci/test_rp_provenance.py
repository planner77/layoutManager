#!/usr/bin/env python3
"""Pure RP contract tests. Synthetic JSON here is never signature evidence."""
import importlib.util
import json
import os
import subprocess
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('rp', Path(__file__).with_name('rp-provenance.py'))
RP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RP)
SOURCE = 'a' * 40
TREE = 'b' * 40

def expected():
    return {'sourceCommit':SOURCE,'sourceTree':TREE,'workflowCommit':SOURCE,
            'runId':'123','runAttempt':'1'}

def context():
    return {'GITHUB_ACTIONS':'true','GITHUB_EVENT_NAME':'workflow_dispatch',
            'GITHUB_REPOSITORY':RP.REPO,'GITHUB_REPOSITORY_ID':RP.REPO_ID,
            'GITHUB_REPOSITORY_OWNER_ID':RP.OWNER_ID,'GITHUB_REF':'refs/heads/main',
            'GITHUB_WORKFLOW_REF':RP.SIGNER+'@refs/heads/main',
            'RUNNER_ENVIRONMENT':'github-hosted','RP_SOURCE_COMMIT':SOURCE,
            'RP_EXPECTED_TREE':TREE,'GITHUB_WORKFLOW_SHA':SOURCE,
            'GITHUB_SHA':SOURCE,'GITHUB_RUN_ID':'123','GITHUB_RUN_ATTEMPT':'1'}

def mock_git(*args):
    return {'HEAD':SOURCE, SOURCE+'^{tree}':TREE}.get(args[-1], 'commit')

def verified_result(mapping):
    cert = {'sourceRepositoryIdentifier':RP.REPO_ID,
            'sourceRepositoryOwnerIdentifier':RP.OWNER_ID,
            'sourceRepositoryURI':'https://github.com/'+RP.REPO,
            'sourceRepositoryDigest':SOURCE,'sourceRepositoryRef':'refs/heads/main',
            'buildSignerURI':RP.SIGNER_URI,'buildSignerDigest':SOURCE,
            'runnerEnvironment':'github-hosted',
            'issuer':'https://token.actions.githubusercontent.com',
            'runInvocationURI':'https://github.com/'+RP.REPO+'/actions/runs/123/attempts/1'}
    subjects = [{'name':RP.SUBJECTS[role],'digest':{'sha256':mapping[role]}}
                for role in (*RP.ROLES,'receipt')]
    return [{'verificationResult':{'signature':{'certificate':cert},
            'statement':{'subject':subjects,'predicateType':'https://slsa.dev/provenance/v1'}}}]

class Contract(unittest.TestCase):
    def test_runner_path_initialization_and_never_initialized_guards(self):
        workflow = (RP.ROOT / '.github/workflows/release-proof.yml').read_text()
        job_env = workflow.split('    env:\n', 1)[1].split('    steps:\n', 1)[0]
        self.assertNotIn('runner.', job_env)
        path_step = workflow.split('      - name: Initialize proof paths from the allocated runner\n', 1)[1]
        body = path_step.split('        run: |\n', 1)[1].split('\n      - name:', 1)[0]
        script = '\n'.join(line[10:] if line.startswith('          ') else line
                           for line in body.splitlines())
        always = [line.strip() for line in workflow.splitlines() if 'if: always()' in line]
        self.assertEqual(len(always), 3)
        self.assertTrue(all("steps.paths.outcome == 'success'" in line for line in always))
        self.assertNotIn('if [[ -f "$RP_PROOF_DIR/rr1-registry-receipt.json" ]]', workflow)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env_file = root / 'environment'
            env_file.touch()
            environment = {'PATH': os.environ['PATH'], 'RUNNER_TEMP': str(root),
                           'GITHUB_ENV': str(env_file)}
            good = subprocess.run(['bash', '-euo', 'pipefail', '-c', script],
                                  env=environment, capture_output=True, text=True)
            self.assertEqual(good.returncode, 0, good.stderr)
            self.assertEqual(env_file.read_text().splitlines(), [
                'RP_PROOF_DIR=' + str(root / 'issue225-proof-private'),
                'RP_PUBLIC_DIR=' + str(root / 'issue225-proof-public')])
            self.assertEqual(list(root.iterdir()), [env_file])
            for invalid in ('', 'relative', '/tmp/invalid\npath', '/tmp/invalid\rpath'):
                env_file.write_text('')
                bad = subprocess.run(['bash', '-euo', 'pipefail', '-c', script],
                    env=dict(environment, RUNNER_TEMP=invalid), capture_output=True, text=True)
                self.assertNotEqual(bad.returncode, 0)
                self.assertIn('RP_RUNNER_PATH_INIT_INVALID', bad.stderr)
                self.assertEqual(env_file.read_text(), '')
                self.assertEqual(list(root.iterdir()), [env_file])

    def test_negative_cause_requires_specific_verified_mismatch(self):
        # Source-shaped gh 2.103.3 policy.go diagnostic, NOT a real CLI run or
        # signature proof: Go regexp.QuoteMeta escapes dots but preserves slashes.
        wrong_pattern = (r'^https://github\.com/planner77/layoutManager/'
                         r'\.github/workflows/wrong\.yml(@(refs/.*|[0-9a-fA-F]+))?$')
        wrong_workflow = ('no matching CertificateIdentity found, last error: '
                         'expected SAN value to match regex "' + wrong_pattern +
                         '", got "' + RP.SIGNER_URI + '"')
        samples={
            'wrongSource':'expected SourceRepositoryDigest to be '+('0'*40)+', got '+SOURCE,
            'wrongSignerCommit':'expected BuildSignerDigest to be '+('0'*40)+', got '+SOURCE,
            'wrongRef':'expected SourceRepositoryRef to be refs/heads/wrong, got refs/heads/main',
            'wrongSignerWorkflow':wrong_workflow,
            'tamperedManifest':'provided artifact digest does not match any digest in statement',
            'tamperedReceipt':'provided artifact digest does not match any digest in statement'}
        for label,diagnostic in samples.items():
            with self.subTest(label=label):
                good=SimpleNamespace(returncode=1,stdout='',stderr=diagnostic)
                self.assertTrue(RP.negative_cause(label,good,expected()))
                for bad in ('no attestations found','network is unreachable',
                            'authentication failed','TUF root unavailable',
                            'unknown flag: --bundle','error parsing bundle',
                            'generic Sigstore failure'):
                    with self.assertRaises(RP.Blocked):
                        RP.negative_cause(label,SimpleNamespace(
                            returncode=1,stdout='',stderr=bad),expected())
                for exit_code in (0,2):
                    with self.assertRaises(RP.Blocked):
                        RP.negative_cause(label,SimpleNamespace(
                            returncode=exit_code,stdout='',stderr=diagnostic),expected())
                with self.assertRaises(RP.Blocked):
                    RP.negative_cause(label,SimpleNamespace(
                        returncode=1,stdout='unexpected',stderr=diagnostic),expected())
        for bad in (
            wrong_workflow.replace(wrong_pattern, 'wrong.yml'),
            wrong_workflow.replace(wrong_pattern, wrong_pattern.replace(r'wrong\.yml', r'other\.yml')),
            wrong_workflow.replace(wrong_pattern, wrong_pattern[1:]),
            wrong_workflow.replace(wrong_pattern, wrong_pattern[:-1]),
            wrong_workflow.replace(wrong_pattern, wrong_pattern.replace(r'wrong\.yml', 'wrong.yml')),
            wrong_workflow.replace(RP.SIGNER_URI, RP.SIGNER_URI + '-other'),
            wrong_workflow.replace(RP.SIGNER_URI, RP.SIGNER_URI.replace('refs/heads/main', 'refs/heads/other')),
            wrong_workflow.replace('no matching CertificateIdentity found, last error: ', ''),
            wrong_workflow + '\nnetwork is unreachable',
        ):
            with self.subTest(wrongWorkflowDiagnostic=bad):
                with self.assertRaises(RP.Blocked):
                    RP.negative_cause('wrongSignerWorkflow', SimpleNamespace(
                        returncode=1, stdout='', stderr=bad), expected())
        with tempfile.TemporaryDirectory() as directory,\
             patch.dict(os.environ,{'RP_PROOF_DIR':directory}),\
             patch.object(RP.subprocess,'run',side_effect=subprocess.TimeoutExpired('gh',120)):
            with self.assertRaises(RP.Blocked):
                RP.negative_probe('gh',['file'],'wrongSource',expected())
            diagnostic=json.loads((Path(directory)/'rp-negative-wrongSource.json').read_text())
            self.assertEqual(diagnostic['class'],'COMMAND_UNAVAILABLE_OR_TIMEOUT')

    def test_cleanup_marker_binds_same_run_receipts_and_rechecks_absence(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            private=root/'private';private.mkdir()
            owned=root/'data/release-proof/rr2-0123456789abcdef';owned.mkdir(parents=True)
            owned_receipt={
                'kind':'RR2_OWNED_NAMESPACE','nonce':'0123456789abcdef',
                'images':{'newSource':SOURCE,
                          'newRegistryCid':'a'*64,
                          'newRegistryNonce':'fedcba9876543210'},
                'liveVolume':'rr2-live',
                'restoreVolume':'rr2-restore','network':'rr2-network',
                'restoreNetwork':'rr2-restore-network','appName':'rr2-app',
                'restoreAppName':'rr2-restore-app','project':'rr2-project',
                'restoreProject':'rr2-restore-project','children':[],
                'hostChildren':[]}
            rr1_path=private/'rr1-registry-receipt.json'
            rr2_path=private/'rr2-journey.json';old_path=private/'rr2-old-pair.json'
            rr1={'kind':'RR1_LOCAL_UNSIGNED_REGISTRY_RECEIPT','retainedForR2':True,
                 'sourceCommit':SOURCE,'sourceTree':TREE,'host':'127.0.0.1:12345',
                 'refs':{role:'127.0.0.1:12345/rr1-release@sha256:'+digit*64
                         for role,digit in zip(RP.ROLES,('1','2','3'))},
                 'resources':{'nonce':'fedcba9876543210','registryCid':'a'*64,
                              'registryName':'rp-registry','network':'rp-network',
                              'volume':'rp-volume'}}
            owned_receipt['images']['new']=rr1['refs']
            (owned/'receipt.json').write_text(json.dumps(owned_receipt))
            rr2={'kind':'RR2_RR3_JOURNEY','result':'PASS','ownedCleanup':'PASS',
                 'stages':list(RP.STAGES),'nonce':'0123456789abcdef',
                 'newSource':SOURCE,'newImage':rr1['refs']}
            rr1_path.write_text(json.dumps(rr1));rr2_path.write_text(json.dumps(rr2))
            old_path.write_text('{"old":"pair"}')
            owned_receipt['images']['newReceiptSha256']=RP.sha(rr1_path.read_bytes())
            owned_receipt['images']['oldReceiptSha256']=RP.sha(old_path.read_bytes())
            (owned/'receipt.json').write_text(json.dumps(owned_receipt))
            calls=[];present=[];docker_unavailable=[]
            class Docker:
                def docker_optional_inspect(self,kind,name):
                    calls.append((kind,name))
                    return {'foreign':True} if name in present else None
            def command(args,**kwargs):
                calls.append(tuple(args))
                if docker_unavailable and args[:2] == ['docker','ps']:
                    raise RP.Blocked('RP_COMMAND_UNAVAILABLE')
                return ''
            with patch.object(RP,'ROOT',root),patch.object(RP,'guard',return_value=expected()),\
                 patch.dict(os.environ,{'RP_PROOF_DIR':str(private)}),\
                 patch.object(RP,'rr1_module',return_value=Docker()),patch.object(RP,'run',side_effect=command):
                rr2_path.unlink()
                with patch.object(RP,'guard',side_effect=RP.Blocked('RP_BAD_CONTEXT')):
                    self.assertRaises(RP.Blocked,RP.cleanup,rr1_path,old_path,rr1_path,rr2_path)
                self.assertEqual(calls,[])
                rr1_path.write_text(json.dumps({**rr1,'sourceCommit':'0'*40}))
                self.assertRaises(RP.Blocked,RP.cleanup,rr1_path,old_path,rr1_path,rr2_path)
                self.assertEqual(calls,[])
                rr1_path.write_text(json.dumps(rr1))
                self.assertRaises(RP.Blocked,RP.cleanup,rr1_path,private/'wrong.json',
                                  rr1_path,rr2_path)
                self.assertEqual(calls,[])
                rr2_path.write_text(json.dumps({**rr2,'result':'FAILED'}))
                with patch.object(RP,'guard',side_effect=RP.Blocked('RP_BAD_CONTEXT')):
                    self.assertRaises(RP.Blocked,RP.cleanup,rr1_path,old_path,rr1_path,rr2_path)
                self.assertEqual(calls,[])
                rr2_path.unlink()
                extra=root/'data/release-proof/rr2-1111111111111111'
                extra.mkdir();(extra/'receipt.json').write_text(json.dumps({
                    **owned_receipt,'nonce':'1111111111111111'}))
                self.assertRaises(RP.Blocked,RP.cleanup,rr1_path,old_path,rr1_path,rr2_path)
                self.assertEqual(calls,[])
                (extra/'receipt.json').unlink();extra.rmdir()
                RP.cleanup(rr1_path,old_path,rr1_path,rr2_path)
                self.assertFalse((private/'rp-cleanup-complete.json').exists())
                self.assertTrue(any('rr2-recovery-proof.py' in ' '.join(call)
                                    for call in calls if isinstance(call,tuple)))
                calls.clear()
                rr2_path.write_text(json.dumps(rr2))
                RP.cleanup(rr1_path,old_path,rr1_path,rr2_path)
                marker=private/'rp-cleanup-complete.json'
                self.assertEqual(json.loads(marker.read_text())['rr2ReceiptSha256'],
                                 RP.sha(rr2_path.read_bytes()))
                calls.clear()
                RP.cleanup(rr1_path,old_path,rr1_path,rr2_path)
                self.assertFalse(any(isinstance(call,tuple) and
                                     'rr1-registry-proof.py' in ' '.join(call)
                                     for call in calls))
                self.assertIn(('container','a'*64),calls)
                self.assertIn(('container','rp-registry'),calls)
                present.append('rr2-app')
                with self.assertRaises(RP.Blocked):
                    RP.cleanup(rr1_path,old_path,rr1_path,rr2_path)
                present.clear();present.append('rp-registry')
                with self.assertRaises(RP.Blocked):
                    RP.cleanup(rr1_path,old_path,rr1_path,rr2_path)
                present.clear()
                docker_unavailable.append(True)
                with self.assertRaises(RP.Blocked):
                    RP.cleanup(rr1_path,old_path,rr1_path,rr2_path)
                docker_unavailable.clear()
                extra.mkdir();(extra/'receipt.json').write_text(json.dumps({
                    **owned_receipt,'nonce':'1111111111111111'}))
                with self.assertRaises(RP.Blocked):
                    RP.cleanup(rr1_path,old_path,rr1_path,rr2_path)
                (extra/'receipt.json').unlink();extra.rmdir()
                old_path.write_text('{"old":"changed"}')
                with self.assertRaises(RP.Blocked):
                    RP.cleanup(rr1_path,old_path,rr1_path,rr2_path)

    def test_dispatch_guard_requires_exact_ids_ref_workflow_sha_tree(self):
        self.assertEqual(RP.guard(context(),mock_git),expected())
        for field,bad in [('GITHUB_REPOSITORY','foreign/repo'),
                          ('GITHUB_REPOSITORY_ID','0'),
                          ('GITHUB_REPOSITORY_OWNER_ID','0'),
                          ('GITHUB_REF','refs/heads/other'),
                          ('GITHUB_WORKFLOW_REF',RP.SIGNER+'@refs/heads/other'),
                          ('GITHUB_WORKFLOW_SHA','c'*40),
                          ('RP_SOURCE_COMMIT','c'*40),
                          ('RP_EXPECTED_TREE','c'*40),
                          ('RUNNER_ENVIRONMENT','self-hosted'),
                          ('GITHUB_EVENT_NAME','pull_request_target')]:
            with self.subTest(field=field):
                changed=context();changed[field]=bad
                with self.assertRaises(RP.Blocked):RP.guard(changed,mock_git)

    def test_certificate_ids_and_all_subjects_are_required_schema_only(self):
        mapping={role:digit*64 for role,digit in
                 zip((*RP.ROLES,'receipt'),('1','2','3','4'))}
        value=verified_result(mapping)
        self.assertTrue(RP.checked_certificate(value,expected(),mapping))
        for field in ('sourceRepositoryIdentifier','sourceRepositoryOwnerIdentifier',
                      'buildSignerDigest','sourceRepositoryDigest','sourceRepositoryRef',
                      'runnerEnvironment','runInvocationURI'):
            changed=json.loads(json.dumps(value))
            changed[0]['verificationResult']['signature']['certificate'][field]='wrong'
            with self.subTest(field=field),self.assertRaises(RP.Blocked):
                RP.checked_certificate(changed,expected(),mapping)
        missing=json.loads(json.dumps(value))
        missing[0]['verificationResult']['statement']['subject'].pop()
        with self.assertRaises(RP.Blocked):RP.checked_certificate(missing,expected(),mapping)
        duplicate=json.loads(json.dumps(value))
        duplicate[0]['verificationResult']['statement']['subject'].append(
            duplicate[0]['verificationResult']['statement']['subject'][0])
        with self.assertRaises(RP.Blocked):RP.checked_certificate(duplicate,expected(),mapping)
        swapped=json.loads(json.dumps(value))
        swapped[0]['verificationResult']['statement']['subject'][0]['digest']['sha256']='f'*64
        with self.assertRaises(RP.Blocked):RP.checked_certificate(swapped,expected(),mapping)

    def test_public_inventory_refuses_extra_files_symlinks_and_role_gap(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for name in RP.SUBJECTS.values():
                (root/name).write_bytes(name.encode())
            self.assertEqual(set(RP.subject_map(root)),set((*RP.ROLES,'receipt')))
            (root/'private.db').write_bytes(b'private')
            with self.assertRaises(RP.Blocked):RP.public_allowlist(root)
            (root/'private.db').unlink()
            (root/'proof-app-manifest.json').unlink()
            with self.assertRaises(RP.Blocked):RP.subject_map(root)
            (root/'proof-app-manifest.json').symlink_to(root/'proof-receipt.json')
            with self.assertRaises(RP.Blocked):RP.public_allowlist(root)

    def test_sanitizer_rejects_missing_or_swapped_role(self):
        digests={role:'sha256:'+digit*64 for role,digit in
                 zip(RP.ROLES,('1','2','3'))}
        manifests={role:{'digest':digests[role],'manifestDigest':digests[role],
                         'configDigest':digests[role],
                         'topDescriptor':{'mediaType':'application/vnd.oci.image.index.v1+json'}}
                   for role in RP.ROLES}
        refs={role:'127.0.0.1:12345/rr1-release@'+digests[role] for role in RP.ROLES}
        rr1={'kind':'RR1_LOCAL_UNSIGNED_REGISTRY_RECEIPT','retainedForR2':True,
             'sourceCommit':SOURCE,'sourceTree':TREE,'version':'0.61.0',
             'manifests':manifests,'refs':refs}
        rr2={'kind':'RR2_RR3_JOURNEY','result':'PASS','ownedCleanup':'PASS',
             'stages':list(RP.STAGES),'newSource':SOURCE,
             'oldSource':'9eb8ac764ddb658bf8f9aaef9f15f18e099f9f63',
             'newImage':refs,'oldImage':{'app':'ghcr.io/planner77/layoutmanager@'+digests['app'],
                                        'migrator':'ghcr.io/planner77/layoutmanager@'+digests['migrator']},
             'privatePassword':'MUST_NOT_LEAK'}
        build={'sourceCommit':SOURCE,'sourceTree':TREE,'sourceMode':'CI_GIT_ARCHIVE',
               'sourceArchiveSha256':'f'*64,'privateArchivePath':'MUST_NOT_LEAK'}
        clean=RP.sanitized(rr1,rr2,build,expected())
        self.assertEqual(set(clean['roles']),set(RP.ROLES))
        self.assertNotIn('MUST_NOT_LEAK',json.dumps(clean))
        del rr1['manifests']['cpu-worker']
        with self.assertRaises(RP.Blocked):RP.sanitized(rr1,rr2,build,expected())
        rr1['manifests']=manifests
        rr2['newImage']['app']=refs['migrator']
        with self.assertRaises(RP.Blocked):RP.sanitized(rr1,rr2,build,expected())
        rr2['newImage']['app']=refs['app']
        rr2['newSource']='c'*40
        with self.assertRaises(RP.Blocked):RP.sanitized(rr1,rr2,build,expected())

if __name__ == '__main__':unittest.main()
