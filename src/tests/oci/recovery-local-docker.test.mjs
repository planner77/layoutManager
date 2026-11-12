import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {ensureAutomatedGreenfield} from '../../server/g7-operational/greenfield-auto.ts';

const src=process.cwd();
const sourceUrl='https://github.com/planner77/layoutManager';
function currentImages(env=process.env,inspect=(ref)=>JSON.parse(docker('image','inspect',ref))[0]){
  const runId=env.VERIFY_LOCAL_RUN_ID, fingerprint=env.VERIFY_LOCAL_SOURCE_FINGERPRINT;
  const prerequisite='current verify:local run required: set VERIFY_LOCAL_RUN_ID and VERIFY_LOCAL_SOURCE_FINGERPRINT; first run python3 scripts/verify_local_docker.py --mode worktree with the same values, or use verify:local';
  if(!/^[A-Za-z0-9-]{1,80}$/.test(runId??'')||!/^[a-f0-9]{64}$/.test(fingerprint??''))throw Error(prerequisite);
  const prefix=`cad-layout-viewer:vl-${runId.toLowerCase()}`;
  const refs={app:`${prefix}-app`,migrator:`${prefix}-migrator`,worker:`${prefix}-worker`};
  const expectedRoles={app:'app',migrator:'migrator',worker:'cpu-worker'};
  const version=JSON.parse(fs.readFileSync(path.join(src,'package.json'),'utf8')).version;
  const head=cmd('git',['rev-parse','HEAD']);
  const images={};
  for(const [role,ref] of Object.entries(refs)){
    let image;
    try{image=inspect(ref);}catch{throw Error(`${prerequisite}; missing ${role} image`);}
    const labels=image?.Config?.Labels??{};
    if(labels['com.planner77.g7.image-role']!==expectedRoles[role]||
      labels['org.opencontainers.image.version']!==version||
      labels['org.opencontainers.image.revision']!==head||
      labels['org.opencontainers.image.source']!==sourceUrl||
      labels['com.planner77.local.source-fingerprint']!==fingerprint||
      image.Architecture!=='amd64'||!/^sha256:[a-f0-9]{64}$/.test(image.Id??''))
      throw Error(`${prerequisite}; ${role} image metadata mismatch`);
    images[role]=image.Id;
  }
  return {images,version,head,refs};
}
function cmd(exe,args,timeout=120000,env=process.env){const r=spawnSync(exe,args,{cwd:src,encoding:'utf8',timeout,maxBuffer:16*1024*1024,env});
  if(r.status!==0)throw Error(`${exe} failed: ${r.stderr?.slice(0,1000)}`);return r.stdout.trim();}
function docker(...args){return cmd('docker',args);}
function ownedLabel(kind,name,label,value){
  const result=spawnSync('docker',[kind,'inspect',name],{cwd:src,encoding:'utf8',timeout:10000});
  if(result.status!==0)return false;
  try{const resource=JSON.parse(result.stdout)[0];
    return resource?.Config?.Labels?.[label]===value||resource?.Labels?.[label]===value;}
  catch{return false;}
}
test('current-run image prerequisite rejects missing and foreign metadata before fixture creation',()=>{
  let inspected=0;
  assert.throws(()=>currentImages({},()=>{inspected++;}),/VERIFY_LOCAL_RUN_ID/);
  assert.equal(inspected,0);
  const env={VERIFY_LOCAL_RUN_ID:'issue-215-test',VERIFY_LOCAL_SOURCE_FINGERPRINT:'a'.repeat(64)};
  const version=JSON.parse(fs.readFileSync(path.join(src,'package.json'),'utf8')).version;
  const head=cmd('git',['rev-parse','HEAD']);
  const labels={'com.planner77.g7.image-role':'app','org.opencontainers.image.version':version,
    'org.opencontainers.image.revision':head,'org.opencontainers.image.source':sourceUrl,
    'com.planner77.local.source-fingerprint':env.VERIFY_LOCAL_SOURCE_FINGERPRINT};
  const image={Id:'sha256:'+'b'.repeat(64),Architecture:'amd64',Config:{Labels:labels}};
  assert.throws(()=>currentImages(env,()=>{throw Error('missing');}),/missing app image/);
  for(const key of Object.keys(labels)){
    const bad=structuredClone(image);bad.Config.Labels[key]='foreign';
    assert.throws(()=>currentImages(env,()=>bad),/metadata mismatch/);
  }
  for(const change of [{Architecture:'arm64'},{Id:'foreign'}])
    assert.throws(()=>currentImages(env,()=>({...image,...change})),/metadata mismatch/);
  const roles={app:'app',migrator:'migrator',worker:'cpu-worker'};
  const resolved=currentImages(env,(ref)=>({...image,Config:{Labels:{...labels,
    'com.planner77.g7.image-role':roles[ref.slice(ref.lastIndexOf('-')+1)]}}}));
  assert.equal(Object.keys(resolved.images).length,3);
  assert.equal(resolved.version,version);
});
test('initial alias setup failure removes only nonce-owned resources',
  {skip:process.env.RECOVERY283_DOCKER!=='1'||process.env.RECOVERY283_TEST_CHILD==='1'},()=>{
    currentImages();
    const childEnv={...process.env,RECOVERY283_TEST_CHILD:'1',RECOVERY283_FAIL_AFTER_APP_ALIAS:'1'};
    delete childEnv.NODE_TEST_CONTEXT;
    const child=spawnSync('node',['--import','tsx','--test','tests/oci/recovery-local-docker.test.mjs'],
      {cwd:src,encoding:'utf8',timeout:120000,env:childEnv});
    const output=child.stdout+'\n'+child.stderr;
    assert.notEqual(child.status,0,output.slice(0,1500));
    const nonce=output.match(/SYNTHETIC_EARLY_ALIAS_FAILURE:([a-f0-9]{12})/)?.[1];
    assert.ok(nonce,'child must fail at the intended early setup point');
    assert.notEqual(spawnSync('docker',['image','inspect',`r283fixture${nonce}:${JSON.parse(fs.readFileSync(path.join(src,'package.json'),'utf8')).version}`],{stdio:'ignore'}).status,0);
    assert.notEqual(spawnSync('docker',['volume','inspect','r283-source-'+nonce],{stdio:'ignore'}).status,0);
    assert.equal(fs.readdirSync(os.tmpdir()).some(name=>name.startsWith(`r283-docker-${nonce}-`)),false);
  });
test('synthetic Docker capture resumes only the writer; restore works after source removal',
  {skip:process.env.RECOVERY283_DOCKER!=='1'},()=>{
    const {images,version,head}=currentImages();
    const nonce=randomBytes(6).toString('hex'),sourceVolume='r283-source-'+nonce,destVolume='r283-dest-'+nonce,
      writer='r283-worker-'+nonce;
    const appAlias=`r283fixture${nonce}:${version}`,migratorAlias=`r283fixture${nonce}:${version}-migrate`;
    let root,appAliasOwned=false,migratorAliasOwned=false,sourceVolumeOwned=false,destVolumeOwned=false,writerOwned=false;
    try{
    root=fs.mkdtempSync(path.join(os.tmpdir(),`r283-docker-${nonce}-`));
    const fixture=path.join(root,'fixture'),db=path.join(fixture,'db'),cad=path.join(fixture,'cad'),
      config=path.join(root,'pilot.env'),compose=path.join(root,'docker-compose.yml'),plan=path.join(root,'plan.json'),out=path.join(root,'backup'),keyDir=path.join(root,'keys');
    fs.mkdirSync(db,{recursive:true,mode:0o700});fs.mkdirSync(cad,{mode:0o700});
    for(const alias of [appAlias,migratorAlias]){
      if(spawnSync('docker',['image','inspect',alias],{stdio:'ignore'}).status===0)throw Error('owned fixture alias already exists');
    }
    for(const volume of [sourceVolume,destVolume]){
      if(spawnSync('docker',['volume','inspect',volume],{stdio:'ignore'}).status===0)throw Error('owned fixture volume already exists');
    }
    if(spawnSync('docker',['container','inspect',writer],{stdio:'ignore'}).status===0)throw Error('owned fixture writer already exists');
    docker('tag',images.app,appAlias);appAliasOwned=true;
    if(process.env.RECOVERY283_FAIL_AFTER_APP_ALIAS==='1')throw Error('SYNTHETIC_EARLY_ALIAS_FAILURE:'+nonce);
    docker('tag',images.migrator,migratorAlias);migratorAliasOwned=true;
    assert.equal(JSON.parse(docker('image','inspect',appAlias))[0].Id,images.app);
    assert.equal(JSON.parse(docker('image','inspect',migratorAlias))[0].Id,images.migrator);
    const sourceCommit=head;
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
      docker('volume','create','--label','recovery283.fixture='+nonce,sourceVolume);sourceVolumeOwned=true;
      const copyScript=`const fs=require('fs');fs.cpSync('/fixture/db','/data/db',{recursive:true});fs.cpSync('/fixture/cad','/data/cad',{recursive:true});function own(p){let s=fs.lstatSync(p);fs.chownSync(p,10001,10001);if(s.isDirectory())for(const n of fs.readdirSync(p))own(p+'/'+n)}own('/data/db');own('/data/cad')`;
      docker('run','--rm','--network','none','--user','0:0','--entrypoint','node',
        '--mount',`type=volume,src=${sourceVolume},dst=/data,volume-nocopy`,
        '--mount',`type=bind,src=${fixture},dst=/fixture,readonly`,images.migrator,'-e',copyScript);
      docker('run','-d','--name',writer,'--label','recovery283.fixture='+nonce,'--network','none','--entrypoint','node','--env','CAD_STORAGE_BACKEND=s3',
        '--mount',`type=volume,src=${sourceVolume},dst=/data,volume-nocopy`,images.worker,'-e','process.on("SIGTERM",()=>process.exit(0));setInterval(()=>{},1000)');
      writerOwned=true;
      assert.throws(()=>cmd('node',[...cli,'inventory',...common]),/RECOVERY283_NONLOCAL_STORAGE/);
      docker('rm','-f',writer);writerOwned=false;
      docker('run','-d','--name',writer,'--label','recovery283.fixture='+nonce,'--network','none','--entrypoint','node',
        '--mount',`type=volume,src=${sourceVolume},dst=/data,volume-nocopy`,images.worker,'-e','process.on("SIGTERM",()=>process.exit(0));setInterval(()=>{},1000)');
      writerOwned=true;
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
      assert.equal(receipt.sourceRelease,version);
      assert.equal(receipt.readyPreservation,'NOT_EXERCISED');
      assert.equal(JSON.parse(docker('container','inspect',writer))[0].State.Running,true);
      docker('rm','-f',writer);writerOwned=false;
      docker('volume','rm',sourceVolume);sourceVolumeOwned=false;fs.rmSync(config);fs.rmSync(compose);
      destVolumeOwned=true;
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
      if(writerOwned&&ownedLabel('container',writer,'recovery283.fixture',nonce))
        spawnSync('docker',['rm','-f',writer],{stdio:'ignore'});
      if(sourceVolumeOwned&&ownedLabel('volume',sourceVolume,'recovery283.fixture',nonce))
        spawnSync('docker',['volume','rm',sourceVolume],{stdio:'ignore'});
      if(destVolumeOwned){
        let planSha;
        try{planSha=JSON.parse(fs.readFileSync(path.join(root,'plan.json'),'utf8')).sha256;}catch{}
        if(planSha&&ownedLabel('volume',destVolume,'recovery283.plan',planSha))
          spawnSync('docker',['volume','rm',destVolume],{stdio:'ignore'});
      }
      for(const tag of [appAliasOwned&&appAlias,migratorAliasOwned&&migratorAlias].filter(Boolean))spawnSync('docker',['image','rm',tag],{stdio:'ignore'});
      if(root)fs.rmSync(root,{recursive:true,force:true});
    }
  });
