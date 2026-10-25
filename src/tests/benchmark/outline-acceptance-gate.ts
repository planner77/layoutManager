/**
 * Issue #99: private real-DXF evidence completeness gate.
 *
 * No DXF is opened here. All input is operator-held, precomputed evidence.
 * READY_FOR_OWNER_REVIEW is NOT a claim of CAD accuracy, GPU acceptance, or release PASS.
 * Do not print SHA, location, source content, layer/handle data, or hardware identifiers.
 */
export const OUTLINE_SIZES = ['1k','10k','100k'] as const;
export const OUTLINE_FEATURES = [
  'sourceRender1N','sourceRenderN1','stableHandleInstancePath',
  'blockInsertOcs','curves','polygonUnionHoles','unsupportedFailClosed',
] as const;
export const OUTLINE_INTERACTIONS = [
  'click','box','layer','zoom','pan','escape','fullscreen','workerCancellation',
] as const;

export type OutlineGateResult = {
  state:'BLOCKED'|'READY_FOR_OWNER_REVIEW';
  reasonCodes:string[];
  caseCount:number;
  representedSizes:string[];
};

type Row=Record<string,unknown>;
const record=(value:unknown):value is Row=>
  value!==null && typeof value==='object' && !Array.isArray(value);
const number=(value:unknown):value is number=>
  typeof value==='number' && Number.isFinite(value) && value>=0;
const positive=(value:unknown):value is number=>number(value)&&value>0;
const integer=(value:unknown):value is number=>number(value)&&Number.isInteger(value);
const sha=(value:unknown):value is string=>
  typeof value==='string' && /^[a-f0-9]{64}$/i.test(value);
const percentile95=(values:number[]):number=>
  [...values].sort((a,b)=>a-b)[Math.ceil(values.length*0.95)-1];

const budgetKeys=[
  'sourceParseMs','spatialBuildMs','queryP95Ms','loadP95Ms',
  'boxSelectionP95Ms','frameP95Ms','browserHeapBytes','gpuPeakBytes',
  'wcsErrorDrawingUnits','areaRelativeError',
] as const;
const ranges:Record<string,[number,number]>={
  '1k':[500,4999], '10k':[5000,49999], '100k':[50000,1000000],
};

/** Pure, fail-closed structural/evidence gate. Every failure uses a non-sensitive reason code. */
export function assessPrivateOutlineEvidence(input:unknown):OutlineGateResult {
  const reasons=new Set<string>();
  const fail=(code:string)=>{reasons.add(code);};
  if(!record(input))
    return {state:'BLOCKED',reasonCodes:['INVALID_MANIFEST'],caseCount:0,representedSizes:[]};
  if(input.schemaVersion!==1 || input.kind!=='PRIVATE_REAL_DXF')
    fail('PRIVATE_MANIFEST_REQUIRED');
  const budgets=record(input.ownerBudgets)?input.ownerBudgets:null;
  if(!budgets || budgetKeys.some(key=>!positive(budgets[key])))
    fail('OWNER_THRESHOLDS_REQUIRED');
  const owner=record(input.ownerReview)?input.ownerReview:null;
  if(!owner || owner.cadReferenceApproved!==true ||
     typeof owner.reviewerReference!=='string' || owner.reviewerReference.trim().length<3 ||
     typeof owner.approvalDate!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(owner.approvalDate))
    fail('OWNER_REFERENCE_APPROVAL_REQUIRED');
  const cases=Array.isArray(input.cases)?input.cases:[];
  if(cases.length<3)fail('THREE_REAL_CASES_REQUIRED');
  const sizes=new Set<string>(), hashes=new Set<string>();
  const covered=new Set<string>();
  for(const item of cases){
    if(!record(item)){fail('INVALID_CASE');continue;}
    const band=item.sizeBand;
    if(typeof band!=='string' || !Object.hasOwn(ranges,band)){
      fail('INVALID_SIZE_BAND');continue;
    }
    sizes.add(band);
    if(!sha(item.expectedSha256)){fail('INVALID_CASE_SHA');continue;}
    if(hashes.has(item.expectedSha256.toLowerCase()))fail('DUPLICATE_SOURCE');
    hashes.add(item.expectedSha256.toLowerCase());

    const audit=record(item.audit)?item.audit:null;
    const source=audit && record(audit.source)?audit.source:null;
    const cpu=audit && record(audit.cpu)?audit.cpu:null;
    if(!audit || audit.schemaVersion!==1 ||
       audit.scope!=='local-source-cpu-only-not-render-acceptance' ||
       !source || !cpu || !sha(source.sha256) ||
       source.sha256.toLowerCase()!==item.expectedSha256.toLowerCase() ||
       !positive(source.fileBytes) || !integer(source.supportedEntityCount) ||
       !integer(source.stableIdentityCount) ||
       source.stableIdentityCount>source.supportedEntityCount){
      fail('SOURCE_AUDIT_INVALID');
    } else {
      const [min,max]=ranges[band];
      if(source.supportedEntityCount<min || source.supportedEntityCount>max)
        fail('SIZE_BAND_COUNT_MISMATCH');
      if(budgets && (
        !number(cpu.sourceParseMs) || cpu.sourceParseMs>Number(budgets.sourceParseMs) ||
        !number(cpu.spatialBuildMs) || cpu.spatialBuildMs>Number(budgets.spatialBuildMs) ||
        !number(cpu.queryP95Ms) || cpu.queryP95Ms>Number(budgets.queryP95Ms)
      ))fail('SOURCE_CPU_BUDGET_EXCEEDED');
    }

    const browser=record(item.browser)?item.browser:null;
    const samples=browser && Array.isArray(browser.samples)?browser.samples:[];
    if(!browser || browser.schemaVersion!==2 ||
       browser.type!=='private-browser-observation-not-operational-PASS' ||
       !sha(browser.sourceSha256) ||
       browser.sourceSha256.toLowerCase()!==item.expectedSha256.toLowerCase() ||
       !positive(browser.bytes) || (source && browser.bytes!==source.fileBytes) ||
       samples.length<5)
      fail('BROWSER_EVIDENCE_INVALID');
    const loads:number[]=[], selections:number[]=[], frames:number[]=[];
    for(const sample of samples){
      if(!record(sample) ||
         !number(sample.loadMs) || !number(sample.boxSelectionMs) ||
         !number(sample.frameP95Ms) || !positive(sample.selected) ||
         !integer(sample.excluded) || sample.consoleErrors!==0 ||
         sample.pageErrors!==0 || !positive(sample.browserHeap)){
        fail('BROWSER_SAMPLE_INVALID');continue;
      }
      loads.push(sample.loadMs);
      selections.push(sample.boxSelectionMs);
      frames.push(sample.frameP95Ms);
      if(budgets && sample.browserHeap>Number(budgets.browserHeapBytes))
        fail('BROWSER_HEAP_BUDGET_EXCEEDED');
    }
    if(budgets && loads.length===samples.length && samples.length>=5 &&
       (percentile95(loads)>Number(budgets.loadP95Ms) ||
        percentile95(selections)>Number(budgets.boxSelectionP95Ms) ||
        percentile95(frames)>Number(budgets.frameP95Ms)))
      fail('BROWSER_LATENCY_BUDGET_EXCEEDED');

    const cad=record(item.cadReference)?item.cadReference:null;
    if(!cad || cad.coordinateSystem!=='WCS_XY' ||
       !positive(cad.coordinateChecks) || !positive(cad.areaChecks) ||
       !number(cad.maxWcsErrorDrawingUnits) || !number(cad.maxAreaRelativeError) ||
       !positive(cad.sourceRenderChecks) ||
       !integer(cad.unsupportedExcludedCount) ||
       cad.unstableRejected!==true || cad.sourceRenderReconciled!==true)
      fail('CAD_GROUND_TRUTH_MISSING');
    else if(budgets && (
      cad.maxWcsErrorDrawingUnits>Number(budgets.wcsErrorDrawingUnits) ||
      cad.maxAreaRelativeError>Number(budgets.areaRelativeError)))
      fail('CAD_GEOMETRY_TOLERANCE_EXCEEDED');

    const matrix=record(item.supportMatrix)?item.supportMatrix:null;
    if(!matrix)fail('SUPPORT_MATRIX_REQUIRED');
    for(const feature of OUTLINE_FEATURES){
      const status=matrix?.[feature];
      if(status==='verified')covered.add(feature);
      else if(status!=='excluded-with-count')fail('UNVERIFIED_SUPPORT_MATRIX');
      else if(!cad || !positive(cad.unsupportedExcludedCount))
        fail('EXCLUSION_COUNT_REQUIRED');
    }

    const interactions=record(item.interactions)?item.interactions:null;
    if(!interactions || OUTLINE_INTERACTIONS.some(key=>interactions[key]!==true))
      fail('BROWSER_INTERACTIONS_UNVERIFIED');

    const gpu=record(item.externalGpu)?item.externalGpu:null;
    if(!gpu || gpu.recorded!==true || gpu.observedOnRealDevice!==true ||
       typeof gpu.telemetryTool!=='string' || gpu.telemetryTool.trim().length<3 ||
       !positive(gpu.peakMemoryBytes) || !number(gpu.peakUtilizationPercent) ||
       gpu.peakUtilizationPercent>100 ||
       typeof gpu.browserAndDriverReference!=='string' ||
       gpu.browserAndDriverReference.trim().length<3)
      fail('EXTERNAL_GPU_TELEMETRY_REQUIRED');
    else if(budgets && gpu.peakMemoryBytes>Number(budgets.gpuPeakBytes))
      fail('GPU_MEMORY_BUDGET_EXCEEDED');
  }
  if(OUTLINE_SIZES.some(size=>!sizes.has(size)))fail('ALL_SIZE_BANDS_REQUIRED');
  // Cross-document coverage must be demonstrated at least once for each required feature.
  if(OUTLINE_FEATURES.some(feature=>!covered.has(feature)))
    fail('REQUIRED_FEATURE_NOT_VERIFIED');
  const reasonCodes=[...reasons].sort();
  return {state:reasonCodes.length?'BLOCKED':'READY_FOR_OWNER_REVIEW',
    reasonCodes,caseCount:cases.length,representedSizes:[...sizes].sort()};
}
