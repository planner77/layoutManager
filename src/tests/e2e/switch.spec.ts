import {test,expect} from '@playwright/test';
test('TC-SWITCH-001/002: loading blocks renderer changes, shared bytes and twenty switches release resources',async({page,request})=>{
  test.setTimeout(120_000);
  await page.addInitScript(()=>{
    const stats={workers:0,blobs:0,contexts:0,lost:0};Object.defineProperty(window,'__cadResources',{value:stats});
    const urls=new Set<string>(),create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=(blob)=>{const url=create(blob);urls.add(url);stats.blobs=urls.size;return url;};
    URL.revokeObjectURL=url=>{urls.delete(url);stats.blobs=urls.size;revoke(url);};
    const OriginalWorker=window.Worker;
    window.Worker=class extends OriginalWorker {
      private stopped=false;
      constructor(url:string|URL,options?:WorkerOptions){super(url,options);stats.workers++;}
      terminate(){if(!this.stopped){this.stopped=true;stats.workers--;}super.terminate();}
    };
    const seen=new WeakSet<HTMLCanvasElement>(),getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=new Proxy(getContext,{apply(target,canvas,args){
      const context=Reflect.apply(target,canvas,args);
      if(context && /webgl/.test(args[0]) && !seen.has(canvas)) {seen.add(canvas);stats.contexts++;canvas.addEventListener('webglcontextlost',()=>stats.lost++,{once:true});}
      return context;
    }});
  });
  const response=await request.post('/api/cad-files',{multipart:{file:{name:'switch.dxf',mimeType:'application/octet-stream',buffer:Buffer.from('0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n100\n0\nCIRCLE\n8\n0\n10\n50\n20\n50\n40\n20\n0\nENDSEC\n0\nEOF\n')},businessUnit:'Switch',site:'race',building:'A',floor:'1',registeredAt:'2026-09-08',makeCurrent:'true',deletePassword:'1234'}});
  expect(response.status()).toBe(201);const file=await response.json();let downloads=0,release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/cad-files/*/content',async route=>{downloads++;if(downloads===1)await gate;await route.continue();});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`/cad/versions/${file.id}/viewer`);
  await expect.poll(()=>downloads).toBe(1);
  await expect(page.getByTestId('global-loading-overlay')).toBeVisible();
  await expect(page.getByRole('button',{name:'three-dxf-viewer',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'다시 불러오기'})).toBeDisabled();
  release();
  await expect(page.getByTestId('global-loading-overlay')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  const marker=await page.evaluate(()=>{const marker=crypto.randomUUID();Object.defineProperty(window,'__documentMarker',{value:marker});return marker;});
  const resource=()=>page.evaluate(()=>{const stats=(window as unknown as {__cadResources:{workers:number;blobs:number;contexts:number;lost:number}}).__cadResources;return {workers:stats.workers,blobs:stats.blobs,active:stats.contexts-stats.lost};});
  for(let i=0;i<20;i++){
    const renderer=i%2===0?'three-dxf-viewer':'dxf-viewer';
    await page.getByRole('button',{name:renderer,exact:true}).click();
    await expect(page.getByTestId('global-loading-overlay')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect.poll(resource).toEqual({workers:0,blobs:0,active:1});
    expect(await page.evaluate(()=>(window as unknown as {__documentMarker:string}).__documentMarker)).toBe(marker);
    await expect(page).toHaveURL(new RegExp(`${file.id}/viewer\\?renderer=${renderer}$`));
  }
  expect(downloads).toBe(1);await expect(page.getByRole('heading')).toHaveText(file.displayName);
  await page.getByRole('button',{name:'다시 불러오기'}).click();await expect(page.getByTestId('global-loading-overlay')).toHaveCount(0);await expect(page.getByRole('status')).toHaveText('도면 표시 완료');expect(downloads).toBe(2);
  await page.getByRole('link',{name:'← 버전 목록'}).click();await expect(page.locator('canvas')).toHaveCount(0);await expect.poll(resource).toEqual({workers:0,blobs:0,active:0});
  expect(errors).toEqual([]);
});
