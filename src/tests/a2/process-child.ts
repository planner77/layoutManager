/** Isolated, test-only converter process. The host supervisor owns acceptance. */
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from '@playwright/test';
import { a2SyntheticDxf } from './fixtures';
import { sceneSha256 } from '../../domain/scene-digest';
import { validateStoredScenePayload } from '../../domain/scene-payload';
import { compareParity } from './compare-parity';

const mode = process.argv[2];
const modes = new Set(['normal','stall','sigkill','oom','node-uncaught','node-unhandled','browser-late','sandbox-probe']);
if (!modes.has(mode)) process.exit(64);
const versionId = '11111111-1111-4111-8111-111111111111';
const dxf = a2SyntheticDxf;
const sourceSha256 = createHash('sha256').update(dxf).digest('hex');
type Inventory = {nodes:Array<{geometry?:{attributes?:{position?:{array?:number[]}}}|null}>};
const counts = (inventory:Inventory) => ({nodes:inventory.nodes.length,
  vertices:inventory.nodes.reduce((sum,node)=>sum+(node.geometry?.attributes?.position?.array?.length??0)/3,0)});
const phase = (name: string) => process.stdout.write(`A2_PHASE:${name}\n`);
const fail = (name: string): never => { phase(`FAIL_${name}`); process.exit(40); };
const childDeadline=setTimeout(()=>fail('CHILD_DEADLINE'),180_000);
async function bounded<T>(name:'LAUNCH'|'HARNESS_READY'|'CONVERSION'|'RESTORE',ms:number,work:()=>Promise<T>):Promise<T>{
  const timer=setTimeout(()=>fail(`TIMEOUT_${name}`),ms);
  try{return await work();}finally{clearTimeout(timer);}
}
process.on('uncaughtException', () => fail('NODE_UNCAUGHT'));
process.on('unhandledRejection', () => fail('NODE_UNHANDLED'));

async function pageFor(browser: Browser, entry: string, font: string, errors: string[]): Promise<Page> {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/fonts/CadKorean.typeface.json', route => route.fulfill({status:200,contentType:'application/json',body:font}));
  await context.route('**/__a2-entry.js', route => route.fulfill({status:200,contentType:'application/javascript',body:entry}));
  await context.route('**/__a2', route => route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><div id="a2"></div><script type="module" src="/__a2-entry.js"></script>'}));
  const page = await context.newPage();
  page.on('pageerror', () => {errors.push('PAGEERROR'); phase('BROWSER_PAGEERROR');});
  page.on('crash', () => {errors.push('CRASH'); phase('BROWSER_CRASH');});
  page.on('requestfailed', () => {errors.push('REQUEST'); phase('BROWSER_REQUEST_FAILED');});
  await bounded('HARNESS_READY',20_000,async()=>{
    await page.goto('http://localhost/__a2');
    await page.waitForFunction(() => Boolean((window as unknown as {a2Candidate?:unknown;a2Live?:unknown}).a2Candidate ||
      (window as unknown as {a2Candidate?:unknown;a2Live?:unknown}).a2Live),undefined,{timeout:20_000});
  });
  return page;
}

async function bundle(entry: string): Promise<string> {
  const output = await build({entryPoints:[entry],bundle:true,platform:'browser',format:'esm',write:false,logLevel:'silent'});
  return output.outputFiles[0].text;
}

async function launch(strictSandbox=false): Promise<Browser> {
  const browser = await bounded('LAUNCH',25_000,()=>chromium.launch({headless:true,executablePath:process.env.A2_CHROMIUM_EXECUTABLE || undefined,
    chromiumSandbox:strictSandbox,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}));
  if (process.env.A2_BROWSER_EXPECTED_MAJOR && browser.version().split('.')[0] !== process.env.A2_BROWSER_EXPECTED_MAJOR) fail('BROWSER_VERSION');
  return browser;
}

async function run(): Promise<void> {
  phase('START');
  process.stdout.write(`A2_PID:${process.pid}\n`);
  const [candidateScript,liveScript,font] = await Promise.all([
    bundle('tests/a2/candidate-browser.ts'),bundle('tests/a2/live-browser.ts'),
    readFile('public/fonts/CadKorean.typeface.json','utf8'),
  ]);
  const errors: string[] = [];
  let browser:Browser;
  if(mode==='sandbox-probe'){
    phase('SANDBOX_LAUNCH');
    try{browser=await launch(true);}
    catch{phase('SANDBOX_BLOCKED');return;}
    phase('SANDBOX_LAUNCHED');
  }else browser=await launch();
  const page = await pageFor(browser,candidateScript,font,errors);
  phase('CONVERT_BEGIN');
  const wire = await bounded('CONVERSION',70_000,()=>page.evaluate(async input => {
    const api = (window as unknown as {a2Candidate:{build:(arg:typeof input)=>Promise<unknown>}}).a2Candidate;
    return JSON.stringify(await api.build(input));
  },{dxf,versionId,sourceSha256}));
  const candidate = JSON.parse(wire) as {artifact:{bytes:number[];manifest:{scope:{versionId:string;sourceSha256:string};sha256:string;byteLength:number}},inventory:Inventory,textIndex:unknown,sourceSha256:string};
  const convertedCounts=counts(candidate.inventory);
  const bytes = Uint8Array.from(candidate.artifact.bytes);
  const manifest = candidate.artifact.manifest;
  validateStoredScenePayload(bytes,manifest as Parameters<typeof validateStoredScenePayload>[1]);
  if(candidate.sourceSha256!==sourceSha256 || manifest.scope.sourceSha256!==sourceSha256 ||
     manifest.scope.versionId!==versionId || manifest.byteLength!==bytes.length ||
     sceneSha256(bytes)!==manifest.sha256 || convertedCounts.nodes<2 || convertedCounts.vertices<1)
    fail('CANDIDATE_INTEGRITY');
  phase('CONVERTED');
  if(mode==='sandbox-probe')phase('SANDBOX_CONVERTED');

  if(mode==='stall' || mode==='sigkill') {
    phase('FAULT_READY');
    await new Promise<never>(()=>undefined);
  }
  if(mode==='oom') {
    phase('FAULT_READY');
    // Touch every page and retain buffers. Docker memory cap, not V8 heap, must kill this process.
    const held: Buffer[]=[];
    while(true){const b=Buffer.allocUnsafe(32*1024*1024);b.fill(0xa5);held.push(b);}
  }
  if(mode==='node-uncaught') {
    phase('FAULT_READY');
    setTimeout(()=>{throw new Error('A2_TEST_LATE_UNCAUGHT');},150);
    await new Promise(resolve=>setTimeout(resolve,1000));
    fail('LATE_NOT_OBSERVED');
  }
  if(mode==='node-unhandled') {
    phase('FAULT_READY');
    setTimeout(()=>{void Promise.reject(new Error('A2_TEST_LATE_REJECTION'));},150);
    await new Promise(resolve=>setTimeout(resolve,1000));
    fail('LATE_NOT_OBSERVED');
  }
  if(mode==='browser-late') {
    phase('FAULT_READY');
    await page.evaluate(()=>{setTimeout(()=>{throw new Error('A2_TEST_LATE_BROWSER');},150);});
    await page.waitForTimeout(850);
    if(errors.length!==1 || errors[0]!=='PAGEERROR') fail('LATE_BROWSER_NOT_OBSERVED');
    fail('BROWSER_LATE');
  }

  if(errors.length) fail('BROWSER_ERROR');
  const folder = await mkdtemp(join(tmpdir(),'a2-process-'));
  try {
    const path = join(folder,'candidate.dto');
    await writeFile(path,bytes,{flag:'wx'});
    const readback = await readFile(path);
    validateStoredScenePayload(readback,manifest as Parameters<typeof validateStoredScenePayload>[1]);
    if(sceneSha256(readback)!==manifest.sha256 || readback.length!==bytes.length) fail('READBACK');
    phase('READBACK_VALID');
    await page.context().close();
    await browser.close();
    browser = await launch();
    const restoredPage = await pageFor(browser,liveScript,font,errors);
    const restored = await bounded('RESTORE',70_000,()=>restoredPage.evaluate(async rawText => {
      const api=(window as unknown as {a2Live:{loadScene:(input:unknown)=>Promise<unknown>}}).a2Live;
      return JSON.stringify(await api.loadScene({artifact:JSON.parse(rawText)}));
    },JSON.stringify(candidate.artifact)));
    const result=JSON.parse(restored) as {inventory?:Inventory;loaded?:unknown;textIndex?:unknown};
    if(!result.inventory || counts(result.inventory).nodes!==convertedCounts.nodes ||
      counts(result.inventory).vertices!==convertedCounts.vertices || !result.textIndex || !result.loaded) return fail('RESTORE');
    compareParity(result.inventory,candidate.inventory,'restored');
    compareParity(result.textIndex,candidate.textIndex,'textIndex');
    phase('RESTORE_VALID');
    await restoredPage.context().close();
    await browser.close();
    await new Promise(resolve=>setTimeout(resolve,800));
    if(errors.length || createHash('sha256').update(dxf).digest('hex')!==sourceSha256) fail('QUIET_OR_SOURCE');
    phase('QUIET_VALID');
    process.stdout.write(`A2_RECEIPT:${JSON.stringify({mode:'normal',nodes:convertedCounts.nodes,vertices:convertedCounts.vertices,bytes:bytes.length,readback:1,restore:1,quiet:1})}\n`);
  } finally {await rm(folder,{recursive:true,force:true});}
}
void run().catch(()=>fail('RUN')).finally(()=>clearTimeout(childDeadline));
