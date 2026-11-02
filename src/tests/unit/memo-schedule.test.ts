import {describe,expect,test} from 'vitest';
import {dateOnly,normalizeMemoSettings,EMPTY_MEMO_SETTINGS} from '../../domain/memo-schedule';
describe('#86 M5 date-only and completion UTC contract',()=>{
 test('validates Gregorian date-only without timezone offset or implicit default',()=>{
  expect(dateOnly('2028-02-29')).toBe('2028-02-29');
  expect(dateOnly(null)).toBeNull();
  for(const bad of ['2026-02-29','2026-04-31','2026-13-01','2026-1-01',
   '2026-01-01T10:00Z','0000-01-01','2026-00-01','2026-11-31'])
   expect(()=>dateOnly(bad)).toThrow();
 });
 test('optional dates, invalid range and OFF cleanup are deterministic',()=>{
  expect(normalizeMemoSettings({scheduleEnabled:true,startDate:null,dueDate:'2026-11-30',
   completionEnabled:false,isCompleted:false})).toMatchObject({dueDate:'2026-11-30',startDate:null});
  expect(()=>normalizeMemoSettings({scheduleEnabled:true,startDate:'2026-12-01',
   dueDate:'2026-11-30',completionEnabled:false,isCompleted:false})).toThrow();
  expect(()=>normalizeMemoSettings({scheduleEnabled:false,startDate:'2026-11-01',
   dueDate:null,completionEnabled:false,isCompleted:false})).toThrow();
  expect(normalizeMemoSettings({scheduleEnabled:false,startDate:null,dueDate:null,
   completionEnabled:false,isCompleted:false})).toEqual(EMPTY_MEMO_SETTINGS);
 });
 test('only server supplies completion timestamp, uncheck and disable wipe it',()=>{
  const checked={scheduleEnabled:false,startDate:null,dueDate:null,
   completionEnabled:true,isCompleted:true};
  const initial=normalizeMemoSettings(checked,EMPTY_MEMO_SETTINGS,'2026-10-31T00:00:00.000Z');
  expect(initial.completedAt).toBe('2026-10-31T00:00:00.000Z');
  const keep=normalizeMemoSettings(checked,initial,'2026-11-01T00:00:00.000Z');
  expect(keep.completedAt).toBe(initial.completedAt);
  const cleared=normalizeMemoSettings({...checked,isCompleted:false},initial,'2026-11-01T00:00:00.000Z');
  expect(cleared.completedAt).toBeNull();
  expect(normalizeMemoSettings(checked,cleared,'2026-11-02T00:00:00.000Z').completedAt)
   .toBe('2026-11-02T00:00:00.000Z');
  expect(normalizeMemoSettings({...checked,completionEnabled:false,isCompleted:false},initial).completedAt).toBeNull();
 });
 test('rejects client-provided completedAt and malformed flags',()=>{
  expect(()=>normalizeMemoSettings({scheduleEnabled:false,startDate:null,dueDate:null,
   completionEnabled:true,isCompleted:true,completedAt:'spoof'})).toThrow();
  expect(()=>normalizeMemoSettings({scheduleEnabled:'true',startDate:null,dueDate:null,
   completionEnabled:false,isCompleted:false})).toThrow();
 });
});
