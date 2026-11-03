/**
 * #218 / P1-A2, synthetic CPU-only technical test (NOT a runtime worker).
 *
 * Use the exact pre-existing Scene PoC browser converter entrypoint that
 * succeeds in the General Chromium E2E, rather than independently bundling
 * an unverified second DXFViewer bootstrap that failed before input parsing
 * in CI #506/#514/#525. Extend it with full persisted DTO validation,
 * immutable source SHA, real Korean TTF, file restore and CPU-only constraints.
 * Even full success here is not evidence of #212 live Viewer Adapter parity,
 * G7 authorization, authenticated publish or operational availability.
 */
import { test, expect, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';
import { sceneSha256 } from '../../domain/scene-digest';
import { SCENE_PAYLOAD_LIMITS, validateStoredScenePayload } from '../../domain/scene-payload';
import type { SceneManifest } from '../../domain/cad-scene';
import { extractDxfText } from '../../viewers/core/text-index';
import { a2LineOnlyDxf, a2CycleDxf, a2ExplosionDxf, a2SyntheticDxf } from './fixtures';
import { A2_EXPANSION_LIMIT, A2_SOURCE_LIMIT, preflightA2Dxf } from './dxf-risk-preflight';

const source = new TextEncoder().encode(a2SyntheticDxf);
const sourceSha = createHash('sha256').update(source).digest('hex');
const executablePath = process.env.A2_CHROMIUM_EXECUTABLE || undefined;
const A2_HARNESS_ORIGIN = 'http://localhost';
const LAUNCH_LIMIT_MS = 25_000;
const HARNESS_LIMIT_MS = 20_000;
const CONVERSION_LIMIT_MS = 70_000;

type Inventory = {
  nodes: number;
  vertices: number;
  materials: number;
  kinds: Record<string,number>;
  layers: Record<string,number>;
  ids: string[];
  geometryTrace: number[][];
  geometryById: Record<string,number[]>;
  visibilityTrace: boolean[];
  nameTrace: string[];
  bbox: number[];
};
type Packet = {
  format: string;
  bytes: number[];
  manifest?: SceneManifest;
  stats: Record<string,unknown>;
};
type RestoreResult = { rendered: boolean; restored: Inventory; restoreMs: number };
type BrowserApi = {
  produce: (dxf:string,sha:string,mode?:'ALL'|'DTO_ONLY') => Promise<Packet[]>;
  restore: (packet:Packet, expected?: SceneManifest) => Promise<RestoreResult>;
};
function note(phase: string): void {
  // Constant non-sensitive phases only: never CAD bytes, source SHA, user data
  // or arbitrary upstream JS exceptions.
  console.info('A2_HOST_PHASE:' + phase);
}
async function bounded<T>(name:string,ms:number,action:()=>Promise<T>):Promise<T>{
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      action(),
      new Promise<never>((_,reject)=>{
        timer = setTimeout(()=>reject(new Error('A2_TIMEOUT:' + name)),ms);
      }),
    ]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
function projectFont():string{
  const input = readFileSync('public/fonts/NanumGothic-Regular.ttf');
  const font = new TTFLoader().parse(input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength));
  font.familyName = 'CAD Korean';
  const info = (font as unknown as {
    original_font_information?:Record<string,unknown>
  }).original_font_information;
  if(info) for(const key of ['fontFamily','fullName','postScriptName','preferredFamily','uniqueID']){
    if(info[key])info[key]={en:'CAD Korean'};
  }
  if(!font.glyphs['한']||!font.glyphs['글'])throw new Error('A2_KOREAN_GLYPHS_NOT_PROVEN');
  return JSON.stringify(font);
}
function compareInventory(actual:Inventory,expected:Inventory):void{
  for(const k of ['nodes','vertices','materials','kinds','layers','ids',
    'visibilityTrace','nameTrace'] as const)expect(actual[k],k).toEqual(expected[k]);
  expect(actual.geometryTrace.length).toBe(expected.geometryTrace.length);
  for(let i=0;i<actual.geometryTrace.length;i++){
    const a=actual.geometryTrace[i],b=expected.geometryTrace[i];
    expect(a.length).toBe(b.length);
    a.forEach((x,j)=>expect(Math.abs(x-b[j])).toBeLessThanOrEqual(1e-5));
  }
  const aIds=Object.keys(actual.geometryById).sort();
  const bIds=Object.keys(expected.geometryById).sort();
  expect(aIds).toEqual(bIds);
  for(const id of aIds){
    const a=actual.geometryById[id],b=expected.geometryById[id];
    expect(a.length).toBe(b.length);
    a.forEach((x,j)=>expect(Math.abs(x-b[j])).toBeLessThanOrEqual(1e-5));
  }
  expect(actual.bbox.length).toBe(6);
  actual.bbox.forEach((n,i)=>expect(Math.abs(n-expected.bbox[i])).toBeLessThanOrEqual(1e-5));
}
async function browserFor(software:boolean):Promise<Browser>{
  note(software?'SWIFT_CHROMIUM_LAUNCH':'BASELINE_CHROMIUM_LAUNCH');
  const browser=await bounded('CHROMIUM_LAUNCH',LAUNCH_LIMIT_MS,()=>chromium.launch({
    headless:true,executablePath,chromiumSandbox:false,
    args:software?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[],
  }));
  const major=browser.version().split('.')[0];
  if(process.env.A2_BROWSER_EXPECTED_MAJOR && major!==process.env.A2_BROWSER_EXPECTED_MAJOR){
    await browser.close();throw new Error('A2_BROWSER_VERSION_MISMATCH');
  }
  note('BROWSER_MAJOR_'+major);
  return browser;
}
async function prepare(
  context:BrowserContext,bundle:string,font:string,errors:string[],
):Promise<Page>{
  let served=false;
  await context.route('**/fonts/CadKorean.typeface.json',r=>
    r.fulfill({status:200,contentType:'application/json',body:font}));
  await context.route('**/__scene-poc.js',r=>{
    served=true;
    note('REFERENCE_SCRIPT_REQUESTED');
    return r.fulfill({status:200,contentType:'application/javascript',body:bundle});
  });
  await context.route('**/__scene-poc',r=>r.fulfill({
    status:200,contentType:'text/html',
    body:'<!doctype html><html><body><script src="/__scene-poc.js"></script></body></html>',
  }));
  const page=await context.newPage();
  let rejectInit:((error:Error)=>void)|undefined;
  const errorPromise=new Promise<never>((_,reject)=>{rejectInit=reject;});
  void errorPromise.catch(()=>undefined);
  page.on('crash',()=>{errors.push('CRASH');note('PAGE_CRASH');});
  page.on('console',m=>{const match=/^A2_BROWSER_PHASE:(DXF_PARSE_START|DXF_PARSE_DONE|SCENE_TAGGED|CUSTOM_DTO_START|CUSTOM_DTO_DONE|PRODUCE_COMPLETE)$/.exec(m.text());if(match)note('BROWSER_'+match[1]);});
  page.on('pageerror',e=>{
    const category=e.name==='SyntaxError'?'SYNTAX'
      :e.name==='ReferenceError'?'REFERENCE'
      :e.name==='TypeError'?'TYPE':'OTHER';
    errors.push(category);
    note('PAGEERROR_'+category);
    rejectInit?.(new Error('A2_REFERENCE_PAGEERROR:'+category));
  });
  page.on('requestfailed',r=>{
    note(r.url().endsWith('CadKorean.typeface.json')?'FONT_REQUEST_FAILED':'REFERENCE_REQUEST_FAILED');
  });
  await bounded('REFERENCE_NAVIGATE',HARNESS_LIMIT_MS,()=>Promise.race([
    page.goto(A2_HARNESS_ORIGIN+'/__scene-poc').then(()=>undefined),errorPromise,
  ]));
  await bounded('REFERENCE_READY',HARNESS_LIMIT_MS,()=>Promise.race([
    page.waitForFunction(()=>
      typeof (window as unknown as {scenePoc?:BrowserApi}).scenePoc?.produce==='function'
    ).then(()=>undefined),errorPromise,
  ]));
  rejectInit=undefined;
  if(!served)throw new Error('A2_REFERENCE_SCRIPT_NOT_SERVED');
  const secure=await page.evaluate(()=>window.isSecureContext&&typeof crypto.randomUUID==='function');
  if(!secure)throw new Error('A2_REFERENCE_INSECURE_CONTEXT');
  note('REFERENCE_READY');
  return page;
}
/** Parse and serialize the actual source before initializing WebGL.
 * A renderer crash must never be misclassified as a DXF parser failure.
 */
async function produce(page:Page,dxf:string=a2SyntheticDxf,phase='REAL_DXF'):Promise<{
  packet:Packet;inventory:Inventory;parseMs:number;serializeMs:number;
}>{
  note(phase+'_DTO_START');
  const result=await bounded('DXF_TO_CUSTOM_DTO',CONVERSION_LIMIT_MS,
    ()=>page.evaluate(({dxf,sha})=>{
      const api=(window as unknown as {scenePoc:BrowserApi}).scenePoc;
      return api.produce(dxf,sha,'DTO_ONLY');
    },{dxf,sha:createHash('sha256').update(dxf).digest('hex')}));
  expect(result.map(p=>p.format)).toEqual(['CUSTOM_DTO']);
  const packet=result[0],data=packet.stats;
  const inventory=data.original as Inventory;
  if(!packet.manifest||!inventory||!Array.isArray(inventory.ids))
    throw new Error('A2_DTO_OR_INVENTORY_MISSING');
  note(phase+'_DTO_DONE');
  return {packet,inventory,parseMs:Number(data.parseMs),
    serializeMs:Number(data.serializeMs)};
}
async function softwareIdentity(page:Page):Promise<string>{
  note('WEBGL2_INIT_START');
  const renderer=await bounded('WEBGL2_INIT',20_000,()=>page.evaluate(()=>{
    const canvas=document.createElement('canvas');
    canvas.width=32;canvas.height=32;
    const gl=canvas.getContext('webgl2',{antialias:false});
    if(!gl)throw new Error('A2_WEBGL2_UNAVAILABLE');
    gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
    const info=gl.getExtension('WEBGL_debug_renderer_info');
    const name=info?String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)):'';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  }));
  note('WEBGL2_INIT_DONE');
  if(!renderer.toLowerCase().includes('swiftshader'))
    throw new Error('A2_SOFTWARE_WEBGL_NOT_PROVEN');
  return renderer;
}
async function restore(page:Page,packet:Packet):Promise<RestoreResult>{
  note('REAL_DTO_RESTORE_START');
  const result=await bounded('REAL_DTO_RESTORE',CONVERSION_LIMIT_MS,
    ()=>page.evaluate(p=>{
      const api=(window as unknown as {scenePoc:BrowserApi}).scenePoc;
      return api.restore(p,p.manifest);
    },packet));
  note('REAL_DTO_RESTORE_DONE');
  return result;
}

/** P0-1: isolate software WebGL before loading the DXF converter. */
test('P0-1 isolated SwiftShader WebGL2 init without DXF',async()=>{
  test.setTimeout(50_000);
  const browser=await browserFor(true);
  try{
    const context=await browser.newContext({serviceWorkers:'block'});
    try{
      await context.route('**/__a2-webgl',r=>r.fulfill({
        status:200,contentType:'text/html',
        body:'<!doctype html><title>A2 synthetic WebGL probe</title>',
      }));
      const page=await context.newPage();
      page.on('crash',()=>note('P0_1_PAGE_CRASH'));
      await page.goto(A2_HARNESS_ORIGIN+'/__a2-webgl');
      const id=await softwareIdentity(page);
      expect(id.toLowerCase()).toContain('swiftshader');
      console.log('A2_P0_1_EVIDENCE',JSON.stringify({webgl2:'swiftshader',dxfLoaded:false}));
    }finally{await context.close();}
  }finally{await browser.close();}
});
test('P0-2 actual minimal LINE DXF to DTO without preliminary WebGL',async()=>{
  test.setTimeout(90_000);
  expect(preflightA2Dxf(new TextEncoder().encode(a2LineOnlyDxf)).model).toBe(1);
  const browser=await browserFor(true),errors:string[]=[];
  try{
    const context=await browser.newContext({serviceWorkers:'block'});
    try{
      const page=await prepare(context,await bundleOrThrow(),projectFont(),errors);
      const data=await produce(page,a2LineOnlyDxf,'P0_LINE');
      validateStoredScenePayload(Uint8Array.from(data.packet.bytes),data.packet.manifest!);
      expect(data.inventory.nodes).toBeGreaterThan(1);
      expect(data.inventory.vertices).toBeGreaterThan(0);
      await page.waitForTimeout(600);
      expect(errors).toEqual([]);
      console.log('A2_P0_2_EVIDENCE',JSON.stringify({nodes:data.inventory.nodes,
        bytes:data.packet.bytes.length,parseMs:Math.round(data.parseMs)}));
    }finally{await context.close();}
  }finally{await browser.close();}
});
test('P0-3 Korean TEXT/MTEXT and nested INSERT to DTO without preliminary WebGL',async()=>{
  test.setTimeout(100_000);
  expect(preflightA2Dxf(source)).toMatchObject({model:7,blocks:2});
  const browser=await browserFor(true),errors:string[]=[];
  try{
    const context=await browser.newContext({serviceWorkers:'block'});
    try{
      const page=await prepare(context,await bundleOrThrow(),projectFont(),errors);
      const data=await produce(page,a2SyntheticDxf,'P0_COMPLEX');
      validateStoredScenePayload(Uint8Array.from(data.packet.bytes),data.packet.manifest!);
      expect(data.inventory.nodes).toBeGreaterThan(1);
      await page.waitForTimeout(600);
      expect(errors).toEqual([]);
      console.log('A2_P0_3_EVIDENCE',JSON.stringify({nodes:data.inventory.nodes,
        bytes:data.packet.bytes.length,parseMs:Math.round(data.parseMs)}));
    }finally{await context.close();}
  }finally{await browser.close();}
});
test('P0-4 measure DTO_ONLY vs legacy ALL format cost on the same minimal DXF',async()=>{
  test.setTimeout(120_000);
  const browser=await browserFor(true),errors:string[]=[];
  try{
    const context=await browser.newContext({serviceWorkers:'block'});
    try{
      const page=await prepare(context,await bundleOrThrow(),projectFont(),errors);
      const t=Date.now();
      const dto=await produce(page,a2LineOnlyDxf,'P0_DTO_COST');
      const dtoMs=Date.now()-t;
      const t2=Date.now();
      const all=await bounded('LEGACY_FORMATS',CONVERSION_LIMIT_MS,()=>page.evaluate(
        ({dxf,sha})=>(window as unknown as {scenePoc:BrowserApi}).scenePoc.produce(dxf,sha),
        {dxf:a2LineOnlyDxf,sha:createHash('sha256').update(a2LineOnlyDxf).digest('hex')},
      ));
      expect(all.map(p=>p.format)).toEqual(['THREE_JSON','CUSTOM_DTO','GLB']);
      expect(all.find(p=>p.format==='CUSTOM_DTO')?.manifest?.sha256)
        .toEqual(dto.packet.manifest?.sha256);
      console.log('A2_P0_4_EVIDENCE',JSON.stringify({dtoOnlyMs:dtoMs,allMs:Date.now()-t2,
        dtoOnlyBytes:dto.packet.bytes.length,allBytes:all.reduce((n,p)=>n+p.bytes.length,0)}));
      await page.waitForTimeout(600);
      expect(errors).toEqual([]);
    }finally{await context.close();}
  }finally{await browser.close();}
});
test('P0-5 terminating a pending browser evaluation rejects instead of READY',async()=>{
  test.setTimeout(45_000);
  const browser=await browserFor(false);
  try{
    const context=await browser.newContext({serviceWorkers:'block'});
    try{
      const page=await context.newPage();
      await page.goto('about:blank');
      const pending=page.evaluate(()=>new Promise<string>(()=>{}));
      const check=expect(pending).rejects.toThrow();
      await page.close();
      await check;
      note('ABORTED_BROWSER_EVALUATION_REJECTED');
    }finally{await context.close();}
  }finally{await browser.close();}
  // This is NOT the production DB-backed Worker lease/OOM/restart gate.
});
async function bundleOrThrow():Promise<string>{
  const output=await build({
    entryPoints:['tests/e2e/scene-poc-browser.ts'],
    bundle:true,platform:'browser',format:'iife',write:false,logLevel:'silent',
  });
  void new Script(output.outputFiles[0].text,{filename:'a2-scene-poc.js'});
  return output.outputFiles[0].text;
}
test('P1-A2 real DXF via existing browser builder: CPU SwiftShader, CUSTOM_DTO full validator, file and new-process restore',async()=>{
  test.setTimeout(180_000);
  const size=preflightA2Dxf(source);
  expect(size).toMatchObject({model:7,blocks:2});
  expect(sourceSha).toBe(sceneSha256(source));
  const textIndex=extractDxfText(source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength) as ArrayBuffer);
  expect(textIndex.hits.length).toBeGreaterThanOrEqual(3);
  expect(textIndex.hits.filter(h=>/[가-힣]/u.test(h.text)).length).toBeGreaterThanOrEqual(2);
  note('REFERENCE_BUNDLE_START');
  // This is the exact browser-side DXF converter already exercised by
  // src/tests/e2e/scene-poc.spec.ts on Playwright Chromium 153 (CI #514).
  const output=await build({
    entryPoints:['tests/e2e/scene-poc-browser.ts'],
    bundle:true,platform:'browser',format:'iife',write:false,logLevel:'silent',
  });
  void new Script(output.outputFiles[0].text,{filename:'scene-poc-browser.js'});
  note('REFERENCE_BUNDLE_VALID');
  const font=projectFont();
  note('KOREAN_FONT_PREPARED');
  const errors:string[]=[];
  const browser=await browserFor(true);
  let first:Awaited<ReturnType<typeof produce>>;
  try{
    const context=await browser.newContext({serviceWorkers:'block'});
    const page=await prepare(context,output.outputFiles[0].text,font,errors);
    first=await produce(page);
    // Separate actual DTO production from software-WebGL initialization.
    const renderer=await softwareIdentity(page);
    expect(renderer.toLowerCase()).toContain('swiftshader');
    expect(first.packet.bytes.length).toBeGreaterThan(0);
    expect(first.packet.bytes.length).toBeLessThanOrEqual(SCENE_PAYLOAD_LIMITS.bytes);
    expect(first.packet.manifest).toBeDefined();
    const manifest=first.packet.manifest!;
    expect(manifest).toMatchObject({
      state:'READY',format:'CUSTOM_DTO',byteLength:first.packet.bytes.length,
      sha256:sceneSha256(Uint8Array.from(first.packet.bytes)),
    });
    expect(manifest.scope).toMatchObject({
      sourceSha256:sourceSha,sourceUnit:'DXF_INSUNITS_4',frame:'DXF_WCS_XY',
    });
    const payload=Uint8Array.from(first.packet.bytes);
    validateStoredScenePayload(payload,manifest);
    expect(first.inventory.nodes).toBeGreaterThan(1);
    expect(first.inventory.vertices).toBeGreaterThan(0);
    expect(first.inventory.ids.length).toBe(first.inventory.nodes);
    expect(Object.keys(first.inventory.layers).length).toBeGreaterThan(1);
    const recovered=await restore(page,first.packet);
    expect(recovered.rendered).toBe(true);
    compareInventory(first.inventory,recovered.restored);

    const folder=await mkdtemp(join(tmpdir(),'a2-dto-verified-'));
    try{
      const artifact=join(folder,'scene.dto.json');
      await writeFile(artifact,payload);
      const read=await readFile(artifact);
      validateStoredScenePayload(read,manifest);
      expect(sceneSha256(read)).toBe(manifest.sha256);
    }finally{await rm(folder,{recursive:true,force:true});}
    await page.waitForTimeout(600);
    await context.close();
  }finally{await browser.close();}

  // A new browser process must restore the exact original bytes and scope.
  const second=await browserFor(false);
  try{
    const context=await second.newContext({serviceWorkers:'block'});
    const page=await prepare(context,output.outputFiles[0].text,font,errors);
    const reloaded=await restore(page,first.packet);
    expect(reloaded.rendered).toBe(true);
    compareInventory(first.inventory,reloaded.restored);
    const comparison=await produce(page);
    compareInventory(first.inventory,comparison.inventory);
    expect(comparison.packet.manifest?.scope).toEqual(first.packet.manifest?.scope);
    expect(comparison.packet.manifest?.sha256).toBe(first.packet.manifest?.sha256);
    await page.waitForTimeout(600);
    await context.close();
  }finally{await second.close();}
  expect(errors).toEqual([]);
  console.log('A2_SYNTHETIC_EVIDENCE',JSON.stringify({
    model:size.model,expandedBound:size.expandedBound,nodes:first.inventory.nodes,
    vertices:first.inventory.vertices,dtoBytes:first.packet.bytes.length,
    koreanTextHits:textIndex.hits.filter(h=>/[가-힣]/u.test(h.text)).length,
    parseMs:Math.round(first.parseMs),serializeMs:Math.round(first.serializeMs),
    asyncErrors:errors.length,builder:'existing-scene-poc-not-live-viewer-adapter',
  }));
});
test('P1-A2 virtual browser origin remains trustworthy',()=>{
  expect(new URL(A2_HARNESS_ORIGIN).origin).toBe('http://localhost');
});
test('P1-A2 watchdog rejects a stalled Promise',async()=>{
  await expect(bounded('SYNTHETIC_STALL',25,()=>new Promise<never>(()=>{})))
    .rejects.toThrow('A2_TIMEOUT:SYNTHETIC_STALL');
});
test('P1-A2 fail-closed preparse: unsupported geometry, nested explosion, cycles and limits',()=>{
  expect(()=>preflightA2Dxf(new TextEncoder().encode(a2SyntheticDxf.replace('\nLINE\n','\n3DSOLID\n'))))
    .toThrowError('A2_ENTITY_UNSUPPORTED');
  expect(()=>preflightA2Dxf(new TextEncoder().encode(a2ExplosionDxf())))
    .toThrowError('A2_EXPANSION_LIMIT');
  expect(()=>preflightA2Dxf(new TextEncoder().encode(a2CycleDxf())))
    .toThrowError('A2_BLOCK_CYCLE');
  expect(()=>preflightA2Dxf(new Uint8Array(A2_SOURCE_LIMIT+1)))
    .toThrowError('A2_SOURCE_LIMIT');
  expect(A2_EXPANSION_LIMIT).toBe(SCENE_PAYLOAD_LIMITS.nodes);
  expect(SCENE_PAYLOAD_LIMITS).toMatchObject({
    bytes:32*1024*1024,nodes:100_000,attributeScalars:2_000_000,depth:128,
  });
});
