import {test,expect} from '@playwright/test';
import {masterFields} from './master-helper';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const drawing=[
 '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
 '0','SECTION','2','ENTITIES',
 '0','LWPOLYLINE','5','1A','8','0','70','1',
 '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
 '0','ENDSEC','0','EOF','',
].join('\n');
test('TC-OUT-E2E-001: selection and convex/precise preview, non-destructive JSON export',async({page,request})=>{
 const created=await request.post('/api/cad-files',{multipart:{
   file:{name:'issue31-outline-square.dxf',mimeType:'application/octet-stream',buffer:Buffer.from(drawing)},
   ...(await masterFields(request,{businessUnit:'Issue31',site:'outline',building:'A',floor:'1'})),
   registeredAt:'2026-10-16',makeCurrent:'true',deletePassword:'1234',
 }});
 expect(created.status()).toBe(201);
 const file=await created.json();
 await page.goto('/cad/versions/'+file.id+'/viewer?renderer=three-dxf-viewer');
 await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
 const tools=page.getByTestId('cad-outline-tools');
 await expect(tools).toBeVisible();
 await expect(page.getByTestId('outline-render-mapping')).toContainText('매핑 제외 0개');
 await tools.getByRole('button',{name:'선택 모드'}).click();
 const canvas=page.locator('canvas');
 const box=(await canvas.boundingBox())!;
 // Left-to-right window contains the entire fitted 2D square.
 await page.mouse.move(box.x+5,box.y+5);await page.mouse.down();
 await page.mouse.move(box.x+box.width-5,box.y+box.height-5,{steps:8});await page.mouse.up();
 await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
 await tools.getByRole('button',{name:'볼록 외곽선 미리보기'}).click();
 await expect(page.getByTestId('outline-preview')).toContainText('볼록 경계');
 await tools.getByRole('button',{name:'임시 확정'}).click();
 const download=page.waitForEvent('download');
 await tools.getByRole('button',{name:/JSON 내보내기/}).click();
 const fileDownload=await download;
 expect(fileDownload.suggestedFilename()).toMatch(/cad-outlines-/);
 await tools.getByRole('button',{name:'정밀 외곽선 미리보기'}).click();
 await expect(page.getByTestId('outline-preview')).toContainText('실제 폐곡선 Union');
 // The old selection's result must become unconfirmable synchronously.
 await tools.getByRole('button',{name:'선택 해제'}).click();
 await expect(tools.getByRole('button',{name:'임시 확정'})).toBeDisabled();
 {
   const again=(await canvas.boundingBox())!;
   await page.mouse.move(again.x+5,again.y+5);await page.mouse.down();
   await page.mouse.move(again.x+again.width-5,again.y+again.height-5,{steps:8});await page.mouse.up();
   await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
 }
 await tools.getByRole('button',{name:'정밀 외곽선 미리보기'}).click();
 await expect(page.getByTestId('outline-preview')).toContainText('실제 폐곡선 Union');
 // Verify the PRODUCTION-bundled Web Worker really ran polygon-clipping,
 // instead of accepting a static preview label or a webpack warning.
 await tools.getByRole('button',{name:'임시 확정'}).click();
 const preciseDownload=page.waitForEvent('download');
 await tools.getByRole('button',{name:/JSON 내보내기/}).click();
 const downloaded=await preciseDownload;
 const exported=JSON.parse(await readFile(await downloaded.path(),'utf8'));
 expect(exported.sourceSha256).toBe(createHash('sha256').update(drawing).digest('hex'));
 expect(exported.outlines).toHaveLength(2);
 const result=exported.outlines[1].result;
 expect(result.kind).toBe('PRECISE');
 expect(result.algorithm).toBe('polygon-clipping-union-v1');
 expect(result.persistable).toBe(true);
 expect(result.geometry.type).toBe('Polygon');
 expect(result.sourceEntityIds).toEqual([file.id+':'+exported.sourceSha256+':1A']);
 const ring:number[][]=result.geometry.coordinates[0];
 expect(ring[0]).toEqual(ring[ring.length-1]);
 const polygonArea=Math.abs(ring.slice(0,-1).reduce((sum,p,i)=>{
   const next=ring[i+1];
   return sum+p[0]*next[1]-next[0]*p[1];
 },0)/2);
 expect(polygonArea).toBeCloseTo(10000,2);
 await page.getByRole('button',{name:'전체 화면',exact:true}).click();
 await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen','true');
 await expect(page.getByTestId('outline-selection-count')).toContainText('선택 1개');
 await page.getByRole('button',{name:'전체 화면 종료',exact:true}).click();
 // Force CSS fallback and verify Escape clears selection AND exits fullscreen.
 await page.getByTestId('cad-viewer-shell').evaluate(shell=>{
   Object.defineProperty(shell,'requestFullscreen',{configurable:true,
      value:()=>Promise.reject(new Error('test CSS fallback'))});
 });
 await page.getByRole('button',{name:'전체 화면',exact:true}).click();
 await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen','true');
 await page.keyboard.press('Escape');
 await expect(page.getByTestId('cad-viewer-shell')).toHaveAttribute('data-fullscreen','false');
 await expect(page.getByTestId('outline-selection-count')).toContainText('선택 0개');
 await tools.getByRole('button',{name:'탐색 모드'}).click();
 await page.getByRole('button',{name:'다시 불러오기'}).click();
 await expect(page.getByTestId('outline-selection-count')).toContainText('선택 0개');
});
