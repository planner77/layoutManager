import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {SceneStatusController,fetchSceneStatusRows,uniqueSceneVersionIds,type SceneStatusSnapshot} from '../../features/cad-list/scene-status-controller';
import type {SceneBatchRow} from '../../server/scene/scene-build-status-batch';
const row=(state:'RUNNING'|'FAILED'|'READY'='RUNNING',canRetry=false):SceneBatchRow=>({
  state,label:{RUNNING:'생성 중',FAILED:'생성 실패',READY:'Scene 완료'}[state],tone:state==='FAILED'?'error':state==='READY'?'success':'pending',
  polling:state==='RUNNING',phase:null,errorCode:null,canRetry,
});
const response=(rows:Record<string,SceneBatchRow>,status=200)=>({ok:status===200,status,json:async()=>({rows})}) as Response;
const deferred=<T>()=>{let resolve!:(v:T)=>void;let reject!:(e:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const ids=(n:number)=>Array.from({length:n},(_,i)=>`id-${i}`);
beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
describe('L05 bounded status controller',()=>{
  it('requests all 205 unique IDs in sequential batches, including reordered duplicates',async()=>{
    const all=ids(205),calls:string[][]=[];let inFlight=0,maxFlight=0;
    const fetcher=vi.fn(async(url:RequestInfo|URL)=>{inFlight++;maxFlight=Math.max(maxFlight,inFlight);
      const batch=new URL(String(url),'http://localhost').searchParams.getAll('versionId');calls.push(batch);
      await Promise.resolve();inFlight--;return response(Object.fromEntries(batch.map(id=>[id,row('READY')])));
    }) as unknown as typeof fetch;
    const unique=uniqueSceneVersionIds([all[2],all[0],all[2],...all]);
    const result=await fetchSceneStatusRows(unique,new AbortController().signal,fetcher);
    expect(calls.map(batch=>batch.length)).toEqual([100,100,5]);
    expect(calls.flat()).toEqual(unique);expect(Object.keys(result)).toHaveLength(205);expect(maxFlight).toBe(1);
    expect(Object.keys(await fetchSceneStatusRows([],new AbortController().signal,fetcher))).toHaveLength(0);
  });
  it('ignores late JSON and errors after visibility, refresh and disposal despite ignored abort',async()=>{
    const first=deferred<unknown>();let calls=0;
    const fetcher=vi.fn(async()=>{calls++;if(calls===1)return {ok:true,status:200,json:()=>first.promise} as Response;
      return response({a:row('READY')});}) as unknown as typeof fetch;
    const snapshots:SceneStatusSnapshot[]=[];let visible=true;
    const c=new SceneStatusController(['a'],x=>snapshots.push(x),()=>visible,fetcher);
    c.start();await tick();visible=false;c.visibilityChanged();visible=true;c.visibilityChanged();await tick();
    first.resolve({rows:{a:row('FAILED',true)}});await tick();
    expect(snapshots.at(-1)).toMatchObject({rows:{a:{state:'READY',canRetry:false}},loading:false,loadError:false});
    await vi.advanceTimersByTimeAsync(15000);expect(calls).toBe(2);
    c.dispose();await vi.advanceTimersByTimeAsync(15000);expect(calls).toBe(2);
    const late=deferred<Response>();const old=new SceneStatusController(['old'],vi.fn(),()=>true,
      vi.fn(()=>late.promise) as unknown as typeof fetch);
    old.start();old.dispose();late.reject(new Error('private'));await tick();
  });
  it('manual refresh supersedes a late JSON rejection without restoring error, loading or timer',async()=>{
    const oldJson=deferred<unknown>();let calls=0;
    const fetcher=vi.fn(async()=>{
      calls++;return calls===1?{ok:true,status:200,json:()=>oldJson.promise} as Response:
        response({a:row('READY')});
    }) as unknown as typeof fetch;
    const snapshots:SceneStatusSnapshot[]=[];
    const c=new SceneStatusController(['a'],x=>snapshots.push(x),()=>true,fetcher);
    c.start();await tick();c.refresh();await tick();
    const published=snapshots.length;
    oldJson.reject(new Error('private old failure'));await tick();
    expect(snapshots).toHaveLength(published);
    expect(snapshots.at(-1)).toMatchObject({rows:{a:{state:'READY'}},loading:false,loadError:false});
    await vi.advanceTimersByTimeAsync(15000);expect(calls).toBe(2);c.dispose();
  });
  it('hidden/disposed controllers publish nothing after stale completion and start no timers',async()=>{
    const old=deferred<Response>();const publish=vi.fn();let visible=true;
    const fetcher=vi.fn(()=>old.promise) as unknown as typeof fetch;
    const c=new SceneStatusController(['a'],publish,()=>visible,fetcher);
    c.start();const before=publish.mock.calls.length;
    visible=false;c.visibilityChanged();expect(publish).toHaveBeenCalledTimes(before+1);
    old.resolve(response({a:row()}));await tick();
    expect(publish).toHaveBeenCalledTimes(before+1);
    await vi.advanceTimersByTimeAsync(15000);expect(fetcher).toHaveBeenCalledTimes(1);
    c.dispose();const after=publish.mock.calls.length;
    await vi.advanceTimersByTimeAsync(15000);expect(publish).toHaveBeenCalledTimes(after);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const emptyPublish=vi.fn(),emptyFetch=vi.fn() as unknown as typeof fetch;
    const emptyController=new SceneStatusController([],emptyPublish,()=>true,emptyFetch);
    emptyController.start();await vi.advanceTimersByTimeAsync(15000);
    expect(emptyFetch).not.toHaveBeenCalled();emptyController.dispose();
  });
  it('commits no partial rows or retry authority when a later batch fails',async()=>{
    let calls=0;const fetcher=vi.fn(async(url:RequestInfo|URL)=>{
      calls++;if(calls===2)throw new Error('private failure');
      const batch=new URL(String(url),'http://localhost').searchParams.getAll('versionId');
      return response(Object.fromEntries(batch.map(id=>[id,row('FAILED',true)])));
    }) as unknown as typeof fetch;
    const snapshots:SceneStatusSnapshot[]=[];
    const c=new SceneStatusController(ids(101),x=>snapshots.push(x),()=>true,fetcher);
    c.start();await tick();expect(calls).toBe(2);
    expect(snapshots.at(-1)).toMatchObject({rows:{},loadError:true,loading:false});
    await vi.advanceTimersByTimeAsync(15000);expect(calls).toBe(2);c.dispose();
  });
  it('polls only pending IDs and preserves terminal rows until all become READY',async()=>{
    const urls:string[][]=[];
    const fetcher=vi.fn(async(url:RequestInfo|URL)=>{
      urls.push(new URL(String(url),'http://localhost').searchParams.getAll('versionId'));
      return urls.length===1?response({ready:row('READY'),pending:row()}):
        response({pending:row('READY')});
    }) as unknown as typeof fetch;
    const snapshots:SceneStatusSnapshot[]=[];
    const c=new SceneStatusController(['ready','pending'],x=>snapshots.push(x),()=>true,fetcher);
    c.start();await tick();await vi.advanceTimersByTimeAsync(5000);
    expect(urls).toEqual([['ready','pending'],['pending']]);
    expect(snapshots.at(-1)?.rows).toMatchObject({ready:{state:'READY'},pending:{state:'READY'}});
    await vi.advanceTimersByTimeAsync(15000);expect(urls).toHaveLength(2);c.dispose();
  });
  it('removes a requested pending row omitted by server while preserving unrelated READY',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(response({ready:row('READY'),pending:row()}))
      .mockResolvedValueOnce(response({})) as unknown as typeof fetch;
    const snapshots:SceneStatusSnapshot[]=[];
    const c=new SceneStatusController(['ready','pending'],x=>snapshots.push(x),()=>true,fetcher);
    c.start();await tick();await vi.advanceTimersByTimeAsync(5000);
    expect(snapshots.at(-1)?.rows).toEqual({ready:row('READY')});
    await vi.advanceTimersByTimeAsync(15000);expect(fetcher).toHaveBeenCalledTimes(2);c.dispose();
  });
  it('polls pending only, stops after three transport failures and resumes manually',async()=>{
    let calls=0;const fetcher=vi.fn(async()=>{calls++;if(calls===1)return response({a:row()});
      if(calls<5)throw new Error('private');return response({a:row('READY')});}) as unknown as typeof fetch;
    const snapshots:SceneStatusSnapshot[]=[];const c=new SceneStatusController(['a'],x=>snapshots.push(x),()=>true,fetcher);
    c.start();await tick();await vi.advanceTimersByTimeAsync(15000);
    expect(calls).toBe(4);expect(snapshots.at(-1)).toMatchObject({rows:{},loadError:true,loading:false});
    await vi.advanceTimersByTimeAsync(30000);expect(calls).toBe(4);
    c.refresh();await tick();expect(calls).toBe(5);
    expect(snapshots.at(-1)).toMatchObject({rows:{a:{state:'READY'}},loadError:false});
    await vi.advanceTimersByTimeAsync(30000);expect(calls).toBe(5);c.dispose();
  });
  it('does not auto-repeat initial/terminal errors and clears retry rows on 403',async()=>{
    let calls=0;const fetcher=vi.fn(async()=>{calls++;if(calls===1)throw new Error('private');
      if(calls===2)return response({a:row('FAILED',true)});return response({},403);}) as unknown as typeof fetch;
    const snapshots:SceneStatusSnapshot[]=[];const c=new SceneStatusController(['a'],x=>snapshots.push(x),()=>true,fetcher);
    c.start();await tick();await vi.advanceTimersByTimeAsync(30000);expect(calls).toBe(1);
    c.refresh();await tick();expect(snapshots.at(-1)?.rows.a.canRetry).toBe(true);
    c.refresh();await tick();expect(snapshots.at(-1)).toMatchObject({rows:{},loadError:true});
    await vi.advanceTimersByTimeAsync(30000);expect(calls).toBe(3);c.dispose();
  });
  it('normalizes prototype-shaped private diagnostics to UNKNOWN',async()=>{
    for(const code of ['__proto__','constructor','private/token/path']){
      const fetcher=vi.fn(async()=>response({a:{...row('FAILED'),errorCode:code as never}})) as unknown as typeof fetch;
      const rows=await fetchSceneStatusRows(['a'],new AbortController().signal,fetcher);
      expect(rows.a.errorCode).toBe('UNKNOWN');
    }
  });
  it('rejects malformed or out-of-batch rows as safe lookup failure',async()=>{
    for(const body of [{rows:[]},{rows:{a:{state:'FAILED',canRetry:true}}},
      {rows:{private:row('FAILED',true)}},
      {rows:{a:{...row('FAILED'),label:'private/token/path'}}},null]){
      const fetcher=vi.fn(async()=>({ok:true,status:200,json:async()=>body})) as unknown as typeof fetch;
      const snapshots:SceneStatusSnapshot[]=[];const c=new SceneStatusController(['a'],x=>snapshots.push(x),()=>true,fetcher);
      c.start();await tick();expect(snapshots.at(-1)).toMatchObject({rows:{},loadError:true});c.dispose();
    }
  });
});
