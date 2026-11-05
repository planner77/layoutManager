import {expect,test,type APIRequestContext,type BrowserContext,type Page} from '@playwright/test';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const origin=process.env.G7_P1D_ORIGIN!;
const volume=process.env.G7_P1D_VOLUME!;
const sourceCommit=process.env.G7_P1D_SOURCE_SHA!;
const probeSource=process.env.G7_P1D_PROBE!;
const workerImage='cad-layout-viewer:ci-cpu-worker';
const adminPassword='p1d-admin-changed-secret';
const editorPassword='p1d-editor-changed-secret';
const dx=Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES','0','LINE','5','AB','8','0',
  '10','0','20','0','11','15','21','20','0','ENDSEC','0','EOF','',
].join('\n'));
const unsupported=Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES','0','CIRCLE','5','AC','8','0',
  '10','0','20','0','40','10','0','ENDSEC','0','EOF','',
].join('\n'));
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

function requireOwned():void{
  if(process.env.GITHUB_ACTIONS!=='true'||
     process.env.GITHUB_EVENT_NAME!=='pull_request'||
     !/^layoutmanager-ci-p1d-\d+-\d+$/.test(volume)||
     !/^[a-f0-9]{40}$/.test(sourceCommit)||
     !probeSource.endsWith('/src/tests/oci/scene-p1d-probe.mjs')||
     !/^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(origin)){
    throw new Error('P1D_OWNED_CI_REQUIRED');
  }
}
const shared=[
  '--mount', 'type=volume,source='+volume+',target=/data',
  '-e','NODE_ENV=production','-e','G7_GREENFIELD_MODE=true',
  '-e','G7_GREENFIELD_AUTOMATED=true',
  '-e','DATABASE_URL=file:/data/db/cad.sqlite',
  '-e','CAD_STORAGE_PATH=/data/cad','-e','CAD_STORAGE_BACKEND=local',
  '-e','G7_DEPLOY_APP_IMAGE=cad-layout-viewer:local',
  '-e','G7_DEPLOY_MIGRATOR_IMAGE=cad-layout-viewer:local-migrate',
  '-e','G7_RELEASE_SOURCE_COMMIT='+sourceCommit,
  '-e','G7_AUTH_ENABLED=true','-e','G7_CAD_WRITE_CUTOVER_ENABLED=true',
  '-e','G7_RUNTIME_ORIGIN='+origin,'-e','G7_RUNTIME_ALLOW_HTTP=true',
  '-e','SCENE_AUTO_BUILD_ENABLED=true','-e','SCENE_CPU_WORKER_ENABLED=true',
];
const sandbox=[
  '--network','none','--read-only','--user','10001:10001',
  '--cap-drop','ALL','--security-opt','no-new-privileges',
  '--pids-limit','64','--memory','768m','--cpus','1',
  '--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=96m,uid=10001,gid=10001',
];
function dockerRun(args:string[]):string{
  requireOwned();
  const child=spawnSync('docker',['run','--rm',...sandbox,...shared,...args],{
    encoding:'utf8',timeout:90_000,maxBuffer:1024*1024,
  });
  if(child.error)throw child.error;
  expect(child.status,child.stderr).toBe(0);
  return child.stdout;
}
type Tick={kind:'CPU_SCENE_TICK';outcome:'IDLE'|'PUBLISHED'|'FAILED'|'RETRY_WAIT'|'CAS_LOST';jobId?:string;code?:string};
function workerTick():Tick{
  const output=dockerRun(['--entrypoint','node',workerImage,
    '--import','tsx','scripts/scene-cpu-worker.ts','--once']);
  const record=output.split(/\r?\n/).find(line=>line.includes('"kind":"CPU_SCENE_TICK"'));
  expect(record,'P1D_WORKER_NO_SAFE_RECEIPT').toBeDefined();
  return JSON.parse(record!) as Tick;
}
type Probe={action:string;job:{status:string;attempt:number;lastCode:string|null}|null;
  pointer:{assetId:string;revision:number}|null;assets:number;uploaded:number;
  published:number;originalShaValid:boolean};
type CpuLineDto={
  schema:number;
  asset:{objects:unknown[]};
  viewerData:{sourceIndex:{state:string;reason:string}};
  root:{children:Array<{
    type:string;
    geometry:{attributes:{position:{array:number[]}}};
  }>};
};
function probe(versionId:string,action:'inspect'|'tamper'='inspect'):Probe{
  const output=dockerRun([
    '--mount','type=bind,src='+probeSource+',dst=/app/src/scripts/ci-scene-p1d-probe.mjs,readonly',
    '--entrypoint','node',workerImage,'scripts/ci-scene-p1d-probe.mjs',action,versionId,
  ]);
  const data=JSON.parse(output) as Probe;
  expect(data.action).toBe(action);
  return data;
}
type Access={csrfToken:string;actor:{id:string}};
async function grant(admin:APIRequestContext,headers:Record<string,string>,userId:string,
  kind:'site'|'role',value:string,operation:'grant'|'revoke'='grant'){
  const result=await admin.post('/api/g7-runtime/access/grant',{
    headers,data:{kind,operation,affectedUserId:userId,value},
  });
  expect(result.status(),await result.text()).toBe(200);
}
async function signIn(page:Page,login:string,password:string){
  await page.goto('/g7-runtime');
  await expect(page.getByRole('heading',{name:'로그인',exact:true})).toBeVisible();
  await page.getByLabel('계정',{exact:true}).fill(login);
  await page.getByLabel('비밀번호',{exact:true}).fill(password);
  // Observe only the response status; never log credentials, cookies or CSRF.
  const loginResponse=page.waitForResponse(response=>
    response.request().method()==='POST'&&
    new URL(response.url()).pathname==='/api/g7-runtime/auth/login');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  expect((await loginResponse).status(),'P1D_LOGIN_HTTP_STATUS').toBe(200);
  const signedSession=await page.request.get('/api/g7-runtime/auth/session');
  expect(signedSession.status(),'P1D_LOGIN_SESSION_HTTP_STATUS').toBe(200);
  await expect(page.getByRole('heading',{name:'현재 세션'})).toBeVisible();
}
type Keys={bu:string;product:string;site:string;building:string;floor:string};
async function masters(admin:APIRequestContext,headers:Record<string,string>,actorId:string):Promise<Keys>{
  const created:Record<string,string>={};
  let parentId:string|undefined;
  for(const type of ['business-units','products','sites','buildings','floors']){
    const response=await admin.post('/api/masters',{
      headers,data:{type,name:'P1D '+type,...(parentId?{parentId}:{}),
        ...(type==='sites'?{kind:'SITE'}:{})},
    });
    expect(response.status(),await response.text()).toBe(201);
    parentId=(await response.json() as {id:string}).id;
    created[type]=parentId;
    if(type==='sites')await grant(admin,headers,actorId,'site',parentId);
  }
  return {bu:created['business-units'],product:created.products,
    site:created.sites,building:created.buildings,floor:created.floors};
}
async function upload(api:APIRequestContext,headers:Record<string,string>,keys:Keys,
  name:string,bytes:Buffer){
  const response=await api.post('/api/cad-files',{headers,multipart:{
    file:{name:name+'.dxf',mimeType:'application/octet-stream',buffer:bytes},
    businessUnitId:keys.bu,productId:keys.product,siteId:keys.site,
    buildingId:keys.building,floorId:keys.floor,
    registeredAt:'2026-11-05',deletePassword:'p1d-delete',makeCurrent:'true',
  }});
  expect(response.status(),await response.text()).toBe(201);
  return await response.json() as {id:string;locationId:string;sceneBuild?:{jobId:string;status:string}};
}
async function state(api:APIRequestContext,id:string):Promise<string>{
  const response=await api.get('/api/scene-build-jobs?versionId='+encodeURIComponent(id));
  expect(response.status(),await response.text()).toBe(200);
  const payload=await response.json() as {rows:Record<string,{state:string}>};
  expect(payload.rows[id]).toBeTruthy();
  return payload.rows[id].state;
}

test('#225 P1-D G7 Editor HTTP upload -> detached OCI Worker -> new authenticated Viewer session',async({page,browser,request})=>{
  test.setTimeout(240_000);
  requireOwned();
  const gate=await request.get('/api/g7-runtime/status');
  expect(gate.status()).toBe(200);
  expect(await gate.json()).toMatchObject({state:'ACTIVE',authEnabled:true,cadWriteEnabled:true});
  const setupCode=process.env.G7_P1D_SETUP_CODE;
  expect(setupCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
  // Actual fresh app UI and first-admin code from this exact disposable volume.
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'신규 설치 · 최초 관리자 설정'})).toBeVisible();
  await page.getByLabel('Docker 호스트 최초 설정 코드').fill(setupCode!);
  await page.getByLabel('최초 관리자 계정').fill('admin');
  await page.getByLabel('초기 비밀번호').fill('p1d-admin-initial-secret');
  await page.getByRole('button',{name:'최초 관리자 등록'}).click();
  await expect(page.getByText('최초 관리자가 등록되었습니다.')).toBeVisible();
  await page.getByRole('link',{name:'초기 비밀번호 변경 및 로그인'}).click();
  await page.getByRole('button',{name:'초기 비밀번호 변경'}).click();
  await page.getByLabel('계정',{exact:true}).fill('admin');
  await page.getByLabel('초기 비밀번호',{exact:true}).fill('p1d-admin-initial-secret');
  await page.getByLabel('새 비밀번호',{exact:true}).fill(adminPassword);
  await page.getByRole('button',{name:'비밀번호 변경'}).click();
  // Do not navigate away while initial-change POST is still in flight.
  await expect(page.getByText('비밀번호를 변경했습니다. 새 비밀번호로 로그인하세요.')).toBeVisible();
  await expect(page.getByRole('heading',{name:'로그인',exact:true})).toBeVisible();
  await signIn(page,'admin',adminPassword);

  const adminSession=await (await page.request.get('/api/g7-runtime/auth/session')).json() as Access;
  const adminHeaders={origin,'x-csrf-token':adminSession.csrfToken};
  const keys=await masters(page.request,adminHeaders,adminSession.actor.id);
  const created=await page.request.post('/api/g7-runtime/users/create',{
    headers:adminHeaders,data:{login:'p1d-editor',initialPassword:'p1d-editor-initial-secret'},
  });
  expect(created.status(),await created.text()).toBe(201);
  const editorId=(await created.json() as {id:string}).id;
  await grant(page.request,adminHeaders,editorId,'role','Editor');
  await grant(page.request,adminHeaders,editorId,'site',keys.site);
  const initial=await request.post('/api/g7-runtime/auth/initial-change',{
    headers:{origin},data:{login:'p1d-editor',
      password:'p1d-editor-initial-secret',newPassword:editorPassword},
  });
  expect(initial.status(),await initial.text()).toBe(200);

  const editorContext=await browser.newContext({baseURL:origin});
  let consumer:BrowserContext|null=null;
  try{
    const editor=await editorContext.newPage();
    await signIn(editor,'p1d-editor',editorPassword);
    const editorSession=await (await editor.request.get('/api/g7-runtime/auth/session')).json() as Access;
    expect(editorSession.actor.id).toBe(editorId);
    const headers={origin,'x-csrf-token':editorSession.csrfToken};
    console.info('P1D_PHASE:AUTH_READY');

    // Real HTTP origin and CSRF failures must reject before receiving a file.
    for(const denied of [
      {origin:'http://attacker.invalid','x-csrf-token':editorSession.csrfToken},
      {origin,'x-csrf-token':'forged'},
    ]){
      const response=await editor.request.post('/api/cad-files',{headers:denied,multipart:{
        file:{name:'denied.dxf',mimeType:'application/octet-stream',buffer:dx},
        businessUnitId:keys.bu,productId:keys.product,siteId:keys.site,
        buildingId:keys.building,floorId:keys.floor,
        registeredAt:'2026-11-05',deletePassword:'p1d-delete',makeCurrent:'true',
      }});
      expect(response.status()).toBe(403);
    }
    const good=await upload(editor.request,headers,keys,'p1d-line',dx);
    expect(good.sceneBuild).toMatchObject({status:'QUEUED'});
    expect(await state(editor.request,good.id)).toBe('QUEUED');
    const pre=probe(good.id);
    expect(pre).toMatchObject({job:{status:'QUEUED',attempt:0},pointer:null,assets:0,originalShaValid:true});
    expect(pre.uploaded).toBe(1);
    console.info('P1D_PHASE:HTTP_UPLOAD_QUEUED');
    const worker=workerTick();
    expect(worker).toMatchObject({outcome:'PUBLISHED',jobId:good.sceneBuild!.jobId});
    expect(await state(editor.request,good.id)).toBe('READY');
    const published=probe(good.id);
    expect(published).toMatchObject({job:{status:'READY',attempt:1},
      assets:1,originalShaValid:true,published:1});
    expect(published.pointer?.revision).toBe(0);
    const ready=await editor.request.get('/api/cad-files/'+good.id+'/scene');
    expect(ready.status()).toBe(200);
    const status=await ready.json() as {status:string;assetId:string;contentUrl:string;
      manifest:{scope:{versionId:string;sourceSha256:string;builder:string};sha256:string}};
    expect(status.status).toBe('READY');
    expect(status.assetId).toBe(published.pointer?.assetId);
    expect(status.manifest.scope.versionId).toBe(good.id);
    expect(status.manifest.scope.sourceSha256).toBe(sha(dx));
    expect(status.manifest.scope.builder).toContain('node-cpu-line');
    const contentResponse=await editor.request.get(status.contentUrl);
    expect(contentResponse.status()).toBe(200);
    const bytes=await contentResponse.body();
    expect(sha(bytes)).toBe(status.manifest.sha256);
    const dto=JSON.parse(bytes.toString('utf8')) as CpuLineDto;
    expect(dto.schema).toBe(2);
    expect(dto.asset.objects.length).toBeGreaterThan(1);
    // The CPU LINE subset is geometry-complete but lacks a verified
    // original-source selection index. This MUST remain visible to users.
    expect(dto.viewerData.sourceIndex).toEqual({
      state:'UNAVAILABLE',reason:'INDEX_ABSENT',
    });
    // A Scene notice alone is insufficient: require the actual persisted
    // CPU-supported geometry to match the uploaded LINE endpoints.
    expect(dto.root.children).toHaveLength(1);
    expect(dto.root.children[0].type).toBe('Line');
    expect(dto.root.children[0].geometry.attributes.position.array)
      .toEqual([0,0,0,15,20,0]);
    console.info('P1D_PHASE:OCI_READY_VERIFIED');

    // A distinct real signed Editor login: persisted CPU DTO must render without
    // any original DXF network fetch or original parser execution.
    consumer=await browser.newContext({baseURL:origin,viewport:{width:1440,height:960}});
    const fresh=await consumer.newPage();
    let originalGets=0,sceneGets=0;
    const original='/api/cad-files/'+good.id+'/content';
    fresh.on('request',req=>{
      const u=new URL(req.url()).pathname;
      if(u===original)originalGets++;
      if(u.includes('/cad-files/'+good.id+'/scene'))sceneGets++;
    });
    await fresh.route('**'+original,route=>route.abort());
    await signIn(fresh,'p1d-editor',editorPassword);
    const sourceCookie=(await editorContext.cookies()).find(x=>x.name==='cad_session')?.value;
    const freshCookie=(await consumer.cookies()).find(x=>x.name==='cad_session')?.value;
    expect(freshCookie).toBeTruthy();
    expect(freshCookie).not.toBe(sourceCookie);
    await fresh.goto('/cad/versions/'+good.id+'/viewer?renderer=three-dxf-viewer');
    await expect(fresh.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
    // P1-D CPU LINE validates/paints the complete supported LINE geometry but
    // deliberately has no canonical DXF source/handle index. The viewer must
    // preserve this visible precision warning, not claim full source mapping.
    // #626: "도면 일부 표시 완료" is the correct UI result for this subset.
    await expect(fresh.getByTestId('cad-viewer-shell').getByRole('status'))
      .toHaveText('도면 일부 표시 완료');
    await expect(fresh.getByTestId('viewer-coverage'))
      .toContainText('원본 정밀 선택 인덱스를 사용할 수 없습니다');
    await expect(fresh.getByTestId('cad-canvas').locator('canvas')).toHaveCount(1);
    await fresh.reload();
    await expect(fresh.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');
    await expect(fresh.getByTestId('cad-viewer-shell').getByRole('status'))
      .toHaveText('도면 일부 표시 완료');
    await expect(fresh.getByTestId('viewer-coverage'))
      .toContainText('원본 정밀 선택 인덱스를 사용할 수 없습니다');
    expect(sceneGets).toBeGreaterThanOrEqual(2);
    expect(originalGets).toBe(0);
    console.info('P1D_PHASE:VIEWER_PARTIAL_PRECISION_WARNING_VERIFIED');

    // Negative: new queued version loses Editor's Site grant after upload.
    const revoked=await upload(editor.request,headers,keys,'p1d-revoke',dx);
    expect(revoked.sceneBuild?.status).toBe('QUEUED');
    await grant(page.request,adminHeaders,editorId,'site',keys.site,'revoke');
    expect(workerTick().code).toBe('SCENE_AUTH_REVOKED');
    expect(probe(revoked.id)).toMatchObject({job:{status:'FAILED',
      lastCode:'SCENE_AUTH_REVOKED'},pointer:null,assets:0,originalShaValid:true});
    // A historical READY pointer/asset remains unchanged after denial.
    expect(probe(good.id).pointer?.assetId).toBe(status.assetId);
    console.info('P1D_PHASE:REVOKED_PUBLISH_DENIED');

    await grant(page.request,adminHeaders,editorId,'site',keys.site,'grant');
    const altered=await upload(editor.request,headers,keys,'p1d-sha',dx);
    expect(altered.sceneBuild?.status).toBe('QUEUED');
    expect(probe(altered.id,'tamper').originalShaValid).toBe(false);
    expect(workerTick().code).toBe('SCENE_SOURCE_DIGEST_MISMATCH');
    expect(probe(altered.id)).toMatchObject({job:{status:'FAILED',
      lastCode:'SCENE_SOURCE_DIGEST_MISMATCH'},pointer:null,assets:0,originalShaValid:false});
    expect(probe(good.id).pointer?.assetId).toBe(status.assetId);
    console.info('P1D_PHASE:SOURCE_SHA_TAMPER_DENIED');

    const invalid=await upload(editor.request,headers,keys,'p1d-unsupported-circle',unsupported);
    expect(invalid.sceneBuild?.status).toBe('QUEUED');
    expect(workerTick().code).toBe('SCENE_CONVERTER_UNAVAILABLE');
    expect(probe(invalid.id)).toMatchObject({job:{status:'FAILED',
      lastCode:'SCENE_CONVERTER_UNAVAILABLE'},pointer:null,assets:0,originalShaValid:true});
    expect(probe(good.id)).toMatchObject({pointer:{assetId:status.assetId},
      assets:1,published:1,originalShaValid:true});
    expect(workerTick().outcome).toBe('IDLE');
    console.info('P1D_PHASE:UNSUPPORTED_ENTITY_DENIED_READY_PRESERVED');

    console.log('P1D_HTTP_OCI_VIEWER_PASS',JSON.stringify({
      scenes:1,denied:3,originalGets,sceneGets,freshSessions:true,
    }));
  }finally{
    await consumer?.close();
    await editorContext.close();
  }
});
