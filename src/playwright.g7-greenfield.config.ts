/** #109 dedicated empty-database UI E2E: not the existing legacy E2E fixture. */
import { defineConfig } from '@playwright/test';
import { chmodSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const port=process.env.G7_GREENFIELD_E2E_PORT ?? '3321';
const root=mkdtempSync(path.join(tmpdir(),'g7-first-run-ui-'));
chmodSync(root,0o700);
for(const folder of ['db','cad'])mkdirSync(path.join(root,folder),{mode:0o700});
process.env.G7_GREENFIELD_E2E_ROOT=root;
const origin='http://127.0.0.1:'+port;
export default defineConfig({
  testDir:'./tests/greenfield-e2e',workers:1,fullyParallel:false,
  use:{baseURL:origin,viewport:{width:1440,height:1000},trace:'retain-on-failure',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox']}},
  webServer:{
    command:`node --import tsx scripts/g7-greenfield.ts auto && npm run start -- --port ${port}`,
    url:origin+'/api/health',
    reuseExistingServer:false,
    env:{
      DATABASE_URL:'file:'+path.join(root,'db','cad.sqlite'),
      CAD_STORAGE_PATH:path.join(root,'cad'),CAD_STORAGE_BACKEND:'local',
      G7_GREENFIELD_MODE:'true',G7_GREENFIELD_AUTOMATED:'true',
      G7_DEPLOY_APP_IMAGE:'cad-layout-viewer:local',
      G7_DEPLOY_MIGRATOR_IMAGE:'cad-layout-viewer:local-migrate',
      G7_AUTH_ENABLED:'true',G7_CAD_WRITE_CUTOVER_ENABLED:'true',
      G7_RUNTIME_ORIGIN:origin,G7_RUNTIME_ALLOW_HTTP:'true',
      G7_RUNTIME_RECOVERY_MODE:'false',
    },
    timeout:120000,
  },
});
