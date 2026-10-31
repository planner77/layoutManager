import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, opendir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import type { LogEntryDto, OperationLogsResult } from '@/domain/operations-logs';
import { safeMessages, safeCadMessages, objectStorageCodes } from '@/server/upload-error-catalog';
import { logStoreOptions } from './store';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[a-f0-9]{12}$/i;
const TOKEN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const EVENT = /^[a-z][a-z0-9_]{0,63}$/;
const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const FILE = /^(app|maintenance)-[0-9]{13}-[a-f0-9]{32}-[0-9]{4,16}\.jsonl$/;
const MAX_SCAN = 32*1024*1024, MAX_FILE = 8*1024*1024, MAX_LINE = 16384;
const TTL = 120000, MAX_SNAPSHOTS = 8, MAX_SNAPSHOT_BYTES = 8*1024*1024;
const levels = ['debug','info','warn','error'] as const;
const outcomes = ['started','success','warning','failure'] as const;
const stages = new Set(['request_received','origin_validation','context_initialization','upload_receive',
  'upload_validation','storage_publish','database_registration','compensation','temporary_cleanup',
  'response','authorization','validation','database_read','database_write','storage_cleanup',
  'cache_revalidate','result','startup_check','initialization','cleanup','connection','migration','recovery']);
const events=new Set(['http_request_started','http_request_stage','http_request_completed','http_request_failed',
  'cad_upload_request','cad_upload_stage','cad_upload_completed','cad_delete_cleanup_pending',
  'cache_revalidation_failed','health_check_recovered','health_check_failed',
  'maintenance_job_started','maintenance_job_stage','maintenance_job_completed']);
const components=new Set(['api','upload','maintenance','application']);
const operations=new Set(['cad_upload','cad_list','cad_delete','cad_content','cad_location','cad_set_current',
  'health','floor_reclassify','master_list','master_create','master_update','master_delete',
  'business_outline_list','business_outline_create','business_outline_read','business_outline_change',
  'business_memo_list','business_memo_create','business_memo_read','business_memo_change',
  'business_memo_anchor','business_memo_group_create','business_memo_group_change','business_memo_search',
  'business_scene_origin_reset','scene_status','scene_publish','scene_content',
  'outline_type_list','outline_type_create','outline_type_update','outline_type_access',
  'database_check','storage_cleanup','delete_password_backfill','unspecified']);
const errorCodes=new Set([...Object.keys(safeMessages),...Object.keys(safeCadMessages),...objectStorageCodes,
  'SERVER_ERROR','HEALTH_UNAVAILABLE','STORAGE_CLEANUP_PENDING','STORAGE_CLEANUP_FAILED',
  'DATABASE_CHECK_FAILED','DELETE_PASSWORD_BACKFILL_FAILED','DELETE_RATE_LIMITED','INVALID_DELETE_PASSWORD',
  'REQUEST_TOO_LARGE','IMMUTABLE_MASTER','INVALID_MASTER_TYPE','INVALID_MASTER_NAME',
  'INVALID_SITE_KIND','INVALID_PARENT','INVALID_ACTIVE','INVALID_LOCATION_CHAIN',
  'INACTIVE_LOCATION_CHAIN','DUPLICATE_MASTER','MASTER_REFERENCED','MASTER_NOT_FOUND',
  'UNCLASSIFIED_IMMUTABLE','RECLASSIFY_NOT_ALLOWED','INACTIVE_MASTER',
  'RECLASSIFY_COLLISION','KDF_BUSY']);
export class OperationLogsQueryError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
type Filters = Readonly<{from:string;to:string;level?:string;event?:string;operation?:string;
  component?:string;source?:string;outcome?:string;requestId?:string;jobId?:string;errorCode?:string}>;
export type LogQuery = Readonly<{filters:Filters;limit:number;filterKey:string;cursor?:string}>;
function exactUtc(raw: string): boolean { return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw) &&
  Number.isFinite(Date.parse(raw)) && new Date(raw).toISOString() === raw; }
export function parseLogQuery(url: string, now=Date.now()): LogQuery {
  const params = new URL(url).searchParams;
  const allowed = new Set(['from','to','level','event','operation','component','source','outcome',
    'requestId','jobId','errorCode','limit','cursor']);
  for (const key of params.keys()) if (!allowed.has(key) || params.getAll(key).length !== 1)
    throw new OperationLogsQueryError('INVALID_LOG_QUERY',400);
  const read=(key:string)=>params.get(key)??undefined;
  const to=read('to')??new Date(now).toISOString();
  if(!exactUtc(to)) throw new OperationLogsQueryError('INVALID_LOG_QUERY',400);
  const from=read('from')??new Date(Date.parse(to)-3600000).toISOString();
  if (!exactUtc(from)||!exactUtc(to)||Date.parse(from)>=Date.parse(to)||
      Date.parse(to)>now+60000||Date.parse(from)<now-logStoreOptions().retentionMs||
      Date.parse(to)-Date.parse(from)>86400000) throw new OperationLogsQueryError('INVALID_LOG_QUERY',400);
  const filters: Filters={from,to};
  for(const key of ['level','event','operation','component','source','outcome','requestId','jobId','errorCode'] as const) {
    const value=read(key);
    if(value!==undefined){
      if(value.length===0) throw new OperationLogsQueryError('INVALID_LOG_QUERY',400);
      (filters as Record<string,string>)[key]=value;
    }
  }
  if (filters.level && !levels.includes(filters.level as typeof levels[number]) ||
      filters.outcome && !outcomes.includes(filters.outcome as typeof outcomes[number]) ||
      filters.source && !['app','maintenance'].includes(filters.source) ||
      filters.event && !EVENT.test(filters.event) ||
      filters.operation && !TOKEN.test(filters.operation) ||
      filters.component && !TOKEN.test(filters.component) ||
      filters.errorCode && !CODE.test(filters.errorCode) ||
      filters.requestId && !UUID.test(filters.requestId) || filters.jobId && !UUID.test(filters.jobId))
    throw new OperationLogsQueryError('INVALID_LOG_QUERY',400);
  const rawLimit=read('limit');
  const limit=rawLimit===undefined?50:Number(rawLimit);
  if(rawLimit!==undefined&&!/^[1-9][0-9]{0,2}$/.test(rawLimit)||!Number.isInteger(limit)||limit>100)
    throw new OperationLogsQueryError('INVALID_LOG_QUERY',400);
  const cursor=read('cursor');
  if(cursor!==undefined&&!/^[A-Za-z0-9_-]{43}$/.test(cursor))
    throw new OperationLogsQueryError('INVALID_LOG_QUERY',400);
  const filterKey=JSON.stringify([...params.entries()].filter(([key])=>key!=='cursor'&&key!=='limit').sort());
  return {filters,limit,filterKey,...(cursor?{cursor}:{})};
}
function dto(raw: unknown): LogEntryDto|null {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return null;
  const o=raw as Record<string,unknown>;
  if(o.schemaVersion!==1||typeof o.logId!=='string'||!UUID.test(o.logId)||
      typeof o.timestamp!=='string'||!exactUtc(o.timestamp)||
      !levels.includes(o.level as typeof levels[number])||typeof o.event!=='string'||!events.has(o.event)||
      !['app','maintenance'].includes(String(o.source))||
      typeof o.component!=='string'||!components.has(o.component)||
      typeof o.operation!=='string'||!operations.has(o.operation)||
      typeof o.appVersion!=='string'||!/^\d+\.\d+\.\d+$/.test(o.appVersion)) return null;
  const item: Record<string,unknown>={logId:o.logId,timestamp:o.timestamp,level:o.level,event:o.event,
    source:o.source,component:o.component,operation:o.operation,appVersion:o.appVersion};
  if(typeof o.requestId==='string'&&UUID.test(o.requestId)) item.requestId=o.requestId;
  if(typeof o.jobId==='string'&&UUID.test(o.jobId)) item.jobId=o.jobId;
  if(outcomes.includes(o.outcome as typeof outcomes[number])) item.outcome=o.outcome;
  if(typeof o.elapsedMs==='number'&&Number.isSafeInteger(o.elapsedMs)&&o.elapsedMs>=0&&o.elapsedMs<=86400000) item.elapsedMs=o.elapsedMs;
  if(typeof o.errorCode==='string'&&errorCodes.has(o.errorCode)) item.errorCode=o.errorCode;
  if(typeof o.httpStatus==='number'&&Number.isInteger(o.httpStatus)&&o.httpStatus>=100&&o.httpStatus<=599) item.httpStatus=o.httpStatus;
  if(typeof o.stage==='string'&&stages.has(o.stage)) item.stage=o.stage;
  return item as LogEntryDto;
}
function matches(row:LogEntryDto,f:Filters):boolean {
  if(row.timestamp<f.from||row.timestamp>f.to) return false;
  for(const key of ['level','event','operation','component','source','outcome','requestId','jobId','errorCode'] as const)
    if(f[key]!==undefined&&row[key]!==f[key]) return false;
  return true;
}
type FileIdentity={name:string;dev:number;ino:number;size:number;mtimeMs:number};
type Snapshot={actor:string;filter:string;rows:LogEntryDto[];files:FileIdentity[];
  expires:number;bytes:number;skipped:number;partial:boolean;status:'ok'|'partial'|'disabled'};
const snapshots=new Map<string,Snapshot>();
const cursors=new Map<string,{id:string;offset:number}>();
function cleanup(now:number){for(const [key,s] of snapshots) if(s.expires<=now) snapshots.delete(key);
  for(const [token,cursor] of cursors) if(!snapshots.has(cursor.id)) cursors.delete(token);}
function snapshotBytes(){let total=0;for(const s of snapshots.values()) total+=s.bytes;return total;}
function page(s:Snapshot,offset:number,limit:number,id:string):OperationLogsResult {
  const items:LogEntryDto[]=[];let size=0,index=offset;
  while(index<s.rows.length&&items.length<limit){const item=s.rows[index],bytes=Buffer.byteLength(JSON.stringify(item));
    if(size+bytes>256*1024) break;items.push(item);size+=bytes;index++;}
  if(index===offset&&index<s.rows.length) throw new OperationLogsQueryError('LOG_RESPONSE_LIMIT',503);
  let nextCursor:string|null=null;
  if(index<s.rows.length){
    for(const [token,cursor] of cursors) if(cursor.id===id&&cursor.offset===index){nextCursor=token;break;}
    if(!nextCursor){nextCursor=randomBytes(32).toString('base64url');cursors.set(nextCursor,{id,offset:index});}
  }
  return {items,nextCursor,sourceCoverage:'app-structured-only',
    status:s.status,skippedLines:s.skipped,scanTruncated:s.partial};
}
async function filesStillCurrent(directory:string,files:FileIdentity[]) {
  try{const parent=await lstat(directory);
    if(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==process.getuid?.()||
      (parent.mode&0o077)!==0) return false;
  }catch{return false;}
  for(const file of files){try{const stat=await lstat(join(directory,file.name));
    if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid?.()||
      (stat.mode&0o077)!==0||stat.nlink!==1||stat.dev!==file.dev||stat.ino!==file.ino||
      stat.size<file.size) return false;
  }catch{return false;}}return true;
}
export async function queryOperationLogs(query:LogQuery,actor:string,options:{directory?:string;enabled?:boolean}={}):Promise<OperationLogsResult>{
  const directory=options.directory??'/data/logs';const now=Date.now();cleanup(now);
  const filter=query.filterKey;
  if(query.cursor&&options.enabled===false) throw new OperationLogsQueryError('LOG_CURSOR_EXPIRED',410);
  if(query.cursor){const cursor=cursors.get(query.cursor),s=cursor?snapshots.get(cursor.id):undefined;
    if(!s||!cursor||s.expires<=now||s.actor!==actor||s.filter!==filter) throw new OperationLogsQueryError('LOG_CURSOR_EXPIRED',410);
    if(!(await filesStillCurrent(directory,s.files))){snapshots.delete(cursor.id);throw new OperationLogsQueryError('LOG_CURSOR_EXPIRED',410);}
    return page(s,cursor.offset,query.limit,cursor.id);
  }
  if(options.enabled===false) return {items:[],nextCursor:null,sourceCoverage:'app-structured-only',
    status:'disabled',skippedLines:0,scanTruncated:false};
  const names:string[]=[];let skipped=0,partial=false;
  const deadline=performance.now()+2000;
  try{const stat=await lstat(directory);
    if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid?.()||(stat.mode&0o077)!==0)
      throw new Error('LOG_DIRECTORY_UNSAFE');
    const dir=await opendir(directory);
    try{
      for(;;){
        if(performance.now()>deadline){partial=true;break;}
        const entry=await dir.read();
        if(!entry)break;
        if(names.length>=4096){partial=true;break;}
        names.push(entry.name);
      }
    }finally{await dir.close();}
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')
    return {items:[],nextCursor:null,sourceCoverage:'app-structured-only',status:'ok',skippedLines:0,scanTruncated:false};
    throw new OperationLogsQueryError('LOG_STORE_UNAVAILABLE',503);}
  const candidates=names.filter(name=>FILE.test(name)&&(!query.filters.source||name.startsWith(query.filters.source+'-'))).sort().reverse();
  if(candidates.length>16) partial=true;
  const selected=candidates.slice(0,16), files:FileIdentity[]=[], rows:LogEntryDto[]=[];
  let scanBytes=0;
  for(const name of selected){
    if(performance.now()>deadline){partial=true;break;}
    let handle:Awaited<ReturnType<typeof open>>|undefined;
    try{
      const before=await lstat(join(directory,name));
      if(!before.isFile()||before.isSymbolicLink()||before.uid!==process.getuid?.()||(before.mode&0o077)!==0||before.nlink!==1){skipped++;continue;}
      if(before.size>MAX_FILE||scanBytes+before.size>MAX_SCAN){partial=true;continue;}
      handle=await open(join(directory,name),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
      const stat=await handle.stat();
      if(!stat.isFile()||stat.uid!==process.getuid?.()||(stat.mode&0o077)!==0||stat.nlink!==1||
        stat.dev!==before.dev||stat.ino!==before.ino||stat.size!==before.size||stat.size>MAX_FILE){partial=true;continue;}
      const bytes=Buffer.alloc(stat.size);let offset=0;
      while(offset<bytes.length){const read=await handle.read(bytes,offset,bytes.length-offset,offset);
        if(read.bytesRead===0) break;offset+=read.bytesRead;if(performance.now()>deadline){partial=true;break;}}
      if(offset!==bytes.length){partial=true;continue;}
      files.push({name,dev:stat.dev,ino:stat.ino,size:stat.size,mtimeMs:stat.mtimeMs});scanBytes+=stat.size;
      const content=bytes.toString('utf8');const lines=content.split('\n');
      if(!content.endsWith('\n')){lines.pop();skipped++;}
      for(const line of lines){if(performance.now()>deadline){partial=true;break;}
        if(!line)continue;if(Buffer.byteLength(line)>MAX_LINE){skipped++;continue;}
        try{const row=dto(JSON.parse(line));if(row&&row.source===name.split('-')[0]&&matches(row,query.filters)) rows.push(row);
          else if(!row) skipped++;}catch{skipped++;}}
    }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'){partial=true;continue;}
      throw new OperationLogsQueryError('LOG_STORE_UNAVAILABLE',503);
    }finally{await handle?.close();}
  }
  rows.sort((a,b)=>b.timestamp.localeCompare(a.timestamp)||b.logId.localeCompare(a.logId));
  if(rows.length>1000){rows.length=1000;partial=true;}
  let bytes=Buffer.byteLength(JSON.stringify(rows));
  while(rows.length&&bytes>MAX_SNAPSHOT_BYTES){rows.pop();partial=true;bytes=Buffer.byteLength(JSON.stringify(rows));}
  const token=randomBytes(32).toString('base64url');
  const s:Snapshot={actor,filter,rows,files,expires:now+TTL,bytes,skipped,partial,
    status:partial||skipped>0?'partial':'ok'};
  while(snapshots.size>=MAX_SNAPSHOTS||snapshotBytes()+bytes>MAX_SNAPSHOT_BYTES){const first=snapshots.keys().next().value;
    if(!first)break;snapshots.delete(first);}
  snapshots.set(token,s);
  cleanup(now);
  return page(s,0,query.limit,token);
}
