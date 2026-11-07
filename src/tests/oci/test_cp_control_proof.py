#!/usr/bin/env python3
"""Synthetic CP contract tests; no GitHub calls or policy proof claims."""
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import unittest.mock

SPEC=importlib.util.spec_from_file_location('cp',Path(__file__).with_name('cp-control-proof.py'))
CP=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(CP)
A='a'*40;B='b'*40;NONCE='0123456789abcdef'

def sample():
    prefix='issue225-control-'+NONCE+'-'
    cap='refs/heads/'+prefix+'cap'; target='refs/heads/'+prefix+'target'
    tagcap='refs/tags/'+prefix+'cap'; tag='refs/tags/'+prefix+'target'
    def c(id,phase,op,ref,before,after,rule=None):
        return {'id':id,'actor':'owner','phase':phase,'operation':op,'ref':ref,
                'beforeSha':before,'afterSha':after,'expectedRule':rule}
    cases=[c('branch-create','capability','create',cap,None,A),
           c('branch-update','capability','update',cap,A,B),
           c('branch-delete','capability','delete',cap,B,None),
           c('tag-create','capability','create',tagcap,None,A),
           c('tag-update','capability','update',tagcap,A,B),
           c('tag-delete','capability','delete',tagcap,B,None),
           c('deny-update','denial','update',target,A,B,'pull_request'),
           c('deny-tag-delete','denial','delete',tag,A,None,'deletion')]
    folder=Path('src/deploy/release-control')
    payloads=[{'name':name,'sha256':hashlib.sha256((folder/name).read_bytes()).hexdigest()}
              for name in sorted(CP.POLICY_FILES)]
    packet={'schemaVersion':1,'repository':CP.REPO,'repositoryId':CP.REPO_ID,
            'ownerId':CP.OWNER_ID,'sourceCommit':A,'workflowCommit':A,
            'workflowPath':CP.WORKFLOW,'nonce':NONCE,'policyPayloads':payloads,
            'policySnapshotSha256':'1'*64,
            'refs':[{'name':x,'initialSha':v} for x,v in
                    ((cap,None),(target,A),(tagcap,None),(tag,A))], 'cases':cases}
    raw=CP.canonical(packet); return packet,hashlib.sha256(raw).hexdigest()

def row(case, state, status, after):
    method,path,_=CP.case_route(case)
    now='2026-11-06T00:00:00+00:00'
    return {'caseId':case['id'],'caseSha256':hashlib.sha256(CP.canonical(case)).hexdigest(),
            'method':method,'path':path,'status':status,'requestId':'REQ-1',
            'beforeSha':case['beforeSha'],'afterSha':after,'startedUTC':now,
            'endedUTC':now,'state':state}

class Fake:
    def __init__(self, data): self.data=data;self.calls=[]
    def request(self,method,path,body=None):
        self.calls.append((method,path,body))
        if method!='GET' or path not in self.data: raise AssertionError(path)
        return 200,self.data[path],'REQ-READ'

# These literals reproduce sanitized, independently observed GitHub GET rule
# shapes on 2026-11-07; they are intentionally NOT generated from the
# proposed policy JSON or implementation normalization.
REAL_MAIN_RULES = [
    {'type':'deletion'},
    {'type':'non_fast_forward'},
    {'type':'pull_request','parameters':{
        'required_approving_review_count':0,
        'dismiss_stale_reviews_on_push':True,
        'required_reviewers':[],
        'require_code_owner_review':False,
        'require_last_push_approval':False,
        'required_review_thread_resolution':True,
        'require_extra_approval_for_unattributed_changes':False,
        'allowed_merge_methods':['squash']}},
    {'type':'required_status_checks','parameters':{
        'strict_required_status_checks_policy':True,
        'do_not_enforce_on_create':False,
        'required_status_checks':[{
            'context':'Typecheck, lint, test, build, E2E',
            'integration_id':15368}]}}
]
REAL_TAG_RULES = [
    {'type':'deletion'}, {'type':'creation'}, {'type':'update'}
]


def observed_ruleset(planned, identifier):
    # The initial control-ref scope has not been applied. Only the conditions
    # are substituted in this isolated future-policy fixture, not API rules.
    return {'id':identifier, 'name':planned['name'], 'target':planned['target'],
            'source':'planner77/layoutManager', 'source_type':'Repository',
            'current_user_can_bypass':'never',
            'enforcement':'active','bypass_actors':[],
            'conditions':planned['conditions'],
            'rules':json.loads(json.dumps(
                REAL_MAIN_RULES if planned['target']=='branch' else REAL_TAG_RULES))}


class ReaderFake:
    """Independent Reader transport; does not allow any mutation."""
    def __init__(self, routes):
        self.routes=routes;self.calls=[]
    def request(self, method, path, body=None):
        self.calls.append((method,path,body))
        if method!='GET' or body is not None or path not in self.routes:
            raise AssertionError('unexpected read route or mutation')
        status, payload = self.routes[path]
        return status,payload,'REQ-READ'


class CPContracts(unittest.TestCase):
    def test_actual_initializer_and_exact_compare_transport(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); envfile=root/'github.env';envfile.touch()
            result=subprocess.run(['bash','src/tests/oci/cp-init-paths.sh'],
                                  env={**os.environ,'RUNNER_TEMP':directory,
                                       'GITHUB_ENV':str(envfile)},capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(envfile.read_text().splitlines(),[
                'CP_PACKET_PATH='+directory+'/issue225-cp-packet.json',
                'CP_RESULT_PATH='+directory+'/issue225-cp-observations.json'])
        packet,_=sample()
        merge={**packet['cases'][-2],'id':'deny-merge','operation':'merge',
               'expectedRule':'required_status_checks','pullRequest':42,
               'headRef':packet['refs'][0]['name']}
        packet['cases'].append(merge)
        path=CP.BASE+'/compare/'+A+'...'+B
        class Response:
            status=200
            headers={}
            def read(self,n):return b'{}'
            def __enter__(self):return self
            def __exit__(self,*args):pass
        class Opener:
            def __init__(self):self.calls=[]
            def open(self,request,timeout):
                self.calls.append(request.full_url);return Response()
        api=CP.GitHub('dummy',packet)
        api.opener=Opener()
        self.assertEqual(api.request('GET',path)[0],200)
        self.assertEqual(len(api.opener.calls),1)
        for bad in (CP.BASE+'/compare/'+A+'../'+B,
                    CP.BASE+'/git/ref/heads/../main',
                    CP.BASE+'/compare/'+A+'...'+('c'*40)):
            with self.assertRaises(CP.RefProofError):api.request('GET',bad)
        self.assertEqual(len(api.opener.calls),1)

    def test_unsafe_final_delta_and_packet_hash_fail_closed(self):
        packet,h=sample()
        with self.assertRaises(CP.RefProofError):CP.validate_packet(CP.canonical(packet),'0'*64)
        folder=Path('src/deploy/release-control')
        initial=json.loads((folder/'issue225-main-source.ruleset.json').read_text())
        final=json.loads((folder/'issue225-main-source.final.ruleset.json').read_text())
        CP.validate_final_delta(initial,final)
        for bad in ({**final,'enforcement':'disabled'},
                    {**final,'bypass_actors':[{'actor_id':CP.OWNER_ID}]},
                    {**final,'conditions':{'ref_name':{'include':[], 'exclude':[]}}}):
            with self.assertRaises(CP.RefProofError):CP.validate_final_delta(initial,bad)

    def test_packet_families_and_lower_level_write_allowlist(self):
        packet,hashvalue=sample()
        self.assertEqual(CP.validate_packet(CP.canonical(packet),hashvalue),packet)
        case=packet['cases'][-2]
        api=CP.GitHub('dummy',packet,[case])
        method,path,body=CP.case_route(case)
        with self.assertRaises(CP.RefProofError):api.request(method,path,{**body,'force':True})
        with self.assertRaises(CP.RefProofError):api.request('DELETE',CP.BASE+'/git/refs/heads/main')
        with self.assertRaises(CP.RefProofError):api.request('POST',CP.BASE+'/rulesets',{})
        with self.assertRaises(CP.RefProofError):api.request('GET',CP.BASE+'/git/ref/heads/main')
        self.assertTrue(CP.read_route(packet,CP.BASE+'/git/ref/'+case['ref'][5:]))
        changed=json.loads(json.dumps(packet))
        changed['cases']=[c for c in changed['cases'] if not c['id'].startswith('tag-')]
        with self.assertRaises(CP.RefProofError):
            CP.validate_packet(CP.canonical(changed),hashlib.sha256(CP.canonical(changed)).hexdigest())
        tag_update={**packet['cases'][-1], 'id':'deny-tag-update',
                    'operation':'update','afterSha':B,'expectedRule':'update'}
        tag_packet=json.loads(json.dumps(packet));tag_packet['cases'].append(tag_update)
        self.assertEqual(CP.validate_packet(CP.canonical(tag_packet),
            hashlib.sha256(CP.canonical(tag_packet)).hexdigest()),tag_packet)
        tag_policy=json.loads(Path('src/deploy/release-control/issue231-tag-hold.ruleset.json').read_text())
        self.assertIn('update',[rule['type'] for rule in tag_policy['rules']])
        self.assertEqual(CP.validated_live_ruleset(Fake({
            CP.BASE+'/rulesets/9':observed_ruleset(tag_policy,9)
        }),tag_packet,9,tag_update)['id'],9)
        tag_packet['cases'][-1]['expectedRule']='pull_request'
        with self.assertRaises(CP.RefProofError):
            CP.validate_packet(CP.canonical(tag_packet),
                               hashlib.sha256(CP.canonical(tag_packet)).hexdigest())
        tag_packet['cases'][-1]['expectedRule']='update'
        tag_packet['cases'][-1]['operation']='merge'
        with self.assertRaises(CP.RefProofError):
            CP.validate_packet(CP.canonical(tag_packet),
                               hashlib.sha256(CP.canonical(tag_packet)).hexdigest())

    def test_capability_lineage_requires_same_packet_source_actor_and_family(self):
        packet,h=sample()
        capcases=[c for c in packet['cases'] if c['phase']=='capability']
        cap={'kind':'ISSUE225_CONTROL_OBSERVATIONS','packetSha256':h,
             'sourceCommit':A,'actorMode':'owner','phase':'capability',
             'result':'OBSERVATIONS_ONLY_PENDING_INDEPENDENT_RULE_VERIFICATION',
             'context':{'mode':'owner','credentialPath':'CP_GITHUB_TOKEN',
                        'refOperationActor':'NOT_VERIFIED'},
             'cases':[row(c,'CAPABILITY_OBSERVED',201 if c['operation']=='create' else 200,
                          c['afterSha']) for c in capcases]}
        self.assertEqual(CP.validate_capability_receipt(packet,h,'owner',cap,{'heads','tags'}),
                         cap['context'])
        for field,value in [('packetSha256','0'*64),('sourceCommit',B),('actorMode','actions')]:
            bad=json.loads(json.dumps(cap));bad[field]=value
            with self.assertRaises(CP.RefProofError):
                CP.validate_capability_receipt(packet,h,'owner',bad,{'heads'})
        bad=json.loads(json.dumps(cap));bad['cases']=[r for r in bad['cases']
                                                   if not r['caseId'].startswith('tag-')]
        with self.assertRaises(CP.RefProofError):
            CP.validate_capability_receipt(packet,h,'owner',bad,{'heads','tags'})
        bad=json.loads(json.dumps(cap));bad['cases'][1]['startedUTC']='malformed'
        with self.assertRaises(CP.RefProofError):
            CP.validate_capability_receipt(packet,h,'owner',bad,{'heads'})
        bad=json.loads(json.dumps(cap));bad['cases'][0]['endedUTC']='2026-11-07T00:00:00Z'
        with self.assertRaises(CP.RefProofError):
            CP.validate_capability_receipt(packet,h,'owner',bad,{'heads'})
        CP.require_capability_before_denial(cap['cases'],[
            {'startedUTC':'2026-11-06T00:01:00Z'}])
        with self.assertRaises(CP.RefProofError):
            CP.require_capability_before_denial(cap['cases'],[
                {'startedUTC':'2026-11-05T23:59:59Z'}])

    def test_independent_suite_requires_exact_rule_actor_time_and_unchanged_ref(self):
        packet,_=sample();case=packet['cases'][-2]
        planned=json.loads(Path('src/deploy/release-control/issue225-main-source.ruleset.json').read_text())
        stamp='2026-11-06T00:00:00Z'
        summary={'id':42,'repository_id':CP.REPO_ID,'ref':case['ref'],
                 'before_sha':A,'after_sha':B,'actor_id':CP.OWNER_ID,
                 'actor_name':'planner77','pushed_at':stamp,
                 'evaluation_result':'fail','result':'fail'}
        detail={**summary,'rule_evaluations':[{'rule_type':'pull_request',
            'result':'fail','enforcement':'active',
            'rule_source':{'type':'ruleset','id':7}}]}
        data={CP.BASE+'/git/ref/'+case['ref'][5:]:{'ref':case['ref'],'object':{'sha':A}},
              '/users/planner77':{'id':CP.OWNER_ID,'login':'planner77'},
              CP.BASE+'/rulesets/rule-suites?per_page=100&page=1':[summary],
              CP.BASE+'/rulesets/rule-suites/42?include_metadata=true':detail,
              CP.BASE+'/rulesets/7':observed_ruleset(planned,7)}
        observation=row(case,'PENDING_RULE_EVALUATION',403,A)
        self.assertEqual(CP.verify_denial_case(Fake(data),packet,case,observation,
                                               {'mode':'owner'})['verdict'],'DENIED_BY_POLICY')
        for changed in ({**summary,'actor_id':0},{**summary,'before_sha':B},
                        {**summary,'pushed_at':'2026-11-07T00:00:00Z'}):
            bad=dict(data);bad[CP.BASE+'/rulesets/rule-suites?per_page=100&page=1']=[changed]
            with self.assertRaises(CP.RefProofError):
                CP.verify_denial_case(Fake(bad),packet,case,observation,{'mode':'owner'})
        generic=dict(data);generic[CP.BASE+'/rulesets/rule-suites/42?include_metadata=true']={
            **summary,'rule_evaluations':[{'rule_type':'pull_request','result':'pass',
                'enforcement':'active','rule_source':{'type':'ruleset','id':7}}]}
        with self.assertRaises(CP.RefProofError):
            CP.verify_denial_case(Fake(generic),packet,case,observation,{'mode':'owner'})
        changed_detail=dict(data)
        changed_detail[CP.BASE+'/rulesets/rule-suites/42?include_metadata=true']={
            **detail,'result':'pass'}
        with self.assertRaises(CP.RefProofError):
            CP.verify_denial_case(Fake(changed_detail),packet,case,observation,{'mode':'owner'})
        changed=dict(data);changed[CP.BASE+'/git/ref/'+case['ref'][5:]]={
            'ref':case['ref'],'object':{'sha':B}}
        with self.assertRaises(CP.RefProofError):
            CP.verify_denial_case(Fake(changed),packet,case,observation,{'mode':'owner'})

    def test_actions_run_requires_exact_attempt_source_path_sender(self):
        packet,_=sample();ctx={'runId':42,'runAttempt':2,
                               'credentialPath':'workflow GITHUB_TOKEN',
                               'dispatchSenderId':CP.OWNER_ID}
        path=CP.BASE+'/actions/runs/42/attempts/2'
        run={'id':42,'run_attempt':2,'event':'workflow_dispatch','head_branch':'main',
             'head_sha':A,'path':CP.WORKFLOW,'repository':{'id':CP.REPO_ID},
             'triggering_actor':{'id':CP.OWNER_ID},'status':'completed',
             'conclusion':'success','run_started_at':'2026-11-06T00:00:00Z',
             'updated_at':'2026-11-06T00:03:00Z'}
        self.assertEqual(CP.verify_actions_attempt(Fake({path:run}),packet,ctx),run)
        self.assertEqual(CP.verify_actions_attempt(Fake({path:run}),packet,ctx,
            completed=True,intervals=[('2026-11-06T00:01:00Z','2026-11-06T00:02:00Z')]),run)
        with self.assertRaises(CP.RefProofError):
            CP.verify_actions_attempt(Fake({path:run}),packet,ctx,completed=True,
                intervals=[('2026-11-06T00:04:00Z','2026-11-06T00:05:00Z')])
        with self.assertRaises(CP.RefProofError):
            CP.verify_actions_attempt(Fake({path:{**run,'id':43}}),packet,ctx,completed=True)
        for field,value in [('head_sha',B),('path','.github/workflows/other.yml'),
                            ('run_attempt',1),('event','push')]:
            wrong={**run,field:value}
            with self.assertRaises(CP.RefProofError):
                CP.verify_actions_attempt(Fake({path:wrong}),packet,ctx)

    def test_real_shaped_policy_readbacks_are_bounded_and_fail_closed(self):
        packet,_=sample()
        folder=Path('src/deploy/release-control')
        main=json.loads((folder/'issue225-main-source.ruleset.json').read_text())
        tag=json.loads((folder/'issue231-tag-hold.ruleset.json').read_text())
        for desired,observed in ((main,REAL_MAIN_RULES),(tag,REAL_TAG_RULES)):
            self.assertTrue(CP.validated_rule_readback(desired,observed))
            duplicate=json.loads(json.dumps(observed))
            duplicate.append(json.loads(json.dumps(observed[0])))
            with self.assertRaises(CP.RefProofError):
                CP.validated_rule_readback(desired,duplicate)
            extra=json.loads(json.dumps(observed))
            extra.append({'type':'creation' if desired['target']=='branch' else 'pull_request'})
            with self.assertRaises(CP.RefProofError):
                CP.validated_rule_readback(desired,extra)
        extra_cases=[
            lambda x:x[2]['parameters'].__setitem__('required_reviewers',[{'reviewer':{'id':100,'type':'Team'}}]),
            lambda x:x[2]['parameters'].__setitem__('require_extra_approval_for_unattributed_changes',True),
            lambda x:x[2]['parameters'].pop('required_reviewers'),
            lambda x:x[2]['parameters'].pop('require_extra_approval_for_unattributed_changes'),
            lambda x:x[2]['parameters'].__setitem__('allowed_merge_methods',['merge']),
            lambda x:x[3]['parameters']['required_status_checks'][0].__setitem__('integration_id',0),
            lambda x:x[2]['parameters'].__setitem__('unexpected_security_field',False),
        ]
        for change in extra_cases:
            modified=json.loads(json.dumps(REAL_MAIN_RULES))
            change(modified)
            with self.subTest(change=change.__code__.co_firstlineno):
                with self.assertRaises(CP.RefProofError):
                    CP.validated_rule_readback(main,modified)
        for mutation in (
                {'type':'update','parameters':{'update_allows_fetch_and_merge':True}},
                {'type':'update','parameters':{'unknown':False}},
                {'type':'update','parameters':None},
                {'type':'update','unexpected':False},
                {'type':'update','parameters':{'update_allows_fetch_and_merge':False,'unknown':True}}):
            modified=json.loads(json.dumps(REAL_TAG_RULES));modified[-1]=mutation
            with self.subTest(mutation=mutation):
                with self.assertRaises(CP.RefProofError):
                    CP.validated_rule_readback(tag,modified)
        no_wrapper=json.loads(json.dumps(REAL_TAG_RULES))
        no_wrapper[-1]={'type':'update','parameters':{'update_allows_fetch_and_merge':False}}
        self.assertTrue(CP.validated_rule_readback(tag,no_wrapper))

    def test_exact_live_rule_identity_rejects_bypass_and_scope_drift(self):
        packet,_=sample()
        folder=Path('src/deploy/release-control')
        for policy_name,case in (
                ('issue225-main-source.ruleset.json',packet['cases'][-2]),
                ('issue231-tag-hold.ruleset.json',packet['cases'][-1])):
            planned=json.loads((folder/policy_name).read_text())
            live=observed_ruleset(planned,17)
            self.assertEqual(CP.validated_live_ruleset(Fake({
                CP.BASE+'/rulesets/17':live}),packet,17,case),live)
            changes=[
                lambda v:v.__setitem__('bypass_actors',[{'actor_id':CP.OWNER_ID}]),
                lambda v:v.__setitem__('current_user_can_bypass','always'),
                lambda v:v.__setitem__('source','another/repo'),
                lambda v:v.__setitem__('enforcement','disabled'),
                lambda v:v['conditions']['ref_name'].__setitem__('include',['refs/heads/main']),
                lambda v:v['rules'].append({'type':'required_signatures'}),
            ]
            for change in changes:
                broken=json.loads(json.dumps(live));change(broken)
                with self.subTest(policy=policy_name,change=change.__code__.co_firstlineno):
                    with self.assertRaises(CP.RefProofError):
                        CP.validated_live_ruleset(Fake({
                            CP.BASE+'/rulesets/17':broken}),packet,17,case)

    def test_independent_reader_preflight_rejects_403_missing_and_changed_detail(self):
        repository=CP.BASE
        list_path=CP.BASE+'/rulesets/rule-suites?per_page=100&page=1'
        detail_path=CP.BASE+'/rulesets/rule-suites/47?include_metadata=true'
        summary={'id':47,'repository_id':CP.REPO_ID,
                 'ref':'refs/heads/sandbox','before_sha':A,'after_sha':B,
                 'actor_id':CP.OWNER_ID}
        detail={**summary,'rule_evaluations':[{'rule_type':'deletion','result':'pass'}]}
        base={repository:(200,{'id':CP.REPO_ID,'owner':{'id':CP.OWNER_ID}}),
              list_path:(200,[summary]),detail_path:(200,detail)}
        api=ReaderFake(base)
        self.assertEqual(CP.independent_rule_suite_readiness(api),
                         {'repositoryId':CP.REPO_ID,'sampleSuiteId':47,
                          'listAndDetail':'READABLE','writeAuthorization':'NOT_VERIFIED'})
        self.assertEqual({m for m,_,_ in api.calls},{'GET'})
        for name,edits in [
                ('list403',{list_path:(403,{'message':'Resource not accessible by integration'})}),
                ('listempty',{list_path:(200,[])}),
                ('listshape',{list_path:(200,{'total_count':1})}),
                ('listforeign',{list_path:(200,[{**summary,'repository_id':0}])}),
                ('listbadid',{list_path:(200,[{**summary,'id':False}])}),
                ('detail403',{detail_path:(403,{'message':'Resource not accessible by integration'})}),
                ('detailmissing',{detail_path:(200,{k:v for k,v in detail.items() if k!='rule_evaluations'})}),
                ('detailforeign',{detail_path:(200,{**detail,'repository_id':0})}),
                ('detailchanged',{detail_path:(200,{**detail,'ref':'refs/heads/unrelated'})}),
                ('repoforeign',{repository:(200,{'id':0,'owner':{'id':CP.OWNER_ID}})}),
                ('repo403',{repository:(403,{'message':'Resource not accessible by integration'})}),
        ]:
            routes={**base,**edits}
            fake=ReaderFake(routes)
            with self.subTest(name=name):
                with self.assertRaises(CP.RefProofError):
                    CP.independent_rule_suite_readiness(fake)
                self.assertEqual({m for m,_,_ in fake.calls},{'GET'})
                self.assertLessEqual(len(fake.calls),3)
        packet,_=sample()
        with unittest.mock.patch.dict(os.environ,{'GITHUB_ACTIONS':'true','CP_READ_TOKEN':'synthetic'},clear=False):
            with self.assertRaises(CP.RefProofError):
                CP.owner_independent_reader(packet)
        with unittest.mock.patch.dict(os.environ,{'GITHUB_ACTIONS':'','CP_READ_TOKEN':''},clear=False):
            with self.assertRaises(CP.RefProofError):
                CP.owner_independent_reader(packet)

    def test_readiness_cli_fails_before_attempting_any_ref_mutation(self):
        packet,h=sample()
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);p=root/'packet.json';p.write_bytes(CP.canonical(packet))
            for args in [
                ('--readiness-check','--actor','owner'),
                ('--execute','--actor','owner'),
                ('--readiness-check','--actor','actions'),
            ]:
                result=subprocess.run([
                    'python3','src/tests/oci/cp-control-proof.py',
                    '--packet',str(p),'--packet-sha256',h,
                    '--phase','capability','--output',str(root/'receipt.json'),
                    *args],env={**os.environ,'CP_READ_TOKEN':'','CP_GITHUB_TOKEN':''},
                    text=True,capture_output=True)
                self.assertNotEqual(result.returncode,0)
                self.assertFalse((root/'receipt.json').exists())
                self.assertNotIn('synthetic',result.stderr)

if __name__=='__main__':unittest.main()
