/** Issue #31 opt-in PRIVATE acceptance run for approved real DXF.
 * Runs ONLY when CAD_OUTLINE_ACCEPTANCE_DXF points to an authorized local DXF.
 * Do not upload real CAD to GitHub CI or public artifact stores.
 */
import {test,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {masterFields} from './master-helper';

type Sample={loadMs:number;sourceIndexMs:number|null;renderAuditMs:number|null;
 spatialIndexMs:number|null;selected:number;excluded:number;browserHeap:number|null;
 consoleErrors:number;pageErrors:number};
const sourcePath=process.env.CAD_OUTLINE_ACCEPTANCE_DXF;
test('TC-OUT-REAL-BROWSER: locally approved real-DXF rendering, mappings and selection timing',async({page,request})=>{
 test.skip(!sourcePath,'Approved local CAD_OUTLINE_ACCEPTANCE_DXF is required');
 test.setTimeout(15*60*1000);
 const file=readFileSync(sourcePath!);
 if(!file.length||file.length>100*1024*1024)throw new Error('Expected nonempty DXF <=100 MiB');
 const sha256=createHash('sha256').update(file).digest('hex');
 const expected=process.env.CAD_OUTLINE_ACCEPTANCE_EXPECTED_SHA256;
 if(expected&&expected.toLowerCase()!==sha256)throw new Error('Operator SHA256 mismatch');
 const created=await request.post('/api/cad-files',{multipart:{
   file:{name:'private-acceptance.dxf',mimeType:'application/octet-stream',buffer:file},
   ...(await masterFields(request,{businessUnit:'Acceptance P0/P5',product:'Private DXF',
     site:'authorized',building:'approved',floor:sha256.slice(0,12)})),
   registeredAt:'2026-10-16',makeCurrent:'false',deletePassword:'1234',
 }});
 expect(created.status()).toBe(201);
 const version=await created.json();
 const measurements:Sample[]=[];
 for(let iteration=0;iteration<5;iteration++){
   let consoleErrors=0,pageErrors=0;
   const onConsole=(message:{type:()=>string})=>{if(message.type()==='error')consoleErrors++;};
   const onError=()=>{pageErrors++;};
   page.on('console',onConsole);
   page.on('pageerror',onError);
   const started=performance.now();
   await page.goto('/cad/versions/'+version.id+'/viewer?renderer=three-dxf-viewer');
   await expect(page.getByRole('status')).toContainText(/도면 표시 완료|도면 일부 표시 완료/,{timeout:120000});
   const loadMs=performance.now()-started;
   const menu=page.getByTestId('viewer-menu-outline-tool');
   // A real DXF with no source↔render mapped entities cannot be accepted.
   await expect(menu).toBeEnabled({timeout:120000});
   await menu.click();
   const tools=page.getByTestId('cad-outline-tools');
   await expect(tools).toBeVisible({timeout:120000});
   const state=await page.getByTestId('outline-render-mapping').textContent()??'';
   const info=await page.getByTestId('outline-selection-count').textContent()??'';
   const extract=(regex:RegExp)=>{const value=regex.exec(state)?.[1];return value?Number(value):null;};
   await tools.getByRole('button',{name:'선택 모드'}).click();
   const canvas=page.locator('canvas').first(),box=(await canvas.boundingBox())!;
   await page.mouse.move(box.x+6,box.y+6);await page.mouse.down();
   await page.mouse.move(box.x+box.width-6,box.y+box.height-6,{steps:5});
   await page.mouse.up();
   const countText=await page.getByTestId('outline-selection-count').textContent()??'';
   const selected=Number(/선택\s+(\d+)개/.exec(countText)?.[1]??0);
   const browserHeap=await page.evaluate(()=>{
     const p=performance as Performance & {memory?:{usedJSHeapSize:number}};
     return p.memory?.usedJSHeapSize??null;
   });
   measurements.push({loadMs,sourceIndexMs:extract(/원본 인덱스\s+([\d.]+)\s*ms/),
     renderAuditMs:extract(/렌더 대조\s+([\d.]+)\s*ms/),
     spatialIndexMs:extract(/공간 인덱스\s+([\d.]+)\s*ms/),
     selected,excluded:extract(/매핑 제외\s+(\d+)개/)??0,
     browserHeap,consoleErrors,pageErrors});
   page.off('console',onConsole);
   page.off('pageerror',onError);
   if(!/분석\s+\d+개/.test(info))throw new Error('Missing selection mapping diagnostics');
 }
 const values=measurements.map(x=>x.loadMs).sort((a,b)=>a-b);
 const report={schemaVersion:1,type:'private-browser-observation-not-operational-PASS',
   sourceSha256:sha256,bytes:file.length,samples:measurements,
   loadP50Ms:values[2],loadP95Ms:values[4],
   limitations:['Synthetic CI cannot certify real CAD geometry expectations',
     'Rendered-block WCS and GPU thresholds require owner-provided reference data',
     'No raw DXF, path, entity handles or layer names are written to this report']};
 const path=process.env.CAD_OUTLINE_ACCEPTANCE_REPORT_PATH;
 if(path){const name=resolve(path);mkdirSync(dirname(name),{recursive:true});
   writeFileSync(name,JSON.stringify(report,null,2)+'\n',{flag:'w',mode:0o600});}
 expect(measurements.every(x=>x.pageErrors===0&&x.consoleErrors===0)).toBe(true);
 expect(measurements.every(x=>Number.isFinite(x.loadMs))).toBe(true);
 const threshold=Number(process.env.CAD_OUTLINE_ACCEPTANCE_MIN_SELECTED??1);
 expect(Number.isInteger(threshold)&&threshold>0).toBe(true);
 expect(measurements.every(x=>x.selected>=threshold)).toBe(true);
});
