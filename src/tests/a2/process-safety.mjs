/** Host-side, test-only Docker supervisor for #218 A2-S01..S06. */
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const image=process.env.A2_PROOF_IMAGE;
if(!image || !/^[\w./:@-]+$/.test(image)) throw new Error('A2_IMAGE_REQUIRED');
const reportDir=process.env.A2_PROCESS_REPORT_DIR || '/tmp/a2-process-safety';
const runId=(process.env.A2_PROCESS_RUN_ID || `${Date.now()}-${process.pid}`).replace(/[^A-Za-z0-9_.-]/g,'_');
const label=`io.layoutmanager.a2-process-run=${runId}`;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const modes=['stall','sigkill','oom','node-uncaught','node-unhandled','browser-late'];
const allowedPhases=new Set(['START','CONVERT_BEGIN','CONVERTED','FAULT_READY','BROWSER_PAGEERROR',
  'BROWSER_CRASH','BROWSER_REQUEST_FAILED','READBACK_VALID','RESTORE_VALID','QUIET_VALID',
  'FAIL_NODE_UNCAUGHT','FAIL_NODE_UNHANDLED','FAIL_BROWSER_LATE','FAIL_LATE_BROWSER_NOT_OBSERVED',
  'FAIL_LATE_NOT_OBSERVED','FAIL_RUN','FAIL_RESTORE','FAIL_QUIET_OR_SOURCE','FAIL_BROWSER_ERROR',
  'FAIL_CANDIDATE_INTEGRITY','FAIL_READBACK','FAIL_BROWSER_VERSION','FAIL_CHILD_DEADLINE',
  'FAIL_TIMEOUT_LAUNCH','FAIL_TIMEOUT_HARNESS_READY','FAIL_TIMEOUT_CONVERSION','FAIL_TIMEOUT_RESTORE','SANDBOX_LAUNCH',
  'SANDBOX_BLOCKED','SANDBOX_LAUNCHED','SANDBOX_CONVERTED']);

function cmd(args,limitMs=20_000){
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{stdio:['ignore','pipe','pipe']});
    let out='',err='';
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('DOCKER_TIMEOUT'));},limitMs);
    child.stdout.on('data',data=>{out+=data.toString();if(out.length>2_000_000)child.kill('SIGKILL');});
    child.stderr.on('data',data=>{err+=data.toString();if(err.length>2_000_000)child.kill('SIGKILL');});
    child.on('error',()=>{clearTimeout(timer);reject(new Error('DOCKER_SPAWN'));});
    child.on('close',code=>{
      clearTimeout(timer);
      if(code!==0)reject(new Error(`DOCKER_EXIT_${code}`));
      else resolve(out.trim());
    });
  });
}

function safeLog(raw){
  const phases=[];let receipt,childPid;
  for(const line of raw.split(/\r?\n/)){
    if(line.startsWith('A2_PHASE:')){
      const value=line.slice(9);
      if(allowedPhases.has(value)) phases.push(value);
    }else if(line.startsWith('A2_PID:')){
      const value=Number(line.slice(7));
      if(Number.isSafeInteger(value)&&value>1)childPid=value;
    }else if(line.startsWith('A2_RECEIPT:')){
      try{
        const item=JSON.parse(line.slice(11));
        if(item?.mode==='normal' && ['nodes','vertices','bytes'].every(k=>Number.isSafeInteger(item[k])&&item[k]>0) &&
          item.readback===1 && item.restore===1 && item.quiet===1)
          receipt={nodes:item.nodes,vertices:item.vertices,bytes:item.bytes,readback:1,restore:1,quiet:1};
      }catch{ /* raw output is never forwarded */ }
    }
  }
  return {phases,receipt,childPid};
}

async function inspect(id){
  const state=JSON.parse(await cmd(['inspect','--format','{{json .State}}',id]));
  return {running:state.Running===true,exitCode:state.ExitCode,oomKilled:state.OOMKilled===true,
    pid:state.Pid,dead:state.Dead===true};
}

async function start(mode){
  const args=['run','-d','--label',label,'--network','none','--read-only','--user','10001:10001',
    '--init','--cpus','2','--memory','1536m','--memory-swap','1536m','--shm-size','256m',
    '--pids-limit','256','--cap-drop','ALL','--security-opt','no-new-privileges',
    '--tmpfs','/tmp:rw,nosuid,nodev,size=512m,mode=1777','--stop-timeout','3',
    image,'node','--import','tsx','tests/a2/process-child.ts',mode];
  const id=await cmd(args,60_000);
  if(!/^[0-9a-f]{64}$/.test(id))throw new Error('CONTAINER_ID_INVALID');
  try{await verifyLimits(id);}catch(error){await cmd(['rm','-f',id]).catch(()=>{});throw error;}
  return id;
}

async function verifyLimits(id){
  const value=JSON.parse(await cmd(['inspect','--format','{{json .}}',id]));
  const h=value.HostConfig,c=value.Config;
  if(h.NanoCpus!==2_000_000_000 || h.Memory!==1536*1024*1024 ||
    h.MemorySwap!==1536*1024*1024 || h.ShmSize!==256*1024*1024 || h.PidsLimit!==256 ||
    h.ReadonlyRootfs!==true || h.NetworkMode!=='none' || h.Privileged!==false ||
    h.Init!==true || !h.CapDrop?.includes('ALL') || !h.SecurityOpt?.includes('no-new-privileges') ||
    !h.Tmpfs?.['/tmp']?.includes('size=512m') || h.Binds?.length || c.User!=='10001:10001')
    throw new Error('CONTAINMENT_LIMITS_INVALID');
}

async function observe(id,mode){
  const begin=Date.now(),deadline=begin+15*60_000;
  let killed=false,readyAt=0,pidBefore=0,latest={phases:[],receipt:undefined},lastState;
  while(Date.now()<deadline){
    const [raw,state]=await Promise.all([cmd(['logs',id]),inspect(id)]);
    latest=safeLog(raw);lastState=state;
    if(latest.phases.includes('FAULT_READY')&&!readyAt){readyAt=Date.now();pidBefore=latest.childPid??0;}
    if(mode==='stall' && readyAt && Date.now()-readyAt>=2_000){
      if(state.running){await cmd(['kill','--signal','KILL',id]);killed=true;}
    }
    if(mode==='sigkill' && readyAt && state.running){
      await cmd(['exec',id,'/bin/sh','-c','kill -KILL "$1"','_',String(pidBefore)]);
      killed=true;
    }
    if(!state.running)break;
    await pause(250);
  }
  if(lastState?.running){await cmd(['kill','--signal','KILL',id]);killed=true;lastState=await inspect(id);}
  if(lastState?.running)throw new Error('CONTAINER_NOT_STOPPED');
  return {mode,phases:latest.phases,receipt:latest.receipt,exitCode:lastState?.exitCode,
    oomKilled:lastState?.oomKilled,pidBefore,pidAfter:lastState?.pid,
    supervisorKilled:killed,ready:readyAt>0,durationMs:Date.now()-begin};
}

function checkFault(result){
  const {mode,phases,receipt,exitCode,oomKilled,supervisorKilled,ready}=result;
  if(!phases.includes('CONVERTED') || !ready || result.pidBefore<=0 || receipt || exitCode===0 || result.pidAfter!==0)
    throw new Error(`FAULT_GATE_${mode}`);
  if(mode==='stall' && !supervisorKilled)throw new Error('STALL_KILL_MISSING');
  if(mode==='sigkill' && !supervisorKilled)throw new Error('SIGKILL_MISSING');
  if(mode==='oom' && !oomKilled)throw new Error('OOM_NOT_VERIFIED');
  if(mode==='node-uncaught' && !phases.includes('FAIL_NODE_UNCAUGHT'))throw new Error('UNCAUGHT_NOT_OBSERVED');
  if(mode==='node-unhandled' && !phases.includes('FAIL_NODE_UNHANDLED'))throw new Error('UNHANDLED_NOT_OBSERVED');
  if(mode==='browser-late' && !(phases.includes('BROWSER_PAGEERROR') && phases.includes('FAIL_BROWSER_LATE')))
    throw new Error('BROWSER_LATE_NOT_OBSERVED');
}

function checkRecovery(result){
  if(result.exitCode!==0 || result.oomKilled || result.pidAfter!==0 || !result.receipt ||
    !['CONVERTED','READBACK_VALID','RESTORE_VALID','QUIET_VALID'].every(p=>result.phases.includes(p)))
    throw new Error('RECOVERY_GATE');
}

async function one(mode){
  let id;
  try{
    id=await start(mode);
    const result=await observe(id,mode);
    return result;
  }finally{if(id)await cmd(['rm','-f',id]).catch(()=>{throw new Error('CONTAINER_CLEANUP_FAILED');});}
}

async function main(){
  await mkdir(reportDir,{recursive:true});
  const acceptedDir=join(reportDir,runId);
  await mkdir(acceptedDir,{recursive:true});
  const sourceHash=await cmd(['run','--rm','--network','none','--read-only','--user','10001:10001',
    '--entrypoint','sha256sum',image,'/app/src/tests/a2/fixtures.ts']);
  const report={schema:1,runId,limits:{cpu:2,memoryMiB:1536,memorySwapTotalMiB:1536,shmMiB:256,pids:256,
    uid:10001,readOnly:true,network:'none',capDrop:'ALL',noNewPrivileges:true,tmpMiB:512,containerDeadlineMs:900000},cases:[]};
  try{
    for(const mode of modes){
      const marker=join(acceptedDir,`${mode}.accepted.json`);
      if(existsSync(marker))throw new Error('ACCEPTED_BEFORE_FAULT');
      report.current={mode,stage:'FAULT_RUNNING'};
      const fault=await one(mode);
      report.current={mode,stage:'FAULT_FINISHED',fault};
      checkFault(fault);
      if(existsSync(marker))throw new Error('ACCEPTED_ON_FAULT');
      const postFaultHash=await cmd(['run','--rm','--network','none','--read-only','--user','10001:10001',
        '--entrypoint','sha256sum',image,'/app/src/tests/a2/fixtures.ts']);
      if(postFaultHash!==sourceHash)throw new Error('SOURCE_CHANGED');
      report.current={mode,stage:'RECOVERY_RUNNING',fault};
      const recovery=await one('normal');
      report.current={mode,stage:'RECOVERY_FINISHED',fault,recovery};
      checkRecovery(recovery);
      await writeFile(marker,JSON.stringify({mode,receipt:recovery.receipt}),{flag:'wx'});
      const row={mode,fault,recovery,sourceUnchanged:true};
      report.cases.push(row);
      delete report.current;
      process.stdout.write(`A2_PROCESS_CASE:${JSON.stringify({mode,negative:true,recovery:true,
        faultExit:fault.exitCode,oomKilled:fault.oomKilled,recoveryNodes:recovery.receipt.nodes,
        recoveryBytes:recovery.receipt.bytes})}\n`);
    }
    const sandbox=await one('sandbox-probe');
    if(sandbox.exitCode!==0 || sandbox.pidAfter!==0)throw new Error('SANDBOX_PROBE_FAILED');
    if(sandbox.phases.includes('SANDBOX_BLOCKED')){
      report.sandbox={status:'BLOCKED',reason:'LAUNCH_REJECTED',scope:'CHROMIUM_LAUNCH_ONLY'};
    }else{
      checkRecovery(sandbox);
      if(!sandbox.phases.includes('SANDBOX_CONVERTED'))throw new Error('SANDBOX_CONVERSION_MISSING');
      report.sandbox={status:'CAPABILITY_OBSERVED',nodes:sandbox.receipt.nodes,scope:'CHROMIUM_LAUNCH_AND_CANDIDATE_ONLY'};
    }
    report.pass=true;
  }catch(error){
    report.pass=false;
    const code=error instanceof Error?error.message:'';
    report.failure=/^(?:FAULT_GATE_[a-z-]+|DOCKER_EXIT_\d+|[A-Z0-9_]+)$/.test(code)
      ?code.replaceAll('-','_'):'SUPERVISOR_ERROR';
  }finally{
    await writeFile(join(reportDir,'process-safety.json'),JSON.stringify(report,null,2));
    const loaded=JSON.parse(await readFile(join(reportDir,'process-safety.json'),'utf8'));
    if(loaded.pass!==true)process.exitCode=1;
    process.stdout.write(`A2_PROCESS_RESULT:${loaded.pass?'PASS':'FAIL'}:${loaded.failure||'NONE'}\n`);
  }
}
export {safeLog,checkFault,checkRecovery};
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)await main();
