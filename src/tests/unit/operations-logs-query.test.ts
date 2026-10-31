import { afterEach, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile, unlink, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseLogQuery, queryOperationLogs } from '../../server/logging/query';

const roots:string[]=[];
async function directory(){const path=await mkdtemp(join(tmpdir(),'r1-logs-'));await chmod(path,0o700);roots.push(path);return path;}
afterEach(async()=>{vi.useRealTimers();vi.restoreAllMocks();for(const root of roots.splice(0)) await rm(root,{recursive:true,force:true});});
function url(query=''){return 'https://cad.example.test/api/operations/logs'+(query?'?'+query:'');}
function line(id:string,stamp:string,extra:Record<string,unknown>={}){
  return JSON.stringify({logId:id,timestamp:stamp,schemaVersion:1,level:'info',event:'http_request_completed',
    source:'app',component:'api',operation:'cad_list',appVersion:'0.49.0',...extra})+'\n';
}
async function file(dir:string,lines:string){const name='app-1760000000000-'+'a'.repeat(32)+'-0000.jsonl';
  await writeFile(join(dir,name),lines,{mode:0o600});return name;}

test('TC-R1-003/004: filters precede pagination and repeated cursor is idempotent',async()=>{
  const dir=await directory(),now=Date.now(),stamp=new Date(now-1000).toISOString();
  const target=randomUUID();let lines='';
  for(let n=0;n<240;n++) lines+=line(randomUUID(),stamp,{requestId:n<230?randomUUID():target});
  await file(dir,lines);
  const query=parseLogQuery(url('requestId='+target+'&limit=3'),now);
  const first=await queryOperationLogs(query,'actor',{directory:dir});
  expect(first.items).toHaveLength(3);expect(first.nextCursor).toBeTruthy();
  const secondQuery=parseLogQuery(url('requestId='+target+'&limit=3&cursor='+first.nextCursor),now+1000);
  const second=await queryOperationLogs(secondQuery,'actor',{directory:dir});
  expect(second).toEqual(await queryOperationLogs(secondQuery,'actor',{directory:dir}));
  const ids=[...first.items,...second.items].map(row=>row.logId);
  expect(new Set(ids).size).toBe(6);
  await expect(queryOperationLogs(secondQuery,'other',{directory:dir})).rejects.toMatchObject({status:410});
  await expect(queryOperationLogs(parseLogQuery(url('event=http_request_started&cursor='+first.nextCursor),now),
    'actor',{directory:dir})).rejects.toMatchObject({status:410});
});
test('TC-R1-005: raw shaped fields and corrupt lines cannot escape DTO',async()=>{
  const dir=await directory(),stamp=new Date(Date.now()-1000).toISOString();
  await file(dir,line(randomUUID(),stamp,{password:'canary',stack:'secret',errorCode:'SECRET_CANARY',
    stage:'secretstage'})+'{bad\n'+line(randomUUID(),stamp,{event:'secret_canary'})+'partial');
  const result=await queryOperationLogs(parseLogQuery(url()),'actor',{directory:dir});
  expect(result.items).toHaveLength(1);expect(result.skippedLines).toBeGreaterThanOrEqual(2);
  expect(JSON.stringify(result)).not.toContain('canary');
  expect(JSON.stringify(result)).not.toContain('secret');
});
test('TC-R1-003/005: query validation, disabled, unsafe mode and rotation',async()=>{
  const dir=await directory(),now=Date.now();
  for(const text of ['limit=101','x=1','event=x&event=y','from=bad','to=bad','source=../../etc',
    'level=','event=','requestId=','source='])
    expect(()=>parseLogQuery(url(text),now)).toThrow();
  const disabled=await queryOperationLogs(parseLogQuery(url(),now),'actor',{directory:dir,enabled:false});
  expect(disabled.status).toBe('disabled');
  const name=await file(dir,line(randomUUID(),new Date(now-1000).toISOString())+line(randomUUID(),new Date(now-2000).toISOString()));
  const first=await queryOperationLogs(parseLogQuery(url('limit=1'),now),'actor',{directory:dir});
  await unlink(join(dir,name));
  await expect(queryOperationLogs(parseLogQuery(url('limit=1&cursor='+first.nextCursor),now),'actor',
    {directory:dir})).rejects.toMatchObject({status:410});
  await symlink('/etc/passwd',join(dir,name));
  const result=await queryOperationLogs(parseLogQuery(url(),now),'actor',{directory:dir});
  expect(result.items).toHaveLength(0);
  await chmod(dir,0o755);
  await expect(queryOperationLogs(parseLogQuery(url(),now),'actor',{directory:dir})).rejects.toMatchObject({status:503});
});
test('TC-R1-004: identical timestamps sort by logId across complete pages; cursor expires',async()=>{
  const dir=await directory(),now=Date.now(),stamp=new Date(now-1000).toISOString();
  const ids=Array.from({length:11},()=>randomUUID());
  await file(dir,ids.map(id=>line(id,stamp)).join(''));
  const collected:string[]=[];let cursor:string|null=null;
  do{const q=parseLogQuery(url('limit=3'+(cursor?'&cursor='+cursor:'')),now);
    const result=await queryOperationLogs(q,'actor',{directory:dir});
    collected.push(...result.items.map(row=>row.logId));cursor=result.nextCursor;
  }while(cursor);
  expect(collected).toEqual([...ids].sort().reverse());
  const initial=await queryOperationLogs(parseLogQuery(url('limit=1'),now),'actor',{directory:dir});
  vi.useFakeTimers();vi.setSystemTime(now+121000);
  await expect(queryOperationLogs(parseLogQuery(url('limit=1&cursor='+initial.nextCursor),now+121000),
    'actor',{directory:dir})).rejects.toMatchObject({status:410});
});
test('TC-R1-005: too many files are explicitly partial and file mode is enforced',async()=>{
  const dir=await directory(),stamp=new Date(Date.now()-1000).toISOString();
  for(let n=0;n<17;n++) await writeFile(join(dir,'app-'+String(1760000000000+n)+'-'+
    'b'.repeat(32)+'-0000.jsonl'),line(randomUUID(),stamp),{mode:0o600});
  const result=await queryOperationLogs(parseLogQuery(url()),'actor',{directory:dir});
  expect(result.status).toBe('partial');expect(result.scanTruncated).toBe(true);
  expect(result.items).toHaveLength(16);
});
test('TC-R1-005: directory enumeration stops after 4097 entries and reports partial',async()=>{
  const dir=await directory();
  for(let n=0;n<4097;n++) await writeFile(join(dir,'noise-'+String(n).padStart(4,'0')),'');
  const result=await queryOperationLogs(parseLogQuery(url()),'actor',{directory:dir});
  expect(result.status).toBe('partial');
  expect(result.scanTruncated).toBe(true);
  expect(result.items).toHaveLength(0);
});
test('TC-R1-005: monotonic deadline truncates before a wall clock rollback could extend scan',async()=>{
  const dir=await directory();
  await file(dir,line(randomUUID(),new Date(Date.now()-1000).toISOString()));
  vi.spyOn(performance,'now').mockReturnValueOnce(0).mockReturnValue(2101);
  const result=await queryOperationLogs(parseLogQuery(url()),'actor',{directory:dir});
  expect(result.status).toBe('partial');
  expect(result.scanTruncated).toBe(true);
});
