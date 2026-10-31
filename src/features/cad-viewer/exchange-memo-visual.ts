import {assertMemoScope,assertMemoWcsXY,normalizeMemoText,type MemoDraft,type MemoScope} from '@/domain/cad-memo';
import type {ExchangeMemoInput,ExchangeSelection} from '@/domain/cad-exchange';
import {dateOnly,type MemoSettings} from '@/domain/memo-schedule';
import type {SessionSnapProjection} from '@/domain/memo-session-snap';

type VisualItem=Readonly<{input:ExchangeMemoInput;recordFingerprint:string;projected:boolean}>;
/** Private continuity proof; never included in an artifact or a network payload. */
export type ExchangeMemoVisualSnapshot=Readonly<{
  scope:MemoScope;viewerGeneration:string;targetEpoch:number;items:readonly VisualItem[];
}>;
export class ExchangeMemoVisualError extends Error{}
const stale=()=>new ExchangeMemoVisualError('메모 또는 연결 대상이 변경됐습니다. Viewer 메모를 새로 조회한 뒤 포함 범위를 다시 확인하세요.');
function settings(record:MemoDraft):MemoSettings{
  const scheduleEnabled=record.scheduleEnabled??false,completionEnabled=record.completionEnabled??false;
  const isCompleted=record.isCompleted??false,startDate=dateOnly(record.startDate??null),dueDate=dateOnly(record.dueDate??null);
  const completedAt=record.completedAt??null;
  if(typeof scheduleEnabled!=='boolean'||typeof completionEnabled!=='boolean'||typeof isCompleted!=='boolean'||
    !scheduleEnabled&&(startDate!==null||dueDate!==null)||startDate&&dueDate&&startDate>dueDate||
    !completionEnabled&&isCompleted||isCompleted!==Boolean(completedAt)||
    completedAt&&(!Number.isFinite(Date.parse(completedAt))||!completedAt.endsWith('Z')))throw stale();
  return {scheduleEnabled,startDate,dueDate,completionEnabled,isCompleted,completedAt};
}
function inScope(record:MemoDraft,scope:MemoScope){
  if(record.versionId!==scope.versionId||record.sourceSha256!==scope.sourceSha256)throw stale();
}
export function memoRecordFingerprint(record:MemoDraft):string{
  const text=normalizeMemoText(record.title,record.content),world=assertMemoWcsXY(record.anchorWcsXY);
  const anchor=record.anchor;
  return JSON.stringify([record.id,record.versionId,record.sourceSha256,record.persisted===true,record.revision??null,
    text.title,text.content,record.textFormat,world,[anchor?.mode??'FREE',anchor?.targetRef?.origin??null,
      anchor?.targetRef?.id??null,anchor?.localAnchorWcsXY?.x??null,anchor?.localAnchorWcsXY?.y??null],
    settings(record),record.visible??true,record.groupId??null]);
}
function canonical(record:MemoDraft):ExchangeMemoInput{
  const {title,content}=normalizeMemoText(record.title,record.content),world=assertMemoWcsXY(record.anchorWcsXY);
  if(record.textFormat!=='plain'||record.persisted&&(!Number.isSafeInteger(record.revision)||Number(record.revision)<0))throw stale();
  const server=record.persisted===true,broken=record.anchor?.mode==='BROKEN_ANCHOR';
  return {key:(server?'memo-server:':'memo-local:')+record.id,id:record.id,
    origin:server?'SERVER_MEMO':'LOCAL_MEMO',revision:server?record.revision!:null,title,content,
    anchorWcs:{...world,z:0},anchorMode:broken?'BROKEN':'CANONICAL',broken,settings:settings(record)};
}
export function captureExchangeMemoVisuals(scope:MemoScope,records:readonly MemoDraft[],
  projections:Readonly<Record<string,SessionSnapProjection>>,viewerGeneration:string,targetEpoch:number):ExchangeMemoVisualSnapshot{
  assertMemoScope(scope);
  if(records.length>100||new Set(records.map(row=>row.id)).size!==records.length||!viewerGeneration||!Number.isSafeInteger(targetEpoch)||targetEpoch<0)throw stale();
  const items=records.map(record=>{
    inScope(record,scope);let input=canonical(record);const projection=projections[record.id];
    if(projection){
      if(projection.persistence!=='SESSION_ONLY'||projection.ref.versionId!==scope.versionId||
        projection.ref.sourceSha256!==scope.sourceSha256||!['ATTACHED','BROKEN_ANCHOR'].includes(projection.mode))throw stale();
      const world=assertMemoWcsXY(projection.world),broken=projection.mode==='BROKEN_ANCHOR';
      input={...input,anchorWcs:{...world,z:0},anchorMode:broken?'BROKEN':'SESSION',broken};
    }
    return {input,recordFingerprint:memoRecordFingerprint(record),projected:!!projection};
  });
  return {scope:{...scope},viewerGeneration,targetEpoch,items};
}
/** Checks only selected Memo records; unrelated private data cannot gate Source-only. */
export function exchangeMemoVisualFingerprint(snapshot:ExchangeMemoVisualSnapshot,keys:readonly string[]):string{
  if(new Set(keys).size!==keys.length)throw stale();
  return JSON.stringify([snapshot.scope,snapshot.viewerGeneration,snapshot.targetEpoch,[...keys].sort().map(key=>{
    const item=snapshot.items.find(value=>value.input.key===key);
    return [key,item?{input:item.input,recordFingerprint:item.recordFingerprint,projected:item.projected}:null];
  })]);
}
export function composeExchangeMemos(visual:ExchangeMemoVisualSnapshot,serverRows:readonly MemoDraft[],selection:ExchangeSelection['memos']):ExchangeMemoInput[]{
  if(!selection.enabled)return [];
  const local=visual.items.filter(item=>item.input.origin==='LOCAL_MEMO');
  if(serverRows.length>100||new Set(serverRows.map(row=>row.id)).size!==serverRows.length)throw stale();
  const server=serverRows.map(row=>{inScope(row,visual.scope);if(!row.persisted)throw stale();return {row,input:canonical(row)};});
  const valid=new Set([...local.map(item=>item.input.key),...server.map(item=>item.input.key)]);
  if(new Set(selection.ids).size!==selection.ids.length||selection.ids.some(key=>!valid.has(key))||selection.mode==='selected'&&!selection.ids.length)throw stale();
  const selected=(key:string)=>selection.mode==='all'||selection.ids.includes(key);
  const result=local.filter(item=>selected(item.input.key)).map(item=>item.input);
  for(const item of server){
    if(!selected(item.input.key))continue;
    const cached=visual.items.find(value=>value.input.key===item.input.key);
    if(cached?.projected){
      if(cached.recordFingerprint!==memoRecordFingerprint(item.row))throw stale();
      result.push(cached.input);
    }else result.push(item.input);
  }
  if(!result.length||result.length>100)throw stale();
  return structuredClone(result);
}
