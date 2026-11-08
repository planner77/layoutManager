/** Synthetic-only payload in a read-only, network-none Node container. */
import {mkdir,readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {saveAndReadbackOfflineCpuPrimitives} from './offline-cpu-primitives.mjs';
import {syntheticPrimitivesDxf} from './offline-cpu-primitives-proof-fixtures.mjs';

const mode=process.argv[2];
if(!['normal','stall'].includes(mode))throw new Error('OFFLINE_RESOURCE_MODE');
const directory='/tmp/offline-fup2';
await mkdir(directory,{mode:0o700});
const input=syntheticPrimitivesDxf();
const saved=await saveAndReadbackOfflineCpuPrimitives(input,directory);
const sourceHashes={};
for(const name of ['offline-cpu-primitives.mjs','offline-cpu-primitives-dto.mjs',
  'offline-cpu-primitives-proof-fixtures.mjs','offline-cpu-primitives-resource-child.mjs']){
  sourceHashes[name]=createHash('sha256').update(await readFile(new URL(name,import.meta.url))).digest('hex');
}
if((await readdir(directory)).length!==0)throw new Error('OFFLINE_RESOURCE_TEMP_REMAINS');
const receipt={mode,state:saved.envelope.state,builder:saved.envelope.builder,
  primitiveCount:saved.envelope.primitiveCount,segmentCount:saved.envelope.segmentCount,
  payloadSha256:saved.sha256,payloadBytes:saved.byteLength,readback:true,tempClean:true,sourceHashes};
// A success-looking partial receipt must never be accepted before clean exit.
process.stdout.write('OFFLINE_RESOURCE_RECEIPT:'+JSON.stringify(receipt)+'\n');
if(mode==='stall'){
  process.stdout.write('OFFLINE_RESOURCE_STALL_ARMED\n');
  setInterval(()=>{},1000);
}
