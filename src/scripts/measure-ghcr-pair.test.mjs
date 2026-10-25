import test from 'node:test';
import assert from 'node:assert/strict';
import { linuxAmd64Manifest, compressedLayerStats } from './measure-ghcr-pair.mjs';

const digest = char => 'sha256:' + char.repeat(64);
const manifest = layers => ({ config: {digest:digest('d')}, layers: layers.map(([name,size]) => ({digest:digest(name),size})) });

test('choose only linux/amd64 and ignore attestation descriptors', () => {
  const index = { manifests: [
    {digest:digest('a'), platform:{os:'unknown',architecture:'unknown'}},
    {digest:digest('b'), platform:{os:'linux',architecture:'amd64'}}
  ]};
  let queried;
  const result = linuxAmd64Manifest(index, 'ghcr.io/example/app:1.0-migrate', ref => {queried=ref; return manifest([['a',17]]);});
  assert.equal(queried, 'ghcr.io/example/app@'+digest('b'));
  assert.equal(result.layers[0].size,17);
});
test('pair counts unique shared layers once', () => {
  const result=compressedLayerStats(manifest([['a',100],['b',50]]),manifest([['a',100],['c',30]]));
  assert.deepEqual([result.appBytes,result.migratorBytes,result.pairSumBytes,result.pairUniqueBytes,result.sharedBytes],[150,130,280,180,100]);
});
test('reject absent linux/amd64, inconsistent digest size and invalid layer descriptors', () => {
  assert.throws(() => linuxAmd64Manifest({manifests:[{digest:digest('a'),platform:{os:'unknown',architecture:'unknown'}}]},'example:1',()=>{}));
  assert.throws(() => compressedLayerStats(manifest([['a',1]]), manifest([['a',2]])), /Conflicting/);
  assert.throws(() => compressedLayerStats({config:{},layers:[{digest:'invalid',size:-2}]},manifest([['a',1]])), /Invalid/);
});
