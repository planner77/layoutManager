## 2026-11-03 — CI #540 comprehensive repair contract (implemented and locally verified)

Manager scope: repair PR #221 P1-A2 test discovery and investigate unresolved #539 OOM before a single final branch push. Latest failed Run41579326423, source `2ff920a47897472fc78fe801602ae3c261bdf81e`, A2 Job125730647664: both fresh containers exited1 with `No tests found`, OOMKilled=false; other independent jobs SUCCESS, Verify125734431179 dependent FAILURE. Local exact CLI reproduced both zero-test failures; unfiltered discovery lists9. This run did not exercise conversion and cannot establish that container separation fixes #539 OOM.

AC/TC-218-A2-R09: execute actual Playwright discovery using the workflow selectors, require exactly five P0 and four acceptance/auxiliary tests, disjoint union of all9, fail on missing/renamed/unselected tests (never pass-with-no-tests). Keep required Verify and both original restricted containers. Add executable discovery regression using Playwright itself, not merely matching workflow text.

AC/TC-218-A2-R10: compare original single fresh-container full proof against corrected implementation at CPU2/RAM1536MiB/SHM256MiB/PID256/read-only/UID10001/network-none. Record original failure/last phase/exit/OOM and actual repaired result. Investigate per-scalar Playwright transport of DTO bytes plus duplicated full geometry inventories versus test carry-over; do not assert allocation cause without comparative evidence. Any transport correction must preserve actual DXF/TTF, all byte/SHA/full validation, every geometry scalar/ID/Layer/WCS check, immutable file readback, fresh-process restore, late-error check and time limits. No limits raised, no fixture reduction or assertion removal. Existing ALL-mode Scene PoC must regress successfully if shared test code changes.

Root acts as Manager using the active model; branch AGENTS requests gpt-6-sol Developer and gpt-6-luna QA for implementation then independent validation. These are substitutes for the supplied older gpt-5.6 role mapping (unavailable tool models); record actual agents/results in TestReport. No production feature/version bump: package remains0.58.1, immutable #216 unchanged, #218 OPEN/A2 GO BLOCKED and P1-B/C/D prohibited. New CI start only; completion deliberately not monitored.

Final implementation and exact packaged proof/independent QA passed; evidence is [TestReport](TestReport.md) and [FailureLedger](FailureLedger.md). This accepts the CI repair, while P1-A2 GO and operational #218 AC remain blocked.

### R10 refined design after actual probes

A fresh single-test baseline still OOMs (original source, unchanged runtime cgroup; initial diagnostic image skipped only recursive chmod; exact Dockerfile image also built and repeated separately). Isolated existing `prepareFonts()` peak RSS963092KiB,1.38s, generated25MiB JSON. Font-only probe reaches restore but Node RSS838MiB/heap641MiB; identical packet via JSON string reaches same restore at RSS325MiB/heap153MiB. After both, per-coordinate Playwright `expect` loops monopolize comparison and allocate test-report steps. Preserve all coordinate comparisons with a finite/tolerance-check loop and a bounded number of assertions; add late-array mutation/nonfinite/length regression. Precompute the exact existing Nanum font with existing `prepareFonts()` during proof-image build, verify required glyphs at runtime, never subset/replace it. JSON transport is test-only and must not alter DTO bytes/manifest; no shared Scene PoC/production change is required. Keep safe milestone/RSS diagnostics and numerical comparison indices, without dumping fixture bytes, IDs, hashes or arbitrary exceptions.

---

## 2026-11-03 — CI #539 measured OOM after successful independent converter proofs

[A2 CPU proof #539](https://github.com/planner77/layoutManager/actions/runs/41578400956) HEAD 883be4504496bed0e0555bb21dfaff48cc468e06: P0-1 WebGL-only, P0-2 minimal real DXF DTO, P0-3 real Korean/nested INSERT DTO, P0-4 DTO/ALL cost and P0-5 fail-closed browser abort ALL PASS (8/9 combined). The final full A2 produced/custom DTO but Playwright worker was SIGKILL, Docker inspect oomKilled=true. An 1.024GiB max 2s memory sample is NOT proof of peak; memory.events last read before OOM reported zeros, Docker postmortem explicitly OOMKilled=true. Root cause class OOM now supported, but exact process/allocation source unknown.

To eliminate memory carry-over from the diagnostic suite, the mandatory CPU job now runs P0 and full A2 in distinct fresh containers under the SAME strict 1536MiB, CPU2, SHM256MiB, UID10001, read-only, offline, PID/timeout controls. Both fail closed and separately archive ExitCode/OOMKilled/1s stats. No tests skipped, no limit increases. If fresh A2 still OOMs, investigate TTF/GLB/DTO copies and isolate actual Worker memory under original cap. #218 OPEN, P1-A2 GO BLOCKED, no P1-B/C/D or GHCR/G7/DB deployment.

---

## 2026-11-03 — P0 diagnosis after repeated PR CI failures, no GO

Across #221 CI #479–#538: 60 runs, seven failures and 53 cancelled intermediate SHA runs. Quality/Docker/General Chromium/G7 all pass by #538, while required A2 CPU-only job alone fails. [CI #538](https://github.com/planner77/layoutManager/actions/runs/41570387391) HEAD 3b1c8c1ff9b1e42bde12af57cfeaf09ead3fa2a0 shows REFERENCE_READY → REAL_DXF_PRODUCE_START → page.evaluate: Target crashed. Original wrapper combined WebGL2 creation and DXF produce; direct cause unknown and no OOM/exit metrics.

Remediation is test-only: original Scene PoC default ALL unchanged, optional DTO_ONLY to avoid unrelated GLB/THREE_JSON allocations; P0-1 isolated WebGL2, P0-2 minimal LINE DXF/DTO-only, P0-3 Korean/nested DXF/DTO-only, P0-4 format-cost comparison, P0-5 browser close rejection. A2 full source SHA/manifest/validator/persist/restore remains required. Docker CI captures ExitCode/OOMKilled/docker stats/cgroup memory.events for seven days with original resource/security limits. Commit as one branch update instead of many per-file pushes. New tests not yet executed, do not claim OOM fixed or CPU Builder GO. P1-B/C/D not started and no GHCR/production data changes. #218 OPEN.

---

## 2026-11-03 — #221 CI #525 CPU Chromium153에도 RegExp 동일 실패; P1-A2 proof 구현 통합

- [PR CI #525 Run41567538237](https://github.com/planner77/layoutManager/actions/runs/41567538237) exact HEAD `8042b1cd0c0ed6913666f93d91ed95f42c9b9b96`: scope/Quality/Docker/General Chromium 2/G7 전부 SUCCESS, A2 `BROWSER_MAJOR_153→HARNESS_SCRIPT_REQUESTED→PAGEERROR_SYNTAX_INVALID_REGEXP`로 필수 변환 시험 실패. 다른 3개 보조 PASS. Browser 153 동기화가 문제를 해결하지 못했으므로 Chrome 156 전용 원인 가설은 부정. 실제 regex pattern/caller는 문서화 가능한 로그가 없어 UNKNOWN. DXF parser/Scene/DTO/full validator/restore는 미호출.
- **구현 변경:** 검증 전용 `src/tests/a2/headless-browser.ts`의 중복 브라우저 초기화·변환 구현은 제거. 이미 General Chromium E2E `SC-05/06/07`에서 합성 DXF→3D→Scene 직렬화·복원이 성공하는 `src/tests/e2e/scene-poc-browser.ts`를 A2 CPU proof에서 **직접** import-free bundle entrypoint로 사용한다. A2 host harness가 소스 바이트 SHA, 한글/중첩 BLOCK DXF source preflight, 실제 Korean TTF, `CUSTOM_DTO` manifest bytes/SHA/full validator, temp file write/read, per ID WCS geometry/Layer/Node inventory, 독립 CPU Browser process fresh restore 검증을 추가. 패키지/Prod Builder/G7/API/DB/Prisma/Compose를 변경하지 않고 Required CI도 동일하게 유지한다.
- **한계·판정:** 기존 성공 Scene PoC E2E는 한국어·대규모 도면/실 사용자 Viewer Adapter Fidelity, server worker sandbox, OOM/kill/restart, G7 Session·Actor 권한 재검증/비파괴 CAS, 업로드→Scene READY 실증의 대체가 아니다. A2 test의 한글 host text-index 검사는 Persisted viewerData의 한글 텍스트 기능을 직접 증명하지 않는다. 새 CI 결과 관측 전 A2 GO **BLOCKED**, #218 OPEN, P1-B/C/D 금지. 해당 PR 병합/GHCR 운영 게시 없음. [원장](FailureLedger.md), [TestReport](TestReport.md), [TestPlan](TestPlan.md).

---

## 2026-11-03 — PR #221 CI #514 정규식 오류, CPU browser 고정 버전 정합 검증

CI [#514 Run41564217739](https://github.com/planner77/layoutManager/actions/runs/41564217739) HEAD `ea3145c5b2fa2d55a6b631d45ffbed201937baf3`: Scope/Quality/Docker/G7/일반 Chromium 통과, A2 CPU Browser `PAGEERROR_SYNTAX_INVALID_REGEXP`로 actual DXF 변환 미실행, 3/4 tests PASS. Node `vm.Script` 구문 PASS와 브라우저 런타임 정규식 생성의 성공은 별개.

**검증된 차이와 선택:** #514 A2 Debian apt browser Chromium156.0.8078.73, 같은 CI 일반 Chromium Browser scene-poc E2E PASS는 Playwright Chromium153.0.8010.12. 초기화 버그의 정확한 regexp/패키지는 미확인이고 version mismatch는 가설이다. `src/tests/a2/Dockerfile`을 lockfile-pinned Playwright browser로 대체하고 major=153 확인/strict `chrome153` bundle target으로 실험한다. 이미 설치한 npm dependencies와 OS 기반 CPU runtime은 동일, 빌드 때 Browser를 획득하고 실행은 offline(`--network none`), rootless UID10001/read-only/CPU-RAM 제한 유지한다. 이는 **검증 가능한 실행환경 정렬**, 운영 Worker/Scene 완료 판정 아님.

GO 잔여: 실제 synthetic 변환/전체 Validator/Browser parity, sandbox/OOM/late async/필드 DXF/한글 BLOCK fidelity, 브라우저 패키지/SBOM/폐쇄망 공급망. #218 OPEN, P1-B/C/D 금지, #216 OCI GHCR/G7 인증/DB·Volume 불변.

---

## 2026-11-03 — PR #221 CI #506 A2 Script SyntaxError 및 Bundle 정합성 검증 수리

[PR CI #506 Run41561632191](https://github.com/planner77/layoutManager/actions/runs/41561632191) HEAD `06d6bda224e74b30e40548184902ec44f518dd6e`, Quality/Docker/General Chromium 2/G7 E2E 성공. CPU proof `125673426531`에서 bundle/TTF/Chromium 준비 및 localhost virtual `HARNESS_SCRIPT_REQUESTED`까지 성공, 직후 `PAGEERROR_SYNTAX`로 `window.sceneA2`가 등록되지 않아 실제 DXF→Object3D/Validator/Restore 미실행. 4개 시험 중 3 PASS, 1 FAIL. 이전 nonsecure-Origin 가설은 localhost 후에도 재현되므로 root cause로 확인되지 않음.

**진단과 수정:** 기존 default `esbuild` JavaScript target이 명시되지 않았으므로 Test 전용 IIFE bundle을 `chrome115`로 고정, 정확 bundle bytes를 Node `vm.Script`로 compile-only 검사, Runtime Browser `SyntaxError`의 허용 lexical category와 synthetic JS line/column만 안전 기록. 이 변경은 실제 오류의 토큰을 찾아 수정했다는 뜻이 아니라 추가 격리/호환 검증이며, 다시 실패하면 그 결과를 fail-closed로 남긴다. 기존 SourceSHA/SceneScope/DTO/full validator/Restore, 32MiB/100k/2M/depth128, read-only Debian UID10001/network none/CPU2/RAM1536MiB/전체 CI Gate 불변.

P1-A2 기술 GO **차단**, #218 OPEN AC01–09, P1-B/C/D 미착수, #216 GHCR immutable 및 운영 DB/Volume/Auth/Current/SceneRepository 무변경. [원장](FailureLedger.md), [시험](TestPlan.md).

---
## 2026-11-03 — PR #221 CI #495 HARNESS_READY timeout 및 localhost·오류 분류 보완

[CI #495 Run41558698574](https://github.com/planner77/layoutManager/actions/runs/41558698574), exact HEAD `91509d1dce9522acb2b8a0f934c9b08fa63fa4b8`: Scope/Quality/Docker/Chromium 2/G7 성공. A2 CPU proof 전용 Job `125664254542`에서 Debian 이미지·UID10001 성공, 3 시험 중 watchdog/위험 preflight 2 PASS, 실제 변환 1 FAIL(`BUNDLE_DONE → FONT_PREPARE_DONE → SWIFT_CHROMIUM_STARTED → HARNESS_NAVIGATE_START → PAGEERROR_OTHER → A2_TIMEOUT:HARNESS_READY:LAST_PHASE=UNOBSERVED`). DXF parser·DTO/validator 호출 전 실패하였으므로 Headless 기술 GO는 여전히 불가. 원본 JS 에러는 allowlisted OTHER만 출력되어 root cause UNKNOWN.

**수정 방향 및 근거:** `http://p1-a2.invalid`는 일반 비신뢰 HTTP Origin이고 `http://localhost`는 MDN/W3C에서 potentially trustworthy secure context다. Three/WebGL 번들에서 `Crypto.randomUUID` 같은 secure-only API가 필요할 가능성을 우선 확인할 가설로 채택하고, 합성 페이지 Origin만 localhost로 변경(실제 network `--network none`/local route 유지). `HARNESS_SCRIPT_REQUESTED`/script actually served, `window.isSecureContext`/`crypto.randomUUID` 즉시 assert; JS pageerror를 safe category/즉시 fail로 표면화해 다음 근본 원인 식별 가능. 해당 API가 실패 원인인지 CI #495 증거만으로 확정하지 않는다. Test/CPU/timeout/G7/Required Gate 완화 없으며 합성 Scene 검증 결과 미확인. [원장](FailureLedger.md), [TestPlan](TestPlan.md).

P1-A2 GO BLOCKED, #218 OPEN/AC01–09 미완료, P1-B/C/D 미착수. #216 OCI immutable tags/digests·production DB/Volume/APP_CREATED/Memo/Zone/Outline/SceneRepository/G7 Auth 불변.

---

## 2026-11-03 — PR #221 CI #485 실제 Timeout·관측 불가 및 진단 보완

[PR CI #485 Run41555129727](https://github.com/planner77/layoutManager/actions/runs/41555129727) HEAD `23d4b8df0948e4ee1d6b3a34dba9673e56136440`: Scope/Quality/General Chromium(2)/G7 Greenfield/G7 Signed-Legacy/Docker SUCCESS. 독립 Debian CPU proof `125652599400`에서 image build/UID10001 성공, 위험 preflight test PASS, **실 synthetic DXF→Scene test가 180000ms timeout**. 이 실행에서 구체적인 장기 대기 단계는 기록되지 않았으므로 원인은 UNKNOWN. Required Verify는 mandatory CPU 실패로 FAILURE. DXF 변환/validator/restore/SwiftShader GO 판정 불가.

보완: `headless-browser.ts`의 SOURCE/WEBGL/DXF_PARSE/SCENE_PREFLIGHT/TAG/TEXT_INDEX/CUSTOM_DTO/FULL_VALIDATOR/RESTORE/RENDER 안전 단계 마커; `headless.spec.ts`의 실행 Host/폰트/브라우저/Resource/오류 단계 및 25s Chromium launch·20s navigation·60s evaluate 독립 timeout(마지막 phase 보고), 정지 Promise fail-closed 회귀. 전체 시험 180s, Docker 15m·UID10001/read-only/network none/cgroup, 실제 renderer/DTO/all validation과 기존 PR CI Gate를 변경 없이 보존. 시간 연장/가짜 READY·skip 없음.

재실행 뒤에도 `#212` 실제 Viewer와의 동등성, 한글/BLOCK fidelity·async-late/OOM/강제 종료/sandbox·현장 #113/#193 **미검증**. P1-A2 GO BLOCKED, 후속 P1-B/C/D·GHCR·G7 게시 금지. [원장](FailureLedger.md), [시험 계획](TestPlan.md), [결과](TestReport.md).

---

## 2026-11-03 — P1-A2 PR #221 CI #479 1차 실행 실패 및 보완

[Run41551357571](https://github.com/planner77/layoutManager/actions/runs/41551357571) PR HEAD `f40ba4a0dcc6ebe4c5598cf6962e847e81bdfbe3`: Quality Typecheck `TS2322`(TTFLoader metadata string vs nested language map), 독립 A2 CPU Run Playwright output 폴더 `/app/src/test-results` mkdir `ENOENT` (read-only container). Docker/UID10001 및 기존 Runtime smoke 성공, **실 DXF 변환 시험은 미실행**. TypeScript는 `Record<string,unknown>` metadata guard, Playwright 결과 경로는 `/tmp/a2-playwright-results` tmpfs로 수정. 후속 exact HEAD CI 결과 관찰 전 PASS/GO 금지. 기존 required CI·rootfs RO·cgroup·G7 승인 불변. [FailureLedger](FailureLedger.md) 및 [TestReport](TestReport.md).

---

## 6. 벤더 공식 문서 확인 및 A 후보 보안 보류 사유

- [Chromium: Using Chromium with SwiftShader](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md): CPU software implementation 및 `--use-gl=angle --use-angle=swiftshader` 실험 모드, `--enable-unsafe-swiftshader` 안전 경고. **Chromium은 SwiftShader를 신뢰하지 않는 콘텐츠 처리에 사용하도록 설계된 안전한 프로덕션 격리로 보장하지 않는다.** 별도 sandbox+격리/허용 입력과 취약성 관리 없이 신규 DXF 파일을 production 자동 게시할 수 없으므로 보안 검증을 추가 GO 필수 조건으로 둔다.
- [gdsestimating/dxf-parser README](https://github.com/gdsestimating/dxf-parser): Node `parseSync` 예제/Node sample, Header/2D Entity/Layer/BLOCK/INSERT/TEXT·일부 MTEXT 지원, 3DSolid·leader 등 미지원, MIT. 이는 **파싱 API 보유 증거**이지 기존 Three.js 변환·Scene Fidelity·운영 안전성 PASS가 아니다.
- [저장소 font OFL.txt](https://github.com/planner77/layoutManager/blob/main/src/public/fonts/OFL.txt) 추적 파일 존재 확인. 시스템 패키지 Chromium/그 의존성 및 새로운 Node 파서 license inventory/SBOM 검사는 아직 별도 실행 필요. 회사 보안·라이선스 수용 전 worker release 금지.


---

# Issue #218 — P1-A2 CPU-only DXF→Scene 변환기 검증 설계·Gate 원장

> 2026-11-03 기준 Main: `55b82cdf35f6d9f606dcab16830cd61ce0098082`; Branch: `feat/218-a2-headless-cpu-gate`.
> **판정: GO 보류(BLOCKED / 기술 검증 증거 미완성).** 본 PR은 P1-A2 **실험 장치 및 자동 시험을 추가**할 뿐 서버 Scene 자동 생성·G7 게시·실 배포 기능을 제공하지 않는다. CI/실 도면/현장 수용 전 PASS 선언 금지. #218 AC01~AC09 미완료, Issue OPEN.

## 1. 증거 및 의존성

- 정본: [#218](https://github.com/planner77/layoutManager/issues/218), 원 요구·이력 [#208](https://github.com/planner77/layoutManager/issues/208), [Issue208.md](Issue208.md), [AGENTS](../AGENTS.md), Architecture/Decisions/Requirements/Database/Logging/Operation/TestPlan/TestReport/FailureLedger.
- [#217](https://github.com/planner77/layoutManager/pull/217) P1-A1 HEAD `5501770c6773980672b1e2c6f54ccaaaf21874d4`, [PR CI #472](https://github.com/planner77/layoutManager/actions/runs/41524840539) 8/8 성공은 **직접 Node 변환 NO-GO + 독립 Three DTO/Restore 부정·기본 검증**까지만 확인. [CI #457](https://github.com/planner77/layoutManager/actions/runs/41520729471)에서 Node `three-dxf-viewer@1.0.44` WMF/RTF 분기 `window is not defined` **4개 비동기 unhandled rejection** 발생. try/catch 혹은 성공한 DTO만으로 GO 간주할 수 없다.
- #212: 수동 브라우저 `ThreeDxfViewerAdapter.load → DXFViewer.getFromPath → preflightSceneRoot → tagImportedTree → extractDxfText → serializeSourceScene(CUSTOM_DTO) → full Validator` 기준. `getFromPath` 화면·렌더링 fallback 성공은 서버 READY가 아니다.
- #209/#211: Greenfield/OCI release Registry/명시 승인 Upgrade·Writer0/Volume/백업·복구를 #218에서 수정하지 않는다. #216: immutable v0.58.1 App/Migrator 게시·원본 릴리스 복구와 신규 Worker 이미지는 별개. v0.58.0/v0.58.1 태그나 digest 변경 금지.
- #113/#193: 승인된 3종 실 DXF 및 실제 PC/GPU/2PC/Memo/Outline/Zone 통합 수용은 공개 합성 코드·CI로 대체 불가. 실제 도면/해시·식별자 GitHub에 반출 금지.
- Main 조사 시 열린 PR 0건(조회 시점), 이후 Main 변화·PR 신규 발생 시 병합 충돌 재확인. 이번 작업은 AGENTS/설계 정본을 근거로 하며 루트 DESIGN.md는 생성하지 않는다.

## 2. 설계 옵션 비교 — 구현 선택 전 평가(실측 전, 추정과 증거 분리)

| 축 | A: 독립 Headless Chromium + software WebGL | B: Node 공식 DXF parser + 직접 Three 변환 |
|---|---|---|
| 실행 API/Node | Chromium/Playwright는 browser JS DXFViewer를 실행. **Node 내 DXFViewer 직접 호출 금지**. 브라우저는 서버 테스트 프로세스로 독립 실행 | Node 지원 DXF 파서(예: dxf-parser)는 DXF 객체 파싱에 사용 가능. **기존 Viewer Object3D/DTO 변환 API는 별도 구현 필요** |
| DXF Geometry/한글 | 기존 THREE Builder를 직접 재사용 가능하여 비교 비용 낮음. 실제 TEXT/MTEXT glyph/폰트는 테스트 필수 | LINE/CIRCLE/LWPOLYLINE/BLOCK/INSERT/OCS/MTEXT 등 변환 지원 범위·폰트 삼각화/문자 정렬/line style를 직접 증명해야 함 |
| 중첩 INSERT/좌표 | 기존 변환기 실행 전 별도 BLOCK DAG·확장량 제한, WCS/BBox/단위 검증 필요 | INSERT instance/transform 재귀 구현·스케일/회전/OCS·중첩 DAG 및 Stable ID 별도 구현 필요 |
| 자원/오류 | Chromium·SwiftShader가 CPU/RAM 크고 별도 브라우저 프로세스, sandbox·network·kill/timeout·late rejection 실증 필요 | CPU/RAM 비용 잠재적으로 작지만 장시간 순수 JS·파서 예외·기하 확대·폴백 누락 위험, 프로세스 격리 필수 |
| 라이선스/폐쇄망 | 현재 three/three-dxf-viewer·Chromium/의존 라이선스 및 글꼴 배포 조항을 이미지 SBOM에서 확인. Chromium 런타임 번들·수급 필요 | 실제 선택 파서의 LICENSE·의존성·글꼴 확인. dxf-parser MIT 후보이나 새 converter 작업·의존성 동결 전 채택 아님 |
| P1-A2 선택 | **우선 시험 후보**: 기존 #212 변환 정합성 입증의 출발점. software WebGL identity를 확인하지 못하면 실패 | **현재 대기**: 지원되는 Node parser 자체와 이후 full converter는 실제 변환/비교 시험 전 미검증; 시간·복잡도·fidelity 과제 |
| 실제 GO | **미확정**: 아래 A2 시험과 격리/현장 경계를 모두 통과해야 함 | **미확정**: 동등한 전체 시험 증거 없이 선택/운영 금지 |

`three-dxf-viewer@1.0.44` 직접 Node 호출은 옵션 B가 아니며 앞선 NO-GO를 보존한다. 새로운 Node parser 사용 시 기존 `sceneScope`의 `builder` 식별을 허위 재사용하거나 READY를 위조할 수 없으므로 schema/호환성 변경 분석·Migration/복원 판정이 선행되어야 한다.

## 3. P1-A2 첫 PR 구현 범위

- `src/tests/a2/headless-browser.ts`: 실제 원본 바이트 SHA 검증, 소프트웨어 WebGL renderer identity, `DXFViewer.getFromPath` 실제 DXF→Object3D, node/scalar preflight, `tagImportedTree`, UTF-8 텍스트 인덱스, `CUSTOM_DTO` serialize, manifest/SHA/full validator, `restoreSourceScene` 검증. 소스·CAD 전문/실 해시/임의 exception을 공개 로그에 내지 않는다.
- `src/tests/a2/headless.spec.ts`: 정확 동일 synthetic DXF+TTF를 독립 Headless SwiftShader와 별도 Chromium 브라우저 프로세스에서 실행해 노드/geometry/Layer/Stable ID/transform/WCS BBox를 비교. DTO byte digest 및 파일 저장·읽기·fresh process restore. **동일 browser test harness 비교이며 실제 #212 Viewer UI end-to-end 판정이 아님**.
- `src/tests/a2/fixtures.ts`: AC1024/한글 TEXT·MTEXT/Layer/INSUNITS/LINE·CIRCLE·LWPOLYLINE/BLOCK·중첩 INSERT/큰 좌표, 2^18 instance 폭증, cyclic BLOCK, 비지원 Entity. 전부 공개 합성 입력이며 실제 고객 도면 아님.
- `src/tests/a2/dxf-risk-preflight.ts`: parser 앞 단계에서 **보수적 합성 fixture 안전 경계** (UTF-8/16MiB, 알 수 없는 Entity, dangling/cycle BLOCK, expanded 100k 초과). 실제 범용 DXF 파서/운영 whitelist가 아니며 비지원 Entity를 조용히 누락하지 않는다. 기존 직렬화 하드 상한 32MiB, 100k nodes, 2M scalars, depth128 **불변**.
- `src/tests/unit/scene-a2-risk-preflight.test.ts`: 위험 검사 회귀. `src/tests/a2/Dockerfile` + `playwright.config.ts`: Debian Bookworm, apt Chromium, UID 10001, 사내 비밀·운영 volume 불필요 시험 이미지.
- `.github/workflows/pr-ci.yml`: 해당 A2 branch에만 신규 CPU 테스트 잡을 *기존 required Verify에 추가 필수* 의존. 네트워크 none/read-only, no-new-privileges, cap drop, CPU2/RAM1536MiB/pids256/shm256MiB, /tmp512MiB, 최대15분. 미완료/timeout/OOM/crash/비동기 pageerror 발생 시 success 금지. 기존 Quality/Chrome/G7/Docker gate는 유지. 테스트 이미지 GHCR 게시·운영 활성 없음.

### 범위 밖/잔존 설계 위험

1. 브라우저 하네스와 실제 `#212 ThreeDxfViewerAdapter` 동등성은 **추가 구현/통합 E2E 필요**: 기존 Viewer의 렌더 fallback, 선택 인덱스(선택적), TEXT glyph 실제 이미지, opaque/MText style 및 BLOCK 변환 경로 차이를 비교하지 않았다.
2. Chromium sandbox는 현재 임시 CI 컨테이너에서 `chromiumSandbox:false`; 실행 주체 분리를 검증하더라도 production sandbox/프로세스 격리 보장 아님. cgroups OOM/kill/restart/잠긴 subprocess/late async task/no network/filesystem secret redaction 복합 장애 주입 미실행.
3. 합성 한글 glyph count/텍스트 인덱스만으로 실제 글꼴 배치 fidelity가 입증되지 않는다. 5MiB/20MiB+ 실 DXF, nesting 214k 등 현장 위험 및 OCS/ANSI_949, HATCH/SPLINE/치수 비지원/entity coverage은 #113/#193와 별도.
4. 실제 browser `DOM`/WebGL 공급 필요, CPU-only에는 GPU API 없음(software renderer). Memory/CPU/elapsed 실제 수치는 CI 로그로만 수집한 뒤 평가. 같은 입력에서 WCS 허용오차 **합성 시험 1e-5 Drawing Unit**, **Owner 현장 SLA 대체 아님**. Stored Scene Validator은 원본 geometry semantic completeness를 확인하지 않으므로 소스 entity 대비 누락을 판별하는 커버리지 matrix가 추가 필요.
5. `SceneRepository.publish`, CurrentScene CAS/Revision, G7 Actor/Site/Session, Audit, S3 저장, upload hook/영속 Job, Prisma/Compose를 이 PR에서 변경하지 않았으며 운영 READY가 발생하지 않는다.

## 4. 단계별 Gate 및 후속 PR 설계(허가된 GO 전 실행 금지)

| Gate | 통과 증거 | 현재 |
|---|---|---|
| A2-01 실제 CPU-only source→DXF parser→Object3D→CUSTOM_DTO→Manifest/SHA→full validator→Restore | 정확 컨테이너 테스트 로그/PR HEAD 및 비동기 error0 | **NOT RUN** |
| A2-02 WCS/BB/Geometry/TEXT·MTEXT/BLOCK·nested INSERT/Layer/Unit/Origin/Stable ID | browser #212 실제 빌더와 **동일 입력** fidelity matrix, 허용오차·누락0 | **NOT VERIFIED** |
| A2-03 자원 경계 | Node<100k·2M·depth128, DTO<32MiB, 폭증 사전 거절, peak RSS/CPU/elapsed | 단순 테스트 코드 작성; **실 측정 NOT RUN** |
| A2-04 격리/오류 | UID10001 Debian, CPU-only, offline, timeout/OOM/kill/restart, late async errors0, crash 후 자원·비밀 보존 | 테스트 구성만 구현, 복합 주입 **NOT IMPLEMENTED/NOT RUN** |
| A2-05 라이선스/운영 안전 | Chromium/폰트·third-party licenses/SBOM, signed release 분리, CPU limit・security review | **NOT VERIFIED** |
| A2-06 PR 게이트 | 정확 HEAD typecheck/lint/unit/browser/G7/Docker/신규 A2 CPU job 전체 성공, review0/mergeable | **CI 시작 전 NOT VERIFIED** |

**A2 최종 판정: GO 불가/차단 (insufficient evidence).** 모든 A2-01~06가 확인되기 전 P1-B/C/D 시작, 자동 게시·GHCR release 금지. 기술적 실패는 A 후보 NO-GO로 분리하고 B를 별도 검증 PR로 검토한다. CI pass 하나도 실 고객/현장 수용이 아니다.

- **P1-B 후속**: 정확 A2 GO 후에만 `CadRepository.register`와 `SceneBuildJob` 동일 SQLite transaction, 영속 worker/lease/fencing/idempotency/heartbeat/retry/restart, 원본 SHA, 실 G7 Actor·Site·Session·Writer 및 권한 회수 재검증, SceneRepository 검증/비파괴 CAS+Audit. READY Scene/Current/원본/APP_CREATED/Memo/Zone/Outline 보존.
- **P1-C 후속**: 그 다음 홈/Location Version 상태 JOIN/batch, 검증된 CurrentScene READY와 job status 독립, 익명 민감정보 redaction, Editor 재시도/G7 Origin+CSRF, visible pending polling 및 #202 메모 검색/#165 Scene-first 회귀.
- **P1-D 후속**: 그 다음 별도 worker image/Compose/health, Greenfield·Schema/approved migration, #209/#211 release registry, 2 worker/SQLite busy/ACK loss/S3 503/복구/2PC. #216 immutable 릴리스와 별도 신규 SemVer/OCI provenance/Host plan 필요.

## 5. 실행·리뷰·CI 기록 규칙

- 이 문서를 작성한 시점에는 로컬 npm/tsc/Vitest/Playwright/Docker 실행 **NOT RUN**. 원격 GitHub 파일 저장은 실행 증거가 아니다. PR CI를 시작한 뒤에도 최종 작업 상태는 정확 HEAD/run/job 결과로만 판정.
- 검증 스크립트 실행: `docker build --platform linux/amd64 -f src/tests/a2/Dockerfile -t layoutmanager-a2-proof:ci .` 후 repository PR CI의 **isolated CPU job**을 사용. 사내망/현장에서는 Docker 바이너리/모델 폰트 라이선스 사전 승인 후 재현해야 하며 운영 volume이나 CAD 원본을 마운트하지 않는다.
- 리뷰 unresolved thread 0, base 최신·mergeable, exact SHA, 실패 원장 보완은 **검사 후** 기록. PR CI 성공만으로 A2 GO/전체 #218 AC 완료/운영 GHCR 게시라고 쓰지 않는다.
