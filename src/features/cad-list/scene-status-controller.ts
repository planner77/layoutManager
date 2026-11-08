import type {SceneBatchRow,SceneBatchResponse} from '@/server/scene/scene-build-status-batch';
import {SCENE_BUILD_STAGES,safeBuildErrorCode} from '@/domain/scene-build-job';

export function uniqueSceneVersionIds(ids:readonly string[]):string[]{return [...new Set(ids)];}
const BATCH_SIZE=100;
const POLL_MS=5000;
const MAX_TRANSPORT_FAILURES=3;
const labels:Readonly<Record<SceneBatchRow['state'],string>>={
  NOT_APPLICABLE:'해당 없음',MISSING:'Scene 없음',REBUILD_REQUIRED:'Scene 재생성 필요',
  QUEUED:'생성 대기',RUNNING:'생성 중',RETRY_WAIT:'재시도 대기',
  READY:'Scene 완료',FAILED:'생성 실패',BLOCKED:'작업 차단',UNAVAILABLE:'상태 확인 불가',
};
const states=new Set(Object.keys(labels));
const tones=new Set(['neutral','pending','success','warning','error']);
const stages=new Set<string>(SCENE_BUILD_STAGES);
export type SceneStatusSnapshot=Readonly<{
  rows:Record<string,SceneBatchRow>;loading:boolean;loadError:boolean;
}>;
const empty:SceneStatusSnapshot={rows:{},loading:false,loadError:false};

/** A response is only a transport DTO. Reject malformed or unexpected rows before
 * committing any batch; the server alone decides authorization and retry rights. */
function parseRows(value:unknown,requested:readonly string[]):Record<string,SceneBatchRow>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('INVALID_STATUS');
  const rows=(value as SceneBatchResponse).rows;
  if(!rows||typeof rows!=='object'||Array.isArray(rows))throw new Error('INVALID_STATUS');
  const allowed=new Set(requested);
  const parsed:Record<string,SceneBatchRow>={};
  for(const [id,row] of Object.entries(rows)){
    if(!allowed.has(id)||!row||typeof row!=='object'||Array.isArray(row)||
       !states.has(row.state)||!tones.has(row.tone)||row.label!==labels[row.state]||
       typeof row.polling!=='boolean'||typeof row.canRetry!=='boolean'||
       !(row.phase===null||(typeof row.phase==='string'&&stages.has(row.phase)))||
       !(row.errorCode===null||typeof row.errorCode==='string'))
      throw new Error('INVALID_STATUS');
    Object.defineProperty(parsed,id,{value:{...row,errorCode:row.errorCode===null?null:
      safeBuildErrorCode(row.errorCode)},enumerable:true,configurable:true,writable:true});
  }
  return parsed;
}

export async function fetchSceneStatusRows(ids:readonly string[],signal:AbortSignal,
  fetcher:typeof fetch=fetch):Promise<Record<string,SceneBatchRow>>{
  const rows:Record<string,SceneBatchRow>={};
  for(let offset=0;offset<ids.length;offset+=BATCH_SIZE){
    if(signal.aborted)throw new DOMException('Aborted','AbortError');
    const batch=ids.slice(offset,offset+BATCH_SIZE);
    const query=new URLSearchParams();
    for(const id of batch)query.append('versionId',id);
    const response=await fetcher('/api/scene-build-jobs?'+query.toString(),{
      cache:'no-store',credentials:'same-origin',signal,
    });
    if(response.status===401||response.status===403)
      throw new SceneStatusAccessError();
    if(!response.ok)throw new Error('STATUS_TRANSPORT');
    const next=parseRows(await response.json(),batch);
    Object.assign(rows,next);
  }
  return rows;
}
class SceneStatusAccessError extends Error {}

/** One controller owns one displayed list. Sequence checks protect even when
 * fetch or response.json ignores AbortSignal and settles after cancellation. */
export class SceneStatusController {
  private sequence=0;
  private active=true;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private abort:AbortController|undefined;
  private pendingIds:string[]=[];
  private failures=0;
  private snapshot:SceneStatusSnapshot=empty;
  private goodRows:Record<string,SceneBatchRow>={};
  constructor(private readonly ids:readonly string[],
    private readonly publish:(snapshot:SceneStatusSnapshot)=>void,
    private readonly visible:()=>boolean,
    private readonly fetcher:typeof fetch=fetch){}
  start(){if(this.ids.length&&this.visible())void this.request();}
  refresh(){
    this.invalidate();
    this.pendingIds=[];this.failures=0;this.goodRows={};
    this.emit(empty);
    if(this.active&&this.ids.length&&this.visible())void this.request();
  }
  visibilityChanged(){
    this.invalidate();
    this.pendingIds=[];this.failures=0;this.goodRows={};
    this.emit(empty);
    if(this.active&&this.ids.length&&this.visible())void this.request();
  }
  dispose(){this.active=false;this.invalidate();}
  private invalidate(){
    this.sequence++;
    if(this.timer)clearTimeout(this.timer);
    this.timer=undefined;
    this.abort?.abort();this.abort=undefined;
  }
  private emit(snapshot:SceneStatusSnapshot){
    this.snapshot=snapshot;
    if(this.active)this.publish(snapshot);
  }
  private schedule(sequence:number){
    if(!this.active||sequence!==this.sequence||!this.visible())return;
    this.timer=setTimeout(()=>{
      this.timer=undefined;
      if(this.active&&sequence===this.sequence&&this.visible())void this.request(this.pendingIds);
    },POLL_MS);
  }
  private async request(requestIds:readonly string[]=this.ids){
    this.invalidate();
    if(!this.active||!this.visible())return;
    const sequence=this.sequence;
    const abort=new AbortController();this.abort=abort;
    this.emit({...this.snapshot,loading:true});
    try{
      const rows=await fetchSceneStatusRows(requestIds,abort.signal,this.fetcher);
      if(!this.active||sequence!==this.sequence)return;
      const merged=requestIds===this.ids?rows:{...this.goodRows};
      if(requestIds!==this.ids){
        for(const id of requestIds)delete merged[id];
        Object.assign(merged,rows);
      }
      this.goodRows=merged;
      this.pendingIds=this.ids.filter(id=>merged[id]?.polling);
      this.failures=0;
      this.emit({rows:merged,loading:false,loadError:false});
      if(this.pendingIds.length)this.schedule(sequence);
    }catch(error){
      if(!this.active||sequence!==this.sequence)return;
      if(error instanceof SceneStatusAccessError){
        this.pendingIds=[];this.failures=MAX_TRANSPORT_FAILURES;
      }else{
        this.failures++;
      }
      // A failed lookup never preserves a previously approved Retry action.
      this.emit({rows:{},loading:false,loadError:true});
      if(this.pendingIds.length&&this.failures<MAX_TRANSPORT_FAILURES)this.schedule(sequence);
    }finally{
      if(this.active&&sequence===this.sequence)this.abort=undefined;
    }
  }
}
