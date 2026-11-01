import {expect,test} from '@playwright/test';
import {masterFields} from './master-helper';
type BodyGate=Window & {__pr200BodyReady?:boolean;__pr200ReleaseBody?:()=>void};
test('PR200: renderer escape shares a completed HTTP body while the source Promise is pending',async({page,request})=>{
 const uploaded=await request.post('/api/cad-files',{multipart:{
  file:{name:'pr200-source-race.dxf',mimeType:'application/octet-stream',buffer:Buffer.from(
   '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n100\n0\nENDSEC\n0\nEOF\n')},
  ...(await masterFields(request,{businessUnit:'pr200-source-race',site:'race',building:'A',floor:'1'})),
  registeredAt:'2026-11-01',makeCurrent:'true',deletePassword:'1234',
 }});
 expect(uploaded.status()).toBe(201);
 const {id}=await uploaded.json() as {id:string},sourcePath=`/api/cad-files/${id}/content`;
 await page.addInitScript(({sourcePath})=>{
  const original=window.fetch.bind(window);let gated=false;
  window.fetch=async(...args:Parameters<typeof fetch>)=>{
   const response=await original(...args);
   const input=args[0],url=input instanceof Request?input.url:String(input);
   if(new URL(url,window.location.href).pathname===sourcePath&&!gated){
    gated=true;const body=response.arrayBuffer.bind(response);
    response.arrayBuffer=async()=>{
     const bytes=await body();
     const gate=new Promise<void>(resolve=>{(window as BodyGate).__pr200ReleaseBody=resolve;});
     (window as BodyGate).__pr200BodyReady=true;
     await gate;return bytes;
    };
   }
   return response;
  };
 },{sourcePath});
 let gets=0,completed=0;const failures:string[]=[];
 const matches=(url:string)=>new URL(url).pathname===sourcePath;
 page.on('request',r=>{if(matches(r.url()))gets++;});
 page.on('requestfinished',r=>{if(matches(r.url()))completed++;});
 page.on('requestfailed',r=>{if(matches(r.url()))failures.push(r.failure()?.errorText??'UNKNOWN');});
 try{
  await page.goto(`/cad/versions/${id}/viewer`,{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>(window as BodyGate).__pr200BodyReady===true)).toBe(true);
  await expect.poll(()=>completed).toBe(1);
  await expect(page.getByTestId('viewer-loading-overlay')).toBeVisible();
  await page.getByRole('button',{name:'로딩 중단 후 dxf-viewer로 열기'}).click();
  await page.evaluate(()=>(window as BodyGate).__pr200ReleaseBody?.());
  await expect(page.getByTestId('viewer-active-renderer')).toHaveText('dxf-viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  await expect.poll(()=>gets-completed-failures.length).toBe(0);
  expect(completed).toBe(1);expect(gets).toBe(1);expect(failures).toEqual([]);
  await expect(page.getByTestId('cad-canvas').locator('canvas')).toHaveCount(1);
 }finally{await page.evaluate(()=>(window as BodyGate).__pr200ReleaseBody?.()).catch(()=>undefined);}
});
