import {test} from 'node:test';
import assert from 'node:assert/strict';

process.env.A2_PROOF_IMAGE='a2-test-image';
const {safeLog,checkFault,checkRecovery}=await import('./process-safety.mjs');

test('raw browser or Node exceptions and CAD bytes never reach the allowlisted receipt',()=>{
  const raw='A2_PHASE:CONVERTED\nCAD PRIVATE\nA2_PHASE:FAULT_READY\n'+
    'A2_PHASE:SECRET=canary\nA2_RECEIPT:{"mode":"normal","nodes":2,"vertices":3,"bytes":4,"readback":1,"restore":1,"quiet":1,"secret":"canary"}\n';
  const parsed=safeLog(raw);
  assert.deepEqual(parsed.phases,['CONVERTED','FAULT_READY']);
  assert.deepEqual(parsed.receipt,{nodes:2,vertices:3,bytes:4,readback:1,restore:1,quiet:1});
  assert.doesNotMatch(JSON.stringify(parsed),/PRIVATE|canary|SECRET/);
});

test('OOM needs Docker OOMKilled evidence; exit 137 alone is insufficient',()=>{
  const base={mode:'oom',phases:['CONVERTED','FAULT_READY'],receipt:undefined,exitCode:137,
    oomKilled:false,pidBefore:7,pidAfter:0,supervisorKilled:false,ready:true};
  assert.throws(()=>checkFault(base),/OOM_NOT_VERIFIED/);
  assert.doesNotThrow(()=>checkFault({...base,oomKilled:true}));
});

test('recovery requires clean exit, validator, readback, restore and quiet phases',()=>{
  const base={exitCode:0,oomKilled:false,pidAfter:0,
    receipt:{nodes:2,vertices:3,bytes:4,readback:1,restore:1,quiet:1},
    phases:['CONVERTED','READBACK_VALID','RESTORE_VALID','QUIET_VALID']};
  assert.doesNotThrow(()=>checkRecovery(base));
  assert.throws(()=>checkRecovery({...base,exitCode:1}),/RECOVERY_GATE/);
  assert.throws(()=>checkRecovery({...base,phases:['CONVERTED','READBACK_VALID']}),/RECOVERY_GATE/);
});
