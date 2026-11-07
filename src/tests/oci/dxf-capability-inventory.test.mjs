import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inventoryDxf,LIMITS} from './dxf-capability-inventory.mjs';

const pairs=(...rows)=>Buffer.from(rows.map(([c,v])=>`${c}\n${v}\n`).join(''));
const head=[['0','SECTION'],['2','HEADER'],['9','$ACADVER'],['1','AC1018'],['9','$DWGCODEPAGE'],['3','UTF-8'],['9','$INSUNITS'],['70','4'],['0','ENDSEC']];
const entity=[['0','SECTION'],['2','ENTITIES'],['0','LINE'],['8','Layer A'],['10','0'],['20','1'],['11','2'],['21','3'],['0','ENDSEC']];
const good=()=>pairs(...head,...entity,['0','EOF']);
function reject(bytes,code,limit){assert.throws(()=>inventoryDxf(bytes,limit),e=>e.code===code);}

test('strict synthetic LINE inventory has bound source, no raw layer, and no READY',()=>{
  const result=inventoryDxf(good());
  assert.equal(result.structure.entityCount,1);
  assert.equal(result.structure.bySection.ENTITIES.count,1);
  assert.equal(result.structure.bySection.BLOCKS.count,0);
  assert.equal(result.entityTypes.LINE,1);
  assert.equal(result.declarations.encoding,'UTF8_DECLARED');
  assert.equal(result.support,'INVENTORY_ONLY');
  assert.equal(JSON.stringify(result).includes('Layer A'),false);
  assert.match(result.source.sha256,/^[a-f0-9]{64}$/);
});
test('truncated, odd, missing EOF and trailing content fail closed',()=>{
  reject(Buffer.from('0\nSECTION\n2\n'),'ODD_GROUP_PAIR');
  reject(Buffer.from('0\nSECTION\n2'),'ODD_GROUP_PAIR');
  reject(pairs(...head,...entity),'MISSING_EOF');
  reject(Buffer.concat([good(),pairs(['0','LINE'])]),'AFTER_EOF');
});
test('duplicate section, invalid code, binary and encoding conflict fail',()=>{
  reject(pairs(...head,...head,['0','EOF']),'DUPLICATE_SECTION');
  reject(Buffer.from('bad\nSECTION\n'),'INVALID_GROUP_CODE');
  reject(Buffer.from('AutoCAD Binary DXF\r\n\x1a\0'),'BINARY_DXF');
  reject(pairs(...head.slice(0,7),['9','$DWGCODEPAGE'],['3','ANSI_1252'],...head.slice(7),...entity,['0','EOF']),'ENCODING_OR_HEADER_CONFLICT');
  const invalid=Buffer.concat([pairs(...head,...entity.slice(0,-1)),Buffer.from('1\n'),Buffer.from([0xff,10]),pairs(['0','ENDSEC'],['0','EOF'])]);
  reject(invalid,'ENCODING_CONFLICT');
});
test('resource caps and unknown type do not leak raw names',()=>{
  reject(good(),'BYTE_LIMIT',{...LIMITS,bytes:10});
  reject(good(),'PAIR_LIMIT',{...LIMITS,pairs:2});
  reject(good(),'LINE_LIMIT',{...LIMITS,lineBytes:2});
  const source=pairs(...head,['0','SECTION'],['2','ENTITIES'],['0','SECRET_CUSTOM_ENTITY'],['1','private CAD text'],['0','ENDSEC'],['0','EOF']);
  const result=inventoryDxf(source);
  assert.equal(result.entityTypes.OTHER,1);
  assert.equal(result.flags.unknownEntity,true);
  assert.equal(JSON.stringify(result).includes('SECRET_CUSTOM_ENTITY'),false);
  assert.equal(JSON.stringify(result).includes('private CAD text'),false);
});
test('block nesting and text features are counted without names',()=>{
  const b=pairs(...head,['0','SECTION'],['2','BLOCKS'],['0','BLOCK'],['2','BLOCK_A'],['0','INSERT'],['2','BLOCK_B'],['0','ENDBLK'],['0','BLOCK'],['2','BLOCK_B'],['0','TEXT'],['1','private text'],['7','STYLE_A'],['30','4'],['210','0'],['0','ENDBLK'],['0','ENDSEC'],...entity,['0','EOF']);
  const x=inventoryDxf(b);
  assert.equal(x.structure.blockCount,2);
  assert.equal(x.structure.bySection.BLOCKS.count,2);
  assert.equal(x.structure.bySection.ENTITIES.count,1);
  assert.equal(x.structure.maxBlockDepth,2);
  assert.equal(x.flags.text,true);
  assert.equal(x.flags.zCoordinate,true);
  assert.equal(x.flags.extrusion,true);
  assert.equal(JSON.stringify(x).includes('BLOCK_A'),false);
});
test('duplicate and unclosed BLOCK definitions fail closed',()=>{
  const block=[['0','BLOCK'],['2','SAME'],['0','ENDBLK']];
  reject(pairs(...head,['0','SECTION'],['2','BLOCKS'],...block,...block,['0','ENDSEC'],['0','EOF']),'DUPLICATE_BLOCK');
  reject(pairs(...head,['0','SECTION'],['2','BLOCKS'],['0','BLOCK'],['2','OPEN'],['0','ENDSEC'],['0','EOF']),'UNCLOSED_BLOCK');
});
test('finite entity and codepage vocabularies hide unknown identifiers',()=>{
  const source=pairs(['0','SECTION'],['2','HEADER'],['9','$DWGCODEPAGE'],['3','SECRET_CODEPAGE'],['0','ENDSEC'],['0','SECTION'],['2','ENTITIES'],['0','VIEWPORT'],['0','SECRET_ENTITY'],['0','ENDSEC'],['0','EOF']);
  const x=inventoryDxf(source);const serialized=JSON.stringify(x);
  assert.equal(x.declarations.codepage,null);
  assert.equal(x.declarations.encoding,'UNSUPPORTED_DECLARATION');
  assert.equal(x.structure.bySection.ENTITIES.types.VIEWPORT,1);
  assert.equal(x.structure.bySection.ENTITIES.types.OTHER,1);
  assert.equal(serialized.includes('SECRET_'),false);
});
test('inherited object property names remain unknown closed-vocabulary entities',()=>{
  const source=pairs(...head,['0','SECTION'],['2','ENTITIES'],['0','constructor'],['0','toString'],['0','__proto__'],['0','ENDSEC'],['0','EOF']);
  const x=inventoryDxf(source);const serialized=JSON.stringify(x);
  assert.equal(x.entityTypes.OTHER,3);
  assert.equal(x.entityCategories.UNKNOWN,3);
  assert.equal(x.flags.unknownEntity,true);
  for(const name of ['constructor','toString','__proto__'])assert.equal(serialized.includes(name),false);
});
test('wall deadline is checked during block graph traversal',()=>{
  const source=pairs(...head,['0','SECTION'],['2','BLOCKS'],['0','BLOCK'],['2','B'],['0','ENDBLK'],['0','ENDSEC'],['0','EOF']);
  const pairCount=source.toString().trimEnd().split('\n').length/2;
  const original=Date.now;let calls=0;
  try{
    Date.now=()=>++calls>pairCount+1?100:0;
    reject(source,'TIME_LIMIT',{...LIMITS,wallMs:50});
    assert.ok(calls>pairCount+1);
  }finally{Date.now=original;}
});
test('memoized shared subtree still enforces total path depth',()=>{
  const block=(name,refs)=>[['0','BLOCK'],['2',name],...refs.flatMap(ref=>[['0','INSERT'],['2',ref]]),['0','ENDBLK']];
  const source=pairs(...head,['0','SECTION'],['2','BLOCKS'],...block('A',['X']),...block('X',['Y']),...block('Y',['Z']),...block('Z',[]),...block('B',['C']),...block('C',['X']),['0','ENDSEC'],['0','EOF']);
  assert.equal(inventoryDxf(source).structure.maxBlockDepth,5);
  reject(source,'BLOCK_DEPTH_LIMIT',{...LIMITS,depth:4});
});
