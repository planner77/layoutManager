import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmod,mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildOfflineCpuStyledPrimitives,saveAndReadbackOfflineCpuStyledPrimitives} from './offline-cpu-styled-primitives.mjs';
import {STYLED_BUILDER,STYLED_SCHEMA,StyledCpuError,validateOfflineCpuStyledPrimitives,restoreOfflineCpuStyledPrimitives} from './offline-cpu-styled-primitives-dto.mjs';
import {syntheticStyledDxf,STYLED_FIXTURE_GOLDEN as golden} from './offline-cpu-styled-primitives-proof-fixtures.mjs';

const text=()=>new TextDecoder().decode(syntheticStyledDxf());
function edit(from,to){const x=text();assert.ok(x.includes(from),`fixture edit target missing`);return new TextEncoder().encode(x.replace(from,to));}
const bad=(bytes)=>assert.throws(()=>buildOfflineCpuStyledPrimitives(bytes),e=>e instanceof StyledCpuError&&typeof e.code==='string'&&e.message===e.code);
const mutate=(source,fn)=>{const copy=structuredClone(source);fn(copy);assert.throws(()=>validateOfflineCpuStyledPrimitives(copy,source.source),StyledCpuError);};

test('styled fixture binds original bytes, tables, independent palette and hidden retained geometry',()=>{
  const bytes=syntheticStyledDxf(),hash=createHash('sha256').update(bytes).digest('hex');
  const x=buildOfflineCpuStyledPrimitives(bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);
  assert.deepEqual(x.source,{sha256:hash,bytes:bytes.length});
  assert.equal(x.schema,STYLED_SCHEMA);assert.equal(x.builder,STYLED_BUILDER);assert.equal(x.state,'CANDIDATE');
  assert.equal(x.primitiveCount,golden.primitiveCount);assert.equal(x.visiblePrimitiveCount,golden.visiblePrimitiveCount);
  assert.deepEqual(x.primitives.map(p=>p.type),golden.types);
  assert.deepEqual(x.primitives.map(p=>p.resolved.visible),golden.visible);
  assert.deepEqual(x.primitives.map(p=>p.resolved.rgb),golden.rgb);
  assert.deepEqual(x.primitives.map(p=>p.resolved.locked),golden.locked);
  assert.deepEqual(x.primitives.map(p=>p.resolved.weight),golden.weight);
  assert.deepEqual(x.primitives.map(p=>p.resolved.weightOrigin),golden.weightOrigin);
  assert.equal(x.tables.ltype.capacity,2);assert.equal(x.tables.ltype.records.length,1);
  assert.equal(x.tables.layer.capacity,6);assert.equal(x.tables.layer.records.length,4);
  assert.equal(x.tables.style.records.length,1);
  assert.ok(x.segmentCount>20);assert.ok(x.maxChordErrorMm<=0.05);assert.ok(x.maxFloatErrorMm<=0.05);
  for(const p of x.primitives)assert.ok(p.segments.length>0);
  const restored=restoreOfflineCpuStyledPrimitives(x,x.source);
  assert.equal(restored.visiblePrimitiveCount,3);assert.equal(restored.segmentCount,x.segmentCount);
  for(let i=0;i<restored.segments.length;i++){
    assert.deepEqual([...restored.segments[i].positions],x.primitives[i].segments.flat());
    assert.equal(restored.segments[i].visible,golden.visible[i]);
    assert.equal(restored.segments[i].rgb,golden.rgb[i]);
  }
});
test('HEADER/TABLES structure, capacity, case collisions, handles and refs fail closed',()=>{
  bad(edit('0\nSECTION\n2\nTABLES\n','0\nSECTION\n2\nCLASSES\n'));
  bad(edit('2\nLAYER\n70\n6','2\nLAYER\n70\n3'));
  bad(edit('2\nFROZEN\n70\n1','2\nlock\n70\n1'));
  bad(edit('5\n22\n330\n20','5\n022\n330\n20'));
  bad(edit('5\n22\n330\n20','5\n21\n330\n20'));
  bad(edit('5\n22\n330\n20','5\n22\n330\n10'));
  bad(edit('2\n0\n70\n0\n62\n1','2\nZERO\n70\n0\n62\n1'));
  bad(edit('2\nCONTINUOUS\n70\n0','2\nDASHED\n70\n0'));
  bad(edit('9\n$LWDISPLAY\n290\n0','9\n$LWDISPLAY\n290\n1'));
  bad(edit('9\n$ACADVER\n1\nAC1018','9\n$ACADVER\n1\nAC1027'));
  bad(edit('0\nENDSEC\n0\nEOF\n','0\nENDSEC\n0\nSECTION\n2\nOBJECTS\n0\nENDSEC\n0\nEOF\n'));
});
test('color, visibility, linetype and weight semantics reject unsupported input',()=>{
  bad(edit('2\n0\n70\n0\n62\n1','2\n0\n70\n0\n62\n8'));
  bad(edit('62\n200\n420\n65416','62\n0\n420\n65416'));
  bad(edit('62\n200\n420\n65416','62\n200\n420\n16777216'));
  bad(edit('6\nCONTINUOUS\n370\n-3','6\nDASHED\n370\n-3'));
  bad(edit('370\n35\n10\n-30','370\n-2\n10\n-30'));
  bad(edit('60\n1\n420\n16711935','60\n2\n420\n16711935'));
  bad(edit('370\n35\n10\n-30','370\n14\n10\n-30'));
  bad(edit('0\nARC\n8\nOFF\n370\n-3\n10\n10\n20\n20\n40\n10','0\nARC\n8\nOFF\n370\n-3\n10\n10\n20\n20\n40\n0'));
  bad(edit('0\nLINE\n8\n0\n10\n-80','0\nTEXT\n8\n0\n10\n-80'));
});
test('STYLE is dormant and rejects font paths, flags, bigfont and text entities',()=>{
  bad(edit('3\nsimple.ttf\n4\n','3\n../simple.ttf\n4\n'));
  bad(edit('2\nSTANDARD\n70\n0','2\nSTANDARD\n70\n1'));
  bad(edit('3\nsimple.ttf\n4\n\n5\n31','3\nsimple.ttf\n4\nbig.shx\n5\n31'));
  bad(edit('0\nENDSEC\n0\nEOF\n','0\nTEXT\n1\nhello\n0\nENDSEC\n0\nEOF\n'));
});
test('full validator recomputes resolutions and rejects forged styles/metadata/geometry',()=>{
  const x=buildOfflineCpuStyledPrimitives(syntheticStyledDxf());
  mutate(x,v=>v.builder='node-cpu-primitives@0.1.0+cad-scene-1');
  mutate(x,v=>v.state='READY');mutate(x,v=>v.schema='cad-scene-1');
  mutate(x,v=>v.source.sha256='0'.repeat(64));mutate(x,v=>v.segmentCount--);
  mutate(x,v=>v.visiblePrimitiveCount++);mutate(x,v=>v.tables.layer.records[0].name='LOCK');
  mutate(x,v=>v.tables.layer.records[1].owner='10');mutate(x,v=>v.tables.layer.records[1].handle='021');
  mutate(x,v=>v.tables.layer.records[0].linetype=3);
  mutate(x,v=>v.primitives[0].resolved.rgb=0);
  mutate(x,v=>v.primitives[1].resolved.locked=false);
  mutate(x,v=>v.primitives[2].resolved.visible=true);
  mutate(x,v=>v.primitives[1].resolved.weight=25);
  mutate(x,v=>v.primitives[1].resolved.weightOrigin='LAYER');
  mutate(x,v=>v.primitives[0].resolved.colorOrigin='ENTITY_ACI');
  mutate(x,v=>v.primitives[0].declared.layer='MISSING');
  mutate(x,v=>v.primitives[0].segments[0][5]=1);
  mutate(x,v=>v.primitives.at(-1).segments.at(-1)[4]=NaN);
  mutate(x,v=>v.primitives[0].id='p000002');
});
test('private fsynced exclusive readback has source binding and cleans owned file',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fup3-'));await chmod(dir,0o700);
  try{const x=await saveAndReadbackOfflineCpuStyledPrimitives(syntheticStyledDxf(),dir);assert.match(x.sha256,/^[a-f0-9]{64}$/);assert.equal(x.envelope.state,'CANDIDATE');assert.deepEqual(await readdir(dir),[]);}finally{await rm(dir,{recursive:true,force:true});}
});
test('new parser enforces encoding, pair/source caps and cooperative deadline',()=>{
  const as1252=edit('3\nUTF-8\n','3\nANSI_1252\n');
  assert.equal(buildOfflineCpuStyledPrimitives(as1252).header.codepage,'ANSI_1252');
  const raw=Buffer.from(text());const marker=Buffer.from('Solid line');const i=raw.indexOf(marker);assert.ok(i>0);
  for(const [encoding,byte] of [['UTF-8',0xff],['ANSI_1252',0x81]]){
    const base=encoding==='UTF-8'?raw:Buffer.from(new TextDecoder().decode(as1252));
    const offset=base.indexOf(marker);const invalid=Buffer.concat([base.subarray(0,offset),Buffer.from([byte]),base.subarray(offset+1)]);
    bad(invalid);
  }
  bad(Buffer.alloc(16*1024*1024+1));
  bad(Buffer.from('0\nEOF\n'.repeat(300001)));
  const original=Date.now;let calls=0;
  try{Date.now=()=>++calls===1?0:15001;bad(syntheticStyledDxf());}finally{Date.now=original;}
  assert.equal(Date.now,original);
});
test('case-insensitive refs, weight origins, plot metadata and RGB boundaries',()=>{
  const mixed=edit('2\nLOCK\n70\n4','2\nLock\n70\n4');
  const refs=new TextEncoder().encode(new TextDecoder().decode(mixed).replace('8\nLOCK\n62\n2','8\nlOcK\n62\n2'));
  assert.equal(buildOfflineCpuStyledPrimitives(refs).primitives[1].resolved.locked,true);
  const inherit=buildOfflineCpuStyledPrimitives(edit('370\n35\n10\n-30','370\n-1\n10\n-30'));
  assert.deepEqual([inherit.primitives[1].resolved.weight,inherit.primitives[1].resolved.weightOrigin],[50,'LAYER']);
  const directDefault=buildOfflineCpuStyledPrimitives(edit('370\n35\n10\n-30','370\n-3\n10\n-30'));
  assert.deepEqual([directDefault.primitives[1].resolved.weight,directDefault.primitives[1].resolved.weightOrigin],[25,'DEFAULT']);
  const plot=buildOfflineCpuStyledPrimitives(edit('370\n-3\n5\n21','370\n-3\n290\n0\n5\n21'));
  assert.equal(plot.primitives[0].resolved.visible,true);assert.equal(plot.primitives[0].resolved.plot,false);
  assert.equal(buildOfflineCpuStyledPrimitives(edit('420\n65416','420\n0')).primitives.at(-1).resolved.rgb,0);
  assert.equal(buildOfflineCpuStyledPrimitives(edit('420\n65416','420\n16777215')).primitives.at(-1).resolved.rgb,0xffffff);
  const noStyle=new TextEncoder().encode(text().replace(/0\nTABLE\n2\nSTYLE\n[\s\S]*?0\nENDTAB\n/,''));
  assert.equal(buildOfflineCpuStyledPrimitives(noStyle).tables.style,null);
});
test('duplicate/unknown fields, handle aliases and ownership fail without candidate',()=>{
  bad(edit('9\n$LWDISPLAY\n290\n0','9\n$LWDISPLAY\n290\n0\n9\n$LWDISPLAY\n290\n0'));
  bad(edit('2\nLAYER\n70\n6','2\nLAYER\n70\n6\n70\n6'));
  bad(edit('2\n0\n70\n0\n62\n1','2\n0\n70\n0\n62\n1\n62\n1'));
  bad(edit('2\n0\n70\n0\n62\n1','2\n0\n70\n0\n62\n1\n390\nA'));
  bad(edit('0\nLINE\n8\n0\n10\n-80','0\nLINE\n8\n0\n7\nSTANDARD\n10\n-80'));
  bad(edit('5\n22\n330\n20','5\n0\n330\n20'));
  const upper=text().replace('5\n22\n330\n20','5\nA\n330\n20').replace('5\n23\n330\n20','5\na\n330\n20');
  bad(new TextEncoder().encode(upper));
  bad(edit('5\n22\n330\n20','5\n22\n330\n21'));
  bad(edit('0\nTABLE\n2\nSTYLE','0\nTABLE\n2\nDIMSTYLE'));
});
