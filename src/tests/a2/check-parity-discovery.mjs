// Exercise the actual Playwright selector used by the mandatory parity container.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const cwd=fileURLToPath(new URL('../..',import.meta.url));
const expected=[
  'F01-F05 independent candidate vs actual live Adapter and fresh live restore',
  'F02/F04 comparator rejects late coordinate, identity, layer, transform and text mutation',
];
function discover(grep){
  const args=['test','--config','tests/a2/parity.playwright.config.ts','--list','--reporter=json'];
  if(grep!==undefined)args.push('--grep',grep);
  const run=spawnSync('./node_modules/.bin/playwright',args,{cwd,encoding:'utf8'});
  assert.equal(run.status,0,'Parity discovery failed or found no tests');
  const report=JSON.parse(run.stdout);
  assert.deepEqual(report.errors,[]);
  const found=[];
  function walk(suite){
    for(const spec of suite.specs??[]){
      assert.equal(spec.file,'parity.spec.ts');
      assert.equal(spec.tests.length,1);
      found.push({title:spec.title,id:spec.id});
    }
    for(const child of suite.suites??[])walk(child);
  }
  for(const suite of report.suites??[])walk(suite);
  return found;
}
function verify(all,selected){
  assert.deepEqual(all.map(x=>x.title),expected,'Complete parity inventory changed');
  assert.deepEqual(selected,all,'Parity selector omits or duplicates tests');
  assert.equal(new Set(all.map(x=>x.id)).size,expected.length);
}
assert.equal(process.argv[2],'--check');
const all=discover();
verify(all,discover('F0[1-5]'));
assert.throws(()=>verify(all,[]));
assert.throws(()=>verify(all,all.slice(1)));
assert.throws(()=>verify([...all,{title:'unselected extra',id:'extra'}],all));
assert.throws(()=>verify(all.map((x,i)=>i?x:{...x,title:'renamed'}),all));
assert.throws(()=>discover('PARITY_MUST_MATCH_NOTHING'));
console.info('A2_PARITY_DISCOVERY_OK: total=2 selected=2; zero/missing/extra/renamed rejected');
