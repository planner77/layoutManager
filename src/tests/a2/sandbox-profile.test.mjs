import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFile} from 'node:fs/promises';
import {officialPath,targetedPath,upstreamLicensePath,upstreamNoticePath,
  verifyProfileBytes,verifyProfileDifference,verifyProfiles} from './sandbox-profile.mjs';

test('the pinned upstream profile has exactly the reviewed chroot delta',async()=>{
  const result=await verifyProfiles();
  assert.equal(result.onlyChange,'chroot.includes CAP_SYS_CHROOT removed');
  assert.match(await readFile(upstreamLicensePath,'utf8'),/Apache License/);
  assert.match(await readFile(upstreamNoticePath,'utf8'),/Playwright/);
});
test('profile verification rejects changed upstream bytes and extra syscall differences',async()=>{
  const [upstream,targeted]=await Promise.all([readFile(officialPath),readFile(targetedPath)]);
  const tampered=Buffer.from(upstream);tampered[10]=tampered[10]===32?10:32;
  assert.throws(()=>verifyProfileBytes(tampered,targeted),/OFFICIAL_PROFILE_SHA/);
  const changed=JSON.parse(targeted);changed.syscalls[0].names.push('mount');
  assert.throws(()=>verifyProfileBytes(upstream,Buffer.from(JSON.stringify(changed))),/TARGETED_PROFILE_SHA/);
  assert.throws(()=>verifyProfileDifference(JSON.parse(upstream),changed),/TARGETED_DIFF/);
  const stale=JSON.parse(targeted);stale.syscalls.find(x=>x.names?.[0]==='chroot').includes={caps:['CAP_SYS_CHROOT']};
  assert.throws(()=>verifyProfileDifference(JSON.parse(upstream),stale),/TARGETED_DIFF/);
});
