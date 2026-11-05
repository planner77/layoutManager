import {expect,test} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {assertRuntimeApp,type RuntimeReceipt} from './identity';

const receipt=JSON.parse(readFileSync(process.env.G7_RR2_RECEIPT!,'utf8')) as {
  kind:string;nonce:string;root:string;restorePort:number;restoreVolume:string;
  restoreAppName:string;restoreProject:string;images:RuntimeReceipt['images'];
};
type OldState={
  kind:string;nonce:string;editorLogin:string;editorPassword:string;
  queuedVersion:string;readyVersion:string;sourceSha:string;
};
const readState=():OldState=>JSON.parse(readFileSync(receipt.root+'/old-http-state.json','utf8')) as OldState;
const origin=process.env.G7_RR2_ORIGIN!;
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
function owned(state:OldState){
  expect(receipt.kind).toBe('RR2_OWNED_NAMESPACE');
  expect(receipt.nonce).toMatch(/^[a-f0-9]{16}$/);
  expect(state.kind).toBe('RR2_OLD_HTTP_STATE');
  expect(state.nonce).toBe(receipt.nonce);
  expect(origin).toBe('http://127.0.0.1:'+receipt.restorePort);
  expect(receipt.restoreVolume).toBe('layoutmanager-rr2-restore-'+receipt.nonce);
  assertRuntimeApp(receipt,'old',receipt.restoreAppName,receipt.restoreProject,
                   receipt.restoreVolume);
}
test('RR2 actual restored 0.60 digest App authenticates and reads historical CAD',async({page})=>{
  const state=readState();owned(state);
  const status=await page.request.get('/api/g7-runtime/status');
  expect(await status.json()).toMatchObject({state:'ACTIVE',authEnabled:true,cadWriteEnabled:true});
  const login=await page.request.post('/api/g7-runtime/auth/login',{headers:{origin},
    data:{login:state.editorLogin,password:state.editorPassword}});
  expect(login.status()).toBe(200);
  const session=await page.request.get('/api/g7-runtime/auth/session');
  expect(session.status()).toBe(200);
  const actor=await session.json() as {actor:{id:string;roles:string[]}};
  expect(actor.actor.id).toMatch(/^[0-9a-f-]{36}$/);
  const listing=await page.request.get('/api/cad-files?current=true');
  expect(listing.status()).toBe(200);
  expect((await listing.json() as {items:Array<{id:string}>}).items.some(x=>x.id===state.queuedVersion)).toBe(true);
  for(const versionId of [state.readyVersion,state.queuedVersion]){
    const original=await page.request.get('/api/cad-files/'+versionId+'/content');
    expect(original.status()).toBe(200);
    expect(sha(await original.body())).toBe(state.sourceSha);
  }
  const ready=await page.request.get('/api/cad-files/'+state.readyVersion+'/scene');
  expect(ready.status()).toBe(200);
  const scene=await ready.json() as {status:string;contentUrl:string;
    manifest:{sha256:string;scope:{versionId:string;sourceSha256:string;builder:string}}};
  expect(scene.status).toBe('READY');
  expect(scene.manifest.scope.versionId).toBe(state.readyVersion);
  expect(scene.manifest.scope.sourceSha256).toBe(state.sourceSha);
  expect(scene.manifest.scope.builder).not.toContain('node-cpu-line');
  const content=await page.request.get(scene.contentUrl);
  expect(content.status()).toBe(200);
  expect(sha(await content.body())).toBe(scene.manifest.sha256);
  console.info('RR2_RESTORED_OLD_DIGEST_HTTP_READBACK_PASS');
});
