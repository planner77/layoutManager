/** #218 A2-F01..F05: separate real browser builds, full DTO and live restore. */
import {test,expect,chromium,type Page} from '@playwright/test';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateStoredScenePayload} from '../../domain/scene-payload';
import {sceneSha256} from '../../domain/scene-digest';
import type {SceneManifest} from '../../domain/cad-scene';
import type {CadTextIndex} from '../../viewers/core/text-index';
import {a2SyntheticDxf,a2CycleDxf,a2ExplosionDxf} from './fixtures';
import {preflightA2Dxf} from './dxf-risk-preflight';
import {compareParity,canonicalRestoredInventory} from './compare-parity';
import type {ParityInventory} from './parity-inventory';
import type {CandidateRequest} from './candidate-browser';
import type {A2LiveApi} from './live-browser';

const request:CandidateRequest={dxf:a2SyntheticDxf,
  versionId:'11111111-1111-4111-8111-111111111111',
  sourceSha256:sceneSha256(new TextEncoder().encode(a2SyntheticDxf))};
type Artifact={bytes:number[];manifest:SceneManifest};
type Candidate={artifact:Artifact;inventory:ParityInventory;textIndex:unknown;sourceSha256:string;sourcePreflight:{model:number;blocks:number;expandedBound:number};packageVersion:string};
type LiveSource=Awaited<ReturnType<A2LiveApi['loadSource']>>;
type LiveRestore=Awaited<ReturnType<A2LiveApi['loadScene']>>;
const origin='http://localhost';
let scripts:Record<string,string>;
async function bundles(){
  if(scripts)return scripts;
  const entries={candidate:'tests/a2/candidate-browser.ts',live:'tests/a2/live-browser.ts',worker:'viewers/core/outline-worker.ts'};
  const built=await Promise.all(Object.entries(entries).map(async([key,path])=>{
    const result=await build({entryPoints:[path],bundle:true,platform:'browser',format:'esm',target:'chrome115',write:false,logLevel:'silent'});
    return [key,result.outputFiles[0].text] as const;
  }));
  scripts=Object.fromEntries(built);return scripts;
}
async function font(){
  const bytes=await readFile('public/fonts/CadKorean.typeface.json');
  const parsed=JSON.parse(bytes.toString('utf8')) as {glyphs?:Record<string,{o?:string}>};
  if(!parsed.glyphs?.['한']?.o||!parsed.glyphs?.['글']?.o)throw new Error('A2_FONT_GLYPHS_MISSING');
  return {body:bytes.toString('utf8'),sha:createHash('sha256').update(bytes).digest('hex')};
}
async function launch(kind:'candidate'|'live'){
  const browser=await chromium.launch({headless:true,executablePath:process.env.A2_CHROMIUM_EXECUTABLE||undefined,
    chromiumSandbox:false,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const expectedMajor=process.env.A2_BROWSER_EXPECTED_MAJOR||'153';
  if(browser.version().split('.')[0]!==expectedMajor){await browser.close();throw new Error('A2_BROWSER_VERSION_MISMATCH');}
  const context=await browser.newContext({serviceWorkers:'block'});
  const errors:string[]=[];let fontRequests=0,workerRequests=0,originalRequests=0;
  const files=await bundles(),f=await font();
  await context.route('**/fonts/CadKorean.typeface.json',route=>{fontRequests++;return route.fulfill({status:200,contentType:'application/json',body:f.body});});
  await context.route('**/core/outline-worker.ts',route=>{workerRequests++;return route.fulfill({status:200,contentType:'application/javascript',body:files.worker});});
  await context.route('**/api/cad-files/**/content',route=>{originalRequests++;return route.abort();});
  await context.route('**/__a2-entry.js',route=>route.fulfill({status:200,contentType:'application/javascript',body:files[kind]}));
  await context.route('**/__a2-entry',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><script type="module" src="/__a2-entry.js"></script></body></html>'}));
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.name));page.on('crash',()=>errors.push('CRASH'));
  await page.goto(origin+'/__a2-entry');
  await page.waitForFunction(k=>typeof (window as unknown as Record<string,{build?:unknown;loadSource?:unknown}>)[k]?.[k==='a2Candidate'?'build':'loadSource']==='function',kind==='candidate'?'a2Candidate':'a2Live');
  return {browser,context,page,errors,fontRequests:()=>fontRequests,workerRequests:()=>workerRequests,originalRequests:()=>originalRequests,fontSha:f.sha};
}
async function candidate(page:Page,req=request):Promise<Candidate>{
  const wire=await page.evaluate(async r=>JSON.stringify(await (window as unknown as {a2Candidate:{build:(r:CandidateRequest)=>Promise<Candidate>}}).a2Candidate.build(r)),req);
  return JSON.parse(wire) as Candidate;
}
async function liveSource(page:Page):Promise<LiveSource>{
  const wire=await page.evaluate(async r=>JSON.stringify(await (window as unknown as {a2Live:A2LiveApi}).a2Live.loadSource(r)),request);
  return JSON.parse(wire) as LiveSource;
}
async function liveRestore(page:Page,artifact:Artifact):Promise<LiveRestore>{
  const raw=JSON.stringify(artifact);
  const wire=await page.evaluate(async text=>JSON.stringify(await (window as unknown as {a2Live:A2LiveApi}).a2Live.loadScene({artifact:JSON.parse(text) as Artifact})),raw);
  return JSON.parse(wire) as LiveRestore;
}
async function sourceSelection(page:Page){
  const target=await page.evaluate(()=>(window as unknown as {a2Live:A2LiveApi}).a2Live.sourceTarget());
  await page.mouse.click(target.clientX,target.clientY);
  const result=await page.evaluate(()=>(window as unknown as {a2Live:A2LiveApi}).a2Live.probeSource());
  expect(result.selected).toContain(target.id);
  return result;
}
function checked(a:Artifact){
  const bytes=Uint8Array.from(a.bytes);
  expect(bytes.length).toBe(a.manifest.byteLength);
  expect(sceneSha256(bytes)).toBe(a.manifest.sha256);
  validateStoredScenePayload(bytes,a.manifest);
  return bytes;
}
function assertSnapshotTamperRejected(artifact:Artifact){
  const raw=JSON.parse(new TextDecoder().decode(Uint8Array.from(artifact.bytes)));
  expect(raw.schema).toBe(2);
  expect(raw.viewerData.sourceIndex.state).toBe('READY');
  const mutations:Array<(x:typeof raw)=>void>=[
    x=>{x.viewerData.sourceIndex.scope.versionId='foreign-version';},
    x=>{x.viewerData.sourceIndex.index.sourceSha256='0'.repeat(64);},
    x=>{x.viewerData.sourceIndex.index.unitCode=99;},
    x=>{x.viewerData.sourceIndex.index.entities[0].id='invented';},
    x=>{x.viewerData.sourceIndex.index.entities[0].stable=true;x.viewerData.sourceIndex.index.entities[0].handle='BAD';},
    x=>{x.viewerData.sourceIndex.index.entities[0].bounds[0]+=100;},
    x=>{x.viewerData.sourceIndex.index.entities[0].paths[0].points[0][0]=1e20;},
    x=>{x.viewerData.sourceIndex.index.entities.push(structuredClone(x.viewerData.sourceIndex.index.entities[0]));},
    x=>{x.viewerData.sourceIndex.bindings[0].sceneObjectId='foreign-object';},
    x=>{x.viewerData.sourceIndex.bindings[0].handle='BAD';},
    x=>{x.viewerData.sourceIndex.bindings[0].entityType='3DSOLID';},
    x=>{x.viewerData.sourceIndex.bindings[0].layer='https://invalid.example/layer';},
    x=>{const id=x.viewerData.sourceIndex.bindings[0].sceneObjectId;
      const walk=(node:typeof x.root):boolean=>{if(node.ref.id===id){node.layer='OTHER';return true;}return node.children.some(walk);};
      if(!walk(x.root))throw new Error('A2_BINDING_NODE_MISSING');},
  ];
  for(const [i,mutate] of mutations.entries()){const value=structuredClone(raw);mutate(value);
    const bytes=new TextEncoder().encode(JSON.stringify(value));
    const manifest={...artifact.manifest,byteLength:bytes.length,sha256:sceneSha256(bytes)};
    let rejected=false;try{validateStoredScenePayload(bytes,manifest);}catch{rejected=true;}
    if(!rejected)throw new Error('A2_SNAPSHOT_TAMPER_ACCEPTED:'+i);
  }
}
function coverage(inventory:ParityInventory){
  const nodes=inventory.nodes as Array<{type:string;geometry?:{attributes?:Record<string,unknown>}}>;const kinds:Record<string,number>={};
  for(const n of nodes)if(n.geometry){kinds[n.type]=(kinds[n.type]??0)+1;}
  return {source:{LINE:3,CIRCLE:3,LWPOLYLINE:1,TEXT:3,MTEXT:1},actualDrawables:kinds,
    sourceFidelity:'PARTIAL',reason:'DXFViewer may merge source entities and glyph meshes; drawable counts are not source entity counts'};
}
test('F01-F05 independent candidate vs actual live Adapter and fresh live restore',async()=>{
  test.setTimeout(180_000);
  expect(preflightA2Dxf(new TextEncoder().encode(request.dxf))).toEqual({model:7,blocks:2,expandedBound:11});
  const dir=await mkdtemp(join(tmpdir(),'a2-parity-'));
  let c:Awaited<ReturnType<typeof launch>>|undefined,l:Awaited<ReturnType<typeof launch>>|undefined,r:Awaited<ReturnType<typeof launch>>|undefined;
  try{
    c=await launch('candidate');
    await expect(candidate(c.page,{...request,sourceSha256:'0'.repeat(64)})).rejects.toThrow();
    const unsupported=request.dxf.replace('0\nLINE\n5\nA01','0\n3DSOLID\n5\nA01');
    for(const [dxf,code] of [
      [a2CycleDxf(),'A2_BLOCK_CYCLE'],
      [a2ExplosionDxf(),'A2_EXPANSION_LIMIT'],
      [unsupported,'A2_ENTITY_UNSUPPORTED'],
    ] as const){
      const before=c.fontRequests();
      await expect(candidate(c.page,{...request,dxf,sourceSha256:sceneSha256(new TextEncoder().encode(dxf))})).rejects.toThrow(code);
      expect(c.fontRequests()).toBe(before);
    }
    const built=await candidate(c.page);
    expect(c.fontRequests()).toBeGreaterThan(0);
    expect(built.sourceSha256).toBe(request.sourceSha256);
    expect(built.sourcePreflight).toEqual({model:7,blocks:2,expandedBound:11});
    checked(built.artifact);
    assertSnapshotTamperRejected(built.artifact);
    const hits=(built.textIndex as CadTextIndex).hits;
    expect(hits.filter(h=>h.type==='TEXT')).toHaveLength(3);
    expect(hits.filter(h=>h.type==='MTEXT')).toHaveLength(1);
    expect(hits.filter(h=>h.origin==='INSERT')).toHaveLength(2);
    expect(hits.every(h=>h.text.includes('한글'))).toBe(true);
    expect(c.errors).toEqual([]);
    const cFontSha=c.fontSha;
    await c.context.close();await c.browser.close();c=undefined;

    l=await launch('live');
    const source=await liveSource(l.page);
    expect(l.fontRequests()).toBeGreaterThan(0);
    expect(l.fontSha).toBe(cFontSha);
    expect(l.workerRequests()).toBeGreaterThan(0);
    expect(source.screen.outline.indexState).toBe('READY');
    expect(source.screen.webgl).toBe(true);
    expect(source.screen.renderer.toLowerCase()).toContain('swiftshader');
    checked(source.artifact);
    expect(source.artifact.manifest.scope).toEqual(built.artifact.manifest.scope);
    expect(source.packageVersion).toBe(built.packageVersion);
    expect(source.packageVersion).toBe('0.59.0');
    compareParity(source.inventory,built.inventory,'source');
    compareParity(JSON.parse(new TextDecoder().decode(Uint8Array.from(source.artifact.bytes))),
      JSON.parse(new TextDecoder().decode(Uint8Array.from(built.artifact.bytes))),'dto');
    const selectedSource=await sourceSelection(l.page);
    expect(l.errors).toEqual([]);
    await l.context.close();await l.browser.close();l=undefined;

    const path=join(dir,'candidate.json');await writeFile(path,Uint8Array.from(built.artifact.bytes));
    const read=await readFile(path);
    expect(sceneSha256(read)).toBe(built.artifact.manifest.sha256);
    r=await launch('live');
    const restored=await liveRestore(r.page,{bytes:[...read],manifest:built.artifact.manifest});
    expect(r.fontRequests()).toBe(0);
    expect(r.workerRequests()).toBe(0);
    expect(r.originalRequests()).toBe(0);
    expect(restored.screen.parserCalls).toBe(0);
    expect(restored.shapeGeometryCount).toBe(2);
    expect(restored.screen.webgl).toBe(true);
    expect(restored.screen.renderer.toLowerCase()).toContain('swiftshader');
    expect(restored.screen.layers).toEqual(source.screen.layers);
    expect(restored.screen.outline.indexState).toBe('READY');
    expect(restored.screen.outlineInfo?.exactSourceEntityCount).toBe(source.screen.outlineInfo?.exactSourceEntityCount);
    expect(restored.screen.outlineInfo?.renderedObjectCount).toBe(source.screen.outlineInfo?.renderedObjectCount);
    expect(restored.screen.outline.renderIndex).toBeGreaterThan(0);
    compareParity(restored.inventory,built.inventory,'restored');
    const unexpected=structuredClone(restored.inventory);
    (unexpected.nodes as Array<{materials:Array<{side:number}>}>)[22].materials[0].side=1;
    expect(()=>compareParity(unexpected,built.inventory,'side-tamper')).toThrow('A2_PARITY_NUMBER');
    compareParity(restored.textIndex,built.textIndex,'textIndex');
    const restoredSelection=await sourceSelection(r.page);
    expect(restoredSelection).toEqual(selectedSource);
    const workTarget=await r.page.evaluate(()=>(window as unknown as {a2Live:A2LiveApi}).a2Live.sourceTarget());
    await r.page.evaluate(()=>(window as unknown as {a2Live:A2LiveApi}).a2Live.renderMode());
    await r.page.mouse.click(workTarget.clientX,workTarget.clientY);
    const workGate=await r.page.evaluate(()=>(window as unknown as {a2Live:A2LiveApi}).a2Live.probeSceneWorkGate());
    expect(workGate.blocked).toBe(true);expect(workGate.restored).toBe(3);
    compareParity(workGate.inventory,restored.inventory,'work-undo-reset');
    const layer=restored.screen.layers.find(x=>x==='LINES')??restored.screen.layers[0];
    const off=await r.page.evaluate(name=>(window as unknown as {a2Live:A2LiveApi}).a2Live.layer(name,false),layer);
    expect(off.matching.length).toBeGreaterThan(0);
    expect(off.matching.every(x=>!x.visible)).toBe(true);
    const on=await r.page.evaluate(name=>(window as unknown as {a2Live:A2LiveApi}).a2Live.layer(name,true),layer);
    expect(on.matching.some(x=>x.visible)).toBe(true);
    await r.page.evaluate(()=>(window as unknown as {a2Live:A2LiveApi}).a2Live.dispose());
    const again=await liveRestore(r.page,{bytes:[...read],manifest:built.artifact.manifest});
    compareParity(again.inventory,restored.inventory,'reentry');
    expect(r.errors).toEqual([]);
    console.info('A2_PARITY_EVIDENCE',JSON.stringify({scope:true,artifact:true,sourceIndex:source.screen.outline.indexState,
      restoredIndex:restored.screen.outline.indexState,textHits:built.textIndex&&typeof built.textIndex==='object'?(built.textIndex as {hits?:unknown[]}).hits?.length:null,
      sourceCoverage:coverage(built.inventory),restoredShapeClassLoss:0,restoredMaterialSideLoss:0,
      sourceRenderEntities:source.screen.outline.renderIndex,restoredRenderEntities:restored.screen.outline.renderIndex,
      sourceMappedEntities:source.screen.outlineInfo?.exactSourceEntityCount??null}));
  }finally{for(const x of [c,l,r])if(x){await x.context.close().catch(()=>{});await x.browser.close().catch(()=>{});}await rm(dir,{recursive:true,force:true});}
});

test('F02/F04 comparator rejects late coordinate, identity, layer, transform and text mutation',()=>{
  const base={nodes:[{ref:{id:'source'},layer:'LINES',matrix:[1,0,0,1],geometry:{attributes:{position:{array:[0,1,2]}}}}],textIndex:{hits:[{text:'한글'}]}};
  const mutate=(fn:(value:typeof base)=>void)=>{const copy=structuredClone(base);fn(copy);return copy;};
  compareParity(base,structuredClone(base));
  for(const value of [
    mutate(x=>{x.nodes[0].geometry.attributes.position.array[2]+=0.01;}),
    mutate(x=>{x.nodes[0].ref.id='changed';}),
    mutate(x=>{x.nodes[0].layer='OTHER';}),
    mutate(x=>{x.nodes[0].matrix[3]+=0.01;}),
    mutate(x=>{x.textIndex.hits[0].text='other';}),
  ])expect(()=>compareParity(value,base)).toThrow();
  // Discrete path/material/index metadata is exact, even below coordinate tolerance.
  for(const [actual,expected] of [
    [{path:[0.0000001]},{path:[0]}],
    [{side:0.0000001},{side:0}],
    [{blending:1.0000001},{blending:1}],
    [{geometry:{index:[0.0000001]}},{geometry:{index:[0]} }],
  ])expect(()=>compareParity(actual,expected)).toThrow();
  const source={nodes:Array.from({length:23},(_,i)=>({path:[i],ref:{id:'stable-'+i},
    geometry:[7,8].includes(i)?{type:'ShapeGeometry'}:null,
    materials:[7,8,15,22].includes(i)?[{type:'MeshBasicMaterial',side:2,depthWrite:true}]:[]}))};
  const restored=structuredClone(source);
  for(const i of [7,8])restored.nodes[i].geometry!.type='BufferGeometry';
  for(const i of [7,8,15,22])restored.nodes[i].materials[0].side=0;
  const verified=canonicalRestoredInventory(source,restored);
  expect(verified.shapeClassLoss).toBe(2);
  expect(verified.materialSideLoss).toBe(4);
  const broken=(fn:(value:typeof restored)=>void)=>{const copy=structuredClone(restored);fn(copy);return copy;};
  for(const value of [
    broken(x=>{x.nodes[22].materials[0].side=1;}),
    broken(x=>{x.nodes[15].materials=[];}),
    broken(x=>{x.nodes[0].ref.id='reordered';}),
    broken(x=>{x.nodes[7].materials[0].depthWrite=false;}),
    broken(x=>{x.nodes[8].geometry!.type='OtherGeometry';}),
  ])expect(()=>canonicalRestoredInventory(source,value)).toThrow();
});
