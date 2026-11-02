import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',testMatch:'scene-poc.spec.ts',workers:1,
 use:{baseURL:'http://127.0.0.1:39999',viewport:{width:800,height:600},launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']}}});
