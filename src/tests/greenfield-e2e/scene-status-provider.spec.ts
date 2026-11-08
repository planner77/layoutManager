import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {createServer,type Server} from 'node:http';
import path from 'node:path';

const failed={state:'FAILED',label:'생성 실패',tone:'error',polling:false,
  phase:null,errorCode:'SCENE_STORAGE_FAILED',canRetry:true};
const ready={state:'READY',label:'Scene 완료',tone:'success',polling:false,
  phase:null,errorCode:null,canRetry:false};
type Harness={render:(enabled:boolean,ids:string[])=>void;
  pending:{ids:string[]}[];commits:{scope:string;retry:number;enabledRetry:number;text:string}[];
  reply:(index:number,rows:Record<string,unknown>)=>void};
let server:Server,url:string;
test.beforeAll(async()=>{
  const bundle=await build({entryPoints:[path.resolve('tests/fixtures/scene-status-react-browser.tsx')],
    bundle:true,format:'iife',platform:'browser',write:false,logLevel:'silent'});
  const js=bundle.outputFiles[0].contents;
  server=createServer((req,res)=>{
    if(req.url==='/bundle.js'){
      res.writeHead(200,{'content-type':'text/javascript'});res.end(js);return;
    }
    res.writeHead(200,{'content-type':'text/html'});
    res.end('<!doctype html><html><body><div id="app"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const addr=server.address();if(!addr||typeof addr==='string')throw new Error('NO_PORT');
  url=`http://127.0.0.1:${addr.port}`;
});
test.afterAll(async()=>{await new Promise<void>(resolve=>server?.close(()=>resolve()));});

test('L05 React committed disabled→enabled same IDs never revives old Retry',async({page})=>{
  await page.goto(url);
  await page.evaluate(row=>{const h=(window as unknown as {harness:Harness}).harness;
    h.render(true,['A']);h.reply(0,{A:row});},failed);
  await expect(page.locator('[data-testid="row-A"] button')).toHaveCount(1);
  const observations=await page.evaluate(()=>{
    const h=(window as unknown as {harness:Harness}).harness;
    h.render(false,['A']);h.render(true,['A']);
    return {commits:h.commits.slice(-2),retry:document.querySelectorAll('[data-testid="row-A"] button').length,
      requests:h.pending.length};
  });
  expect(observations.commits).toMatchObject([{scope:'false:A',retry:0,enabledRetry:0},
    {scope:'true:A',retry:0,enabledRetry:0}]);
  expect(observations.commits.every(commit=>!commit.text.includes('생성 실패'))).toBe(true);
  expect(observations.retry).toBe(0);expect(observations.requests).toBe(2);
  await page.evaluate(row=>{const h=(window as unknown as {harness:Harness}).harness;
    h.reply(1,{A:row});},ready);
  await expect(page.locator('[data-testid="row-A"]')).toContainText('Scene 완료');
});

test('L05 React committed A→B→A with B and new A pending never revives old Retry',async({page})=>{
  await page.goto(url);
  await page.evaluate(row=>{const h=(window as unknown as {harness:Harness}).harness;
    h.render(true,['A']);h.reply(0,{A:row});},failed);
  await expect(page.locator('[data-testid="row-A"] button')).toHaveCount(1);
  const observations=await page.evaluate(()=>{
    const h=(window as unknown as {harness:Harness}).harness;
    h.render(true,['B']);h.render(true,['A']);
    return {commits:h.commits.slice(-2),retry:document.querySelectorAll('[data-testid="row-A"] button').length,
      requests:h.pending.map(x=>x.ids)};
  });
  expect(observations.commits).toMatchObject([{scope:'true:B',retry:0,enabledRetry:0},
    {scope:'true:A',retry:0,enabledRetry:0}]);
  expect(observations.commits.every(commit=>!commit.text.includes('생성 실패'))).toBe(true);
  expect(observations.retry).toBe(0);
  expect(observations.requests).toEqual([['A'],['B'],['A']]);
  await page.evaluate(([oldRow,newRow])=>{const h=(window as unknown as {harness:Harness}).harness;
    h.reply(1,{B:oldRow});h.reply(2,{A:newRow});},[failed,ready]);
  await expect(page.locator('[data-testid="row-A"]')).toContainText('Scene 완료');
  await expect(page.locator('[data-testid="row-A"] button')).toHaveCount(0);
});
