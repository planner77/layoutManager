/** Host-only bounded Docker supervisor for a research probe, never an A2 GO gate. */
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {verifyProfiles,targetedPath} from './sandbox-profile.mjs';

const image=process.env.A2_PROOF_IMAGE;
if(!image||!(/^[\w./:@-]+$/).test(image))throw new Error('A2_IMAGE_REQUIRED');
const reportDir=process.env.A2_SANDBOX_REPORT_DIR||'/tmp/a2-sandbox-probe';
const runId=process.env.A2_SANDBOX_RUN_ID||`${Date.now()}-${process.pid}`;
if(!/^[A-Za-z0-9_.-]{1,80}$/.test(runId))throw new Error('A2_RUN_ID_INVALID');
const label=`io.layoutmanager.a2-sandbox-probe=${runId}`;
const deadlineMs=210_000;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function cmd(args,timeoutMs=20_000){
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{stdio:['ignore','pipe','pipe']});
    let out='',err='';
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('DOCKER_TIMEOUT'));},timeoutMs);
    child.stdout.on('data',data=>{out+=data.toString();if(out.length>100_000)child.kill('SIGKILL');});
    child.stderr.on('data',data=>{err+=data.toString();if(err.length>100_000)child.kill('SIGKILL');});
    child.on('error',()=>{clearTimeout(timer);reject(new Error('DOCKER_SPAWN'));});
    child.on('close',code=>{clearTimeout(timer);if(code===0)resolve(out.trim());else reject(new Error(`DOCKER_EXIT_${code}`));});
  });
}
async function inspect(id){return JSON.parse(await cmd(['inspect','--format','{{json .}}',id]));}
function verifyContainer(value){
  const h=value.HostConfig,c=value.Config;
  if(h.NanoCpus!==2_000_000_000||h.Memory!==1536*1024*1024||h.MemorySwap!==1536*1024*1024||
    h.ShmSize!==256*1024*1024||h.PidsLimit!==256||h.ReadonlyRootfs!==true||h.NetworkMode!=='none'||
    h.Privileged!==false||h.Init!==true||!h.CapDrop?.includes('ALL')||
    h.CapAdd?.length||h.IpcMode!=='private'||h.PidMode==='host'||h.UsernsMode==='host'||
    !h.SecurityOpt?.some(x=>x.startsWith('no-new-privileges'))||
    !h.SecurityOpt?.some(x=>x.startsWith('seccomp='))||
    !h.Tmpfs?.['/tmp']?.includes('size=512m')||Object.keys(h.Tmpfs??{}).length!==1||
    h.Binds?.length||h.Mounts?.length||h.VolumesFrom?.length||value.Mounts?.length||
    c.User!=='10001:10001')
    throw new Error('CONTAINER_LIMITS');
}
async function cleanupOwned(){
  const raw=await cmd(['ps','-aq','--filter',`label=${label}`]);
  const ids=raw?raw.split(/\r?\n/):[];
  if(ids.some(x=>!(/^[0-9a-f]{12,64}$/).test(x)))throw new Error('CONTAINER_CLEANUP_IDS');
  for(const id of ids)await cmd(['rm','-f',id]);
  if(await cmd(['ps','-aq','--filter',`label=${label}`]))throw new Error('CONTAINER_CLEANUP_REMAINS');
}
function parseChild(raw){
  const lines=raw.split(/\r?\n/).filter(x=>x.startsWith('A2_SANDBOX_REPORT:'));
  if(lines.length!==1)throw new Error('CHILD_REPORT_COUNT');
  let value;try{value=JSON.parse(lines[0].slice('A2_SANDBOX_REPORT:'.length));}catch{throw new Error('CHILD_REPORT_JSON');}
  const i=value?.isolation,c=value?.candidate;
  if(value?.schema!==1||value.status!=='EXPECTED_RESTORE_BLOCK'||value.browserMajor!==153||
    value.restore!=='WEBGL_CONTEXT_UNAVAILABLE'||value.failure||
    !i?.rendererUserNsDistinct||!i?.rendererPidNsDistinct||i.rendererSeccompFilters<2||
    !i?.rendererNoNewPrivs||!i?.rendererCapEffZero||!i?.noNoSandboxFlag||!i?.noUnsafeSwiftshaderFlag||
    c?.validated!==true||c?.readback!==true||!(c.nodes>=2)||!(c.vertices>=1)||!(c.bytes>0))
    throw new Error('CHILD_GATE');
  return value;
}
async function run(){
  const profiles=await verifyProfiles();
  const args=['run','-d','--label',label,'--network','none','--ipc','private','--read-only','--user','10001:10001',
    '--init','--cpus','2','--memory','1536m','--memory-swap','1536m','--shm-size','256m',
    '--pids-limit','256','--cap-drop','ALL','--security-opt','no-new-privileges',
    '--security-opt',`seccomp=${targetedPath}`,
    '--tmpfs','/tmp:rw,nosuid,nodev,size=512m,mode=1777','--stop-timeout','3',
    image,'node','--import','tsx','tests/a2/sandbox-child.ts'];
  let id;
  try{
    id=await cmd(args,60_000);
    if(!/^[0-9a-f]{64}$/.test(id))throw new Error('CONTAINER_ID');
    verifyContainer(await inspect(id));
    const end=Date.now()+deadlineMs;
    let value;
    while(Date.now()<end){value=await inspect(id);if(!value.State.Running)break;await pause(250);}
    if(value?.State?.Running)throw new Error('CONTAINER_DEADLINE');
    if(value?.State?.ExitCode!==0||value?.State?.OOMKilled||value?.State?.Pid!==0)
      throw new Error('CONTAINER_EXIT');
    const child=parseChild(await cmd(['logs',id]));
    return {schema:1,status:'RESEARCH_ONLY_NO_GO',runId,profile:profiles,
      limits:{uid:10001,cpu:2,memoryMiB:1536,swapTotalMiB:1536,shmMiB:256,pids:256,
        readOnly:true,network:'none',capDrop:'ALL',noNewPrivileges:true,tmpMiB:512},
      container:{exitCode:0,oomKilled:false,pidAfter:0},child};
  }finally{
    try{if(id)await cmd(['rm','-f',id]);await cleanupOwned();}
    catch{throw new Error('CONTAINER_CLEANUP');}
  }
}
await mkdir(reportDir,{recursive:true});
let result;
try{result=await run();}catch(error){process.exitCode=1;result={schema:1,status:'PROBE_FAILED',runId,
  failure:error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'SUPERVISOR_ERROR'};}
await writeFile(join(reportDir,'sandbox-probe.json'),JSON.stringify(result,null,2));
process.stdout.write(`A2_SANDBOX_PROBE:${result.status}:${result.failure||'NONE'}\n`);
