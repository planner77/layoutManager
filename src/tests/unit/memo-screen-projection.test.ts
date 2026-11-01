import {describe,it,expect} from 'vitest';
import {OrthographicCamera,Vector3} from 'three';
import {projectWcsBatch} from '../../viewers/core/canvas-projection';
import {projectMemoPins,sameScreenPoint,sameScreenPositions} from '../../domain/memo-screen-projection';

describe('#186 one-viewport Memo WCS batch projector',()=>{
 const camera=()=>{
  const c=new OrthographicCamera(-100,100,50,-50,0.1,1000);
  c.position.z=10;c.updateProjectionMatrix();c.updateMatrixWorld(true);return c;
 };
 it('projects exactly like THREE.Vector3.project at CSS pixel scale with no DPR multiplier',()=>{
  const c=camera(),points=[{x:0,y:0},{x:100,y:50},{x:-50,y:-25},{x:1e13,y:0},{x:NaN,y:0}];
  const batch=projectWcsBatch(c,{width:200,height:100},points);
  expect(batch[0]).toEqual({x:100,y:50});
  expect(batch[1]).toEqual({x:200,y:0});
  for(let i=0;i<3;i++){
   const p=new Vector3(points[i].x,points[i].y,0).project(c);
   expect(batch[i]!.x).toBeCloseTo((p.x+1)*100,9);
   expect(batch[i]!.y).toBeCloseTo((1-p.y)*50,9);
  }
  expect(batch.slice(3)).toEqual([null,null]);
  expect(projectWcsBatch(c,{width:0,height:100},points)).toEqual(points.map(()=>null));
  expect(projectWcsBatch(c,{width:200,height:Infinity},points)).toEqual(points.map(()=>null));
 });
 it('projects 100 pins and one candidate with one batched callback; preview alters only its own pin',()=>{
  const c=camera();
  const memos=Array.from({length:100},(_,i)=>({id:'memo'+i,anchorWcsXY:{x:i-50,y:0}}));
  let calls=0,projectedCount=0;
  const projector=(worlds:readonly {x:number;y:number}[])=>{
   calls++;projectedCount=worlds.length;
   return projectWcsBatch(c,{width:200,height:100},worlds);
  };
  const result=projectMemoPins(memos,{id:'memo3',point:{x:10,y:10}},
   {x:100,y:50},{width:200,height:100},projector);
  expect(calls).toBe(1);expect(projectedCount).toBe(101);
  expect(result.positions.memo3).toEqual({x:110,y:40});
  expect(result.positions.memo4).toEqual({x:54,y:50});
  expect(result.candidate).toEqual({x:200,y:0});
  expect(Object.keys(result.positions)).toHaveLength(100);
 });
 it('culls offscreen/invalid points, retains order, no-op positions are referentially comparable',()=>{
  const memos=[{id:'a',anchorWcsXY:{x:1,y:2}},{id:'b',anchorWcsXY:{x:3,y:4}}];
  const projection=(points:readonly {x:number;y:number}[])=>points.map(p=>
   p.x===1?{x:10,y:10}:p.x===3?{x:1000,y:10}:{x:NaN,y:5});
  const first=projectMemoPins(memos,null,{x:10,y:4},{width:100,height:100},projection);
  const second=projectMemoPins(memos,null,{x:10,y:4},{width:100,height:100},projection);
  expect(first.positions).toEqual({a:{x:10,y:10}});expect(first.candidate).toBeNull();
  expect(sameScreenPositions(first.positions,second.positions)).toBe(true);
  expect(sameScreenPositions(first.positions,{a:{x:11,y:10}})).toBe(false);
  expect(sameScreenPoint({x:10,y:10},{x:10,y:10})).toBe(true);
  expect(sameScreenPoint(null,{x:1,y:1})).toBe(false);
 });
});
