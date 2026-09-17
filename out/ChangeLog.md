# ChangeLog

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
