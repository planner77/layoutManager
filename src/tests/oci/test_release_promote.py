#!/usr/bin/env python3
"""Synthetic local RF-C API/registry/CLI seams; no external or crypto execution."""
import copy
from contextlib import contextmanager
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch, Mock
import urllib.parse

import candidate_policy as ca
import candidate_publish as candidate
import candidate_registry as cr
import promotion_policy as p
import registry_promotion as rt
import release_promote as release
import test_candidate_publish as cf
import test_rp_provenance as rf

B = '9' * 40
BTREE = '8' * 40


class API:
    def __init__(self, packet): self.p = packet; self.calls = []; self.change = None
    def get(self, path):
        self.calls.append(path); a = self.p['candidate']; b = self.p['promotion']; sha = ca.sha(ca.canonical(self.p))
        if path.endswith('/actions/runs/456/attempts/1'):
            value = {'id': 456, 'repository': {'id': ca.REPO_ID}, 'workflow_id': 99,
                'head_sha': B, 'head_branch': 'main', 'path': p.WORKFLOW, 'event': 'workflow_dispatch',
                'run_attempt': 1, 'status': 'in_progress', 'actor': {'id': ca.OWNER_ID},
                'triggering_actor': {'id': ca.OWNER_ID}, 'display_title': p.title(sha)}
        elif path.endswith('/actions/runs/123/attempts/1'):
            value = {'id': 123, 'repository': {'id': ca.REPO_ID}, 'head_sha': cf.SOURCE,
                'head_branch': 'main', 'path': ca.WORKFLOW, 'event': 'workflow_dispatch', 'run_attempt': 1,
                'status': 'completed', 'conclusion': 'success', 'actor': {'id': ca.OWNER_ID},
                'triggering_actor': {'id': ca.OWNER_ID}, 'display_title': ca.title(a['packetSha256'])}
        elif '/actions/workflows/99/runs?' in path:
            value = {'total_count': 1, 'workflow_runs': [{'id': 456, 'display_title': p.title(sha)}]}
        elif path.endswith('/git/ref/heads/main'): value = {'ref':'refs/heads/main','object':{'sha':B}}
        elif '/git/commits/' in path:
            source = path.rsplit('/',1)[1]
            value = {'sha':source,'tree':{'sha':cf.TREE if source==cf.SOURCE else BTREE},'parents':[{'sha':'c'*40}]}
        elif '/actions/runs/456/attempts/1/jobs?' in path:
            value = {'total_count':1,'jobs':[{'id':71,'run_id':456,'head_sha':B,'status':'in_progress','name':p.job_name(sha)}]}
        elif path.endswith('/environments/'+ca.ENVIRONMENT): value = copy.deepcopy(cf.ENV)
        elif '/deployment-branch-policies?' in path: value = {'total_count':1,'branch_policies':copy.deepcopy(cf.POLICIES)}
        elif path.endswith('/actions/runs/456/approvals'):
            value = [{'state':'approved','user':{'id':ca.OWNER_ID},'environments':[{'id':71,'name':ca.ENVIRONMENT}]}]
        elif path.endswith('/actions/runs/100'):
            value = {'id':100,'workflow_id':55,'repository':{'id':ca.REPO_ID},'head_sha':'c'*40,
                'path':'.github/workflows/pr-ci.yml','run_attempt':1,'status':'completed','conclusion':'success'}
        elif '/actions/runs/100/attempts/1/jobs?' in path:
            value = {'total_count':len(ca.REQUIRED_JOBS),'jobs':[{'id':n+1,'name':name,'run_id':100,
                'head_sha':'c'*40,'status':'completed','conclusion':'success'} for n,name in enumerate(ca.REQUIRED_JOBS)]}
        elif path == '/users/planner77/packages/container/layoutmanager':
            value = {'id':ca.PACKAGE_ID,'name':'layoutmanager','package_type':'container','visibility':'private',
                'owner':{'id':ca.OWNER_ID},'repository':{'id':ca.REPO_ID}}
        elif path.endswith('/actions/workflows/355693716'):
            value = {'id':355693716,'path':'.github/workflows/docker-publish.yml','state':'disabled_manually'}
        elif '/actions/workflows/355693716/runs?' in path: value = {'total_count':1,'workflow_runs':[{'id':9,'status':'completed'}]}
        elif '/actions/runs/123/artifacts?' in path: value = {'total_count':1,'artifacts':[self.artifact()]}
        elif path.endswith('/actions/artifacts/72'): value = self.artifact()
        else: raise AssertionError('Unexpected synthetic API route: '+path)
        if self.change: self.change(path,value)
        return value
    def artifact(self):
        art = self.p['candidate']['artifact']
        return {'id':art['id'],'name':art['name'],'size_in_bytes':art['size'],'digest':art['digest'],
            'expired':False,'workflow_run':{'id':123,'repository_id':ca.REPO_ID,'head_sha':cf.SOURCE}}


class HTTP:
    def __init__(self, journal):
        self.journal=journal; self.manifests={};self.blobs={};self.calls=[];self.change=None;self.put_count=0
    def request(self, method, url, headers=None, data=None, destination=None, limit=2*1024*1024):
        self.calls.append((method,url,headers or {},data))
        path=urllib.parse.urlsplit(url).path
        if self.change:
            value=self.change(method,path,data)
            if value is not None:return value
        if path=='/v2/':return cf.result(401,headers={'www-authenticate':'Bearer realm="https://ghcr.io/token",service="ghcr.io"'})
        if path=='/token':return cf.result(raw=b'{"token":"synthetic-only-bearer"}')
        reference=path.rsplit('/',1)[1]
        if method=='HEAD':
            raw=self.blobs.get(reference)
            return cf.result(404) if raw is None else cf.result(headers={'docker-content-digest':reference,'content-length':str(len(raw))})
        if method=='PUT':
            events=[json.loads(line) for line in self.journal.read_bytes().splitlines()]
            assert events[-1]['event']=='PUT_INTENT'
            assert events[-1]['digest']==rt.raw_digest(data)
            assert reference in rt.FINALS.values()
            self.put_count+=1;media=headers['Content-Type'];self.manifests[reference]=(data,media)
            self.manifests[rt.raw_digest(data)]=(data,media)
            return cf.result(201,headers={'docker-content-digest':rt.raw_digest(data)})
        assert method=='GET'
        if '/blobs/' in path:
            raw=self.blobs[reference]
            if destination is not None:Path(destination).write_bytes(raw)
            return cf.result(raw=raw)
        if reference not in self.manifests:return cf.result(404,b'{"errors":[{"code":"MANIFEST_UNKNOWN"}]}')
        raw,media=self.manifests[reference]
        return cf.result(raw=raw,headers={'docker-content-digest':rt.raw_digest(raw),'content-type':media})


@contextmanager
def fixture(index=False):
    with tempfile.TemporaryDirectory() as temp:
        root=Path(temp); original=root/'original'; original.mkdir();downloaded=root/'input';downloaded.mkdir()
        _,graphs=cf.fixture(original,index)
        receipt=candidate.orchestrate(cf.packet(),cf.expected(),cf.API(),b'',cf.FakeRunner(graphs),cf.MemoryJournal(),cf.Store)
        (downloaded/'candidate-receipt.json').write_bytes(ca.canonical(receipt));(downloaded/'candidate-bundle.sigstore.json').write_bytes(b'{"synthetic":true}')
        candidate.checksums(original,downloaded,cf.expected())
        mapping={r:graphs[r]['digest'][7:] for r in ca.ROLES};mapping['receipt']=ca.sha((downloaded/'candidate-receipt.json').read_bytes())
        response=rf.verified_result(mapping);value=response[0]['verificationResult']
        value['signature']['certificate']['buildSignerURI']=ca.SIGNER_URI
        for subject,role in zip(value['statement']['subject'],(*ca.ROLES,'receipt')):subject['name']=ca.SUBJECTS[role]
        gh=root/'gh';gh.write_bytes(b'synthetic never-executed CLI')
        def cli(args,timeout=120):return b'gh version 2.103.3 synthetic' if args[-1]=='--version' else ca.canonical(response)
        def probe(args,**kwargs):
            stderr='Error: verifying with issuer "sigstore.dev"'
            if args[args.index('--source-digest')+1]=='0'*40:stderr='expected SourceRepositoryDigest to be '+'0'*40+', got '+cf.SOURCE
            elif args[args.index('--signer-digest')+1]=='0'*40:stderr='expected BuildSignerDigest to be '+'0'*40+', got '+cf.SOURCE
            elif args[args.index('--source-ref')+1]=='refs/heads/wrong':stderr='expected SourceRepositoryRef to be refs/heads/wrong, got refs/heads/main'
            return subprocess.CompletedProcess(args,1,'',stderr)
        candidate.verify(original,downloaded,cf.expected(),str(gh),cli,probe)
        packet=p.template(); packet.update({'nonce':'1'*16,'promotion':{'sourceCommit':B,'sourceTree':BTREE,'workflowCommit':B,
            'requiredCi':dict(cf.packet()['requiredCi'],treeSha=BTREE)},'environmentId':71,
            'environmentConfigSha256':cf.packet()['environmentConfigSha256'],
            'controls':dict(cf.packet()['controls'],actionsGrants='INCLUDED_IN_OWNER_REVIEWED_WRITER_INVENTORY'),
            'rollbackBaseline':{'receiptSha256':'e'*64,'sourceCommit':'f'*40,'appDigest':'sha256:'+'1'*64,
                'migratorDigest':'sha256:'+'2'*64,'automaticRollback':False},
            'roles':{role:{**graphs[role]['topDescriptor'],'configDigest':graphs[role]['configDigest'],
                'platformManifestDigest':graphs[role]['manifestDigest']} for role in ca.ROLES}})
        packet['candidate']={k:receipt[k] for k in ('sourceCommit','sourceTree','workflowCommit','runId','runAttempt','packetSha256')}
        packet['candidate']['artifact']={'id':72,'name':'issue225-candidate-proof-123-1','digest':'sha256:'+'7'*64,'size':1234,
            'files':{name:ca.sha((downloaded/name).read_bytes()) for name in p.FILES}}
        expected={'sourceCommit':B,'sourceTree':BTREE,'workflowCommit':B,'runId':'456','runAttempt':'1','packetSha256':ca.sha(ca.canonical(packet))}
        private=root/'private';private.mkdir();public=root/'public';public.mkdir()
        http=HTTP(private/'promotion-journal.jsonl')
        for role in ca.ROLES:
            for digest,obj in graphs[role]['objects'].items():
                raw=Path(obj['path']).read_bytes()
                if obj['kind']=='blob':http.blobs[digest]=raw
                else:http.manifests[digest]=(raw,obj['mediaType'])
            http.manifests[ca.tags(packet['candidate'])[role]]=http.manifests[graphs[role]['digest']]
        api=API(packet)
        reader=lambda:release.ReadRegistry('synthetic-only-job-token','planner77',packet['candidate'],http)
        def verifier(reader,packet,downloaded,private,gh,token):
            return release.verify_material(reader,packet,downloaded,private,gh,token,
                lambda private,public,expected,gh,*_:candidate.verify(private,public,expected,gh,cli,probe))
        yield dict(root=root,p=packet,expected=expected,downloaded=downloaded,private=private,public=public,http=http,
            api=api,reader=reader,verify=verifier,gh=str(gh),response=response)


def perform(f):
    return release.perform(f['p'],f['expected'],f['api'],b'',f['downloaded'],f['private'],f['gh'],
        'synthetic-only-job-token',f['reader'],f['verify'])


class Promotion(unittest.TestCase):
    def test_default_plan_and_template_never_http_credentials(self):
        with patch.object(release,'API',side_effect=AssertionError('HTTP')),patch.dict(os.environ,{},clear=True):
            release.main([])
            self.assertEqual(p.plan(p.template())['state'],'NOT_READY')

    def test_packet_builder_and_explicit_a_b_sources(self):
        with fixture() as f:
            raw=ca.canonical(f['p']);self.assertEqual(p.packet(raw,ca.sha(raw)),f['p'])
            self.assertNotEqual(f['p']['candidate']['sourceCommit'],f['p']['promotion']['sourceCommit'])
            inputs={'artifactDirectory':str(f['downloaded']),'artifactMetadata':{k:v for k,v in f['p']['candidate']['artifact'].items() if k!='files'},
                **{k:f['p'][k] for k in ('roles','promotion','controls','rollbackBaseline','nonce')},
                'environment':{k:f['p'][k] for k in ('environmentId','environmentConfigSha256','environmentUiObservationSha256')}}
            self.assertEqual(release.build(inputs),f['p'])
            for change in (lambda v:v['controls'].__setitem__('actionsGrants','UNKNOWN'),lambda v:v.__setitem__('ownerApproved',True),
                lambda v:v.__setitem__('package','ghcr.io/other/package'),lambda v:v['candidate'].__setitem__('runAttempt','2'),
                lambda v:v['promotion'].__setitem__('workflowCommit',cf.SOURCE),lambda v:v['roles'].pop('cpu-worker')):
                value=copy.deepcopy(f['p']);change(value);self.assertEqual(p.plan(value)['state'],'NOT_READY')

    def test_actual_guard_requires_fresh_owner_main_b_and_clean_tree(self):
        with fixture() as f:
            env=dict(cf.context(),GITHUB_SHA=B,GITHUB_WORKFLOW_SHA=B,GITHUB_RUN_ID='456',
                GITHUB_WORKFLOW_REF=ca.REPO+'/'+p.WORKFLOW+'@refs/heads/main',RC_PACKET_SHA256=f['expected']['packetSha256'])
            git=lambda *args:'' if args[0]=='status' else BTREE if args[-1]=='HEAD^{tree}' else B
            self.assertEqual(p.guard(f['p'],f['expected']['packetSha256'],env,git),f['expected'])
            for key,value in (('GITHUB_ACTOR_ID','1'),('GITHUB_RUN_ATTEMPT','2'),('GITHUB_RUN_ID','123'),
                ('GITHUB_SHA',cf.SOURCE),('GITHUB_WORKFLOW_REF',ca.SIGNER+'@refs/heads/main'),('GITHUB_REF','refs/tags/v0.61.0')):
                with self.subTest(key=key),self.assertRaises(ca.Pending):p.guard(f['p'],f['expected']['packetSha256'],dict(env,**{key:value}),git)

    def test_all_absent_real_adapter_full_graph_crypto_seam_and_identical_raw(self):
        for index in (False,True):
            with self.subTest(index=index),fixture(index) as f:
                originals={r:f['http'].manifests[ca.tags(f['p']['candidate'])[r]] for r in ca.ROLES}
                result=perform(f);self.assertEqual(result['state'],'COMPLETE');self.assertEqual(f['http'].put_count,3)
                for role in ca.ROLES:self.assertEqual(f['http'].manifests[rt.FINALS[role]],originals[role])
                release.progress(f['private'],f['public'],f['expected'],f['p'])
                receipt=json.loads((f['public']/'operation-receipt.json').read_bytes())
                self.assertEqual(receipt['candidateSourceA'],cf.SOURCE);self.assertEqual(receipt['promotionCodeSourceB'],B)
                self.assertFalse(receipt['freshReview']['independentSecondHuman'])

    def test_all_exact_no_op_still_verifies_graph_and_full_final_set(self):
        with fixture() as f:
            for role in ca.ROLES:f['http'].manifests[rt.FINALS[role]]=f['http'].manifests[ca.tags(f['p']['candidate'])[role]]
            verify=Mock(wraps=f['verify']);f['verify']=verify
            self.assertEqual(perform(f)['state'],'NO_OP');self.assertEqual(f['http'].put_count,0);verify.assert_called_once()
            self.assertGreaterEqual(sum(method=='GET' and url.endswith('/0.61.0') for method,url,*_ in f['http'].calls),3)

    def test_partial_missing_worker_or_unknown_final_halts_zero_write(self):
        for mode in ('partial','unknown'):
            with self.subTest(mode=mode),fixture() as f:
                if mode=='partial':f['http'].manifests['0.61.0']=f['http'].manifests[ca.tags(f['p']['candidate'])['app']]
                else:f['http'].change=lambda method,path,data:cf.result(404,b'{}') if path.endswith('/0.61.0-cpu-worker') else None
                with self.assertRaises(ca.Pending):perform(f)
                self.assertEqual(f['http'].put_count,0)

    def test_wrong_candidate_artifact_and_missing_current_review_never_construct_registry(self):
        changes=[lambda path,v:v.__setitem__('path',p.WORKFLOW) if path.endswith('/runs/123/attempts/1') else None,
            lambda path,v:v.__setitem__('conclusion','failure') if path.endswith('/runs/123/attempts/1') else None,
            lambda path,v:v.__setitem__('digest','sha256:'+'0'*64) if path.endswith('/artifacts/72') else None,
            lambda path,v:v.__setitem__('expired',True) if path.endswith('/artifacts/72') else None,
            lambda path,v:v.clear() if path.endswith('/approvals') else None,
            lambda path,v:v[0]['user'].__setitem__('id',1) if path.endswith('/approvals') else None,
            lambda path,v:v.__setitem__('state','active') if path.endswith('/workflows/355693716') else None,
            lambda path,v:v['workflow_runs'][0].__setitem__('status','waiting') if '/workflows/355693716/runs?' in path else None,
            lambda path,v:v.__setitem__('can_admins_bypass',True) if '/environments/' in path and 'policies?' not in path else None,
            lambda path,v:v.__setitem__('display_title',ca.title(f['p']['candidate']['packetSha256'])) if path.endswith('/runs/456/attempts/1') else None]
        for index,change in enumerate(changes):
            with self.subTest(index=index),fixture() as f:
                f['api'].change=change;factory=Mock(side_effect=AssertionError('registry authority bypass'));f['reader']=factory
                with self.assertRaises(ca.Pending):perform(f)
                factory.assert_not_called();self.assertEqual(f['http'].put_count,0)

    def test_artifact_changed_extra_symlink_or_wrong_receipt_rejected_before_registry(self):
        for mode in ('hash','extra','symlink','receipt'):
            with self.subTest(mode=mode),fixture() as f:
                target=f['downloaded']/'candidate-receipt.json'
                if mode=='hash':target.write_bytes(target.read_bytes()+b' ')
                elif mode=='extra':(f['downloaded']/'raw-secret.json').write_text('synthetic secret')
                elif mode=='symlink':target.unlink();target.symlink_to(f['root']/'gh')
                else:
                    value=json.loads(target.read_bytes());value['sourceCommit']=B;target.write_bytes(ca.canonical(value))
                    f['p']['candidate']['artifact']['files'][target.name]=ca.sha(target.read_bytes())
                    f['expected']['packetSha256']=ca.sha(ca.canonical(f['p']))
                factory=Mock(side_effect=AssertionError('registry constructed'));f['reader']=factory
                with self.assertRaises(ca.Pending):perform(f)
                factory.assert_not_called()

    def test_bad_graph_config_layer_or_crypto_fails_before_first_put(self):
        for mode in ('config','layer','worker','signature','rp-signer','download-metadata'):
            with self.subTest(mode=mode),fixture() as f:
                if mode=='config':
                    digest=f['p']['roles']['app']['configDigest'];f['http'].blobs[digest]+=b'changed'
                elif mode=='layer':f['http'].blobs.pop(next(d for d in f['http'].blobs if d!=f['p']['roles']['app']['configDigest']))
                elif mode=='worker':f['http'].manifests.pop(ca.tags(f['p']['candidate'])['cpu-worker'])
                elif mode=='rp-signer':f['response'][0]['verificationResult']['signature']['certificate']['buildSignerURI']=rf.RP.SIGNER_URI
                elif mode=='signature':f['response'][0]['verificationResult']['signature']['certificate']['sourceRepositoryIdentifier']='212613049'
                else:
                    path=f['downloaded']/'verification.json';v=json.loads(path.read_bytes());v['leak']='synthetic secret';path.write_bytes(ca.canonical(v))
                    f['p']['candidate']['artifact']['files'][path.name]=ca.sha(path.read_bytes())
                    f['expected']['packetSha256']=ca.sha(ca.canonical(f['p']))
                with self.assertRaises((ca.Pending,KeyError)):perform(f)
                self.assertEqual(f['http'].put_count,0)

    def test_ambiguous_put_or_rewrite_never_subsequent_write_and_preserves_progress(self):
        for mode in ('timeout','rewrite'):
            with self.subTest(mode=mode),fixture() as f:
                def change(method,path,data):
                    if method!='PUT':return None
                    if mode=='timeout':raise ca.Pending('SYNTHETIC_AMBIGUOUS')
                    f['http'].put_count+=1;f['http'].manifests[path.rsplit('/',1)[1]]=(data+b' ',rt.OCI_MANIFEST)
                    return cf.result(201,headers={'docker-content-digest':rt.raw_digest(data)})
                f['http'].change=change
                result=perform(f);self.assertEqual(result['state'],'UNCERTAIN')
                self.assertEqual(len([v for v in f['http'].calls if v[0]=='PUT']),1)
                release.progress(f['private'],f['public'],f['expected'],f['p'])
                progress=json.loads((f['public']/'progress.json').read_bytes());self.assertEqual(progress['state'],'UNCERTAIN')
                self.assertFalse((f['public']/'operation-receipt.json').exists())

    def test_intent_fsync_failure_prevents_any_put_and_exclusive_attempt_blocks_resume(self):
        with fixture() as f:
            original=release.Journal.append
            def fail(self,event):
                if event['event']=='PUT_INTENT':raise OSError('synthetic fsync failure')
                return original(self,event)
            with patch.object(release.Journal,'append',fail):result=perform(f)
            self.assertEqual(result['state'],'HALT');self.assertEqual(f['http'].put_count,0)
            with self.assertRaises(FileExistsError):release.Journal(f['private']/'promotion-journal.jsonl',f['p'],f['expected'])

    def test_concurrent_target_appearance_and_no_op_change_never_overwrite(self):
        for mode in ('preflight','after-first','no-op'):
            with self.subTest(mode=mode),fixture() as f:
                if mode=='no-op':
                    for role in ca.ROLES:f['http'].manifests[rt.FINALS[role]]=f['http'].manifests[ca.tags(f['p']['candidate'])[role]]
                original=f['verify']
                def verify(*args):
                    result=original(*args)
                    if mode in ('preflight','no-op'):f['http'].manifests['0.61.0']=(b'foreign',rt.OCI_MANIFEST)
                    return result
                f['verify']=verify
                if mode=='after-first':
                    def change(method,path,data):
                        if method=='GET' and path.endswith('/0.61.0') and f['http'].put_count:
                            f['http'].manifests['0.61.0-migrate']=(b'foreign',rt.OCI_MANIFEST)
                    f['http'].change=change
                result=perform(f)
                self.assertIn(result['state'],('HALT','PARTIAL_RELEASE'));self.assertLessEqual(f['http'].put_count,1)

    def test_no_op_changed_during_last_kernel_read_is_caught_by_final_readback(self):
        with fixture() as f:
            for role in ca.ROLES:f['http'].manifests[rt.FINALS[role]]=f['http'].manifests[ca.tags(f['p']['candidate'])[role]]
            reads=[]
            def change(method,path,data):
                if method=='GET' and path.endswith('/0.61.0-cpu-worker'):
                    reads.append(path)
                    if len(reads)==2:f['http'].manifests['0.61.0']=(b'foreign',rt.OCI_MANIFEST)
            f['http'].change=change
            with self.assertRaisesRegex(ca.Pending,'RC_NO_OP_FINAL_SET_CHANGED'):perform(f)
            self.assertEqual(f['http'].put_count,0)

    def test_sanitized_progress_never_copies_unknown_success_receipt_payload(self):
        with fixture() as f:
            self.assertEqual(perform(f)['state'],'COMPLETE')
            path=f['private']/'operation-receipt.json';value=json.loads(path.read_bytes());value['token']='synthetic secret'
            path.write_bytes(ca.canonical(value))
            with self.assertRaises(ca.Pending):release.progress(f['private'],f['public'],f['expected'],f['p'])
            self.assertFalse((f['public']/'operation-receipt.json').exists())
            self.assertNotIn('synthetic secret',(f['public']/'progress.json').read_text())

    def test_narrow_adapter_rejects_upload_other_package_digest_put_and_without_intent(self):
        with fixture() as f:
            reader=f['reader']();journal=release.Journal(f['private']/'promotion-journal.jsonl',f['p'],f['expected'])
            try:
                transport=release.Transport(reader,f['p'],journal);raw=next(iter(f['http'].manifests.values()))[0]
                for reference in ('latest','0.60.0','candidate-other','sha256:'+'a'*64):
                    with self.assertRaises(ca.Pending):transport.put_manifest(ca.PACKAGE,reference,raw,rt.OCI_MANIFEST)
                with self.assertRaises(ca.Pending):transport.put_manifest('ghcr.io/other/pkg','0.61.0',raw,rt.OCI_MANIFEST)
                for method,path in (('POST',cr.PREFIX+'/blobs/uploads/'),('PUT',cr.PREFIX+'/manifests/0.61.0')):
                    with self.assertRaises(ca.Pending):reader.request(method,path,data=raw)
                self.assertEqual(f['http'].put_count,0)
            finally:journal.close()

    def test_isolated_cli_and_git_never_inherit_host_credential_keys(self):
        with patch.dict(os.environ,{key:'synthetic' for key in ('CA_JOB_TOKEN','RC_JOB_TOKEN','GH_TOKEN','GITHUB_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','ACTIONS_RUNTIME_TOKEN')}),\
             patch.object(candidate,'command',return_value=b'') as command:
            release.git('status','--porcelain')
            self.assertEqual(set(command.call_args.kwargs['env']),{'PATH'})

    def test_real_cli_callbacks_expose_only_explicit_builtin_token_in_isolated_env(self):
        with fixture() as f:
            def inspect(private,public,expected,gh,cli,probe):
                with patch.object(release.subprocess,'run',return_value=subprocess.CompletedProcess([],0,b'{}',b'')) as run:
                    cli([gh,'attestation','verify','synthetic-only'])
                    probe([gh,'attestation','verify','synthetic-negative'],capture_output=True,text=True)
                    for call in run.call_args_list:
                        env=call.kwargs['env']
                        self.assertEqual(set(env),{'PATH','GH_TOKEN','GH_CONFIG_DIR'})
                        self.assertEqual(env['GH_TOKEN'],'synthetic-only-job-token')
                        self.assertEqual(env['GH_CONFIG_DIR'],str(f['private']/'gh-config'))
                raise ca.Pending('SYNTHETIC_STOP_WITHOUT_CRYPTO_WITNESS')
            reader=f['reader']()
            keys=('CA_JOB_TOKEN','RC_JOB_TOKEN','GH_TOKEN','GITHUB_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','ACTIONS_RUNTIME_TOKEN')
            with patch.dict(os.environ,dict.fromkeys(keys,'synthetic host token')):
                with self.assertRaisesRegex(ca.Pending,'SYNTHETIC_STOP_WITHOUT_CRYPTO_WITNESS'):
                    release.verify_material(reader,f['p'],f['downloaded'],f['private'],f['gh'],'synthetic-only-job-token',inspect)
            self.assertEqual(f['http'].put_count,0)

    def test_workflow_fixed_permissions_actions_and_each_job_initialization(self):
        # Dependency-free regression; official actionlint and YAML parsing are
        # separate source checks, not an assumed pip install in the scope job.
        text=(release.ROOT/'.github/workflows/release-promote.yml').read_text()
        self.assertIn('permissions: {}',text);self.assertIn('cancel-in-progress: false',text)
        job=text.split('  promote:\n',1)[1]
        self.assertIn('environment: '+ca.ENVIRONMENT,job);self.assertIn('timeout-minutes: 45',job)
        permissions=job.split('    permissions:\n',1)[1].split('    env:\n',1)[0]
        self.assertEqual([line.strip() for line in permissions.splitlines()],['contents: read','actions: read','attestations: read','packages: write'])
        self.assertNotIn('RC_JOB_TOKEN',job.split('    env:\n',1)[1].split('    steps:\n',1)[0])
        self.assertEqual(text.count('run: python3 src/tests/oci/release_promote.py init'),2)
        self.assertIn('uses: '+release.DOWNLOAD_ACTION,text)
        self.assertIn('artifact-ids: ${{ steps.metadata.outputs.artifact_id }}',text)
        self.assertEqual(text.count('      attestations: read\n'),1)
        self.assertNotIn('attestations:',text.split('  promote:\n',1)[0])
        for denied in ('id-token:','attestations: write','docker/build','docker/login','gh workflow run','--retry'):
            self.assertNotIn(denied,text)


if __name__=='__main__':unittest.main()
