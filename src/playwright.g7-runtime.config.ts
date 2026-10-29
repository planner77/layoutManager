/** #153: disposable signed runtime authority, never an operating deployment. */
import { defineConfig } from '@playwright/test';
import { randomBytes, scryptSync } from 'node:crypto';
import path from 'node:path';
import { makeG7RuntimeFixture } from './tests/helpers/g7-runtime';
const fixture=makeG7RuntimeFixture();
const port=process.env.G7_RUNTIME_E2E_PORT ?? '3319';
const origin='http://127.0.0.1:'+port;
const uiSite='15300000-0000-4000-8000-000000000003';
fixture.writeTrust({...fixture.trust,origin,siteIds:[uiSite]});fixture.writeApproval({origin,siteIds:[uiSite]});
fixture.env.G7_RUNTIME_ALLOW_HTTP='true';
const db=fixture.openDb();
try {
  db.prepare('INSERT INTO "BusinessUnit"(id,name) VALUES(?,?)').run('15300000-0000-4000-8000-000000000001','UI 사업부');
  db.prepare('INSERT INTO "Product"(id,business_unit_id,name) VALUES(?,?,?)').run('15300000-0000-4000-8000-000000000002','15300000-0000-4000-8000-000000000001','UI 제품');
  db.prepare('INSERT INTO "CadSite"(id,product_id,name) VALUES(?,?,?)').run(uiSite,'15300000-0000-4000-8000-000000000002','UI 사업장 '+ '긴사업장'.repeat(10));
  db.prepare('INSERT INTO "Building"(id,site_id,name) VALUES(?,?,?)').run('15300000-0000-4000-8000-000000000004',uiSite,'A동');
  db.prepare('INSERT INTO "CadLocation"(id,building_id,name) VALUES(?,?,?)').run('15300000-0000-4000-8000-000000000005','15300000-0000-4000-8000-000000000004','1층');
  // Synthetic seeded credential uses the same scrypt local-v1 parameters as
  // the service. User creation/password changes below run through real APIs.
  const salt=randomBytes(16);
  const key=scryptSync('Runtime-admin-153!',salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024});
  const encoded='scrypt$local-v1$N=32768,r=8,p=3$'+salt.toString('base64url')+'$'+key.toString('base64url');
  db.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,\'ACTIVE\',0,?,?)').run('admin-ui','admin-ui',encoded,Date.now(),Date.now());
  db.prepare('INSERT INTO "User"(id,login_name,password_hash,status,must_change_password,created_at,updated_at) VALUES(?,?,?,\'ACTIVE\',1,?,?)').run('long-user-ui','user'+'x'.repeat(60),encoded,Date.now(),Date.now());
  db.prepare('INSERT INTO "UserRoleGrant" VALUES(?,?,NULL,?)').run('admin-ui','Admin',Date.now());
  db.prepare('INSERT INTO "UserSiteGrant" VALUES(?,?,NULL,?)').run('admin-ui',uiSite,Date.now());
  db.prepare('INSERT INTO "SpecialGrant" VALUES(?,?,NULL,?)').run('admin-ui','audit:read',Date.now());
} finally {db.close();}
process.on('exit',()=>fixture.cleanup());
const env=Object.fromEntries(Object.entries(fixture.env).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
export default defineConfig({
  testDir:'./tests/runtime-e2e',workers:1,fullyParallel:false,
  use:{baseURL:origin,viewport:{width:1440,height:1000},trace:'retain-on-failure',launchOptions:{
    executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox'],
  }},
  webServer:{command:`npm run start -- --port ${port}`,url:origin,reuseExistingServer:false,
    env:{...env,CAD_STORAGE_BACKEND:'local',CAD_STORAGE_PATH:path.join(fixture.root,'cad'),MAX_UPLOAD_SIZE_MB:'100'}},
});
