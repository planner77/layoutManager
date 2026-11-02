import { expect, test } from 'vitest';
import { buildStoredAppExport, buildStoredSourceExport } from '../../domain/stored-outline-export';
import { parseGeneratedTransfer } from '../../domain/generated-transfer';
import { GeneratedDocument, applyAffine } from '../../domain/generated-document';
import type { StoredOutlineDto } from '../../domain/typed-outline';

const versionId='11111111-1111-4111-8111-111111111111',sourceSha256='a'.repeat(64);
const id='22222222-2222-4222-8222-222222222222',typeId='33333333-3333-4333-8333-333333333333';
const context={versionId,sourceSha256,unitCode:4};
function row(mode:'APP_CREATED'|'SOURCE_CANONICAL'='APP_CREATED'):StoredOutlineDto{
  const geometry={type:'Polygon' as const,coordinates:[[[0,0],[10,0],[10,10],[0,0]] as [number,number][]]};
  return {id,versionId,sourceSha256,sceneRevision:0,origin:'APP_CREATED',validationMode:mode,kind:'CONVEX',
    name:'구역 이름',geometry,baseGeometry:geometry,sourceRefs:mode==='SOURCE_CANONICAL'?[versionId+':'+sourceSha256+':1A']:[],
    derivedFrom:[],operations:[],outlineTypeId:typeId,
    outlineType:{id:typeId,name:'변경된 타입',active:false,sortOrder:0,revision:4},
    revision:2,createdById:id,updatedById:id,createdAt:'2026-11-01T00:00:00.000Z',updatedAt:'2026-11-01T00:00:00.000Z'};
}
test('marked APP snapshot roundtrips current geometry/type/name with fresh browser UUID on every import',()=>{
  const source=row(),value=buildStoredAppExport([source],context,new Set([id]));
  expect(value.objects[0].id).not.toBe(id);
  const first=parseGeneratedTransfer(value,context,4),second=parseGeneratedTransfer(value,context,4);
  expect(first.entries[0]).toMatchObject({name:source.name,outlineTypeId:typeId,outlineTypeName:'변경된 타입',visible:false});
  expect(first.entries[0].id).not.toBe(value.objects[0].id);
  expect(first.entries[0].id).not.toBe(second.entries[0].id);
  expect(first.entries[0]).not.toHaveProperty('serverOutlineId');
  const document=new GeneratedDocument(context);document.replaceFromImport(first.entries);
  expect(document.getObjects()[0].baseGeometry).toEqual(source.geometry);
});
test('source-v2 keeps null triples compatible while restoring the unclassified server instance name',()=>{
  const source={...row('SOURCE_CANONICAL'),outlineTypeId:null,outlineType:null};
  const value=buildStoredSourceExport([source],context);
  expect(value.outlines[0]).toMatchObject({id:'local-1',serverOutlineId:id,serverInstanceName:source.name,
    outlineTypeId:null,outlineTypeName:null,name:null});
  const restored=parseGeneratedTransfer(value,context,4);
  expect(restored.legacy).toBe(true);expect(restored.entries[0].name).toBe(source.name);
  expect(restored.entries[0].id).not.toBe(id);
});
test('typed source-v2 uses the current referenced type label and never adopts the server UUID',()=>{
  const value=buildStoredSourceExport([row('SOURCE_CANONICAL')],context);
  const parsed=parseGeneratedTransfer(value,context,4);
  expect(parsed.entries[0]).toMatchObject({name:'구역 이름',outlineTypeId:typeId,outlineTypeName:'변경된 타입'});
  expect(parsed.entries[0]).not.toHaveProperty('serverInstanceName');
  expect(parsed.entries[0].id).not.toBe(id);
});
test('unmarked native Generated-v2 retains its UUID compatibility contract',()=>{
  const marked=buildStoredAppExport([row()],context);
  const {exportSource,...native}=marked;void exportSource;
  const {serverOutlineId,...object}=native.objects[0];void serverOutlineId;
  const parsed=parseGeneratedTransfer({...native,objects:[object]},context,4);
  expect(parsed.entries[0].id).toBe(object.id);
});
test('marked Source snapshots reject corrupt base geometry, unknown operations and inconsistent effective coordinates',()=>{
  const source=row('SOURCE_CANONICAL'),value=buildStoredSourceExport([source],context);
  const corrupt=structuredClone(value);corrupt.outlines[0].result.baseGeometry.coordinates[0][0]=[NaN,0];
  const unknown={...value,outlines:value.outlines.map(item=>({...item,result:{...item.result,
    transformOperations:[{type:'Bogus',angleDegrees:0,pivot:[0,0]}]}}))};
  const inconsistent={...value,outlines:value.outlines.map(item=>({...item,result:{...item.result,
    transformOperations:[{type:'Translate',dx:5,dy:2}]}}))};
  for(const invalid of [corrupt,unknown,inconsistent])expect(()=>parseGeneratedTransfer(invalid,context,4)).toThrow();
});
test('marked Source snapshots retain valid transformed WCS geometry as an independent browser restore',()=>{
  const source=row('SOURCE_CANONICAL');
  const changed={...source,geometry:applyAffine(source.baseGeometry,[1,0,0,1,5,2]),
    operations:[{type:'Translate' as const,dx:5,dy:2}]};
  const value=buildStoredSourceExport([changed],context);
  expect(parseGeneratedTransfer(value,context,4).entries[0].baseResult.geometry).toEqual(changed.geometry);
});
test('unknown/unmarked server claims, extra receipt state, duplicate UUID and tampered geometry fail atomically',()=>{
  const value=buildStoredAppExport([row()],context);
  const document=new GeneratedDocument(context);
  document.replaceFromImport(parseGeneratedTransfer(value,context,4).entries);
  const before=document.getObjects(),history=document.history();
  const unknown={...value,exportSource:'TRUST_ME'};
  const unmarked={...value};delete (unmarked as Partial<typeof value>).exportSource;
  const receipt={...value,receipt:{key:'not-authority'}};
  const nested=structuredClone(value) as typeof value&{objects:Array<{provenance:Record<string,unknown>}>};
  nested.objects[0].provenance.receipt='not-authority';
  const duplicate={...value,objects:[value.objects[0],{...value.objects[0],id:'44444444-4444-4444-8444-444444444444',savedOutlineId:'local-2'}]};
  const tampered=structuredClone(value);tampered.objects[0].editedGeometry.coordinates[0][0]=[7,7];
  for(const invalid of [unknown,unmarked,receipt,nested,duplicate,tampered])
    expect(()=>document.replaceFromImport(parseGeneratedTransfer(invalid,context,4).entries)).toThrow();
  expect(document.getObjects()).toEqual(before);expect(document.history()).toEqual(history);
});
