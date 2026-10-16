/** Opt-in reproducible DXF spatial/index/geometry benchmark.
 * No user CAD, DB, network, or saved artifacts. CLI:
 * npm run test:outline-benchmark           # 1k, 10k, 100k synthetic LINE
 * npm run test:outline-benchmark -- --quick # 1k only
 * JSON to stdout (run metadata and observed timing/heap, never synthetic SLA).
 */
import {parseDxfOutlineIndex,type OutlineEntity} from '../../viewers/core/outline-geometry';
import {computeOutline} from '../../viewers/core/outline-compute';
import {SelectionSpatialIndex} from '../../viewers/three-dxf-viewer/selection-spatial-index';
import {cpus,totalmem} from 'node:os';
import {performance} from 'node:perf_hooks';

const sha='b'.repeat(64),version='11111111-1111-4111-8111-111111111111';
function syntheticDxf(count:number):string {
  const parts=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
    '0','SECTION','2','ENTITIES'];
  for(let i=0;i<count;i++){
    const x=(i%500)*4,y=Math.floor(i/500)*4;
    parts.push('0','LINE','5',(i+1).toString(16).toUpperCase(),
      '8','BENCH','10',String(x),'20',String(y),
      '11',String(x+1),'21',String(y+1));
  }
  parts.push('0','ENDSEC','0','EOF','');
  return parts.join('\n');
}
function rounded(n:number){return Math.round(n*100)/100;}
function time<T>(f:()=>T):{result:T;ms:number}{
  const start=performance.now(),result=f();
  return {result,ms:rounded(performance.now()-start)};
}
function benchmark(count:number){
  const heapBefore=process.memoryUsage().heapUsed;
  const {result:source,ms:fixtureMs}=time(()=>syntheticDxf(count));
  const {result:index,ms:parseMs}=time(()=>parseDxfOutlineIndex(source,version,sha));
  const {result:spatial,ms:spatialMs}=time(()=>new SelectionSpatialIndex(index.entities));
  const box:[number,number,number,number]=[100,20,101,21];
  const {result:candidates,ms:queryMs}=time(()=>spatial.query(box));
  const sample=index.entities.slice(0,Math.min(1000,index.entities.length));
  const {result:convex,ms:convexMs}=time(()=>computeOutline('CONVEX',sample));
  const actualHeap=process.memoryUsage().heapUsed;
  const info={
    requestedEntities:count,parsedEntities:index.entities.length,
    unitCode:index.unitCode,sourceByteLength:Buffer.byteLength(source,'utf8'),
    fixtureMs,parseMs,spatialMs,spatialBuildMs:rounded(spatial.buildMs),
    indexAssignments:spatial.assignmentCount,overflow:spatial.overflowCount,
    queryMs,candidateCount:candidates.length,convexMs,
    convexInnerMs:rounded(convex.durationMs),
    approximateHeapDeltaBytes:actualHeap-heapBefore,
    warnings:index.warnings.length,
  };
  if(index.entities.length!==count)throw new Error('Incomplete synthetic parse for '+count);
  return info;
}
const quick=process.argv.includes('--quick');
const sizes=quick?[1000]:[1000,10000,100000];
const report={
  schemaVersion:1,
  testKind:'synthetic-not-operational-acceptance',
  platform:process.platform,arch:process.arch,node:process.version,
  cpus:cpus().length,totalMemoryBytes:totalmem(),
  timestamp:new Date().toISOString(),
  cases:sizes.map(benchmark),
  caveats:[
    'No browser/renderer GPU or Web Worker postMessage transfer time measured.',
    'Heap delta is approximate and includes GC noise; not a peak RSS measurement.',
    'Real factory DXF, HATCH/BLOCK performance, memory and latency are not validated.',
    'No fixed SLA; compare multiple runs on identical hardware before acceptance.',
  ],
};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
