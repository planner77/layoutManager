/** Synthetic-only payload in a read-only, network-none Node container. */
import {mkdir,readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {saveAndReadbackOfflineCpuStyledPrimitives} from './offline-cpu-styled-primitives.mjs';
import {syntheticStyledDxf} from './offline-cpu-styled-primitives-proof-fixtures.mjs';

const mode=process.argv[2];
if(!['normal','stall'].includes(mode))throw new Error('OFFLINE_RESOURCE_MODE');
const directory='/tmp/offline-fup3';
await mkdir(directory,{mode:0o700});
const input=syntheticStyledDxf();
const saved=await saveAndReadbackOfflineCpuStyledPrimitives(input,directory);
const sourceHashes={};
for(const name of ['offline-cpu-styled-primitives.mjs','offline-cpu-styled-primitives-dto.mjs',
  'offline-cpu-styled-primitives-proof-fixtures.mjs','offline-cpu-styled-primitives-resource-child.mjs']){
  sourceHashes[name]=createHash('sha256').update(await readFile(new URL(name,import.meta.url))).digest('hex');
}
if((await readdir(directory)).length!==0)throw new Error('OFFLINE_RESOURCE_TEMP_REMAINS');
const receipt={mode,state:saved.envelope.state,builder:saved.envelope.builder,
  primitiveCount:saved.envelope.primitiveCount,segmentCount:saved.envelope.segmentCount,
  visiblePrimitiveCount:saved.envelope.visiblePrimitiveCount,
  payloadSha256:saved.sha256,payloadBytes:saved.byteLength,readback:true,tempClean:true,sourceHashes};
// A success-looking partial receipt must never be accepted before clean exit.
process.stdout.write('OFFLINE_RESOURCE_RECEIPT:'+JSON.stringify(receipt)+'\n');
if(mode==='stall'){
  process.stdout.write('OFFLINE_RESOURCE_STALL_ARMED\n');
  setInterval(()=>{},1000);
}
