/** #86 M5: validated date-only without local-time conversion. */
export type MemoSettings=Readonly<{scheduleEnabled:boolean;startDate:string|null;dueDate:string|null;completionEnabled:boolean;isCompleted:boolean;completedAt:string|null}>;
export type MemoSettingsInput=Omit<MemoSettings,'completedAt'>;
export const EMPTY_MEMO_SETTINGS:MemoSettings={scheduleEnabled:false,startDate:null,dueDate:null,completionEnabled:false,isCompleted:false,completedAt:null};
export function dateOnly(value:unknown):string|null{
 if(value===null)return null;
 if(typeof value!=='string'||!/^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value))
  throw new Error('날짜는 YYYY-MM-DD 형식이어야 합니다.');
 const d=new Date(value+'T00:00:00.000Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)
  throw new Error('존재하지 않는 날짜입니다.');
 return value;
}
export function normalizeMemoSettings(input:unknown,previous:MemoSettings=EMPTY_MEMO_SETTINGS,
 nowUtc:string=new Date().toISOString()):MemoSettings{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('메모 일정·완료 형식 오류');
 const b=input as Record<string,unknown>;
 if(Object.keys(b).sort().join(',')!=='completionEnabled,dueDate,isCompleted,scheduleEnabled,startDate'||
  typeof b.scheduleEnabled!=='boolean'||typeof b.completionEnabled!=='boolean'||typeof b.isCompleted!=='boolean')
  throw new Error('메모 일정·완료 형식 오류');
 const start=dateOnly(b.startDate),due=dateOnly(b.dueDate);
 if(start&&due&&start>due)throw new Error('시작일이 마감일보다 늦습니다.');
 if(!b.scheduleEnabled&&(start!==null||due!==null))throw new Error('일정 해제 시 날짜를 삭제하세요.');
 if(!b.completionEnabled&&b.isCompleted)throw new Error('완료 관리 해제 시 완료를 취소하세요.');
 if(!Number.isFinite(Date.parse(nowUtc))||!/^\d{4}-\d\d-\d\dT.*Z$/.test(nowUtc))throw new Error('서버 시각 오류');
 const done=Boolean(b.completionEnabled&&b.isCompleted);
 return {scheduleEnabled:b.scheduleEnabled,startDate:b.scheduleEnabled?start:null,dueDate:b.scheduleEnabled?due:null,
 completionEnabled:b.completionEnabled,isCompleted:done,
 completedAt:done?(previous.completionEnabled&&previous.isCompleted?previous.completedAt??nowUtc:nowUtc):null};
}
