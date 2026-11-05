import {expect,test,type Page} from '@playwright/test';
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {assertRuntimeApp,type RuntimeReceipt} from './identity';

const receipt=JSON.parse(readFileSync(process.env.G7_RR2_RECEIPT!,'utf8')) as {
  kind:string;nonce:string;root:string;oldPort:number;liveVolume:string;
  appName:string;project:string;images:RuntimeReceipt['images']&
    {new:{app:string;'cpu-worker':string}};
};
const origin=process.env.G7_RR2_ORIGIN!;
const dx=Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES','0','LINE','5','AB','8','0',
  '10','0','20','0','11','15','21','20','0','ENDSEC','0','EOF','',
].join('\n'));
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
type OldState={
  kind:string;nonce:string;adminLogin:string;adminPassword:string;
  readyVersion:string;queuedVersion:string;sourceSha:string;
  ids:Record<string,string>;
};
const readState=():OldState=>JSON.parse(readFileSync(receipt.root+'/old-http-state.json','utf8')) as OldState;
function owned(state:OldState):void{
  expect(receipt.kind).toBe('RR2_OWNED_NAMESPACE');
  expect(receipt.nonce).toMatch(/^[a-f0-9]{16}$/);
  expect(state.kind).toBe('RR2_OLD_HTTP_STATE');
  expect(state.nonce).toBe(receipt.nonce);
  expect(receipt.liveVolume).toBe('layoutmanager-rr2-live-'+receipt.nonce);
  expect(origin).toBe('http://127.0.0.1:'+receipt.oldPort);
  assertRuntimeApp(receipt,'new',receipt.appName,receipt.project,receipt.liveVolume);
}
async function signIn(page:Page,state:OldState){
  await page.goto('/g7-runtime');
  await expect(page.getByRole('heading',{name:'로그인',exact:true})).toBeVisible();
  await page.getByLabel('계정',{exact:true}).fill(state.adminLogin);
  await page.getByLabel('비밀번호',{exact:true}).fill(state.adminPassword);
  const response=page.waitForResponse(r=>r.request().method()==='POST'&&
    new URL(r.url()).pathname==='/api/g7-runtime/auth/login');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  expect((await response).status()).toBe(200);
  expect((await page.request.get('/api/g7-runtime/auth/session')).status()).toBe(200);
}
test('RR3 upgraded digest App preserves historical Browser and accepts signed CPU upload',async({page})=>{
  const state=readState();owned(state);
  const gate=await page.request.get('/api/g7-runtime/status');
  expect(await gate.json()).toMatchObject({state:'ACTIVE',authEnabled:true,cadWriteEnabled:true});
  await signIn(page,state);
  const listing=await page.request.get('/api/cad-files?current=true');
  expect(listing.status()).toBe(200);
  expect((await listing.json() as {items:Array<{id:string}>}).items.some(x=>x.id===state.queuedVersion)).toBe(true);
  const old=await page.request.get('/api/cad-files/'+state.readyVersion+'/scene');
  expect(old.status()).toBe(200);
  const oldScene=await old.json() as {status:string;contentUrl:string;manifest:{sha256:string}};
  expect(oldScene.status).toBe('READY');
  expect(sha(await (await page.request.get(oldScene.contentUrl)).body())).toBe(oldScene.manifest.sha256);
  const session=await (await page.request.get('/api/g7-runtime/auth/session')).json() as {csrfToken:string};
  const headers={origin,'x-csrf-token':session.csrfToken};
  for(const denied of [{origin:'http://attacker.invalid','x-csrf-token':session.csrfToken},
                       {origin,'x-csrf-token':'forged'}]){
    const response=await page.request.post('/api/cad-files',{headers:denied,multipart:{
      file:{name:'rr2-denied.dxf',mimeType:'application/octet-stream',buffer:dx},
      businessUnitId:state.ids['business-units'],productId:state.ids.products,
      siteId:state.ids.sites,buildingId:state.ids.buildings,floorId:state.ids.floors,
      registeredAt:'2026-11-05',deletePassword:'rr2-synthetic-delete',makeCurrent:'true',
    }});
    expect(response.status()).toBe(403);
  }
  const response=await page.request.post('/api/cad-files',{headers,multipart:{
    file:{name:'rr2-current-cpu.dxf',mimeType:'application/octet-stream',buffer:dx},
    businessUnitId:state.ids['business-units'],productId:state.ids.products,
    siteId:state.ids.sites,buildingId:state.ids.buildings,floorId:state.ids.floors,
    registeredAt:'2026-11-05',deletePassword:'rr2-synthetic-delete',makeCurrent:'true',
  }});
  expect(response.status(),await response.text()).toBe(201);
  const version=await response.json() as {id:string;sceneBuild?:{jobId:string;status:string}};
  expect(version.sceneBuild?.status).toBe('QUEUED');
  const job=await page.request.get('/api/scene-build-jobs?versionId='+version.id);
  expect(job.status()).toBe(200);
  expect((await job.json() as {rows:Record<string,{state:string}>}).rows[version.id].state).toBe('QUEUED');
  process.stdout.write('RR3_SIGNED_UPLOAD_QUEUED_PASS '+JSON.stringify({versionId:version.id,jobId:version.sceneBuild?.jobId})+'\n');
  expect((await page.request.post('/api/g7-runtime/auth/logout',{headers})).status()).toBe(200);
});

test('RR3 detached digest Worker and fresh Viewer restore CPU Scene without original GET',async({page,browser})=>{
  const state=readState();owned(state);
  const id=process.env.G7_RR2_CPU_VERSION;
  expect(id).toMatch(/^[a-f0-9-]{36}$/);
  await signIn(page,state);
  const scene=await page.request.get('/api/cad-files/'+id+'/scene');
  expect(scene.status()).toBe(200);
  const data=await scene.json() as {status:string;contentUrl:string;manifest:{sha256:string;scope:{builder:string;sourceSha256:string}}};
  expect(data.status).toBe('READY');
  expect(data.manifest.scope.builder).toContain('node-cpu-line');
  expect(data.manifest.scope.sourceSha256).toBe(sha(dx));
  const content=await page.request.get(data.contentUrl);
  expect(content.status()).toBe(200);
  const bytes=await content.body();
  expect(sha(bytes)).toBe(data.manifest.sha256);
  const dto=JSON.parse(bytes.toString('utf8')) as {root:{children:Array<{type:string;geometry:{attributes:{position:{array:number[]}}}}>};viewerData:{sourceIndex:{state:string;reason:string}}};
  expect(dto.root.children[0].type).toBe('Line');
  expect(dto.root.children[0].geometry.attributes.position.array).toEqual([0,0,0,15,20,0]);
  expect(dto.viewerData.sourceIndex).toEqual({state:'UNAVAILABLE',reason:'INDEX_ABSENT'});
  const admin=await (await page.request.get('/api/g7-runtime/auth/session')).json() as {csrfToken:string};
  const adminHeaders={origin,'x-csrf-token':admin.csrfToken};
  const login='rr2-viewer-'+randomBytes(6).toString('hex');
  const initial='rr2-'+randomBytes(16).toString('hex');
  const password='rr2-'+randomBytes(16).toString('hex');
  const created=await page.request.post('/api/g7-runtime/users/create',{headers:adminHeaders,
    data:{login,initialPassword:initial}});
  expect(created.status()).toBe(201);
  const actor=(await created.json() as {id:string}).id;
  for(const [kind,value] of [['role','Editor'],['site',state.ids.sites]] as const){
    const grant=await page.request.post('/api/g7-runtime/access/grant',{headers:adminHeaders,
      data:{kind,operation:'grant',affectedUserId:actor,value}});
    expect(grant.status()).toBe(200);
  }
  const changed=await page.request.post('/api/g7-runtime/auth/initial-change',{
    headers:{origin},data:{login,password:initial,newPassword:password}});
  expect(changed.status()).toBe(200);
  const fresh=await browser.newContext({baseURL:origin,viewport:{width:1440,height:960}});
  try{
    const viewer=await fresh.newPage();
    const loginResponse=await viewer.request.post('/api/g7-runtime/auth/login',{
      headers:{origin},data:{login,password}});
    expect(loginResponse.status()).toBe(200);
    let originalGets=0,sceneGets=0;
    const sceneResponses:Array<{path:string;status:number;atMs:number}>=[];
    const beganAt=Date.now();
    viewer.on('request',request=>{
      const path=new URL(request.url()).pathname;
      if(path==='/api/cad-files/'+id+'/content')originalGets++;
      if(path.includes('/cad-files/'+id+'/scene'))sceneGets++;
    });
    viewer.on('response',response=>{
      const path=new URL(response.url()).pathname;
      if(path.includes('/cad-files/'+id+'/scene')||path==='/api/g7-runtime/auth/session')
        sceneResponses.push({path,status:response.status(),atMs:Date.now()-beganAt});
    });
    await viewer.route('**/api/cad-files/'+id+'/content',route=>route.abort());
    expect((await viewer.request.get('/api/g7-runtime/auth/session')).status()).toBe(200);
    await viewer.goto('/cad/versions/'+id+'/viewer?renderer=three-dxf-viewer');
    await expect(viewer.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
    await expect(viewer.getByTestId('cad-viewer-shell').getByRole('status')).toHaveText('도면 일부 표시 완료');
    await expect(viewer.getByTestId('viewer-coverage')).toContainText('원본 정밀 선택 인덱스를 사용할 수 없습니다');
    await expect(viewer.getByTestId('cad-canvas').locator('canvas')).toHaveCount(1);
    const beforeReloadSessionStatus=sceneResponses.filter(x=>x.path==='/api/g7-runtime/auth/session').at(-1)?.status??null;
    const beforeReloadCookie=(await viewer.context().cookies(origin)).some(cookie=>cookie.name==='cad_session');
    await viewer.reload();
    try{
      await expect(viewer.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
    }catch(error){
      const diagnostic:{beforeReloadSessionStatus:number|null;beforeReloadCookie:boolean;
        afterReloadSession?:number;afterReloadCookie?:boolean;sceneRead?:number;
        probeFailed?:boolean;sceneResponses:Array<{path:string;status:number;atMs:number}>}={
        beforeReloadSessionStatus,beforeReloadCookie,sceneResponses:sceneResponses.slice(-16)};
      try{
        diagnostic.afterReloadCookie=(await viewer.context().cookies(origin)).some(cookie=>cookie.name==='cad_session');
        diagnostic.afterReloadSession=(await viewer.request.get('/api/g7-runtime/auth/session')).status();
        diagnostic.sceneRead=(await viewer.request.get('/api/cad-files/'+id+'/scene')).status();
      }catch{diagnostic.probeFailed=true;}
      console.info('RR3_RELOAD_DIAGNOSTIC '+JSON.stringify(diagnostic));
      throw error;
    }
    expect(sceneGets).toBeGreaterThanOrEqual(2);
    expect(originalGets).toBe(0);
  }finally{await fresh.close();}
  console.info('RR3_CPU_VIEWER_PASS');
});
