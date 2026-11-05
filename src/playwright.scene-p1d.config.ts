/** #225 P1-D: only the PR CI-owned external Docker App/Worker harness. */
import {defineConfig} from '@playwright/test';

const origin=process.env.G7_P1D_ORIGIN;
if(process.env.GITHUB_ACTIONS!=='true'||
   process.env.GITHUB_EVENT_NAME!=='pull_request'||
   !origin||!/^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(origin)||
   !process.env.G7_P1D_VOLUME?.startsWith('layoutmanager-ci-p1d-')||
   !process.env.G7_P1D_SETUP_CODE||
   !process.env.G7_P1D_SOURCE_SHA?.match(/^[0-9a-f]{40}$/)) {
  throw new Error('P1D_DISPOSABLE_DOCKER_CI_REQUIRED');
}

export default defineConfig({
  testDir:'./tests/p1d-e2e',
  workers:1,fullyParallel:false,
  timeout:180_000,
  expect:{timeout:20_000},
  use:{
    baseURL:origin,
    viewport:{width:1440,height:960},
    trace:'retain-on-failure',
    launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']},
  },
});
