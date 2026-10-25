/**
 * Issue #99 private real-DXF browser evidence only: NOT a public CI test or
 * operational PASS. Run on an isolated/disposable application DB and authorized
 * local DXF; no raw CAD, path, handles or layers are added to test artifacts.
 */
import {test,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {masterFields} from './master-helper';

type Sample={loadMs:number;sourceIndexMs:number|null;renderAuditMs:number|null;
 spatialIndexMs:number|null;boxSelectionMs:number;frameP95Ms:number;
 selected:number;excluded:number;browserHeap:number|null;
 consoleErrors:number;pageErrors:number};
const sourcePath=process.env.CAD_OUTLINE_ACCEPTANCE_DXF;

test('TC-P0P5-REAL-BROWSER: private real-DXF mapping and interaction samples',async({page,request})=>{
  test.skip(!sourcePath,'Approved local CAD_OUTLINE_ACCEPTANCE_DXF is required');
  test.setTimeout(15*60*1000);
  const expected=process.env.CAD_OUTLINE_ACCEPTANCE_EXPECTED_SHA256;
  const reportPath=process.env.CAD_OUTLINE_ACCEPTANCE_REPORT_PATH;
  if(!expected || !/^[a-f0-9]{64}$/i.test(expected) || !reportPath)
    throw new Error('Operator must supply expected source SHA256 and private report path');
  let file:Buffer;
  try{file=readFileSync(sourcePath!);}
  catch{throw new Error('Private source file could not be read');}
  if(!file.length||file.length>100*1024*1024)
    throw new Error('Expected nonempty authorized DXF <=100 MiB');
  const sha256=createHash('sha256').update(file).digest('hex');
  if(expected.toLowerCase()!==sha256)throw new Error('Operator SHA256 mismatch');
  // Operator must point the server at a disposable DB; uploads are intentionally not deleted.
  const created=await request.post('/api/cad-files',{multipart:{
    file:{name:'private-acceptance.dxf',mimeType:'application/octet-stream',buffer:file},
    ...(await masterFields(request,{businessUnit:'Acceptance P0/P5',product:'Private DXF',
      site:'authorized',building:'approved',floor:sha256.slice(0,12)})),
    registeredAt:'2026-10-16',makeCurrent:'false',deletePassword:'1234',
  }});
  expect(created.status()).toBe(201);
  const version=await created.json();
  const measurements:Sample[]=[];
  let webgl:{available:boolean;renderer:string|null;vendor:string|null}|null=null;
  for(let iteration=0;iteration<5;iteration++){
    let consoleErrors=0,pageErrors=0;
    const onConsole=(message:{type:()=>string})=>{if(message.type()==='error')consoleErrors++;};
    const onError=()=>{pageErrors++;};
    page.on('console',onConsole);
    page.on('pageerror',onError);
    try{
      const started=performance.now();
      await page.goto('/cad/versions/'+version.id+'/viewer?renderer=three-dxf-viewer');
      await expect(page.getByRole('status')).toContainText(/도면 표시 완료|도면 일부 표시 완료/,{timeout:120000});
      const loadMs=performance.now()-started;
      const menu=page.getByTestId('viewer-menu-outline-tool');
      await expect(menu).toBeEnabled({timeout:120000});
      await menu.click();
      const tools=page.getByTestId('cad-outline-tools');
      await expect(tools).toBeVisible({timeout:120000});
      const state=await page.getByTestId('outline-render-mapping').textContent()??'';
      const info=await page.getByTestId('outline-selection-count').textContent()??'';
      const extract=(regex:RegExp)=>{
        const value=regex.exec(state)?.[1];return value?Number(value):null;
      };
      await tools.getByRole('button',{name:'선택 모드'}).click();
      const canvas=page.locator('canvas').first();
      await canvas.scrollIntoViewIfNeeded();
      await expect(canvas).toBeInViewport({ratio:1});
      const box=await canvas.boundingBox();
      if(!box||box.width<=12||box.height<=12)throw new Error('Invalid visible browser canvas');
      if(webgl===null)webgl=await canvas.evaluate(node=>{
        const c=node as HTMLCanvasElement;
        const gl=c.getContext('webgl2')??c.getContext('webgl');
        if(!gl)return {available:false,renderer:null,vendor:null};
        const ext=gl.getExtension('WEBGL_debug_renderer_info');
        return {available:true,
          renderer:ext?String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)):null,
          vendor:ext?String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)):null};
      });
      const selectionStarted=performance.now();
      await page.mouse.move(box.x+6,box.y+6);
      await page.mouse.down();
      await page.mouse.move(box.x+box.width-6,box.y+box.height-6,{steps:5});
      await page.mouse.up();
      const countText=await page.getByTestId('outline-selection-count').textContent()??'';
      const selected=Number(/선택\s+(\d+)개/.exec(countText)?.[1]??0);
      const boxSelectionMs=performance.now()-selectionStarted;
      const frameP95Ms=await page.evaluate(async()=>{
        const values:number[]=[];
        let before=await new Promise<number>(r=>requestAnimationFrame(r));
        for(let k=0;k<30;k++){
          const now=await new Promise<number>(r=>requestAnimationFrame(r));
          values.push(now-before);before=now;
        }
        values.sort((a,b)=>a-b);
        return values[Math.ceil(values.length*0.95)-1];
      });
      const browserHeap=await page.evaluate(()=>{
        const p=performance as Performance & {memory?:{usedJSHeapSize:number}};
        return p.memory?.usedJSHeapSize??null;
      });
      measurements.push({
        loadMs,sourceIndexMs:extract(/원본 인덱스\s+([\d.]+)\s*ms/),
        renderAuditMs:extract(/렌더 대조\s+([\d.]+)\s*ms/),
        spatialIndexMs:extract(/공간 인덱스\s+([\d.]+)\s*ms/),
        boxSelectionMs,frameP95Ms,selected,
        excluded:extract(/매핑 제외\s+(\d+)개/)??0,
        browserHeap,consoleErrors,pageErrors,
      });
      if(!/분석\s+\d+개/.test(info))
        throw new Error('Missing selection mapping diagnostics');
    }finally{
      page.off('console',onConsole);
      page.off('pageerror',onError);
    }
  }
  const p95=(values:number[])=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*0.95)-1];
  const report={
    schemaVersion:2,type:'private-browser-observation-not-operational-PASS',
    sourceSha256:sha256,bytes:file.length,
    environment:{
      browserName:page.context().browser()?.browserType().name()??'unknown',
      browserVersion:page.context().browser()?.version()??'unknown',
      webgl, // GPU identity and frame pacing only; NOT GPU utilization or VRAM telemetry
    },
    samples:measurements,
    loadP95Ms:p95(measurements.map(s=>s.loadMs)),
    boxSelectionP95Ms:p95(measurements.map(s=>s.boxSelectionMs)),
    frameP95Ms:p95(measurements.map(s=>s.frameP95Ms)),
    limitations:[
      'Five browser samples are observations, not CAD position/area ground truth.',
      'Frame pacing is not GPU utilization or VRAM; collect external device telemetry.',
      'Click/layer/ESC/fullscreen/Worker cancellation still require operator verification.',
      'No raw CAD, path, handles or layers are written to this private report.',
    ],
  };
  const name=resolve(reportPath);
  mkdirSync(dirname(name),{recursive:true});
  writeFileSync(name,JSON.stringify(report,null,2)+'\n',{flag:'w',mode:0o600});
  expect(measurements.every(s=>s.consoleErrors===0&&s.pageErrors===0)).toBe(true);
  expect(measurements.every(s=>Number.isFinite(s.loadMs)&&Number.isFinite(s.boxSelectionMs))).toBe(true);
  const threshold=Number(process.env.CAD_OUTLINE_ACCEPTANCE_MIN_SELECTED??1);
  expect(Number.isInteger(threshold)&&threshold>0).toBe(true);
  expect(measurements.every(s=>s.selected>=threshold)).toBe(true);
});
