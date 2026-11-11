import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {ensureAutomatedGreenfield} from '../../server/g7-operational/greenfield-auto.ts';

const src=process.cwd(),tag='vl-issue-281-20261110t221212-83a9616e93f2';
const images={app:`cad-layout-viewer:${tag}-app`,migrator:`cad-layout-viewer:${tag}-migrator`,worker:`cad-layout-viewer:${tag}-worker`};
function cmd(exe,args,timeout=120000,env=process.env){const r=spawnSync(exe,args,{cwd:src,encoding:'utf8',timeout,maxBuffer:16*1024*1024,env});
  if(r.status!==0)throw Error(`${exe} failed: ${r.stderr?.slice(0,1000)}`);return r.stdout.trim();}
function docker(...args){return cmd('docker',args);}
test('synthetic Docker capture resumes only the writer; restore works after source removal',
  {skip:process.env.RECOVERY283_DOCKER!=='1'},()=>{
    const nonce=randomBytes(6).toString('hex'),sourceVolume='r283-source-'+nonce,destVolume='r283-dest-'+nonce,
      writer='r283-worker-'+nonce,root=fs.mkdtempSync(path.join(os.tmpdir(),'r283-docker-'));
    const appAlias=`r283fixture${nonce}:0.61.1`,migratorAlias=`r283fixture${nonce}:0.61.1-migrate`;
    const fixture=path.join(root,'fixture'),db=path.join(fixture,'db'),cad=path.join(fixture,'cad'),
      config=path.join(root,'pilot.env'),compose=path.join(root,'docker-compose.yml'),plan=path.join(root,'plan.json'),out=path.join(root,'backup'),keyDir=path.join(root,'keys');
    fs.mkdirSync(db,{recursive:true,mode:0o700});fs.mkdirSync(cad,{mode:0o700});
    docker('tag',images.app,appAlias);docker('tag',images.migrator,migratorAlias);
    const sourceCommit=JSON.parse(docker('image','inspect',images.app))[0].Config.Labels['org.opencontainers.image.revision'];
    const env={G7_GREENFIELD_MODE:'true',G7_GREENFIELD_AUTOMATED:'true',DATABASE_URL:'file:'+path.join(db,'cad.sqlite'),
      CAD_STORAGE_BACKEND:'local',CAD_STORAGE_PATH:cad,G7_DEPLOY_APP_IMAGE:appAlias,
      G7_DEPLOY_MIGRATOR_IMAGE:migratorAlias,G7_RELEASE_SOURCE_COMMIT:sourceCommit,
      G7_AUTH_ENABLED:'false',G7_CAD_WRITE_CUTOVER_ENABLED:'false'};
    ensureAutomatedGreenfield(env);fs.writeFileSync(path.join(cad,'fixture.dxf'),'SYNTHETIC CAD',{mode:0o600});
    fs.writeFileSync(config,'SYNTHETIC_SECRET=private-only\n',{mode:0o600});
    fs.writeFileSync(compose,'services:\n  app:\n    image: synthetic\n',{mode:0o600});
    const cli=['scripts/recovery-local.mjs'];
    const common=['--volume',sourceVolume,'--config',config,'--compose',compose,
      ...Object.entries(images).flatMap(([r,i])=>['--image',r+'='+i]),
      '--writer','app=r283-absent-app-'+nonce,'--writer','migrator=r283-absent-migrator-'+nonce,'--writer','worker='+writer];
    try{
      docker('volume','create','--label','recovery283.fixture='+nonce,sourceVolume);
      const copyScript=`const fs=require('fs');fs.cpSync('/fixture/db','/data/db',{recursive:true});fs.cpSync('/fixture/cad','/data/cad',{recursive:true});function own(p){let s=fs.lstatSync(p);fs.chownSync(p,10001,10001);if(s.isDirectory())for(const n of fs.readdirSync(p))own(p+'/'+n)}own('/data/db');own('/data/cad')`;
      docker('run','--rm','--network','none','--user','0:0','--entrypoint','node',
        '--mount',`type=volume,src=${sourceVolume},dst=/data,volume-nocopy`,
        '--mount',`type=bind,src=${fixture},dst=/fixture,readonly`,images.migrator,'-e',copyScript);
      docker('run','-d','--name',writer,'--network','none','--entrypoint','node','--env','CAD_STORAGE_BACKEND=s3',
        '--mount',`type=volume,src=${sourceVolume},dst=/data,volume-nocopy`,images.worker,'-e','process.on("SIGTERM",()=>process.exit(0));setInterval(()=>{},1000)');
      assert.throws(()=>cmd('node',[...cli,'inventory',...common]),/RECOVERY283_NONLOCAL_STORAGE/);
      docker('rm','-f',writer);
      docker('run','-d','--name',writer,'--network','none','--entrypoint','node',
        '--mount',`type=volume,src=${sourceVolume},dst=/data,volume-nocopy`,images.worker,'-e','process.on("SIGTERM",()=>process.exit(0));setInterval(()=>{},1000)');
      fs.writeFileSync(config,'CAD_STORAGE_BACKEND=s3\nSYNTHETIC_SECRET=private-only\n',{mode:0o600});
      assert.throws(()=>cmd('node',[...cli,'inventory',...common]),/RECOVERY283_NONLOCAL_STORAGE/);
      fs.writeFileSync(config,'SYNTHETIC_SECRET=private-only\n',{mode:0o600});
      const inv=JSON.parse(cmd('node',[...cli,'inventory',...common]));
      assert.equal(inv.writers.app,'missing');assert.equal(inv.writers.worker,'running');
      cmd('node',[...cli,'plan',...common,'--plan',plan,'--max-seconds','180']);
      const privateParent=path.join(root,'private-parent'),alias=path.join(root,'parent-alias');
      fs.mkdirSync(privateParent,{mode:0o700});fs.symlinkSync(privateParent,alias);
      assert.throws(()=>cmd('node',[...cli,'capture','--plan',plan,'--out',path.join(root,'alias-out'),
        '--key-dir',path.join(alias,'keys'),'--execute']),/RECOVERY283_PRIVATE_PARENT/);
      assert.equal(fs.existsSync(path.join(root,'alias-out')),false);
      assert.equal(JSON.parse(docker('container','inspect',writer))[0].State.Running,true);
      const intact=fs.readFileSync(plan),tampered=JSON.parse(intact);tampered.maxSeconds=181;
      fs.writeFileSync(plan,JSON.stringify(tampered),{mode:0o600});
      assert.throws(()=>cmd('node',[...cli,'capture','--plan',plan,'--out',path.join(root,'tampered'),
        '--key-dir',path.join(root,'tampered-keys'),'--execute']),/RECOVERY283_PLAN/);
      fs.writeFileSync(plan,intact,{mode:0o600});
      const stranger='r283-unknown-'+nonce;
      docker('run','-d','--name',stranger,'--network','none','--entrypoint','node',
        '--mount',`type=volume,src=${sourceVolume},dst=/data,volume-nocopy`,images.worker,'-e','setInterval(()=>{},1000)');
      try{assert.throws(()=>cmd('node',[...cli,'capture','--plan',plan,'--out',path.join(root,'unknown'),
        '--key-dir',path.join(root,'unknown-keys'),'--execute']),/RECOVERY283_UNKNOWN_WRITER/);}
      finally{docker('rm','-f',stranger);}
      const wrapper=path.join(root,'bin');fs.mkdirSync(wrapper,{mode:0o700});
      const realDocker=cmd('which',['docker']);
      fs.writeFileSync(path.join(wrapper,'docker'),`#!/bin/sh\nif [ "$1" = stop ]; then ${realDocker} "$@"; exit 1; fi\nexec ${realDocker} "$@"\n`,{mode:0o700});
      assert.throws(()=>cmd('node',[...cli,'capture','--plan',plan,'--out',path.join(root,'lost-ack'),
        '--key-dir',path.join(root,'lost-ack-keys'),'--execute'],240000,{...process.env,PATH:wrapper+':'+process.env.PATH}),/RECOVERY283_COMMAND/);
      assert.equal(JSON.parse(docker('container','inspect',writer))[0].State.Running,true,'lost stop ACK must resume original writer');
      const receipt=JSON.parse(cmd('node',[...cli,'capture','--plan',plan,'--out',out,'--key-dir',keyDir,'--execute'],240000));
      assert.equal(receipt.sourceRelease,'0.61.1');
      assert.equal(receipt.readyPreservation,'NOT_EXERCISED');
      assert.equal(JSON.parse(docker('container','inspect',writer))[0].State.Running,true);
      docker('rm','-f',writer);docker('volume','rm',sourceVolume);fs.rmSync(config);fs.rmSync(compose);
      const result=JSON.parse(cmd('node',[...cli,'restore','--plan',plan,'--out',out,'--key',path.join(keyDir,JSON.parse(fs.readFileSync(plan)).nonce+'.key'),
        '--destination',destVolume,'--execute'],240000));
      assert.equal(result.state,'RESTORED_ISOLATED');
      assert.equal(result.destination,destVolume);
      const key=path.join(keyDir,JSON.parse(fs.readFileSync(plan)).nonce+'.key');
      const verified=JSON.parse(cmd('node',[...cli,'verify','--plan',plan,'--out',out,'--key',key,'--destination',destVolume]));
      assert.equal(verified.state,'VERIFIED_ISOLATED');
      const extracted=path.join(root,'extracted');
      const recovered=JSON.parse(cmd('node',[...cli,'settings','--plan',plan,'--out',out,'--key',key,'--destination-dir',extracted,'--execute']));
      assert.equal(recovered.files,3);
      assert.equal(fs.readFileSync(path.join(extracted,'approved.env'),'utf8'),'SYNTHETIC_SECRET=private-only\n');
      assert.equal(fs.readFileSync(path.join(extracted,'docker-compose.yml'),'utf8'),'services:\n  app:\n    image: synthetic\n');
      const external=path.join(root,'external'),link=path.join(root,'settings-alias');
      fs.mkdirSync(external,{mode:0o700});fs.symlinkSync(external,link);
      assert.throws(()=>cmd('node',[...cli,'settings','--plan',plan,'--out',out,'--key',key,
        '--destination-dir',path.join(link,'export'),'--execute']),/RECOVERY283_PRIVATE_PARENT/);
      assert.deepEqual(fs.readdirSync(external),[],'symlink target must receive no plaintext');
      const existing=path.join(root,'existing');fs.mkdirSync(existing,{mode:0o700});
      assert.throws(()=>cmd('node',[...cli,'settings','--plan',plan,'--out',out,'--key',key,
        '--destination-dir',existing,'--execute']),/RECOVERY283_DESTINATION_EXISTS/);
      assert.deepEqual(fs.readdirSync(existing),[]);
      const probed=JSON.parse(cmd('node',[...cli,'probe','--plan',plan,'--out',out,'--key',key,'--destination',destVolume,'--execute'],240000));
      assert.equal(probed.appHealth,'PASS');assert.equal(probed.appRead,'PASS');assert.equal(probed.worker,'IDLE');
    }finally{
      spawnSync('docker',['rm','-f',writer],{stdio:'ignore'});
      for(const v of [sourceVolume,destVolume])spawnSync('docker',['volume','rm',v],{stdio:'ignore'});
      for(const tag of [appAlias,migratorAlias])spawnSync('docker',['image','rm',tag],{stdio:'ignore'});
      fs.rmSync(root,{recursive:true,force:true});
    }
  });
