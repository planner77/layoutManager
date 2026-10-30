/** #167 S6: explicit, version-scoped reset intent. Immutable DXF/Scene are not reset data. */
export type ResetMode='SOURCE_ONLY'|'ALL';
export type RevisionEntry=Readonly<{id:string;revision:number}>;
export function resetRows(raw:unknown):RevisionEntry[]{
 if(!Array.isArray(raw)||raw.length>100)throw new Error('초기화 요청 항목 상한(100)을 확인하세요.');
 const ids=new Set<string>();
 return raw.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('초기화 항목이 잘못되었습니다.');
  const x=row as Record<string,unknown>;
  if(Object.keys(x).sort().join()!=='id,revision'||
     typeof x.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x.id)||
     typeof x.revision!=='number'||!Number.isSafeInteger(x.revision)||x.revision<0||ids.has(x.id))
   throw new Error('초기화 항목의 ID·revision이 유효하지 않습니다.');
  ids.add(x.id);return {id:x.id,revision:x.revision};
 });
}
export function sameRevisionSnapshot(expected:readonly RevisionEntry[],observed:readonly RevisionEntry[]):boolean{
 if(expected.length!==observed.length)return false;
 const map=new Map(expected.map(row=>[row.id,row.revision]));
 return map.size===expected.length && observed.every(row=>map.get(row.id)===row.revision);
}
