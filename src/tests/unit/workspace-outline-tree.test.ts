import { expect, test } from 'vitest';
import { buildWorkspaceOutlineTree } from '../../domain/outline-tree';
import type { StoredOutlineDto } from '../../domain/typed-outline';
import type { SavedOutline } from '../../viewers/core/adapter';
import type { OutlineResult } from '../../viewers/core/outline-compute';

const id='11111111-1111-4111-8111-111111111111';
const typeId='22222222-2222-4222-8222-222222222222';
const result:OutlineResult={kind:'CONVEX',algorithm:'monotone-chain-v1',
  geometry:{type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,0]]]},
  persistable:false,geometryBasis:'RENDER_WCS_2D',sourceEntityIds:[],tolerance:0.02,warnings:[],durationMs:0};
function server(rowId=id):StoredOutlineDto{
  return {id:rowId,versionId:id,sourceSha256:'a'.repeat(64),sceneRevision:0,origin:'APP_CREATED',
    validationMode:'APP_CREATED',kind:'CONVEX',name:'서버 구역',geometry:result.geometry,baseGeometry:result.geometry,
    sourceRefs:[],derivedFrom:[],operations:[],outlineTypeId:typeId,
    outlineType:{id:typeId,name:'현재 타입',active:false,sortOrder:2,revision:3},
    revision:0,createdById:id,updatedById:id,createdAt:'2026-11-01T00:00:00.000Z',updatedAt:'2026-11-01T00:00:00.000Z'};
}
test('local/server identity collision stays separate; current referenced inactive label overrides local snapshot',()=>{
  const local:SavedOutline={id,createdAt:'2026-11-01T00:00:00.000Z',result,
    outlineTypeId:typeId,outlineTypeName:'이전 타입',name:'로컬 구역'};
  const rows=buildWorkspaceOutlineTree([local],[{id,visible:true,selected:true}],[],[server()],new Set([id]),new Set([id]));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({id:typeId,name:'현재 타입 (비활성)'});
  expect(rows[0].items).toMatchObject([
    {id:'local:'+id,sourceId:id,persistence:'session',visible:true,selected:true},
    {id:'server:'+id,sourceId:id,persistence:'server',visible:false,selected:true},
  ]);
});
test('unclassified rows stay after typed groups and unrelated catalogue pages do not create empty groups',()=>{
  const legacy={...server(),id:'33333333-3333-4333-8333-333333333333',outlineTypeId:null,outlineType:null};
  const rows=buildWorkspaceOutlineTree([],[],[{id:'unreferenced',name:'검색 중 타입'}],[legacy,server()],new Set(),new Set());
  expect(rows.map(group=>group.id)).toEqual([typeId,'legacy']);
  expect(rows[1].items[0].name).toBe('서버 구역');
});
test('bounded mixed 200 rows retain all unique identities without changing server metadata or visibility sets',()=>{
  const stored=Array.from({length:100},(_,i)=>server(`11111111-1111-4111-8111-${String(i+1).padStart(12,'0')}`));
  const local=Array.from({length:100},(_,i):SavedOutline=>({id:'local-'+(i+1),createdAt:'2026-11-01T00:00:00.000Z',result}));
  const before=structuredClone(stored),hidden=new Set([stored[0].id]);
  const rows=buildWorkspaceOutlineTree(local,[],[],stored,hidden,new Set());
  const entries=rows.flatMap(group=>group.items);
  expect(entries).toHaveLength(200);expect(new Set(entries.map(item=>item.id)).size).toBe(200);
  expect(stored).toEqual(before);expect([...hidden]).toEqual([stored[0].id]);
});
