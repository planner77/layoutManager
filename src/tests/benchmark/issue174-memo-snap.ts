/** R4 synthetic domain benchmark. 10k is aggregate target-query/store work, not one Viewer Memo capacity. */
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';
import {collectMemoSnapCandidates,MemoSessionSnapStore,type MemoSnapTarget} from '../../domain/memo-session-snap';

const scope={versionId:randomUUID(),sourceSha256:'a'.repeat(64)};
const transform=[1,0,0,1,0,0] as const;
const project=(p:{x:number;y:number})=>p;
function stats(values:number[]){
 const sorted=[...values].sort((a,b)=>a-b);
 return {p50Ms:sorted[Math.floor(sorted.length*0.5)],p95Ms:sorted[Math.floor(sorted.length*0.95)],
  maxMs:sorted.at(-1),over16_7ms:values.filter(n=>n>16.7).length};
}
function targets(count:number):MemoSnapTarget[]{
 return Array.from({length:count},(_,i)=>({ref:{...scope,origin:'GENERATED' as const,id:randomUUID()},
  transform,visible:true,points:[{kind:'VERTEX' as const,world:{x:i%200,y:Math.floor(i/200)}}]}));
}
const output=[];
for(const count of [1000,10000]){
 const rows=targets(count),queryMs=[];
 for(let run=0;run<25;run++){
  const start=performance.now();
  const result=collectMemoSnapCandidates(scope,{x:0,y:0},rows,project);
  queryMs.push(performance.now()-start);
  if(result.scannedPoints!==count)throw new Error('Unexpected query scan count');
 }
 // Each store remains within the product limit of 100 Memo bindings.
 const stores=Array.from({length:Math.ceil(count/100)},()=>new MemoSessionSnapStore(scope));
 let bound=0;
 for(let i=0;i<count;i++){
  const target=rows[i],memoId=randomUUID();
  stores[Math.floor(i/100)].attach(memoId,{ref:target.ref,transform,kind:'VERTEX',
   world:target.points[0].world,distancePx:0});
  bound++;
 }
 const reconciliationMs=[];
 for(let run=0;run<12;run++){
  const start=performance.now();
  for(let index=0;index<stores.length;index++)
   stores[index].reconcile(rows.slice(index*100,index*100+100));
  reconciliationMs.push(performance.now()-start);
 }
 const heapBefore=process.memoryUsage().heapUsed;
 for(const store of stores)store.clear();
 output.push({syntheticTargets:count,aggregateBindings:bound,stores:stores.length,
  query:stats(queryMs),aggregateReconciliation:stats(reconciliationMs),
  heapBeforeClearBytes:heapBefore,heapAfterClearBytes:process.memoryUsage().heapUsed,
  frameBudgetMs:16.7,oneViewerMemoLimit:100,oneViewer10000MemoClaim:false});
}
process.stdout.write(JSON.stringify({kind:'R4_SYNTHETIC_DOMAIN_BENCHMARK',results:output})+'\n');
