import {expect,test,type APIRequestContext,type Page} from '@playwright/test';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GeneratedDocument} from '../../domain/generated-document';
import {buildGeneratedTransfer} from '../../domain/generated-transfer';
import {masterFields} from './master-helper';
import {clickViewerCommand,clickViewerTestCommand} from './viewer-menu-helper';

declare global { interface Window { __exchangeBlobTypes?: string[] } }

// GLTFLoader emits progress events while resolving embedded glTF buffers.
if(!('ProgressEvent' in globalThis))Object.assign(globalThis,{ProgressEvent:class ProgressEvent extends Event{lengthComputable=false;loaded=0;total=0;}});

const drawing=Buffer.from([
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','TABLES','0','TABLE','2','LAYER','70','3',
  ...['A','B','C'].flatMap(name=>['0','LAYER','2',name,'70','0','62','7','6','CONTINUOUS']),
  '0','ENDTAB','0','ENDSEC',
  '0','SECTION','2','ENTITIES',
  '0','LINE','5','A1','8','A','10','0','20','0','11','100','21','0',
  '0','LINE','5','B1','8','B','10','0','20','10','11','100','21','10',
  '0','LINE','5','C1','8','C','10','0','20','20','11','100','21','20',
  '0','ENDSEC','0','EOF','',
].join('\n'));

async function upload(request:APIRequestContext,label:string,unit=4){
  const source=Buffer.from(drawing.toString('utf8').replace('$INSUNITS\n70\n4',`$INSUNITS\n70\n${unit}`));
  const response=await request.post('/api/cad-files',{multipart:{
    file:{name:label+'.dxf',mimeType:'application/octet-stream',buffer:source},
    ...(await masterFields(request,{businessUnit:label,site:'exchange-qa',building:'A',floor:'1'})),
    registeredAt:'2026-11-01',makeCurrent:'true',deletePassword:'1234',
  }});
  expect(response.status()).toBe(201);
  const created=await response.json() as {id:string};
  return {id:created.id,source};
}
async function openViewer(page:Page,id:string){
  await page.goto(`/cad/versions/${id}/viewer?renderer=three-dxf-viewer`);
  await expect(page.getByRole('status')).toHaveText('도면 표시 완료');
}
async function openExchange(page:Page){
  await clickViewerCommand(page,'drawing','GLB/glTF 내보내기');
  const dialog=page.getByTestId('cad-exchange-dialog');await expect(dialog).toBeVisible();
  return dialog;
}
async function acknowledgeAndDownload(page:Page,dialog:ReturnType<Page['getByTestId']>,alreadyReviewed=false){
  if(!alreadyReviewed){
    await expect(dialog.getByTestId('cad-exchange-review')).toBeEnabled();
    await dialog.getByTestId('cad-exchange-review').click();
  }
  await expect(dialog.getByTestId('cad-exchange-preview')).toBeVisible();
  const ack=dialog.getByTestId('cad-exchange-partial-ack');
  if(await ack.count())await ack.check();
  const pending=page.waitForEvent('download');
  await dialog.getByTestId('cad-exchange-download').click();
  return pending;
}
async function loadArtifact(filePath:string,extension:string){
  const bytes=await readFile(filePath),loader=new GLTFLoader();
  const source=extension==='glb'
    ?bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer
    :bytes.toString('utf8');
  return {bytes,gltf:await loader.parseAsync(source,'')};
}
function glbJson(bytes:Buffer):{scenes?:Array<{extras?:{sourceCoverage?:unknown}}>} {
  expect(bytes.subarray(0,4).toString('ascii')).toBe('glTF');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  expect(view.getUint32(4,true)).toBe(2);
  const length=view.getUint32(12,true);return JSON.parse(bytes.subarray(20,20+length).toString('utf8')) as {scenes?:Array<{extras?:{sourceCoverage?:unknown}}>};
}

test('R5a local DXF export includes explicitly selected hidden layer in GLB and embedded glTF',async({page,request})=>{
  test.setTimeout(120_000);
  const version=await upload(request,'R5a-local-'+randomUUID().slice(0,8));
  const requests={content:0,outlines:0};
  page.on('request',req=>{
    const url=new URL(req.url());
    if(url.pathname===`/api/cad-files/${version.id}/content`)requests.content++;
    if(url.pathname===`/api/cad-files/${version.id}/outlines`)requests.outlines++;
  });
  await page.addInitScript(()=>{
    window.__exchangeBlobTypes=[];
    const create=URL.createObjectURL.bind(URL);
    URL.createObjectURL=(value:Blob|MediaSource)=>{
      if(value instanceof Blob&&value.type.startsWith('model/gltf'))window.__exchangeBlobTypes?.push(value.type);
      return create(value);
    };
  });
  await openViewer(page,version.id);
  const layerPanel=page.getByRole('region',{name:'레이어'});
  await expect(layerPanel.getByRole('checkbox',{name:'B'})).toBeChecked();
  await layerPanel.getByRole('checkbox',{name:'B'}).uncheck();
  await layerPanel.getByRole('button',{name:'레이어 패널 접기'}).click();

  const dialog=await openExchange(page);
  await dialog.getByRole('radio',{name:'레이어 선택'}).check();
  for(const name of ['A','C'])await dialog.getByRole('checkbox',{name:new RegExp('^'+name+' ·')}).uncheck();
  await dialog.getByRole('checkbox',{name:/^B ·/}).check();
  await dialog.getByTestId('cad-exchange-review').click();
  await expect(dialog.getByText('지원 산출 개체 1개 · 추가 개체 0개')).toBeVisible();
  const glbDownload=await acknowledgeAndDownload(page,dialog,true);
  const glbPath=await glbDownload.path();expect(glbPath).toBeTruthy();
  const glb=await loadArtifact(glbPath!,'glb');
  expect(glbDownload.suggestedFilename()).toMatch(/\.glb$/);
  const glbMeta=glbJson(glb.bytes);
  const lineNodes:Array<THREE.Line>=[];glb.gltf.scene.traverse(node=>{if(node instanceof THREE.Line)lineNodes.push(node);});
  expect(lineNodes).toHaveLength(1);
  expect(lineNodes[0].userData).toMatchObject({origin:'DXF',renderLayer:'B'});
  const position=lineNodes[0].geometry.getAttribute('position');
  expect(Math.hypot(position.getX(1)-position.getX(0),position.getY(1)-position.getY(0),position.getZ(1)-position.getZ(0))).toBeCloseTo(0.1,6);
  expect(glb.gltf.scene.userData).toMatchObject({selectedUnit:'mm',metresPerUnit:0.001,axisMapping:'(x,y,z)->(x,z,-y)'});
  expect((glb.gltf.scene.userData.originWcs as number[])[0]).toBeCloseTo(50,5);
  expect((glb.gltf.scene.userData.originWcs as number[])[1]).toBeCloseTo(10,5);
  expect(glbMeta.scenes?.[0]?.extras?.sourceCoverage).toBe('unknown');

  await dialog.getByLabel('형식').selectOption('gltf');
  await expect(dialog.getByTestId('cad-exchange-download')).toBeDisabled();
  const gltfDownload=await acknowledgeAndDownload(page,dialog);
  expect(gltfDownload.suggestedFilename()).toMatch(/\.gltf$/);
  const gltfPath=await gltfDownload.path();expect(gltfPath).toBeTruthy();
  const embedded=await loadArtifact(gltfPath!,'gltf');
  const json=JSON.parse(embedded.bytes.toString('utf8')) as {buffers:{uri:string}[];images?:{uri?:string}[]};
  expect(json.buffers.length).toBeGreaterThan(0);expect(json.buffers.every(buffer=>buffer.uri.startsWith('data:'))).toBe(true);
  expect(json.images?.some(image=>image.uri&&!image.uri.startsWith('data:'))??false).toBe(false);
  const gltfLines:Array<THREE.Line>=[];embedded.gltf.scene.traverse(node=>{if(node instanceof THREE.Line)gltfLines.push(node);});
  expect(gltfLines).toHaveLength(1);expect(gltfLines[0].userData.renderLayer).toBe('B');
  expect(await page.evaluate(()=>window.__exchangeBlobTypes)).toEqual(['model/gltf-binary','model/gltf+json']);
  expect(requests.content).toBe(1);expect(requests.outlines).toBe(0);
  await page.keyboard.press('Escape');await expect(page.getByTestId('cad-exchange-dialog')).toHaveCount(0);
  await clickViewerTestCommand(page,'viewer-menu-layers');
  await expect(layerPanel.getByRole('checkbox',{name:'B'})).not.toBeChecked();
});

test('R5a disabling source and generated export requires no outline read and leaves export unavailable',async({page,request})=>{
  const version=await upload(request,'R5a-off-'+randomUUID().slice(0,8));
  const requests={content:0,outlines:0};
  page.on('request',req=>{
    const url=new URL(req.url());
    if(url.pathname===`/api/cad-files/${version.id}/content`)requests.content++;
    if(url.pathname===`/api/cad-files/${version.id}/outlines`)requests.outlines++;
  });
  await openViewer(page,version.id);
  const dialog=await openExchange(page);
  await dialog.getByTestId('cad-exchange-source-enable').uncheck();
  const generated=dialog.getByTestId('cad-exchange-generated-enable');
  if(await generated.isChecked())await generated.uncheck();
  await expect(dialog.getByTestId('cad-exchange-review')).toBeDisabled();
  await expect(dialog.getByTestId('cad-exchange-download')).toBeDisabled();
  await expect(dialog.getByTestId('cad-exchange-preview')).toHaveCount(0);
  expect(requests.content).toBe(1);
  expect(requests.outlines).toBe(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cad-exchange-dialog')).toHaveCount(0);
});

test('R5a unknown INSUNITS needs a manual unit and the compact dialog restores focus across cancel/reopen/Escape',async({page,request})=>{
  const version=await upload(request,'R5a-unit-'+randomUUID().slice(0,8),0);
  await page.setViewportSize({width:320,height:800});
  await openViewer(page,version.id);
  let dialog=await openExchange(page);
  const box=await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x+box!.width).toBeLessThanOrEqual(320);
  await expect(dialog.getByRole('alert')).toContainText('원본 단위가 0·미상·미지원 값');
  await expect(dialog.getByTestId('cad-exchange-review')).toBeDisabled();
  await dialog.getByLabel('원본 단위').selectOption('mm');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByTestId('cad-exchange-review')).toBeEnabled();
  await dialog.getByRole('button',{name:'취소 / 닫기'}).click();
  await expect(page.getByTestId('cad-exchange-dialog')).toHaveCount(0);
  await expect(page.locator('[data-viewer-group="drawing"]')).toBeFocused();
  dialog=await openExchange(page);
  await expect(dialog.getByLabel('원본 단위')).toHaveValue('auto');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cad-exchange-dialog')).toHaveCount(0);
  await expect(page.locator('[data-viewer-group="drawing"]')).toBeFocused();
});

test('R5a Generated selection exports only its effective translated/rotated object without changing selection or history',async({page,request})=>{
  test.setTimeout(120_000);
  const version=await upload(request,'R5a-generated-'+randomUUID().slice(0,8));
  await openViewer(page,version.id);
  const hash=createHash('sha256').update(version.source).digest('hex');
  const doc=new GeneratedDocument({versionId:version.id,sourceSha256:hash});
  const ids=[randomUUID(),randomUUID()];
  for(let i=0;i<ids.length;i++)doc.append({id:ids[i],savedOutlineId:'local-'+(i+1),createdAt:new Date().toISOString(),
    result:{kind:'CONVEX',algorithm:'synthetic-wcs-v1',geometryBasis:'RENDER_WCS_2D',persistable:false,
      geometry:{type:'Polygon',coordinates:[[[i*20,0],[i*20+10,0],[i*20+10,10],[i*20,0]]]},
      sourceEntityIds:[],warnings:[],tolerance:0.02,durationMs:0}});
  await page.getByTestId('generated-import-input').setInputFiles({name:'r5-generated.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(buildGeneratedTransfer(doc,4)))});
  await expect(page.getByTestId('generated-json-message')).toContainText('2개 생성 개체를 복원');
  await clickViewerTestCommand(page,'viewer-menu-tools');
  await page.getByTestId('canvas-mode-generated').click();
  await clickViewerTestCommand(page,'viewer-menu-outline-tree');
  const rows=page.getByTestId('outline-tree-item');await expect(rows).toHaveCount(2);
  await rows.first().click();await expect(page.getByTestId('canvas-selection-count')).toContainText('생성 1개');
  await page.getByTestId('generated-translate-x').fill('3');await page.getByTestId('generated-translate-y').fill('-5');
  await page.getByTestId('generated-translate-apply').click();
  await page.getByTestId('generated-rotate-angle').fill('90');
  await page.getByTestId('generated-rotate-pivot-x').fill('0');await page.getByTestId('generated-rotate-pivot-y').fill('0');
  await page.getByTestId('generated-rotate-apply').click();
  await expect(page.getByTestId('generated-undo')).toContainText('(2)');
  const selectionBefore=await page.getByTestId('canvas-selection-count').innerText();
  const undoBefore=await page.getByTestId('generated-undo').innerText();

  const dialog=await openExchange(page);
  await dialog.getByTestId('cad-exchange-source-enable').uncheck();
  await dialog.getByTestId('cad-exchange-generated-enable').check();
  await dialog.getByRole('radio',{name:'개체 선택'}).check();
  await dialog.getByRole('checkbox',{name:/local-1|외곽선 1/}).check();
  const downloaded=await acknowledgeAndDownload(page,dialog);
  const artifactPath=await downloaded.path();expect(artifactPath).toBeTruthy();
  const artifact=await loadArtifact(artifactPath!,'glb');
  const objects:Array<THREE.Object3D>=[];artifact.gltf.scene.traverse(node=>{if(node.userData.origin==='LOCAL_GENERATED')objects.push(node);});
  expect(objects).toHaveLength(1);
  expect(objects[0].userData.key).toBe('local:'+ids[0]);
  expect(objects[0].userData.name).not.toBeUndefined();
  const mesh=objects[0].children.find(node=>node instanceof THREE.Mesh) as THREE.Mesh|undefined;expect(mesh).toBeDefined();
  const xyz=Array.from(mesh!.geometry.getAttribute('position').array as ArrayLike<number>);
  expect(Math.min(...xyz.filter((_,index)=>index%3===0))).toBeCloseTo(-0.005,5);
  expect(await page.getByTestId('canvas-selection-count').innerText()).toBe(selectionBefore);
  expect(await page.getByTestId('generated-undo').innerText()).toBe(undoBefore);
});
