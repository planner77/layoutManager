# CAD Web Viewer P.O.C. — 개발 진입 문서

## Issue #39 (2026-10-25) — 상단 레이어 패널 표시/숨김 U2, v0.32.0

- #38 `ViewerAppState.layerPanelOpen`이 메뉴/도크의 유일한 열림 상태다. `layerAvailable`(immersive + three-dxf-viewer + ready + layers>0)을 충족하면 `aria-controls` 대상 도크 host를 닫힌 상태에서도 유지하고, 내부 접기 후 메뉴로 키보드 포커스를 돌린다.
- **패널 표시**는 `selectedLayers`(실제 CAD layer visibility)와 독립; 기존 #17의 checkbox·전체 선택/해제·Manager API/Canvas/Source는 유지. 도크 조작 시 Viewer 재생성·다운로드/Zoom/Pan/Selection 초기화 금지. Normal/dxf-viewer/DWG/0 레이어/오류/로딩에서는 메뉴 disabled 및 무효한 aria-controls 미노출.
- 회귀: `TC-U2-UNIT-001`, `TC-U2-E2E-001~003`, 기존 #17/#38/#25/검색/외곽선. Simulated native 이벤트는 실제 브라우저 Fullscreen 실증이 아님. 구현 상태와 CI 결과는 [Issue39](out/Issue39.md), [TestPlan](out/TestPlan.md), [TestReport](out/TestReport.md)를 따르며 **PR CI 전 테스트는 NOT RUN**이다.

## Issue #45 (2026-10-25) — Current-only 도면 목록, v0.31.0

- `/`의 도면 목록은 사용자가 변경할 수 없는 **Current Version 전용**이다. `currentOnlyListParams`에서 기존 검색 query 검증 뒤 `current=true`를 서버 조회에 강제한다. `?current=false` 및 파라미터 누락도 홈에서는 Current만 표시하며 필터·count·pageSize는 보존한다.
- #8의 `현재 버전만 표시` 토글은 제거한다(#16의 드롭다운 제거 유지). 이전 버전/Current 미지정 층은 `위치별 버전 관리`→`/masters` 다섯 단계 선택→층 `버전 이력` 링크→Location 상세에서 조회·Current 재지정할 수 있다. Location별 Current는 자동 승격하지 않는다.
- **홈 전용 정책**: `/api/cad-files?current=false` 및 공통 `listQuery`/Location 상세는 기존처럼 non-Current/전체 이력 조회가 가능해야 한다. DB migration·기존 도면/버전/원본·권한 변경 없음.
- 회귀: TC-LIST-045-001~003 및 기존 Workflow/Link/Name/Current/Delete/Master E2E. **2026-10-25 최초 PR CI #40142618328 ESLint 실패**(`masters/page.tsx` JSX apostrophe) 및 P2 리뷰에서 `upload.spec.ts` 비Current 홈 접근 회귀 발견; `69e6b175`로 둘 다 보완. 첫 CI에서 E2E는 SKIPPED이므로 실패라고 표기하지 않는다. 수정 HEAD의 CI 증거 전 NOT VERIFIED. 상세 [Issue45](out/Issue45.md), [FailureLedger](out/FailureLedger.md), [TestPlan](out/TestPlan.md).


## Issue #38 (2026-10-24) — Viewer 앱형 메뉴·도킹 셸 U1, v0.30.0

- Epic #37 / 선행 U1: `ViewerAppShell`·`ViewerMenuBar`·`viewerAppReducer`에 CAD 앱 메뉴/좌우 패널 호스트·독립 상태를 도입한다. CSS immersive 기본 진입·사용자 제스처 native fullscreen(#25), 기존 ViewerManager/Adapter lifecycle, 원본 DB/API는 유지한다.
- `layerPanelOpen`(초기 true), `outlineToolEnabled`(초기 false), `outlineTreeOpen`(초기 false)은 캔버스/레이어 표시 상태와 독립이다. 좌측 레이어 도크는 #17의 레이어 조작을 재사용하며 메뉴 토글/도크 접기는 도면 레이어 가시성을 변경하지 않는다.
- 외곽선 ON/OFF(#40), 관리자 타입(#41, P4 RBAC 승인 대기), 타입 지정(#42), 외곽선 트리(#43)는 후속이며 U1에서는 해당 메뉴를 *비활성으로 명시*. 서버 영구 저장/타입 등록 API를 추가하지 않는다. 기존 #31 객체 선택/임시 외곽선/JSON은 하단 도크에서 유지한다.
- ESC: 진행 중 선택 취소 → 검색 패널 닫기 → native fullscreen 해제 → CSS immersive 종료, 한 번에 여러 계층 종료 금지. #31 및 #25 회귀 시 이 우선순위를 따른다. Canvas를 패널 조작만으로 재마운트하지 않는다.
- 실제 시험은 로컬 미실행/CI 시작 전이면 NOT RUN으로, 결과 추적은 [Issue38](out/Issue38.md), [FailureLedger](out/FailureLedger.md)와 [TestReport](out/TestReport.md)로 남긴다. 기능 버전 0.30.0, DB migration/Schema 변경 없음.


## Issue #25 (2026-10-17) — 기본 도면 뷰어 전체 뷰포트 자동 진입

- Issue #25: 목록/Location/직접 URL/복사 링크/새 탭/새로고침은 **CSS immersive viewport**로 시작. 브라우저 native fullscreen 자동 요청 불가; 명시 사용자 버튼에서만 API를 사용한다. 기본 모드에서 Renderer·zoom/fit·#17 레이어·#26 검색·#31 외곽선·다운로드·링크·오류/재시도·뒤로·종료를 사용한다.
- `src/package.json` 기준 작업 버전 `0.29.0`. Viewer API/DB 계약 변경 없음. [Issue25](out/Issue25.md)에 신규 AC·자동 시험 및 ESC/native 구분·포커스·모바일 기준 기록. **PR CI 미실행이며 통과로 표시하지 않는다.**



## Issue #31 v0.28.3 후속 — P0/P5 수용 및 P4 원본 검증 (2026-10-16)

- 이전 #34 PR/새 Main CI 성공·GHCR v0.28.2 게시는 완료. 실설비 DXF 원본/운영 브라우저/GPU/권한 IdP가 제공되지 않아 Issue #31의 P0·P4·P5 전체 수용 완료는 **아님**.
- P0 fail-closed: INSERT/BLOCK 내 지원 불가 Entity가 하나라도 있으면 부분 geometry의 stable 참조를 부정하고 렌더 선택에서 제외. 대형 ARC/CIRCLE 샘플 상한 512로 지정한 sagitta 허용 오차를 충족할 수 없다면 제외·경고하고 정확하다고 표시하지 않는다.
- P4 순수 서버 검증 함수(`server/outline/attestation.ts`): 원본 immutable bytes SHA와 버전, 신뢰 가능한 unique Handle, canonical Source Polygon Union을 재계산·비교하여 임의 JSON/좌표를 거부. **인증 IdP/RBAC/Site scope 정책이 Owner 승인되지 않았으므로 실제 DB migration/Write API/영구 저장 구현·배포 금지.**
- P5 합성 1k/10k/100k 소스 CPU 벤치를 PR CI에서 실행하되 실제 CAD·GPU 수용과 구분. private E2E는 `CAD_OUTLINE_ACCEPTANCE_DXF` 지정 시 별도 Playwright config에서만 실행, 현장 DXF/기준 값/보고서는 Git·CI artifact에 커밋/업로드 금지. Issue #31은 운영 실증·P4 승인 전 OPEN 유지.


## Issue #31 — v0.28.2 Production Worker export fix (2026-10-16; PR CI 전)

- v0.28.1 Main CI [#38894507390](https://github.com/planner77/layoutManager/actions/runs/38894507390)은 SUCCESS/GHCR 게시했지만 **실제 Webpack 경고** `Attempted import error: 'union' is not exported from 'polygon-clipping'`가 있었다. 빌드/게시 성공만으로 정밀 외곽선 Worker 정상 동작을 판정하지 않는다.
- polygon-clipping@0.15.7 ESM은 **default export 객체**만 제공하므로 `import polygonClipping from 'polygon-clipping'`, `polygonClipping.union`을 사용한다. `scripts/run.mjs build`는 import/export 오류를 종료 코드 0에서도 실패시켜 PR/Docker Release를 차단한다.
- Production E2E는 Worker PRECISE 실행→임시 확정→다운로드 JSON의 Polygon 좌표·면적·원본 SHA·Handle을 검사한다. PR CI 1k synthetic benchmark smoke. 실 DXF는 `npm run audit:outline -- --file /private/sample.dxf`로 폐쇄망의 승인된 PC에서만 소스 CPU 통계를 생성하며 원본·경로를 외부 업로드하지 않는다.
- **P4 정책 미확정**: 영구 DB/CRUD·권한 변경 금지, 도면 삭제 비밀번호 재사용 금지. P0/P5 실 DXF/GPU 현장 검증 및 P4 승인 전 Issue #31 **OPEN 유지**. 실제로 실행하지 않은 시험은 PASS라고 기록하지 않는다.


## Issue #31 후속 0.28.1 작업 상태 (2026-10-16)

- 0.27.0 PR #32, PR CI run `38874300056`, Main CI run `38875068317`은 실제 SUCCESS. Issue #31은 P0/P4/P5 미완료로 **열린 상태를 유지**한다.
- 0.28.1 P0/P5: Source↔Three Renderer unique Handle/type/layer/World bbox fail-closed 대조, 2D SpatialIndex, synthetic 1k/10k/100k opt-in benchmark 및 Unit/E2E 확대. 실 CAD 성능/정확도는 별도 평가 전 PASS 금지. [Issue31](out/Issue31.md).
- P4: 사용자/Owner가 IdP/인증·인가·audit/scope 정책을 승인하기 전 **서버 영속 DB/Write API 구현·배포 금지**. 브라우저 JSON의 순수 validator·시험만 준비한다. 도면 삭제용 비밀번호·신뢰되지 않은 User 헤더를 재사용하지 않는다.


## Issue #26 (2026-10-16) — DXF 도면 내부 텍스트 검색

- 최신 main 0.27.0(#31) 정렬 후 통합 PR 후보는 **0.28.0**이다. 최초 0.27.0 작업 브랜치에서 현재 도면 DXF TEXT/MTEXT 색인·삽입점 world 좌표 focus, 검색 UI, 단위/Browser 테스트 소스를 추가했다. 현재 단계는 **PR CI 전**, 로컬 실행 결과 및 독립 QA 통과를 주장하지 않는다.
- DXF만 1차 검색 지원. BLOCK/INSERT 기본 2D affine은 지원하되 ATTRIB·ATTDEF/비기본 OCS/배열 INSERT는 제외·안내한다. DWG LINE-only 제한을 유지하며 DWG TEXT/MTEXT 추출·렌더링·줌 가능성을 검증하지 않은 상태에서 지원으로 표시하지 않는다.
- 검색 색인은 Adapter 바깥의 Worker에서 생성하고 ViewerSource로 Version 간 격리/원본 다운로드 공유한다. focusBounds는 각각 dxf-viewer GetOrigin과 three-dxf-viewer world camera로 대응한다. 일반/CSS/fullscreen shell 내부 검색 UI 위치를 유지한다.
- 상세 요구/코드·미지원·TC 목록은 out/Issue26.md 기준. #25 기본 전체 화면 진입 구현은 독립 이슈이며 본 변경의 수용으로 처리하지 않는다.



## Issue #31 (2026-10-16) 구현 범위

- 작업 버전 0.27.0의 `three-dxf-viewer` DXF 선택·외곽선 P0~P3 실험 구현. **합성 Unit/E2E 및 PR CI 검증 전이며 실제 설비 DXF 정확도·성능, 엔터티→Object3D 1:N 매핑은 미확정**. 조건·지원 범위·실험·보류는 [Issue31](out/Issue31.md)을 따른다.
- 외곽선은 브라우저의 임시 Overlay/JSON 내보내기까지만 허용한다. 인증·편집 권한 모델 합의 전 P4 DB/API 서버 저장을 추가하거나 삭제용 비밀번호를 외곽선 권한으로 재활용하지 않는다.


## Issue #28 (2026-10-16) 작업 현황

- 기능 브랜치에 0.26.0 Next.js standalone 웹 + 일회성 Prisma/tsx migration image 구성을 작성했다. 이전 0.25.0 기록은 역사 근거이다. 수용 기준/측정/배포 위험은 `out/Issue28.md`를 따른다. **PR CI와 독립 QA 결과 확인 전 PASS나 이미지 절감 수치를 주장하지 않는다.**
- 운영 업그레이드 전 DB/local CAD/S3의 동일 시점 백업, 기존 app stop, migration 성공 후 app 기동이 필수이다. `out/Operation.md` 참조.


DXF/DWG 공장·설비 도면을 등록·검색·버전 관리하고 세 CAD 기술의 실제 적용 가능성을 검증한다. 문서와 테스트 근거를 코드와 함께 유지한다.

## 현재 단계와 작업 위치

- GitHub #24 소스는 0.25.0이다. 사업부→제품→사업장/법인→동→층 master, 활성 ID chain 등록, 제품 포함 조회, legacy 미분류 이관·층 이력 재분류를 구현하고 독립 QA 및 Manager 수용을 완료했다. 구현 source commit은 `e8189b4`이며 원격 기능 브랜치에 게시했다. 상세 근거는 Issue24/TestReport를 따른다. PR CI 결과와 운영 migration·배포는 이 수용 범위 밖이다. 아래 0.21.0 기록은 이전 릴리스의 역사 기록이다.

- 최신 관리 기능은 등록·목록·검색·Location 상세·Current 변경이다. GitHub #1 조치 결과는 TestReport의 U3-20260908을 참조한다. Unit 4 dxf-viewer를 연결했다. 현재 결과는 TestReport의 U4-20260908을 참조한다. Unit 5에서 three-dxf-viewer와 한글 기본 글꼴을 연결했다. 최신 결과는 U5-20260908을 참조한다. Unit 6에서 새로고침 없는 전환과 원본 공유를 연결했다. 최신 결과는 U6-20260908을 참조한다. Unit 8A에서 측정 UI/JSON 및 반복 비교를 추가했다. U9A-20260908에서 DXF 전체 흐름 및 20회 전환 회귀를 검증했다. Unit 7A에서 libredwg-web의 실제 DWG LINE parse/render/free 독립 실험을 검증했다(U7A-20260908). Unit 7B에서 등록 DWG Viewer와 기본 탐색/오류/재진입을 검증했다(U7B-20260908). Unit 8B에서 DWG WASM 초기화·파싱 계측을 추가했다(U8B-20260909). 사용자 요청 Unit S3에서 선택적 S3 호환 저장소를 추가했다(U-S3-20260908). Unit OBS에서 폐쇄망 업로드 오류의 공개 진단과 요청 ID 기반 서버 로그를 추가했다. 소스 버전은 0.21.0이다. GitHub #10 도면 뷰어 전체 화면 보기 기능을 PR #13에서 구현·검증했으며 native Fullscreen API와 CSS fallback, 상태 보존, ESC/종료, resize 회귀를 포함한다. 요구사항·설계·CI 근거는 Issue10 문서, 실제 병합·태그·GHCR 게시 근거는 Release-0.21.0 문서를 기준으로 한다. GitHub #9 전역 로딩 오버레이와 중복 요청 방지를 구현·검증하고 PR #12 병합, `v0.20.0` 및 GHCR 0.20.0 게시, 이슈 종료를 완료했으며 요구사항·설계·CI·릴리스 근거는 Issue9 문서를 기준으로 한다. GitHub #8 도면 목록의 `현재 버전만 표시` 토글을 구현·검증하고 PR #11 병합 및 이슈 종료를 완료했으며 요구사항과 CI 근거는 Issue8 문서를 기준으로 한다. GitHub #7 상단 제목 간소화의 검증·0.19.1 배포 및 이슈 댓글·종료를 완료했으며 실제 결과는 TestReport U-ISSUE7-20260911을 기준으로 한다. GitHub #6 위치·버전 기반 기본 도면 이름과 사용자 이름 입력의 검증·0.19.0 배포 및 이슈 댓글·종료를 완료했으며 실제 결과는 TestReport U-ISSUE6-20260911을 기준으로 한다. GitHub #5 레이어 다중 선택 드롭다운과 전체 선택·해제의 검증·0.18.0 배포 및 이슈 댓글·종료를 완료했으며 실제 검증·게시·배포 결과는 TestReport U-ISSUE5-20260911을 기준으로 한다. GitHub #4 삭제 대화창 레이아웃을 수정·검증하고 0.17.2 배포 및 이슈 댓글·종료를 완료했으며 실제 수용·게시·배포 결과는 TestReport U-ISSUE4-20260911을 기준으로 한다. GitHub #2 메모를 기존 도면 설명으로 검증했고 #3 파일 크기 사전 검증과 Unit DELETE 보완을 완료했다. 두 이슈를 댓글·종료 처리했으며 GHCR 0.17.1과 기존 볼륨 배포 및 기존 도면1234 적용을 검증했다. 실제 수용·게시·배포 결과는 TestReport U-ISSUES-20260911을 기준으로 한다. 사용자 요청 Unit LINK의 특정 Version 직접 링크와 Unit DEPLOY의 Docker/host IP/GHCR 배포를 완료했다. DWG는 현재 평면 LINE/20 MiB 범위이며 제외 Entity는 partial로 기록한다. 실도면 평가는 미완료이다.

- 2026-09-07 사용자가 계획 실행을 승인했다. **DXF 우선 릴리스: 0B→1→2→3→4→5→6→8A→9A**, 이후 별도 MINOR 버전에서 **7A→7B→8B→9B(libredwg-web)**를 진행한다. DWG 선행 실험은 DXF 구현의 선행 조건이 아니다. 승인 범위 내 반복 승인은 요구하지 않는다.
- 팀 역할 매핑: gpt-6-astra Manager가 범위·승인·Issue Lifecycle 조정을 담당하고, gpt-6-sol Developer가 구현·리팩터링·복잡한 기술 분석을 담당하며, gpt-6-luna QA가 독립 검증·회귀 시험·문서 점검을 수행한 뒤 Manager에게 결과를 보고한다. Manager가 재작업 여부를 결정하고 root가 최종 release commit/push를 담당한다. 과거 TestReport/ADR의 실제 실행 모델 기록은 소급 변경하지 않는다.
- 이 팀 운영은 새 스레드·새 세션에도 적용한다. Manager는 먼저 요구사항/설계/AC를 기록하고 Developer에게 구현을 지시한다. Developer 완료 보고를 검토한 후 QA에 테스트·문서화를 지시한다. QA 보고를 근거로 Manager가 완료 또는 재작업을 결정한다. 모델 사용량 제한 등으로 지정 역할을 실행할 수 없으면 이를 보고하고 실제 대행 주체와 검증 근거를 TestReport에 남긴다. 역할을 실행하지 않고 실행한 것처럼 기록하지 않는다.
- Docker 배포 파일은 `src/Dockerfile`, `src/docker-compose.yml`이다. Root build context의 Secret 차단에 필요한 `.dockerignore`만 Root에 둔다. 이미지에는 `.env`/Git 인증/사용자 CAD/DB를 넣지 않고 앱 설정만 런타임에 전달한다. 단일 SQLite 인스턴스이며 여러 replica를 같은 DB에 붙이지 않는다.
- 프로젝트 Root 아래 `src/`가 애플리케이션 루트이다. 모든 코드·설정·테스트·migration·package/lock 파일은 `src/`에 둔다. `out/`은 Markdown 산출물, `data/`는 Git 제외 런타임 저장소이다.
- 기본 Stack: Next.js App Router, React, TypeScript, shadcn/ui, Tailwind CSS, SQLite, Prisma 우선, Local Filesystem(default)/선택적 S3 호환 저장소. 실제 설치 버전과 호환성은 Unit 0B에서 검증·고정한다.

## 반드시 지킬 규칙

- 사업부→제품→사업장/법인→동→층의 다섯 ID chain이 Location 계층이며 CadLocation ID는 최종 층을 식별한다. 각 단계는 부모 ID+이름 Unique를 사용하고 **Location별 Current는 최대 하나**이다. Current 교체는 트랜잭션으로 처리하고 다른 Location의 Version 참조를 DB에서도 차단한다.
- DXF는 `dxf-viewer` / `three-dxf-viewer` 선택, DWG는 `libredwg-web` Adapter만 허용한다. DWG→DXF 우회와 CAD 편집은 범위 밖이다.
- Viewer는 Manager/Adapter로 격리하고 Browser 전용 의존성을 SSR에서 실행하지 않는다. DWG 파서와 직접 렌더링 계층의 구분은 Architecture 및 ADR-004를 먼저 읽는다.
- UI에 DB 업무 규칙·파일 I/O를 넣지 않는다. 파일은 Version ID로 조회하며 임의 filesystem 경로를 받지 않는다.
- `.env`의 기존 `remote_repo_url`, `remote_repo_token` 변수명을 유지한다. 값·인증 헤더·credential URL을 응답, 로그, 문서, 코드, 커밋에 출력하지 않는다. 앱 프로세스에는 Git Credential을 전달하지 않는다.
- S3의 endpoint/bucket/credential은 서버 환경변수로만 관리한다. 저장 locator별 local/S3를 조회하며 기존 원본을 자동 이동하지 않는다. 원격 PUT은 DB transaction 전에 수행하고 불확실한 완료 응답을 이유로 원본을 삭제하지 않는다.
- Secret, Runtime DB, CAD 원본, 캐시, Build 결과, Debug dump는 커밋하지 않는다. 외부 라이브러리를 먼저 수정하지 말고 Wrapper 해결과 영향 분석을 우선한다.
- 지원 여부, 공식 문서의 주장, 실제 시험 결과, 추정을 구분한다. 미실행을 PASS로 기록하지 않는다.

## 작업 Workflow와 완료 기준

1. 재개 시 이 문서 → README → 안전하게 확인한 Git 상태/remote/branch/log → package version → ChangeLog → TestReport → 해당 상세 문서를 읽는다. 기존 변경을 보존한다.
2. 승인 범위 내 다음 최소 Unit의 요구사항·Acceptance Criteria·Test Case를 먼저 확인/갱신하고 구현한다. 중요한 업무 규칙·구조 변경·데이터 손실 위험만 확인하며 세부 구현은 자율 판단한다.
3. Build, Type Check, Lint, 관련 자동 테스트, 필요한 E2E/수동 시험을 통과시킨다. 실패를 해결하기 전 다음 Unit으로 넘어가지 않는다. Unit 0A는 코드 없는 문서 검사만 적용한다.
4. 관련 상세 문서, 추적 관계(요구사항→구현→TC→결과), README를 갱신한다. DB Schema의 단일 기준 문서는 `out/Database.md`이다.
5. `git status`, `git diff`, staged diff와 Secret/산출물 포함 여부를 검토한다. 작업 요약 후 Conventional Commit(`feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`)을 작성한다.
6. `.env`가 지정한 remote만 사용한다. Push 전 remote 정합성·비밀정보·CAD·DB 제외를 재확인한다. Force Push, History Rewrite, 기존 Commit/Branch 삭제는 사용자 승인 없이 금지한다. 작성자 설정이 없으면 임의 신원을 만들지 않는다.
7. 앱 버전 기준은 `src/package.json`의 SemVer `0.x.y`이다. 기능 추가 MINOR, 호환 Bug Fix PATCH, 근본 변경은 사용자와 협의한다. README/ChangeLog를 일치시키고 테스트·커밋 후 의미 있는 Release에만 Tag를 검토한다.
8. Unit 완료 보고에는 변경·테스트·문제·설계/문서 변경·Commit·Push·버전·다음 Unit을 포함한다. 완료 조건이 부족하면 진행 중/보류로 표시한다.

## 상세 문서와 필수 참조 시점

| 문서 | 목적 | 반드시 참조하는 상황 |
| --- | --- | --- |
| [Requirements](out/Requirements.md) | 상세 기능/비기능 요구사항, 범위 | 기능 추가·수정·삭제 전 |
| [Architecture](out/Architecture.md) | 구조와 Component 책임 | 구조 변경, 신규 Module, Viewer 변경 시 |
| [Database](out/Database.md) | Schema 및 변경 이력 | Table/Column/Index/Constraint 변경 전후 |
| [TestPlan](out/TestPlan.md) | Unit, Acceptance Criteria, Test Case | 구현 Unit 시작 전 |
| [TestReport](out/TestReport.md) | 실제 테스트 및 Viewer 평가 | Unit 완료 및 Release 전 |
| [Operation](out/Operation.md) | 설정·Build·실행·장애 대응 | 환경 또는 실행 방법 변경 시 |
| [Decisions](out/Decisions.md) | 주요 판단, 승인 상태, Trade-off | 중요한 선택 또는 기존 결정 변경 시 |
| [ChangeLog](out/ChangeLog.md) | 버전별 변경사항 | Version 변경 또는 Release 시 |
| [Issue8](out/Issue8.md) | GitHub #8 요구사항·구현·CI 수용 근거 | Issue #8 변경 추적 또는 유사 목록 필터 변경 시 |
| [Issue9](out/Issue9.md) | GitHub #9 전역 로딩 요구사항·구현·CI·릴리스 근거 | 전역 로딩, 중복 요청 방지 또는 비동기 입력 차단 변경 시 |
| [Issue10](out/Issue10.md) | GitHub #10 전체 화면 요구사항·설계·CI 근거 | Viewer 전체 화면, ESC/종료, 컨테이너 resize 또는 view state 보존 변경 시 |
| [Issue38](out/Issue38.md) | Viewer 앱형 메뉴·도킹 셸/ESC 상태·후속 U2/U3/U6 계약 | Viewer shell·도킹·메뉴·검색/선택 ESC 변경 시 |
| [Issue39](out/Issue39.md) | Viewer 메뉴와 레이어 패널 표시 상태 독립/접근성·포커스·회귀 근거 | 레이어 메뉴·도크 접기/Renderer·fullscreen 레이어 UX 변경 시 |
| [FailureLedger](out/FailureLedger.md) | PR/Main CI 관측 실패·조치·재검증 누적 원장 | CI 실패·취소·재시작 시 |
| [Issue25](out/Issue25.md) | 기본 immersive 진입, native 수동 선택, 복귀·툴바·회귀 수용 | Viewer 전체 화면 기본 진입/링크/포커스/레이어·검색 변경 시 |
| [Release 0.20.0](out/Release-0.20.0.md) | 0.20.0 병합·태그·GHCR 게시 근거 | 0.20.0 릴리스 확인 및 운영 이미지 식별 시 |
| [Release 0.21.0](out/Release-0.21.0.md) | 0.21.0 병합·태그·GHCR 게시 근거 | 0.21.0 릴리스 확인 및 운영 이미지 식별 시 |
| [Issue31](out/Issue31.md) | DXF 다중 선택·볼록/정밀 외곽선·실험 상태·P4 권한 보류 | Viewer 선택·외곽선/Worker/JSON 변경 시 |
| [Issue26](out/Issue26.md) | DXF TEXT/MTEXT 색인·world 좌표 focus·검색 범위/검증 | Viewer 검색·Pan/Zoom·Worker·BLOCK/INSERT·DWG 텍스트 지원 검토 시 |
| [Issue28](out/Issue28.md) | 운영 이미지 경량화·Migration 분리·측정/롤백 | Dockerfile, Standalone, Compose, GHCR 변경 시 |
| [Issue24](out/Issue24.md) | 기준정보 계층·이관·층별 Current 요구/설계/AC | 기준정보·계층 등록·제품 조회·legacy 이관 변경 시 |
| [README](README.md) | 사용자/개발자 프로젝트 안내 | 기능·구조·설정·실행방법 변경 시 |

추가 Markdown 문서가 필요하면 이 표에 목적과 필수 참조 시점을 등록한다. 상세정보를 여러 문서에 독립적으로 복제하지 않는다.
