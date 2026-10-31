import {expect,test} from 'vitest';
import {createMonotonicTestNow} from '../helpers/monotonic-clock';

test('a positive fixture clock does not precede a freshly signed wall-clock notBefore',()=>{
  let wall=1000,monotonic=20;
  const now=createMonotonicTestNow(()=>wall,()=>monotonic);
  const signedNotBefore=++wall;monotonic+=0.2;
  expect(now()).toBeGreaterThanOrEqual(signedNotBefore);
});

test('a forward wall adjustment followed by rollback never lowers the lifecycle clock',()=>{
  let wall=1000,monotonic=20;
  const now=createMonotonicTestNow(()=>wall,()=>monotonic);
  wall=5000;monotonic+=2;
  expect(now()).toBe(5000);
  wall=900;monotonic+=1;
  expect(now()).toBe(5000);
});

test('rollback still permits monotonic lifecycle progress without sleeping',()=>{
  let wall=1000,monotonic=20;
  const now=createMonotonicTestNow(()=>wall,()=>monotonic);
  wall=900;monotonic+=2500;
  expect(now()).toBe(3500);
});
