import {expect,test,type APIRequestContext,type Page} from '@playwright/test';
import {createHash,randomUUID} from 'node:crypto';
import {GeneratedDocument} from '../../domain/generated-document';
import {buildGeneratedTransfer} from '../../domain/generated-transfer';
import {masterFields} from './master-helper';
import {clickViewerTestCommand,clickViewerCommand} from './viewer-menu-helper';

const dxf=Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES',
  '0','LWPOLYLINE','5','BOX','8','BOUNDS','90','4','70','1',
  '10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
  '0','LINE','5','A1','8','FIRST','10','0','20','0','11','100','21','0',
  '0','LINE','5','A2','8','SECOND','10','0.6','20','0','11','100','21','10',
  '0','ENDSEC','0','EOF','',
].join('\n'));
async function drawing(api:APIRequestContext,tag:string){
  const response=await api.post('/api/cad-files',{multipart:{
    file:{name:tag+'.dxf',mimeType:'application/octet-stream',buffer:dxf},
    ...(await masterFields(api,{businessUnit:tag,site:'memo-r4',building:'A',floor:'1'})),
    registeredAt:'2026-11-01',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(response.status()).toBe(201);return (await response.json()) as {id:string};
}
async function ready(page:Page,id:string){
  await page.goto('/cad/versions/'+id+'/viewer');
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
}
async function stage(page:Page,x:string,y:string,title:string){
  await clickViewerTestCommand(page,'viewer-menu-memo-add');
  await page.getByTestId('cad-memo-title').fill(title);
  await page.getByTestId('cad-memo-x').fill(x);await page.getByTestId('cad-memo-y').fill(y);
  await page.getByTestId('cad-memo-coordinate-place').click();
}
async function options(page:Page){
  return page.getByTestId('cad-memo-snap-select').locator('option').evaluateAll(nodes=>nodes.slice(1).map(node=>{
    const option=node as HTMLOptionElement;
    const key=JSON.parse(option.value) as [string,string,string,number];
    return {value:option.value,origin:key[0],id:key[1],kind:key[2],label:option.textContent??''};
  }));
}
async function pinX(page:Page,title:string){
  return Number(await page.getByRole('button',{name:'메모: '+title,exact:true}).getAttribute('data-memo-wcs-x'));
}

test('R4 explicit non-nearest/OFF choices, stale camera, keyboard and 320px touch',async({page,request,browser,baseURL},testInfo)=>{
  test.setTimeout(90_000);const version=await drawing(request,'r4-explicit');await ready(page,version.id);
  await stage(page,'0.1','0','R4 manual');
  const choices=await options(page),other=choices.find(choice=>choice.label.includes('0.6000000'));
  expect(other).toBeTruthy();
  const select=page.getByTestId('cad-memo-snap-select');await select.selectOption(other!.value);
  expect(Number(await page.getByTestId('cad-memo-x').inputValue())).toBeCloseTo(0.6,5);
  await page.getByTestId('cad-memo-create').click();
  expect(await pinX(page,'R4 manual')).toBeCloseTo(0.6,5);
  await expect(page.getByTestId('cad-memo-session-snap')).toContainText('세션 스냅 연결');
  await expect(page.getByTestId('cad-memo-move-behavior')).toHaveValue('KEEP');
  await page.getByTestId('cad-memo-cancel').click();
  await stage(page,'0.1','0','R4 free');await select.selectOption('');
  await expect(page.getByTestId('cad-memo-x')).toHaveValue('0.1');
  await page.getByTestId('cad-memo-create').click();expect(await pinX(page,'R4 free')).toBeCloseTo(0.1,8);
  await expect(page.getByTestId('cad-memo-session-snap')).toHaveCount(0);
  await page.getByTestId('cad-memo-cancel').click();
  await stage(page,'0.1','0','R4 stale');
  await clickViewerCommand(page,'view','확대');
  await page.getByTestId('cad-memo-create').click();
  await expect(page.getByTestId('cad-memo-error')).toContainText('다시 조회');
  await expect(page.getByTestId('cad-memo-status')).toContainText('2/100');
  await clickViewerCommand(page,'view','화면 맞춤');
  await page.getByTestId('cad-memo-snap-refresh').click();
  await select.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  await page.getByTestId('cad-memo-create').click();await expect(page.getByTestId('cad-memo-pin')).toHaveCount(3);

  const touch=await browser.newContext({baseURL,viewport:{width:320,height:800},hasTouch:true,isMobile:true});
  try{
    const mobile=await touch.newPage();await ready(mobile,version.id);await stage(mobile,'0.1','0','R4 touch');
    const mobileSelect=mobile.getByTestId('cad-memo-snap-select');
    await mobileSelect.selectOption('');
    await mobile.getByTestId('cad-memo-create').scrollIntoViewIfNeeded();
    const box=(await mobile.getByTestId('cad-memo-create').boundingBox())!;
    await mobile.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
    await expect(mobile.getByTestId('cad-memo-status')).toContainText('1/100');
    await expect(mobile.getByRole('button',{name:'메모: R4 touch',exact:true})).toHaveCSS('width','44px');
    expect(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await mobile.screenshot({path:testInfo.outputPath('r4-memo-320.png')});
  }finally{await touch.close();}
});

test('R4 Generated binding KEEP and DETACH apply WCS fields and actual pin drag',async({page,request})=>{
  test.setTimeout(90_000);const version=await drawing(request,'r4-generated');await ready(page,version.id);
  const scope={versionId:version.id,sourceSha256:createHash('sha256').update(dxf).digest('hex')};
  const doc=new GeneratedDocument(scope),ids=[randomUUID(),randomUUID()];
  for(const [index,id] of ids.entries()){
    const x=index*20;
    doc.append({id,savedOutlineId:'local-'+(index+1),createdAt:new Date().toISOString(),result:{
      kind:'CONVEX',algorithm:'synthetic-wcs-v1',geometryBasis:'RENDER_WCS_2D',persistable:false,
      geometry:{type:'Polygon',coordinates:[[[x,0],[x+10,0],[x+10,10],[x,0]]]},
      sourceEntityIds:[],warnings:[],tolerance:0.02,durationMs:0}});
  }
  await page.getByTestId('generated-import-input').setInputFiles({name:'r4-generated.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(buildGeneratedTransfer(doc,4)))});
  await expect(page.getByTestId('generated-json-message')).toContainText('2개 생성 개체를 복원');
  await stage(page,'0.1','0','R4 attached');
  const generated=(await options(page)).find(choice=>choice.origin==='GENERATED'&&choice.id===ids[0]);
  expect(generated).toBeTruthy();await page.getByTestId('cad-memo-snap-select').selectOption(generated!.value);
  await page.getByTestId('cad-memo-create').click();
  await page.getByTestId('cad-memo-x').fill('3');await page.getByTestId('cad-memo-y').fill('4');
  await page.getByTestId('cad-memo-apply-position').click();
  expect(await pinX(page,'R4 attached')).toBeCloseTo(3,8);
  await expect(page.getByTestId('cad-memo-session-snap')).toContainText('세션 스냅 연결');
  await page.getByTestId('cad-memo-cancel').click();
  await page.getByTestId('viewer-tools-dock').getByRole('button',{name:'도구 닫기',exact:true}).click();
  const pin=page.getByRole('button',{name:'메모: R4 attached',exact:true});
  await pin.hover();
  const before=(await pin.boundingBox())!;
  await page.mouse.move(before.x+before.width/2,before.y+before.height/2);await page.mouse.down();
  await page.mouse.move(before.x+before.width/2+30,before.y+before.height/2-20,{steps:6});
  await expect(pin).toHaveAttribute('data-memo-preview','true');await page.mouse.up();
  await expect.poll(()=>pinX(page,'R4 attached')).not.toBe(3);
  await clickViewerTestCommand(page,'viewer-menu-tools');
  await expect(page.getByTestId('cad-memo-session-snap')).toContainText('세션 스냅 연결');
  await page.getByTestId('cad-memo-move-behavior').selectOption('DETACH');
  await page.getByTestId('cad-memo-x').fill('0.1');await page.getByTestId('cad-memo-y').fill('0');
  await page.getByTestId('cad-memo-apply-position').click();
  await expect(page.getByTestId('cad-memo-session-snap')).toHaveCount(0);
  expect(await pinX(page,'R4 attached')).toBeCloseTo(0.1,8);
});
