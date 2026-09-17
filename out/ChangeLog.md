# ChangeLog

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

## 0.12.0 — 2026-09-08 Unit LINK

### Added

- 목록·Location·Viewer에서 특정 Version을 여는 origin 기반 직접 링크 복사.
- DXF renderer 보존, DWG renderer 강제, Current 교체 후 Version 고정, Clipboard fallback 수동 복사/열기.

### Tests

- 자동49개, LINK 재시험3개, DWG4개 통과. typecheck/lint/build 성공. 최초 E2E 시험 대상 오류와 재시험 이력은 TestReport U-LINK-20260908에 기록했다.

## 0.11.0 — 2026-09-08 Unit S3

### Added

- SeaweedFS 등 S3 호환 storage backend 선택, 고정 AWS SDK 3.1127.0, 서버 전용 설정.
- 기존 local/S3 혼합 조회, stream PUT/GET 및 immutable object key/조건부 PUT.
- DB transaction 전 remote 업로드, 실패 보상과 불확실 COMMIT 원본 보존.
- 격리 SeaweedFS 통합 시험·웹 E2E 명령과 환경 예제/운영 안내.
- README에 최초 설치·DB 준비·개발/Production 실행·검증 및 기존 SeaweedFS 연결 순서를 추가.

### Tests

- 실제 결과는 TestReport U-S3-20260908. schema migration 및 기존 데이터 이동 없음.

### Known Issues

- 한 S3 endpoint만 지원. SQLite/임시 upload는 local disk 유지. 버킷 생성/데이터 자동 이전은 미제공.
- 실제 서비스 `.env`는 변경하지 않음. 기존 DWG Entity 제한/의존성 high 경고/메모 이슈 #2는 유지.

## 0.10.0 — 2026-09-08 Unit 7B

### Added

- 등록 DWG 목록/Version에서 libredwg-web 전용 Viewer 연결.
- LibreDwgWebAdapter, 형식 선택 경계, 20 MiB/헤더 검증과 부분 표시 경고·JSON partial.
- DWG 확대·축소·Pan·Fit·Resize·재시도·취소 및 등록 UI 통합 시험.

### Tests

- 실행 결과는 TestReport U7B-20260908. DB/의존성 버전 변경 없음.

### Known Issues

- DWG는 평면 LINE만 지원, 전체 Entity/업무 도면/revision/대형 성능 미검증. raw parser nonzero flags는 보수적으로 오류 처리.
- 기존 high dependency 경고와 이슈 #2 메모 요청은 후속.

## 0.9.0 — 2026-09-08 Unit 7A

### Added

- libredwg-web 0.7.10 고정 설치, `/lab/dwg`에서 실제 DWG를 읽는 독립 Worker/WASM LINE 실험.
- 자체 평면 LINE 렌더링, 제외 Entity 집계, raw pointer free/임시 FS unlink/Worker 종료, 오류와 60초 timeout.
- 고정 공식 샘플 hash 검증 및 별도 `test:dwg` Browser 시험.

### Fixed

- Next Webpack의 upstream node:module 해석 실패를 배포본 수정 없이 local ESM/WASM asset 경계로 해결.

### Tests

- 실제 결과는 TestReport U7A-20260908. DXF 회귀 별도 수행.

### Known Issues

- 등록 DWG Viewer 통합은 7B. LINE 외 Entity/실도면 fidelity/다른 DWG revision/장기 메모리 미검증.
- GPL-3.0 배포본, INITIAL_MEMORY=1GB 빌드 옵션. 파서와 자체 renderer의 범위를 구분한다.
- 기존 Prisma 전이 의존성 high 경고 4개 유지. 이슈 #2 메모 요청은 별도 후속.

## 0.4.0 — 2026-09-08

### Added

- DB 기반 도면 목록, 파일명·위치·형식·Current 검색, 페이지 이동.
- Location별 버전 상세 및 Current 변경 화면, 목록/상세 조회 API.

### Fixed

- GitHub #1: 등록 성공 후 첫 화면에 도면이 표시되지 않는 문제. 정적 안내 화면을 실제 목록으로 교체하고 등록/Current 변경 후 캐시를 갱신한다.

### Tests

- 최종 실행 결과는 TestReport의 U3-20260908을 참조한다.

### Known Issues

- Viewer는 미구현. dxf-viewer→three-dxf-viewer 순으로 진행하며 libredwg-web은 후속 MINOR 버전이다.
- 기존 Prisma 전이 의존성 보안 경고는 미해결이다. DB Schema 변경은 없다.

## Unreleased — 2026-09-07 문서 Bootstrap

### Added

- 간결한 AGENTS 진입 규칙과 요구·Architecture·Database·TestPlan·TestReport·Operation·Decisions 초기 문서.
- 요구 ID와 Acceptance Criteria/예정 구현/Test Case의 추적 관계.
- README 프로젝트/설정/실행 안내 초안 및 기존 변수명을 유지한 .env.example.
- 실제 구현을 시작하지 않는 src directory placeholder.

### Changed

- 기존 .gitignore를 확장해 env·Runtime DB·CAD 원본·Build/cache·임시 파일을 제외.
- 기본 Unit 0을 0A/0B로 분리하고 DWG 실험 7A를 0B 직후에 배치한 구현 계획.

### Tests

- 실제 실행 결과와 범위는 [TestReport](TestReport.md)의 BOOT-20260907-01을 참조한다.
- 애플리케이션 Build/Type Check/Lint/DB/Viewer/E2E 테스트는 구현 전이라 미실행이다.

### Known Issues

- libredwg-web 파싱 후 직접 렌더링 설계 및 전체 구현 계획 확인 대기.
- Git author 미설정 문제는 사용자 제공 정보의 repository-local 설정으로 해결했다. 문서 Commit/Push 결과는 TestReport 참조.
- 실도면/업무 성능 목표 미제공, 앱/library 설치 및 실행 호환성 미검증.

## 향후 버전 정책

Unit 0B 첫 앱 버전은 0.1.0 제안이다. 이후 의미 있는 기능 추가 MINOR, 호환 Bug Fix PATCH, 구조/Contract 근본 변경은 사용자와 협의한다. 실제 버전 변경 시 Added/Changed/Fixed/Tests/Known Issues와 검증한 Commit을 기록하고 README와 대조한다.

## 2026-09-07 실행 순서 변경

사용자가 계획 실행을 승인했다. DXF 두 Viewer와 공통 관리 기능·계측·회귀를 먼저 구현하고, libredwg-web은 그 다음 MINOR 버전으로 진행한다. DWG 선행 실험은 DXF 구현의 조건에서 제외한다. 최신 단계/승인 상태는 Decisions의 ADR-011과 TestPlan을 따른다. 기존 미실행 기록은 당시 상태이며 실제 완료 후 갱신한다.

## 0.1.0 — 실행 기반

Added: Next.js/TypeScript/shadcn 방식 UI 기반, 앱 전용 env launcher, Prisma/SQLite 연결, Vitest/Playwright 기반. Tests: 2 passed, typecheck/lint/build/DB/page smoke 통과. Known Issues: CAD 기능은 후속 Unit, DWG는 DXF 다음 버전.

## 0.2.0 — Location 및 Version 정합성

Added: 실제 Prisma migration, 위치 Unique, 소속 검증 복합 FK, Current transaction과 DB integration tests. Tests: 환경/DB 8 passed, typecheck/lint 통과. Known Issues: 등록 화면은 Unit 2에서 제공하며 아직 Viewer는 미구현.

## 0.3.0 — 파일 등록

Added: 제한된 multipart streaming, DXF/DWG 등록·SHA-256·원본 조회·Current API, 등록 화면. Fixed: 파일 등록 메뉴 404, multipart 경계/동일 Origin 호스트 비교. Tests: 20 automated + 2 Browser E2E passed, typecheck/lint/build 통과. Known Issues: Viewer/목록은 후속 Unit, Prisma 전이 의존 audit high 4건.

## 0.5.0 — 2026-09-08

### Added

- dxf-viewer 1.0.48 Adapter, Worker, Manager 및 DXF Viewer 경로.
- 확대/축소/Pan/Fit/Resize, 빈 도면·손상 파일·WebGL 오류, 재시도 및 자원 정리.
- Manager 생명주기 자동 테스트와 실제 LINE/CIRCLE WebGL E2E.

### Tests / Known Issues

- 실제 최종 결과는 TestReport U4-20260908 참조. TEXT/한글 기본 font 미제공, 실도면 성능/전체 Entity 미검증. three-dxf-viewer와 libredwg-web은 후속 단계. 기존 npm high 4 경고 유지.

## 0.6.0 — 2026-09-08

### Added

- three-dxf-viewer Adapter/Scene, Zoom/Pan/Fit/Resize, Layer 표시/숨김, 별도 renderer URL.
- 두 DXF Viewer의 한글 기본 글꼴, 원본 TTF/OFL 및 build/dev typeface 생성.
- 두 Viewer 정상/오류/탐색/한글 E2E와 font glyph 검증.

### Fixed / Known Issues

- 두 번째 Viewer 검정 도형 대비 및 손상 입력의 빈 도면 오판을 Wrapper에서 처리.
- 생략된 Z 좌표로 NaN이 발생하는 설치본의 문제를 Wrapper 보완 및 bounds 검증으로 처리. 서버 원본은 변경하지 않는다.
- 원본 font/SHX·전체 Entity·복잡한 Layer·MTEXT fidelity/성능 미검증. Hover/Select/Snap UI 미제공, 전역 cache 및 메인 스레드 비용 평가 필요. 기존 npm high 4 유지.
- 실제 최종 테스트 결과는 U5-20260908 참조. 다음 Unit 6은 새로고침 없는 전환이다.

## 0.7.0 — 2026-09-08

### Added / Changed

- 전체 reload 없는 DXF renderer 버튼 전환, 선택 URL 유지.
- Version 수명의 원본 다운로드 공유, Adapter별 독립 bytes, 명시적 재다운로드.
- 지연 다운로드/빠른 선택/10회 전환 및 Worker/Blob/WebGL cleanup 시험.
- 실제 결과는 TestReport U6-20260908 참조. DB Schema/의존 라이브러리 변경 없음. 다음 Unit 8A.

## 0.8.0 — 2026-09-08

### Added

- Viewer 단계별 측정/결과/Browser/파일 크기/선택적 Entity·heap 정보 및 JSON export.
- 생성 LINE 크기별 cold/warm 반복 benchmark와 개별 JSONL 결과.
- 누락 사이트 아이콘으로 발생하던 Console 404 수정.

### Tests / Known Issues

- 최종 값과 통과 수는 TestReport U8A-20260908 참조. 순수 parse·GPU memory·전체 Entity fidelity·업무 실도면 적합성 미검증. 기존 npm high 4 유지. DB Schema/외부 dependency 변경 없음.

## 0.8.0 검증 보완 — 2026-09-08 Unit 9A

### Tests

- UI에서 DXF 두 버전 등록→검색→Current 교체→선택 Version의 두 Viewer 표시→원본 bytes 보존 통합 시나리오 추가.
- 전환 스트레스 10회→20회, 전체 DXF 회귀 실행. 실제 수와 결과는 TestReport의 U9A-20260908을 참조한다.

### Changed

- 요구사항 상태/README/운영 및 다음 Unit 갱신. 앱 기능/DB Schema/의존성 변경 없어 0.8.0 유지.

### Known Issues

- 실도면·복잡한 Entity·10 MiB 초과/업무 SLA 및 DWG 렌더링 미검증. 기존 Prisma 전이 의존성 경고 미해결.
- 원격 이슈 #2 등록 메모는 이번 범위 밖 후속 요청으로 남는다.
