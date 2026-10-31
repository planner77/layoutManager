import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { GeneratedDocument } from '../../domain/generated-document';
import { buildGeneratedTransfer } from '../../domain/generated-transfer';
import path from 'node:path';

type FixtureDatabase={prepare(sql:string):{get(...values:unknown[]):unknown};close():void};
const Database=createRequire(import.meta.url)('better-sqlite3') as new(filename:string,options:{readonly:boolean})=>FixtureDatabase;

async function login(page:Page){
  await page.goto('/g7-runtime');
  await page.getByLabel('계정').fill('admin');
  await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-changed-password');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page.getByRole('heading',{name:'현재 세션'})).toBeVisible();
}
async function logout(api:APIRequestContext,origin:string){
  const response=await api.get('/api/g7-runtime/auth/session');
  if(response.status()!==200)return;
  const session=await response.json();
  expect((await api.post('/api/g7-runtime/auth/logout',{headers:{origin,'x-csrf-token':session.csrfToken}})).status()).toBe(200);
}
async function work(page:Page,id:string){
  await page.getByRole('button',{name:'작업',exact:true}).click();await page.getByTestId(id).click();
}
async function ready(page:Page){await expect(page.getByTestId('scene-status')).toContainText('저장된 Scene Asset 복원');}
async function selectPreview(page:Page,kind:'CONVEX'|'PRECISE'='CONVEX'){
  await work(page,'viewer-menu-layers');await work(page,'viewer-menu-outline-tool');
  await page.getByRole('button',{name:'도구 닫기',exact:true}).click();
  const box=(await page.getByTestId('cad-canvas').locator('canvas').boundingBox())!;
  await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();
  await page.mouse.move(box.x+box.width-10,box.y+box.height-10,{steps:8});await page.mouse.up();
  await work(page,'viewer-menu-tools');
  await page.getByRole('button',{name:kind==='CONVEX'?'볼록 외곽선 미리보기':'정밀 외곽선 미리보기',exact:true}).click();
  await expect(page.getByTestId('outline-preview')).toBeVisible();
}
function fixtureDb(){
  const root=process.env.G7_GREENFIELD_E2E_ROOT;if(!root)throw new Error('missing isolated fixture');
  return new Database(path.join(root,'db','cad.sqlite'),{readonly:true});
}

test('R3 server-first render confirmation, lost response replay, typed groups, Reader and independent restoration',async({page,browser,baseURL})=>{
  test.setTimeout(180_000);
  // The documented LAN HTTP path has getRandomValues but may lack randomUUID.
  await page.addInitScript(()=>Object.defineProperty(crypto,'randomUUID',{configurable:true,value:undefined}));
  await login(page);
  try{
    const session=await (await page.request.get('/api/g7-runtime/auth/session')).json();
    const headers={origin:baseURL!,'x-csrf-token':session.csrfToken};
    const files=await (await page.request.get('/api/cad-files')).json();const versionId=files.items[0].id;
    const initialDb=fixtureDb();let initialCreates:number,initialReceipts:number;
    try{
      initialCreates=(initialDb.prepare("SELECT COUNT(*) AS n FROM CadBusinessAudit WHERE version_id=? AND target_kind='OUTLINE' AND action='CREATE'").get(versionId) as {n:number}).n;
      initialReceipts=(initialDb.prepare('SELECT COUNT(*) AS n FROM CadOutlineCreateReceipt WHERE version_id=?').get(versionId) as {n:number}).n;
    }finally{initialDb.close();}
    const types=[] as {id:string;name:string;revision:number}[];
    for(const name of ['R3 타입 A','R3 타입 B']){
      const response=await page.request.post('/api/outline-types',{headers,data:{name,sortOrder:0}});
      expect(response.status()).toBe(201);types.push((await response.json()).item);
    }
    let originalGets=0;
    page.on('request',request=>{if(new URL(request.url()).pathname===`/api/cad-files/${versionId}/content`)originalGets++;});
    const viewer=`/cad/versions/${versionId}/viewer`;
    await page.goto(viewer);await ready(page);
    const canvas=await page.getByTestId('cad-canvas').locator('canvas').elementHandle();
    await selectPreview(page);
    await expect(page.getByTestId('outline-preview')).toContainText('임시 참조');
    await page.getByLabel('업무 타입 검색',{exact:true}).fill('R3 타입');
    await page.getByRole('button',{name:'타입 검색',exact:true}).click();
    await expect(page.getByTestId('outline-type-select').locator('option')).toHaveCount(3);
    await page.getByTestId('outline-type-select').selectOption(types[0].id);
    await page.getByTestId('outline-instance-name').fill('R3 A 볼록');
    let first=true;const keys:string[]=[];let committedId='';let firstOutcome:number|string=0;
    await page.route(`**/api/cad-files/${versionId}/outlines`,async route=>{
      if(route.request().method()!=='POST'){await route.continue();return;}
      keys.push(route.request().headers()['idempotency-key']);
      if(first){first=false;const actual=await route.fetch();const data=await actual.json();
        firstOutcome=actual.status()===201?201:data.error?.code??actual.status();
        if(actual.status()!==201){await route.fulfill({response:actual});return;}
        committedId=data.id;await route.abort('failed');
      }else await route.continue();
    });
    await page.getByTestId('outline-typed-confirm').click();
    await expect.poll(()=>firstOutcome).toBe(201);
    await expect(page.getByTestId('cad-outline-tools').getByRole('alert').filter({hasText:'저장 응답을 확인하지 못했습니다'})).toBeVisible();
    await expect(page.getByTestId('outline-preview')).toBeVisible();
    const replay=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/cad-files/${versionId}/outlines`&&response.request().method()==='POST');
    await page.getByTestId('outline-typed-confirm').click();expect((await replay).status()).toBe(200);
    await expect(page.getByTestId('outline-preview')).toHaveCount(0);
    expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
    await page.unroute(`**/api/cad-files/${versionId}/outlines`);
    await expect(page.getByTestId('generated-undo')).toHaveText('실행 취소 (0)');
    for(const item of [{type:types[1].id,name:'R3 B 볼록',kind:'볼록 외곽선 미리보기'},
      {type:types[0].id,name:'R3 A 정밀',kind:'정밀 외곽선 미리보기'}]){
      await page.getByRole('button',{name:item.kind,exact:true}).click();await expect(page.getByTestId('outline-preview')).toBeVisible();
      await page.getByTestId('outline-type-select').selectOption(item.type);
      await page.getByTestId('outline-instance-name').fill(item.name);
      await page.getByTestId('outline-typed-confirm').click();await expect(page.getByTestId('outline-preview')).toHaveCount(0);
    }
    await page.getByRole('button',{name:'도구 닫기',exact:true}).click();
    await work(page,'viewer-menu-outline-tree');
    const tree=page.getByTestId('viewer-outline-tree');
    await expect(tree.locator('[data-persistence="server"]')).toHaveCount(3);
    const pageData=await (await page.request.get(`/api/cad-files/${versionId}/outlines`)).json();
    expect(pageData.outlines.map((row:{id:string})=>row.id)).toContain(committedId);
    expect(pageData.outlines.filter((row:{name:string})=>row.name==='R3 A 볼록')).toHaveLength(1);
    const before=JSON.stringify(pageData.outlines);
    await tree.getByRole('button',{name:'R3 A 볼록 숨기기',exact:true}).click();
    await tree.getByRole('button',{name:'서버 외곽선 새로고침',exact:true}).click();
    await expect(tree.getByRole('button',{name:'R3 A 볼록 표시',exact:true})).toBeVisible();
    expect(JSON.stringify((await (await page.request.get(`/api/cad-files/${versionId}/outlines`)).json()).outlines)).toBe(before);
    await tree.getByRole('treeitem',{name:'R3 B 볼록, CONVEX',exact:true}).click();
    await expect(page.locator(`[data-testid="persisted-outline-path"][data-selected="true"]`)).toHaveCount(1);
    const download=page.waitForEvent('download');await tree.getByRole('button',{name:'업무 WCS JSON (1)',exact:true}).click();
    const downloaded=await download;const file=await downloaded.path();expect(file).toBeTruthy();
    const snapshot=JSON.parse(readFileSync(file!,'utf8'));
    expect(snapshot).toMatchObject({format:'cad-generated-objects',schemaVersion:2,exportSource:'SERVER_SNAPSHOT'});
    expect(snapshot.objects[0]).toMatchObject({outlineTypeId:types[1].id,name:'R3 B 볼록'});
    await page.getByRole('button',{name:'도면',exact:true}).click();
    const chooser=page.waitForEvent('filechooser');
    await page.getByTestId('viewer-menu-generated-import').click();await (await chooser).setFiles({
      name:downloaded.suggestedFilename(),mimeType:'application/json',buffer:readFileSync(file!),
    });
    await expect(page.getByTestId('generated-json-message')).toContainText('1개 생성 개체를 복원');
    await expect(tree.locator('[data-persistence="session"]')).toHaveCount(1);
    const reexport=page.waitForEvent('download');await page.getByRole('button',{name:'도면',exact:true}).click();
    await page.getByTestId('viewer-menu-generated-export').click();
    const native=JSON.parse(readFileSync((await (await reexport).path())!,'utf8'));
    expect(native.objects[0].id).not.toBe(snapshot.objects[0].id);
    expect(native.objects[0].id).not.toBe(snapshot.objects[0].serverOutlineId);
    expect(native.objects[0]).not.toHaveProperty('serverOutlineId');
    expect(await canvas!.evaluate(node=>node===document.querySelector('[data-testid="cad-canvas"] canvas'))).toBe(true);
    expect(originalGets).toBe(0);
    const consumer=await browser.newContext({baseURL,viewport:{width:1440,height:1000}});
    try{
      const fresh=await consumer.newPage();await login(fresh);await fresh.goto(viewer);await ready(fresh);
      await work(fresh,'viewer-menu-outline-tree');
      await expect(fresh.getByTestId('viewer-outline-tree').locator('[data-persistence="server"]')).toHaveCount(3);
      await expect(fresh.getByRole('button',{name:'R3 A 볼록 숨기기',exact:true})).toBeVisible();
    }finally{await logout(consumer.request,baseURL!);await consumer.close();}
    const db=fixtureDb();let siteId:string;
    try{
      siteId=(db.prepare('SELECT b.site_id AS id FROM CadFileVersion v JOIN CadLocation l ON l.id=v.location_id JOIN Building b ON b.id=l.building_id WHERE v.id=?').get(versionId) as {id:string}).id;
      expect((db.prepare("SELECT COUNT(*) AS n FROM CadBusinessAudit WHERE version_id=? AND target_kind='OUTLINE' AND action='CREATE'").get(versionId) as {n:number}).n).toBe(initialCreates+3);
      expect((db.prepare('SELECT COUNT(*) AS n FROM CadOutlineCreateReceipt WHERE version_id=?').get(versionId) as {n:number}).n).toBe(initialReceipts+3);
      expect((db.prepare("SELECT COUNT(*) AS n FROM CadBusinessAudit WHERE version_id=? AND target_id=? AND action='CREATE'").get(versionId,committedId) as {n:number}).n).toBe(1);
      expect((db.prepare('SELECT COUNT(*) AS n FROM CadOutlineCreateReceipt WHERE version_id=? AND outline_id=?').get(versionId,committedId) as {n:number}).n).toBe(1);
    }finally{db.close();}
    const users=await (await page.request.get('/api/g7-runtime/users/list')).json();
    const readerId=users.users.find((user:{login:string})=>user.login==='r2reader').id;
    expect((await page.request.post('/api/g7-runtime/access/grant',{headers,data:{kind:'site',operation:'grant',affectedUserId:readerId,value:siteId}})).status()).toBe(200);
    const reader=await browser.newContext({baseURL,viewport:{width:1440,height:1000}});
    try{
      const authenticated=await reader.request.post('/api/g7-runtime/auth/login',{headers:{origin:baseURL!},data:{login:'r2reader',password:'synthetic-reader-changed'}});
      expect(authenticated.status()).toBe(200);const identity=await authenticated.json();
      const catalogue=await reader.request.get(`/api/cad-files/${versionId}/outline-types`);
      expect(catalogue.status()).toBe(200);expect((await catalogue.json()).canCreate).toBe(false);
      expect((await reader.request.post(`/api/cad-files/${versionId}/outlines`,{headers:{origin:baseURL!,'x-csrf-token':identity.csrfToken,'x-role':'Admin','Idempotency-Key':keys[0]},
        data:{mode:'APP_CREATED',sourceSha256:pageData.sourceSha256,expectedSceneRevision:pageData.sceneRevision,
          name:'forged',kind:'CONVEX',outlineTypeId:types[0].id,
          geometry:{type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,0]]]}}})).status()).toBe(403);
      const readonly=await reader.newPage();await readonly.goto(viewer);await ready(readonly);await work(readonly,'viewer-menu-outline-tree');
      await expect(readonly.getByTestId('viewer-outline-tree').locator('[data-persistence="server"]')).toHaveCount(3);
      await expect(readonly.getByTestId('outline-tree-delete').first()).toBeDisabled();
    }finally{await logout(reader.request,baseURL!);await reader.close();}
    await page.setViewportSize({width:320,height:800});
    await expect(page.getByTestId('viewer-outline-tree-dock')).toHaveAttribute('aria-modal','true');
    await tree.locator('[data-persistence="server"]').filter({hasText:'R3 B 볼록'}).focus();
    await page.keyboard.press('Home');await page.keyboard.press('End');
    await page.keyboard.press('Escape');await expect(tree).toHaveCount(0);
    await page.setViewportSize({width:1440,height:1000});await page.reload();await ready(page);
    await work(page,'viewer-menu-outline-tree');
    await expect(page.getByRole('button',{name:'R3 A 볼록 숨기기',exact:true})).toBeVisible();
    await expect(page.getByTestId('viewer-outline-tree').locator('[data-persistence="session"]')).toHaveCount(0);
  }finally{await logout(page.request,baseURL!);}
});

test('R3 canonical Source UI, renamed/inactive references and same-WCS Scene replacement preserve stored overlays',async({page,baseURL})=>{
  test.setTimeout(150_000);await login(page);
  try{
    const session=await (await page.request.get('/api/g7-runtime/auth/session')).json();
    const headers={origin:baseURL!,'x-csrf-token':session.csrfToken};
    const files=await (await page.request.get('/api/cad-files')).json();const versionId=files.items[0].id;
    const viewer=`/cad/versions/${versionId}/viewer`;
    const catalogue=await (await page.request.get('/api/outline-types?q='+encodeURIComponent('R3 타입 A'))).json();
    const type=catalogue.items[0];expect(type).toBeTruthy();
    await page.goto(viewer);await ready(page);
    await page.getByRole('button',{name:'도면',exact:true}).click();
    await page.getByRole('menuitem',{name:'원본 DXF로 Scene 생성/재생성',exact:true}).click();
    await expect(page.getByTestId('scene-status')).toContainText('원본 DXF 변환 완료');
    const layers=page.getByTestId('fullscreen-layer-panel');
    await layers.getByRole('button',{name:'전체 해제',exact:true}).click();
    await layers.getByRole('checkbox',{name:'OUTLINE',exact:true}).check();
    await work(page,'viewer-menu-layers');await work(page,'viewer-menu-outline-tool');
    await expect(page.getByTestId('outline-basis').locator('option[value="source"]')).toBeEnabled();
    await page.getByTestId('outline-basis').selectOption('source');
    await page.getByRole('button',{name:'도구 닫기',exact:true}).click();
    const box=(await page.getByTestId('cad-canvas').locator('canvas').boundingBox())!;
    await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();
    await page.mouse.move(box.x+box.width-10,box.y+box.height-10,{steps:8});await page.mouse.up();
    await work(page,'viewer-menu-tools');
    await page.getByRole('button',{name:'정밀 외곽선 미리보기',exact:true}).click();
    await expect(page.getByTestId('outline-preview')).toContainText('안정적 Handle');
    await page.getByLabel('업무 타입 검색',{exact:true}).fill('R3 타입 A');
    await page.getByRole('button',{name:'타입 검색',exact:true}).click();
    await expect(page.getByTestId('outline-type-select').locator('option')).toHaveCount(2);
    await page.getByTestId('outline-type-select').selectOption(type.id);
    await page.getByTestId('outline-instance-name').fill('R3 원본 정밀');
    const posted=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname===`/api/cad-files/${versionId}/outlines`);
    const received=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===`/api/cad-files/${versionId}/outlines`);
    await page.getByTestId('outline-typed-confirm').click();const request=await posted,response=await received;
    expect(response.status()).toBe(201);const stored=await response.json();
    expect(stored.validationMode).toBe('SOURCE_CANONICAL');expect(stored.sourceRefs).toHaveLength(1);
    const originalGeometry=JSON.stringify(stored.geometry),key=request.headers()['idempotency-key'],body=request.postDataJSON();
    await expect(page.getByTestId('outline-preview')).toHaveCount(0);
    await page.getByRole('button',{name:'도구 닫기',exact:true}).click();await work(page,'viewer-menu-outline-tree');
    const tree=page.getByTestId('viewer-outline-tree');
    await tree.getByRole('button',{name:'R3 원본 정밀 숨기기',exact:true}).click();
    await work(page,'viewer-menu-outline-types');const manager=page.getByTestId('outline-type-manager');
    await manager.getByLabel('이름 검색',{exact:true}).fill('R3 타입 A');
    await manager.getByRole('button',{name:'검색',exact:true}).click();
    await manager.getByRole('button',{name:'R3 타입 A 수정',exact:true}).click();
    await manager.getByLabel('타입 이름 (1~100자)').fill('R3 타입 A 변경');
    await manager.getByRole('button',{name:'변경 저장',exact:true}).click();
    await expect(tree.getByTestId('outline-tree-group').filter({hasText:'R3 타입 A 변경'})).toHaveCount(1);
    await expect(tree.getByRole('button',{name:'R3 원본 정밀 표시',exact:true})).toBeVisible();
    await manager.getByRole('button',{name:'R3 타입 A 변경 비활성화',exact:true}).click();
    await expect(tree.getByTestId('outline-tree-group').filter({hasText:'R3 타입 A 변경 (비활성)'})).toHaveCount(1);
    const replay=await page.request.post(`/api/cad-files/${versionId}/outlines`,{headers:{...headers,'Idempotency-Key':key},data:body});
    expect(replay.status()).toBe(200);expect(await replay.json()).toMatchObject({id:stored.id,replayed:true,outlineType:{active:false}});
    const download=page.waitForEvent('download');await tree.getByRole('button',{name:'원본 기반 JSON (1)',exact:true}).click();
    const payload=JSON.parse(readFileSync((await (await download).path())!,'utf8'));
    expect(payload).toMatchObject({schemaVersion:2,exportSource:'SERVER_SNAPSHOT'});
    expect(payload.outlines[0]).toMatchObject({serverOutlineId:stored.id,outlineTypeName:'R3 타입 A 변경',name:'R3 원본 정밀'});
    await work(page,'viewer-menu-tools');await page.getByRole('button',{name:'도구 닫기',exact:true}).click();
    const scene=await (await page.request.get(`/api/cad-files/${versionId}/scene`)).json();
    const data=await (await page.request.get(scene.contentUrl)).json();data.root.name+=' R3 Scene replacement';
    const bytes=Buffer.from(JSON.stringify(data));
    const changed=await page.request.post(`/api/cad-files/${versionId}/scene`,{headers,data:{
      manifest:{...scene.manifest,byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},
      bytesBase64:bytes.toString('base64'),expectedRevision:scene.revision,
    }});
    expect(changed.status()).toBe(200);const next=await changed.json();expect(next.revision).toBe(scene.revision+1);
    const afterSceneReplay=await page.request.post(`/api/cad-files/${versionId}/outlines`,{headers:{...headers,'Idempotency-Key':key},data:body});
    expect(afterSceneReplay.status()).toBe(200);expect(await afterSceneReplay.json()).toMatchObject({id:stored.id,replayed:true});
    await page.reload();await ready(page);await work(page,'viewer-menu-outline-tree');
    const reloaded=page.getByTestId('viewer-outline-tree');
    await expect(reloaded.locator(`[data-tree-key="server:${stored.id}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="persisted-outline-path"][data-outline-id="${stored.id}"]`)).toHaveCount(1);
    await reloaded.locator(`[data-tree-key="server:${stored.id}"]`).click();
    await expect(page.locator(`[data-testid="persisted-outline-path"][data-outline-id="${stored.id}"]`)).toHaveAttribute('data-selected','true');
    const latest=await (await page.request.get(`/api/cad-files/${versionId}/outlines`)).json();
    expect(latest.sceneRevision).toBe(next.revision);expect(latest.outlines.find((row:{id:string})=>row.id===stored.id).sceneRevision).toBe(stored.sceneRevision);
    await work(page,'viewer-menu-tools');
    const tools=page.getByTestId('cad-stored-outline-tools');
    const row=tools.getByText('R3 원본 정밀 (r0)',{exact:true}).locator('..');
    page.once('dialog',dialog=>dialog.accept('R3 원본 수정'));
    await row.getByRole('button',{name:'이름',exact:true}).click();
    await expect(tools.getByText('R3 원본 수정 (r1)',{exact:true})).toBeVisible();
    const after=await (await page.request.get(`/api/cad-files/${versionId}/outlines`)).json();
    const edited=after.outlines.find((item:{id:string})=>item.id===stored.id);
    expect(edited.sceneRevision).toBe(next.revision);expect(JSON.stringify(edited.geometry)).toBe(originalGeometry);
    page.once('dialog',dialog=>dialog.accept());await work(page,'viewer-menu-reset-source');
    await expect.poll(async()=>JSON.stringify((await (await page.request.get(`/api/cad-files/${versionId}/outlines`)).json()).outlines)).toBe(JSON.stringify(after.outlines));
    await expect(page.locator(`[data-testid="persisted-outline-path"][data-outline-id="${stored.id}"]`)).toHaveCount(1);
  }finally{
    const session=await (await page.request.get('/api/g7-runtime/auth/session')).json();
    const active=await (await page.request.get('/api/outline-types?includeInactive=true&q='+encodeURIComponent('R3 타입 A'))).json();
    const type=active.items[0];if(type&&!type.active)expect((await page.request.patch('/api/outline-types/'+type.id,{
      headers:{origin:baseURL!,'x-csrf-token':session.csrfToken},data:{expectedRevision:type.revision,active:true},
    })).status()).toBe(200);
    await logout(page.request,baseURL!);
  }
});


test('R3 paged catalogue beyond 100, bounded server snapshots and 200 mixed keyboard/mobile tree rows',async({page,baseURL},testInfo)=>{
  test.setTimeout(180_000);await login(page);
  try{
    const session=await (await page.request.get('/api/g7-runtime/auth/session')).json();
    const headers={origin:baseURL!,'x-csrf-token':session.csrfToken};
    const files=await (await page.request.get('/api/cad-files')).json();const versionId=files.items[0].id;
    const seeded:{id:string;name:string}[]=[];
    for(let i=1;i<=101;i++){
      const response=await page.request.post('/api/outline-types',{headers,data:{name:'R3 PAGE '+String(i).padStart(3,'0'),sortOrder:0}});
      expect(response.status()).toBe(201);seeded.push((await response.json()).item);
    }
    await page.goto(`/cad/versions/${versionId}/viewer`);await ready(page);await selectPreview(page);
    const canvas=await page.getByTestId('cad-canvas').locator('canvas').elementHandle();
    await page.getByLabel('업무 타입 검색',{exact:true}).fill('R3 PAGE');
    await page.getByRole('button',{name:'타입 검색',exact:true}).click();
    await expect(page.getByTestId('outline-type-select').locator('option')).toHaveCount(51);
    await page.getByRole('button',{name:'다음 타입',exact:true}).click();
    await expect(page.getByTestId('outline-type-page')).toContainText('51~100 / 101');
    await page.getByRole('button',{name:'다음 타입',exact:true}).click();
    await expect(page.getByTestId('outline-type-page')).toContainText('101~101 / 101');
    await page.getByTestId('outline-type-select').selectOption(seeded[100].id);
    await page.getByTestId('outline-instance-name').fill('R3 101번째 타입');
    await page.getByTestId('outline-typed-confirm').click();await expect(page.getByTestId('outline-preview')).toHaveCount(0);
    const typed=await (await page.request.get(`/api/cad-files/${versionId}/outlines`)).json();
    const type=(await (await page.request.get('/api/outline-types?q='+encodeURIComponent('R3 타입 A'))).json()).items[0];
    for(let i=typed.total;i<100;i++){
      const x=(i%10)*3,y=Math.floor(i/10)*3;
      const response=await page.request.post(`/api/cad-files/${versionId}/outlines`,{headers:{...headers,'Idempotency-Key':randomUUID()},data:{
        mode:'APP_CREATED',sourceSha256:typed.sourceSha256,expectedSceneRevision:typed.sceneRevision,
        name:'R3 Bulk '+i,kind:'CONVEX',outlineTypeId:type.id,
        geometry:{type:'Polygon',coordinates:[[[x,y],[x+1,y],[x+1,y+1],[x,y]]]},
      }});
      expect(response.status()).toBe(201);
    }
    const all=await (await page.request.get(`/api/cad-files/${versionId}/outlines`)).json();
    expect(all.total).toBe(100);const ids:string[]=[];
    for(let offset=0;offset<100;offset+=25){
      const result=await page.request.get(`/api/cad-files/${versionId}/outlines?offset=${offset}&limit=25`);
      expect(result.status()).toBe(200);const data=await result.json();expect(data.total).toBe(100);
      ids.push(...data.outlines.map((row:{id:string})=>row.id));
    }
    expect(new Set(ids).size).toBe(100);expect(ids).toEqual(all.outlines.map((row:{id:string})=>row.id));
    const doc=new GeneratedDocument({versionId,sourceSha256:typed.sourceSha256});
    for(let i=0;i<100;i++){
      const x=(i%10)*2,y=Math.floor(i/10)*2;
      doc.append({id:randomUUID(),savedOutlineId:'local-'+(i+1),createdAt:new Date().toISOString(),
        result:{kind:'CONVEX',algorithm:'synthetic-wcs-v1',geometryBasis:'RENDER_WCS_2D',persistable:false,
          geometry:{type:'Polygon',coordinates:[[[x,y],[x+1,y],[x+1,y+1],[x,y]]]},
          sourceEntityIds:[],warnings:[],tolerance:0.02,durationMs:0}});
    }
    await page.getByRole('button',{name:'도구 닫기',exact:true}).click();
    await page.getByTestId('generated-import-input').setInputFiles({name:'r3-mixed-local.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(buildGeneratedTransfer(doc,4)))});
    await expect(page.getByTestId('generated-json-message')).toContainText('100개 생성 개체를 복원');
    const start=await page.evaluate(()=>performance.now());await work(page,'viewer-menu-outline-tree');
    const tree=page.getByTestId('viewer-outline-tree');
    await expect(tree.getByTestId('outline-tree-item')).toHaveCount(200);
    const elapsed=await page.evaluate(value=>performance.now()-value,start);
    expect(new Set(await tree.getByTestId('outline-tree-item').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-tree-key')))).size).toBe(200);
    const leaves=tree.getByTestId('outline-tree-item');await leaves.first().focus();
    const keyboardStart=await page.evaluate(()=>performance.now());await page.keyboard.press('End');await expect(leaves.last()).toBeFocused();
    const keyboardMs=await page.evaluate(value=>performance.now()-value,keyboardStart);
    await expect(leaves.last()).toBeInViewport();await page.keyboard.press('Home');
    console.log('R3_TREE_200',JSON.stringify({server:100,local:100,openMs:elapsed,endKeyMs:keyboardMs}));
    await page.screenshot({path:testInfo.outputPath('r3-tree-desktop.png')});
    const before=JSON.stringify(all.outlines);
    await tree.getByRole('button',{name:type.name+' 전체 숨기기',exact:true}).click();
    await tree.getByRole('button',{name:'서버 외곽선 새로고침',exact:true}).click();
    await expect(tree.getByRole('button',{name:type.name+' 전체 표시',exact:true})).toBeVisible();
    expect(JSON.stringify((await (await page.request.get(`/api/cad-files/${versionId}/outlines`)).json()).outlines)).toBe(before);
    expect(await canvas!.evaluate(node=>node===document.querySelector('[data-testid="cad-canvas"] canvas'))).toBe(true);
    await page.getByRole('button',{name:'보기',exact:true}).click();
    await page.getByRole('menuitem',{name:'브라우저 전체 화면',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);await page.evaluate(()=>document.exitFullscreen());
    await page.setViewportSize({width:320,height:800});await expect(page.getByTestId('viewer-outline-tree-dock')).toHaveAttribute('aria-modal','true');
    await expect(tree.getByTestId('outline-tree-item')).toHaveCount(200);
    const mobileScroll=await page.evaluate(()=>window.scrollY);
    await leaves.first().focus();await page.keyboard.press('End');await expect(leaves.last()).toBeFocused();
    expect(await leaves.last().evaluate(node=>{
      const viewport=node.closest('[role="tree"]')!.getBoundingClientRect(),row=node.getBoundingClientRect();
      return row.top>=viewport.top-1&&row.bottom<=viewport.bottom+1;
    })).toBe(true);
    expect(await page.evaluate(()=>window.scrollY)).toBe(mobileScroll);
    await page.keyboard.press('Home');await expect(tree.locator('[role="treeitem"][aria-level="1"]').first()).toBeFocused();
    await page.screenshot({path:testInfo.outputPath('r3-tree-320.png')});
  }finally{await logout(page.request,baseURL!);}
});
