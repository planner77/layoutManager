import {describe,it,expect,vi} from 'vitest';
import {OwnedSessions,withOwnedSessions,type SessionApi} from '../greenfield-e2e/owned-sessions';

const response=(status:number,json:unknown={csrfToken:'test-csrf'})=>({status:()=>status,json:async()=>json});
function api(logoutStatus:number,events:string[],name:string):SessionApi{
 return {get:async()=>{events.push(name+':get');return response(200);},
  post:async()=>{events.push(name+':logout');return response(logoutStatus);}};
}
describe('C545 owned session cleanup',()=>{
 it('attempts all logout and close operations despite one failed logout',async()=>{
  const events:string[]=[];const owner=new OwnedSessions('http://127.0.0.1:3321');
  owner.add(api(200,events,'first'),async()=>{events.push('first:close');});
  owner.add(api(503,events,'second'),async()=>{events.push('second:close');});
  await expect(owner.cleanup()).rejects.toThrow('G7_SESSION_CLEANUP_FAILED');
  expect(events).toEqual(['second:get','second:logout','second:close','first:get','first:logout','first:close']);
 });
 it('preserves primary body failure and reports cleanup failure separately',async()=>{
  const primary=new Error('C545_EXPECTED_BODY_FAILURE');
  let reported:unknown;
  try{await withOwnedSessions('http://127.0.0.1:3321',async owner=>{
    owner.add(api(503,[],'bad'));throw primary;
  });}catch(error){reported=error;}
  expect(reported).toBeInstanceOf(AggregateError);
  expect((reported as AggregateError).errors[0]).toBe(primary);
  expect((reported as AggregateError).errors[1]).toBeInstanceOf(AggregateError);
 });
 it('accepts 401 only as an inactive session and does not POST logout',async()=>{
  const post=vi.fn();const owner=new OwnedSessions('http://127.0.0.1:3321');
  owner.add({get:async()=>response(401),post});
  await expect(owner.cleanup()).resolves.toBeUndefined();expect(post).not.toHaveBeenCalled();
 });
});
