/** Owner-side P0/P5 diagnostic for an actual, locally held ASCII DXF.
 * Nothing is uploaded, persisted, or logged from the source itself.
 * This is SOURCE-ONLY CPU evidence; render mappings and GPU/browser require
 * a separate authorized interactive acceptance run.
 *
 * cd src && npm run audit:outline -- --file /private/drawing.dxf
 */
import {readFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cpus,totalmem} from 'node:os';
import {performance} from 'node:perf_hooks';
import {parseDxfOutlineIndex} from '../../viewers/core/outline-geometry';
import {SelectionSpatialIndex} from '../../viewers/three-dxf-viewer/selection-spatial-index';

const FILE_MAX=100*1024*1024;
const localVersionId='11111111-1111-4111-8111-111111111111';
const fileFlag=process.argv.indexOf('--file');
if(fileFlag<0||!process.argv[fileFlag+1]||process.argv.includes('--help')){
  process.stderr.write('Usage: npm run audit:outline -- --file /private/sample.dxf (read-only; UTF-8 ASCII DXF, <=100MiB)\n');
  process.exitCode=2;
}else{
  try{
    const filePath=process.argv[fileFlag+1];
    const meta=await stat(filePath);
    if(!meta.isFile()||meta.size<=0||meta.size>FILE_MAX)
      throw new Error('Unsupported drawing size or file type');
    const bytes=await readFile(filePath);
    const hash=createHash('sha256').update(bytes).digest('hex');
    let text:string;
    try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
    catch{throw new Error('This diagnostic supports UTF-8 ASCII DXF only.');}
    const heapBefore=process.memoryUsage();
    const parsingStarted=performance.now();
    const index=parseDxfOutlineIndex(text,localVersionId,hash);
    const sourceParseMs=performance.now()-parsingStarted;
    const spatialStarted=performance.now();
    const spatial=new SelectionSpatialIndex(index.entities);
    const spatialBuildMs=performance.now()-spatialStarted;
    const kindCounts:Record<string,number>={};
    for(const item of index.entities)kindCounts[item.entityType]=(kindCounts[item.entityType]??0)+1;
    const reference=index.entities[Math.floor(index.entities.length/2)];
    const queryBox: [number,number,number,number]=reference
      ? [reference.bounds[0]-1,reference.bounds[1]-1,
         reference.bounds[2]+1,reference.bounds[3]+1]
      : [0,0,1,1];
    const samples:number[]=[];
    let resultCount=0;
    for(let i=0;i<100;i++){
      const start=performance.now();
      resultCount=spatial.query(queryBox).length;
      samples.push(performance.now()-start);
    }
    samples.sort((a,b)=>a-b);
    const heapAfter=process.memoryUsage();
    const categorize=(message:string)=>{
      if(/OCS|Extrusion/i.test(message))return 'OCS/extrusion';
      if(/Bulge/i.test(message))return 'bulge';
      if(/INSERT|BLOCK/i.test(message))return 'block-or-insert';
      if(/Handle|SHA/i.test(message))return 'unstable-identity';
      if(/POLYLINE/i.test(message))return 'polyline';
      return 'other';
    };
    const warningTypes:Record<string,number>={};
    for(const warning of index.warnings){
      const key=categorize(warning);warningTypes[key]=(warningTypes[key]??0)+1;
    }
    const rounded=(value:number)=>Math.round(value*100)/100;
    // Output excludes file path, raw CAD records and user layer names.
    const report={
      schemaVersion:1,
      scope:'local-source-cpu-only-not-render-acceptance',
      timestamp:new Date().toISOString(),
      environment:{node:process.version,platform:process.platform,arch:process.arch,
        cpuCount:cpus().length,totalMemoryBytes:totalmem()},
      source:{fileBytes:bytes.length,sha256:hash,unitCode:index.unitCode,
        supportedEntityCount:index.entities.length,
        stableIdentityCount:index.entities.filter(e=>e.stable).length,
        types:kindCounts,warningsRetained:index.warnings.length,
        warningTypes,warningsCappedAt:200},
      cpu:{sourceParseMs:rounded(sourceParseMs),spatialBuildMs:rounded(spatialBuildMs),
        tileAssignments:spatial.assignmentCount,overflowEntities:spatial.overflowCount,
        queryCandidates:resultCount,queryP50Ms:rounded(samples[49]),
        queryP95Ms:rounded(samples[94]),heapDeltaBytes:heapAfter.heapUsed-heapBefore.heapUsed,
        rssDeltaBytes:heapAfter.rss-heapBefore.rss},
      limitations:[
        'Only supported ASCII DXF entities are indexed; source entity coverage may be partial.',
        'No Three.js render-entity reconciliation, browser Web Worker, GPU, or click latency measured.',
        'The real DXF source never leaves this process; store the JSON report only in an approved location.',
        'P0/P5 acceptance requires actual CAD inspection and repeated interactive measurement.',
      ],
    };
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
  }catch(error){
    // Do not include the path or raw CAD text from filesystem/parse exceptions.
    process.stderr.write('Offline DXF audit failed: '+(
      error instanceof Error&&error.message.startsWith('This diagnostic')
        ? error.message:'verify the input type, bounds and permissions')+'\n');
    process.exitCode=1;
  }
}
