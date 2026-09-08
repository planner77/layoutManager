import {test,expect,vi,afterEach} from 'vitest';
import {ViewerManager,type CadViewerAdapter} from '../../viewers/core/adapter';
import {ViewerSource} from '../../viewers/core/source';
import type {ViewerMetric} from '../../viewers/core/metrics';
afterEach(()=>vi.unstubAllGlobals());
const factory=async():Promise<CadViewerAdapter>=>({load:async()=>({empty:false,entityCount:1}),dispose:vi.fn(),fitToView:vi.fn(),zoomIn:vi.fn(),zoomOut:vi.fn()});
test('TC-MET-001: stages, reused source and unsupported measurements are explicit',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('test')));const source=new ViewerSource(),records:ViewerMetric[]=[];
  for(let i=0;i<2;i++) {const manager=new ViewerManager(factory,source,{renderer:'test',versionId:'id',report:m=>records.push(m)});await manager.load('/file','DXF');manager.dispose();}
  expect(records.map(r=>r.sourceMode)).toEqual(['miss','memory']);
  for(const metric of records) {
    expect(metric.result).toBe('success');expect(metric.fileBytes).toBe(4);expect(metric.entityCount).toBe(1);expect(metric.parseMs).toBeNull();expect(metric.reasons.parseMs).toBeTruthy();
    expect(metric.firstDisplayMs).toBeNull();expect(metric.reasons.firstDisplayMs).toBeTruthy();
    expect(metric.totalMs).toBeGreaterThanOrEqual(metric.sourceWaitMs!+metric.initializeMs!+metric.adapterLoadMs!);
  }
});
test('TC-MET-001: download failures and empty drawings cannot report first display',async()=>{
  const records:ViewerMetric[]=[];const options={renderer:'test',versionId:'id',report:(m:ViewerMetric)=>records.push(m)};
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:404})));
  await expect(new ViewerManager(factory,undefined,options).load('/file','DXF')).rejects.toThrow();expect(records[0]).toMatchObject({result:'error',fileBytes:null,adapterLoadMs:null,firstDisplayMs:null});
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('empty')));
  await new ViewerManager(async()=>({...await factory(),load:async()=>({empty:true,entityCount:0})}),undefined,options).load('/file','DXF');
  expect(records[1]).toMatchObject({result:'empty',entityCount:0,firstDisplayMs:null});
});

test('TC-MET-001: cancelled generation emits cancelled rather than successful metrics',async()=>{
  let resolve!:(response:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>{resolve=r;})));
  const records:ViewerMetric[]=[];const manager=new ViewerManager(factory,undefined,{renderer:'test',versionId:'id',report:m=>records.push(m)});
  const loading=manager.load('/file','DXF');const rejected=expect(loading).rejects.toThrow();manager.dispose();resolve(new Response('data'));await rejected;
  expect(records).toHaveLength(1);expect(records[0]).toMatchObject({result:'cancelled',firstDisplayMs:null});
});
test('TC-MET-002: adapter-provided DWG initialization and parse stages are retained',async()=>{
  const records: ViewerMetric[]=[];
  const dwgFactory=async():Promise<CadViewerAdapter>=>({load:async()=>({empty:false,entityCount:1,metrics:{initializeMs:12.5,parseMs:3.25}}),dispose:vi.fn(),fitToView:vi.fn(),zoomIn:vi.fn(),zoomOut:vi.fn()});
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('dwg')));
  await new ViewerManager(dwgFactory,undefined,{renderer:'libredwg-web',versionId:'dwg',report:m=>records.push(m)},'DWG').load('/dwg','DWG');
  expect(records[0]).toMatchObject({initializeMs:12.5,parseMs:3.25});
  expect(records[0].reasons.parseMs).toBeUndefined();
});
