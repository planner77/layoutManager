/** Issue #82 opt-in synthetic large-DXF Viewer + WCS Memo interaction benchmark.
 * Run via `npm run test:benchmark -- --grep TC-M1-BENCH`.
 * Never use real factory drawings or claim numeric thresholds are operational SLAs.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { masterFields } from '../e2e/master-helper';

function syntheticDxf(count:number):Buffer {
  const lines=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
    '0','SECTION','2','ENTITIES'];
  for(let i=0;i<count;i++){
    const x=(i%500)*4,y=Math.floor(i/500)*4;
    lines.push('0','LINE','5',(i+1).toString(16).toUpperCase(),'8','MEMO_BENCH',
      '10',String(x),'20',String(y),'11',String(x+1),'21',String(y+1));
  }
  lines.push('0','ENDSEC','0','EOF','');
  return Buffer.from(lines.join('\n'));
}
async function upload(request:APIRequestContext,n:number){
  const buffer=syntheticDxf(n);
  const response=await request.post('/api/cad-files',{multipart:{
    file:{name:'memo-bench-'+n+'.dxf',buffer,mimeType:'application/octet-stream'},
    ...(await masterFields(request,{businessUnit:'memo-bench-'+n,
      site:'Synthetic',building:'Benchmark',floor:'1'})),
    registeredAt:'2026-10-25',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(response.status()).toBe(201);
  return (await response.json()) as {id:string};
}

for(const n of [1000,10000]){
  test(`TC-M1-BENCH-${n}: synthetic DXF load, 5 memo anchors, zoom/fit/resize/reload`,async({page,request})=>{
    test.setTimeout(4*60*1000);
    const {id}=await upload(request,n);
    const loadStart=Date.now();
    await page.goto('/cad/versions/'+id+'/viewer?renderer=three-dxf-viewer');
    await expect(page.getByRole('status')).toHaveText('도면 표시 완료',{timeout:180000});
    const loadMs=Date.now()-loadStart;
    const memoStart=Date.now();
    for(let i=0;i<5;i++){
      await page.getByTestId('viewer-menu-memo-add').click();
      await page.getByTestId('cad-memo-title').fill('Benchmark memo '+(i+1));
      await page.getByTestId('cad-memo-x').fill(String(80+i*160));
      await page.getByTestId('cad-memo-y').fill('2');
      await page.getByTestId('cad-memo-coordinate-place').click();
      await page.getByTestId('cad-memo-create').click();
      await expect(page.getByTestId('cad-memo-status')).toContainText((i+1)+'/100');
    }
    await page.getByRole('button',{name:'전체 화면 확대'}).click();
    await page.getByRole('button',{name:'전체 화면 맞춤'}).click();
    await page.setViewportSize({width:1100,height:720});
    await page.getByRole('button',{name:'전체 화면 맞춤'}).click();
    const interactiveMs=Date.now()-memoStart;
    await expect(page.getByTestId('cad-memo-status')).toContainText('5/100');
    // A source document with many entities must not create extra memo nodes.
    expect(await page.getByTestId('cad-memo-pin').count()).toBeLessThanOrEqual(5);
    test.info().annotations.push({type:'synthetic-memo-benchmark',
      description:JSON.stringify({entities:n,loadMs,interactiveMs,sessionMemoCount:5,
        operationalSla:false})});
    await page.getByRole('button',{name:'다시 불러오기'}).click();
    await expect(page.getByRole('status')).toHaveText('도면 표시 완료',{timeout:180000});
    await expect(page.getByTestId('cad-memo-status')).toContainText('0/100');
  });
}
