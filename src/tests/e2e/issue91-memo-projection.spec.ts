import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {GeneratedDocument} from '../../domain/generated-document';
import {buildGeneratedTransfer} from '../../domain/generated-transfer';
import {masterFields} from './master-helper';
import {clickViewerCommand,clickViewerTestCommand} from './viewer-menu-helper';

declare global {interface Window {__memoProjectionHold?:{enabled:boolean;pending:Array<()=>void>;release:()=>void}}}
const source=Buffer.from(['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES',
  '0','LWPOLYLINE','5','BOX','8','BOUNDS','90','4','70','1','10','0','20','0','10','100','20','0','10','100','20','100','10','0','20','100',
  '0','ENDSEC','0','EOF',''].join('\n'));
async function setup(page:Page,request:APIRequestContext){
  const tag='memo-projection-'+randomUUID().slice(0,8);
  const response=await request.post('/api/cad-files',{multipart:{file:{name:tag+'.dxf',mimeType:'application/octet-stream',buffer:source},
    ...(await masterFields(request,{businessUnit:tag,site:'memo-projection',building:'A',floor:'1'})),registeredAt:'2026-11-01',makeCurrent:'true',deletePassword:'1234'}});
  expect(response.status()).toBe(201);const version=await response.json() as {id:string};
  await page.goto(`/cad/versions/${version.id}/viewer?renderer=three-dxf-viewer`);await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
  const id=randomUUID(),doc=new GeneratedDocument({versionId:version.id,sourceSha256:createHash('sha256').update(source).digest('hex')});
  doc.append({id,savedOutlineId:'local-1',createdAt:new Date().toISOString(),result:{kind:'CONVEX',algorithm:'synthetic-wcs-v1',
    geometryBasis:'RENDER_WCS_2D',persistable:false,geometry:{type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,0]]]},
    sourceEntityIds:[],warnings:[],tolerance:0.02,durationMs:0}});
  await page.getByTestId('generated-import-input').setInputFiles({name:'projection.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(buildGeneratedTransfer(doc,4)))});
  await expect(page.getByTestId('generated-json-message')).toContainText('1개 생성 개체를 복원');
  const title='연결 메모 '+randomUUID().slice(0,8);await clickViewerTestCommand(page,'viewer-menu-memo-add');
  await page.getByTestId('cad-memo-title').fill(title);await page.getByTestId('cad-memo-content').fill('현재 연결 위치를 내보냅니다.');
  await page.getByTestId('cad-memo-x').fill('0.1');await page.getByTestId('cad-memo-y').fill('0');
  await page.getByTestId('cad-memo-coordinate-place').click();
  const choices=await page.getByTestId('cad-memo-snap-select').locator('option').evaluateAll(options=>options.slice(1).map(option=>{
    const value=(option as HTMLOptionElement).value,key=JSON.parse(value) as string[];return {value,origin:key[0],id:key[1]};
  }));
  const target=choices.find(choice=>choice.origin==='GENERATED'&&choice.id===id);expect(target).toBeTruthy();
  await page.getByTestId('cad-memo-snap-select').selectOption(target!.value);await page.getByTestId('cad-memo-create').click();
  await expect(page.getByTestId('cad-memo-session-snap')).toContainText('세션 스냅 연결');await page.getByTestId('cad-memo-cancel').click();
  return {title,id,versionId:version.id};
}
async function world(page:Page,title:string){
  const pin=page.getByRole('button',{name:'메모: '+title,exact:true});
  return {x:Number(await pin.getAttribute('data-memo-wcs-x')),y:Number(await pin.getAttribute('data-memo-wcs-y'))};
}
async function prepare(page:Page,format:'glb'|'gltf'='glb'){
  await clickViewerCommand(page,'drawing','GLB/glTF 내보내기');const dialog=page.getByTestId('cad-exchange-dialog');await expect(dialog).toBeVisible();
  await dialog.getByTestId('cad-exchange-source-enable').uncheck();await dialog.getByTestId('cad-exchange-memos-enable').check();
  await dialog.getByLabel('형식').selectOption(format);await dialog.getByTestId('cad-exchange-review').click();
  await expect(dialog.getByTestId('cad-exchange-preview')).toBeVisible();return dialog;
}
async function exported(page:Page,title:string,point:{x:number;y:number},mode:'SESSION'|'BROKEN',format:'glb'|'gltf'){
  const dialog=await prepare(page,format),ack=dialog.getByTestId('cad-exchange-partial-ack');
  if(mode==='BROKEN'){await expect(ack).toBeVisible();await expect(dialog.getByTestId('cad-exchange-download')).toBeDisabled();await ack.check();}
  else await expect(ack).toHaveCount(0);
  const pending=page.waitForEvent('download');await dialog.getByTestId('cad-exchange-download').click();
  const bytes=await readFile((await (await pending).path())!);
  const json=JSON.parse(format==='glb'?bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'):bytes.toString('utf8')) as {
    nodes:Array<{extras?:{title?:string;anchorWcs?:{x:number;y:number;z:number};anchorMode?:string;broken?:boolean}}>;
  };
  const memo=json.nodes.find(node=>node.extras?.title===title)?.extras;
  expect(memo).toMatchObject({anchorWcs:{...point,z:0},anchorMode:mode,broken:mode==='BROKEN'});
  const text=JSON.stringify(memo);for(const privateKey of ['targetRef','localAnchor','SESSION_ONLY','createdById','updatedById'])expect(text).not.toContain(privateKey);
  await dialog.getByRole('button',{name:'취소 / 닫기'}).click();expect(await world(page,title)).toEqual(point);
}

test('TC-R5B-03: actual session export follows Generated Translate/Rotate/Undo and BROKEN last WCS with exact-ID restoration',async({page,request})=>{
  test.setTimeout(180_000);const f=await setup(page,request),initial=await world(page,f.title);
  await exported(page,f.title,initial,'SESSION','glb');
  if(!await page.getByTestId('viewer-tools-dock').isVisible())await clickViewerTestCommand(page,'viewer-menu-tools');
  await page.getByTestId('canvas-mode-generated').click();
  if(!await page.getByTestId('viewer-outline-tree').isVisible())await clickViewerTestCommand(page,'viewer-menu-outline-tree');
  const row=page.getByTestId('outline-tree-item').first();await row.click();
  await page.getByTestId('generated-translate-x').fill('3');await page.getByTestId('generated-translate-y').fill('4');
  await page.getByTestId('generated-translate-apply').click();
  const moved={x:initial.x+3,y:initial.y+4};await expect.poll(()=>world(page,f.title)).toEqual(moved);
  await exported(page,f.title,moved,'SESSION','gltf');
  await page.getByTestId('generated-rotate-angle').fill('90');await page.getByTestId('generated-rotate-pivot-x').fill('5');await page.getByTestId('generated-rotate-pivot-y').fill('5');
  await page.getByTestId('generated-rotate-apply').click();
  const rotated={x:5-(moved.y-5),y:5+(moved.x-5)};
  await expect.poll(async()=>(await world(page,f.title)).x).toBeCloseTo(rotated.x,6);
  await exported(page,f.title,rotated,'SESSION','glb');
  await page.getByTestId('generated-undo').click();await expect.poll(()=>world(page,f.title)).toEqual(moved);
  await exported(page,f.title,moved,'SESSION','gltf');
  await row.getByTestId('outline-tree-delete').click();await page.getByTestId('generated-delete-dialog').getByTestId('generated-delete-confirm').click();
  await exported(page,f.title,moved,'BROKEN','glb');
  await page.getByTestId('generated-undo').click();await exported(page,f.title,moved,'SESSION','gltf');
});

test('TC-R5B-03: viewport epoch change while Memo encoder is held discards stale output and allows a fresh projection',async({page,request})=>{
  test.setTimeout(120_000);
  await page.addInitScript(()=>{
    const hold={enabled:false,pending:[] as Array<()=>void>,release(){this.enabled=false;for(const finish of this.pending.splice(0))finish();}};
    window.__memoProjectionHold=hold;const read=FileReader.prototype.readAsArrayBuffer;
    FileReader.prototype.readAsArrayBuffer=function(blob){if(hold.enabled){hold.pending.push(()=>read.call(this,blob));return;}return read.call(this,blob);};
  });
  const f=await setup(page,request),initial=await world(page,f.title),dialog=await prepare(page);
  await page.evaluate(()=>{window.__memoProjectionHold!.enabled=true;});let downloads=0;const downloaded=()=>downloads++;page.on('download',downloaded);
  await dialog.getByTestId('cad-exchange-download').click();await expect.poll(()=>page.evaluate(()=>window.__memoProjectionHold!.pending.length)).toBeGreaterThan(0);
  await page.setViewportSize({width:1100,height:840});await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await page.evaluate(()=>window.__memoProjectionHold!.release());
  await expect(dialog.getByRole('alert')).toContainText('변경');await expect(dialog.getByTestId('cad-exchange-download')).toBeDisabled();expect(downloads).toBe(0);
  page.off('download',downloaded);await dialog.getByRole('button',{name:'취소 / 닫기'}).click();
  await exported(page,f.title,initial,'SESSION','glb');
});
