#!/usr/bin/env python3
"""Fresh owned RR2/RR3 OCI upgrade, Viewer, same-backup recovery journey.

Inputs are the verified read-only old GHCR pair receipt and retained RR1
three-role registry receipt. The journey creates a new nonce and cleans only
its own two Compose namespaces/volumes, including on a failed assertion.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parents[3]
PROOF=ROOT/'src/tests/oci/rr2-recovery-proof.py'

class JourneyFailure(Exception):
    pass

def check(condition,code):
    if not condition:raise JourneyFailure(code)

def call(command,*,cwd=ROOT,env=None,timeout=300,expect_failure=False):
    try:
        result=subprocess.run(command,cwd=cwd,env=env,capture_output=True,
                              text=True,timeout=timeout,check=False)
    except subprocess.TimeoutExpired as error:
        raise JourneyFailure('RR2_STAGE_TIMEOUT') from error
    if expect_failure:
        check(result.returncode!=0,'RR2_NEGATIVE_ACCEPTED')
    else:
        if result.returncode!=0:
            safe=re.search(r'(?m)^RR2_PROOF_FAILED ([A-Z][A-Z0-9_]+)$',result.stderr)
            raise JourneyFailure(safe.group(1) if safe else 'RR2_STAGE_COMMAND_FAILED')
    return result.stdout

def proof(receipt,action,*,release='old',operation=None,approve=None,backup=None,
          env=None,expect_failure=False):
    command=[sys.executable,str(PROOF),action,'--receipt',str(receipt),'--release',release]
    if operation:command+=['--operation',operation]
    if approve:command+=['--approve-plan',approve]
    if backup:command+=['--backup',backup]
    output=call(command,env=env,timeout=660,expect_failure=expect_failure)
    if action in ('plan','status','execute','start'):
        return json.loads(output.strip().splitlines()[-1])['result']
    if action in ('snapshot','worker-tick'):
        return json.loads(output.strip().splitlines()[-1])
    return output

def playwright(receipt,port,needle,*,env,version=None):
    local=dict(env,G7_RR2_RECEIPT=str(receipt),G7_RR2_ORIGIN='http://127.0.0.1:'+str(port))
    if version:local['G7_RR2_CPU_VERSION']=version
    root=receipt.parent
    command=['npx','playwright','test','--config','playwright.rr2.config.ts',
             '--grep',needle,'--reporter=line','--output',str(root/'playwright-results')]
    try:
        process=subprocess.run(command,cwd=ROOT/'src',env=local,capture_output=True,
                               text=True,timeout=300,check=False)
    except subprocess.TimeoutExpired as error:
        raise JourneyFailure('RR2_PLAYWRIGHT_TIMEOUT') from error
    if process.returncode:
        private_log=root/'playwright-failure.log'
        private_log.write_text(process.stdout+'\n'+process.stderr)
        private_log.chmod(0o600)
        raise JourneyFailure('RR2_PLAYWRIGHT_FAILED')
    result=process.stdout
    check('1 passed' in result,'RR2_PLAYWRIGHT_RESULT_INVALID')
    return result

def health(port):
    url='http://127.0.0.1:'+str(port)+'/api/health'
    for _ in range(60):
        try:
            with urllib.request.urlopen(url,timeout=2) as response:
                if response.status==200:return
        except (urllib.error.URLError,TimeoutError):pass
        time.sleep(1)
    raise JourneyFailure('RR2_APP_HEALTH_TIMEOUT')

def same_baseline(old,new):
    check(all(old[key]==new[key] for key in
              ('tables','files','manifestSha','manifestVersion','manifestSchemaId',
               'foreignKeys','prefixHashes')), 'RR2_RESTORED_SNAPSHOT_MISMATCH')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--old-pair-receipt',required=True,type=Path)
    parser.add_argument('--new-triplet-receipt',required=True,type=Path)
    parser.add_argument('--output-receipt',required=True,type=Path)
    options=parser.parse_args()
    check(not options.output_receipt.exists(),'RR2_OUTPUT_EXISTS')
    env=dict(os.environ,RR2_OLD_PAIR_RECEIPT=str(options.old_pair_receipt.resolve()),
             RR2_CURRENT_TRIPLET_RECEIPT=str(options.new_triplet_receipt.resolve()))
    stage='prepare';receipt_path=None;summary={'kind':'RR2_RR3_JOURNEY','result':'RUNNING',
                                                   'stages':[]}
    try:
        output=call([sys.executable,str(PROOF),'prepare'],env=env,timeout=60)
        match=re.fullmatch(r'RR2_NAMESPACE_PREPARED nonce=([0-9a-f]{16}) allowedDiffs=\d+\s*',output)
        check(match is not None,'RR2_PREPARE_OUTPUT_INVALID')
        receipt_path=ROOT/'data/release-proof'/('rr2-'+match.group(1))/'receipt.json'
        receipt=json.loads(receipt_path.read_text())
        check(receipt['nonce']==match.group(1),'RR2_RECEIPT_NONCE_INVALID')
        summary.update(nonce=receipt['nonce'],oldImage=receipt['images']['old'],
                       newImage=receipt['images']['new'],
                       oldSource=receipt['images']['oldSource'],
                       newSource=receipt['images']['newSource'],
                       composeDiffPaths=receipt['composeDiffPaths'],
                       namespaceSha256=receipt['namespaceSha256'])
        summary['stages'].append(stage)
        stage='old_install'
        plan=proof(receipt_path,'plan',env=env)
        check(plan['decision']=='FRESH_INSTALL','RR2_OLD_NOT_FRESH')
        bad=proof(receipt_path,'execute',approve='0'*64,env=env,expect_failure=True)
        check(bad.get('code')=='G7_DEPLOY_STALE_PLAN','RR2_OLD_WRONG_APPROVAL_INVALID')
        done=proof(receipt_path,'execute',approve=plan['planId'],env=env)
        check(done['state']=='FRESH_INSTALLED','RR2_OLD_INSTALL_INVALID')
        health(receipt['oldPort'])
        summary['stages'].append(stage)
        stage='old_business'
        playwright(receipt_path,receipt['oldPort'],'installs and populates',env=env)
        proof(receipt_path,'browser-fixture',env=env)
        playwright(receipt_path,receipt['oldPort'],'reads Browser READY',env=env)
        old=proof(receipt_path,'snapshot',env=env)
        check(old['manifestVersion']=='0.60.0' and old['foreignKeys']==0 and
              old['tables']['SceneBuildJob']['count']>=2 and
              old['tables']['SceneAsset']['count']>=1 and len(old['files'])>=3,
              'RR2_OLD_BASELINE_INCOMPLETE')
        summary['oldSnapshot']=old
        summary['stages'].append(stage)
        stage='upgrade'
        status=proof(receipt_path,'status',release='new',env=env)
        check(status['decision']=='UPGRADE_MIGRATION_REQUIRED','RR2_UPGRADE_STATUS_INVALID')
        plan=proof(receipt_path,'plan',release='new',env=env)
        check(plan['decision']=='UPGRADE_MIGRATION_REQUIRED' and
              plan['registryChain']==['MIGRATION'],'RR2_UPGRADE_PLAN_INVALID')
        bad=proof(receipt_path,'execute',release='new',approve='0'*64,env=env,
                  expect_failure=True)
        check(bad.get('code')=='G7_DEPLOY_STALE_PLAN','RR2_UPGRADE_WRONG_APPROVAL_INVALID')
        check(proof(receipt_path,'snapshot',env=env)==old,'RR2_WRONG_APPROVAL_MUTATED_SOURCE')
        done=proof(receipt_path,'execute',release='new',approve=plan['planId'],env=env)
        check(done['state']=='UPGRADED_APP_STOPPED','RR2_UPGRADE_NOT_STOPPED')
        upgraded=proof(receipt_path,'snapshot',release='new',env=env)
        check(upgraded['manifestVersion']=='0.61.0' and upgraded['files']==old['files'] and
              upgraded['foreignKeys']==0 and
              len(upgraded['backupIds'])==1 and
              all(old['tables'][name]==upgraded['tables'][name]
                  for name in old['tables'] if name!='_prisma_migrations'),
              'RR2_UPGRADE_IMMUTABLE_CHANGED')
        backup=upgraded['backupIds'][0]
        summary['backupId']=backup
        summary['stages'].append(stage)
        stage='current_start'
        plan=proof(receipt_path,'plan',release='new',operation='start',env=env)
        check(plan['decision']=='RESTART_SAME_RELEASE','RR2_CURRENT_START_PLAN_INVALID')
        bad=proof(receipt_path,'start',release='new',approve='0'*64,env=env,
                  expect_failure=True)
        check(bad.get('code')=='G7_DEPLOY_STALE_PLAN','RR2_CURRENT_WRONG_START_INVALID')
        done=proof(receipt_path,'start',release='new',approve=plan['planId'],env=env)
        check(done['state']=='STARTED_VERIFIED_IMAGE','RR2_CURRENT_START_INVALID')
        health(receipt['oldPort'])
        summary['stages'].append(stage)
        stage='current_http_worker_viewer'
        output=playwright(receipt_path,receipt['oldPort'],'RR3 upgraded',env=env)
        match=re.search(r'RR3_SIGNED_UPLOAD_QUEUED_PASS (\{[^\n]+\})',output)
        check(match is not None,'RR3_UPLOAD_RECEIPT_MISSING')
        cpu=json.loads(match.group(1))
        check(re.fullmatch(r'[0-9a-f-]{36}',cpu['versionId']) is not None and
              re.fullmatch(r'[0-9a-f-]{36}',cpu['jobId']) is not None,
              'RR3_CPU_IDS_INVALID')
        tick=proof(receipt_path,'worker-tick',release='new',env=env)
        check(tick.get('outcome')=='PUBLISHED' and tick.get('jobId')==cpu['jobId'],
              'RR3_WORKER_DID_NOT_PUBLISH')
        output=playwright(receipt_path,receipt['oldPort'],'RR3 detached',env=env,
                          version=cpu['versionId'])
        check('RR3_CPU_VIEWER_PASS' in output,'RR3_VIEWER_PROOF_MISSING')
        after_cpu=proof(receipt_path,'snapshot',release='new',env=env)
        for name,hashes in old['prefixHashes'].items():
            check(after_cpu['prefixHashes'][name][:len(hashes)]==hashes,
                  'RR3_HISTORICAL_ROW_CHANGED')
        check(after_cpu['tables']['CadFileVersion']['count']==
              old['tables']['CadFileVersion']['count']+1 and
              after_cpu['tables']['SceneAsset']['count']==
              old['tables']['SceneAsset']['count']+1,
              'RR3_CPU_BUSINESS_COUNT_INVALID')
        summary['cpuVersionId']=cpu['versionId']
        summary['cpuJobId']=cpu['jobId']
        summary['postCpuSnapshot']=after_cpu
        summary['stages'].append(stage)
        stage='formal_restore'
        proof(receipt_path,'restore',release='new',backup=backup,env=env)
        restored=proof(receipt_path,'snapshot',release='restore',env=env)
        same_baseline(old,restored)
        summary['restoredPreAppSnapshot']=restored
        summary['stages'].append(stage)
        stage='old_digest_readback'
        status=proof(receipt_path,'status',release='restore',env=env)
        check(status['installedVersion']=='0.60.0' and
              status['decision']=='RESTART_SAME_RELEASE','RR2_RESTORED_STATUS_INVALID')
        plan=proof(receipt_path,'plan',release='restore',operation='start',env=env)
        done=proof(receipt_path,'start',release='restore',approve=plan['planId'],env=env)
        check(done['state']=='STARTED_VERIFIED_IMAGE','RR2_OLD_DIGEST_START_INVALID')
        health(receipt['restorePort'])
        output=playwright(receipt_path,receipt['restorePort'],'RR2 actual restored',
                          env=env,version=cpu['versionId'])
        check('RR2_RESTORED_OLD_DIGEST_HTTP_READBACK_PASS' in output,
              'RR2_OLD_DIGEST_READBACK_MISSING')
        restored_post=proof(receipt_path,'snapshot',release='restore',env=env)
        check(all(old['tables'][name]==restored_post['tables'][name]
                  for name in old['tables'] if name not in ('AuthSession','AuditEvent'))
              and old['files']==restored_post['files'] and
              old['manifestSha']==restored_post['manifestSha'] and
              old['prefixHashes']['AuditEvent']==
                  restored_post['prefixHashes']['AuditEvent'][:len(old['prefixHashes']['AuditEvent'])],
              'RR2_RESTORED_POST_APP_BUSINESS_CHANGED')
        summary['restoredPostAppSnapshot']=restored_post
        summary['stages'].append(stage)
    except (JourneyFailure,KeyError,ValueError,TypeError,OSError) as error:
        summary['result']='FAILED'
        summary['failedStage']=stage
        summary['failureCode']=str(error) if isinstance(error,JourneyFailure) else 'RR2_JOURNEY_INVALID_STATE'
        print('RR2_RR3_JOURNEY_FAILED stage='+stage+' code='+summary['failureCode'],file=sys.stderr)
    finally:
        if receipt_path and receipt_path.exists():
            try:
                proof(receipt_path,'cleanup',env=env)
                summary['ownedCleanup']='PASS'
            except (JourneyFailure,KeyError,ValueError,TypeError,OSError):
                summary['ownedCleanup']='FAILED'
                summary['result']='FAILED'
                print('RR2_OWNED_CLEANUP_FAILED',file=sys.stderr)
        options.output_receipt.parent.mkdir(parents=True,exist_ok=True)
        if summary['result']=='RUNNING':
            summary['result']='PASS' if summary.get('ownedCleanup')=='PASS' else 'FAILED'
        options.output_receipt.write_text(json.dumps(summary,indent=2,sort_keys=True)+'\n')
        if summary['result']=='PASS':
            print('RR2_RR3_ACTUAL_OCI_JOURNEY_PASS nonce='+summary['nonce'])
    return 0 if summary['result']=='PASS' else 1

if __name__=='__main__':
    sys.exit(main())
