# Issue #99 — 실설비 DXF P0 매핑·P5 Browser/GPU 현장 수용

- **상태 (2026-10-25):** 검증 보조 코드/절차 작성. **실도면 수용 BLOCKED**, 현장 실행/Owner 서명/실 GPU 측정 **NOT RUN**. 별도 `DESIGN.md`가 없어 `Architecture.md`·`Decisions.md`(ADR-048/049/050)가 설계 기준.
- 상위 분리: [#31](https://github.com/planner77/layoutManager/issues/31)의 P0/P5 잔여. #96(Auth), #97(Canonical), #98(CadOutline 영속), #65/#71/#73(타입·트리)와 병행 시험은 가능하나 **운영 릴리스 수용은 통합 Owner 판정**. 본 PR은 서버 영속/인증/Prisma/API/Docker/Viewer Adapter/원본 bytes·SHA·Current/Version을 변경하지 않는다.
- **실제 자료:** 3종 이상의 Owner 승인된 실제 설비 ASCII DXF를 사내 승인 스토리지에만 보관. 1k/10k/100k 대표 부하를 각각 포함하며 기준 AutoCAD/WCS XY 위치·면적·INSUNITS·BLOCK/INSERT/OCS/Handle/곡선/Hole과 렌더 결과를 원본 CAD 도구로 독립 비교. 현 파일/장비/측정 결과는 제공되지 않았으므로 PASS 미표기.

## 현재 구현과 한계

| 영역 | 구현 및 검증 범위 | 완료 판정 제외 |
| --- | --- | --- |
| 로컬 source | `npm run audit:outline -- --file /private/sample.dxf`: SHA·unit·stable/entity count·유형·원인별 제한 경고, parse/spatial/query CPU p50/p95, heap/RSS delta (JSON, schema v1) | Render 1:N/N:1, GPU, 실제 CAD 좌표 비교 불가 |
| 로컬 브라우저 | `test:outline-acceptance`: 격리 DB에 승인된 파일을 **한 건씩 비Current 업로드**, Three renderer/selection box 5회 반복, source/render/index 시간, selected/excluded, console/page error, browser heap, box-selection·rAF frame p95 및 local WebGL identity. 보고서 schema v2 | rAF=프레임 간격이지 GPU 사용률/VRAM 또는 입력→화면 전체 지연의 정확한 증명 아님. Click/layer/ESC/fullscreen/Worker cancellation은 별도 실제 조작 검증 필요 |
| 종합 게이트 | `verify:outline-acceptance`: 최소 3개 **서로 다른 SHA**, 3개 규모, source↔browser SHA/size 일치, 도면별 5회, Owner SLA, CAD 기준 좌표/면적, 지원 Matrix, 8개 기능 조작, 외부 GPU telemetry 확인. 이상은 `BLOCKED` 코드만 출력 | `READY_FOR_OWNER_REVIEW`라도 **합격·서명·운영 승인이 아님**. JSON 참거짓/수치의 실측 진위는 도구가 증명할 수 없음 |

## 현장 실행 절차 (사내 격리 PC, 승인된 자료만)

1. `npm ci` / `npm run db:generate` 후 현장과 동일한 **브라우저·GPU·드라이버**에서 테스트. **반드시 운영 DB와 분리된 폐기 가능한 테스트 DB 및 Storage**를 구성, 현재 운영 도면에 테스트 버전을 추가하지 않는다. 업로드는 저장소의 기존 CAD API로 수행되며 비Current라고 DB 변경이 없는 것은 아니다. 이 스크립트가 업로드한 테스트 엔터티는 **자동 삭제하지 않음**.
2. 각 DXF 3종(서로 다른 SHA)에 대해 SHA256/승인 목록을 먼저 확인하고 `npm run audit:outline -- --file /private/specimen-A.dxf > /private/audit-A.json`으로 SOURCE-only 계측. 실 파일/층/레이어/Handle을 Github/스크린샷/공개 CI artifact에 반출하지 않는다.
3. 샘플마다 `CAD_OUTLINE_ACCEPTANCE_DXF=/private/specimen-A.dxf` / `CAD_OUTLINE_ACCEPTANCE_EXPECTED_SHA256=<승인한 64자리 SHA>` / `CAD_OUTLINE_ACCEPTANCE_REPORT_PATH=/private/browser-A.json`을 설정한 뒤 `npm run test:outline-acceptance`를 실행. 5회 반복한 schema v2 private JSON을 보관. 테스트가 실패한 표본도 기록·조치하고 **동일 브라우저/조건 재시험**; 실패 run을 임의 제거하지 않는다. 각 실제 1k/10k/100k의 브라우저와 데이터 규모/heap, p50/p95 결과를 모두 확보한다.
4. **CAD 기준 측정:** Autodesk 등 신뢰 CAD에서 WCS XY 기준점의 최대 오차(도면 단위), Polygon union/Holes 면적 상대 오차, Handle/instancePath 및 복합 BLOCK/INSERT/OCS, Source→Render 1:N·N:1, 실패-차단된 미지원 HATCH/BULGE/SPLINE/3D의 객체 수를 외부 비교·기록한다. `unstableRejected` / `sourceRenderReconciled`는 **실행 확인 후에만 true**. 미지원은 임의 보정으로 통과 처리하지 않는다. 각 기능은 아래 Matrix에 `verified` 또는 `excluded-with-count`를 기록하되 전체 대표 표본에서 해당 기능 `verified`가 한 번도 없으면 게이트 BLOCKED.
5. **UI/GPU:** 실 장치에서 클릭·box(+레이어)·줌·팬·ESC·Fullscreen·Worker 취소 정확성 확인. Chrome/OS 드라이버 버전·브라우저 모드·디스플레이 설정과 장비 모델은 **비공개 증거**에 연결. GPU 이용률·최대 VRAM은 외부 측정 도구(예: OS 성능계측/공식 GPU 모니터)에서 확보; `WebGL` 문자열이나 rAF만으로 GPU 사용량 측정했다고 주장 금지.
6. Owner가 아래 수치 SLA/허용 오차를 **측정 전에** 승인, 도면별 비공개 결과를 manifest 1개로 취합한 후 `npm run verify:outline-acceptance -- /private/manifest.json`. `BLOCKED`이면 원인 코드를 해결; `READY_FOR_OWNER_REVIEW`이면 CAD 비교 원본·장비 로그·결과/반복 횟수·실제 파일 승인·취약 구간을 별도 Owner 검토 후 합/부 판정. GitHub에는 **비민감 요약·AC 상태·비공개 증거 보관 식별자만** 기록한다.

## 비공개 Manifest schema v1 — 입력 계약

`/private/manifest.json` 최상위는 `{schemaVersion:1, kind:"PRIVATE_REAL_DXF", ownerBudgets, ownerReview, cases}`이며 실제 값은 **현장 작성**한다. 저장소에는 사내 데이터·보고서 원문을 커밋하지 않는다.

- `ownerBudgets`: **시간·메모리 한도는 양수, WCS·면적 오차 허용값은 0 이상이며 Owner 승인 전 기본값 없음.** `sourceParseMs, spatialBuildMs, queryP95Ms, loadP95Ms, boxSelectionP95Ms, frameP95Ms, browserHeapBytes, gpuPeakBytes, wcsErrorDrawingUnits, areaRelativeError`. 테스트 조건/위험도·사용자 업무 허용 시간을 기준으로 설정하고 p95는 최소 5회 실측값의 nearest-rank. CPU 측정과 브라우저/GPU 기준을 혼용하지 않는다.
- `ownerReview`: `{cadReferenceApproved:true,reviewerReference:"<비공개 승인 ID>",approvalDate:"YYYY-MM-DD"}`. 이는 파일 자체에 대한 승인 **참조 정보**이며 별도 실제 서명은 Owner가 수행한다.
- `cases[]`: 3개 이상, 각 `sizeBand`는 `1k`(supported Entity 500–4,999), `10k`(5,000–49,999), `100k`(50,000–1,000,000). `expectedSha256`은 승인된 소스와 일치해야 하며 **서로 달라야 함**. 각 `audit`는 `audit:outline` 전체 JSON, 각 `browser`는 `test:outline-acceptance` 전체 JSON(schema v2).
- `cadReference`: `{coordinateSystem:"WCS_XY",coordinateChecks:10,areaChecks:10,maxWcsErrorDrawingUnits:0.001,maxAreaRelativeError:0.0001,sourceRenderChecks:10,unsupportedExcludedCount:2,unstableRejected:true,sourceRenderReconciled:true}`와 같은 **필드 예시** (숫자·true는 실제 관찰 후에만 사용, 예시를 결과로 재사용 금지). 위치·면적의 raw 좌표가 아닌 검증된 최대 *오차값*만 등록.
- `supportMatrix`: `sourceRender1N,sourceRenderN1,stableHandleInstancePath,blockInsertOcs,curves,polygonUnionHoles,unsupportedFailClosed` 각각 `verified` 또는 `excluded-with-count`; 모든 필수 항목은 최소 한 실제 표본에서 `verified` 필수. 미지원 유형 제외 건수는 `cadReference.unsupportedExcludedCount`와 별도 대조.
- `interactions`: `click,box,layer,zoom,pan,escape,fullscreen,workerCancellation` 실제 조작 모두 true 필요.
- `externalGpu`: `{recorded:true,observedOnRealDevice:true,telemetryTool:"<사내 측정 도구>",peakMemoryBytes:<실측>,peakUtilizationPercent:<실측>,browserAndDriverReference:"<비공개 식별자>"}`. 외부 VRAM 값이 SLA 이내여야 하며 rAF 지표와 구분.

JSON 수치/체크리스트는 **사용자 제출 증거**다. Gate는 입력 검증과 누락·SLA 초과 차단만 수행하므로 허위 작성·CAD 비교 잘못·계측 장비 오류를 자동 탐지할 수 없다. 최소 5회 p95는 산출 정확도를 높이기 위한 표본 확보이지 통계적 안정성의 증명은 아니며, 필요하면 더 많은 반복 측정을 Owner가 지시한다.

## AC와 미충족 운영 게이트

| Issue #99 AC | 자동화가 확인 가능한 부분 | 현장/Owner 잔여 |
| --- | --- | --- |
| AC-99-01 위치·면적·매핑·Handle/BLOCK/OCS/Support Matrix | SHA, 3종, CAD 오차 수치/기능 매트릭스 입력의 무결성 확인 | 승인 CAD 원본과 직접 비교, 1:N/N:1 원인 분석, unsupported fail-closed 실제 확인 |
| AC-99-02 허용 오차와 Worker/Browser 회귀 | Owner 수치 예산·실측 보고서 존재 및 초과 검출, 선택 box 반복 | 실제 click/layer/ESC/fullscreen/worker cancellation, CAD 허용치 사전 승인 |
| AC-99-03 실제 1k/10k/100k p50/p95·GPU·메모리 | 규모/반복/CPU, browser load/box/rAF/heap, 외부 GPU 수치 게이트 | GPU 도구·장비/브라우저 로그와 실제 값 검증·SLA 합의 |
| AC-99-04 비공개/불변/승인 | 제품 파일·DB/Viewer 코드 비변경, 일반 CI는 synthetic만 | 격리 DB 폐기/복구, 현장 데이터 반출 0, 비공개 결과 보관 및 Owner **최종 서명** |

**종료 조건:** 4개 AC 실증·사내 보안 승인·증거 링크(비공개 식별자만)·Owner 판정 기록이 모두 완료되어야 이슈 종료 가능. 현재의 단위 테스트/PR CI 성공으로 자동 종결하지 않는다. 오류·실패 반복은 `FailureLedger.md`에 출처/run/HEAD/원인·조치별 기록하고 이후 재실행; 공용 CI에 비공개 파일 주입 금지.
