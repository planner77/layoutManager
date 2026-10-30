import {createHash,randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {GeneratedDocument,generatedResult} from '../../domain/generated-document';
import {buildServerSourceOutlineExport} from '../../domain/outline-draft';
import {parseDxfOutlineIndex} from '../../viewers/core/outline-geometry';
import {computeOutline} from '../../viewers/core/outline-compute';
import {attestTransformedOutlineDraftAgainstImmutableDxf} from '../../server/outline/transform-attestation';
import type {GeneratedOutlineObject,SavedOutline} from '../../viewers/core/adapter';

const versionId='11111111-1111-4111-8111-111111111111';
const dxf=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES','0','LWPOLYLINE','5','1A','8','0','90','4','70','1',
  '10','0','20','0','10','10','20','0','10','10','20','10','10','0','20','10',
  '0','ENDSEC','0','EOF',''].join('\n');
const bytes=new TextEncoder().encode(dxf);
const sourceSha256=createHash('sha256').update(bytes).digest('hex');
function doc(){
 const index=parseDxfOutlineIndex(dxf,versionId,sourceSha256);
 const generated=new GeneratedDocument({versionId,sourceSha256});
 const result=computeOutline('CONVEX',index.entities);
 const first=generated.append({id:randomUUID(),savedOutlineId:'local-1',
   createdAt:'2026-10-30T00:00:00.000Z',result});
 return {generated,ref:first.ref};
}
function sourceDraft(generated:GeneratedDocument){
 const row=generated.getObjects()[0];
 const saved:SavedOutline={id:row.savedOutlineId,createdAt:row.createdAt,result:generatedResult(row)};
 const g:GeneratedOutlineObject={
   ref:row.ref,savedOutlineId:row.savedOutlineId,visible:row.visible,
   geometry:generatedResult(row).geometry,baseGeometry:row.baseGeometry,
   transform:row.transform,transformOperations:row.transformOperations,
   edited:row.edited,dirty:row.dirty,
   sourceEntityIds:[...row.baseResult.sourceEntityIds],kind:row.kind,
   name:row.name,outlineTypeId:row.outlineTypeId,
 };
 return buildServerSourceOutlineExport(versionId,sourceSha256,4,saved,g);
}
describe('#98 review P2: persist immutable source outline with exact operations',()=>{
 it('source translate+rotate->serialized v1->server D2 attestation; Undo/Redo preserve operations',()=>{
   const {generated,ref}=doc();
   const before=generated.getObjects()[0].baseGeometry;
   generated.execute({type:'Translate',ids:[ref.id],dx:3,dy:-5},[ref]);
   generated.execute({type:'Rotate',ids:[ref.id],angleDegrees:90,pivot:[0,0]},[ref]);
   expect(generated.getObjects()[0].transformOperations.map(op=>op.type)).toEqual(['Translate','Rotate']);
   const draft=sourceDraft(generated);
   expect(draft.schemaVersion).toBe(1);
   expect(draft.outlines[0].result.baseGeometry).toEqual(before);
   expect(draft.outlines[0].result.transformOperations).toHaveLength(2);
   const server=attestTransformedOutlineDraftAgainstImmutableDxf(draft,versionId,sourceSha256,bytes);
   expect(server.outlines[0].effectiveGeometry).toEqual(generatedResult(generated.getObjects()[0]).geometry);
   expect(generated.undo()).toBe(true);
   expect(generated.getObjects()[0].transformOperations).toHaveLength(1);
   expect(generated.redo()).toBe(true);
   expect(generated.getObjects()[0].transformOperations).toHaveLength(2);
   expect(generated.getObjects()[0].baseGeometry).toBe(before);
 });
 it('edited original without operations cannot be represented by a raw affine',()=>{
   const {generated,ref}=doc();
   generated.execute({type:'Translate',ids:[ref.id],dx:1,dy:2},[ref]);
   const row=generated.getObjects()[0];
   expect(()=>buildServerSourceOutlineExport(versionId,sourceSha256,4,
    {id:row.savedOutlineId,createdAt:row.createdAt,result:generatedResult(row)},
    {ref:row.ref,savedOutlineId:row.savedOutlineId,visible:row.visible,
     geometry:generatedResult(row).geometry,baseGeometry:row.baseGeometry,transform:row.transform,
     edited:true,dirty:true,sourceEntityIds:[...row.baseResult.sourceEntityIds],
     kind:row.kind,name:row.name,outlineTypeId:row.outlineTypeId})).toThrow('편집 이력');
   const draft=sourceDraft(generated);
   const forged=structuredClone(draft);
   forged.outlines[0].result.transformOperations=[{type:'Translate',dx:999,dy:999}];
   expect(()=>attestTransformedOutlineDraftAgainstImmutableDxf(forged,versionId,sourceSha256,bytes)).toThrow();
 });
});
