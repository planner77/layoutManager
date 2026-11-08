#!/usr/bin/env python3
"""Upgrade only a fresh FUP1-owned 0.58 archive clone with pinned 0.61 OCI images.

The archive restore is performed by or58-auth-clone.py prepare. This helper
never touches the operating volume or creates an account. It starts only the
owned new App internally for bounded readback, then stops it.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

fup1 = load('g2_fup1', 'or58-auth-clone.py')
proof = fup1.proof
rr2 = load('g2_rr2', 'rr2-recovery-proof.py')
SOURCE = '33f377c3282e99b87aa487b9924edf305ca1753b'
PREFIX = 'ghcr.io/planner77/layoutmanager@sha256:'
PINS = {'app':PREFIX+'c4f8b576278067d990856c4f908a32982f8cbe0d2b1e96969a428472456d19ba',
        'migrator':PREFIX+'cc40e88172685694306686d521e439ecb058a1a79267ab862a6ddbf5ebf74269',
        'cpu-worker':PREFIX+'b97a58c964af766ad7fa9b4b2c7b5db526cf3e55faeb371f7444fd42aefed92b'}
STAGE = 'PREFLIGHT'
STAGES = {'PREFLIGHT','OLD_RESTORE','OLD_SNAPSHOT','UPGRADE_PLAN','UPGRADE_APPLY',
          'UPGRADE_VERIFY','NEW_APP_READBACK','CLEANUP'}

def failure_code(error):
    value=str(error)
    if re.fullmatch(r'(?:G2|FUP1|OR58|RR2|G7)_[A-Z0-9_]{2,64}',value):
        return value
    return 'G2_UNEXPECTED'

def check(value, code):
    if not value: raise ValueError(code)

def image_pair(refs, receipt):
    check(refs == PINS, 'G2_REFS_FIELDS')
    values = list(refs.values())
    check(len(set(values)) == 3 and all(re.fullmatch(re.escape(PREFIX)+r'[0-9a-f]{64}', v or '')
                                     for v in values), 'G2_REFS_DIGEST')
    for role, ref in refs.items():
        row = rr2.docker_one('image', 'inspect', ref)
        labels = row.get('Config', {}).get('Labels') or {}
        check(row.get('Os') == 'linux' and row.get('Architecture') == 'amd64' and
              row.get('Id') == receipt[role]['id'] and receipt[role]['ref'] == ref and
              receipt[role]['source'] == SOURCE and receipt[role]['version'] == '0.61.0' and
              receipt[role]['role'] == role and
              labels.get('org.opencontainers.image.version') == '0.61.0' and
              labels.get('org.opencontainers.image.revision') == SOURCE and
              labels.get('com.planner77.g7.image-role') == role and
              ref in row.get('RepoDigests', []), 'G2_IMAGE_IDENTITY')
    spec = importlib.util.spec_from_file_location('g2_host_upgrade', ROOT/'src/scripts/g7-upgrade.py')
    host = importlib.util.module_from_spec(spec); spec.loader.exec_module(host)
    host.inspect_pair(refs['app'], refs['migrator'], SOURCE,
                      lambda ref: rr2.docker_one('image', 'inspect', ref))

def clone_compose(root, nonce):
    source = (ROOT/'src/docker-compose.yml').read_text()
    clone = source
    for before, after, count in [
        ('container_name: cad-layout-viewer-app', 'container_name: or58-g2-app-'+nonce, 1),
        ('host_ip: 0.0.0.0', 'host_ip: 127.0.0.1', 1),
        ('name: cad-layout-viewer-network', 'name: or58-g2-net-'+nonce, 1),
        ('context: ..', 'context: '+str(ROOT), 3),
    ]:
        check(clone.count(before) == count, 'G2_COMPOSE_DRIFT')
        clone = clone.replace(before, after)
    scripts = root/'src/scripts'; scripts.mkdir(parents=True, exist_ok=False)
    shutil.copyfile(ROOT/'src/scripts/g7-upgrade.py', scripts/'g7-upgrade.py')
    path = root/'src/docker-compose.yml'; path.write_text(clone)
    check('host_ip: 0.0.0.0' not in clone and
          'container_name: cad-layout-viewer-app' not in clone, 'G2_COMPOSE_UNISOLATED')
    return scripts/'g7-upgrade.py'

def write_env(root, refs, volume):
    path = root/'upgrade.env'
    values = {'GHCR_IMAGE':refs['app'], 'GHCR_MIGRATION_IMAGE':refs['migrator'],
              'GHCR_CPU_WORKER_IMAGE':refs['cpu-worker'], 'G7_RELEASE_SOURCE_COMMIT':SOURCE,
              'CAD_DATA_VOLUME_NAME':volume, 'CAD_HOST_PORT':'3000'}
    path.write_text(''.join(k+'='+v+'\n' for k,v in values.items()))
    path.chmod(0o600)
    return path

def snapshot(receipt, baseline=None):
    image = receipt['images']['new']['cpu-worker']
    script = ROOT/'src/tests/oci/g2-volume-snapshot.mjs'
    command = ['docker','run','--rm','--network','none','--read-only','--user','10001:10001',
               '--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','64',
               '--memory','768m','--cpus','1', '--mount',
               'type=volume,source='+receipt['liveVolume']+',target=/data,readonly',
               '--mount','type=bind,src='+str(script)+',dst=/app/src/scripts/g2-volume-snapshot.mjs,readonly']
    if baseline:
        columns={name:{'columns':item['columns']} for name,item in baseline['tables'].items()}
        encoded=json.dumps({'tables':columns},sort_keys=True,separators=(',',':'))
        check(len(encoded.encode())<=65536,'G2_BASELINE_COLUMNS_LIMIT')
        command += ['-e','G2_BASELINE_JSON='+encoded]
    command += ['--entrypoint','node',image,'scripts/g2-volume-snapshot.mjs']
    result = rr2.run_owned_child(receipt, command, kind='g2-snapshot',
                                 volume=receipt['liveVolume'], image=image, timeout=120)
    value = json.loads(result.stdout)
    check(value['kind']=='G2_VOLUME_SNAPSHOT' and value['integrity'] and value['fk']==0,
          'G2_SNAPSHOT_INVALID')
    return value

def run_host(receipt, helper, env, action, approve=None):
    command = [sys.executable,str(helper),str(env),action,'--project-name',receipt['project']]
    if approve:command += ['--approve-plan',approve]
    base_env={'PATH':os.environ['PATH']}
    for key in ('HOME','DOCKER_HOST','DOCKER_CONTEXT','DOCKER_CONFIG','XDG_RUNTIME_DIR'):
        if key in os.environ:base_env[key]=os.environ[key]
    try:
        result = rr2.host_run(receipt, command, timeout=660, base_env=base_env)
    finally:
        # Docker wrapper journals CID/name before run. Never overwrite that
        # journal with a stale receipt after a timeout or child creation.
        durable=json.loads((Path(receipt['root'])/'receipt.json').read_text())
        check(durable['nonce']==receipt['nonce'] and
              durable['liveVolume']==receipt['liveVolume'] and
              durable['images']==receipt['images'], 'G2_HOST_JOURNAL_CHANGED')
        receipt.clear();receipt.update(durable)
    check(result.returncode==0, 'G2_HOST_UPGRADE_FAILED')
    records = [json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]
    check(records, 'G2_HOST_OUTPUT_MISSING')
    return records

def check_app_network(state, row, network, *, started):
    labels=network.get('Labels') or {}
    attached=row.get('NetworkSettings',{}).get('Networks') or {}
    check(network.get('Id')==state['networkId'] and
          network.get('Name')==state['network'] and network.get('Internal') is True and
          labels.get(proof.OWNER_LABEL)==state['nonce'] and
          labels.get('com.planner77.purpose')=='or58-restore-proof' and
          row.get('HostConfig',{}).get('NetworkMode')==state['network'] and
          set(attached)=={state['network']},'G2_NEW_APP_NETWORK')
    actual=attached[state['network']].get('NetworkID')
    check(actual==state['networkId'] if started else actual in ('',state['networkId']),
          'G2_NEW_APP_NETWORK_ID')

def start_current_app(receipt, state, refs):
    name='or58-g2-current-'+state['nonce']
    cidfile=Path(receipt['root'])/(name+'.cid')
    check(rr2.optional_docker('container',name) is None,'G2_NEW_APP_NAME_EXISTS')
    # Record intent before create. The old App remains stopped on the same
    # internal network; neither container publishes a host port.
    receipt['newAppName']=name
    receipt['newAppCidFile']=str(cidfile)
    rr2.save_receipt(receipt)
    values={'NODE_ENV':'production','DATABASE_URL':'file:/data/db/cad.sqlite',
            'CAD_STORAGE_PATH':'/data/cad','CAD_STORAGE_BACKEND':'local',
            'G7_GREENFIELD_MODE':'true','G7_GREENFIELD_AUTOMATED':'true',
            'G7_AUTH_ENABLED':'true','G7_CAD_WRITE_CUTOVER_ENABLED':'true',
            'SCENE_AUTO_BUILD_ENABLED':'false','SCENE_CPU_WORKER_ENABLED':'false',
            'G7_RUNTIME_ORIGIN':'http://127.0.0.1:3000','G7_RUNTIME_ALLOW_HTTP':'true',
            'G7_DEPLOY_APP_IMAGE':refs['app'],'G7_DEPLOY_MIGRATOR_IMAGE':refs['migrator'],
            'G7_RELEASE_SOURCE_COMMIT':SOURCE}
    command=['create','--name',name,'--cidfile',str(cidfile),'--network',state['network'],
             '--mount','type=volume,source='+state['volume']+',target=/data',
             '--label',proof.PURPOSE_LABEL,'--label',f'{proof.OWNER_LABEL}={state["nonce"]}',
             '--label','com.planner77.g2=current-app','--cap-drop','ALL',
             '--security-opt','no-new-privileges','--memory','768m','--cpus','1',
             '--pids-limit','128']
    for key,value in sorted(values.items()):command+=['--env',key+'='+value]
    command.append(refs['app'])
    cid=proof.docker(*command,timeout=30).decode().strip()
    check(re.fullmatch(r'[a-f0-9]{64}',cid) and cidfile.read_text().strip()==cid,
          'G2_NEW_APP_CIDFILE')
    receipt['newAppCid']=cid;rr2.save_receipt(receipt)
    row=rr2.docker_one('container','inspect',cid)
    network=rr2.docker_one('network','inspect',state['networkId'])
    check_app_network(state,row,network,started=False)
    labels=row.get('Config',{}).get('Labels') or {}
    check(row['Name']=='/'+name and row['Image']==rr2.docker_one('image','inspect',refs['app'])['Id'] and
          labels.get(proof.OWNER_LABEL)==state['nonce'] and
          labels.get('com.planner77.purpose')=='or58-restore-proof' and
          labels.get('com.planner77.g2')=='current-app' and
          len(row['Mounts'])==1 and row['Mounts'][0]['Name']==state['volume'] and
          row['Mounts'][0]['Destination']=='/data' and
          not any(row['NetworkSettings'].get('Ports',{}).values()) and
          not row['HostConfig'].get('PortBindings'),
          'G2_NEW_APP_IDENTITY')
    proof.docker('start',cid,timeout=30)
    deadline=time.monotonic()+120
    while time.monotonic()<deadline:
        row=rr2.docker_one('container','inspect',cid)
        check_app_network(state,row,rr2.docker_one('network','inspect',state['networkId']),
                          started=True)
        if row['State'].get('Health',{}).get('Status')=='healthy':break
        if not row['State'].get('Running'):raise ValueError('G2_NEW_APP_EXITED')
        time.sleep(2)
    else:raise ValueError('G2_NEW_APP_HEALTH_TIMEOUT')
    code=("fetch('http://127.0.0.1:3000/api/g7-runtime/status')"
          ".then(async r=>{const d=await r.json();console.log(JSON.stringify({http:r.status,state:d.state,authEnabled:d.authEnabled,cadWriteEnabled:d.cadWriteEnabled}))})"
          ".catch(()=>process.exit(1))")
    raw=proof.docker('exec',cid,'node','-e',code,timeout=15)
    status=json.loads(raw)
    check(status=={'http':200,'state':'ACTIVE','authEnabled':True,'cadWriteEnabled':True},
          'G2_NEW_APP_STATUS')
    # Query only public, currently permitted original-content route from inside
    # the exact clone App. Emit counts and match verdict, never IDs or bytes.
    readback=("const Database=require('better-sqlite3'),crypto=require('node:crypto');"
              "const db=new Database('/data/db/cad.sqlite',{readonly:true,fileMustExist:true});"
              "const files=db.prepare('SELECT id,sha256 FROM CadFileVersion ORDER BY id').all();db.close();"
              "if(files.length<1||files.length>100)process.exit(2);"
              "Promise.all(files.map(async f=>{const r=await fetch('http://127.0.0.1:3000/api/cad-files/'+f.id+'/content');"
              "if(r.status!==200)throw Error('HTTP');const b=Buffer.from(await r.arrayBuffer());"
              "if(crypto.createHash('sha256').update(b).digest('hex')!==f.sha256)throw Error('SHA');}))"
              ".then(()=>console.log(JSON.stringify({checked:files.length,match:true})))"
              ".catch(()=>process.exit(3))")
    public=json.loads(proof.docker('exec',cid,'node','-e',readback,timeout=60))
    check(public.get('match') is True and 1<=public.get('checked',0)<=100,
          'G2_PUBLIC_CAD_READBACK')
    proof.docker('stop','--time','15',cid,timeout=30)
    check(rr2.docker_one('container','inspect',cid)['State']['Running'] is False,
          'G2_NEW_APP_STOP_FAILED')
    return {'healthy':True,'status':status,'publishedPorts':0,'publicCad':public,
            'stoppedAfterProbe':True}

def execute(evidence, archive, refs_path):
    global STAGE
    check(not (evidence/'receipt.json').exists(), 'G2_ALREADY_STARTED')
    check(hashlib.sha256(archive.read_bytes()).hexdigest()==fup1.EXPECTED_ARCHIVE,
          'G2_ARCHIVE_CHANGED')
    pinned = json.loads(refs_path.read_text())
    check(set(pinned)==set(PINS) and all(isinstance(pinned[role],dict) for role in PINS),
          'G2_REFS_RECEIPT')
    refs={role:pinned[role].get('ref') for role in PINS}
    image_pair(refs,pinned)
    clone = evidence/'fup1'; clone.mkdir(mode=0o700)
    # G1's exact registered 0.58 bridge runs on a disposable extraction before
    # any new Docker volume/container is created. Keep extraction under private evidence.
    proof.EVIDENCE = evidence
    old_fingerprint = proof.sqlite_fingerprint(archive)
    check(old_fingerprint['localReferenceCounts']['cad'] > 0, 'G2_OLD_CAD_EMPTY')
    STAGE='OLD_RESTORE'
    fup1.prepare(clone, archive)
    state = json.loads((clone/'state.json').read_text())
    fup1.validate(state)
    nonce = state['nonce'][:16]
    check(re.fullmatch(r'[a-f0-9]{16}',nonce), 'G2_NONCE')
    work = evidence/'g2'; work.mkdir(mode=0o700)
    helper = clone_compose(work,nonce)
    env = write_env(work,refs,state['volume'])
    receipt = {'kind':'G2_OR58_UPGRADE','nonce':nonce,'root':str(work),
               'liveVolume':state['volume'],'restoreVolume':'or58-g2-unused-'+nonce,
               'project':'or58-g2-'+nonce,
               'images':{'old':{'app':proof.OLD_APP_REF,'migrator':proof.OLD_MIGRATOR_REF},
                         'new':refs},'archiveSha256':fup1.EXPECTED_ARCHIVE,
               'releaseSource':SOURCE,'fup1Root':str(clone),'children':[],'hostChildren':[]}
    rr2.save_receipt(receipt)
    try:
        # Only the exact owned old App can be stopped; no host service is selected.
        fup1.validate(state)
        proof.docker('stop','--time','15',state['cid'])
        row=proof.inspect('container',state['cid'])
        check(row['State']['Running'] is False and
              all(item['Id']==state['cid'] for item in proof.attached(state['volume'],running_only=True)),
              'G2_WRITER_REMAINS')
        STAGE='OLD_SNAPSHOT'
        before=snapshot(receipt)
        check(before['manifestVersion']=='0.58.0' and
              before['manifestSchemaId']=='G7-GREENFIELD-SEMANTIC-ZONES-20261101-1' and
              before['manifestSource']=='' and
              before['manifestAppRefSha256']==hashlib.sha256(proof.OLD_APP_REF.encode()).hexdigest() and
              before['manifestMigratorRefSha256']==hashlib.sha256(proof.OLD_MIGRATOR_REF.encode()).hexdigest(),
              'G2_OLD_MANIFEST')
        STAGE='UPGRADE_PLAN'
        plans=run_host(receipt,helper,env,'plan')
        plan=next((row for row in plans if row.get('planId') and row.get('state')=='UPGRADE_MIGRATION_REQUIRED'),None)
        check(plan and re.fullmatch(r'[0-9a-f]{64}',plan['planId']) and
              plan.get('from')=='0.58.0' and plan.get('to')=='0.61.0' and
              plan.get('steps')==['COMPATIBLE','COMPATIBLE','MIGRATION','MIGRATION'],
              'G2_PLAN_INVALID')
        STAGE='UPGRADE_APPLY'
        applied=run_host(receipt,helper,env,'apply',plan['planId'])
        check(any(row.get('state')=='G7_UPGRADE_HOST_COMPLETE_APP_STOPPED' for row in applied),
              'G2_APPLY_INCOMPLETE')
        STAGE='UPGRADE_VERIFY'
        after=snapshot(receipt,before)
        check(after['manifestVersion']=='0.61.0' and
              after['manifestSchemaId']=='G7-GREENFIELD-CPU-WORKER-20261104-1' and
              after['manifestSource']==SOURCE and
              after['manifestAppRefSha256']==hashlib.sha256(refs['app'].encode()).hexdigest() and
              after['manifestMigratorRefSha256']==hashlib.sha256(refs['migrator'].encode()).hexdigest() and
              after['manifestInstallIdSha256']==before['manifestInstallIdSha256'] and
              after['cad']==before['cad'] and
              all(after['tables'].get(name,{}).get('count')==item['count'] and
                  after['tables'][name]['sha256']==item['sha256'] for name,item in before['tables'].items()
                  if name!='_prisma_migrations'), 'G2_DATA_CHANGED')
        status=run_host(receipt,helper,env,'status')
        check(len(status)==1 and status[0].get('state')=='RESTART_SAME_RELEASE',
              'G2_NEW_STATUS_INVALID')
        STAGE='NEW_APP_READBACK'
        app=start_current_app(receipt,state,refs)
        started=snapshot(receipt,before)
        immutable={'CadFileVersion','CadLocation','CurrentScene','SceneAsset'}
        check(started['cad']==before['cad'] and
              all(started['tables'].get(name,{}).get('sha256')==after['tables'].get(name,{}).get('sha256')
                  for name in immutable if name in before['tables']),
              'G2_APP_START_CHANGED_BUSINESS')
        check(hashlib.sha256(archive.read_bytes()).hexdigest()==fup1.EXPECTED_ARCHIVE,
              'G2_ARCHIVE_CHANGED_AFTER')
        result={'kind':'G2_OR58_UPGRADE_RESULT','state':'PASS','archiveSha256':fup1.EXPECTED_ARCHIVE,
                'sourceVersion':'0.58.0','targetVersion':'0.61.0','releaseSource':SOURCE,
                'volume':state['volume'],'tableCount':len(before['tables']),
                'cadCount':len(before['cad']),'dataPreserved':True,'app':app,
                'authJourney':'NOT_RUN'}
        (work/'result.json').write_text(json.dumps(result,sort_keys=True)+'\n')
        return result
    finally:
        durable=json.loads((work/'receipt.json').read_text())
        check(durable['nonce']==receipt['nonce'] and durable['images']==receipt['images'],
              'G2_CLEANUP_JOURNAL_CHANGED')
        rr2.cleanup_owned_children(durable)

def cleanup(evidence, archive):
    global STAGE
    STAGE='CLEANUP'
    clone=evidence/'fup1'; work=evidence/'g2'
    check(hashlib.sha256(archive.read_bytes()).hexdigest()==fup1.EXPECTED_ARCHIVE,
          'G2_CLEANUP_ARCHIVE_CHANGED')
    state=json.loads((clone/'state.json').read_text())
    if not (work/'receipt.json').exists():
        # FUP1 records its nonce and owned names before creating resources.
        # No G2 helper/container has been run without a G2 receipt.
        if proof.volume_exists(state['volume']):
            fup1.owned_volume(state)
            fup1.cleanup(clone,state)
            check(not proof.attached(state['volume']),'G2_CLEANUP_ATTACHED')
            proof.docker('volume','rm',state['volume'])
        check(not proof.volume_exists(state['volume']),'G2_CLEANUP_VOLUME_REMAINS')
        return {'kind':'G2_OR58_CLEANUP','state':'PASS','ownedVolumeRemoved':True,
                'archiveSha256':fup1.EXPECTED_ARCHIVE}
    receipt=json.loads((work/'receipt.json').read_text())
    check(receipt['kind']=='G2_OR58_UPGRADE' and receipt['fup1Root']==str(clone) and
          receipt['liveVolume']==state['volume'] and
          receipt['nonce']==state['nonce'][:16] and
          receipt['archiveSha256']==fup1.EXPECTED_ARCHIVE, 'G2_CLEANUP_RECEIPT')
    rr2.cleanup_owned_children(receipt)
    if receipt.get('newAppName'):
        row=rr2.optional_docker('container',receipt['newAppName'])
        if row is not None:
            labels=row.get('Config',{}).get('Labels') or {}
            cidfile=Path(receipt['newAppCidFile'])
            check(cidfile.parent==work and cidfile.name==receipt['newAppName']+'.cid' and
                  cidfile.is_file() and cidfile.read_text().strip()==row['Id'] and
                  re.fullmatch(r'[a-f0-9]{64}',row['Id']) and
                  (not receipt.get('newAppCid') or row['Id']==receipt['newAppCid']) and
                  row['Image']==rr2.docker_one('image','inspect',receipt['images']['new']['app'])['Id'] and
                  labels.get(proof.OWNER_LABEL)==state['nonce'] and
                  labels.get('com.planner77.g2')=='current-app' and
                  any(m.get('Name')==state['volume'] and m.get('Destination')=='/data'
                      for m in row.get('Mounts',[])), 'G2_CLEANUP_APP_IDENTITY')
            if row['State']['Running']:proof.docker('stop','--time','15',row['Id'])
            proof.docker('rm',row['Id'])
    fup1.owned_volume(state)
    fup1.cleanup(clone,state)
    check(not proof.attached(state['volume']), 'G2_CLEANUP_ATTACHED')
    fup1.owned_volume(state)
    proof.docker('volume','rm',state['volume'])
    check(not proof.volume_exists(state['volume']), 'G2_CLEANUP_VOLUME_REMAINS')
    return {'kind':'G2_OR58_CLEANUP','state':'PASS','ownedVolumeRemoved':True,
            'archiveSha256':fup1.EXPECTED_ARCHIVE}

def main():
    os.umask(0o077)
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=('execute','cleanup'))
    parser.add_argument('--evidence',required=True,type=Path)
    parser.add_argument('--archive',required=True,type=Path)
    parser.add_argument('--refs',type=Path)
    args=parser.parse_args()
    root=fup1.private_root(args.evidence)
    try:
        if args.action=='execute':
            check(args.refs is not None,'G2_REFS_REQUIRED')
            result=execute(root,args.archive,args.refs)
        else:
            check(args.refs is None,'G2_CLEANUP_REFS_UNEXPECTED')
            result=cleanup(root,args.archive)
        print(json.dumps(result,sort_keys=True))
    except Exception as error:
        # Preserve private evidence and the stopped clone for owned review/cleanup.
        print(json.dumps({'kind':'G2_OR58_UPGRADE_RESULT','state':'HALT',
                          'stage':STAGE if STAGE in STAGES else 'PREFLIGHT',
                          'code':failure_code(error),
                          'nextAction':'INSPECT_PRIVATE_OWNED_EVIDENCE'}))
        raise SystemExit(1)

if __name__=='__main__':main()
