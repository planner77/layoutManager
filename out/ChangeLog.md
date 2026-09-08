# ChangeLog

애플리케이션 버전의 단일 기준은 `src/package.json`이다. 아래 Bootstrap 기록은 당시 상태이다.

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
