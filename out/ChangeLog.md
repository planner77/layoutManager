# ChangeLog

## 0.32.0 — 2026-10-25 / Issue #39 레이어 메뉴·도크 U2 (PR CI 검증 전)

- UI: U1의 단일 `layerPanelOpen` 상태를 메뉴/내부 접기에 연결. 가능한 경우 레이어 도크 host를 유지하고 숨김 시 내부 panel만 닫아 `aria-controls` 대상으로 유효하게 유지. 접기 버튼 삭제 후 메뉴에 포커스 복귀 및 키보드 Enter/Space 재열기.
- Compatibility: 기존 체크박스/전체 선택·해제의 실제 `ViewerManager.showLayer` 및 Canvas/Source/줌 상태, #25 CSS/native 진입, 모바일 도킹/검색/외곽선 도구 유지. 미지원 Renderer/DWG/0 layer/로딩/오류에서 메뉴 disabled 및 aria-controls 제거. DB/API/migration/원본/의존성 변경 없음.
- Tests: Vitest `TC-U2-UNIT-001` 강화 + Chromium `TC-U2-E2E-001~003`(패널·레이어 독립/포커스/320px/Renderer/reload/모의 native/zero drawable) 신규 작성. **로컬 CI/실 CAD 검증 NOT RUN**. PR CI는 생성 이벤트에서 시작하며 통과 판정 전까지 결과 미검증. [Issue39](Issue39.md).

## 0.31.0 — 2026-10-25 / Issue #45 Current-only 도면 목록 (PR CI 결과 확인 전)

- Changed: `/` 목록은 Current Version만 서버에서 조회. 초기·검색·초기화·검색 필터·페이지네이션·과거 `current=false` URL에서도 Current-only 결과/count 유지. 최신 버전이 Current가 아니라면 표시하지 않음.
- UI: #8의 `현재 버전만 표시` 토글/전용 컴포넌트 제거. Current-only 요약/빈 상태 문구, `위치별 버전 관리` 링크 및 기준정보 층별 `버전 이력` 진입 추가.
- Compatibility: `GET /api/cad-files?current=false` 기존 API와 Location 상세 전체 버전/Current 변경·삭제·직접 Viewer/원본 다운로드 유지. Location Current 0~1개 및 DB schema·원본 불변.
- Test: TC-LIST-045-001~003, Workflow/Link/Name 회귀 갱신, 관련 요구·설계·운영 문서/ADR 추가. **최초 PR CI #40142618328: Typecheck PASS, ESLint FAIL(신규 JSX apostrophe 2건), Unit/Build/E2E SKIPPED, Docker PASS**. `69e6b175`에서 escape 처리 및 리뷰가 지적한 `TC-ISSUE-001/LIST`의 비Current 홈 선택 회귀 보완. 새 HEAD 결과 미검증. [FailureLedger](FailureLedger.md), [Issue45](Issue45.md), [TestReport](TestReport.md).


## 0.30.0 — 2026-10-24 / Issue #38 앱형 Viewer 메뉴바·도킹 셸 (PR CI 시작 전)

- Added: `ViewerAppShell`(CSS/native 공통 shell, left/center/right docking host, mobile compact panel, 하단 도구, status), `ViewerMenuBar`, 독립 `ViewerAppState` reducer, U2/U3/U6 확장 계약.
- Changed: 기존 #17 fullscreen layer panel을 controlled dock으로 전환. 상단 레이어 메뉴에서 보이기/숨기기를 제어하되 실제 layer visibility·Canvas/zoom·원본 다운로드 상태는 보존. 검색 패널의 controlled 열기/ESC 처리, selection→search→native→CSS ESC 우선순위 명시.
- Compatibility: 기존 Renderer(dxf-viewer/three-dxf-viewer/libredwg-web), version URL, #31 브라우저 임시 결과/JSON, #25 native 사용자 활성화/immersive policy 및 DB/API/schema/CAD bytes 유지. Outline ON/OFF·tree·Admin 관리는 후속 이슈까지 메뉴 비활성.
- Tests: U1 state Unit + 2 DXF Renderer/손상 DWG/모바일/레이어/ESC Playwright 신규 작성, #31 회귀 수정. **실제 검증 NOT RUN**. 상세 [Issue38](Issue38.md), [FailureLedger](FailureLedger.md), [TestReport](TestReport.md).


## 0.29.0 — 2026-10-17 / Issue #25 도면 Viewer 기본 immersive 진입 (PR CI 전)

- PR #36 E2E 회귀 보완: Run `38974687861`에서 40 PASS/4 FAIL (도면 원본명 중복, 설명 a11y label 누락, FONT 2 Renderer 일반 모드 버튼 기대). 원본명 중복 제거, 설명의 표시 및 접근성 계약 복원, FONT E2E의 fullscreen→normal 전환 절차 추가. TypeScript/ESLint/Unit/Build/Docker 성공은 이전 HEAD에 한정하고 수정된 HEAD의 검증은 새 PR CI 대기.

- PR #36 보완: 최초 CI `38963238965`의 ESLint `react/no-unescaped-entities` 2건을 JSX escape로 해결. P2 native fullscreen top-layer에서 global loading spinner가 숨겨지는 구조적 문제를 같은 Viewer shell 자손 spinner로 방지. 지연 reload/native 상태 합성 E2E (`TC-ISSUE25-002`) 추가. **보완 후 PR CI 검증 전**.

- Added: 목록·Location·공유/직접 Version URL·새 탭·재로딩의 CSS fixed `100dvh` viewport 전체 화면 기본 진입; 모든 Viewer DXF 2종/DWG 1종 공통 적용.
- Added: immersive shell 안에 파일명/Version·원본명/위치, DXF Renderer, zoom/fit, 레이어/텍스트 검색/외곽선, 원본 다운로드, 링크 복사, 상태·오류·재시도, 일반 Viewer 종료/목록 복귀 표시.
- Changed: 브라우저 native Fullscreen API는 명시적 버튼 클릭 시에만 시도. native 해제/ESC와 앱 CSS immersive 종료를 별개로 관리. HTML/Body scroll lock, app header inert/focus cleanup, 모바일 dvh 대응.
- Compatibility: 기존 링크 Renderer query·Version UUID/원본 API, DB/마이그레이션·Viewer Adapter 기능 호환. Renderer 변경/Resize/원본 요청/cleanup은 기존 계약 유지.
- Tests: TC-ISSUE25-001 2종 DXF E2E 및 기존 Viewer/Layer/Search/Outline/Link/Metric/DWG regression 코드를 변경. **PR CI 및 실제 현장 수용은 아직 미확인**, PASS로 기록하지 않음.
- Details: [Issue25](Issue25.md), [TestPlan](TestPlan.md), [TestReport](TestReport.md).



## 0.28.3 — 2026-10-16 / Issue #31 P0/P5 보완과 P4 원본 검증 사전 계약 (PR CI 전)

- Fix: 미지원 BLOCK 내부 자식이 있어도 root INSERT가 stable=true가 되는 오매핑을 차단, 512-샘플 상한을 초과한 대형 ARC/CIRCLE의 chord tolerance 위반을 거부.
- P4 trust boundary: immutable DXF SHA/Version/Unit/고유 Handle 검증과 서버 재계산 Polygon symmetric-difference 검증 모듈, 변조 방지 Unit 추가. **실제 API/DB/인증/영구 저장은 Owner 정책 미승인으로 미구현**.
- P5: PR CI의 synthetic 1k/10k/100k 벤치마크 확대, private real-DXF Playwright 5회 Browse/Select/Mapping/load p50·p95/Heap test config, 결과 파일 Git/Docker 제외.
- Tests/Docs: P0 fail-closed·P4 canonical attestation Unit, 재현 프로토콜/운영 체크리스트 및 요구·설계·테스트 문서 갱신. CI/실 DXF 수용은 미확정.


## 0.28.2 — 2026-10-16 / Issue #31 Production PRECISE Worker import 수정 (PR CI 전)

- Fix: `polygon-clipping@0.15.7`의 Webpack ESM default export로 `union` 호출하여 v0.28.1의 named-export warning을 해결하도록 수정.
- Build/Release: `scripts/run.mjs`에서 unresolved import/export 경고는 Next Build exit 0이어도 fail-closed; PR·Docker 공통 안전장치.
- Test: default import/Union 면적/빌드 warning Unit, Production E2E PRECISE Worker 계산→확정→JSON 좌표·면적·SHA 확인, PR CI synthetic 1k benchmark smoke.
- P0/P5: 100MiB 이하 UTF-8 ASCII 현장 DXF의 read-only private source audit 명령(원본·경로 미출력). 현장 정확도/100k GPU는 여전히 별도 수용.
- P4: 영속 DB/API/인증 변경 없음 (Owner 정책 승인 전). 신규 PR CI/실도면 운영 수용은 미확정.


## 0.28.1 — 2026-10-16 / Issue #31 후속 P0/P5와 P4 기초 (PR CI 전)

- Fixed: top-level DXF Source Handle/type/layer/WCS box와 THREE rendered Object3D 1:N bbox 합산 대조. 미렌더·불일치 도형 선택을 제외하고 UI에 진단 수를 표시.
- Performance: bounded spatial tile index, giant Entity overflow 및 광역 선택 fallback, Worker source-index/render audit/spatial build 시간 표시. 1k/10k/100k synthetic CPU DXF benchmark CLI 추가.
- P4 foundation: Version/SHA/정상 Handle/Polygon JSON의 검증 함수·Unit 추가. **Server outline DB/API 및 별도 인증은 미구현**, Owner 승인 대기.
- QA: mapping/spatial/JSON validator Unit 및 DXF Viewer mapping E2E 추가. PR CI/실도면·GPU 성능 PASS 미확인.



### 0.28.0 / PR #30 CI #55 Workflow E2E 회귀 보완 (2026-10-16)

- Typecheck/ESLint, 136 Unit·Integration, production Build, Docker smoke 및 신규 TEXT/MTEXT 검색 두 Browser E2E가 PASS. 기존 Workflow E2E 1건은 44개 도면/25개 기본 페이지네이션에서 과거 등록일(2026-09-08) Version을 첫 페이지에서 찾는 기대가 잘못되어 실패.
- 등록 이후 원본 파일명 UI 검색과 업로드 Version ID 기반 Current 검증으로 테스트 안정화. 앱/DB/API 구현 변화 없음. 전체 CI 및 독립 QA는 신규 Run 검증 전 미확정.


## 0.28.0 — main 0.27.0(#31) 정렬 + GitHub #26 DXF 텍스트 검색 통합 (PR CI 대기)

- 기존 main의 DXF 객체 선택·볼록/정밀 외곽선 생성 및 관련 라이브러리와 테스트를 보존하고 DXF TEXT/MTEXT 검색, 위치 Pan/Zoom, Worker 인덱스를 결합.
- PR #30 CI #54: TypeScript/ESLint/126 Unit·Integration/Build/Docker PASS; Renderer 전환 시 캐시 검색의 working 플래그가 남는 E2E 2건 FAIL. Effect 결과·오류 분기에서 로딩 상태를 직접 종료하는 수정 및 추적 문서 반영.
- DB/API/migration 및 추가 npm dependency 없음 (polygon-clipping은 기존 main #31 의존성). 0.28.0은 미게시/PR CI 검증 전 후보 버전.



### 0.27.0 / PR #30 / CI #52 Browser Fixture regression repair

- CI #52: TypeScript/ESLint, Unit/Integration 125/125, production Build and Docker smoke PASS. Browser E2E 38/40 PASS; newly added TEXT/MTEXT search variants failed because the E2E's literal \n in a // comment suppressed the entire MTEXT insertion statement.
- Extracted shared DXF fixture (group-code array + LF join) and added Unit TC-TEXT-FIXTURE-001 checking three TEXT and one MTEXT with normalized Korean text. Browser tests now import the shared fixture. Viewer production code unchanged.
- Final result, real CAD and QA remain pending until follow-up CI.



### 0.27.0 / PR #30 CI #49 E2E fixture 수정 (2026-10-16)

- Typecheck/ESLint/125 Unit·Integration/Build/Docker PASS; Browser E2E 38 PASS / 신규 2 FAIL.
- 공식 DXF에 따라 MTEXT 테스트 파일에 group 41(width), 71=1(top-left), 72=1(left-to-right)을 명시하고 TEXT handle을 유효한 hex로 갱신. CI trace의 RenderMText "Unhandled alignment" 원인 해결을 목표로 한 테스트 데이터 보완.
- 운영 소스 변경 없음. 최종 Browser E2E 및 독립 QA 결과 재검증 대기.



### 0.27.0 / PR #30 보완 (2026-10-16)

- Fixed: JSX 렌더링 중 ViewerManager ref 읽기로 발생한 ESLint react-hooks/refs 실패를 stable getter로 변경.
- Fixed: DXF Unicode escape가 바로 뒤의 영문 16진 문자까지 잘못 소비하던 문제를 정해진 4자리 코드로 제한하고 회귀 테스트 추가.
- Verification: PR CI #42 (38865738285)는 TypeScript/Docker success, ESLint failure, Unit/Browser skipped. 후속 PR CI 및 QA 판정 대기.



## 0.27.0 — 2026-10-16 / GitHub #26 (PR CI 전)

- Added: 현재 DXF 내 TEXT/MTEXT 문자열 부분검색, 한글/영문/숫자, 정규화된 MTEXT, 결과 선택·이전/다음 및 world XY Pan/Zoom. 2D BLOCK/INSERT 좌표 해석과 미지원 Entity 집계.
- Added: 재사용 가능한 브라우저 Worker text index, ViewerSource 캐시, 두 DXF Adapter의 focusBounds, 전체 화면 Viewer shell의 접이식 검색 패널.
- Compatibility: DB/API/migration/새 npm dependency 없음. DWG 텍스트 검색은 미지원. 기존 #25 기본 fullscreen 진입은 별도 작업.
- Tests: TC-TEXT-001~006 Unit, TC-TEXT-E2E-001 브라우저 테스트 소스 추가. 이 시점 정적/실행/CI PASS 및 실제 업무 도면 수용은 **미확인**.


## 0.27.0 — 2026-10-16 / GitHub #31 (PR CI 재검증 전, 범위 제한)

- Feature: three-dxf-viewer의 DXF 객체 클릭/다중·방향별 영역 선택, 레이어 동기화, 독립적인 Convex 및 실제 폐곡선 Polygon Union(+MultiPolygon/Holes), Worker 취소 및 Preview/임시 확정·JSON 내보내기.
- Design: Version SHA + Entity Handle, 기본 2D WCS/INSERT 변환·INSUNITS, 오류가 있는 Entity의 명시적 제외; polygon-clipping@0.15.7(MIT) 도입. 브라우저 임시 결과만 지원, 서버 DB/API/원본 변경 없음.
- Validation: 최초 PR #32 CI #38868848174 TypeScript/Docker PASS, ESLint prefer-const 실패로 Unit/E2E 미실행. Fullscreen ESC/Preview stale/오목 Hole P2 리뷰 3건 보완 및 회귀 테스트 추가. 신규 CI·독립 QA·실도면 검증 전. 범위·미지원과 P4 정책 대기는 [Issue31](Issue31.md).


## 0.26.0 — 2026-10-16 / GitHub #28 (CI 전)

- Web: Next standalone 및 native SQLite 기반 Docker 운영 이미지로 축소; 비교용 phase1 타깃 추가.
- DB: migration/backfill은 별도 일회성 migrator 타깃으로 분리. Compose는 성공 종료 이후 웹을 시작한다. UID10001, 단일 /data, DXF/DWG font/JS/WASM/스토리지 계약 유지.
- Release: 앱·마이그레이터를 SHA 기반 후보로 각각 빌드·검증한 후에만 동일 릴리스의 공개 태그를 승격하도록 변경. 태그 없는 `GHCR_IMAGE`를 `:latest`/`:latest-migrate` 쌍으로 정규화하는 `scripts/compose.sh` 추가. GHCR 다중 태그 승격의 비원자성을 고려해 운영은 버전/digest pair 고정·백업·구 앱 중단·migration 성공 후 시작 필수.
- Test: 최초 PR #29 CI #30 run `38858349603`의 정적/Unit/Browser/Legacy migration, Docker 빌드·측정, migrate/backfill 정상. **Docker smoke 실패**는 컨테이너 기동 직후 curl exit 56 재시도 누락으로 확인해 보완함. 비압축 크기 baseline 2,054,848,814 → runtime 376,228,092 bytes, **81.69% 절감**(동일 linux/amd64); 최종 smoke/재CI, 독립 QA, GHCR 게시 상태는 재검증 대기. TC-IMAGE-010~012 추가.


## 0.25.0 — 2026-10-15

- 사업부→제품→사업장/법인→동→층 기준정보 CRUD, 활성/비활성 및 SITE/LEGAL_ENTITY 종류를 추가했다.
- 등록을 완전한 활성 ID chain으로 제한하고 모든 위치 조회를 master join으로 전환했다. 기본 도면 이름 네 부분 형식은 유지하고 제품을 별도로 표시한다.
- 기존 Location ID와 Version/Current/순번/metadata를 보존하는 `미분류` 이관과 충돌을 거부하는 층 전체 이력 재분류를 추가했다.
- 검증: 독립 QA에서 정적 검사·빌드, Unit/Integration 109개, Browser 38개, 실제 legacy migration 1개, S3 6개, DWG 4개를 통과하고 Manager가 수용했다.
- 게시: source `e8189b4`를 지정 저장소의 기능 브랜치에 게시했다. PR CI는 일반 E2E와 실제 legacy migration E2E를 실행하도록 구성했다. Tag/GHCR 게시·운영 migration·배포는 수행하지 않았다.

# 0.24.0 — GitHub #17

- Added: 전체 화면 `three-dxf-viewer`에 접이식 레이어 패널을 추가했다. 현재 DXF 레이어의 개별 표시/숨김, 전체 선택/전체 해제, 내부 스크롤을 지원하며 일반 화면 `LayerDropdown`과 선택 상태를 공유한다.
- Changed: 레이어 조작은 기존 `ViewerManager.showLayer()`를 재사용해 Viewer/Adapter/Canvas 재생성과 원본 재다운로드 없이 즉시 반영한다. 현재 Zoom/Pan 상태를 유지하고 `dxf-viewer` 등 다른 Viewer에는 전체 화면 레이어 UI를 표시하지 않는다.
- Tests: PR #21 최종 CI run `35278486135`에서 TypeScript, ESLint, 23 files/105 Unit·Integration, Production build, Chromium E2E 35/35가 모두 통과했다. `TC-ISSUE17-001`은 복수 레이어, 개별/일괄 토글, 동일 Canvas 유지, 추가 content GET 없음, 전체 화면 종료 후 view state 복원, 일반 드롭다운 동기화, 다른 Viewer 미표시를 검증한다.
- Version: 신규 UI 기능이므로 SemVer MINOR `0.23.0` → `0.24.0`. DB schema/migration, API contract, 외부 dependency 변경 없음.
- Release: PR #21을 squash merge한 commit `b7fdeb34e25f0dc66790ed421bcaf105f6801db3`에서 `v0.24.0`을 생성하고 `ghcr.io/planner77/layoutmanager:0.24.0` 및 `latest`를 digest `sha256:bfd80f24e43b5e108c480b3a51913daa66d47331c880855f340233468616993c`로 게시했다. 상세 근거는 `Issue17.md`와 `Release-0.24.0.md`를 따른다.
- Limitation: 매우 많은 레이어를 가진 실제 업무 DXF의 현장 사용성·성능은 CI 범위 밖이며 운영 smoke test 대상으로 남긴다.

# 0.21.1 — GitHub #14

- Fixed: 사설 IP HTTP 등 비-Secure Context에서 전역 로딩 작업 ID 생성이 `crypto.randomUUID()`에 의존해 Viewer 콘텐츠 요청 전에 중단될 수 있던 회귀를 수정했다. Provider-local sequence 기반 ID로 변경해 Secure Context 의존성을 제거했다.
- Tests: PR #15의 GitHub Actions run `35231047884`에서 TypeScript, ESLint, 22 files/100 Unit·Integration, Production build, Chromium E2E 34/34가 모두 통과했다. `TC-ISSUE14-001`은 `crypto.randomUUID` 부재 조건에서 콘텐츠 요청, dxf-viewer/three-dxf-viewer 표시 완료, global overlay 해제를 검증한다.
- Version: 기존 기능 회귀 수정이므로 SemVer PATCH `0.21.0` → `0.21.1`. DB schema, API contract, 외부 dependency 변경 없음.
- Release: PR #15를 squash merge한 commit `642bde71f9d9c0e1205df66c3828489ff2d4078f`에서 `v0.21.1`을 생성하고 `ghcr.io/planner77/layoutmanager:0.21.1` 및 `latest`를 digest `sha256:fbb7b21ab81250a3d0a47fa963683895f57e8c02a9f4ceac57f37170469be451`로 게시했다. 상세 근거는 `Release-0.21.1.md`를 따른다.
- Limitation: 실제 사설 IP HTTP + 기존 0.19.2 named volume 조합의 현장 smoke test는 GitHub Actions 범위 밖이며 운영 배포 시 별도 확인한다.

# 0.21.0 — GitHub #10

- Added: 도면 Viewer에 전체 화면 진입/종료를 추가했다. 표준 Fullscreen API를 우선 사용하고 제한되는 환경에서는 CSS fixed viewport fallback으로 화면 가용 영역을 최대화한다.
- Added: 전체 화면 안에서 확대·축소·화면 맞춤·이동과 명시적인 종료 버튼을 제공한다. `Escape`는 native/fallback 모두 종료하며 `fullscreenchange`로 브라우저 자체 해제와 상태를 동기화한다.
- Changed: 전체 화면 전환은 Viewer/Canvas를 재생성하지 않고 같은 DOM의 크기만 바꾸므로 현재 확대/이동 상태를 불필요하게 초기화하지 않는다. 기존 dxf-viewer `autoResize`와 three-dxf-viewer/DWG `ResizeObserver` 경계를 유지한다.
- Tests: PR #13의 최초 run `35210713169`은 Playwright 합성 ESC와 native fullscreen 해제 차이로 Viewer E2E 2건이 실패했다(31/33). ESC를 명시적 종료 경로로 보강한 최종 기능 head `9eff6d438ec86fffd6acdc99ea4d046c028f6690`의 run `35211193682`에서 TypeScript, ESLint, 22 files/100 Unit·Integration, Production build, Chromium E2E 33/33이 모두 통과했다.
- Version: 신규 UI 기능이므로 SemVer MINOR `0.20.0` → `0.21.0`. DB schema 및 외부 의존성 변경 없음.
- Release: PR #13 병합 후 `Build and publish Docker image` workflow가 `v0.21.0`, `ghcr.io/planner77/layoutmanager:0.21.0`, `latest`를 관리한다. 실제 merge SHA, workflow run, digest는 `Release-0.21.0.md`를 기준으로 한다.

# Unreleased — GitHub #8

- Added: 도면 목록에 `현재 버전만 표시` 빠른 토글을 추가했다. ON은 기존 `current=true` 조회를 재사용하고 OFF는 Current 조건을 제거한다.
- Changed: 토글 전환 시 파일명·도면 설명·사업부·사업장·동·층·형식·페이지당 표시 조건을 유지하면서 `page=1`로 초기화한다. `aria-pressed`와 활성/비활성 시각 상태를 제공하며 기존 `current=false`(이전 버전만) 필터는 그대로 유지한다.
- Tests: `TC-LIST-008/009`로 URL 상태 보존·페이지 초기화·기존 조건 AND 결합·Current 미지정 Location 제외를 검증하고, Playwright에서 OFF→ON→OFF와 검색조건·`aria-pressed`·표시 행 변화를 검증했다.
- CI: PR #11의 최초 실행은 기존 `TC-NAME-003` fixture가 현재 도면 이름 안내 UI와 불일치해 30/31 E2E로 실패했다. fixture를 요구사항에 맞게 갱신한 두 번째 실행에서 typecheck, lint, 22 files/100 unit·integration tests, production build, 31 E2E가 모두 통과했다.
- Scope: DB schema, Current 지정/교체 transaction, Location별 Current 최대 1개 규칙 및 API contract는 변경하지 않는다.

# 0.19.1 — GitHub #7

- Changed: 공통 header 좌측 제목의 CAD 접두어와 P.O.C. 배지를 제거해 Layout Manager로 표시한다. 실제 검증·배포 기록은 TestReport U-ISSUE7-20260911을 따른다.

- Release: 소스 `83b8e53` push, GHCR0.19.1 게시/pull, 실제 이미지 제목·홈 링크 검증과 기존 볼륨 백업/배포·healthy·데이터 보존 확인. GitHub #7 완료 종료.

# 0.19.0 — GitHub #6

- Added: 위치·버전 기반 기본 도면 이름과 등록 시 사용자 이름 선택 입력. 원본 파일명과 별도로 목록·Location·Viewer에 표시한다.
- Database: 사용자 이름의 nullable column 추가로 기존 도면을 기본 이름으로 표시한다. 실제 migration·시험·게시/배포 결과는 TestReport U-ISSUE6-20260911을 따른다.

- Release: 소스 `0b1c620` push, GHCR 0.19.0 게시/pull 및 이미지 Browser·db:deploy 재실행 검증 완료. 기존 볼륨 백업 후 migration/배포·healthy·기존 데이터/원본 보존과 기본 이름 표시를 확인하고 GitHub #6을 완료 종료했다.

# 0.18.0 — GitHub #5

- Added: three-dxf-viewer 레이어 다중 선택 드롭다운과 전체 선택·전체 해제, 선택 개수 표시. 현재 Viewer에서 선택을 유지하며 새 load와 Renderer/Version 전환 시 초기화한다.
- Tests: 여러 레이어의 실제 canvas 표시·숨김/복원, 메뉴/키보드·일괄 조작·수명주기 회귀를 보강하고 검증했다. 실제 결과와 배포 기록은 TestReport U-ISSUE5-20260911을 따른다.

- Release: 소스 `543423d` push, GHCR 0.18.0 게시/pull 및 이미지 Browser 검증 완료. 기존 볼륨 백업 후 배포/healthy·원본/전체 메타데이터 보존을 확인하고 GitHub #5를 완료 종료했다.

# 0.17.2 — GitHub #4

- Fixed: 삭제 대화창을 표와 분리해 긴 파일명·위치·경고 문구의 줄바꿈과 좁은 화면의 버튼 접근을 보장한다. 키보드 포커스 및 닫기 동작을 modal Dialog로 관리한다.
- Tests: 목록/Location·화면 크기·긴 텍스트·오류/정리대기 상태의 Browser 레이아웃 회귀를 보강한다. 실제 시험·게시·배포 결과는 TestReport U-ISSUE4-20260911을 따른다.

- Release: 소스 `56fb1c4` push, GHCR 0.17.2 게시/pull 및 기존 볼륨 백업·재배포/healthy·원본/메타데이터 보존 확인. GitHub #4에 검증 요약 댓글을 남기고 완료 종료했다.

# 0.17.1 — GitHub #2 / #3

- Fixed: 파일 선택과 제출 시 서버 설정의 최대 MiB를 기준으로 사전 검증해 초과 파일의 전송을 차단한다. 서버 413 검증을 유지한다.
- Tests: 기존 도면 설명의 UI 메모 등록·저장·조회 회귀와 100 MiB 경계/설정 변경/전송 차단 시험을 보강한다. 실제 결과는 TestReport의 이슈 조치 기록을 기준으로 한다.
- Fixed: 미게시 DELETE 구현의 서버 비밀번호 검증 누락과 제한/정리 경계에 대한 게시 전 보완. 실제 검증·배포 결과는 TestReport에 기록했다.

- Release: 소스 `27a132f` push, GHCR 0.17.1 게시·pull 및 기존 볼륨 재배포/healthy 확인. 기존 도면 2건의 원본·메타데이터를 보존하고 삭제 비밀번호1234 적용을 읽기 전용 검증했다. GitHub #2/#3 댓글·완료 종료. 상세 근거는 TestReport U-ISSUES-20260911.

# 0.17.0 — 2026-09-11 Unit DELETE

- Added: 신규 등록 삭제 비밀번호, 비밀번호 확인 후 선택 Version 삭제, 기존 Version 비밀번호 1234의 salt hash 초기화.
- Added: 삭제 Current 해제, 순번 재사용 방지, DB 승인 기록 기반 local/S3 원본 정리와 실패 재시도.
- Compatibility: 신규 업로드 API의 비밀번호는 필수이며 미입력400. DB migration/backfill 필요. 0.17.0 커밋 당시 원격 게시·운영 DB 적용·배포는 미완료였다.
- Tests: 당시 자동 시험은17 files/74 tests였다. TC-DELETE 전체 수용 결과는 아니며 게시 전 보완과 실제 DB 적용 결과를 TestReport에서 확인한다.

# 0.16.0 — 2026-09-09 Unit OBS

### Added

- 업로드 실패 화면의 안전한 진단 상세, 직접 선택·Clipboard 복사·JSON 저장과 공개 진단 Console 보조 출력을 추가했다.
- HTTP/비JSON/빈 응답/연결 실패/잘못된 성공 응답을 구분하고 결과 불확실 시 목록 확인을 안내한다.
- 서버 생성 요청 ID와 단계별 한 줄 JSON 로그로 수신·저장·DB 등록·정리·응답을 연결하며 S3 원인 chain을 정제해 보존한다.
- Docker Compose에 `local` 로그 드라이버의 10 MiB × 5개 순환 보관을 지정했다.

### Fixed

- 임시파일·보상 정리 실패가 최초 업로드 오류 또는 확정된 등록 성공을 덮지 않도록 처리했다.

### Tests

- 실제 결과와 배포 image/digest는 TestReport `U-OBS-20260909`를 기준으로 한다. 실제 폐쇄망 장애 재현은 별도이다.

# 0.15.0 — 2026-09-09 Unit 8B

### Added

- libredwg-web DWG Viewer의 WASM 초기화·DWG 파싱 단계 계측을 공통 Metrics JSON에 연결했다.
- 등록 폼 설명 입력 영역을 넓은 강조 섹션으로 재배치하고 홈 목록에서 Current를 직접 지정할 수 있게 했다.

### Tests

- Unit 53개, DWG E2E 4개, typecheck/lint/build 통과. 실제 업무 도면·장기 메모리·GPU/WASM 메모리는 미검증이다.
- 0.15.0 linux/amd64 이미지를 GHCR에 게시하고 인증된 pull 및 digest 일치를 확인했다.
- DWG 통합·기존 회귀 16개와 20회 Viewer 전환 검증을 통과했다.

## 0.14.0 — 2026-09-09 Unit DESC

### Added

- Version별 도면 설명 입력·목록/Viewer 표시와 설명 literal 부분 검색.
- 기존 행을 빈 설명으로 보존하는 SQLite additive migration.

### Tests

- Unit 테스트 52개 통과. 설명 UI E2E는 후속 실행 대상으로 기록한다.
- 최신 Dockerfile로 GHCR `0.14.0` 이미지를 재빌드하고 push/pull digest 일치를 확인했다.

애플리케이션 버전의 단일 기준은 `src/package.json`이다. 아래 Bootstrap 기록은 당시 상태이다.

## 0.13.0 — 2026-09-08 Unit DEPLOY

### Added

- 한국어 주석과 명시 이름을 갖춘 Dockerfile/Compose, named volume, 비root 실행, DB readiness endpoint.
- localhost/host IP 접속을 위한 기본 수신 주소, GHCR image/host port 환경 예제와 README build/pull 절차.

### Tests

- 최종 실행 검증일2026-09-09: 자동51개·local E2E16개·typecheck/lint/build, Docker localhost/hostIP, 세 renderer, 재생성 후 Version/Current/원본 영속성 통과. Secret검사121건/위반0. GHCR0.13.0 push 및 인증된 pull의 digest 일치 확인. 실제 digest/소스 commit은 TestReport U-DEPLOY-20260908에 기록했다.

### Known Issues

- 기존 host data 자동 이전 및 여러 app replica를 지원하지 않는다. DB/임시 CAD 디스크는 S3모드에서도 필요하다.
