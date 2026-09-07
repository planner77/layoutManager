# 실제 검증 결과 및 Viewer 평가

## U7B-20260908 — 등록 DWG Viewer 통합 0.10.0

- Source: 6ef6095 이후 이 결과를 포함한 `feat(viewer)` 커밋 snapshot. 앱 버전 0.10.0, 기존 exact dependency와 DB Schema 변경 없음.
- 범위: 등록 DWG 원본 ID API→LibreDwgWebAdapter→전용 Worker/WASM→직접 평면 LINE 렌더링. 확대/축소/Pan/Fit/Resize·재시도·부분 표시·오류/취소를 공통 UI에 연결했다. DWG에 두 DXF Viewer 버튼을 제공하지 않고 조작 query도 DWG 전용 Adapter를 선택한다.
- 환경: Node 22.14.0/Linux x64, Playwright 1.63.0/Chromium 145.0.0.0/SwiftShader, 기본 viewport 1440×1000, resize 1100×800, worker 1. 실제 DWG는 U7A에 기록한 공식 고정 AutoCAD 2000 Line.dwg/circle.dwg(동일 SHA-256). Browser 시험은 실행별 임시 DB/Storage·3101, 기존 사용자 데이터에 파일을 등록하지 않았다.

| 검사 | 실제 결과 |
| --- | --- |
| Type Check / Lint | 각각 exit 0 |
| Vitest `npm --prefix src test` 최종 | 11 files / 43 passed / 0 failed, 9.49초 |
| Production Build | exit 0, 등록 Version Viewer 및 /lab/dwg 정상 build |
| `test:dwg` | 4 passed / 0 failed / 0 skipped, 15.2초 |
| `test:e2e` | 12 passed / 0 failed / 0 skipped, 51.2초 |
| Local 3100 | 0.10.0 재시작, 홈/등록/WASM HTTP 200 및 버전 문구 확인 |
| Secret/산출물 제외 | 103 commit candidates / 0 violations |

명령은 Operation을 따른다. Browser executable은 `/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`. 초기 Type Check/Build는 DB format의 String→ViewerFormat 할당 오류로 실패했다. 서버 페이지에서 실제 DXF/DWG 값 검증 후 narrowing하도록 수정하여 최종 검사 통과했다. 42개 자동 시험 실행 후 한도/헤더/해제 후 입력 거부 시험을 추가해 최종 43개를 실행했다.

### 요구사항 → 구현 → Test Case → 결과

| 요구 / TC | 코드 | 실제 검증 |
| --- | --- | --- |
| FR-LIST-003, FR-VIEWER-005, FR-UI-001 / TC-E2E-002 | cad-table, version viewer page, CadViewer, dwg-viewer.probe.ts | 실제 DWG UI 등록→목록/검색/Current 표시→도면 보기→LINE 표시. 선택 Version ID·계측 renderer/Entity 수 일치, 원본 bytes 동일 |
| FR-VIEWER-001 / TC-VIEW-001 | core/selection.ts, Manager format, dwg-adapter.test.ts | DWG에 DXF query를 전달해도 LibreDWG만 선택, 두 DXF 버튼 없음. DWG Manager에 DXF 요청 시 factory 미호출 |
| FR-VIEWER-006 / TC-VIEW-002 | libredwg-web/line-view.ts, dwg-viewer.probe.ts | 확대/축소/Fit·Pan의 canvas 픽셀 변화 및 Fit 복구, Resize canvas 크기 일치 |
| FR-VIEWER-008 / TC-DWG-003 | adapter/probe/line-view, dwg-viewer.probe.ts | 3회 다시 불러오기 후 canvas 1개/Worker 0, 화면 이탈 canvas 0, 재진입 성공, 지연 WASM 처리 중 이탈 시 Worker 1→0 및 늦은 canvas 없음 |
| FR-VIEWER-008 / TC-DWG-003 | dwg-adapter.test.ts | cancel 반복은 terminate 1회/AbortError; 60초 timeout은 terminate 후 실패. timeout은 fake timer 단위 시험이며 실제 60초 대기는 하지 않음 |
| FR-ERROR-001 / TC-DWG-002/004 | adapter/UI, dwg-viewer.probe.ts | 미지원 헤더/손상 DWG 실패, CIRCLE 제외 건수/partial, 원본 404/WASM 404 안내 및 해제 후 retry 성공 |
| FR-ERROR-001 / TC-DWG-002 | dwg-adapter.test.ts | 빈 입력/20 MiB 초과/잘못된 헤더/Dispose 이후 입력은 Worker 생성 전 거부 |
| NFR-PERF-001 | core/metrics.ts + Manager | 제외 Entity는 result partial+reasons.coverage; LINE 0개이면 firstDisplayMs null, 거짓 전체 성공 없음. 상세 DWG stage 계측은 8B |
| NFR-TEST-001 | 기존 전체 회귀 및 dwg.probe.ts | DXF 등록/Current/두 Renderer·전환20회/글꼴/계측/오류와 DWG 독립 실험 모두 PASS |

`src/dwg-test-results/registered-dwg.png`(Git 제외)를 시각 확인했다. libredwg-web 단독 표시, 실제 LINE과 탐색 도구·한도 설명을 확인했다. 기준 CAD 프로그램과 정밀한 실도면 fidelity 비교는 수행하지 않았다. 별도 장기 메모리 시험 없이 Worker 수/canvas 해제만 관찰했으므로 전체 GPU/JS 메모리 누수 없음으로 해석하지 않는다.

### 운영 및 제한

- 이전 0.9.0 프로세스를 종료할 때 webpack-runtime의 undefined.call 오류 로그가 있었다. 동일 `.next`에 새 Build를 쓰는 동안 기존 프로세스가 남아 있었으며 모듈 혼용 가능성이 있다. 새 0.10.0 프로세스로 재시작 후 홈/등록/WASM smoke 정상. Operation에 단일 workspace의 기존 start 중지→build→start 순서를 기록했다.
- planar LINE/20 MiB 범위 유지. Parser가 읽은 CIRCLE은 자체 renderer에서 제외하며 이를 parser 미지원으로 분류하지 않는다. TEXT/BLOCK/곡선·Layer/style/색상·선종류/전체 Entity는 미지원 또는 미검증. AutoCAD 2000 이외 revision/실도면/대형 성능·장기/저메모리 장비 시험은 NOT RUN.
- 공통 metrics schemaVersion 1에 result partial enum 추가. JSON 소비자는 이를 허용해야 한다. DWG 순수 parse 계측은 공통 UI에서 아직 null이며 상세 init/parse/convert와 비교는 Unit 8B이다.
- DB·업로드 원본·migration 불변, DWG→DXF 변환 없음. 20 MiB보다 큰 파일의 등록 가능 여부는 기존 Upload 설정을 따르고 Viewer는 별도 제한 안내를 한다.
- 기존 의존성 high 경고와 원격 이슈 #2 메모 요청은 후속. 이번에 library 변경이나 audit 재실행은 하지 않았다.
- Unit 7B의 최소 지원 범위 통합 기준 충족. 전체 업무 DWG/P.O.C. 최종 완료와 구분하며 다음 승인 Unit은 8B 계측 및 평가이다.

## U7A-20260908 — libredwg-web 실제 DWG 최소 실험 0.9.0

- Source: 1277f00 이후 이 결과를 포함한 `feat(dwg)` 커밋 snapshot. 신규 고정 dependency @mlightcad/libredwg-web 0.7.10(GPL-3.0), 기존 Next/Three/DXF 버전 및 DB Schema 불변.
- 범위: 독립 `/lab/dwg`의 로컬 파일→전용 Worker→WASM→DWG model-space 객체→자체 planar LINE renderer. 등록 Version 화면 통합은 아직 구현하지 않았다. DXF 변환/두 DXF Viewer를 호출하지 않는 import/data 흐름을 검토했다.
- 환경: Node 22.14.0, Linux x64, Playwright 1.63.0, Chromium 145.0.0.0/SwiftShader, viewport 1440×1000, worker 1. Production E2E는 실행별 임시 DB/Storage/3101. 사용자 DB/원본에 시험 데이터를 추가하지 않았다.

### 실제 검사

| 검사 | 결과 |
| --- | --- |
| Type Check / Lint | 각각 exit 0 |
| Vitest `npm --prefix src test` | 10 files / 39 passed / 0 failed, 10.49초 |
| Production Build | exit 0, `/lab/dwg` 생성 및 SSR Browser API 오류 없음 |
| 기존 `test:e2e` | 12 passed / 0 failed / 0 skipped, 59.4초 |
| `prepare:dwg-samples` | 공식 2개 파일 SHA-256 일치 |
| 최종 `test:dwg` | 2 passed / 0 failed / 0 skipped, 7.9초 |
| Local 3100 smoke | 0.9.0 서버 재시작, `/lab/dwg` 및 WASM HTTP 200 |
| 후보 Secret/산출물 검사 | 99 candidates, 0 violations; CAD/생성 ESM/WASM/DB 미추적 |

실행은 Operation 명령을 사용하며 Chromium executable은 `/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`. DWG 최초 Browser 실행도 2 passed(8.9초)였다. DXF 실행이 DWG 캡처를 지우지 않도록 별도 `dwg-test-results` 경로로 분리 후 최종 재실행했다.

### 샘플 및 재현성

출처는 [공식 고정 커밋의 AutoCAD 2000 시험 데이터](https://github.com/mlightcad/libredwg-web/tree/5909bd2bb87fa1168838e1295188f3ee603618eb/test/test-data/2000). 실제 CAD bytes를 다운로드하여 시험했으며 mock DWG가 아니다. 원본은 `src/node_modules/.cache/cad-dwg-samples`에만 저장하고 Git에 넣지 않았다. `scripts/dwg-samples.mjs`에서 URL revision과 hash를 고정한다.

| 파일 | bytes | SHA-256 | 결과 |
| --- | --- | --- | --- |
| Line.dwg | 174005 | 358fc09c7c27737ba3b500eac122caee4c83c270f5ccb8a9f7f8f3d4b763d937 | 실제 model-space LINE 1개, 직접 화면 표시 |
| circle.dwg | 177345 | d2c2e592c4d501aa416bf41383b8067f7f72c32af558d1dea8481bb7d884b6dc | CIRCLE 파싱됨, renderer 미지원 건수 및 LINE 없음 표시 |

### 요구 → 코드 → TC → 결과

| 요구 / TC | 구현·시험 | 실제 결과 |
| --- | --- | --- |
| FR-VIEWER-005 / TC-DWG-001/005 | viewers/libredwg-web/{worker,primitives,line-view}; tests/e2e/dwg.probe.ts | Worker에서 raw DWG 직접 파싱, LINE 1개 표시 및 확대 후 canvas 픽셀 변화. 정적 asset HTTP 200/application/wasm |
| FR-VIEWER-008 / TC-DWG-003 | worker finally, probe.cancel; dwg.probe.ts | 3회 load 각각 원본 pointer raw.dwg_free 호출 완료, FS 임시 파일 없음, active Worker 0. 반복 시 canvas 1개, 해제 버튼 후 canvas 0 |
| FR-ERROR-001 / TC-DWG-002/004 최소 subset | worker 안전한 stage 오류, dwg.probe.ts | 손상 DWG 실패, WASM 404 초기화 실패, 결과 데이터/성공 canvas 없음 |
| FR-VIEWER-007 최소 subset | linePrimitives; unit/dwg-primitives.test.ts | CIRCLE/숨김/비평면/PaperSpace/비유한 LINE 제외 건수 확인. 지원하지 않는 기하를 표시했다고 주장하지 않음 |
| NFR-TEST-001 | 기존 tests 전체 | DXF 관리/Current/전환/한글/오류/계측 회귀 PASS |

수동 시각 확인: Browser 캡처에서 청록색 대각선 LINE과 결과 `lineCount=1`, `freed=true`, `temporaryFileRemoved=true`를 확인했다. 생성 캡처는 Git 제외 `src/dwg-test-results/dwg-line-probe.png`. 기준 CAD 프로그램 화면과의 정밀 fidelity 대조는 NOT RUN이다. 최초 실행 캡처 3회차에서 init 167.4ms / parse 61.5ms / convert+primitives 28.4ms를 관찰했으나, 반복 성능 비교 설계에 따른 통계가 아니므로 성능 판정에 사용하지 않는다.

### 발견·수정 및 한계

- 초기 Type Check: 배포본의 locateFile 파라미터와 FS.analyzePath 2번째 인자에 맞춰 타입/호출 수정 후 통과.
- 초기 Build: Emscripten의 guarded `node:module` import를 Webpack이 처리하다 UnhandledSchemeError. upstream 코드는 수정하지 않고 고정 ESM/glue/WASM을 local public asset으로 준비해 Worker에서 native dynamic import하도록 수정 후 Build/Browser 통과.
- README 예제의 free 대상 표현보다 설치 배포본 타입/소스를 우선했다. 변환된 JS database가 아닌 원래 DWG pointer를 raw.dwg_free에 전달한다. FS.unlink/free 이후 결과를 전송하고 main에서 Worker를 terminate한다.
- parser는 CIRCLE을 읽지만 이번 자체 renderer는 LINE만 그린다. 이 차이는 LibreDWG parser 미지원으로 분류하지 않는다. layer/style/color/선종류/두께/BLOCK/TEXT/곡선은 후속 renderer 범위이다.
- raw parser nonzero flags는 이 실험에서 모두 실패로 처리한다. 경고 수준과 부분 로드 허용 정책은 7B에서 실제 API 및 샘플로 확장한다.
- npm package 빌드 옵션 INITIAL_MEMORY=1GB; Worker 종료/포인터 해제가 즉시 OS 메모리 회수 또는 누수 없음의 증거는 아니다. 장기/대형/저메모리 장비 및 다른 DWG revision은 NOT RUN.
- install의 기존 high severity 4개 경고 유지. 라이브러리 의존성 교체·강제 audit fix는 수행하지 않았다.
- Unit 7A 최소 실험 기준 충족. 다음 Unit 7B에서 등록 Version 원본 API→LibreDwgWebAdapter→화면을 연결한다. 전체 업무 DWG 지원이나 P.O.C. 최종 완료로 판정하지 않는다. 원격 이슈 #2 메모는 별도 후속 요청이다.

## U9A-20260908 — DXF 통합·회귀 및 릴리스 검증

- Version: 0.8.0 유지. Source: e9339a3 위에 이 결과를 포함한 `test(release)` 커밋 snapshot. 앱 기능·라이브러리·DB Schema 변경 없음.
- 환경: Node 22.14.0, Linux x64, Playwright 1.63.0 / Chromium 145.0.0.0, SwiftShader, 1440×1000, worker 1. Unit 8A와 동일 설정. 실행별 임시 SQLite/Storage 및 3101 Production 서버 사용; 기존 사용자 데이터에 시험 파일을 등록하지 않았다.

| 검사 / 명령 | 실제 결과 |
| --- | --- |
| `npm --prefix src run typecheck` | PASS, exit 0 |
| `npm --prefix src run lint` | PASS, exit 0 |
| `npm --prefix src test` | 9 files / 38 passed / 0 failed, 14.80초 |
| `npm --prefix src run build` | PASS, exit 0; 등록·목록·상세·Viewer 및 API route 생성 |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=… npm --prefix src run test:e2e` | 12 passed / 0 failed / 0 skipped, 1.1분 |
| Schema review | schema.prisma/migration/Database.md의 Column/Null/Default/FK/Unique/Index 대조; TC-DB-007 PASS, Schema 변경 없음 |
| Secret/런타임 제외 검사 | 88 commit 후보, 위반 0; 실제 env 값 비출력 |
| `git diff --check` | PASS, exit 0 |

Chromium 실행 파일은 `/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`. 환경별 경로는 Operation에 따라 지정한다. E2E의 FORCE_COLOR/NO_COLOR 경고는 실행 환경 경고이며 실패는 없었다.

### 요구사항 → 구현 → 실행 근거

| 요구 / TC | 실행 코드 | 실제 확인 |
| --- | --- | --- |
| FR-CAD-001/003, FR-VERSION-002/003, FR-LIST-003, FR-UI-001 / TC-E2E-001 | tests/e2e/workflow.spec.ts | UI에서 동일 Location V1/V2 등록→검색→V2 Current 확인→V1 지정→reload/목록 API/상세 API 단일 Current 일치→V1 DXF 두 Viewer 표시, 7.9초 |
| FR-FILE-001, FR-VIEWER-002/003, NFR-PERF-001 | workflow.spec.ts | 선택 Version ID/파일 크기/Renderer 계측 일치, 원본 bytes 동일, 확대 전후 canvas pixels 변화, console error/pageerror 0 |
| FR-VIEWER-004 / TC-SWITCH-001/002 | tests/e2e/switch.spec.ts | 20회 전환, 동일 document/Version·다운로드 1회, 재시도 시 2회; canvas 1개, 추적 Worker/Blob 0 및 active context 1; 화면 이탈 후 모두 0, 24.4초 |
| FR-VERSION-001–004, NFR-DATA-001 | tests/integration/database.test.ts | 위치 Unique·Version 순번·Current 교체/rollback/경쟁·타 Location SQL/service 차단·FK 및 Index 회귀 PASS |
| FR-CAD-001–005, FR-LIST-001/002, NFR-SEC-001 | tests/integration/upload.test.ts, list.test.ts | 업로드/실패 보상/중복 hash·검색/필터·traversal/symlink 회귀 PASS |
| FR-VIEWER-002/003/006, FR-ERROR-001 | tests/e2e/viewer.spec.ts | 두 Viewer의 LINE/CIRCLE/한글 TEXT·탐색·resize·재진입, 손상/빈 DXF, DWG 미제공 안내 회귀 PASS |
| NFR-PERF-001 / TC-MET-001 | metrics.spec.ts 및 unit/metrics.test.ts | JSON export·빈 도면·성공/실패/취소·null 사유 회귀 PASS |

캡처는 Git 제외 `src/test-results/release-workflow.png`. 새로 수행한 시각적 수동 fidelity 평가는 없으며 canvas 변화 assertion을 전체 Entity 정확성으로 해석하지 않는다. U8A 동일 앱의 60개 성능 측정은 재실행하지 않았고 위 기존 보고서의 실제 결과를 참조한다.

### 판정 및 제한

- DXF 우선 릴리스의 자동화 기능 통합·회귀 기준 충족. 두 Viewer 기본 흐름을 검증했으며 실패 미해결 테스트는 없다. 테스트/문서만 변경하여 앱 버전 0.8.0 유지, 이번 Tag 생성 없음.
- 실제 업무 Sample/기준 CAD 화면·SLA 미제공: TC-CAD-001 실도면 충실도, 복잡한 Entity, >10 MiB 도면, 다른 Browser/실 GPU 장기 사용성은 NOT RUN. 자원 수 20회 확인은 전체 JS/GPU 장기 누수 없음의 증명이 아니다.
- DWG의 실제 libredwg-web 초기화/렌더링은 NOT RUN. 다음 승인 Unit은 7A 기술 실험이며 전체 P.O.C. 완료로 판정하지 않는다.
- 기존 Prisma 전이 의존성 경고는 미해결이다. 이번에 의존성 변경/audit 재실행은 하지 않았다.
- 원격 연결/인증·main HEAD=e9339a3 일치를 시작 시 확인했다. 원격 이슈 #2 등록 메모 요청은 OPEN이며 이번 회귀 범위와 별도 후속 항목으로 기록했다. Commit/Push 최종 결과는 이 기록을 포함한 Git history와 원격 HEAD 검증을 기준으로 한다.

## U8A-20260908 — 계측 및 합성 도면 비교 0.8.0

- Source: 이 결과를 포함한 `feat(metrics)` 커밋 snapshot. Type Check/Lint/Production Build 통과. DB Schema 및 기존 library version 변경 없음.
- 로컬 3100을 0.8.0으로 재시작하고 홈/아이콘 HTTP 200을 확인했다. 커밋 후보 87개 Secret/런타임 제외 검사 위반 0. 원본 CAD/Runtime DB/benchmark JSONL을 커밋하지 않고, 측정값 및 출처는 이 보고서에 보존했다.
- 자동 테스트 38 passed / 0 failed. 성공/빈 도면/오류/취소, 원본 재사용과 stage/null 사유를 검증했다. E2E 11 passed / 0 failed (42.1초), JSON 다운로드 내용과 현재 renderer/source 상태 일치 포함.
- 최종 benchmark 30 cold/warm 쌍 = 60개 측정. 3가지 LINE 개수 × 2 Viewer × cold/warm × 각 5회. 모든 Load 성공, Console error/pageerror 0. 이는 합성 fixture 기능 검증이며 성능 SLA 합격 판정이 아니다.
- 예비 실행은 favicon.ico 404 때문에 9 failed/1 interrupted/20 not run으로 중단했다. 실제 trace에서 누락 아이콘 요청을 확인하고 app/icon.svg를 추가했다. 예비 값은 아래 최종 결과에서 제외했다. 별도 benchmark 설정의 TypeScript union 처리 오류도 수정 후 검사 통과했다.
- 환경: Linux x64, Intel Core Ultra 7 255H, logical CPU 16, OS 보고 RAM 15 GiB. Node 22.14.0, Playwright 1.63.0, Chromium 145.0.0.0 (cache 1208), SwiftShader, 1440×1000, DPR 1, worker 1. 개발 환경의 공유 장비이며 전용 무부하 장비가 아니다.
- cold=새 Browser context 첫 열기(프로세스/OS cache까지 초기화한 것은 아님), warm=같은 Version에서 다른 Viewer 경유 후 원래 Viewer 복귀(memory source+Browser/module/font cache). 시작 시간은 Manager.load부터이며 HTML navigation 전체 시간은 포함하지 않는다.
- 전체=최종 결과 시점, 처리=Adapter Load(bytes 복사/파싱/준비/글꼴/렌더링 통합), 첫 화면=성공 draw 후 rAF callback 관찰(GPU present 보장 아님). 확대=버튼 click 실행→다음 rAF 관찰. 실제 입력 장치 latency를 포함하지 않는다.
- pure parse는 두 Viewer 모두 null+사유. dxf Entity count는 null, three는 100/10,000/100,000 확인. 표 LINE 수는 fixture 생성 수이며 API 계측과 구분한다. heap은 비표준 usedJSHeapSize snapshot이며 GPU/WASM/전체 process memory가 아니다.
- 같은 도면 크기·SHA-256은 아래 표와 생성 코드 metrics.benchmark.ts로 재현한다. 최대 도면도 약 5 MB로 10 MiB 초과 대형 파일은 NOT RUN. LINE만으로 TEXT/BLOCK/HATCH 등 실제 도면 복잡도를 대표하지 않는다.
- 상세 원시 JSONL은 Git 제외 src/benchmark-results/measurements.jsonl. 아래 개별 시간/heap과 sample hash를 보존한다. 재현 명령: Production Build 후 PLAYWRIGHT_CHROMIUM_EXECUTABLE 지정 npm --prefix src run test:benchmark.

### 합성 Sample

| LINE 수 | bytes | SHA-256 |
| --- | --- | --- |
| 100 | 4716 | 6208373070888c0e04d919cf55129e09d839b7626c20c6152752f9c90f76a565 |
| 10000 | 487836 | b2c022d058d1dd3612732faefe8ebcf662c289571be1305f4948d643aa0d73b4 |
| 100000 | 5058036 | 58211f0609a2aefb9439df7c09b0c0db45417f054807b473c3882021d814b08a |

### 5회 요약 (시간 ms, heap MiB)

| LINE | Viewer | 조건 | 전체 median [min–max] | 처리 median | 첫 화면 median | 확대 median | heap median |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | dxf-viewer | cold | 479.6 [308.1–590.1] | 178.0 | 479.6 | 1.1 | 11.9 |
| 100 | dxf-viewer | warm | 255.9 [234.3–363.7] | 199.8 | 255.9 | 1.6 | 14.3 |
| 100 | three-dxf-viewer | cold | 1440.3 [1101.3–1540.6] | 1232.9 | 1440.2 | 1.8 | 62.0 |
| 100 | three-dxf-viewer | warm | 439.9 [389.5–499.3] | 393.5 | 439.9 | 19.2 | 64.9 |
| 10000 | dxf-viewer | cold | 498.8 [406.5–583.4] | 276.7 | 498.8 | 5.4 | 13.0 |
| 10000 | dxf-viewer | warm | 406.3 [352.3–702.1] | 362.0 | 406.3 | 0.8 | 50.0 |
| 10000 | three-dxf-viewer | cold | 1414.2 [1390.8–1487.0] | 1233.5 | 1414.2 | 422.1 | 99.6 |
| 10000 | three-dxf-viewer | warm | 621.0 [542.2–719.6] | 579.7 | 621.0 | 582.3 | 101.1 |
| 100000 | dxf-viewer | cold | 918.3 [864.9–1364.9] | 672.2 | 918.3 | 191.7 | 22.0 |
| 100000 | dxf-viewer | warm | 656.8 [633.7–820.3] | 618.5 | 656.8 | 143.3 | 295.4 |
| 100000 | three-dxf-viewer | cold | 3338.8 [3265.8–3899.1] | 3108.0 | 3338.8 | 5299.9 | 375.9 |
| 100000 | three-dxf-viewer | warm | 3167.0 [2764.5–4000.6] | 3123.3 | 3167.0 | 5488.1 | 386.4 |

### 개별 결과 (시간 ms, heap MiB)

| LINE | Viewer | 조건/회차 | source 대기 | 초기화 | 처리 | 첫 화면 | 전체 | 확대 | heap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | dxf-viewer | cold/1 | 81.4 | 330.7 | 177.9 | 590.1 | 590.1 | 0.9 | 12.4 |
| 100 | dxf-viewer | warm/1 | 0.2 | 54.9 | 199.8 | 255.9 | 255.9 | 12.6 | 14.4 |
| 100 | dxf-viewer | cold/2 | 26.1 | 105.1 | 178.0 | 309.4 | 309.4 | 0.8 | 13.5 |
| 100 | dxf-viewer | warm/2 | 0.1 | 57.3 | 176.1 | 234.3 | 234.3 | 1.4 | 14.3 |
| 100 | dxf-viewer | cold/3 | 36.1 | 100.9 | 170.9 | 308.1 | 308.1 | 17.5 | 11.8 |
| 100 | dxf-viewer | warm/3 | 0.1 | 49.1 | 199.7 | 249.6 | 249.6 | 1.6 | 14.3 |
| 100 | dxf-viewer | cold/4 | 27.7 | 219.7 | 231.9 | 479.6 | 479.6 | 1.1 | 11.9 |
| 100 | dxf-viewer | warm/4 | 0.1 | 62.7 | 277.9 | 342.0 | 342.0 | 4.2 | 14.5 |
| 100 | dxf-viewer | cold/5 | 38.4 | 257.2 | 237.6 | 533.3 | 533.3 | 8.5 | 11.8 |
| 100 | dxf-viewer | warm/5 | 0.2 | 43.5 | 319.8 | 363.7 | 363.7 | 0.6 | 14.3 |
| 100 | three-dxf-viewer | cold/1 | 20.7 | 174.5 | 1343.9 | 1540.6 | 1540.6 | 1.8 | 61.9 |
| 100 | three-dxf-viewer | warm/1 | 0.2 | 44.9 | 402.1 | 448.2 | 448.2 | 18.4 | 79.6 |
| 100 | three-dxf-viewer | cold/2 | 20.5 | 166.5 | 1252.0 | 1440.2 | 1440.3 | 3.7 | 62.0 |
| 100 | three-dxf-viewer | warm/2 | 0.2 | 49.4 | 449.5 | 499.3 | 499.3 | 19.2 | 64.9 |
| 100 | three-dxf-viewer | cold/3 | 15.2 | 152.2 | 1118.8 | 1287.2 | 1287.2 | 1.4 | 62.0 |
| 100 | three-dxf-viewer | warm/3 | 0.1 | 45.6 | 393.5 | 439.9 | 439.9 | 17.8 | 64.9 |
| 100 | three-dxf-viewer | cold/4 | 56.9 | 202.1 | 1232.9 | 1493.0 | 1493.0 | 13.1 | 60.3 |
| 100 | three-dxf-viewer | warm/4 | 0.2 | 43.7 | 349.4 | 393.8 | 393.9 | 19.3 | 64.9 |
| 100 | three-dxf-viewer | cold/5 | 31.1 | 122.8 | 946.4 | 1101.3 | 1101.3 | 1.4 | 62.0 |
| 100 | three-dxf-viewer | warm/5 | 0.2 | 36.3 | 352.2 | 389.5 | 389.5 | 32.1 | 64.9 |
| 10000 | dxf-viewer | cold/1 | 28.7 | 130.2 | 247.3 | 406.4 | 406.5 | 30.0 | 14.6 |
| 10000 | dxf-viewer | warm/1 | 0.3 | 155.6 | 546.0 | 702.1 | 702.1 | 0.8 | 50.2 |
| 10000 | dxf-viewer | cold/2 | 35.8 | 216.7 | 246.2 | 498.8 | 498.8 | 6.3 | 13.0 |
| 10000 | dxf-viewer | warm/2 | 0.2 | 51.6 | 380.2 | 432.2 | 432.2 | 0.8 | 50.1 |
| 10000 | dxf-viewer | cold/3 | 39.1 | 201.5 | 342.6 | 583.4 | 583.4 | 1.0 | 12.8 |
| 10000 | dxf-viewer | warm/3 | 0.2 | 39.6 | 336.2 | 376.2 | 376.2 | 0.7 | 50.0 |
| 10000 | dxf-viewer | cold/4 | 32.3 | 161.8 | 292.8 | 487.1 | 487.1 | 5.4 | 13.0 |
| 10000 | dxf-viewer | warm/4 | 0.1 | 44.0 | 362.0 | 406.3 | 406.3 | 0.6 | 50.0 |
| 10000 | dxf-viewer | cold/5 | 45.1 | 213.2 | 276.7 | 535.3 | 535.3 | 1.1 | 12.8 |
| 10000 | dxf-viewer | warm/5 | 0.3 | 43.5 | 308.3 | 352.3 | 352.3 | 61.3 | 49.0 |
| 10000 | three-dxf-viewer | cold/1 | 25.8 | 121.7 | 1241.8 | 1390.8 | 1390.8 | 639.2 | 99.6 |
| 10000 | three-dxf-viewer | warm/1 | 0.2 | 34.4 | 507.4 | 542.2 | 542.2 | 460.1 | 101.4 |
| 10000 | three-dxf-viewer | cold/2 | 42.3 | 149.1 | 1294.5 | 1487.0 | 1487.0 | 480.9 | 67.8 |
| 10000 | three-dxf-viewer | warm/2 | 0.1 | 43.5 | 616.3 | 660.1 | 660.1 | 729.7 | 101.1 |
| 10000 | three-dxf-viewer | cold/3 | 35.6 | 156.3 | 1221.1 | 1414.2 | 1414.2 | 422.1 | 100.0 |
| 10000 | three-dxf-viewer | warm/3 | 0.0 | 41.1 | 579.7 | 621.0 | 621.0 | 450.7 | 101.1 |
| 10000 | three-dxf-viewer | cold/4 | 32.2 | 124.2 | 1233.5 | 1391.3 | 1391.3 | 418.7 | 99.6 |
| 10000 | three-dxf-viewer | warm/4 | 0.1 | 44.8 | 573.7 | 618.8 | 618.8 | 603.0 | 101.0 |
| 10000 | three-dxf-viewer | cold/5 | 28.4 | 160.0 | 1228.7 | 1418.2 | 1418.2 | 394.4 | 99.9 |
| 10000 | three-dxf-viewer | warm/5 | 0.2 | 62.8 | 656.4 | 719.6 | 719.6 | 582.3 | 101.1 |
| 100000 | dxf-viewer | cold/1 | 88.4 | 187.7 | 692.3 | 968.5 | 968.5 | 191.7 | 21.9 |
| 100000 | dxf-viewer | warm/1 | 0.2 | 38.3 | 765.6 | 804.2 | 804.2 | 310.9 | 360.3 |
| 100000 | dxf-viewer | cold/2 | 87.5 | 158.4 | 672.2 | 918.3 | 918.3 | 204.5 | 22.0 |
| 100000 | dxf-viewer | warm/2 | 0.2 | 44.5 | 775.5 | 820.3 | 820.3 | 336.6 | 24.7 |
| 100000 | dxf-viewer | cold/3 | 115.9 | 249.0 | 999.8 | 1364.9 | 1364.9 | 325.7 | 22.0 |
| 100000 | dxf-viewer | warm/3 | 0.3 | 38.7 | 610.0 | 649.2 | 649.2 | 143.3 | 295.3 |
| 100000 | dxf-viewer | cold/4 | 82.3 | 160.1 | 622.4 | 864.9 | 864.9 | 70.5 | 22.0 |
| 100000 | dxf-viewer | warm/4 | 0.2 | 38.0 | 618.5 | 656.8 | 656.8 | 74.5 | 310.4 |
| 100000 | dxf-viewer | cold/5 | 80.0 | 159.9 | 648.5 | 888.5 | 888.5 | 52.3 | 21.8 |
| 100000 | dxf-viewer | warm/5 | 0.2 | 30.7 | 602.7 | 633.6 | 633.7 | 0.8 | 295.4 |
| 100000 | three-dxf-viewer | cold/1 | 85.9 | 162.4 | 3089.3 | 3338.8 | 3338.8 | 5696.8 | 382.3 |
| 100000 | three-dxf-viewer | warm/1 | 0.2 | 59.4 | 3940.7 | 4000.6 | 4000.6 | 7435.4 | 382.5 |
| 100000 | three-dxf-viewer | cold/2 | 158.5 | 178.9 | 3560.4 | 3899.1 | 3899.1 | 5380.8 | 371.8 |
| 100000 | three-dxf-viewer | warm/2 | 0.1 | 41.6 | 2722.1 | 2764.5 | 2764.5 | 5192.8 | 386.4 |
| 100000 | three-dxf-viewer | cold/3 | 100.2 | 203.6 | 2960.5 | 3265.8 | 3265.8 | 4600.7 | 380.6 |
| 100000 | three-dxf-viewer | warm/3 | 0.1 | 43.1 | 3123.3 | 3167.0 | 3167.0 | 5488.1 | 390.2 |
| 100000 | three-dxf-viewer | cold/4 | 61.8 | 144.4 | 3108.0 | 3315.9 | 3315.9 | 5299.9 | 373.7 |
| 100000 | three-dxf-viewer | warm/4 | 0.2 | 14.1 | 3214.7 | 3229.8 | 3229.8 | 5866.8 | 391.2 |
| 100000 | three-dxf-viewer | cold/5 | 69.8 | 143.2 | 3410.1 | 3624.5 | 3624.5 | 5115.7 | 375.9 |
| 100000 | three-dxf-viewer | warm/5 | 0.1 | 45.7 | 2927.6 | 2974.3 | 2974.3 | 5398.9 | 383.3 |

### 해석 및 잔여 평가

- LINE 100,000 cold에서 전체 median은 dxf 918.3 ms / three 3338.8 ms, 확대→rAF는 191.7 / 5299.9 ms였다. 이 합성·SwiftShader 조건에서 three의 높은 draw-call 비용을 추가 조사할 근거가 된다. GPU present를 측정하지 않았으므로 원인 확정이나 업무 SLA 판단은 아니다.
- warm JS heap은 같은 document에서 직전에 실행한 다른 Viewer의 bundle·객체·GC 상태도 포함한다. 이를 해당 Adapter 단독 메모리 사용량이나 증분으로 비교하면 안 된다.
- 본 실행에서 dxf-viewer와 three-dxf-viewer의 통합 처리/heap/확대 관찰 값을 비교할 수 있다. 한글 JSON을 항상 읽는 three와 TEXT 없는 경우 font를 지연 로드하는 dxf의 초기 비용 차이도 포함되므로 이를 순수 parser 성능 차이로 해석하지 않는다.
- 확대 값은 합성 LINE 배치의 참고치이며 Pan 사용성/장시간 상호작용·실제 GPU 입력 latency의 정량 검증은 남는다. Unit 6의 자원 계수 시험과 이 heap snapshot만으로 memory leak 부재를 선언하지 않는다.
- POLYLINE/LWPOLYLINE/ARC/BLOCK/INSERT/MTEXT/DIMENSION/HATCH/SPLINE/Linetype와 업무 실도면 fidelity는 NOT RUN. 기존 LINE/CIRCLE/한글 TEXT 및 Layer 기본 시험은 U4/U5 참조. 업무 SLA와 실도면 미제공으로 사업장 적용성 판정은 보류한다.
- 기존 npm high 4, three 메인 스레드 parse/전역 material cache/약 25.8 MB font JSON 제약 유지. 계측 UI·harness 완료와 전체 P.O.C. 검증 완료를 구분한다. 다음 Unit 9A DXF 통합·회귀/릴리스 검증.

## U6-20260908 — 새로고침 없는 전환 0.7.0

- Source: 이 기록을 포함하는 `feat(viewer)` 커밋 snapshot. DB Schema/의존 라이브러리 변경 없음. UI renderer 버튼, ViewerSource, Manager와 관련 문서/시험 변경.
- Type Check/Lint/Production Build 모두 exit 0. 자동 테스트 35 passed / 0 failed, 8개 파일, 11.00초. 기존 32개 + 원본 1회 공유/Adapter 변경 격리, 지연 다운로드 중 마지막 선택만 초기화, 실패 재시도/다른 Version bytes 분리 3개.
- E2E 10 passed / 0 failed, 39.1초. 기존 관리/두 Viewer/한글/오류 9개 회귀와 전환 1개. Chromium 1208 executable, Playwright 1.63.0, SwiftShader, 1440×1000, 독립 임시 DB/Storage. 기존 명령 `PLAYWRIGHT_CHROMIUM_EXECUTABLE=... npm --prefix src run test:e2e` 실행.
- TC-SWITCH-001/002: 다운로드를 지연한 상태에서 두 번 선택 변경→최종 renderer 표시→10회 양방향 전환. 동일 document marker/Version heading/URL renderer를 유지하며 content HTTP 요청은 1회였다. 명시적 다시 불러오기 후 2회로 증가함을 확인했다.
- 테스트 전용 계수: 각 전환 완료 시 canvas 1개, 활성 WebGL context 1개, Worker 0개, Blob URL 0개. 버전 목록으로 이탈 후 canvas/context/Worker/Blob 모두 0. 정상 경로 pageerror 0. 이것은 관측 대상 자원의 cleanup 검증이며 전체 JS heap/GPU/전역 cache 누수 부재를 증명하지 않는다.
- 탐색 시점/Layer 선택은 전환마다 초기화한다. renderer URL은 replaceState로 변경하여 전환 자체로 history를 늘리지 않는다. 원본은 Version 수명 내 보관하고 Adapter마다 slice 복사본을 제공한다. 원본 CAD/DB 변경 없음.
- Known Issues: three 메인 스레드 parse, 전역 material cache, 대형 font JSON 및 실제 도면 성능/전체 Entity·MTEXT·인코딩 한계는 이전과 동일하다. 기존 npm high 4 유지. 다음 Unit 8A에서 측정/비교를 진행한다.
- 로컬 3100 서버를 0.7.0으로 재시작하고 홈 HTTP 200 및 버전 표시를 확인했다. 후보 81개 Secret/런타임 검사 위반 0, git diff --check 통과. README와 관련 요구/설계/운영/시험/결정/변경 이력 갱신.

## U5-20260908 — three-dxf-viewer 및 한글 글꼴 0.6.0

- Source: 이 기록을 포함한 `feat(viewer)` 커밋 snapshot. three-dxf-viewer 1.0.44 / 직접 Three 0.171.0 / dxf-viewer 1.0.48. 외부 source 수정 및 DB migration 변경 없음.
- Type Check/Lint/Production Build: 최종 PASS. build가 원본 TTF로 typeface JSON을 생성하며 두 Viewer는 Browser dynamic import 경계를 유지한다.
- 자동 테스트: 32 passed / 0 failed, 7개 파일, 9.90초. 이전 30개 + 실제 한글/라틴 glyph 존재 및 라이선스 확인, 생략된 Z 보완/명시 Z 보존/멱등성 시험.
- E2E: 최종 9 passed / 0 failed, 30.3초. 기존 관리 3개, Viewer별 탐색 2개, 한글 TEXT 2개, 손상/빈 DXF/DWG 안내 2개. Chromium 1208 executable, Playwright 1.63.0, SwiftShader, 독립 임시 DB/Storage. 실행 명령은 기존 PLAYWRIGHT_CHROMIUM_EXECUTABLE 지정 `npm --prefix src run test:e2e`이다.
- 실제 렌더링: 양쪽 LINE/CIRCLE, 확대·축소·Pan·Fit·Resize·재로드/재진입. three의 Layer 0 숨김/복원은 screenshot byte 변화/복원으로 확인했다. 정상 탐색 pageerror 0. 두 Viewer의 「한글 공장 ABC」 screenshot을 시각 확인하고 확대 전후 픽셀 변화도 검증했다. Git 제외 `src/test-results/{renderer}-render.png`, `{renderer}-korean.png`.
- 실패/수정: 처음 three가 완료 상태에도 검정 화면이었다. 재료 대비를 조사·보정했지만 지속되어 진단했고, 생략 Z에서 NaN bounds/camera가 발생함을 확인했다. Wrapper의 기본 Z=0 보완과 finite bounds 검증으로 해결했다. 손상 문자열을 빈 도면으로 받아들이는 사례는 ASCII SECTION/EOF 사전 검증으로 거부한다. 임시 진단 로그는 제거했다.
- 중간 회귀: 2 failed→수정 후 1 failed(Resize 시험이 이전 DOM 너비를 기대값으로 먼저 읽은 timing 문제). 크기와 backing buffer를 동일 polling 시점에서 DPR 포함 비교하도록 수정한 뒤 9/9 통과했다. 이전 실패는 숨기지 않고 최종 결과와 구분한다.
- 글꼴: 원본 TTF/OFL 포함, 생성 JSON은 Git 제외. 출처/hash/원본 크기와 배포 방법은 Operation에 있다. 전체 typeface 약 25.8 MB로 최초 전송/파싱 비용이 있으며 실환경 성능 시험은 NOT RUN이다.
- 확장 기능 평가: Layer 기본 On/Off PASS. Hover/Select/CADControls 공개 export 및 metadata API 존재는 설치 소스로 확인했으나 익명 이벤트 handler/public dispose 부재로 이번 UI에 미연결, 런타임 NOT RUN. SnapsHelper.clear 존재 확인, Snap 정확도·대형 도면 비용은 NOT RUN. 미지원으로 단정하지 않는다.
- Known Issues: three 메인 스레드 parse 및 전역 material cache 잔여 위험, 복잡한 INSERT/Layer·MTEXT/SHX/CP949·전체 Entity·실도면 fidelity·memory/성능 미검증. 기존 npm high 4 유지. Layer는 Adapter wrapper 기준이며 모든 upstream interaction을 구현한 것이 아니다.
- 다음: Unit 6의 새로고침 없는 전환, 동일 bytes 재사용 및 경쟁/자원 stress. 현재 renderer 링크는 전체 페이지 탐색이다. 원본 CAD/Runtime DB를 수정·커밋하지 않는다.
- 로컬 3100 서버를 0.6.0으로 재시작하고 홈/생성 font HTTP 200, 한글 glyph와 파생 family 이름을 확인했다. 커밋 후보 78개 보안 검사 위반 0, 진단 로그 제거 및 diff 검사 통과. 관련 문서 갱신, DB Schema 정의는 변경 없음.

## U4-20260908 — dxf-viewer 0.5.0

- Source: 이 기록을 포함하는 `feat(viewer)` 커밋 snapshot. dxf-viewer 1.0.48, Three.js 0.161.0, 기존 package/lock 고정. DB Schema 변경 없음.
- `typecheck`, `lint`, `build`: 최종 exit 0. 최초 테스트 코드의 canvas 타입 오류 수정 후 통과. SSR에서 WebGL 초기화 없이 Worker 자산 포함 Production Build 성공.
- `npm --prefix src test`: 30 passed / 0 failed, 5개 파일, 8.46초. 이전 26개 회귀 + Manager 형식 제한/늦은 초기화 취소/실패 cleanup/이전 Load 결과 차단 4개.
- Chromium E2E: 최종 5 passed / 0 failed, 13.1초. 기존 관리 흐름 3개 + DXF 정상/오류 흐름 2개. 최초 실행은 Next route announcer까지 alert로 탐색해 1 failed, main 영역으로 locator를 한정한 뒤 전체 재시험 통과.
- TC-DXF-001 PASS: 생성한 LINE/CIRCLE DXF 업로드→검색 목록→도면 보기→실제 WebGL 표시. canvas screenshot 변화로 확대/Pan 반응 확인, 축소/Fit 클릭, 1100×800 Resize 후 canvas 크기 일치, 다시 불러오기/재진입 및 canvas 한 개 유지. 정상 경로 pageerror 0. `src/test-results/dxf-render.png`에서 선과 원을 시각 확인했다(Git 제외).
- TC-DXF-002 PASS: 손상 DXF의 일반화된 처리 실패와 재시도, 빈 DXF의 빈 도면 상태, DWG의 후속 구현 안내 및 canvas 없음. 손상 파일의 upstream console 오류는 예상된 오류이며 정상 렌더링 결과와 구분한다.
- 환경: Linux, Node 22.14.0, Playwright 1.63.0, Chromium 1208 executable, SwiftShader software WebGL, 독립 임시 DB/Storage. 화면 1440×1000 및 1100×800. 소프트웨어 GPU 결과를 실제 장비 성능으로 일반화하지 않는다.
- dxf-viewer 평가: 기본 LINE/CIRCLE 표시·Zoom/Pan/Fit/Resize/재진입 확인. 장점은 public API/Worker 기반 통합 및 내장 탐색. 현재 통합의 제약은 기본 font 미제공(TEXT/한글 누락 가능), Layer/Select/Hover/Snap UI 미제공. 실도면 Entity 충실도, parse/first-display 수치, memory/GPU 누수 추세 및 대형 파일은 NOT RUN. 해당 성능/평가는 Unit 8A 및 실제 Sample에서 진행한다.
- 라이브러리 원본 수정 없음. Adapter에서 Blob URL, Worker 취소, Destroy, WebGL context/canvas 정리를 수행한다. 120초 Worker timeout 경로와 WebGL 생성 불가 환경은 코드 처리 제공, 별도 장애 주입 시험은 NOT RUN.
- 기존 npm audit high 4 경고 유지. three-dxf-viewer/DWG는 미구현. README·AGENTS·Requirements·Architecture·TestPlan·Operation·Decisions·ChangeLog 갱신. 다음 Unit은 5 three-dxf-viewer이다.
- 로컬 적용: 3100 서버를 0.5.0으로 정상 재시작하고 HTTP 200, 버전 표시 및 기존 DXF의 도면 보기 링크를 확인했다. 운영 DB/원본은 변경하지 않았다. 커밋 후보 70개 Secret/런타임 검사 위반 0.

## U3-20260908 — 목록·검색 0.4.0 / GitHub #1

- 대상: 지정 GitHub 저장소의 「도면 목록 미표시 #1」. Source는 이 기록을 포함한 `feat(list)` 커밋 snapshot이다. 원격 반영 결과는 후속 기록을 참조한다.
- 원인: 0.3.0 홈은 정적 안내이며 DB 목록을 조회하지 않았다. 기존 사용자 DB에서 Location 1개/Version 1개를 읽기 전용으로 확인했다.
- 수정 전: Chromium에서 등록 성공→목록 복귀 시 도면 행을 찾지 못하는 회귀 테스트 1 failed로 재현했다.
- 수정: 실제 DB 목록/검색/페이지/위치별 버전과 Current UI, 안전한 조회 API, 동적 렌더링 및 등록/Current 변경 후 캐시 갱신. Schema/migration 변경 없음.
- 자동 테스트: `npm --prefix src test` — 26 passed / 0 failed (환경 2, DB 6, Upload 12, 목록 6). TC-LIST-001–007의 등록 직후 조회·7조건 필터·문자 그대로 검색·Current/null·페이지·잘못된 query를 검증했다.
- `npm --prefix src run typecheck`, `lint`, `build` — 모두 exit 0. Production Build에서 `/`와 Location 상세는 동적 경로이다.
- E2E: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/planner/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome npm --prefix src run test:e2e` — 최종 3 passed / 0 failed, 7.0초. 등록→목록 복귀→새로고침, 조회 API, 파일명/사업장 검색, 상세 Current 교체→새로고침→Current 목록의 일치를 실제 Browser에서 검증했다.
- 중간 E2E 실패 1건: select를 getByLabel exact로 탐색하여 option text가 포함된 label을 찾지 못했다. 접근성 role/name 기반 combobox 탐색으로 수정 후 전체 3개 재시험 통과했다.
- 환경: Linux, Node 22.14.0, Playwright 1.63.0, Chromium cache 1208, 1440×1000. 임시 DB/Storage 사용. Git 제외 `src/test-results/list-current.png` 화면을 확인했다. Viewer rendering 시험은 아니다.
- 실행 서버: 3100을 새 빌드로 정상 재시작. `/` 및 `/cad/upload` HTTP 200, 목록 API total=기존 DB Version 수 1, 실제 홈 HTML에 해당 Version ID 포함을 확인했다. 사용자 DB/원본 삭제·초기화 없음.
- 문서: README/AGENTS/Requirements/Architecture/TestPlan/Operation/Decisions/ChangeLog 갱신. DB Schema 변경 없음으로 Database.md 정의 유지.
- Known Issues: Viewer 및 실도면 성능/fidelity는 미구현·미검증. 기존 Prisma 전이 의존성 high 4 경고는 이 목록 수정에서 해결하지 않았다. 다음 기능 Unit은 dxf-viewer이다.

### 원격 반영 및 이슈 종료 — 2026-09-08

- 구현 Commit: `aec7af6c3e451caa29a1bc711e320ea86cea9006`, `main` Push 성공 및 원격 HEAD 일치 확인.
- 커밋 후보 62개 Secret/Runtime 제외 검사: 위반 0. `git diff --check` 통과.
- GitHub #1에 원인·조치·시험·문서·잔여 범위를 댓글로 기록했다(comment ID: 5575209023). API 재조회에서 `closed`, `state_reason=completed`를 확인했다.
- 이 후속 기록은 별도 docs 커밋으로 관리한다. Unit 3 조치 완료, 다음 Unit 4는 아직 시작하지 않았다.

## BOOT-20260907-01 — Unit 0A 문서 Bootstrap

이 절은 최초 문서 검증 당시의 기록이다. 이후 작성자 설정과 Commit/Push는 아래 후속 기록을 기준으로 한다.

- Date: 2026-09-07 (Asia/Seoul).
- Version: 없음. src/package.json 미생성, 기능 Release 아님.
- Commit: 없음. 기존 Commit이 없는 main; 문서 변경은 uncommitted. 작성자 정보 입력 대기.
- 환경: Linux/WSL workspace, Node v22.14.0, npm 11.10.0, Git 2.43.0.
- 범위: Workspace/Git/config 조사 및 문서 정적 검사. 앱/DB/Rendering 시험이 아님.

### Git 및 환경 조사 (실제 수행)

| 항목 | 결과 | 근거·제약 |
| --- | --- | --- |
| 기존 Workspace | 확인 | .git/.env/.gitignore 및 로컬 agent 디렉터리 존재, 기존 앱/문서 없음 |
| .env | configured | 기존 remote_repo_url/remote_repo_token 값 존재 여부만 확인; 내용 비출력 |
| Git repository | OK | git rev-parse 결과 true |
| Remote 정합성 | OK | origin URL과 .env 설정을 메모리에서 정규화 비교, credential 포함 URL 아님 |
| Local branch / history | main / 기존 Commit 없음 | symbolic-ref, log 조회 |
| GitHub 읽기 연결 | OK | git ls-remote --symref origin HEAD refs/heads/* exit 0, 결과 비어 있음 |
| Remote default branch | 미확정 | HEAD/branch가 없어 원격 기본 브랜치 확인 불가; main은 로컬 branch |
| 인증 / 쓰기 권한 | configured / 미검증 | token 값 존재, 읽기 연결 성공; Push는 수행 안 함 |
| 최초 network 실패 | 해결 | sandbox DNS/network 오류(exit 128), 허용된 외부 실행에서 재시도 성공(exit 0) |
| Git author | 미설정 | user.name/user.email 설정 없음, 사용자에게 입력 요청 |

### 문서·보안 검사

실행: `python3 /tmp/cad-bootstrap-audit.py`, exit **0**. 이 파일은 이번 Bootstrap용 임시 검사 도구이며 Git에 포함하지 않는다. 방법과 결과를 아래에 남긴다. 앱의 versioned 테스트 코드는 계획 확인 후 src/tests에서 작성한다.

**정적 검사 Total 9 / Passed 9 / Failed 0.** 아래 9개 검사는 50개 예정 애플리케이션 TC의 실행 결과와 별개이다.

| 검사 | 관련 TC | 실제 결과 | 방법·관측 |
| --- | --- | --- | --- |
| 필수 구조 | TC-BOOT-001 | PASS | Markdown 10개, 필수 Root 파일과 src directory 존재 |
| 내부 문서 링크 | TC-DOC-001 | PASS | Markdown 상대 링크 대상 검사, 끊어진 링크 0 |
| 요구↔테스트 ID | TC-DOC-001 | PASS | 요구 39개·TC 시나리오 50개 정의, 중복/없는 참조 0 |
| Unit별 AC | TC-DOC-001 | PASS | 분할된 12개 Unit 모두 범위/선행 조건/AC/시험 항목 포함 |
| Git 제외 규칙 | TC-BOOT-002 | PASS | git check-ignore --no-index: 제외 경로 19개, 추적 허용 경로 8개 모두 예상과 일치 |
| 환경 template | TC-BOOT-002 | PASS | 기존 .env 키 2개 보존, example 실제 값 0 |
| Secret 검사 | TC-BOOT-002 | PASS | 변경 후보 13개 파일에서 실제 .env 값·token pattern·credential URL 일치 0; 값 비출력 |
| 구현 금지/비추적 | TC-BOOT-001 | PASS | src에는 .gitkeep만 존재, data 미생성, .env tracked 아님 |
| diff 공백 검사 | TC-GIT-001 | PASS | git diff --check 및 후보 새 파일 각각 git diff --no-index --check, 오류 0 |

정적 자동 검사는 구조/참조/정해진 pattern을 확인한 범위이며 모든 보안 취약점이나 기능 정확성을 보장하지 않는다. 별도 문서 review로 Bootstrap 단계 충돌, Current 소속 제약, DB/파일 비원자성, DWG parser/rendering 차이, 미실행 결과 표시를 확인했다. Git 연결 점검과 라이브러리 공식 문서 조사는 위 자동 검사 9개 수에 합산하지 않았다.

변경 후보: AGENTS.md, README.md, .env.example, .gitignore, src/.gitkeep, out/*.md 8개. 기존 .env는 편집하지 않았다. 아직 stage/Commit/Push하지 않았으며 working tree에는 이 13개 untracked 파일이 있다. 첫 Commit 작성자 확인 이후 diff/보안 검사를 다시 수행한다.

### 애플리케이션 시험 상태

| 영역 | 결과 | 사유 |
| --- | --- | --- |
| Next Build / Type Check / Lint | NOT RUN | 0A 구현 금지, package/source 없음 |
| DB connection / Migration / Current | NOT RUN | Schema 초안만 존재 |
| Upload / Search / API | NOT RUN | 미구현 |
| Component / E2E | NOT RUN | framework/코드 미설치 |
| DXF / DWG rendering | NOT RUN | 라이브러리 미설치·실제 sample 미제공 |

### Known Issues / 다음 작업

- KI-001: libredwg-web은 파서이며 직접 렌더링 설계(ADR-004) 확인 대기. 이는 조사된 역할 차이이며 실제 파싱 실패 결과가 아니다.
- KI-002: Git 작성자 미설정으로 문서 Commit/Push 대기. 작업 트리는 clean으로 보고하지 않는다.
- KI-003: 대표 CAD Sample/업무 SLA 없음. 업무 적용 가능성 최종 평가는 미검증이다.
- KI-004: 실제 npm 배포본과 Next/Prisma/Three/WASM 호환성·memory/free API는 0B/7A에서 확인할 예정이다.
- 다음: 전체 계획 확인→Unit 0B→7A. 시험 실패를 숨기거나 코드 없는 0A를 Unit 0B 완료로 처리하지 않는다.

## BOOT-20260907-02 — 작성자 설정 및 최초 문서 게시

- Date: 2026-09-07. 범위는 Git 작성자 설정과 기존 Bootstrap 문서 형상관리이다. 사용자는 작성자 이름/이메일을 제공했으며 **전체 구현 계획과 ADR-004 승인은 여전히 대기**이다.
- 사용자 제공 작성자를 repository-local config에 설정하고 일치 검증을 통과했다. 전역 Git 설정은 변경하지 않았다. 실제 작성자 값은 문서에 복사하지 않는다.
- 작성자 상태를 README/Operation/Decisions/ChangeLog에 반영하고 `python3 /tmp/cad-bootstrap-audit.py` 재실행: exit 0, 정적 검사 9/9 PASS.
- 최초 문서 Commit: `3b1a32d5a506fec8687e55affa7fd0fee24330c8`, `docs(bootstrap): define CAD viewer requirements and implementation plan`.
- Staged 파일 13개가 검사한 working copy와 byte 단위로 일치함을 확인했다. `.env`와 CAD/DB/Secret은 추적 대상에 포함되지 않았다. `git diff --cached --check` 통과.
- 임시 비출력 인증 도구의 remote read, 일반 Push, remote 재조회가 모두 성공했다. `origin/main`과 위 Commit의 일치를 확인했으며 당시 working tree는 clean이었다. Force Push/기존 history 변경은 수행하지 않았다.
- 샌드박스에서 `.git/index` 쓰기 및 DNS가 차단된 시도는 허용된 외부 실행으로 재시도하여 해결했다. 인증 값/헤더/credential URL은 출력하지 않았다.
- KI-002(작성자 미설정/최초 Commit·Push 대기)는 해결했다. 실제 지정 branch 쓰기 연결도 확인했다. 다른 branch의 권한까지 확인했다는 뜻은 아니다.
- 이 결과를 기록하는 후속 문서 Commit은 별도로 생성한다. 최신 Commit과 동기화 상태는 실제 git log/status/remote 조회로 확인한다. 앱 버전은 여전히 없으며 앱 Build/DB/Viewer 시험은 NOT RUN이다.

## Viewer 평가 현황 — U7B 반영

공식 조사 사실은 Architecture에 있으며 아래 표는 **실제 실행 결과**만 채운다. 단순 라이브러리 문서의 기능 소개를 이 표의 PASS로 옮기지 않는다.

| 항목 | dxf-viewer | three-dxf-viewer | libredwg-web 경로 |
| --- | --- | --- | --- |
| 정상 표시 / 기본 Zoom·Pan·Fit | PASS: 생성 LINE/CIRCLE | PASS: 생성 LINE/CIRCLE | U7B 등록 LINE/Zoom/Pan/Fit 확인; 전체 Entity 후속 |
| Resize / 재진입 / Dispose | PASS: U9A 20회 전환 자원 정리; 장기 누수 미평가 | PASS: U9A 20회 전환 자원 정리; 장기 누수 미평가 | NOT RUN |
| 장점 / 단점 / 발견 문제 | public API/Worker; U5 기본 font 연결 | Group/metadata 활용; 생략 Z 보완 필요 | 미평가 |
| Layer 조회 / On-Off | NOT RUN | PASS: Layer 0 | NOT RUN |
| Hover / Select / Entity 정보 / Snap | NOT RUN | NOT RUN | NOT RUN |
| 지원 Entity / 문제 Entity / fidelity | LINE/CIRCLE/한글 TEXT 확인 | LINE/CIRCLE/한글 TEXT 확인 | 미평가 |
| 대형 파일 / 사용성 / Browser | U8A LINE 10만 개 측정; >10 MiB/실도면 미평가 | U8A LINE 10만 개 확대 지연 관찰; >10 MiB/실도면 미평가 | 미평가 |
| WASM 초기화 / DWG revision / parsing / memory | 해당 없음 | 해당 없음 | U7A AutoCAD 2000 2개 샘플 parse/free 확인; 다른 revision/장기 메모리 미검증 |

LINE, POLYLINE, LWPOLYLINE, CIRCLE, ARC, BLOCK, INSERT, TEXT, MTEXT, 한글 TEXT, DIMENSION, HATCH, SPLINE, Layer, Linetype 각각의 sample/결과를 TC-CAD-001 실행 시 행 단위로 추가한다. DWG의 parser 지원과 직접 renderer 지원을 별도로 표기한다.

## 동일 Sample 비교 양식

| File 식별/hash | Format | Viewer/version | File size | Load ms | Parse ms | First display ms | Entity count | Result | Rendering issue | Usability |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| viewer.spec.ts 생성 fixture | DXF | dxf-viewer 1.0.48 | 코드 fixture 참조 | — | — | — | 미계측 | PASS: 기본 표시 | 선/원 시각 확인 | 기본 탐색 확인 |
| viewer.spec.ts 동일 fixture | DXF | three-dxf-viewer 1.0.44 | 코드 fixture 참조 | — | — | — | 미계측 | PASS: 기본 표시 | 원본 Z 생략 보완 | 기본 탐색 확인 |
| Sample 미제공 | DWG | libredwg-web / 미설치 | — | — | — | — | — | NOT RUN | 미평가 | 미평가 |

미측정 값은 0이 아닌 —/null과 사유를 사용한다. 환경/캐시/반복 횟수/console/memory/실패 원인을 함께 기록한다. DXF 동일 bytes 비교와 DWG 평가는 별도로 결론을 내며 단일 종합점수로 합치지 않는다.

## 다음 실행 기록 형식

Run ID / Date / Unit / Version / Commit 또는 uncommitted snapshot / OS·Browser·hardware / exact dependency versions / 실행 명령과 exit / automated total-pass-fail-skip / TC별 결과 / manual 증거 / 오류와 재시험 / Known Issues / 문서·요구 추적 갱신 여부를 기록한다. 완료되지 않은 시험은 NOT RUN 또는 BLOCKED 사유를 남긴다.

## U0B-20260907 — 실행 기반 0.1.0

- Source: 이 기록을 포함하는 `build(bootstrap)` Commit의 source snapshot; 실제 hash는 git log 참조.
- `db:generate`, `db:check`: PASS, Prisma Client 생성 및 실제 SQLite SELECT 1 성공.
- `typecheck`, `lint`: PASS (최종 warning 0). `npm test`: 2 passed / 0 failed.
- `build`: PASS, Next 16.3.4 webpack Production Build. `GET /` Production smoke: HTTP 200 및 CAD 도면 관리 문구 확인.
- 해결: Next ProcessEnv 타입 요구와 JSON named import 경고 수정. sandbox DNS/tsx IPC/Next child process/local port 제약은 허용 환경에서 재검증했다.
- DB schema/관리 기능/Viewer는 아직 NOT RUN. 승인 순서는 DXF 우선(ADR-011), 다음 Unit 1.

## U1-20260907 — Location/Version DB 0.2.0

- Prisma migrate deploy 성공: 202609070001_locations. 신규 임시 DB에도 동일 migration SQL을 적용했다.
- 자동 테스트 8 passed / 0 failed (환경 2, 실제 DB integration 6). Type Check/Lint 통과.
- 최종 Production Build 통과. 커밋 후보 39개 파일의 Secret/런타임 파일 제외 검사 위반 0.
- 위치 Unique, 8개 동시 등록의 순번 정합성, Current 0/1·교체·멱등·rollback, 타 Location 참조/Current 대상 삭제/존재하지 않는 소유자 거부, FK/Index를 검증했다.
- API/Upload 화면은 다음 Unit이다. 0.1.0 헤더의 미구현 등록 링크로 404가 발생한다는 사용자 제보를 확인했으며 Unit 2에서 실제 화면/API를 연결한다.

## U2-20260907 — 파일 등록 0.3.0

- 자동 테스트 20 passed / 0 failed, Type Check/Lint/Production Build 통과. 실제 Chromium E2E 2 passed / 0 failed.
- 사용자 제보한 `/cad/upload` 404 해결: 상단 링크→등록 화면→한글 파일명 업로드→성공 표시→원본 byte 다운로드를 실제 Browser에서 확인했다. 서버 3100을 새 빌드로 재시작했다.
- 정상 DXF/DWG, SHA-256·중복 식별, 빈 파일/미지원 확장자/크기 경계/잘못된 Metadata, Storage 실패, 파일 publication 후 DB constraint 실패 보상, traversal/symlink escape 차단을 검증했다.
- 실패 후 수정: Busboy의 limit 이벤트 경계 처리(정확한 한도/part 수), Next 내부 bind hostname과 Browser Origin 비교를 수정하고 재시험했다. 외부 Origin 거부도 확인했다.
- E2E는 독립 임시 DB/Storage, Chromium 1208 executable, 1440×1000 viewport에서 실행했다. 화면 capture는 Git 제외 test-results/upload-success.png이다. 실도면 rendering은 아직 NOT RUN.
- npm audit: high 4건(Prisma 7.10.0 전이 의존 deepmerge-ts, mysql2와 상위 패키지), omit=dev에서도 dependency graph에 포함된다. SQLite 경로는 MySQL 연결을 사용하지 않지만 패키지 보안 경고는 미해결로 기록한다. 자동 major downgrade/force fix는 수행하지 않았다.
