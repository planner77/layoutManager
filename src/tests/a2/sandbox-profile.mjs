/** Pin official Playwright v1.63.0 seccomp bytes and exactly one local chroot change. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';

export const officialSha256='cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849';
export const targetedSha256='13e864cee59fd91b1fb03e63c292d590d42a1317aa3afa059f5f5d564e6d3ed4';
export const upstreamLicenseSha256='45873d00a0dd243596deb4aa23b2493b3d1f0671921bf2538ea431d7380220eb';
export const upstreamNoticeSha256='6d602191187b35b9b01d2cffa01c8469c2c8d9de8a96f1bf868e0f264f51c81d';
const directory=dirname(fileURLToPath(import.meta.url));
export const officialPath=join(directory,'playwright-v1.63.0-seccomp.json');
export const targetedPath=join(directory,'playwright-v1.63.0-chroot-seccomp.json');
export const upstreamLicensePath=join(directory,'PLAYWRIGHT-LICENSE.txt');
export const upstreamNoticePath=join(directory,'PLAYWRIGHT-NOTICE.txt');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

export function verifyProfileBytes(officialBytes,targetedBytes){
  if(sha(officialBytes)!==officialSha256)throw new Error('OFFICIAL_PROFILE_SHA');
  if(sha(targetedBytes)!==targetedSha256)throw new Error('TARGETED_PROFILE_SHA');
  let official,targeted;
  try{official=JSON.parse(officialBytes);targeted=JSON.parse(targetedBytes);}catch{throw new Error('PROFILE_JSON');}
  verifyProfileDifference(official,targeted);
  return {officialSha256,targetedSha256,onlyChange:'chroot.includes CAP_SYS_CHROOT removed'};
}
export function verifyProfileDifference(official,targeted){
  if(official.defaultAction!=='SCMP_ACT_ERRNO'||targeted.defaultAction!=='SCMP_ACT_ERRNO')
    throw new Error('PROFILE_DEFAULT_ACTION');
  const rules=official.syscalls.filter(x=>x.names?.length===1&&x.names[0]==='chroot');
  if(rules.length!==1||rules[0].action!=='SCMP_ACT_ALLOW'||
    JSON.stringify(rules[0].includes)!==JSON.stringify({caps:['CAP_SYS_CHROOT']}))
    throw new Error('OFFICIAL_CHROOT_RULE');
  const expected=structuredClone(official);
  expected.syscalls.find(x=>x.names?.length===1&&x.names[0]==='chroot').includes={};
  if(JSON.stringify(expected)!==JSON.stringify(targeted))throw new Error('TARGETED_DIFF');
}
export async function verifyProfiles(){
  const [official,targeted,license,notice]=await Promise.all([
    readFile(officialPath),readFile(targetedPath),readFile(upstreamLicensePath),readFile(upstreamNoticePath)]);
  if(sha(license)!==upstreamLicenseSha256||sha(notice)!==upstreamNoticeSha256)
    throw new Error('UPSTREAM_ATTRIBUTION_SHA');
  return verifyProfileBytes(official,targeted);
}
