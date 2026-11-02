import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import type {BrowserContext,Page} from '@playwright/test';

const dxf=[
 '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
 '0','SECTION','2','BLOCKS',
 '0','BLOCK','2','INNER','70','0','10','0','20','0','30','0','0','LINE','5','B1','8','BLOCKS','10','0','20','0','11','20','21','10','0','ENDBLK',
 '0','BLOCK','2','OUTER','70','0','10','0','20','0','30','0','0','INSERT','2','INNER','8','BLOCKS','10','0','20','0','30','0','0','CIRCLE','5','B2','8','BLOCKS','10','0','20','0','40','3','0','TEXT','5','B3','8','BLOCKS','10','5','20','5','40','2','1','INNER TEXT','0','ENDBLK',
 '0','ENDSEC','0','SECTION','2','ENTITIES',
 '0','LINE','5','A1','8','LINES','62','1','10','100000000','20','100000000','11','100000100','21','100000010',
 '0','CIRCLE','5','A2','8','CIRCLES','10','0','20','0','40','10',
 '0','ARC','5','A3','8','ARCS','10','0','20','0','40','12','50','10','51','120',
 '0','LWPOLYLINE','5','A4','8','POLY','90','4','70','1','10','0','20','0','10','20','20','0','10','20','20','20','10','0','20','20',
 '0','INSERT','5','A5','8','INSERTS','2','OUTER','10','100','20','100','30','0',
 '0','INSERT','5','A6','8','INSERTS','2','OUTER','10','200','20','100','30','0',
 '0','TEXT','5','A7','8','TEXT','10','0','20','40','40','5','1','HELLO',
 '0','MTEXT','5','A8','8','MTEXT','10','0','20','55','40','5','1','MULTI\\P LINE',
 '0','LINE','8','NOHANDLE','10','5','20','5','11','8','21','8',
 '0','ENDSEC','0','EOF','',
].join('\n');
type Packet={format:string;bytes:number[];manifest?:Record<string,unknown>;stats:Record<string,unknown>};
type BrowserResult={rendered:boolean;restoreMs:number;restored:Record<string,unknown>};
declare global {interface Window {scenePoc:{produce:(dxf:string,sha:string)=>Promise<Packet[]>;restore:(packet:Packet,expected?:Record<string,unknown>)=>Promise<BrowserResult>}}}
const get=(value:unknown,...path:(string|number)[]):unknown=>path.reduce<unknown>((v,k)=>{if(!v||typeof v!=='object')throw new Error('test path missing');return (v as Record<string|number,unknown>)[k];},value);
const obj=(value:unknown,...path:(string|number)[]):Record<string,unknown>=>get(value,...path) as Record<string,unknown>;
const list=(value:unknown,...path:(string|number)[]):unknown[]=>get(value,...path) as unknown[];
const geoNode=(node:unknown):Record<string,unknown>=>{if(obj(node).geometry)return obj(node);for(const child of list(node,'children')){try{return geoNode(child);}catch{continue;}}throw new Error('test geometry missing');};
async function harness(context:BrowserContext):Promise<Page>{
 const bundle=await build({entryPoints:['tests/e2e/scene-poc-browser.ts'],bundle:true,platform:'browser',format:'iife',write:false,logLevel:'silent'});
 await context.route('**/fonts/CadKorean.typeface.json',route=>route.fulfill({contentType:'application/json',body:readFileSync('node_modules/three/examples/fonts/helvetiker_regular.typeface.json')}));
 await context.route('**/__scene-poc.js',route=>route.fulfill({contentType:'application/javascript',body:bundle.outputFiles[0].text}));
 await context.route('**/__scene-poc',route=>route.fulfill({contentType:'text/html',body:'<html><body><script src="/__scene-poc.js"></script></body></html>'}));
 const page=await context.newPage();await page.goto('/__scene-poc');await page.waitForFunction(()=>Boolean(window.scenePoc));return page;
}
test('SC-05/06/07 real converter and fresh-context scene format experiment',async({browser,baseURL})=>{
 test.setTimeout(90_000);
 const sha=createHash('sha256').update(dxf).digest('hex');
 const producer=await browser.newContext({baseURL});const page=await harness(producer);
 const packets=await page.evaluate(async({dxf,sha})=>window.scenePoc.produce(dxf,sha) as Promise<Packet[]>,{dxf,sha});
 expect(packets.map(p=>p.format)).toEqual(['THREE_JSON','CUSTOM_DTO','GLB']);
 await producer.close();
 const consumer=await browser.newContext({baseURL});const other=await harness(consumer);
 for(const packet of packets){
  if(!packet.bytes.length)continue;
  const result=await other.evaluate(({packet,expected})=>window.scenePoc.restore(packet,expected),{packet,expected:packet.manifest});
  expect(result.rendered).toBe(true);
  expect(result.restored.nodes).toBeGreaterThan(0);
  const baseline=packet.stats.original as Record<string,unknown>;
  const geometryEqual=JSON.stringify((packet.stats.original as Record<string,unknown>).geometryTrace)===JSON.stringify(result.restored.geometryTrace);
  const before=(packet.stats.original as {geometryTrace:number[][]}).geometryTrace;const after=result.restored.geometryTrace as number[][];
  let maxCoordinateDelta=0,changedScalars=0;for(let i=0;i<Math.min(before.length,after.length);i++)for(let j=0;j<Math.min(before[i].length,after[i].length);j++){const d=Math.abs(before[i][j]-after[i][j]);if(d>0)changedScalars++;maxCoordinateDelta=Math.max(maxCoordinateDelta,d);}
  const baselineById=(packet.stats.original as {geometryById:Record<string,number[]>}).geometryById;const restoredById=result.restored.geometryById as Record<string,number[]>;
  let idAlignedDelta=0,idAlignedChanges=0;for(const id of Object.keys(baselineById)){const a=baselineById[id],b=restoredById[id]??[];for(let j=0;j<Math.min(a.length,b.length);j++){const d=Math.abs(a[j]-b[j]);if(d>0)idAlignedChanges++;idAlignedDelta=Math.max(idAlignedDelta,d);}}
  console.log('SCENE_GEOMETRY_DELTA',JSON.stringify({format:packet.format,equal:geometryEqual,changedScalars,maxCoordinateDelta,idAlignedChanges,idAlignedDelta}));
  if(packet.format==='CUSTOM_DTO')expect(geometryEqual).toBe(true);
  if(packet.format!=='GLB'){
    for(const key of ['nodes','vertices','materials','kinds','layers','ids','bbox','materialTrace','visibilityTrace','nameTrace'])
      expect((result.restored as Record<string,unknown>)[key],key).toEqual(baseline[key]);
  }
  const original=packet.stats.original as Record<string,unknown> & {ids:string[]};
  console.log('SCENE_POC',JSON.stringify({format:packet.format,bytes:packet.bytes.length,gzipBytes:gzipSync(Buffer.from(packet.bytes)).length,parseMs:packet.stats.parseMs,serializeMs:packet.stats.serializeMs,restoreMs:result.restoreMs,original:{nodes:original.nodes,vertices:original.vertices,materials:original.materials,kinds:original.kinds,layers:original.layers,bbox:original.bbox,upstreamData:original.upstreamData,entityKeys:original.entityKeys,rawConverter:original.rawConverter,styleProbe:original.styleProbe},restored:{nodes:result.restored.nodes,vertices:result.restored.vertices,materials:result.restored.materials,kinds:result.restored.kinds,layers:result.restored.layers,bbox:result.restored.bbox},idsEqual:JSON.stringify(original.ids)===JSON.stringify(result.restored.ids)}));
 }
 for(const packet of packets.filter(p=>p.manifest)){
  const tampered={...packet,bytes:[...packet.bytes]};tampered.bytes[20]^=1;
  await expect(other.evaluate(({packet,expected})=>window.scenePoc.restore(packet,expected),{packet:tampered,expected:packet.manifest})).rejects.toThrow();
  const wrong={...packet,manifest:{...packet.manifest,sceneId:'wrong'}};
  await expect(other.evaluate(({packet,expected})=>window.scenePoc.restore(packet,expected),{packet:wrong,expected:packet.manifest})).rejects.toThrow();
 }
 const json=packets.find(p=>p.format==='THREE_JSON')!;
 const threePayload:unknown=JSON.parse(Buffer.from(json.bytes).toString('utf8'));
 console.log('SCENE_JSON_TYPES',JSON.stringify({geometries:[...new Set(list(threePayload,'tree','geometries').map(g=>obj(g).type))],materials:[...new Set(list(threePayload,'tree','materials').map(m=>obj(m).type))]}));
 const altered=(mutate:(payload:unknown)=>void)=>{
  const payload=JSON.parse(Buffer.from(json.bytes).toString('utf8'));mutate(payload);
  const bytes=Buffer.from(JSON.stringify(payload));const sha256=createHash('sha256').update(bytes).digest('hex');
  return {packet:{...json,bytes:[...bytes],manifest:{...json.manifest,byteLength:bytes.length,sha256}},
   expected:{scope:json.manifest!.scope,format:'THREE_JSON',byteLength:bytes.length,sha256}};
 };
 const semantic:[string,(p:unknown)=>void][]=[
  ...(['versionId','sourceSha256','builder','renderer','schema','frame','sourceUnit','sceneId','origin','id','derivedFrom'] as const).map(field=>[field,(p:unknown)=>{obj(p,'tree','object','userData','cadSceneRef')[field]='forged';}] as [string,(p:unknown)=>void]),
  ['asset-state',p=>{obj(p,'asset').state='FAILED';}],
  ['asset-duplicate',p=>{list(p,'asset','objects')[1]=list(p,'asset','objects')[0];}],
  ['app-overlay',p=>{obj(p,'asset','objects',0,'ref').origin='APP_CREATED';}],
  ['external-image',p=>{obj(p,'tree').images=[{url:'https://invalid.test/secret.png'}];}],
  ['external-texture',p=>{obj(p,'tree').textures=[{url:'https://invalid.test/secret.png'}];}],
  ['shader',p=>{obj(p,'tree','materials',0).type='ShaderMaterial';}],
  ['missing-geometry',p=>{geoNode(get(p,'tree','object')).geometry='missing';}],
  ['missing-material',p=>{geoNode(get(p,'tree','object')).material='missing';}],
  ['changed-visible',p=>{obj(p,'tree','object').visible=false;}],
  ['changed-matrix',p=>{list(p,'tree','object','matrix')[12]=1;}],
  ['changed-kind',p=>{obj(p,'tree','object').type='Mesh';}],
  ['bad-position',p=>{const g=list(p,'tree','geometries').find(g=>obj(g).type==='BufferGeometry');list(g,'data','attributes','position','array')[0]=null;}],
 ];
 for(const [name,change] of semantic){
  const pair=altered(change);
  await expect(other.evaluate(({packet,expected})=>window.scenePoc.restore(packet,expected),pair),name).rejects.toThrow();
 }
 const custom=packets.find(p=>p.format==='CUSTOM_DTO')!;
 const customNegative:[string,(p:unknown)=>void][]=[
  ['unsupported-node',p=>{obj(p,'root').type='Camera';}],
  ['forged-ref',p=>{obj(p,'root','ref').origin='APP_CREATED';}],
  ['wrong-matrix',p=>{list(p,'root','matrix')[12]=2;}],
  ['overlay-in-asset',p=>{obj(p,'asset','objects',0,'ref').origin='APP_CREATED';}],
  ['unsupported-attribute',p=>{obj(geoNode(get(p,'root')),'geometry','attributes').custom={itemSize:1,array:[1],normalized:false};}],
  ['external-url',p=>{obj(p,'root').url='https://invalid.test/asset';}],
 ];
 for(const [name,change] of customNegative){
  const payload=JSON.parse(Buffer.from(custom.bytes).toString('utf8'));change(payload);
  const bytes=Buffer.from(JSON.stringify(payload));const sha256=createHash('sha256').update(bytes).digest('hex');
  const pair={packet:{...custom,bytes:[...bytes],manifest:{...custom.manifest,sha256,byteLength:bytes.length}},
    expected:{scope:custom.manifest!.scope,format:'CUSTOM_DTO',sha256,byteLength:bytes.length}};
  await expect(other.evaluate(({packet,expected})=>window.scenePoc.restore(packet,expected),pair),name).rejects.toThrow();
 }
 for(const field of ['versionId','sourceSha256','builder','renderer','schema','frame','sourceUnit','sceneId','format','byteLength','sha256','revision']){
  const manifest={...json.manifest,scope:{...(json.manifest!.scope as object)}} as Record<string,unknown> & {scope:Record<string,unknown>};
  if(field in manifest.scope)manifest.scope[field]='wrong';else manifest[field]='wrong';
  await expect(other.evaluate(({packet,expected})=>window.scenePoc.restore(packet,expected),{packet:{...json,manifest},expected:json.manifest}),field).rejects.toThrow();
 }
 console.log('SCENE_POC_CUSTOM_NEGATIVES',customNegative.map(([name])=>name).join(','));
 console.log('SCENE_POC_MANIFEST_NEGATIVES','versionId,sourceSha256,builder,renderer,schema,frame,sourceUnit,sceneId,format,byteLength,sha256');
 console.log('SCENE_POC_SEMANTIC_NEGATIVES',semantic.map(([name])=>name).join(','));
 await consumer.close();
});
