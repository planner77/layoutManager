"""Owned clone only: registered previous G7 -> exact candidate compatibility proof."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import subprocess
import time
import uuid

import verify_local_recovery as baseline

HELPER = Path(__file__).resolve().parent / 'recovery-local-volume.mjs'
CLI = Path(__file__).resolve().parent / 'recovery-local.mjs'
CPU_SCHEMA = 'G7-GREENFIELD-CPU-WORKER-20261104-1'
TREE_SCHEMA = 'G7-GREENFIELD-UNIFIED-TREE-20261113-1'
TREE_TABLES = frozenset(('TreeFolder', 'TreeMembership', 'TreeAudit'))
TREE_MIGRATION = '202611130001_unified_tree'
TREE_BASELINE = '202611130002_greenfield_unified_tree_baseline'


class Incompatible(Exception):
    pass


def need(ok, code):
    if not ok:
        raise Incompatible(code)


def invoke(args, *, env=None, timeout=180, max_output=16 * 1024 * 1024):
    result = subprocess.run(args, capture_output=True, timeout=timeout, env=env)
    need(result.returncode == 0 and len(result.stdout) <= max_output, 'CLONE_COMMAND_FAILED')
    return result.stdout


def docker(args, *, env=None, timeout=180):
    return invoke(['docker', *args], env=env, timeout=timeout)


def node_json(args, timeout=180):
    raw = invoke(['node', str(CLI), *args], timeout=timeout)
    result = json.loads(raw)
    need(type(result) is dict, 'CLONE_OUTPUT')
    return result


def volume_scan(volume, migrator_image):
    name = 'r282-scan-' + uuid.uuid4().hex[:16]
    args = ['run', '--rm', '--name', name, '--network', 'none', '--read-only',
            '--user', '10001:10001', '--tmpfs', '/tmp:rw,nosuid,nodev,size=4g',
            '--mount', f'type=volume,src={volume},dst=/data,volume-nocopy,readonly',
            '--mount', f'type=bind,src={HELPER},dst=/tool/recovery-local-volume.mjs,readonly',
            '--entrypoint', 'node', migrator_image, '--import', 'tsx',
            '/tool/recovery-local-volume.mjs', 'scan']
    try:
        result = json.loads(docker(args, timeout=180))
        need(type(result) is dict and type(result.get('files')) is list
             and type(result.get('logical')) is dict, 'CLONE_SNAPSHOT')
        return result
    finally:
        subprocess.run(['docker', 'rm', '-f', name], capture_output=True, timeout=20)


def candidate_env(record):
    app = record['roles']['app']['localTag']
    migrator = record['roles']['migrator']['localTag']
    return {'G7_GREENFIELD_MODE': 'true', 'G7_GREENFIELD_AUTOMATED': 'true',
            'DATABASE_URL': 'file:/data/db/cad.sqlite', 'CAD_STORAGE_PATH': '/data/cad',
            'CAD_STORAGE_BACKEND': 'local', 'G7_DEPLOY_APP_IMAGE': app,
            'G7_DEPLOY_MIGRATOR_IMAGE': migrator,
            'G7_RELEASE_SOURCE_COMMIT': record['sourceCommit'], 'G7_AUTH_ENABLED': 'false',
            'G7_CAD_WRITE_CUTOVER_ENABLED': 'false', 'NODE_ENV': 'production'}


def docker_env(args, values, *, timeout=180):
    # Docker receives only environment NAMES on argv; values stay in child env.
    import os
    return docker(args, env={**os.environ, **values}, timeout=timeout)


def migrator(volume, record, action, *, approve_plan=None):
    need(action in ('plan', 'apply'), 'CLONE_ACTION')
    need(approve_plan is None or action == 'apply' and type(approve_plan) is str
         and re.fullmatch('[a-f0-9]{64}', approve_plan), 'CLONE_APPROVAL')
    values = candidate_env(record)
    if action == 'apply':
        values.update({'G7_UPGRADE_PAIR_VERIFIED': 'true',
                       'G7_UPGRADE_MAINTENANCE_ACK': 'APP_STOPPED_BY_HOST_HELPER'})
    name = 'r282-migrate-' + uuid.uuid4().hex[:16]
    args = ['run', '--rm', '--name', name, '--network', 'none', '--read-only',
            '--user', '10001:10001', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
            '--pids-limit', '64', '--memory', '768m', '--cpus', '1',
            '--tmpfs', '/tmp:rw,nosuid,nodev,size=4g,uid=10001,gid=10001',
            '--mount', f'type=volume,src={volume},dst=/data,volume-nocopy',
            '--entrypoint', 'node',
            *[part for key in values for part in ('--env', key)],
            record['roles']['migrator']['imageId'], '--import', 'tsx',
            'scripts/g7-greenfield.ts', action,
            *(['--approve-plan', approve_plan] if approve_plan is not None else [])]
    try:
        return json.loads(docker_env(args, values, timeout=300))
    finally:
        subprocess.run(['docker', 'rm', '-f', name], capture_output=True, timeout=20)


def candidate_inspection(volume, record, script):
    """Fixed read-only inspection of the exact built migrator; no caller SQL."""
    name = 'r282-inspect-' + uuid.uuid4().hex[:16]
    args = ['run', '--rm', '--name', name, '--network', 'none', '--read-only',
            '--user', '10001:10001', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
            '--pids-limit', '64', '--memory', '768m', '--cpus', '1',
            '--tmpfs', '/tmp:rw,nosuid,nodev,size=4g,uid=10001,gid=10001']
    if volume is not None:
        args += ['--mount', f'type=volume,src={volume},dst=/data,volume-nocopy,readonly']
    args += ['--entrypoint', 'node', record['roles']['migrator']['imageId'],
             '--import', 'tsx', '--input-type=module', '--eval', script]
    try:
        result = json.loads(docker(args, timeout=180))
        need(type(result) is dict, 'CLONE_INSPECTION')
        return result
    finally:
        subprocess.run(['docker', 'rm', '-f', name], capture_output=True, timeout=20)


def tree_contract(record, from_version):
    # Resolve bundled reviewed declarations in the source-bound image, rather
    # than trusting a plan's self-reported migration name or an external JSON.
    script = r"""
import {createHash} from 'node:crypto';
import {GREENFIELD_UPGRADE_REGISTRY as registry,resolveUpgradeChain} from '/app/src/server/g7-operational/greenfield-upgrade-registry.ts';
import {TREE_MIGRATION_NAME,TREE_MIGRATION_SQL,TREE_MIGRATION_CHECKSUM} from '/app/src/server/g7-operational/tree-ddl.ts';
const target=registry.releases.find(r=>r.version==='0.63.0');
const chains=Object.fromEntries(['0.61.0','0.61.1','0.62.0'].map(v=>[v,resolveUpgradeChain(registry,v,'0.63.0').map(e=>({from:e.from,to:e.to,kind:e.kind,migrationName:e.migrationName??null,migrationChecksum:e.migrationChecksum??null,sqlSha256:e.sqlSha256??null,actualSqlSha256:e.sql?createHash('sha256').update(e.sql).digest('hex'):null}))]));
process.stdout.write(JSON.stringify({target,chains,migrationName:TREE_MIGRATION_NAME,migrationChecksum:TREE_MIGRATION_CHECKSUM,sqlSha256:createHash('sha256').update(TREE_MIGRATION_SQL).digest('hex')}));
"""
    value = candidate_inspection(None, record, script)
    target = value.get('target', {})
    checksum = value.get('migrationChecksum')
    need(type(target) is dict and target.get('version') == '0.63.0'
         and target.get('schemaId') == TREE_SCHEMA and target.get('baseline') == TREE_BASELINE
         and re.fullmatch('[a-f0-9]{64}', str(target.get('checksum', '')))
         and value.get('migrationName') == TREE_MIGRATION
         and type(checksum) is str and re.fullmatch('[a-f0-9]{64}', checksum)
         and value.get('sqlSha256') == checksum, 'CLONE_TREE_CONTRACT')
    versions = ['0.61.0', '0.61.1', '0.62.0', '0.63.0']
    need(from_version in versions[:-1], 'CLONE_TREE_CONTRACT')
    chains = value.get('chains')
    need(type(chains) is dict, 'CLONE_TREE_CONTRACT')
    chain = chains.get(from_version)
    start = versions.index(from_version)
    need(type(chain) is list and len(chain) == 3 - start, 'CLONE_TREE_CONTRACT')
    for index, edge in enumerate(chain, start):
        need(type(edge) is dict and edge.get('from') == versions[index]
             and edge.get('to') == versions[index + 1], 'CLONE_TREE_CONTRACT')
        if index == 2:
            need(edge.get('kind') == 'MIGRATION' and edge.get('migrationName') == TREE_MIGRATION
                 and edge.get('migrationChecksum') == edge.get('sqlSha256')
                 == edge.get('actualSqlSha256') == checksum, 'CLONE_TREE_CONTRACT')
        else:
            need(edge.get('kind') == 'COMPATIBLE'
                 and all(edge.get(key) is None for key in
                         ('migrationName', 'migrationChecksum', 'sqlSha256', 'actualSqlSha256')),
                 'CLONE_TREE_CONTRACT')
    return {'migrationChecksum': checksum, 'steps': [edge['kind'] for edge in chain]}


def history_snapshot(volume, record):
    # Copy DB/WAL/SHM to private tmpfs, just as the immutable recovery scanner
    # does; the restored data mount stays read-only throughout inspection.
    script = r"""
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const Database=createRequire('/app/src/package.json')('better-sqlite3');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'r282-history-'));
for(const n of ['cad.sqlite','cad.sqlite-wal','cad.sqlite-shm'])if(fs.existsSync('/data/db/'+n))fs.copyFileSync('/data/db/'+n,path.join(scratch,n));
const db=new Database(path.join(scratch,'cad.sqlite'),{readonly:true,fileMustExist:true});
try{const rows=db.prepare('SELECT * FROM "_prisma_migrations" ORDER BY rowid').all();
const hash=createHash('sha256');for(const row of rows){hash.update(JSON.stringify(row));hash.update('\n');}
process.stdout.write(JSON.stringify({rows,sha256:hash.digest('hex')}));}
finally{db.close();fs.rmSync(scratch,{recursive:true,force:true});}
"""
    return candidate_inspection(volume, record, script)


def assert_owned_clone(volume, proof):
    value = json.loads(docker(['volume', 'inspect', volume], timeout=20))[0]
    labels = value.get('Labels') or {}
    plan = proof['planData']
    need(value.get('Name') == volume and labels.get('recovery283.nonce') == plan['nonce']
         and labels.get('recovery283.plan') == plan['sha256'], 'CLONE_OWNERSHIP')


def tree_tables_preserved(before, after, old_history, new_history, checksum):
    def tables(snapshot):
        rows = snapshot['logical']['tables']
        need(type(rows) is list and all(type(row) is dict and type(row.get('name')) is str
                                      for row in rows), 'CLONE_TREE_TABLES')
        mapped = {row['name']: row for row in rows}
        need(len(mapped) == len(rows), 'CLONE_TREE_TABLES')
        return mapped
    old, new = tables(before), tables(after)
    need('_prisma_migrations' in old and not TREE_TABLES.intersection(old)
         and set(new) == set(old) | TREE_TABLES, 'CLONE_TREE_TABLES')
    need(all(new[name] == row for name, row in old.items() if name != '_prisma_migrations')
         and all(type(new[name].get('count')) is int and new[name]['count'] == 0 and new[name].get('sha256')
                 == hashlib.sha256(b'').hexdigest() for name in TREE_TABLES),
         'CLONE_LOGICAL_DRIFT')
    previous, current = old_history.get('rows'), new_history.get('rows')
    need(type(previous) is list and type(current) is list and previous
         and current[:-1] == previous and len(current) == len(previous) + 1
         and old_history.get('sha256') == old['_prisma_migrations'].get('sha256')
         and new_history.get('sha256') == new['_prisma_migrations'].get('sha256')
         and old['_prisma_migrations'].get('count') == len(previous)
         and new['_prisma_migrations'].get('count') == len(current), 'CLONE_TREE_HISTORY')
    for snapshot, rows in ((old_history, previous), (new_history, current)):
        raw = ''.join(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n'
                      for row in rows).encode()
        need(hashlib.sha256(raw).hexdigest() == snapshot['sha256'], 'CLONE_TREE_HISTORY')
    last = current[-1]
    need(type(last) is dict and last.get('migration_name') == TREE_MIGRATION
         and last.get('checksum') == checksum and last.get('finished_at') is not None
         and last.get('started_at') is not None and last.get('rolled_back_at') is None
         and last.get('logs') is None and last.get('applied_steps_count') == 1,
         'CLONE_TREE_HISTORY')


def app_and_worker(volume, record):
    values = candidate_env(record)
    values.update({'G7_AUTH_ENABLED': 'true', 'G7_CAD_WRITE_CUTOVER_ENABLED': 'true',
                   'G7_RUNTIME_ORIGIN': 'http://127.0.0.1:3000',
                   'G7_RUNTIME_ALLOW_HTTP': 'true', 'SCENE_AUTO_BUILD_ENABLED': 'true',
                   'SCENE_CPU_WORKER_ENABLED': 'true', 'LOG_STORE_ENABLED': 'false',
                   'HOSTNAME': '127.0.0.1', 'PORT': '3000'})
    env_flags = [part for key in values for part in ('--env', key)]
    app_name = 'r282-app-' + uuid.uuid4().hex[:16]
    app_args = ['run', '-d', '--name', app_name, '--network', 'none', '--read-only',
                '--user', '10001:10001', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                '--pids-limit', '128', '--memory', '1g', '--cpus', '1.5',
                '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m,uid=10001,gid=10001',
                '--mount', f'type=volume,src={volume},dst=/data,volume-nocopy',
                *env_flags, '--entrypoint', 'node', record['roles']['app']['imageId'], 'server.js']
    try:
        cid = docker_env(app_args, values, timeout=30).decode().strip()
        need(len(cid) == 64 and all(c in '0123456789abcdef' for c in cid), 'CLONE_APP_CID')
        health = False
        for _ in range(45):
            probe = subprocess.run(['docker', 'exec', cid, 'node', '-e',
                "fetch('http://127.0.0.1:3000/api/health').then(r=>process.stdout.write(String(r.status))).catch(()=>process.exit(1))"],
                capture_output=True, timeout=6)
            if probe.returncode == 0 and probe.stdout.strip() == b'200':
                health = True
                break
            time.sleep(1)
        need(health, 'CLONE_APP_HEALTH')
        read = docker(['exec', cid, 'node', '-e',
            "fetch('http://127.0.0.1:3000/api/masters').then(r=>process.stdout.write(String(r.status))).catch(()=>process.exit(1))"],
            timeout=10).strip()
        need(read in (b'200', b'401'), 'CLONE_APP_READ')
    finally:
        subprocess.run(['docker', 'rm', '-f', app_name], capture_output=True, timeout=20)
    worker_name = 'r282-worker-' + uuid.uuid4().hex[:16]
    worker_args = ['run', '--rm', '--name', worker_name, '--network', 'none', '--read-only',
                   '--init', '--user', '10001:10001', '--cap-drop', 'ALL',
                   '--security-opt', 'no-new-privileges', '--pids-limit', '64',
                   '--memory', '768m', '--cpus', '1',
                   '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=96m,uid=10001,gid=10001',
                   '--mount', f'type=volume,src={volume},dst=/data,volume-nocopy',
                   *env_flags, '--entrypoint', 'node', record['roles']['cpu-worker']['imageId'],
                   '--import', 'tsx', 'scripts/scene-cpu-worker.ts', '--once']
    try:
        worker = json.loads(docker_env(worker_args, values, timeout=150).splitlines()[-1])
        need(worker.get('kind') == 'CPU_SCENE_TICK'
             and worker.get('outcome') in ('IDLE', 'PUBLISHED'), 'CLONE_WORKER')
    finally:
        subprocess.run(['docker', 'rm', '-f', worker_name], capture_output=True, timeout=20)
    return {'appHealth': 'PASS', 'appRead': 'PASS' if read == b'200' else 'AUTH_BOUNDARY',
            'worker': worker['outcome']}


def cleanup(volume, proof):
    plan = proof['planData']
    check = subprocess.run(['docker', 'volume', 'inspect', volume], capture_output=True, timeout=20)
    if check.returncode:
        return
    value = json.loads(check.stdout)[0]
    labels = value.get('Labels') or {}
    need(value.get('Name') == volume and labels.get('recovery283.nonce') == plan['nonce']
         and labels.get('recovery283.plan') == plan['sha256'], 'CLONE_OWNERSHIP')
    attached = subprocess.run(['docker', 'ps', '-aq', '--filter', 'volume=' + volume],
                              capture_output=True, text=True, timeout=20)
    need(attached.returncode == 0 and not attached.stdout.strip(), 'CLONE_CONTAINER_REMAINS')
    removed = subprocess.run(['docker', 'volume', 'rm', volume], capture_output=True, timeout=20)
    need(removed.returncode == 0, 'CLONE_CLEANUP')


def prove(proof_path: str, build_record: dict) -> dict:
    proof = baseline.input_paths(proof_path)
    volume = 'r282-compat-' + uuid.uuid4().hex[:20]
    common = ['--plan', str(proof['plan']), '--out', str(proof['archive']),
              '--key', str(proof['key'])]
    try:
        restored = node_json(['restore', *common, '--destination', volume, '--execute'], timeout=600)
        need(restored.get('state') == 'RESTORED_ISOLATED', 'CLONE_RESTORE')
        verified = node_json(['verify', *common, '--destination', volume], timeout=300)
        need(verified.get('state') == 'VERIFIED_ISOLATED', 'CLONE_BASELINE')
        old_migrator = proof['planData']['inventory']['images']['migrator']['id']
        before = volume_scan(volume, old_migrator)
        plan = migrator(volume, build_record, 'plan')
        steps = plan.get('steps') if type(plan) is dict else None
        need(type(plan) is dict and plan.get('from') == before['logical']['install']['version']
             and plan.get('to') == build_record['version']
             and plan.get('from') != plan.get('to'), 'CLONE_REGISTRY_EDGE')
        tree_migration = build_record['version'] == '0.63.0'
        contract, old_history = None, None
        if tree_migration:
            source_steps = {'0.61.0': ['COMPATIBLE', 'COMPATIBLE', 'MIGRATION'],
                            '0.61.1': ['COMPATIBLE', 'MIGRATION'], '0.62.0': ['MIGRATION']}
            need(plan.get('state') == 'UPGRADE_MIGRATION_REQUIRED'
                 and plan.get('from') in source_steps and steps == source_steps[plan['from']]
                 and plan.get('requiresApproval') is True
                 and type(plan.get('planId')) is str
                 and re.fullmatch('[a-f0-9]{64}', plan['planId'])
                 and before['logical']['install']['schemaId'] == CPU_SCHEMA,
                 'CLONE_REGISTRY_EDGE')
            assert_owned_clone(volume, proof)
            contract = tree_contract(build_record, plan['from'])
            need(contract['steps'] == steps, 'CLONE_TREE_CONTRACT')
            old_history = history_snapshot(volume, build_record)
            upgraded = migrator(volume, build_record, 'apply', approve_plan=plan['planId'])
        else:
            need(plan.get('state') == 'UPGRADE_COMPATIBLE'
                 and type(steps) is list and 1 <= len(steps) <= 32
                 and all(type(step) is str and step == 'COMPATIBLE' for step in steps)
                 and plan.get('requiresApproval') is False, 'CLONE_REGISTRY_EDGE')
            upgraded = migrator(volume, build_record, 'apply')
        need(upgraded.get('state') == 'G7_GREENFIELD_READY'
             and upgraded.get('mode') == 'UPGRADE', 'CLONE_UPGRADE')
        after = volume_scan(volume, build_record['roles']['migrator']['imageId'])
        old_logical, new_logical = before['logical'], after['logical']
        old_install, new_install = old_logical['install'], new_logical['install']
        if tree_migration:
            new_history = history_snapshot(volume, build_record)
            tree_tables_preserved(before, after, old_history, new_history,
                                  contract['migrationChecksum'])
            need(new_install['schemaId'] == TREE_SCHEMA, 'CLONE_LOGICAL_DRIFT')
        else:
            need(old_logical['tables'] == new_logical['tables']
                 and old_install['schemaId'] == new_install['schemaId'], 'CLONE_LOGICAL_DRIFT')
        need(old_logical['storage'] == new_logical['storage']
             and old_install['installId'] == new_install['installId']
             and new_install['version'] == build_record['version']
             and new_install['sourceCommit'] == build_record['sourceCommit']
             and new_install['appImage'] == build_record['roles']['app']['localTag']
             and new_install['migratorImage'] == build_record['roles']['migrator']['localTag'],
             'CLONE_LOGICAL_DRIFT')
        old_cad = [item for item in before['files'] if item['path'].startswith('cad/')]
        new_cad = [item for item in after['files'] if item['path'].startswith('cad/')]
        need(old_cad == new_cad, 'CLONE_CAD_DRIFT')
        runtime = app_and_worker(volume, build_record)
        return {'state': 'CANDIDATE_COMPATIBLE', 'from': old_install['version'],
                'to': new_install['version'], 'schemaId': new_install['schemaId'],
                'sourceCommit': new_install['sourceCommit'],
                'tablesSha256': hashlib.sha256(json.dumps(new_logical['tables'], sort_keys=True).encode()).hexdigest(),
                'cadCount': new_logical['storage']['cadCount'],
                'sceneAssetCount': new_logical['storage']['sceneAssetCount'],
                'migration': TREE_MIGRATION if tree_migration else None,
                'readyPreservation': 'NOT_EXERCISED' if new_logical['storage']['readyJobs'] +
                                     new_logical['storage']['currentScenes'] == 0 else 'VERIFIED_REFERENCES',
                **runtime}
    finally:
        cleanup(volume, proof)
