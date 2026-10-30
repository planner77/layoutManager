import {describe,expect,it} from 'vitest';
import {GeneratedDocument,generatedResult,type GeneratedEntry} from '../../domain/generated-document';
import {sceneScope,createSceneRef,importedId} from '../../domain/cad-scene';
import {SceneWorkDocument} from '../../domain/scene-work';
import {MemoSession} from '../../domain/cad-memo';
import type {OutlineResult} from '../../viewers/core/outline-compute';
import {MemoSessionSnapStore,nearestMemoSnap,type MemoSnapTarget} from '../../domain/memo-session-snap';
import {readFileSync} from 'node:fs';

const scope={versionId:'123e4567-e89b-42d3-a456-426614174000',sourceSha256:'f'.repeat(64)};
const memoId='123e4567-e89b-42d3-a456-426614174019';
const outlineId='123e4567-e89b-42d3-a456-426614174011';
const outline:OutlineResult={
  kind:'PRECISE' as const,algorithm:'polygon-clipping-union-v1',
  geometry:{type:'Polygon' as const,coordinates:[[[0,0],[2,0],[2,1],[0,1],[0,0]]]},
  tolerance:0.02,sourceEntityIds:['source:A1'],persistable:true,
  warnings:[],durationMs:0,
};
const screen=(p:{x:number;y:number})=>({x:p.x*10,y:p.y*10});
function generated(item:GeneratedEntry):MemoSnapTarget {
 const g=generatedResult(item).geometry;
 if(g.type!=='Polygon')throw new Error('Fixture polygon missing');
 return {ref:{...scope,origin:'GENERATED',id:item.ref.id},
    transform:item.transform,visible:item.visible,
    points:[{kind:'VERTEX',world:{x:g.coordinates[0][2][0],y:g.coordinates[0][2][1]}}]};
}
describe('#84 M3 session-only object snapping and bounded candidate selection',()=>{
 it('selects a visible in-scope WCS vertex within 12 CSS pixels and rejects other scope or hidden',()=>{
  const doc=new GeneratedDocument(scope);
  const item=doc.append({id:outlineId,savedOutlineId:'local-1',createdAt:'2026-10-31T00:00:00Z',result:outline});
  const t=generated(item);
  const found=nearestMemoSnap(scope,{x:2.5,y:1},[t],screen);
  expect(found).toMatchObject({kind:'VERTEX',world:{x:2,y:1},ref:{origin:'GENERATED',id:outlineId}});
  expect(nearestMemoSnap(scope,{x:12,y:1},[t],screen)).toBeNull();
  expect(nearestMemoSnap(scope,{x:2,y:1},[{...t,visible:false}],screen)).toBeNull();
  expect(nearestMemoSnap(scope,{x:2,y:1},[{...t,ref:{...t.ref,versionId:'foreign'}}],screen)).toBeNull();
  expect(nearestMemoSnap(scope,{x:2,y:1},[{...t,transform:[0,0,0,0,0,0]}],screen)).toBeNull();
  expect(nearestMemoSnap(scope,{x:2,y:1},[{
    ...t,points:[{kind:'ENDPOINT',world:{x:2,y:1}},{kind:'CENTER',world:{x:2,y:1}}]
  }],screen)?.kind).toBe('ENDPOINT');
 });
 it('follows GeneratedDocument translate/rotate/Undo/Redo and exact-ID delete Undo, without changing canonical memo data',()=>{
  const doc=new GeneratedDocument(scope);
  doc.append({id:outlineId,savedOutlineId:'local-1',createdAt:'2026-10-31T00:00:00Z',result:outline});
  const memo=new MemoSession(scope);
  memo.create({id:memoId,anchorWcsXY:{x:2,y:1},title:'session',content:'plain'},scope);
  const store=new MemoSessionSnapStore(scope);
  const t=generated(doc.getObjects()[0]);
  const snap=nearestMemoSnap(scope,{x:2,y:1},[t],screen)!;
  store.attach(memoId,snap);
  expect(store.reconcile([t])[memoId]).toMatchObject({mode:'ATTACHED',world:{x:2,y:1},persistence:'SESSION_ONLY'});
  const select=doc.getObjects()[0].ref;
  doc.execute({type:'Translate',ids:[outlineId],dx:3,dy:-5},[select]);
  expect(store.reconcile([generated(doc.getObjects()[0])])[memoId].world).toEqual({x:5,y:-4});
  doc.execute({type:'Rotate',ids:[outlineId],angleDegrees:90,pivot:[0,0]},[select]);
  const rotated=store.reconcile([generated(doc.getObjects()[0])])[memoId].world;
  expect(rotated.x).toBeCloseTo(4,8);expect(rotated.y).toBeCloseTo(5,8);
  doc.undo();
  expect(store.reconcile([generated(doc.getObjects()[0])])[memoId].world).toEqual({x:5,y:-4});
  doc.redo();
  const redone=store.reconcile([generated(doc.getObjects()[0])])[memoId].world;
  expect(redone.x).toBeCloseTo(rotated.x,8);expect(redone.y).toBeCloseTo(rotated.y,8);
  doc.execute({type:'Delete',ids:[outlineId]},[select]);
  expect(store.reconcile([])[memoId]).toMatchObject({mode:'BROKEN_ANCHOR',world:redone});
  doc.undo();
  expect(store.reconcile([generated(doc.getObjects()[0])])[memoId]).toMatchObject({mode:'ATTACHED'});
  expect(memo.get(memoId)?.anchorWcsXY).toEqual({x:2,y:1});
  expect(memo.get(memoId)).not.toHaveProperty('sessionSnap');
  expect(store.matches({...scope,versionId:'other'})).toBe(false);
 });
 it('tracks transient imported SceneWork transform/undo and intentionally breaks SOURCE_ONLY with last WCS',()=>{
  const scene=sceneScope(scope.versionId,scope.sourceSha256);
  const ref=createSceneRef(scene,'DXF_IMPORTED',importedId(scene,[0]),{treePath:[0]});
  const work=new SceneWorkDocument(scene,[ref]);
  const selected=[work.getState().objects[0].ref];
  const target=():MemoSnapTarget=>({
   ref:{...scope,origin:'RENDER',id:ref.id},
   transform:work.get(ref.id).transform,visible:work.get(ref.id).visible,
   points:[{kind:'ENDPOINT',world:{x:10,y:20}}],
  });
  const store=new MemoSessionSnapStore(scope);
  store.attach(memoId,nearestMemoSnap(scope,{x:10,y:20},[target()],screen)!);
  work.execute({type:'Translate',ids:[ref.id],dx:3,dy:-5},selected);
  expect(store.reconcile([target()])[memoId].world).toEqual({x:13,y:15});
  work.execute({type:'Rotate',ids:[ref.id],angleDegrees:90,pivot:[0,0]},selected);
  const rotated=store.reconcile([target()])[memoId].world;
  expect(rotated.x).toBeCloseTo(-15,8);expect(rotated.y).toBeCloseTo(13,8);
  work.undo();
  expect(store.reconcile([target()])[memoId].world).toEqual({x:13,y:15});
  work.redo();
  expect(store.reconcile([target()])[memoId].world.x).toBeCloseTo(-15,8);
  store.breakOrigin('RENDER');
  work.reset();
  expect(store.reconcile([target()])[memoId]).toMatchObject({mode:'BROKEN_ANCHOR',world:rotated});
  expect(store.hasBindings()).toBe(true);
  store.detach(memoId);
  expect(store.reconcile([target()])[memoId]).toBeUndefined();
 });
 it('rejects oversized candidates, cross-version transient refs and never injects untrusted IDs into server DTO',()=>{
  const store=new MemoSessionSnapStore(scope);
  expect(()=>store.attach(memoId,{ref:{...scope,versionId:'other',origin:'RENDER',id:'x'},
   transform:[1,0,0,1,0,0],world:{x:0,y:0},kind:'VERTEX',distancePx:0})).toThrow();
  expect(nearestMemoSnap(scope,{x:0,y:0},[{ref:{...scope,origin:'RENDER',id:'x'},visible:true,
   transform:[1,0,0,1,0,0],points:new Array(20001).fill({kind:'VERTEX',world:{x:0,y:0}})}],screen)).toBeNull();
  const src=readFileSync(new URL('../../features/cad-viewer/cad-business-client.ts',import.meta.url),'utf8');
  expect(src).toContain("method:'PATCH'");
  expect(src).not.toContain('sessionSnaps');
 });
});
