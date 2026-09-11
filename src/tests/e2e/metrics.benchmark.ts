import {test,expect} from '@playwright/test';
import {appendFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {ViewerMetric} from '../../viewers/core/metrics';
for(const count of [100,10000,100000])for(const renderer of ['dxf-viewer','three-dxf-viewer'])for(let iteration=1;iteration<=5;iteration++) {
  test(`TC-MET-002 ${count} LINE ${renderer} pair ${iteration}`,async({page,request})=>{
    test.setTimeout(180000);
    let text='0\nSECTION\n2\nENTITIES\n';
    for(let i=0;i<count;i++){const x=i%1000,y=Math.floor(i/1000);text+=`0\nLINE\n8\n0\n10\n${x}\n20\n${y}\n30\n0\n11\n${x+0.8}\n21\n${y+0.8}\n31\n0\n`;}
    text+='0\nENDSEC\n0\nEOF\n';const buffer=Buffer.from(text);const sha256=createHash('sha256').update(buffer).digest('hex');
    const response=await request.post('/api/cad-files',{multipart:{file:{name:`benchmark-${count}.dxf`,mimeType:'application/octet-stream',buffer},businessUnit:'Benchmark',site:renderer,building:String(count),floor:String(iteration),registeredAt:'2026-09-08',makeCurrent:'false',deletePassword:'1234'}});
    expect(response.status()).toBe(201);const file=await response.json();
    let consoleErrors=0,pageErrors=0;
    page.on('console',message=>{if(message.type()==='error')consoleErrors++;});page.on('pageerror',()=>pageErrors++);
    await page.goto(`/cad/versions/${file.id}/viewer?renderer=${renderer}`);
    for(const mode of ['cold','warm']) {
      if(mode==='warm'){
        await page.getByRole('button',{name:renderer==='dxf-viewer'?'three-dxf-viewer':'dxf-viewer',exact:true}).click();
        await expect(page.getByRole('status')).toHaveText('도면 표시 완료',{timeout:120000});
        await page.getByRole('button',{name:renderer,exact:true}).click();
      }
      await expect(page.getByTestId('viewer-metric')).toBeAttached({timeout:120000});
      const metric:ViewerMetric=JSON.parse((await page.getByTestId('viewer-metric').textContent())!);
      const zoomFrameMs=metric.result==='success'?await page.evaluate(async()=>{
        const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='확대')!;
        const start=performance.now();button.click();await new Promise(requestAnimationFrame);return performance.now()-start;
      }):null;
      mkdirSync('benchmark-results',{recursive:true});appendFileSync('benchmark-results/measurements.jsonl',JSON.stringify({count,sha256,iteration,mode,metric,zoomFrameMs,consoleErrors,pageErrors})+'\n');
      expect(metric.fileBytes).toBe(buffer.length);expect(metric.result).toBe('success');
      expect(metric.sourceMode).toBe(mode==='cold'?'miss':'memory');
      expect(metric.parseMs).toBeNull();expect(metric.firstDisplayMs).not.toBeNull();
      if(renderer==='three-dxf-viewer')expect(metric.entityCount).toBe(count);
      expect(consoleErrors).toBe(0);expect(pageErrors).toBe(0);
    }
  });
}
