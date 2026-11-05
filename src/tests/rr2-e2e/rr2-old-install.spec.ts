import {expect,test,type APIRequestContext,type Page,type Request,type Response} from '@playwright/test';
import {createHash,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {assertRuntimeApp,type RuntimeReceipt} from './identity';

type Receipt={kind:string;nonce:string;root:string;oldPort:number;liveVolume:string;
  appName:string;project:string;images:RuntimeReceipt['images']&
    {old:{app:string;migrator:string};oldSource:string};
  children?:Array<Record<string,string>>};
const receiptPath=process.env.G7_RR2_RECEIPT!;
const origin=process.env.G7_RR2_ORIGIN!;
const receipt=JSON.parse(readFileSync(receiptPath,'utf8')) as Receipt;
const dx=Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES','0','LINE','5','AB','8','0',
  '10','0','20','0','11','15','21','20','0','ENDSEC','0','EOF','',
].join('\n'));
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
function owned():void{
  expect(receipt.kind).toBe('RR2_OWNED_NAMESPACE');
  expect(receipt.nonce).toMatch(/^[a-f0-9]{16}$/);
  expect(receipt.liveVolume).toBe('layoutmanager-rr2-live-'+receipt.nonce);
  expect(receipt.appName).toBe('layoutmanager-rr2-app-'+receipt.nonce);
  expect(origin).toBe('http://127.0.0.1:'+receipt.oldPort);
  assertRuntimeApp(receipt,'old',receipt.appName,receipt.project,receipt.liveVolume);
}
function setupCode():string{
  const volume=spawnSync('docker',['volume','inspect',receipt.liveVolume],{
    encoding:'utf8',timeout:10_000});
  expect(volume.status).toBe(0);
  const row=(JSON.parse(volume.stdout) as Array<{Labels:Record<string,string>}>)[0];
  expect(row.Labels['com.planner77.rr2.nonce']).toBe(receipt.nonce);
  const image=spawnSync('docker',['image','inspect',receipt.images.old.migrator],{
    encoding:'utf8',timeout:10_000});
  expect(image.status).toBe(0);
  const engineImageId=(JSON.parse(image.stdout) as Array<{Id:string}>)[0].Id;
  expect(engineImageId).toMatch(/^sha256:[a-f0-9]{64}$/);
  const name='layoutmanager-rr2-child-'+receipt.nonce+'-'+randomBytes(4).toString('hex');
  const cidFile=receipt.root+'/'+name+'.cid';
  const existing=spawnSync('docker',['container','inspect',name],{encoding:'utf8',timeout:10_000});
  expect(existing.status).toBe(1);
  expect(['','[]']).toContain(existing.stdout.trim());
  expect(existing.stderr.trim()).toBe('Error response from daemon: No such container: '+name);
  const latest=JSON.parse(readFileSync(receiptPath,'utf8')) as Receipt;
  expect(latest.nonce).toBe(receipt.nonce);
  latest.children??=[];
  latest.children.push({name,kind:'first-admin-code-read',volume:receipt.liveVolume,
    image:receipt.images.old.migrator,engineImageId,nonce:receipt.nonce,cidFile});
  writeFileSync(receiptPath,JSON.stringify(latest,null,2)+'\n',{mode:0o600});
  const command=['run','--rm','--network','none','--user','10001:10001',
    '--name',name,'--cidfile',cidFile,
    '--label','com.planner77.purpose=rr2-actual-oci-recovery',
    '--label','com.planner77.rr2.nonce='+receipt.nonce,
    '--mount','type=volume,source='+receipt.liveVolume+',target=/data,readonly',
    '--entrypoint','cat',receipt.images.old.migrator,'/data/db/first-admin.code'];
  const result=spawnSync('docker',command,{encoding:'utf8',timeout:20_000});
  expect(result.status).toBe(0);
  expect(/^[A-Za-z0-9_-]{43}$/.test(result.stdout.trim())).toBe(true);
  return result.stdout.trim();
}
async function signIn(page:Page,login:string,password:string){
  await page.goto('/g7-runtime');
  await expect(page.getByRole('heading',{name:'로그인',exact:true})).toBeVisible();
  await page.getByLabel('계정',{exact:true}).fill(login);
  await page.getByLabel('비밀번호',{exact:true}).fill(password);
  const loginResponse=page.waitForResponse(response=>
    response.request().method()==='POST'&&
    new URL(response.url()).pathname==='/api/g7-runtime/auth/login');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  expect((await loginResponse).status()).toBe(200);
  expect((await page.request.get('/api/g7-runtime/auth/session')).status()).toBe(200);
  await expect(page.getByRole('heading',{name:'현재 세션'})).toBeVisible();
}
async function grant(admin:APIRequestContext,headers:Record<string,string>,
  userId:string,kind:'site'|'role',value:string){
  const response=await admin.post('/api/g7-runtime/access/grant',{headers,
    data:{kind,operation:'grant',affectedUserId:userId,value}});
  expect(response.status()).toBe(200);
}
test('RR2 actual published 0.60 App installs and populates authenticated CAD',async({page,browser,request})=>{
  test.setTimeout(240_000);
  owned();
  const gate=await request.get('/api/g7-runtime/status');
  expect(gate.status()).toBe(200);
  expect(await gate.json()).toMatchObject({state:'ACTIVE',authEnabled:true,cadWriteEnabled:true});
  const code=setupCode();
  const adminInitial='rr2-'+randomBytes(16).toString('hex');
  const adminPassword='rr2-'+randomBytes(16).toString('hex');
  const editorInitial='rr2-'+randomBytes(16).toString('hex');
  const editorPassword='rr2-'+randomBytes(16).toString('hex');
  const setupEvents:Array<Record<string,string|number|boolean|null>>=[];
  const observations:Array<Promise<void>>=[];
  const getTokens:Array<{ordinal:number;token:string}>=[];
  const postTokens:Array<{ordinal:number;token:string}>=[];
  const began=Date.now();
  const setupPath='/api/g7-runtime/setup';
  const observeSetupRequest=(request:Request)=>{
    if(new URL(request.url()).pathname!==setupPath)return;
    const ordinal=setupEvents.length;
    const entry:Record<string,string|number|boolean|null>={direction:'request',
      method:request.method(),atMs:Date.now()-began,headersAvailable:false,
      csrfHeaderPresent:null,setupCookiePresent:null,setupCookieCount:null,
      csrfHeaderEqualsCookie:null,originMatches:null};
    setupEvents.push(entry);
    observations.push((async()=>{
      try{
        const headers=await request.allHeaders();
        const token=headers['x-setup-csrf']??'';
        const cookies=(headers.cookie??'').split(';').map(value=>value.trim())
          .filter(value=>value.startsWith('cad_setup_csrf='));
        const cookie=cookies.length===1?cookies[0].slice('cad_setup_csrf='.length):'';
        entry.headersAvailable=true;
        entry.csrfHeaderPresent=token.length>0;
        entry.setupCookiePresent=cookie.length>0;
        entry.setupCookieCount=cookies.length;
        entry.csrfHeaderEqualsCookie=token.length>0&&cookie.length>0&&token===cookie;
        entry.originMatches=headers.origin===origin;
        if(request.method()==='POST')postTokens.push({ordinal,token});
      }catch{/* Keep request fields unavailable; never infer absence. */}
    })());
  };
  const observeSetupResponse=(response:Response)=>{
    if(new URL(response.url()).pathname!==setupPath)return;
    const method=response.request().method();
    const ordinal=setupEvents.length;
    const entry:Record<string,string|number|boolean|null>={
      direction:'response',method,atMs:Date.now()-began,status:response.status(),
      setupCookieSet:false,safeCode:null,safeState:null};
    setupEvents.push(entry);
    observations.push((async()=>{
      const headers=await response.allHeaders();
      entry.setupCookieSet=(headers['set-cookie']??'').includes('cad_setup_csrf=');
      if(method==='GET'&&response.ok()){
        try{
          const value=await response.json() as {state?:unknown;csrfToken?:unknown};
          if(value?.state==='SETUP_REQUIRED')entry.safeState='SETUP_REQUIRED';
          if(typeof value?.csrfToken==='string')getTokens.push({ordinal,token:value.csrfToken});
        }catch{/* The passive observer cannot change the setup verdict. */}
      }
      if(method==='POST'&&!response.ok()){
        try{
          const value=await response.json() as {error?:{code?:unknown}};
          if(typeof value?.error?.code==='string'&&
             /^[A-Z][A-Z0-9_]{0,63}$/.test(value.error.code))entry.safeCode=value.error.code;
        }catch{/* Keep the response status without reflecting a body. */}
      }
    })());
  };
  page.on('request',observeSetupRequest);
  page.on('response',observeSetupResponse);
  async function setupObservation(){
    page.off('request',observeSetupRequest);
    page.off('response',observeSetupResponse);
    await Promise.allSettled(observations);
    for(const post of postTokens){
      const preceding=getTokens.filter(get=>get.ordinal<post.ordinal)
        .sort((a,b)=>a.ordinal-b.ordinal).at(-1);
      setupEvents[post.ordinal].getCsrfObserved=Boolean(preceding?.token);
      setupEvents[post.ordinal].headerEqualsObservedGetCsrf=Boolean(preceding?.token)&&
        post.token.length>0&&post.token===preceding?.token;
    }
    const panel=page.getByTestId('g7-first-setup');
    const alert=panel.getByRole('alert');
    const alertCount=await alert.count();
    const alertText=alertCount?await alert.first().textContent({timeout:1000}).catch(()=>null):null;
    const safeAlertCode=alertText?.trim().match(/^[A-Z][A-Z0-9_]{0,63}$/)?.[0]??null;
    return {kind:'RX11_FIRST_SETUP_OBSERVATION',nonce:receipt.nonce,
      setupEvents,dom:{panelPresent:await panel.count()>0,alertPresent:alertCount>0,
        safeAlertCode,successPresent:await page.getByText('최초 관리자가 등록되었습니다.').count()>0,
        formPresent:await panel.locator('form').count()>0}};
  }
  try{
    await page.goto('/');
    await expect(page.getByRole('heading',{name:'신규 설치 · 최초 관리자 설정'})).toBeVisible();
    await page.getByLabel('Docker 호스트 최초 설정 코드').fill(code);
    await page.getByLabel('최초 관리자 계정').fill('rr2-admin');
    await page.getByLabel('초기 비밀번호').fill(adminInitial);
    await page.getByRole('button',{name:'최초 관리자 등록'}).click();
    await expect(page.getByText('최초 관리자가 등록되었습니다.')).toBeVisible();
  }catch(error){
    console.info('RX11_FIRST_SETUP_DIAGNOSTIC '+JSON.stringify(await setupObservation()));
    throw error;
  }
  if(process.env.RR2_RX11_FIRST_ADMIN_ONLY==='1'){
    console.info('RX11_FIRST_SETUP_ONLY_PASS '+JSON.stringify(await setupObservation()));
    return;
  }
  await page.getByRole('link',{name:'초기 비밀번호 변경 및 로그인'}).click();
  await page.getByRole('button',{name:'초기 비밀번호 변경'}).click();
  await page.getByLabel('계정',{exact:true}).fill('rr2-admin');
  await page.getByLabel('초기 비밀번호',{exact:true}).fill(adminInitial);
  await page.getByLabel('새 비밀번호',{exact:true}).fill(adminPassword);
  await page.getByRole('button',{name:'비밀번호 변경'}).click();
  await expect(page.getByText('비밀번호를 변경했습니다. 새 비밀번호로 로그인하세요.')).toBeVisible();
  await signIn(page,'rr2-admin',adminPassword);
  const session=await (await page.request.get('/api/g7-runtime/auth/session')).json() as
    {csrfToken:string;actor:{id:string}};
  const headers={origin,'x-csrf-token':session.csrfToken};
  const ids:Record<string,string>={};let parentId:string|undefined;
  for(const type of ['business-units','products','sites','buildings','floors']){
    const response=await page.request.post('/api/masters',{headers,
      data:{type,name:'RR2 '+type,...(parentId?{parentId}:{}),
        ...(type==='sites'?{kind:'SITE'}:{})}});
    expect(response.status()).toBe(201);
    parentId=(await response.json() as {id:string}).id;
    ids[type]=parentId;
    if(type==='sites')await grant(page.request,headers,session.actor.id,'site',parentId);
  }
  const created=await page.request.post('/api/g7-runtime/users/create',{headers,
    data:{login:'rr2-editor',initialPassword:editorInitial}});
  expect(created.status()).toBe(201);
  const editorId=(await created.json() as {id:string}).id;
  await grant(page.request,headers,editorId,'role','Editor');
  await grant(page.request,headers,editorId,'site',ids.sites);
  const initial=await request.post('/api/g7-runtime/auth/initial-change',{
    headers:{origin},data:{login:'rr2-editor',password:editorInitial,
      newPassword:editorPassword}});
  expect(initial.status()).toBe(200);
  const editor=await browser.newContext({baseURL:origin});
  try{
    const page2=await editor.newPage();
    await signIn(page2,'rr2-editor',editorPassword);
    const editorSession=await (await page2.request.get('/api/g7-runtime/auth/session')).json() as
      {csrfToken:string};
    const uploadHeaders={origin,'x-csrf-token':editorSession.csrfToken};
    const versions:string[]=[];
    for(const name of ['ready','queued']){
      const response=await page2.request.post('/api/cad-files',{headers:uploadHeaders,
        multipart:{file:{name:'rr2-'+name+'.dxf',mimeType:'application/octet-stream',buffer:dx},
          businessUnitId:ids['business-units'],productId:ids.products,siteId:ids.sites,
          buildingId:ids.buildings,floorId:ids.floors,registeredAt:'2026-11-05',
          deletePassword:'rr2-synthetic-delete',makeCurrent:'true'}});
      expect(response.status()).toBe(201);
      versions.push((await response.json() as {id:string}).id);
    }
    const original=await page2.request.get('/api/cad-files/'+versions[0]+'/content');
    expect(original.status()).toBe(200);
    expect(sha(await original.body())).toBe(sha(dx));
    const state={kind:'RR2_OLD_HTTP_STATE',nonce:receipt.nonce,origin,
      adminLogin:'rr2-admin',adminPassword,editorLogin:'rr2-editor',editorPassword,
      ids,editorId,readyVersion:versions[0],queuedVersion:versions[1],sourceSha:sha(dx)};
    writeFileSync(receipt.root+'/old-http-state.json',JSON.stringify(state),{mode:0o600,flag:'wx'});
    console.info('RR2_OLD_HTTP_POPULATED_PASS');
  }finally{await editor.close();}
});

test('RR2 published 0.60 App reads Browser READY and queued history',async({page})=>{
  test.setTimeout(120_000);
  owned();
  const state=JSON.parse(readFileSync(receipt.root+'/old-http-state.json','utf8')) as
    {kind:string;nonce:string;editorLogin:string;editorPassword:string;
      readyVersion:string;queuedVersion:string;sourceSha:string};
  expect(state.kind).toBe('RR2_OLD_HTTP_STATE');
  expect(state.nonce).toBe(receipt.nonce);
  await signIn(page,state.editorLogin,state.editorPassword);
  const listing=await page.request.get('/api/cad-files?current=true');
  expect(listing.status()).toBe(200);
  const items=(await listing.json() as {items:Array<{id:string}>}).items;
  expect(items.some(item=>item.id===state.queuedVersion)).toBe(true);
  const ready=await page.request.get('/api/cad-files/'+state.readyVersion+'/scene');
  expect(ready.status()).toBe(200);
  const scene=await ready.json() as {status:string;assetId:string;contentUrl:string;
    manifest:{sha256:string;scope:{builder:string;versionId:string;sourceSha256:string}}};
  expect(scene.status).toBe('READY');
  expect(scene.manifest.scope.versionId).toBe(state.readyVersion);
  expect(scene.manifest.scope.sourceSha256).toBe(state.sourceSha);
  expect(scene.manifest.scope.builder).not.toContain('node-cpu-line');
  const content=await page.request.get(scene.contentUrl);
  expect(content.status()).toBe(200);
  expect(sha(await content.body())).toBe(scene.manifest.sha256);
  const job=await page.request.get('/api/scene-build-jobs?versionId='+state.queuedVersion);
  // The published 0.60 App predates the B3 job-status API. The queued Browser
  // row is verified by the owned SQL snapshot; HTTP 404 is old-release scope.
  expect(job.status()).toBe(404);
  console.info('RR2_OLD_HTTP_READY_READBACK_PASS');
});
