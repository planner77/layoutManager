import {defineConfig} from '@playwright/test';
import base from './playwright.config';
const server=base.webServer;
if(!server||Array.isArray(server))throw new Error('A single test server is required');
export default defineConfig({...base,outputDir:'benchmark-results',testMatch:'**/*.benchmark.ts',webServer:{...server,env:{...server.env,MAX_UPLOAD_SIZE_MB:'20'}}});
