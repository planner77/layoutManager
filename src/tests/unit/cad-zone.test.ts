import {describe,expect,test} from 'vitest';
import {assertZoneParent,closeZonePoints,isZoneGeometryMapped,normalizeZoneMetadata,validateZonePolygon,
 zoneContainsPolygon,zonesOverlap,type CadZoneDto,type ZonePolygon} from '../../domain/cad-zone';
import {requireResolvedPermission,type UserAccess} from '../../domain/auth';
const polygon=(points:number[][]):ZonePolygon=>({type:'Polygon',coordinates:[points as [number,number][]]});
const square=(x=0,y=0,size=10)=>polygon([[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]);
const id='00000000-0000-4000-8000-000000000001';

describe('#196 WCS geometry and semantic metadata',()=>{
 test('TC-ZONE-UNIT-01 accepts explicit simple rings and preserves small far-origin WCS geometry',()=>{
  expect(validateZonePolygon(square(1e9,1e9,1))).toMatchObject({area:1,bounds:{minX:1e9,maxX:1e9+1}});
  expect(closeZonePoints([{x:0,y:0},{x:4,y:0},{x:4,y:3}]).coordinates[0]).toEqual([[0,0],[4,0],[4,3],[0,0]]);
  expect(validateZonePolygon(square()).area).toBe(100);
 });
 test('TC-ZONE-UNIT-02 rejects open, degenerate, crossing, touching, excessive and compound geometry',()=>{
  const invalid:unknown[]=[polygon([[0,0],[4,0],[4,4],[0,4]]),polygon([[0,0],[1,0],[2,0],[0,0]]),
   polygon([[0,0],[4,4],[0,4],[4,0],[0,0]]),polygon([[0,0],[4,0],[4,4],[2,0],[0,4],[0,0]]),
   polygon([[0,0],[4,0],[2,0],[2,4],[0,0]]),polygon([[0,0],[4,0],[4,4],[4,0],[0,0]]),
   polygon([[0,0],[Infinity,0],[4,4],[0,0]]),polygon([[0,0],[1e12+1,0],[4,4],[0,0]]),
   {type:'MultiPolygon',coordinates:[square().coordinates]},
   {type:'Polygon',coordinates:[square().coordinates[0],square(2,2,1).coordinates[0]]},
   polygon(Array.from({length:514},(_,i)=>[i,i%2]))];
  for(const value of invalid)expect(()=>validateZonePolygon(value)).toThrow();
 });
 test('TC-ZONE-UNIT-03 validates full containment in concave parent and sibling overlap policy',()=>{
  const u=polygon([[0,0],[10,0],[10,10],[7,10],[7,3],[3,3],[3,10],[0,10],[0,0]]);
  const across=polygon([[1,8],[9,8],[9,9],[1,9],[1,8]]);
  // Every child vertex is inside, but its edges cross the parent's excluded notch.
  expect(zoneContainsPolygon(u,across)).toBe(false);
  expect(zoneContainsPolygon(u,square(1,1,1))).toBe(true);
  expect(zoneContainsPolygon(square(),square(0,0,10))).toBe(true);
  expect(zoneContainsPolygon(square(),square(-1,0,10))).toBe(false);
  expect(zonesOverlap(square(),square(9,0,2))).toBe(true);
  expect(zonesOverlap(square(),square(10,0,2))).toBe(false);
 });
 test('TC-ZONE-UNIT-04 normalizes safe plain metadata and rejects unsafe reference URLs',()=>{
  const base={name:'  생산 구역 ',description:' A\r\nB ',tags:['생산'],references:[]};
  expect(normalizeZoneMetadata(base)).toMatchObject({name:'생산 구역',description:'A\nB',categoryId:null,parentZoneId:null});
  for(const url of ['javascript:alert(1)','data:text/html,X','https://user:pass@intranet.test/document',
   'https://intranet.test/doc?token=secret','https://intranet.test/doc#credential','https:\\evil.test']){
   expect(()=>normalizeZoneMetadata({...base,references:[{label:'참조',kind:'DOCUMENT',value:'문서',url}]})).toThrow();
  }
  const result=normalizeZoneMetadata({...base,references:[{label:'설비',kind:'EQUIPMENT',value:'A-01',url:'https://intranet.test/docs'}]});
  expect(result.references[0].url).toBe('https://intranet.test/docs');
  expect(()=>normalizeZoneMetadata({...base,tags:['A','a']})).toThrow();
  expect(()=>normalizeZoneMetadata({...base,categoryId:'arbitrary'})).toThrow();
 });
 test('TC-ZONE-UNIT-05 rejects cycles/cross-floor parents and stale Version/SHA/Scene mappings',()=>{
  const zones=[{id:'a',locationId:'floor',parentZoneId:null},{id:'b',locationId:'floor',parentZoneId:'a'},
   {id:'c',locationId:'floor',parentZoneId:'b'},{id:'d',locationId:'other',parentZoneId:null}];
  expect(()=>assertZoneParent(zones,'a','c')).toThrow();
  expect(()=>assertZoneParent(zones,'c','d')).toThrow();
  expect(()=>assertZoneParent(zones,'c','missing')).toThrow();
  expect(()=>assertZoneParent(zones,'c','a')).not.toThrow();
  const geometry={versionId:id,sourceSha256:'a'.repeat(64),sceneRevision:2,state:'MAPPED',revision:1,
   ...validateZonePolygon(square())};
  const zone={geometry} as CadZoneDto,scope={versionId:id,sourceSha256:'a'.repeat(64),sceneRevision:2};
  expect(isZoneGeometryMapped(zone,scope)).toBe(true);
  for(const other of [{...scope,sceneRevision:3},{...scope,sceneRevision:null},{...scope,versionId:'other'},
   {...scope,sourceSha256:'b'.repeat(64)}])expect(isZoneGeometryMapped(zone,other)).toBe(false);
  expect(isZoneGeometryMapped({...zone,geometry:{...zone.geometry!,state:'UNMAPPED'}},scope)).toBe(false);
 });
 test('TC-ZONE-UNIT-06 zone access and category administration require actual Site grants',()=>{
  const user=(roles:UserAccess['roles'],sites:readonly string[]=['site']):UserAccess=>({id,status:'ACTIVE',mustChangePassword:false,roles,siteGrants:sites,specialGrants:[]});
  const resource={kind:'site' as const,siteId:'site'};
  expect(()=>requireResolvedPermission(user(['Reader']),'zone:read',resource,'site')).not.toThrow();
  expect(()=>requireResolvedPermission(user(['Reader']),'zone:write',resource,'site')).toThrow();
  expect(()=>requireResolvedPermission(user(['Editor']),'zone:write',resource,'site')).not.toThrow();
  expect(()=>requireResolvedPermission(user(['Editor']),'zoneCategory:manage',resource,'site')).toThrow();
  expect(()=>requireResolvedPermission(user(['Admin'],[]),'zoneCategory:manage',resource,'site')).toThrow();
  expect(()=>requireResolvedPermission(user(['Admin']),'zoneCategory:manage',resource,'site')).not.toThrow();
 });
});
