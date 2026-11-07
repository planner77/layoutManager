import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmod,mkdtemp,readdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildOfflineCpuPrimitives,saveAndReadbackOfflineCpuPrimitives} from './offline-cpu-primitives.mjs';
import {OFFLINE_BUILDER,OFFLINE_SCHEMA,OFFLINE_LIMITS,OfflineCpuError,validateOfflineCpuPrimitives,restoreOfflineCpuPrimitives} from './offline-cpu-primitives-dto.mjs';

const pair=(...rows)=>Buffer.from(rows.map(([c,v])=>`${c}\n${v}\n`).join(''));
const header=(encoding='UTF-8')=>[['0','SECTION'],['2','HEADER'],['9','$ACADVER'],['1','AC1018'],['9','$DWGCODEPAGE'],['3',encoding],['9','$INSUNITS'],['70','4'],['0','ENDSEC']];
const document=(records,encoding='UTF-8')=>pair(...header(encoding),['0','SECTION'],['2','ENTITIES'],...records,['0','ENDSEC'],['0','EOF']);
const line=(a=[0,0],b=[10,0])=>[['0','LINE'],['10',String(a[0])],['20',String(a[1])],['11',String(b[0])],['21',String(b[1])]];
const circle=(x=30,y=20,r=15)=>[['0','CIRCLE'],['10',String(x)],['20',String(y)],['40',String(r)]];
const arc=(start=350,end=100)=>[['0','ARC'],['10','-30'],['20','20'],['40','15'],['50',String(start)],['51',String(end)]];
const poly=(closed=false)=>[['0','LWPOLYLINE'],['90',closed?'4':'3'],['70',closed?'1':'0'],...(closed?[[-60,-20],[-40,-20],[-40,0],[-60,0]]:[[0,-50],[20,-30],[40,-50]]).flatMap(([x,y])=>[['10',String(x)],['20',String(y)]])];
const reject=(bytes,code)=>assert.throws(()=>buildOfflineCpuPrimitives(bytes),e=>e instanceof OfflineCpuError&&e.code===code);
const clone=(v)=>structuredClone(v);
const all=()=>document([...line([-60,-40],[-10,-40]),...circle(),...arc(),...poly(),...poly(true)]);

test('five primitives have independent endpoint, sweep, bbox and closure goldens',()=>{
  const source=all(),before=createHash('sha256').update(source).digest('hex');
  const out=buildOfflineCpuPrimitives(source);
  assert.equal(createHash('sha256').update(source).digest('hex'),before);
  assert.equal(out.source.sha256,before);
  assert.equal(out.schema,OFFLINE_SCHEMA);assert.equal(out.builder,OFFLINE_BUILDER);assert.equal(out.state,'CANDIDATE');
  assert.deepEqual(out.primitives.map(p=>p.type),['LINE','CIRCLE','ARC','LWPOLYLINE','LWPOLYLINE']);
  assert.deepEqual(out.primitives[0].segments,[[Math.fround(-60),Math.fround(-40),0,Math.fround(-10),Math.fround(-40),0]]);
  const bbox=[Infinity,Infinity,-Infinity,-Infinity];
  for(const p of out.primitives)for(const s of p.segments)for(let k=0;k<6;k+=3){bbox[0]=Math.min(bbox[0],s[k]);bbox[1]=Math.min(bbox[1],s[k+1]);bbox[2]=Math.max(bbox[2],s[k]);bbox[3]=Math.max(bbox[3],s[k+1]);}
  assert.ok(bbox[0]>=-60&&bbox[0]<=-59.999);
  assert.ok(bbox[1]>=-50&&bbox[1]<=-49.999);
  assert.ok(bbox[2]>=44.9&&bbox[2]<=45);
  assert.ok(bbox[3]>=34.9&&bbox[3]<=35);
  const c=out.primitives[1].segments;
  assert.ok(c.length>=3);assert.equal(c[0][0],c.at(-1)[3]);assert.equal(c[0][1],c.at(-1)[4]);
  const a=out.primitives[2].segments;
  const start=[-30+15*Math.cos(350*Math.PI/180),20+15*Math.sin(350*Math.PI/180)];
  const end=[-30+15*Math.cos(100*Math.PI/180),20+15*Math.sin(100*Math.PI/180)];
  assert.ok(Math.hypot(a[0][0]-start[0],a[0][1]-start[1])<0.05);
  assert.ok(Math.hypot(a.at(-1)[3]-end[0],a.at(-1)[4]-end[1])<0.05);
  assert.equal(out.primitives[3].segments.length,2);
  assert.equal(out.primitives[4].segments.length,4);
  assert.deepEqual(out.primitives[4].segments.at(-1).slice(3,5),out.primitives[4].segments[0].slice(0,2));
  assert.ok(out.maxChordErrorMm<=0.05);assert.ok(out.maxFloatErrorMm<=0.05);
  for(const [p,center,r,startAngle,sweep] of [[out.primitives[1],[30,20],15,0,2*Math.PI],[out.primitives[2],[-30,20],15,350*Math.PI/180,110*Math.PI/180]]){
    for(let i=0;i<p.segments.length;i++){
      const s=p.segments[i],begin=startAngle+sweep*i/p.segments.length,end=startAngle+sweep*(i+1)/p.segments.length,mid=(begin+end)/2;
      const exactBegin=[center[0]+r*Math.cos(begin),center[1]+r*Math.sin(begin)];
      const exactEnd=[center[0]+r*Math.cos(end),center[1]+r*Math.sin(end)];
      const exactMid=[center[0]+r*Math.cos(mid),center[1]+r*Math.sin(mid)];
      assert.ok(Math.hypot(s[0]-exactBegin[0],s[1]-exactBegin[1])<=0.05);
      assert.ok(Math.hypot(s[3]-exactEnd[0],s[4]-exactEnd[1])<=0.05);
      assert.ok(Math.hypot((s[0]+s[3])/2-exactMid[0],(s[1]+s[4])/2-exactMid[1])<=0.1);
    }
  }
  const restored=restoreOfflineCpuPrimitives(out,out.source);
  assert.equal(restored.segmentCount,out.segmentCount);
  assert.ok(restored.segments[1].positions instanceof Float32Array);
  assert.deepEqual([...restored.segments[0].positions],out.primitives[0].segments[0]);
});
test('opposite wrapped ARC uses 340 degree CCW sweep; same angle rejects',()=>{
  const short=buildOfflineCpuPrimitives(document(arc(350,10)));
  const long=buildOfflineCpuPrimitives(document(arc(10,350)));
  assert.ok(long.segmentCount>short.segmentCount*10);
  reject(document(arc(0,360)),'DXF_ANGLE');reject(document(arc(10,10)),'DXF_ANGLE');
  const quadrant=buildOfflineCpuPrimitives(document(arc(0,90))).primitives[0].segments;
  assert.deepEqual(quadrant[0].slice(0,2),[-15,20]);
  assert.deepEqual(quadrant.at(-1).slice(3,5),[-30,35]);
  for(const s of quadrant){const a=[s[0]+30,s[1]-20],b=[s[3]+30,s[4]-20];assert.ok(a[0]*b[1]-a[1]*b[0]>0);}
  const tiny=buildOfflineCpuPrimitives(document(circle(0,0,0.001)));
  assert.equal(tiny.segmentCount,3);
});
test('explicit 1252 succeeds, undefined bytes and bad UTF8 reject without mutation',()=>{
  const good=document([...line(),['8','0']],'ANSI_1252');assert.equal(buildOfflineCpuPrimitives(good).source.bytes,good.length);
  const marker=Buffer.from('8\n0\n');const index=good.indexOf(marker);assert.ok(index>0);
  const bad1252=Buffer.concat([good.subarray(0,index),Buffer.from('8\n'),Buffer.from([0x81,10]),good.subarray(index+marker.length)]);
  reject(bad1252,'DXF_ENCODING');
  const utf=document([...line(),['8','0']]);const j=utf.indexOf(marker);
  const badUtf=Buffer.concat([utf.subarray(0,j),Buffer.from('8\n'),Buffer.from([0xff,10]),utf.subarray(j+marker.length)]);
  reject(badUtf,'DXF_ENCODING');
  reject(document(line(),'ANSI_949'),'DXF_CODEPAGE');
});
test('syntax, declaration, unknown and duplicate semantic fields reject entire payload',()=>{
  reject(Buffer.from('0\nSECTION\n2\n'),'DXF_ODD_PAIR');
  reject(document([...line(),['11','9']]),'DXF_DUPLICATE_FIELD');
  reject(document([...line(),['999','unused']]),'DXF_UNSUPPORTED_FIELD');
  reject(document([...line(),['8','SECRET']]),'DXF_LAYER');
  reject(document([...line(),['30','1']]),'DXF_Z');
  reject(document([...line(),['210','1']]),'DXF_NORMAL');
  reject(document([...line(),['62','1']]),'DXF_STYLE');
  reject(document([...line(),...circle(),['0','TEXT'],['1','private']]),'DXF_UNSUPPORTED_ENTITY');
  reject(pair(...header(),['0','SECTION'],['2','BLOCKS'],['0','ENDSEC'],['0','SECTION'],['2','ENTITIES'],...line(),['0','ENDSEC'],['0','EOF']),'DXF_SECTION');
  reject(pair(...header().slice(0,-1),['9','$DWGCODEPAGE'],['3','ANSI_1252'],['0','ENDSEC'],['0','SECTION'],['2','ENTITIES'],...line(),['0','ENDSEC'],['0','EOF']),'DXF_CODEPAGE');
  reject(pair(...header().filter(([,v])=>v!=='$DWGCODEPAGE'&&v!=='UTF-8'),['0','SECTION'],['2','ENTITIES'],...line(),['0','ENDSEC'],['0','EOF']),'DXF_CODEPAGE');
  reject(pair(...header().slice(0,-1),['9','$UNKNOWN'],['1','value'],['0','ENDSEC'],['0','SECTION'],['2','ENTITIES'],...line(),['0','ENDSEC'],['0','EOF']),'DXF_HEADER_FIELD');
  reject(pair(...header(),['0','SECTION'],['2','HEADER'],['0','ENDSEC'],['0','SECTION'],['2','ENTITIES'],...line(),['0','ENDSEC'],['0','EOF']),'DXF_SECTION');
});
test('polyline semantics, degeneracy, resource and precision bounds',()=>{
  reject(document([...poly(),['42','0.5']]),'DXF_POLYLINE');
  reject(document([...poly(),['43','1']]),'DXF_POLYLINE');
  reject(document([...poly(),['70','2']]),'DXF_DUPLICATE_FIELD');
  reject(document([['0','LWPOLYLINE'],['90','3'],['10','0'],['20','0'],['10','1'],['20','0']]),'DXF_POLYLINE');
  reject(document([['0','LWPOLYLINE'],['90','2'],['10','0'],['20','0'],['20','0'],['10','1'],['20','0']]),'DXF_VERTEX_FIELD');
  reject(document([['0','LWPOLYLINE'],['90','2'],['70','1'],['10','0'],['20','0'],['10','1'],['20','0']]),'DXF_POLYLINE');
  reject(document([['0','LWPOLYLINE'],['90','3'],['70','1'],['10','0'],['20','0'],['10','1'],['20','0'],['10','0'],['20','0']]),'DXF_DEGENERATE');
  reject(document([['0','LWPOLYLINE'],['90','3'],['70','0'],['10','0'],['20','0'],['10','1'],['20','0'],['10','0'],['20','0']]),'DXF_DEGENERATE');
  reject(document(line([0,0],[0,0])),'DXF_DEGENERATE');
  reject(document(line([0,0],[1e-50,0])),'DXF_FLOAT_COLLAPSE');
  reject(document(line([0,0],[1_000_001,0])),'DXF_COORDINATE_LIMIT');
  const large=buildOfflineCpuPrimitives(document([...line([-999999.9,-999999.9],[-999990,-999990]),...line([999999.9,999999.9],[999990,999990])]));
  assert.ok(large.maxFloatErrorMm<=0.05);
  reject(document(circle(0,0,1_000_000)),'DXF_SEGMENT_LIMIT');
  reject(document(Array.from({length:OFFLINE_LIMITS.segments+1},(_,i)=>line([i,0],[i+0.5,0])).flat()),'DXF_SEGMENT_LIMIT');
  reject(Buffer.from('bad\nLINE\n'),'DXF_GROUP_CODE');
  reject(pair(...header(),['0','SECTION'],['2','ENTITIES'],['0','EOF']),'DXF_SECTION');
  reject(Buffer.from('0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1018\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n\0\n0\nENDSEC\n0\nEOF\n'),'DXF_NUL');
  reject(Buffer.alloc(OFFLINE_LIMITS.sourceBytes+1),'DXF_BYTE_LIMIT');
  reject(Buffer.from('0\nEOF\n'.repeat(OFFLINE_LIMITS.pairs+1)),'DXF_PAIR_LIMIT');
});
test('offline DTO rejects production-style identity, false counts and corrupt vertices',()=>{
  const original=buildOfflineCpuPrimitives(document(line()));
  const mutate=(fn)=>{const v=clone(original);fn(v);assert.throws(()=>validateOfflineCpuPrimitives(v,original.source),OfflineCpuError);};
  mutate(v=>v.state='READY');mutate(v=>v.builder='node-cpu-line@1.0.0');mutate(v=>v.schema='cad-scene-1');
  mutate(v=>v.source.sha256='0'.repeat(64));mutate(v=>v.extra=true);
  mutate(v=>v.source.bytes++);
  mutate(v=>v.segmentCount=2);mutate(v=>v.primitiveCount=2);mutate(v=>v.primitives[0].id='p000002');
  mutate(v=>v.primitives[0].segments[0].pop());mutate(v=>v.primitives[0].segments[0][5]=1);
  mutate(v=>v.primitives[0].segments[0][4]=NaN);mutate(v=>v.primitives[0].segments[0][4]=0.1);
  mutate(v=>v.maxChordErrorMm=0.1);mutate(v=>v.maxFloatErrorMm=-1);
  mutate(v=>v.primitives[0].closed=true);
  mutate(v=>v.primitives[0].segments.push([...v.primitives[0].segments[0]]));
  const multi=buildOfflineCpuPrimitives(document(poly()));const late=clone(multi);
  late.primitives[0].segments.at(-1)[4]=NaN;
  assert.throws(()=>validateOfflineCpuPrimitives(late,multi.source),OfflineCpuError);
  const disconnected=clone(multi);disconnected.primitives[0].segments[1][0]=Math.fround(99);
  assert.throws(()=>validateOfflineCpuPrimitives(disconnected,multi.source),OfflineCpuError);
  const falseClosure=clone(multi);falseClosure.primitives[0].closed=true;
  assert.throws(()=>validateOfflineCpuPrimitives(falseClosure,multi.source),OfflineCpuError);
  const openReturning=clone(multi);openReturning.primitives[0].segments.at(-1)[3]=openReturning.primitives[0].segments[0][0];openReturning.primitives[0].segments.at(-1)[4]=openReturning.primitives[0].segments[0][1];
  assert.throws(()=>validateOfflineCpuPrimitives(openReturning,multi.source),OfflineCpuError);
  const curve=buildOfflineCpuPrimitives(document(circle()));const unclosed=clone(curve);
  unclosed.primitives[0].segments.at(-1)[3]=Math.fround(31);
  assert.throws(()=>validateOfflineCpuPrimitives(unclosed,curve.source),OfflineCpuError);
  const singleCircle=clone(curve);singleCircle.primitives[0].segments=singleCircle.primitives[0].segments.slice(0,1);singleCircle.segmentCount=1;
  assert.throws(()=>validateOfflineCpuPrimitives(singleCircle,curve.source),OfflineCpuError);
  const arcPacket=buildOfflineCpuPrimitives(document(arc()));const brokenArc=clone(arcPacket);
  brokenArc.primitives[0].segments[1][0]=Math.fround(999);
  assert.throws(()=>validateOfflineCpuPrimitives(brokenArc,arcPacket.source),OfflineCpuError);
});
test('private exclusive tempfile is fsynced, fully read back and removed',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fup2-'),{encoding:'utf8'});await chmod(dir,0o700);const alias=`${dir}-link`;
  try{
    const x=await saveAndReadbackOfflineCpuPrimitives(document(line()),dir);assert.match(x.sha256,/^[a-f0-9]{64}$/);assert.equal(x.envelope.state,'CANDIDATE');assert.deepEqual(await readdir(dir),[]);
    await symlink(dir,alias);
    await assert.rejects(saveAndReadbackOfflineCpuPrimitives(document(line()),alias),e=>e instanceof OfflineCpuError&&e.code==='PRIVATE_DIR');
    await chmod(dir,0o755);
    await assert.rejects(saveAndReadbackOfflineCpuPrimitives(document(line()),dir),e=>e instanceof OfflineCpuError&&e.code==='PRIVATE_DIR');
  }finally{await rm(alias,{force:true});await rm(dir,{recursive:true,force:true});}
});
test('cooperative 15 second deadline fails with bounded code and restores clock',()=>{
  const original=Date.now;let calls=0;
  try{
    Date.now=()=>++calls===1?0:15_001;
    reject(document(line()),'DXF_TIME_LIMIT');
  }finally{Date.now=original;}
  assert.equal(Date.now,original);
});
