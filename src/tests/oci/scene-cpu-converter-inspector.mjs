/** Test-only entrypoint. The inspector controller runs in a child process so the
 * converter thread can remain paused while the controller verifies its frame.
 * Mounted read-only into one disposable, networkless OCI; never in an image.
 */
import {fork} from 'node:child_process';
import {open as openInspector,url as inspectorUrl,close as closeInspector} from 'node:inspector';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync} from 'node:fs';

const source='/app/src/server/scene/cpu-line-candidate.ts';
const anchor="return {lines,sourceUnit:'DXF_INSUNITS_4'};";
const mode=process.env.CI_CONVERTER_FAULT_MODE;
if(!['kill','oom'].includes(mode))throw new Error('OCI_CONVERTER_MODE_INVALID');
const marker='/data/ci-scene-converter-'+mode+'.marker';

if(process.env.CI_INSPECTOR_CONTROLLER!=='true'){
  // Loopback exists only inside this networkless container; Docker publishes
  // no port. The controller uses CDP over this local endpoint.
  openInspector(0,'127.0.0.1');
  // Do not inherit --import tsx: this controller needs only built-in modules.
  const worker=fork(fileURLToPath(import.meta.url),[],{
    env:{...process.env,CI_INSPECTOR_CONTROLLER:'true',CI_INSPECTOR_URL:inspectorUrl()},
    execArgv:[],stdio:['ignore','inherit','inherit','ipc']});
  try{
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('OCI_INSPECTOR_SETUP_TIMEOUT')),10_000);
      worker.once('message',message=>{
        clearTimeout(timer);
        if(message==='READY')resolve();
        else reject(new Error('OCI_INSPECTOR_SETUP_FAILED'));
      });
      worker.once('error',reject);
    });
    // Import the real Worker module, bind the parser breakpoint, then invoke
    // the same exported tick used by its CLI. Recovery uses the CLI directly.
    const armed=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('OCI_INSPECTOR_ARM_TIMEOUT')),15_000);
      worker.on('message',message=>{
        if(message==='ARMED'){clearTimeout(timer);resolve();}
        else if(message==='FAILED'){clearTimeout(timer);reject(new Error('OCI_INSPECTOR_ARM_FAILED'));}
      });
    });
    const {runCpuWorkerTick}=await import('./scene-cpu-worker.ts');
    await armed;
    await runCpuWorkerTick();
    throw new Error('OCI_CONVERTER_FAULT_NOT_REACHED');
  }catch(error){
    const reason=error instanceof Error&&error.message==='OCI_CONVERTER_FAULT_NOT_REACHED'
      ?'NO_BREAKPOINT':'WORKER_THROW';
    process.stderr.write('OCI_CONVERTER_TEST_ENTRY_FAILED '+reason+'\n');
    worker.kill('SIGTERM');
    closeInspector();
    process.exit(5);
  }
}else{
  const original=readFileSync(source,'utf8');
  const lines=original.split('\n');
  const anchorLine=lines.findIndex(line=>line.trim()===anchor);
  if(anchorLine<0||lines.filter(line=>line.trim()===anchor).length!==1||
      !original.includes('lines.push(parseLine(current,handles));current=null;'))
    throw new Error('OCI_CONVERTER_SOURCE_DRIFT');
  const socket=new WebSocket(process.env.CI_INSPECTOR_URL);
  await new Promise((resolve,reject)=>{
    socket.addEventListener('open',resolve,{once:true});
    socket.addEventListener('error',reject,{once:true});
  });
  let nextId=0;
  const pending=new Map(),listeners=new Map();
  const post=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++nextId;
    pending.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params}));
  });
  socket.addEventListener('message',event=>{
    const packet=JSON.parse(event.data);
    if(packet.id){
      const slot=pending.get(packet.id);
      pending.delete(packet.id);
      if(packet.error)slot?.reject(new Error('OCI_CDP_COMMAND_FAILED'));
      else slot?.resolve(packet.result);
    }else if(packet.method)listeners.get(packet.method)?.({params:packet.params});
  });
  const on=(event,callback)=>listeners.set(event,callback);
  let seen=false,breakpointId='',breakpointLocation;
  on('Debugger.scriptParsed',async ({params})=>{
    if(!params.url.startsWith('file:///app/src/server/scene/cpu-line-candidate.ts'))return;
    try{
      if(breakpointId)throw new Error('OCI_CONVERTER_DUPLICATE_SOURCE');
      const script=await post('Debugger.getScriptSource',{scriptId:params.scriptId});
      const match=[...script.scriptSource.matchAll(/return\s*\{\s*lines\s*,\s*sourceUnit\s*:\s*["']DXF_INSUNITS_4["']\s*\}/g)];
      if(match.length!==1)throw new Error('OCI_CONVERTER_GENERATED_ANCHOR_DRIFT');
      const prefix=script.scriptSource.slice(0,match[0].index);
      const lineNumber=prefix.split('\n').length-1;
      const columnNumber=prefix.length-prefix.lastIndexOf('\n')-1;
      const possible=await post('Debugger.getPossibleBreakpoints',{
        start:{scriptId:params.scriptId,lineNumber,columnNumber:Math.max(0,columnNumber-30)},
        end:{scriptId:params.scriptId,lineNumber,columnNumber:columnNumber+match[0][0].length+30}});
      const returnPoints=possible.locations.filter(x=>x.type==='return'&&
        x.lineNumber===lineNumber&&x.columnNumber>=columnNumber&&
        x.columnNumber<=columnNumber+match[0][0].length);
      if(returnPoints.length<2)throw new Error('OCI_CONVERTER_RETURN_POINTS_DRIFT');
      const returnPoint=returnPoints.at(-1);
      const result=await post('Debugger.setBreakpoint',{
        location:{scriptId:params.scriptId,lineNumber,columnNumber:returnPoint.columnNumber}});
      breakpointId=result.breakpointId;
      breakpointLocation=result.actualLocation;
      if(!breakpointId||breakpointLocation?.scriptId!==params.scriptId||
          breakpointLocation.lineNumber!==lineNumber||
          breakpointLocation.columnNumber!==returnPoint.columnNumber)
        throw new Error('OCI_CONVERTER_BREAKPOINT_UNBOUND');
      process.stdout.write('OCI_INSPECTOR_BREAKPOINT_ARMED\n');
      process.send('ARMED');
    }catch{
      process.send('FAILED');
    }
  });
  on('Debugger.paused',async ({params})=>{
    process.stdout.write('OCI_INSPECTOR_PAUSED reason='+params.reason+
      ' hits='+String(params.hitBreakpoints?.length||0)+'\n');
    if(seen)return;
    if(!breakpointId||!params.hitBreakpoints?.includes(breakpointId)){
      await post('Debugger.resume');return;
    }
    const frame=params.callFrames.find(item=>item.functionName==='parseCpuLineOnlyDxf');
    if(!frame){process.stderr.write('OCI_CONVERTER_FRAME_MISSING\n');process.exit(4);}
    if(frame.location.scriptId!==breakpointLocation.scriptId||
        frame.location.lineNumber!==breakpointLocation.lineNumber||
        frame.location.columnNumber!==breakpointLocation.columnNumber){
      process.stderr.write('OCI_CONVERTER_LOCATION_MISMATCH\n');process.exit(4);
    }
    seen=true;
    try{
      const result=await post('Debugger.evaluateOnCallFrame',{
        callFrameId:frame.callFrameId,expression:'lines.length >= 1 && current === null && eof === true',
        returnByValue:true,throwOnSideEffect:true});
      if(result.exceptionDetails||result.result.value!==true)
        throw new Error('OCI_CONVERTER_LINE_NOT_PARSED');
      writeFileSync(marker,'PARSED_LINE:'+mode,{flag:'wx',mode:0o600});
      process.stdout.write('OCI_CONVERTER_FRAME_READY\n');
      if(mode==='oom'){
        // Execute the bounded pressure in the paused converter's own process.
        // The controller is separate only so CDP can receive paused events.
        await post('Debugger.evaluateOnCallFrame',{
          callFrameId:frame.callFrameId,
          expression:'(()=>{const blocks=[];for(let i=0;i<128;i++){const block=globalThis.Buffer.allocUnsafe(16*1024*1024);block.fill(i);blocks.push(block)}return blocks.length})()',
          returnByValue:true});
        throw new Error('OCI_CGROUP_OOM_NOT_REACHED');
      }
      // SIGKILL comes from host after it separately verifies durable DB + marker.
    }catch{process.stderr.write('OCI_CONVERTER_FRAME_FAILED\n');process.exit(4);}
  });
  await post('Debugger.enable');
  await post('Debugger.setBreakpointsActive',{active:true});
  process.send('READY');
}
