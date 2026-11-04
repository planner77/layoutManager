#!/usr/bin/env python3
"""#210 disposable Docker proof for WAL-aware read-only Greenfield inspection.

Creates and labels its own Docker volumes/containers, then removes only those
objects. Never accepts an existing volume. Emits only fixed PASS or stage/code.
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
import uuid

PHASE = "arguments"


def call(command, *, image_run=False, allow_failure=False):
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode and not allow_failure:
        raise RuntimeError("G7_WAL_RO_SMOKE_COMMAND_FAILED")
    return result.stdout.strip(), result.returncode


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def main():
    global PHASE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--migrator", required=True, help="candidate migrator image tag")
    parser.add_argument("--version", default="0.58.1")
    parser.add_argument("--source", help="40 lowercase hex image source commit; defaults to candidate label")
    options = parser.parse_args()
    if not re.fullmatch(r"\d+\.\d+\.\d+", options.version):
        raise RuntimeError("G7_WAL_RO_SMOKE_ARGUMENT_INVALID")
    inspected, _ = call(["docker", "image", "inspect", options.migrator])
    image = json.loads(inspected)[0]
    labels = image.get("Config", {}).get("Labels") or {}
    if (labels.get("org.opencontainers.image.version") != options.version
            or labels.get("com.planner77.g7.image-role") != "migrator"
            or image.get("Os") != "linux" or image.get("Architecture") != "amd64"):
        raise RuntimeError("G7_WAL_RO_SMOKE_CANDIDATE_MISMATCH")
    source = options.source or labels.get("org.opencontainers.image.revision", "")
    if not re.fullmatch(r"[a-f0-9]{40}", source):
        raise RuntimeError("G7_WAL_RO_SMOKE_SOURCE_INVALID")
    if options.migrator.endswith("-migrate"):
        app = options.migrator[:-len("-migrate")]
    else:
        raise RuntimeError("G7_WAL_RO_SMOKE_CANDIDATE_MISMATCH")

    owned = "ci-issue210-wal-" + uuid.uuid4().hex
    restore_volume = owned + "-restore"
    writer = owned + "-writer"
    volumes = []
    containers = []

    def create_volume(name):
        call(["docker", "volume", "create", "--label",
              "com.planner77.g7.synthetic=" + owned, name])
        volumes.append(name)

    def settings():
        return {
            "G7_GREENFIELD_MODE": "true", "G7_GREENFIELD_AUTOMATED": "true",
            "G7_AUTH_ENABLED": "false", "G7_CAD_WRITE_CUTOVER_ENABLED": "false",
            "CAD_STORAGE_BACKEND": "local", "DATABASE_URL": "file:/data/db/cad.sqlite",
            "CAD_STORAGE_PATH": "/data/cad", "G7_DEPLOY_APP_IMAGE": app,
            "G7_DEPLOY_MIGRATOR_IMAGE": options.migrator,
            "G7_RELEASE_SOURCE_COMMIT": source,
        }

    def image_command(volume, *, readonly, command, extra_mounts=(), env=None):
        args = ["docker", "run", "--rm", "--network", "none", "--mount",
                "type=volume,source=" + volume + ",target=/data" + (",readonly" if readonly else "")]
        for mount in extra_mounts:
            args += ["--mount", mount]
        for key, value in (env or settings()).items():
            args += ["--env", key + "=" + value]
        args += ["--entrypoint", "node", options.migrator]
        if command and command[0] == "cli":
            args += ["--import", "tsx", "scripts/g7-greenfield.ts", *command[1:]]
        else:
            args += command
        return call(args, allow_failure=True)

    def cli(volume, action, command_args=(), *, readonly=True, extra_mounts=(), env=None):
        output, status = image_command(volume, readonly=readonly,
            command=("cli", action, *command_args), extra_mounts=extra_mounts, env=env)
        try:
            payload = json.loads(output)
        except Exception:
            payload = {}
        return status, payload

    def snapshot(volume):
        script = r'''const fs=require('node:fs'),crypto=require('node:crypto');
const base='/data/db/',files=['cad.sqlite','g7-install.json'];
const meta=files.map(name=>{const p=base+name,s=fs.statSync(p),b=fs.readFileSync(p);
return {name,dev:s.dev,ino:s.ino,size:s.size,mode:s.mode&0o777,uid:s.uid,sha:crypto.createHash('sha256').update(b).digest('hex')};});
const d=fs.statSync('/data/db');
process.stdout.write(JSON.stringify({dir:{dev:d.dev,ino:d.ino,mode:d.mode&0o777,uid:d.uid},files:meta,entries:fs.readdirSync('/data/db').sort()}));'''
        output, status = image_command(volume, readonly=True, command=("-e", script))
        if status or not output:
            raise RuntimeError("G7_WAL_RO_SMOKE_SNAPSHOT_FAILED")
        return json.loads(output)

    def logical_hash(volume, path="/data/db/cad.sqlite", extra_mounts=()):
        script = r'''import Database from 'better-sqlite3';import {createHash} from 'node:crypto';
import {withReadOnlyInspection} from './server/g7-operational/greenfield-readonly-inspection.ts';
const h=createHash('sha256');withReadOnlyInspection(process.argv[1],file=>{const d=new Database(file,{readonly:true,fileMustExist:true});
for(const {name} of d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_prisma_migrations','SceneBuildJob') ORDER BY name").all()){
if(!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name))throw Error('schema');h.update(name+'\0');
for(const r of d.prepare('SELECT * FROM "'+name+'"').all().map(x=>JSON.stringify(x)).sort())h.update(r+'\n');}
d.close();});process.stdout.write(h.digest('hex'));'''
        output, status = image_command(volume, readonly=True,
            command=("--import", "tsx", "--input-type=module", "-e", script, path),
            extra_mounts=extra_mounts)
        if status or not re.fullmatch(r"[a-f0-9]{64}", output):
            raise RuntimeError("G7_WAL_RO_SMOKE_LOGICAL_SNAPSHOT_FAILED")
        return output

    try:
        PHASE = "volume-create"
        create_volume(owned)
        create_volume(restore_volume)
        PHASE = "initial-install"
        status, _ = cli(owned, "auto", readonly=False)
        if status:
            raise RuntimeError("G7_WAL_RO_SMOKE_INITIAL_INSTALL_FAILED")

        seed_script = r'''const D=require('better-sqlite3'),fs=require('node:fs'),crypto=require('node:crypto');
const d=new D('/data/db/cad.sqlite'),id=crypto.randomUUID();
// This disposable DB was installed by the candidate 0.60 image. Restore the
// exact frozen 0.56 Zone schema AND migration ledger before setting old metadata.
// Merely changing g7-install.json falsely presents the new Job DDL as 0.56.
d.exec('DROP TABLE "SceneBuildJob"');
d.prepare('UPDATE "_prisma_migrations" SET migration_name=?,checksum=?').run(
  '202611010002_greenfield_semantic_zones_baseline',
  crypto.createHash('sha256').update('layoutManager:G7-GREENFIELD-SEMANTIC-ZONES-20261101-1:baseline').digest('hex'));
d.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
.run(id,'qa-wal-admin','synthetic-hash','ACTIVE',0,1,1);
d.prepare('INSERT INTO "UserRoleGrant"(user_id,role,granted_at) VALUES(?,?,?)').run(id,'Admin',1);
d.pragma('journal_mode=WAL');d.close();
const p='/data/db/g7-install.json',m=JSON.parse(fs.readFileSync(p,'utf8'));
m.schemaId='G7-GREENFIELD-SEMANTIC-ZONES-20261101-1';
m.version='0.56.0';m.appImage='ghcr.io/planner77/layoutmanager:0.56.0';
m.migratorImage='ghcr.io/planner77/layoutmanager:0.56.0-migrate';m.sourceCommit='';
fs.writeFileSync(p,JSON.stringify(m),{mode:0o600});'''
        output, status = image_command(owned, readonly=False, command=("-e", seed_script))
        if status:
            raise RuntimeError("G7_WAL_RO_SMOKE_SEED_FAILED")
        initial = snapshot(owned)
        if any(name in initial["entries"] for name in ("cad.sqlite-wal", "cad.sqlite-shm")):
            raise RuntimeError("G7_WAL_RO_SMOKE_STOPPED_SIDECAR_PRESENT")
        logical_hash(owned)

        PHASE = "stopped-wal-readonly-plan-status"
        for action in ("preflight", "plan", "status"):
            status, payload = cli(owned, action)
            if status or payload.get("state") != "UPGRADE_MIGRATION_REQUIRED":
                # Diagnostic is deliberately limited to status/state/code, not
                # source DB contents, tokens, paths or full subprocess output.
                print(json.dumps({"action": action, "exitCode": status,
                                  "state": payload.get("state"),
                                  "code": payload.get("code")}), file=sys.stderr)
                raise RuntimeError("G7_WAL_RO_SMOKE_STOPPED_WAL_BLOCKED")
            if snapshot(owned) != initial:
                raise RuntimeError("G7_WAL_RO_SMOKE_READONLY_SOURCE_CHANGED")

        PHASE = "active-wal-writer"
        active_script = r'''const D=require('better-sqlite3'),crypto=require('node:crypto');
const d=new D('/data/db/cad.sqlite');d.pragma('journal_mode=WAL');d.pragma('wal_autocheckpoint=0');
d.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
.run(crypto.randomUUID(),'qa-wal-pending','synthetic-hash','ACTIVE',0,2,2);
process.stdout.write('G7_WAL_WRITER_READY\n');
process.on('SIGTERM',()=>{d.close();process.exit(0);});setInterval(()=>{},1000);'''
        cmd = ["docker", "run", "--detach", "--name", writer, "--network", "none",
               "--label", "com.planner77.g7.synthetic=" + owned,
               "--mount", "type=volume,source=" + owned + ",target=/data"]
        for key, value in settings().items():
            cmd += ["--env", key + "=" + value]
        cmd += ["--entrypoint", "node", options.migrator, "-e", active_script]
        writer_id, status = call(cmd)
        if status:
            raise RuntimeError("G7_WAL_RO_SMOKE_WRITER_START_FAILED")
        containers.append(writer)
        ready = False
        for _ in range(50):
            logs, _ = call(["docker", "logs", writer], allow_failure=True)
            if "G7_WAL_WRITER_READY" in logs:
                ready = True
                break
            time.sleep(0.2)
        if not ready:
            raise RuntimeError("G7_WAL_RO_SMOKE_WRITER_TIMEOUT")
        active_names, _ = call(["docker", "exec", writer, "node", "-e",
            "const f=require('node:fs');process.stdout.write(JSON.stringify(['cad.sqlite-wal','cad.sqlite-shm'].map(n=>f.existsSync('/data/db/'+n))))"])
        if json.loads(active_names) != [True, True]:
            raise RuntimeError("G7_WAL_RO_SMOKE_ACTIVE_SIDECARS_MISSING")
        row_count_script = r'''const D=require('better-sqlite3');const d=new D('/data/db/cad.sqlite',{readonly:true,fileMustExist:true});
process.stdout.write(String(d.prepare('SELECT COUNT(*) AS n FROM "User"').get().n));d.close();'''
        output, status = image_command(owned, readonly=True, command=("-e", row_count_script))
        if status == 0 and output == "2":
            status, payload = cli(owned, "plan")
            if status or payload.get("state") != "UPGRADE_MIGRATION_REQUIRED":
                raise RuntimeError("G7_WAL_RO_SMOKE_ACTIVE_WAL_PLAN_FAILED")
        elif status != 0:
            # A read-only SQLite runtime may block explicitly while a writer is
            # live; it must never produce a successful stale one-row snapshot.
            plan_status, _ = cli(owned, "plan")
            if plan_status == 0:
                raise RuntimeError("G7_WAL_RO_SMOKE_STALE_ACTIVE_WAL_ACCEPTED")
        else:
            raise RuntimeError("G7_WAL_RO_SMOKE_ACTIVE_WAL_STALE_ROWS")

        PHASE = "stop-writer"
        call(["docker", "stop", "--time", "10", writer])
        call(["docker", "rm", writer])
        containers.remove(writer)
        stopped = snapshot(owned)
        if any(name in stopped["entries"] for name in ("cad.sqlite-wal", "cad.sqlite-shm")):
            raise RuntimeError("G7_WAL_RO_SMOKE_STOPPED_SIDECAR_PRESENT")
        post_writer_hash = logical_hash(owned)

        PHASE = "backup-apply"
        apply_env = settings() | {
            "G7_UPGRADE_MAINTENANCE_ACK": "APP_STOPPED_BY_HOST_HELPER",
            "G7_UPGRADE_PAIR_VERIFIED": "true",
        }
        # The candidate adds the Job table to the original frozen zone
        # baseline. The existing versioned approval policy must remain
        # enforced even for this fully owned, disposable CI volume.
        plan_status, approval = cli(owned, "plan")
        plan_id = approval.get("planId")
        if (plan_status or approval.get("state") != "UPGRADE_MIGRATION_REQUIRED"
                or approval.get("requiresApproval") is not True
                or approval.get("from") != "0.56.0"
                or approval.get("to") != options.version
                or not isinstance(plan_id, str)
                or not re.fullmatch(r"[a-f0-9]{64}", plan_id)):
            raise RuntimeError("G7_WAL_RO_SMOKE_PLAN_INVALID")
        status, payload = cli(owned, "apply", ("--approve-plan", plan_id),
                              readonly=False, env=apply_env)
        backup_id = payload.get("backupId")
        if status or not isinstance(backup_id, str) or not re.fullmatch(r"[0-9a-f-]{36}", backup_id):
            raise RuntimeError("G7_WAL_RO_SMOKE_BACKUP_CREATE_FAILED")
        # Explicitly validate the complete signed next-release schema; the
        # logical hash below excludes only expected new Job/history tables,
        # and still preserves ALL pre-existing business table rows.
        schema_script = r'''import Database from 'better-sqlite3';
import {assertDeclaredSchema,GREENFIELD_UPGRADE_REGISTRY} from './server/g7-operational/greenfield-upgrade-registry.ts';
import {readFileSync} from 'node:fs';
const info=JSON.parse(readFileSync('/data/db/g7-install.json','utf8'));
const release=GREENFIELD_UPGRADE_REGISTRY.releases.find(r=>r.version===info.version);
if(!release||release.schemaId!==info.schemaId)throw Error('release');
const db=new Database('/data/db/cad.sqlite',{readonly:true,fileMustExist:true});
try{
  assertDeclaredSchema(db,release);
  const history=db.prepare('SELECT migration_name FROM "_prisma_migrations" ORDER BY rowid').all();
  if(history.length!==2||history[0].migration_name!=='202611010002_greenfield_semantic_zones_baseline'
    ||history[1].migration_name!=='202611040001_scene_build_job')throw Error('history');
}finally{db.close();}
process.stdout.write('G7_210_APPROVED_JOB_SCHEMA_PASS');'''
        proof, proof_status = image_command(owned, readonly=True,
            command=("--import", "tsx", "--input-type=module", "-e", schema_script))
        if proof_status or proof != "G7_210_APPROVED_JOB_SCHEMA_PASS":
            raise RuntimeError("G7_WAL_RO_SMOKE_MIGRATED_SCHEMA_INVALID")
        upgraded_hash = logical_hash(owned)
        if upgraded_hash != post_writer_hash:
            raise RuntimeError("G7_WAL_RO_SMOKE_UPGRADE_DATA_CHANGED")

        PHASE = "restore-target"
        call(["docker", "run", "--rm", "--network", "none", "--user", "0:0", "--mount",
              "type=volume,source=" + restore_volume + ",target=/restore", "--entrypoint", "sh",
              options.migrator, "-c", "mkdir -m 700 -p /restore/db /restore/cad && chown -R 10001:10001 /restore"])
        restore_env = settings()
        status, restore_payload = cli(owned, "restore", ("--backup", backup_id,
            "--target-db-dir", "/restore/db", "--target-cad-dir", "/restore/cad",
            "--ack-empty-target"), readonly=True,
            extra_mounts=("type=volume,source=" + restore_volume + ",target=/restore",), env=restore_env)
        if status or restore_payload.get("state") != "RESTORED_ISOLATED":
            raise RuntimeError("G7_WAL_RO_SMOKE_RESTORE_FAILED")
        restored_hash = logical_hash(restore_volume, "/restore/db/cad.sqlite",
            ("type=volume,source=" + restore_volume + ",target=/restore,readonly",))
        if restored_hash != post_writer_hash:
            raise RuntimeError("G7_WAL_RO_SMOKE_RESTORE_MISMATCH")
        print("G7_210_DOCKER_READONLY_STOPPED_WAL_ACTIVE_WAL_BACKUP_RESTORE_PASS")
    finally:
        for name in list(containers):
            call(["docker", "rm", "--force", name], allow_failure=True)
        for name in reversed(volumes):
            owner, _ = call(["docker", "volume", "inspect", name, "--format",
                '{{index .Labels "com.planner77.g7.synthetic"}}'], allow_failure=True)
            if owner == owned:
                call(["docker", "volume", "rm", name], allow_failure=True)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(json.dumps({"code": "G7_WAL_RO_SMOKE_FAILED", "stage": PHASE}), file=sys.stderr)
        raise SystemExit(1)
