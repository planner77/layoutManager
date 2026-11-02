/** Opt-in disposable Auth E2E clock. Never loaded by normal App startup. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';

const root=process.env.G7_RUNTIME_E2E_ROOT;
function reject(){throw new Error('SYNTHETIC_AUTH_CLOCK_REQUIRES_OWNED_FIXTURE');}
if(process.env.G7_RUNTIME_E2E_MONOTONIC_CLOCK!=='true'||!root||
   path.dirname(root)!==fs.realpathSync(os.tmpdir())||
   !/^cad-g7-runtime-[A-Za-z0-9]+$/.test(path.basename(root))||
   process.env.DATABASE_URL!=='file:'+path.join(root,'fixture.sqlite')||
   process.env.CAD_STORAGE_PATH!==path.join(root,'cad')||
   process.env.G7_RUNTIME_TRUST_PATH!==path.join(root,'runtime-trust.json')||
   process.env.G7_RUNTIME_APPROVAL_PATH!==path.join(root,'runtime-approval.json')||
   process.env.CAD_STORAGE_BACKEND!=='local'||
   process.env.G7_AUTH_ENABLED!=='true'||
   process.env.G7_CAD_WRITE_CUTOVER_ENABLED!=='true'||
   process.env.G7_RUNTIME_ALLOW_HTTP!=='true'||
   process.env.NODE_ENV!=='production')reject();
for(const dir of [root,path.join(root,'cad')]){
 const stat=fs.lstatSync(dir);
 if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid()||
    (stat.mode&0o077)!==0)reject();
}
let wallStart=Date.now();
for(const name of ['fixture.sqlite','runtime-trust.json','runtime-approval.json']){
 const stat=fs.lstatSync(path.join(root,name));
 if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||
    stat.uid!==process.getuid()||(stat.mode&0o077)!==0)reject();
 wallStart=Math.max(wallStart,Math.ceil(stat.mtimeMs));
}
const monotonicStart=performance.now();
Date.now=()=>wallStart+Math.floor(performance.now()-monotonicStart);
