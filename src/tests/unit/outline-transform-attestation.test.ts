import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {CadError} from '../../domain/cad';
import {
  attestOutlineDraftAgainstImmutableDxf,
} from '../../server/outline/attestation';
import {
  attestTransformedOutlineDraftAgainstImmutableDxf,OUTLINE_TRANSFORM_STEP_LIMIT,
} from '../../server/outline/transform-attestation';
import {
  applyAffine,composeAffine,IDENTITY_2D,type Affine2D,
} from '../../domain/generated-document';
import {parseDxfOutlineIndex} from '../../viewers/core/outline-geometry';
import {computeOutline,type GeoJSONOutline} from '../../viewers/core/outline-compute';

const versionId='11111111-1111-4111-8111-111111111111';
type Row={id:string;result:Record<string,unknown>;
  outlineTypeId?:string|null;outlineTypeName?:string|null;name?:string|null};
type Draft={
  schemaVersion:1|2;versionId:string;sourceSha256:string;
  coordinateSystem:'DXF_WCS_XY';unitCode:number|null;
  persistence:'BROWSER_EXPORT_ONLY';outlines:Row[];
};
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const dxfPoly=(handle:string,x:number,y:number,size:number):string[]=>[
  '0','LWPOLYLINE','5',handle,'8','0','90','4','70','1',
  '10',String(x),'20',String(y),
  '10',String(x+size),'20',String(y),
  '10',String(x+size),'20',String(y+size),
  '10',String(x),'20',String(y+size),
];
function dxf(entities:string[],blocks:string[]=[]):Uint8Array{
 const words=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC'];
 if(blocks.length)words.push('0','SECTION','2','BLOCKS',...blocks,'0','ENDSEC');
 words.push('0','SECTION','2','ENTITIES',...entities,'0','ENDSEC','0','EOF','');
 return new TextEncoder().encode(words.join('\n'));
}
function fixture(kind:'CONVEX'|'PRECISE'='PRECISE',multi=false){
 const bytes=dxf(multi?[
   ...dxfPoly('1A',0,0,10),...dxfPoly('1B',2,2,3),...dxfPoly('1C',20,20,5),
 ]:dxfPoly('1A',0,0,10));
 const hash=sha(bytes);
 const source=parseDxfOutlineIndex(new TextDecoder().decode(bytes),versionId,hash);
 const original=computeOutline(kind,source.entities);
 const input:Draft={schemaVersion:1,versionId,sourceSha256:hash,
   coordinateSystem:'DXF_WCS_XY',unitCode:4,persistence:'BROWSER_EXPORT_ONLY',
   outlines:[{id:'local-1',result:{...original}}]};
 return {bytes,hash,input};
}
function expectedError(fn:()=>unknown,code:string) {
 try {fn();throw new Error('expected rejection, got success');}
 catch (e) {
   expect(e).toBeInstanceOf(CadError);
   expect((e as CadError).code).toBe(code);
 }
}
type Step={type:'Translate';dx:number;dy:number} |
  {type:'Rotate';angleDegrees:number;pivot:[number,number]};
function matrixFor(operations:readonly Step[]):Affine2D {
 let matrix:Affine2D=IDENTITY_2D;
 for(const op of operations){
   let left:Affine2D;
   if(op.type==='Translate')left=[1,0,0,1,op.dx,op.dy];
   else {
     const rad=op.angleDegrees*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
     const [px,py]=op.pivot;
     left=[c,s,-s,c,px-px*c+py*s,py-px*s-py*c];
   }
   matrix=composeAffine(left,matrix);
 }
 return matrix;
}
function edited(input:Draft,operations:Step[]):Draft {
 const output=structuredClone(input);
 const result=output.outlines[0].result;
 const base=structuredClone(result.geometry) as GeoJSONOutline;
 const matrix=matrixFor(operations);
 result.baseGeometry=base;
 result.transformOperations=operations;
 result.transform=[...matrix];
 result.geometry=applyAffine(base,matrix);
 return output;
}
function attest(f:ReturnType<typeof fixture>,input:Draft=f.input){
 return attestTransformedOutlineDraftAgainstImmutableDxf(input,versionId,f.hash,f.bytes);
}
function withDifferentSource(f:ReturnType<typeof fixture>,bytes:Uint8Array):ReturnType<typeof fixture>{
 const hash=sha(bytes),input=structuredClone(f.input);
 input.sourceSha256=hash;
 input.outlines[0].result.sourceEntityIds=
   (input.outlines[0].result.sourceEntityIds as string[]).map(id=>id.replace(f.hash,hash));
 return {bytes,hash,input};
}

describe('Issue #97 D2 source trust boundary and legacy JSON',()=>{
 it('TC-P4-D2-001: unchanged canonical JSON v1 and typed v2 stay compatible',()=>{
   const f=fixture();
   const before=attestOutlineDraftAgainstImmutableDxf(f.input,versionId,f.hash,f.bytes);
   const old=attest(f);
   expect(old.schemaVersion).toBe(1);
   expect(old.outlines[0].baseGeometry).toEqual(before.outlines[0].geometry);
   expect(old.outlines[0].effectiveGeometry).toEqual(old.outlines[0].baseGeometry);
   expect(old.outlines[0].transform).toEqual([1,0,0,1,0,0]);
   const typed:Draft={...structuredClone(f.input),schemaVersion:2};
   Object.assign(typed.outlines[0],{
     outlineTypeId:null,outlineTypeName:null,name:null,
   });
   expect(attest(f,typed).schemaVersion).toBe(2);
   expect(f.input.outlines[0].result).not.toHaveProperty('baseGeometry');
 });
 it('TC-P4-D2-002: unique root INSERT WCS XY, handle and explicit empty instancePath',()=>{
   const bytes=dxf([
     '0','INSERT','5','1A','8','0','2','RECT',
     '10','30','20','40','41','1','42','1','50','90',
   ],['0','BLOCK','2','RECT','10','0','20','0',
     ...dxfPoly('BB',0,0,10),'0','ENDBLK']);
   const hash=sha(bytes);
   const source=parseDxfOutlineIndex(new TextDecoder().decode(bytes),versionId,hash);
   expect(source.entities).toHaveLength(1);
   expect(source.entities[0].stable).toBe(true);
   expect(source.entities[0].entityType).toBe('INSERT');
   expect(source.entities[0].instancePath).toEqual([]);
   const original=computeOutline('CONVEX',source.entities);
   const input:Draft={schemaVersion:1,versionId,sourceSha256:hash,
     coordinateSystem:'DXF_WCS_XY',unitCode:4,persistence:'BROWSER_EXPORT_ONLY',
     outlines:[{id:'local-1',result:{...original,sourceEntityRefs:[{
       versionId,sourceSha256:hash,handle:'1A',instancePath:[],
     }]}}]};
   const value=attestTransformedOutlineDraftAgainstImmutableDxf(input,versionId,hash,bytes);
   expect(value.outlines[0].sourceEntityIds).toEqual([versionId+':'+hash+':1A']);
   expect(value.outlines[0].effectiveGeometry.type).toBe('Polygon');
   const forged=structuredClone(input);
   (forged.outlines[0].result.sourceEntityRefs as Array<{instancePath:string[]}>)[0].instancePath=['BB'];
   expectedError(()=>attestTransformedOutlineDraftAgainstImmutableDxf(forged,versionId,hash,bytes),
     'OUTLINE_INSTANCE_PATH_UNSUPPORTED');
   const badHandle=structuredClone(input);
   (badHandle.outlines[0].result.sourceEntityRefs as Array<{handle:string}>)[0].handle='1B';
   expectedError(()=>attestTransformedOutlineDraftAgainstImmutableDxf(badHandle,versionId,hash,bytes),
     'OUTLINE_SOURCE_REF_INVALID');
 });
 it('TC-P4-D2-003: SHA/version/INSUNITS/tolerance spoof and duplicate handle fail closed',()=>{
   const f=fixture();
   const corrupted=f.bytes.slice();
   corrupted[corrupted.length-4]^=1;
   expectedError(()=>attestTransformedOutlineDraftAgainstImmutableDxf(
     f.input,versionId,f.hash,corrupted),'OUTLINE_SOURCE_CHANGED');
   const version=structuredClone(f.input);
   version.versionId='22222222-2222-4222-8222-222222222222';
   expectedError(()=>attest(f,version),'OUTLINE_INVALID_EXPORT');
   const units=structuredClone(f.input);
   units.unitCode=1;
   expectedError(()=>attest(f,units),'OUTLINE_UNITS_MISMATCH');
   const tol=structuredClone(f.input);
   tol.outlines[0].result.tolerance=0.2;
   expectedError(()=>attest(f,tol),'OUTLINE_TOLERANCE_UNSUPPORTED');
   const duplicate=withDifferentSource(f,dxf([
     ...dxfPoly('1A',0,0,10),...dxfPoly('1A',30,0,10),
   ]));
   expectedError(()=>attest(duplicate),'OUTLINE_UNKNOWN_ENTITY');
   const missing=structuredClone(f.input);
   missing.outlines[0].result.sourceEntityIds=[versionId+':'+f.hash+':9FF'];
   expectedError(()=>attest(f,missing),'OUTLINE_UNKNOWN_ENTITY');
 });
 it('TC-P4-D2-004: unsupported OCS and partially unsupported BLOCK cannot be persisted',()=>{
   const f=fixture();
   const ocs=withDifferentSource(f,dxf([...dxfPoly('1A',0,0,10),
     '210','0','220','1','230','0']));
   expectedError(()=>attest(ocs),'OUTLINE_UNKNOWN_ENTITY');
   const bytes=dxf(['0','INSERT','5','1A','2','RECT','10','0','20','0'],
     ['0','BLOCK','2','RECT','10','0','20','0',...dxfPoly('BB',0,0,10),
       '0','SPLINE','5','CD','8','0','0','ENDBLK']);
   const broken=withDifferentSource(f,bytes);
   expectedError(()=>attest(broken),'OUTLINE_UNKNOWN_ENTITY');
 });
});

describe('Issue #97 D2 rigid composition, geometry integrity and hostile input',()=>{
 it('TC-P4-D2-005: Translate then Rotate around pivot matches independent browser GeneratedDocument',()=>{
   const f=fixture();
   const steps:Step[]=[
     {type:'Translate',dx:3,dy:-5},
     {type:'Rotate',angleDegrees:90,pivot:[10,20]},
   ];
   const input=edited(f.input,steps);
   const verified=attest(f,input).outlines[0];
   const clientResult=input.outlines[0].result;
   expect(verified.transform).toEqual(clientResult.transform);
   expect(verified.effectiveGeometry).toEqual(clientResult.geometry);
   expect(verified.baseGeometry).toEqual(f.input.outlines[0].result.geometry);
   expect(verified.algorithmVersion).toBe('polygon-clipping-union-v1');
   // Server returns freshly recomputed objects and never the client's references.
   expect(verified.effectiveGeometry).not.toBe(clientResult.geometry);
   expect(verified.tolerance).toBe(0.02);
 });
 it('TC-P4-D2-006: PRECISE MultiPolygon with hole retains rings, areas and CCW orientation',()=>{
   const f=fixture('PRECISE',true);
   const input=edited(f.input,[
     {type:'Rotate',angleDegrees:-90,pivot:[10,10]},
     {type:'Translate',dx:4,dy:5},
   ]);
   const result=attest(f,input).outlines[0];
   expect(result.baseGeometry.type).toBe('MultiPolygon');
   if(result.baseGeometry.type!=='MultiPolygon' || result.effectiveGeometry.type!=='MultiPolygon')
     throw new Error('Expected multipolygon');
   expect(result.baseGeometry.coordinates.some(p=>p.length===2)).toBe(true);
   expect(result.effectiveGeometry.coordinates.map(p=>p.map(r=>r.length)))
     .toEqual(result.baseGeometry.coordinates.map(p=>p.map(r=>r.length)));
   expect(result.effectiveGeometry).toEqual(input.outlines[0].result.geometry);
 });
 it('TC-P4-D2-007: raw/scale/shear/mirror/Z matrices and unrecognized operations are rejected',()=>{
   const f=fixture();
   const raw=structuredClone(f.input);
   raw.outlines[0].result.transform=[1,0,0,1,5,0];
   expectedError(()=>attest(f,raw),'OUTLINE_TRANSFORM_UNSUPPORTED');
   for(const invalid of [[2,0,0,1,0,0],[1,0,0.2,1,0,0],[-1,0,0,1,0,0]]){
     const trial=edited(f.input,[{type:'Translate',dx:3,dy:0}]);
     trial.outlines[0].result.transform=invalid;
     expectedError(()=>attest(f,trial),'OUTLINE_AFFINE_UNSUPPORTED');
   }
   const missing=edited(f.input,[{type:'Translate',dx:1,dy:2}]);
   delete missing.outlines[0].result.baseGeometry;
   expectedError(()=>attest(f,missing),'OUTLINE_BASE_REQUIRED');
   const z=edited(f.input,[{type:'Translate',dx:1,dy:2}]);
   z.outlines[0].result.transformOperations=[{type:'Translate',dx:1,dy:2,dz:1}];
   expectedError(()=>attest(f,z),'OUTLINE_TRANSFORM_INVALID');
   const unknown=edited(f.input,[{type:'Translate',dx:1,dy:2}]);
   unknown.outlines[0].result.transformOperations=[{type:'Scale',value:1}];
   expectedError(()=>attest(f,unknown),'OUTLINE_TRANSFORM_UNSUPPORTED');
   const matrix=edited(f.input,[{type:'Translate',dx:1,dy:2}]);
   matrix.outlines[0].result.transform=[1,0,0,1,5,2];
   expectedError(()=>attest(f,matrix),'OUTLINE_AFFINE_MISMATCH');
   const extra=structuredClone(f.input);
   extra.outlines[0].result.effectiveGeometry={type:'Point',coordinates:[1,2]};
   expectedError(()=>attest(f,extra),'OUTLINE_TRANSFORM_UNSUPPORTED');
 });
 it('TC-P4-D2-008: tampered base/effective, nonfinite and excessive transformations fail',()=>{
   const f=fixture();
   const steps:Step[]=[{type:'Translate',dx:3,dy:-5}];
   const baseChanged=edited(f.input,steps);
   const base=baseChanged.outlines[0].result.baseGeometry as GeoJSONOutline;
   if(base.type!=='Polygon')throw new Error('expected polygon');
   base.coordinates[0][0][0]+=1;
   base.coordinates[0][base.coordinates[0].length-1][0]+=1;
   expectedError(()=>attest(f,baseChanged),'OUTLINE_GEOMETRY_MISMATCH');
   const editedChanged=edited(f.input,steps);
   const geo=editedChanged.outlines[0].result.geometry as GeoJSONOutline;
   if(geo.type!=='Polygon')throw new Error('expected polygon');
   geo.coordinates[0][0][0]+=0.5;
   geo.coordinates[0][geo.coordinates[0].length-1][0]+=0.5;
   expectedError(()=>attest(f,editedChanged),'OUTLINE_GEOMETRY_MISMATCH');
   const nonfinite=edited(f.input,steps);
   nonfinite.outlines[0].result.transformOperations=[{type:'Rotate',angleDegrees:Infinity,pivot:[0,0]}];
   expectedError(()=>attest(f,nonfinite),'OUTLINE_TRANSFORM_INVALID');
   const big=edited(f.input,steps);
   big.outlines[0].result.transformOperations=
     Array.from({length:OUTLINE_TRANSFORM_STEP_LIMIT+1},()=>({type:'Translate',dx:0,dy:0}));
   expectedError(()=>attest(f,big),'OUTLINE_TRANSFORM_INVALID');
   // Construct the hostile claim without applying it through the browser
   // helper: the client would reject the overflow before serializing it.
   const beyond=edited(f.input,steps);
   beyond.outlines[0].result.transformOperations=[{type:'Translate',dx:1e12,dy:0}];
   expectedError(()=>attest(f,beyond),'OUTLINE_TRANSFORM_RANGE');
   const unnatural=edited(f.input,steps);
   unnatural.outlines[0].result.tolerance=1000;
   expectedError(()=>attest(f,unnatural),'OUTLINE_TOLERANCE_UNSUPPORTED');
 });
 it('TC-P4-D2-009: far-origin valid CONVEX geometry and WCS overflow bounds',()=>{
   const x=1e9,bytes=dxf(dxfPoly('1A',x,x,10)),hash=sha(bytes);
   const source=parseDxfOutlineIndex(new TextDecoder().decode(bytes),versionId,hash);
   const shape=computeOutline('CONVEX',source.entities);
   const input:Draft={schemaVersion:1,versionId,sourceSha256:hash,
     unitCode:4,coordinateSystem:'DXF_WCS_XY',persistence:'BROWSER_EXPORT_ONLY',
     outlines:[{id:'local-1',result:{...shape}}]};
   const sourceFixture={bytes,hash,input};
   expect(attest(sourceFixture).outlines[0].baseGeometry).toEqual(shape.geometry);
   const moved=edited(input,[{type:'Rotate',angleDegrees:90,pivot:[x,x]}]);
   expect(attest(sourceFixture,moved).outlines[0].effectiveGeometry)
     .toEqual(moved.outlines[0].result.geometry);
 });
});
