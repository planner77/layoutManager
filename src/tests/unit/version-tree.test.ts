import {describe,expect,it} from 'vitest';
import {draftDisplayName,filteredVersionTree,mergeVersionTreeTypes,projectVersionTree,subtreeObjects} from '../../domain/version-tree';
const input={
 folders:[{id:'f1',parentFolderId:null,name:'Factory',sortOrder:2,revision:1,createdById:'a'},
  {id:'f2',parentFolderId:'f1',name:'Line B',sortOrder:1,revision:1,createdById:'a'}],
 memberships:[{kind:'OUTLINE' as const,objectId:'o1',folderId:'f2',sortOrder:2,revision:1},
  {kind:'ZONE' as const,objectId:'z1',folderId:'f1',sortOrder:1,revision:1}],
 outlines:[{id:'o1',name:'Pipe perimeter',kind:'PRECISE',outlineTypeId:'t1'},
  {id:'o2',name:'Other perimeter',kind:'CONVEX',outlineTypeId:null}],
 zones:[{id:'z1',name:'Tank',code:'T-01',categoryId:'c1',parentZoneId:null,sortOrder:3},
  {id:'z2',name:'Valve',code:'V-02',categoryId:null,parentZoneId:'z1',sortOrder:1},
  {id:'z3',name:'Sensor',code:'S-03',categoryId:null,parentZoneId:'z2',sortOrder:1}],
 categories:[{id:'c1',name:'Equipment'}],types:[{id:'t1',name:'Process'}],
 drafts:[{id:'d1',name:'Local draft',kind:'CONVEX'}],
};
describe('#201 mixed Version tree projection',()=>{
 it('places both persistent kinds in folders while keeping Zone ancestry and temporary drafts unclassified',()=>{
  const tree=projectVersionTree(input);
  expect(tree.map(x=>x.name)).toEqual(['Factory','미분류']);
  const factory=tree[0];expect(factory.children.map(x=>x.name)).toEqual(['Line B','Tank']);
  expect(factory.children[1].children[0].children[0].name).toBe('Sensor');
  expect(factory.children[0].children[0].typeName).toBe('Process');
  expect(tree[1].children.map(x=>x.name)).toEqual(['Local draft','Other perimeter']);
  expect(subtreeObjects(factory).map(x=>x.id)).toEqual(['o1','z1','z2','z3']);
 });
 it('filters by type/category/code and keeps ancestor paths and exact empty folder match',()=>{
  const tree=projectVersionTree(input);
  expect(filteredVersionTree(tree,'Equipment','ALL').roots[0].children[0].name).toBe('Tank');
  expect(filteredVersionTree(tree,'V-02','ZONE').roots[0].children[0].children[0].name).toBe('Valve');
  expect(filteredVersionTree(tree,'Process','OUTLINE').count).toBe(1);
  expect(filteredVersionTree(tree,'Factory','ALL').count).toBe(4);
  const empty=projectVersionTree({...input,folders:[...input.folders,{id:'f3',parentFolderId:null,name:'Empty',sortOrder:3,revision:1,createdById:'a'}]});
  expect(filteredVersionTree(empty,'Empty','ALL').roots.some(x=>x.name==='Empty')).toBe(true);
 });
 it('does not revive a removed root membership after the zone becomes a child then root again',()=>{
  const unclassified=projectVersionTree({...input,memberships:input.memberships.filter(m=>m.objectId!=='z1')});
  expect(unclassified.at(-1)?.children.some(n=>n.id==='z1')).toBe(true);
  const child=projectVersionTree({...input,zones:input.zones.map(z=>z.id==='z1'?{...z,parentZoneId:'z3'}:z),memberships:input.memberships.filter(m=>m.objectId!=='z1')});
  expect(child[0].children.some(n=>n.id==='z1')).toBe(false);
 });
 it('labels a referenced inactive OutlineType without adding unreferenced catalogue items',()=>{
  const tree=projectVersionTree({...input,types:[{id:'t1',name:'Retired process',active:false},{id:'unused',name:'Unused',active:true}]});
  expect(tree[0].children[0].children[0].typeName).toBe('Retired process (비활성)');
  expect(filteredVersionTree(tree,'비활성','OUTLINE').count).toBe(1);
  expect(filteredVersionTree(tree,'Unused','ALL').count).toBe(0);
 });
 it('projects session draft name and current type, preferring referenced inactive type over the active catalogue entry',()=>{
  const types=mergeVersionTreeTypes([{id:'t1',name:'Current process',active:true}], [{id:'t1',name:'Retired process',active:false}]);
  const tree=projectVersionTree({...input,outlines:[],zones:[],types,
   drafts:[{id:'local-1',name:'Renamed draft',kind:'CONVEX',outlineTypeId:'t1',outlineTypeName:'Stored process'}]});
  expect(tree.at(-1)?.children[0]).toMatchObject({name:'Renamed draft',typeName:'Retired process (비활성)'});
  expect(filteredVersionTree(tree,'Renamed draft','OUTLINE').count).toBe(1);
  expect(filteredVersionTree(tree,'비활성','OUTLINE').count).toBe(1);
 });
 it('uses saved type name when catalogue is missing and kind for untyped drafts',()=>{
  const tree=projectVersionTree({...input,outlines:[],zones:[],types:[],
   drafts:[{id:'local-1',name:'외곽선 1',kind:'CONVEX',outlineTypeId:'gone',outlineTypeName:'Stored process'},
    {id:'local-2',name:'외곽선 2',kind:'PRECISE'}]});
  expect(tree.at(-1)?.children.map(n=>n.typeName)).toEqual(['Stored process','PRECISE']);
  expect(filteredVersionTree(tree,'Stored process','OUTLINE').count).toBe(1);
 });
 it('keeps a saved draft name and gives blank legacy drafts their stable local number',()=>{
  expect(draftDisplayName('local-2',' Updated name ')).toBe('Updated name');
  expect(draftDisplayName('local-2',' ')).toBe('외곽선 2');
  expect(draftDisplayName('unknown','')).toBe('외곽선 unknown');
 });
});
