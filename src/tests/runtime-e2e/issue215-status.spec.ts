import { createRequire } from 'node:module';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const require=createRequire(import.meta.url);
const Sqlite=require('better-sqlite3') as new (filename:string)=>{
  prepare(sql:string):{get(...args:unknown[]):Record<string,unknown>|undefined;run(...args:unknown[]):{changes:number}};
  exec(sql:string):void;close():void;
};

function ownedRuntimeDb() {
  const configured=process.env.G7_RUNTIME_E2E_FIXTURE_DB;
  expect(typeof configured).toBe('string');
  expect(configured).toMatch(/^\/tmp\/cad-g7-runtime-[A-Za-z0-9]+\/fixture\.sqlite$/);
  const filename=String(configured),root=path.dirname(filename);
  expect(realpathSync(root)).toBe(root);
  const rootStat=lstatSync(root),fileStat=lstatSync(filename);
  expect(rootStat.isDirectory()&&!rootStat.isSymbolicLink()).toBe(true);
  expect(rootStat.uid).toBe(process.getuid?.());
  expect(rootStat.mode&0o077).toBe(0);
  expect(fileStat.isFile()&&!fileStat.isSymbolicLink()).toBe(true);
  expect(fileStat.uid).toBe(process.getuid?.());
  expect(fileStat.mode&0o077).toBe(0);
  return new Sqlite(filename);
}

async function login(page:Page,loginName:string,password:string) {
  await page.goto('/g7-runtime');
  await page.getByLabel('계정',{exact:true}).fill(loginName);
  await page.getByLabel('비밀번호',{exact:true}).fill(password);
  await page.getByRole('button',{name:'로그인',exact:true}).click();
}

test('T215 signed Reader status updates after real session revocation and expiry on focus',async({page,browser},testInfo)=>{
  test.setTimeout(90000);
  const readerLogin='reader-'+randomBytes(5).toString('hex');
  const initialPassword='Reader-initial-'+randomBytes(8).toString('hex');
  const readerPassword='Reader-status-'+randomBytes(8).toString('hex');
  await login(page,'admin-ui','Runtime-admin-153!');
  await expect(page.getByTestId('app-session-status')).toContainText('로그인됨 · Admin');
  const adminSession=await (await page.request.get('/api/g7-runtime/auth/session')).json();
  const origin=String(testInfo.project.use.baseURL);
  const adminHeaders={origin,'x-csrf-token':adminSession.csrfToken};
  const created=await page.request.post('/api/g7-runtime/users/create',{
    headers:adminHeaders,data:{login:readerLogin,initialPassword},
  });
  expect(created.status()).toBe(201);const {id:readerId}=await created.json() as {id:string};
  for(const [kind,value] of [['role','Reader'],['site','15300000-0000-4000-8000-000000000003']]){
    const grant=await page.request.post('/api/g7-runtime/access/grant',{
      headers:adminHeaders,data:{kind,operation:'grant',affectedUserId:readerId,value},
    });
    expect(grant.status()).toBe(200);
  }
  const listed=await page.request.get('/api/g7-runtime/users/list');
  expect(listed.status()).toBe(200);
  expect(((await listed.json()).users as Array<{id:string;login:string}>).some(user=>user.id===readerId&&user.login===readerLogin)).toBe(true);
  const expiredToken=randomBytes(32).toString('base64url'),expiredIssuedAt=Date.now()-9*60*60*1000;
  const readerContext=await browser.newContext({baseURL:origin});
  try {
    const reader=await readerContext.newPage();
    await reader.goto('/g7-runtime');
    await reader.getByRole('button',{name:'초기 비밀번호 변경',exact:true}).click();
    await reader.getByLabel('계정',{exact:true}).fill(readerLogin);
    await reader.getByLabel('초기 비밀번호',{exact:true}).fill(initialPassword);
    await reader.getByLabel('새 비밀번호',{exact:true}).fill(readerPassword);
    const passwordChanged=reader.waitForResponse(response=>response.url().endsWith('/api/g7-runtime/auth/initial-change'));
    await reader.getByRole('button',{name:'비밀번호 변경',exact:true}).click();
    expect((await passwordChanged).status()).toBe(200);
    await expect(reader.getByRole('heading',{name:'로그인',exact:true})).toBeVisible();
    const seedDb=ownedRuntimeDb();
    try {
      const account=seedDb.prepare('SELECT id,login_name,status,must_change_password FROM "User" WHERE id=?').get(readerId);
      expect(account).toMatchObject({id:readerId,login_name:readerLogin,status:'ACTIVE',must_change_password:0});
      // Seed expiry after the Reader is eligible, but before session issuance,
      // preserving the immutable issue-time ordering trigger.
      seedDb.prepare('INSERT INTO "AuthSession"(id,user_id,token_hash,issued_at,last_seen_at,expires_at,revoked_at) VALUES(?,?,?,?,?,?,NULL)')
        .run(randomUUID(),readerId,createHash('sha256').update(expiredToken,'utf8').digest('hex'),
          expiredIssuedAt,expiredIssuedAt,expiredIssuedAt+8*60*60*1000);
    } finally { seedDb.close(); }
    await login(reader,readerLogin,readerPassword);
    await expect(reader.getByTestId('app-session-status')).toContainText('로그인됨 · Reader');

    const expiryDb=ownedRuntimeDb();
    try {
      const expired=expiryDb.prepare('SELECT issued_at,expires_at,revoked_at FROM "AuthSession" WHERE token_hash=?')
        .get(createHash('sha256').update(expiredToken,'utf8').digest('hex'));
      expect(expired).toBeDefined();expect(Number(expired!.expires_at)).toBeLessThan(Date.now());
      expect(expired!.revoked_at).toBeNull();
      await readerContext.addCookies([{name:'cad_session',value:expiredToken,url:origin,httpOnly:true,sameSite:'Strict'}]);
    } finally { expiryDb.close(); }
    await reader.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(reader.getByTestId('app-session-status')).toContainText('로그인 필요');

    await login(reader,readerLogin,readerPassword);
    await expect(reader.getByTestId('app-session-status')).toContainText('로그인됨 · Reader');

    const revoked=await page.request.post('/api/g7-runtime/users/revoke',{
      headers:adminHeaders,data:{userId:readerId},
    });
    expect(revoked.status()).toBe(200);
    await reader.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(reader.getByTestId('app-session-status')).toContainText('로그인 필요');
  } finally { await readerContext.close(); }
});
