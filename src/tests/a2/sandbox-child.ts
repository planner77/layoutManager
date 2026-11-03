/** Test-only, strict-sandbox Chromium probe. No operational Worker uses this path. */
import {createHash} from 'node:crypto';
import {readFile,readdir,readlink,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';
import {chromium,type Browser} from '@playwright/test';
import {a2SyntheticDxf} from './fixtures';
import {sceneSha256} from '../../domain/scene-digest';
import {validateStoredScenePayload} from '../../domain/scene-payload';

type Artifact={bytes:number[];manifest:{scope:{versionId:string;sourceSha256:string};sha256:string;byteLength:number}};
type ProbeReport={schema:1;status:'EXPECTED_RESTORE_BLOCK'|'FAIL';browserMajor:number;
  isolation?:{rendererUserNsDistinct:boolean;rendererPidNsDistinct:boolean;rendererSeccompFilters:number;
    rendererNoNewPrivs:boolean;rendererCapEffZero:boolean;noNoSandboxFlag:boolean;noUnsafeSwiftshaderFlag:boolean};
  candidate?:{validated:boolean;readback:boolean;nodes:number;vertices:number;bytes:number};
  restore:'WEBGL_CONTEXT_UNAVAILABLE'|'UNEXPECTED_SUCCESS'|'NOT_RUN';failure?:string};
const versionId='11111111-1111-4111-8111-111111111111';
const dxf=a2SyntheticDxf;
const sourceSha256=createHash('sha256').update(dxf).digest('hex');
const report:ProbeReport={schema:1,status:'FAIL',browserMajor:0,restore:'NOT_RUN'};
let stage='START';
const deadline=setTimeout(()=>{process.stdout.write(`A2_SANDBOX_REPORT:${JSON.stringify({...report,failure:'DEADLINE_'+stage})}\n`);process.exit(40);},160_000);

async function bounded<T>(name:string,ms:number,work:()=>Promise<T>):Promise<T>{
  stage=name;
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([work(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(`TIMEOUT_${name}`)),ms);})]);}
  finally{if(timer)clearTimeout(timer);}
}
async function bundle(path:string){
  const result=await build({entryPoints:[path],bundle:true,platform:'browser',format:'esm',target:'chrome115',write:false,logLevel:'silent'});
  return result.outputFiles[0].text;
}
async function launch(){
  const browser=await bounded('LAUNCH',25_000,()=>chromium.launch({headless:true,
    executablePath:process.env.A2_CHROMIUM_EXECUTABLE||undefined,chromiumSandbox:true,
    ignoreDefaultArgs:['--enable-unsafe-swiftshader'],
    args:['--disable-setuid-sandbox','--disable-gpu','--disable-software-rasterizer']}));
  const major=Number(browser.version().split('.')[0]);
  if(major!==153){await browser.close();throw new Error('BROWSER_VERSION');}
  report.browserMajor=major;
  return browser;
}
async function pageFor(browser:Browser,entry:string,font:string,errors:string[]){
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/fonts/CadKorean.typeface.json',route=>route.fulfill({status:200,contentType:'application/json',body:font}));
  await context.route('**/__a2-entry.js',route=>route.fulfill({status:200,contentType:'application/javascript',body:entry}));
  await context.route('**/__a2',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><script type="module" src="/__a2-entry.js"></script>'}));
  const page=await context.newPage();
  page.on('pageerror',()=>errors.push('PAGEERROR'));page.on('crash',()=>errors.push('CRASH'));
  await bounded('HARNESS_READY',20_000,async()=>{
    await page.goto('http://localhost/__a2');
    await page.waitForFunction(()=>Boolean((window as unknown as {a2Candidate?:unknown;a2Live?:unknown}).a2Candidate||
      (window as unknown as {a2Candidate?:unknown;a2Live?:unknown}).a2Live),undefined,{timeout:20_000});
  });
  return page;
}
function field(status:string,name:string){return status.match(new RegExp(`^${name}:\\s*(.*)$`,'m'))?.[1]??'';}
async function isolation(){
  const rows=[];
  for(const pid of (await readdir('/proc')).filter(x=>/^\d+$/.test(x))){
    try{
      const cmd=(await readFile(`/proc/${pid}/cmdline`)).toString();
      if(!cmd.includes('chrome-headless-shell'))continue;
      rows.push({cmd,status:await readFile(`/proc/${pid}/status`,'utf8'),
        userNs:await readlink(`/proc/${pid}/ns/user`),pidNs:await readlink(`/proc/${pid}/ns/pid`)});
    }catch{/* Process may exit between listing and reading. */}
  }
  const browser=rows.find(x=>!x.cmd.includes('--type='));
  const renderer=rows.find(x=>x.cmd.includes('--type=renderer'));
  if(!browser||!renderer)throw new Error('RENDERER_MISSING');
  const result={rendererUserNsDistinct:renderer.userNs!==browser.userNs,
    rendererPidNsDistinct:renderer.pidNs!==browser.pidNs,
    rendererSeccompFilters:Number(field(renderer.status,'Seccomp_filters')),
    rendererNoNewPrivs:field(renderer.status,'NoNewPrivs')==='1',
    rendererCapEffZero:/^0+$/.test(field(renderer.status,'CapEff')),
    noNoSandboxFlag:rows.every(x=>!x.cmd.includes('--no-sandbox')),
    noUnsafeSwiftshaderFlag:rows.every(x=>!x.cmd.includes('--enable-unsafe-swiftshader'))};
  if(!result.rendererUserNsDistinct||!result.rendererPidNsDistinct||
    field(renderer.status,'Seccomp')!=='2'||result.rendererSeccompFilters<2||
    !result.rendererNoNewPrivs||!result.rendererCapEffZero||
    !result.noNoSandboxFlag||!result.noUnsafeSwiftshaderFlag)throw new Error('ISOLATION_UNMET');
  return result;
}
async function run(){
  let browser:Browser|undefined;let folder:string|undefined;
  const errors:string[]=[];
  try{
    const [candidateScript,liveScript,font]=await Promise.all([
      bundle('tests/a2/candidate-browser.ts'),bundle('tests/a2/live-browser.ts'),
      readFile('public/fonts/CadKorean.typeface.json','utf8')]);
    const parsed=JSON.parse(font) as {glyphs?:Record<string,{o?:string}>};
    if(!parsed.glyphs?.['한']?.o||!parsed.glyphs?.['글']?.o)throw new Error('FONT_GLYPHS_MISSING');
    browser=await launch();
    const candidatePage=await pageFor(browser,candidateScript,font,errors);
    report.isolation=await bounded('ISOLATION',10_000,isolation);
    stage='CONVERT';
    const wire=await bounded('CONVERT',70_000,()=>candidatePage.evaluate(async input=>{
      const api=(window as unknown as {a2Candidate:{build:(value:typeof input)=>Promise<unknown>}}).a2Candidate;
      return JSON.stringify(await api.build(input));
    },{dxf,versionId,sourceSha256}));
    const candidate=JSON.parse(wire) as {artifact:Artifact;inventory:{nodes:Array<{geometry?:{attributes?:{position?:{array?:number[]}}}|null}>};sourceSha256:string};
    const bytes=Uint8Array.from(candidate.artifact.bytes),manifest=candidate.artifact.manifest;
    validateStoredScenePayload(bytes,manifest as Parameters<typeof validateStoredScenePayload>[1]);
    const nodes=candidate.inventory.nodes.length;
    const vertices=candidate.inventory.nodes.reduce((n,item)=>n+(item.geometry?.attributes?.position?.array?.length??0)/3,0);
    if(candidate.sourceSha256!==sourceSha256||manifest.scope.versionId!==versionId||
      manifest.scope.sourceSha256!==sourceSha256||manifest.byteLength!==bytes.length||
      sceneSha256(bytes)!==manifest.sha256||nodes<2||vertices<1||errors.length)throw new Error('CANDIDATE_INVALID');
    folder=await mkdtemp(join(tmpdir(),'a2-secure-'));
    const path=join(folder,'candidate.dto');
    await writeFile(path,bytes,{flag:'wx'});
    const readback=await readFile(path);
    validateStoredScenePayload(readback,manifest as Parameters<typeof validateStoredScenePayload>[1]);
    if(readback.length!==bytes.length||sceneSha256(readback)!==manifest.sha256)throw new Error('READBACK_INVALID');
    report.candidate={validated:true,readback:true,nodes,vertices,bytes:bytes.length};
    await candidatePage.context().close();await browser.close();browser=undefined;

    browser=await launch();
    const restorePage=await pageFor(browser,liveScript,font,errors);
    stage='RESTORE';
    try{
      await bounded('RESTORE',70_000,()=>restorePage.evaluate(async raw=>{
        const api=(window as unknown as {a2Live:{loadScene:(arg:unknown)=>Promise<unknown>}}).a2Live;
        return JSON.stringify(await api.loadScene({artifact:JSON.parse(raw)}));
      },JSON.stringify({bytes:[...readback],manifest})));
      report.restore='UNEXPECTED_SUCCESS';throw new Error('RESTORE_UNEXPECTED_SUCCESS');
    }catch(error){
      if(error instanceof Error && error.message.includes('Error creating WebGL context.'))
        report.restore='WEBGL_CONTEXT_UNAVAILABLE';
      else throw error;
    }
    if(errors.length)throw new Error('BROWSER_ERROR');
    await restorePage.context().close();await browser.close();browser=undefined;
    report.status='EXPECTED_RESTORE_BLOCK';
  }finally{if(browser)await browser.close().catch(()=>{});if(folder)await rm(folder,{recursive:true,force:true});}
}
void run().catch(error=>{report.failure=error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)
  ?error.message:'PROBE_ERROR';process.exitCode=1;}).finally(()=>{
  clearTimeout(deadline);process.stdout.write(`A2_SANDBOX_REPORT:${JSON.stringify(report)}\n`);
});
