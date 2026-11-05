import {defineConfig} from '@playwright/test';

const receipt=process.env.G7_RR2_RECEIPT;
if(!receipt||!receipt.endsWith('/receipt.json')||
   !process.env.G7_RR2_ORIGIN?.match(/^http:\/\/127\.0\.0\.1:\d{4,5}$/)){
  throw new Error('RR2_OWNED_RECEIPT_REQUIRED');
}
export default defineConfig({
  testDir:'./tests/rr2-e2e',
  workers:1,fullyParallel:false,
  timeout:240_000,
  expect:{timeout:20_000},
  use:{baseURL:process.env.G7_RR2_ORIGIN,
    viewport:{width:1440,height:960},
    trace:'off',
    launchOptions:{args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']},
  },
});
