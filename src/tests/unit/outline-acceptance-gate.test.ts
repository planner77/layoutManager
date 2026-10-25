import {describe,expect,it} from 'vitest';
import {
  assessPrivateOutlineEvidence,OUTLINE_FEATURES,OUTLINE_INTERACTIONS,
} from '../benchmark/outline-acceptance-gate';

const hashes=['a'.repeat(64),'b'.repeat(64),'c'.repeat(64)];
const budgets={
  sourceParseMs:2000,spatialBuildMs:2000,queryP95Ms:20,
  loadP95Ms:5000,boxSelectionP95Ms:1000,frameP95Ms:50,
  browserHeapBytes:500_000_000,gpuPeakBytes:1_000_000_000,
  wcsErrorDrawingUnits:0.02,areaRelativeError:0.001,
};
function approvedFixture(){
  return {
    schemaVersion:1,kind:'PRIVATE_REAL_DXF',ownerBudgets:{...budgets},
    ownerReview:{cadReferenceApproved:true,reviewerReference:'private-signoff',
      approvalDate:'2026-10-25'},
    cases:([1000,10000,100000] as const).map((count,index)=>({
      sizeBand:['1k','10k','100k'][index],expectedSha256:hashes[index],
      audit:{schemaVersion:1,scope:'local-source-cpu-only-not-render-acceptance',
        source:{sha256:hashes[index],fileBytes:10000+count,
          supportedEntityCount:count,stableIdentityCount:count},
        cpu:{sourceParseMs:10,spatialBuildMs:20,queryP95Ms:3}},
      browser:{schemaVersion:2,type:'private-browser-observation-not-operational-PASS',
        sourceSha256:hashes[index],bytes:10000+count,
        samples:Array.from({length:5},()=>({
          loadMs:1000,boxSelectionMs:100,frameP95Ms:16.7,
          browserHeap:100_000_000,selected:1,excluded:0,
          consoleErrors:0,pageErrors:0,
        }))},
      cadReference:{coordinateSystem:'WCS_XY',coordinateChecks:10,areaChecks:10,
        maxWcsErrorDrawingUnits:0.001,maxAreaRelativeError:0.0001,
        sourceRenderChecks:10,unsupportedExcludedCount:2,
        unstableRejected:true,sourceRenderReconciled:true},
      supportMatrix:Object.fromEntries(OUTLINE_FEATURES.map(key=>[key,'verified'])),
      interactions:Object.fromEntries(OUTLINE_INTERACTIONS.map(key=>[key,true])),
      externalGpu:{recorded:true,observedOnRealDevice:true,
        telemetryTool:'approved vendor profiler',peakMemoryBytes:100_000_000,
        peakUtilizationPercent:30,browserAndDriverReference:'private machine record'},
    })),
  };
}

describe('Issue #99 P0/P5 real-DXF evidence completeness (not operational acceptance)',()=>{
  it('TC-P0P5-001: complete independent private 1k/10k/100k evidence is only review-ready',()=>{
    const result=assessPrivateOutlineEvidence(approvedFixture());
    expect(result).toEqual({
      state:'READY_FOR_OWNER_REVIEW',reasonCodes:[],caseCount:3,
      representedSizes:['100k','10k','1k'],
    });
  });
  it('TC-P0P5-002: missing owner limits/reviewer or fewer samples are blocked',()=>{
    const a=approvedFixture();
    delete (a.ownerBudgets as Record<string,unknown>).loadP95Ms;
    a.cases.pop();
    a.ownerReview.cadReferenceApproved=false;
    const reasons=assessPrivateOutlineEvidence(a).reasonCodes;
    expect(reasons).toContain('OWNER_THRESHOLDS_REQUIRED');
    expect(reasons).toContain('THREE_REAL_CASES_REQUIRED');
    expect(reasons).toContain('OWNER_REFERENCE_APPROVAL_REQUIRED');
    expect(reasons).toContain('ALL_SIZE_BANDS_REQUIRED');
  });
  it('TC-P0P5-003: SHA or file size mismatch and duplicate source are blocked',()=>{
    const a=approvedFixture();
    a.cases[0].browser.sourceSha256='d'.repeat(64);
    a.cases[1].expectedSha256=hashes[0];
    a.cases[2].browser.bytes++;
    const reasons=assessPrivateOutlineEvidence(a).reasonCodes;
    expect(reasons).toContain('BROWSER_EVIDENCE_INVALID');
    expect(reasons).toContain('DUPLICATE_SOURCE');
    expect(reasons).toContain('SOURCE_AUDIT_INVALID');
  });
  it('TC-P0P5-004: synthetic or nonrepresentative counts cannot masquerade as field tests',()=>{
    const a=approvedFixture();
    a.cases[0].audit.scope='synthetic-not-operational-acceptance';
    a.cases[1].audit.source.supportedEntityCount=1;
    const reasons=assessPrivateOutlineEvidence(a).reasonCodes;
    expect(reasons).toContain('SOURCE_AUDIT_INVALID');
    expect(reasons).toContain('SIZE_BAND_COUNT_MISMATCH');
    expect(assessPrivateOutlineEvidence({schemaVersion:1,cases:[]}).state).toBe('BLOCKED');
  });
  it('TC-P0P5-005: browser errors, missing repetitions and owner p95 breach block',()=>{
    const a=approvedFixture();
    a.cases[0].browser.samples.pop();
    a.cases[1].browser.samples[0].consoleErrors=1;
    a.cases[2].browser.samples[4].boxSelectionMs=10000;
    const reasons=assessPrivateOutlineEvidence(a).reasonCodes;
    expect(reasons).toContain('BROWSER_EVIDENCE_INVALID');
    expect(reasons).toContain('BROWSER_SAMPLE_INVALID');
    expect(reasons).toContain('BROWSER_LATENCY_BUDGET_EXCEEDED');
  });
  it('TC-P0P5-006: accuracy, partial render mapping and missing support matrix block',()=>{
    const a=approvedFixture();
    a.cases[0].cadReference.maxWcsErrorDrawingUnits=2;
    a.cases[1].cadReference.sourceRenderReconciled=false;
    a.cases[2].supportMatrix.blockInsertOcs='excluded-with-count';
    a.cases[1].supportMatrix.blockInsertOcs='excluded-with-count';
    a.cases[0].supportMatrix.blockInsertOcs='excluded-with-count';
    const reasons=assessPrivateOutlineEvidence(a).reasonCodes;
    expect(reasons).toContain('CAD_GEOMETRY_TOLERANCE_EXCEEDED');
    expect(reasons).toContain('CAD_GROUND_TRUTH_MISSING');
    expect(reasons).toContain('REQUIRED_FEATURE_NOT_VERIFIED');
  });
  it('TC-P0P5-007: GPU, worker interaction, browser heap and CPU overrun block',()=>{
    const a=approvedFixture();
    a.cases[0].interactions.workerCancellation=false;
    a.cases[1].externalGpu.recorded=false;
    a.cases[2].browser.samples[0].browserHeap=600_000_000;
    a.cases[2].audit.cpu.sourceParseMs=3000;
    const reasons=assessPrivateOutlineEvidence(a).reasonCodes;
    expect(reasons).toContain('BROWSER_INTERACTIONS_UNVERIFIED');
    expect(reasons).toContain('EXTERNAL_GPU_TELEMETRY_REQUIRED');
    expect(reasons).toContain('BROWSER_HEAP_BUDGET_EXCEEDED');
    expect(reasons).toContain('SOURCE_CPU_BUDGET_EXCEEDED');
  });
  it('TC-P0P5-008: null/unknown input is blocked, never PASS',()=>{
    expect(assessPrivateOutlineEvidence(null).state).toBe('BLOCKED');
    expect(assessPrivateOutlineEvidence('ok').reasonCodes).toContain('INVALID_MANIFEST');
  });
});
