# CAD Web Viewer P.O.C.

### Issue #41 / PR #64 비영속 타입 시안 HTTP 접속·CI 교정

- 시안 URL `/lab/outline-types`는 `crypto.randomUUID`를 지원하지 않는 사내 `http://서버IP:3000` 브라우저에서도 `crypto.getRandomValues`를 사용해 임시 UUIDv4를 만듭니다. 브라우저 메모리 시안 외 영역에 저장하거나 관리자 권한으로 사용하지 않습니다. 암호학적 난수 API가 아예 없다면 안내 후 차단합니다.
- 최초 [PR CI 40153913566](https://github.com/planner77/layoutManager/actions/runs/40153913566)은 Chromium E2E 55건 PASS/1건 FAIL(Next route-announcer와 검증 안내의 `role=alert` Locator 중복). 테스트 선택 범위와 HTTP 호환 문제를 보완하여 PR CI 재검증을 시작합니다. 재검증 완료 전 PASS는 아님. 실제 관리자 저장 API/DB는 보안 승인이 있기 전까지 계속 차단합니다. [Issue41](out/Issue41.md)·[FailureLedger](out/FailureLedger.md).


## v0.34.0 — Issue #41 최상위 외곽선 업무 타입 관리 설계 시안 (운영 차단)

- 현재 상단 **외곽선 타입 관리** 메뉴는 관리자 인증·역할·scope·감사 정책 미승인으로 **비활성**입니다. 실제 등록·DB 영구 저장·공유 카탈로그 조회, 외곽선 typeId 지정 및 타입별 트리 기능은 제공하지 않습니다.
- 검토용 URL: `/lab/outline-types`. **운영 데이터가 아닌 브라우저 메모리 시안**에서 타입 추가·수정·비활성·복구와 이름 중복·정렬순서·수정 충돌 정책을 시험할 수 있습니다. 페이지를 새로고침하면 시안 항목이 모두 사라지고 원본 DXF/기존 Viewer/DB에는 변경이 없습니다.
- 업무 타입(공정/설비 등 사용자 분류)은 기하 알고리즘 `CONVEX`/`PRECISE`와 별개입니다. 이름 NFC 정규화·대소문자 무시 중복·inactive 이름 예약 정책은 **제안**이며 적용 Scope(전역 vs 사업부/제품/사업장)는 미확정입니다.
- 실제 Admin CRUD 개발에는 Owner의 IdP/세션, 역할·적용 범위, 감사 보존기간 승인과 서버측 권한 확인·DB migration·FK/경쟁 시험이 필요합니다. **Issue #41은 BLOCKED 유지**, [Issue41](out/Issue41.md)·[ADR-037](out/Decisions.md)·[TestPlan](out/TestPlan.md)를 참조하세요. 테스트 작성 결과를 CI PASS로 해석하지 마세요.


## v0.33.0 — Issue #40 외곽선 생성 상단 메뉴 ON/OFF

- DXF 도면을 **three-dxf-viewer**로 열면(원본 SHA-256 정보 정상·검증된 매핑 Entity 1개 이상) 상단 **외곽선 생성: OFF**가 사용 가능해집니다. 클릭 또는 Enter/Space로 **ON**하면 객체 선택 모드와 하단 외곽선 도구가 활성화됩니다. 클릭/다중 선택·영역 선택·볼록/정밀 미리보기·임시 확정 조작은 기존 #31과 같습니다.
- **OFF**는 진행 중 선택·비확정 Preview/Worker를 취소하고 Pan/Zoom으로 돌아갑니다. **임시 확정된 외곽선은 캔버스에 그대로 남으며 OFF에서도 JSON 내보내기**가 가능합니다. ON/OFF만으로 Canvas·레이어/Zoom·원본 요청을 재시작하지 않습니다.
- `dxf-viewer`/DWG·빈/오류/로딩·검증된 매핑 0건·SHA 누락 시 메뉴는 비활성/사유 안내입니다. Renderer 전환/재로드/Version 변경 시 임시 메모리 결과는 기존 정책대로 초기화됩니다. 생성 도구 상태와 결과 Overlay 표시 여부는 별개이며, 타입 관리(#41/#42)·트리(#43)·영구 저장(#31 P4)은 **구현되지 않았습니다**.
- 버전 `0.33.0`은 Viewer UI 추가 변경입니다. DB/API/도면 원본 변경 없음. [Issue40](out/Issue40.md)·[TestPlan](out/TestPlan.md)·[TestReport](out/TestReport.md)에서 검증 상태 확인; PR CI 및 실제 DXF/네이티브 Fullscreen 증거 확보 전 PASS 판단하지 않습니다.


### #40 / PR #48 실패 보완 안내 (2026-10-25)

- 첫 CI [Run 40149077671](https://github.com/planner77/layoutManager/actions/runs/40149077671)은 TypeScript/Docker만 성공, **ESLint `react-hooks/refs` 실패**로 Unit/Build/E2E가 **건너뛰어졌습니다**. 수정 코드의 검증 결과는 신규 CI가 종료되기 전 확정하지 않습니다.
- 상단 **외곽선 생성** 버튼은 키보드 `Enter`뿐 아니라 `Space`로 **ON↔OFF**를 전환하도록 보완했습니다. Space를 누른 채 캔버스를 드래그하면 기존 일시 Pan이 유지됩니다. 자세한 기록: [Issue40](out/Issue40.md)·[FailureLedger](out/FailureLedger.md).

## v0.32.0 — Issue #39 전체 화면 레이어 패널 표시·숨김

- **지원 환경**: DXF의 `three-dxf-viewer`가 정상적으로 1개 이상 레이어를 읽었을 때 전체 화면 상단 **레이어** 버튼으로 좌측 패널을 표시/숨긴다. 첫 진입은 열림 상태이며 패널 내부 **레이어 패널 접기**와 동일 상태를 사용한다.
- **패널 표시 vs 실제 레이어**: 체크박스/전체 선택·전체 해제는 CAD 도면의 레이어 ON/OFF이고, 상단 메뉴/접기는 **패널만** 숨긴다. 닫았다 열면 체크 상태, 확대/이동 및 현재 Canvas가 유지된다. 내부 접기 후 포커스는 상단 버튼으로 돌아가 키보드 Enter/Space 재열기가 가능하다.
- **호환성**: 일반 화면은 기존 레이어 선택 드롭다운을 유지. `dxf-viewer`·DWG·빈 도면/로딩/오류에서는 레이어 메뉴가 비활성화된다. 작은 화면에서는 패널과 Canvas가 겹치지 않는 도킹 레이아웃. Browser native fullscreen은 명시 클릭에서만 동작.
- 버전 0.32.0은 **UI 개선**이며 도면/DB/API/Renderer/원본 파일의 형식을 변경하지 않는다. 실행 검증 결과는 [Issue39](out/Issue39.md)·[TestPlan](out/TestPlan.md)·[TestReport](out/TestReport.md)를 참조한다. PR CI/실기기 증거 확인 전 수용 완료를 주장하지 않는다.

## v0.31.0 — Issue #45 현재 도면만 목록에 표시

- **CAD 도면 목록(`/`)**은 최초 진입·검색·페이지 이동·새로고침에서 해당 위치에 `Current`로 지정된 Version만 표시합니다. `현재 버전만 표시` 토글은 없어졌으며, 과거의 `/?current=false` 링크로 진입해도 이전 버전이 목록에 다시 나타나지 않습니다.
- **이전 버전/Current 미지정 도면 관리**: 목록 상단의 **위치별 버전 관리** 또는 상단 **기준정보** → 사업부 → 제품 → 사업장/법인 → 동 → 층 → **버전 이력**. Location 상세에서 이전 버전·원본·직접 Viewer 링크를 확인하고 **Current 지정**을 사용할 수 있습니다. 현재 지정이 없는 층도 이 경로로 접근할 수 있으며, 등록/삭제가 자동으로 이전 버전을 Current로 승격시키지 않습니다.
- 파일명·도면 설명·위치·DXF/DWG 검색/정렬·페이지네이션은 유지합니다. 외부 `GET /api/cad-files` API의 `current=false` 이력 조회는 그대로 지원합니다. DB schema 및 파일 저장 구조는 변경되지 않습니다.
- 개발/검증 추적: [Issue #45](out/Issue45.md), [ADR-034](out/Decisions.md), [TestPlan](out/TestPlan.md). PR CI의 실제 결과는 확인 전까지 통과로 간주하지 않습니다.


## v0.30.0 — Issue #38 앱형 CAD Viewer 메뉴·도킹 셸 (검증 전)

- 도면 링크·목록·새로고침은 기존과 동일한 CSS immersive 모드에서 시작하며, 앱 메뉴바/기존 조작 툴바/중앙 CAD Canvas/좌측 레이어 도크/하단 외곽선 도구/상태 표시로 구성된다. Native fullscreen은 명시 클릭할 때만 요청한다.
- `three-dxf-viewer` DXF에서 상단 **레이어** 메뉴로 패널을 표시·숨길 수 있으며 레이어별 체크·전체 선택/해제는 기존처럼 동작한다. 패널을 닫아도 실제 레이어 표시 설정 및 확대·이동 상태는 보존한다. 일반 화면에서는 기존 레이어 드롭다운을 유지한다.
- `dxf-viewer` 및 DWG는 동일한 셸을 사용하지만 미지원 레이어/외곽선 기능을 지원한다고 표시하지 않는다. 외곽선 생성 ON/OFF(#40), 타입 관리(#41), 트리(#43)는 미구현 메뉴로 비활성 표시하며, 기존 #31 임시 객체 선택/외곽선/JSON은 하단 도구 도크에서 제공한다. 타입 관리/서버 저장은 RBAC 승인 전 금지.
- 좁은 화면은 중앙 Canvas와 패널을 겹치지 않는 flex 레이아웃으로 배치한다. 검색 ESC는 패널부터 닫고, 선택 중 ESC는 선택 해제부터 처리한다. 이후 native/CSS fullscreen 순서로 처리한다.
- 소스/수용 기준·보안 제한·시험 계약: [Issue38](out/Issue38.md), [Architecture](out/Architecture.md), [TestPlan](out/TestPlan.md), [TestReport](out/TestReport.md). 이 변경의 CI/실도면 시험은 실행 근거 확인 전 **NOT RUN**이다.


## v0.29.0 — Issue #25 도면 열기 시 기본 전체 화면

목록의 **도면 보기**, Location/Version 상세와 링크 복사·새 탭·직접 URL·새로고침은 별도 클릭 없이 **화면의 뷰포트 전체를 사용하는 Viewer**로 시작합니다. 파일명/Version/위치, Renderer 변경(DXF 2종, DWG 1종), 확대·축소·맞춤, #17 레이어, #26 텍스트 검색, #31 외곽선(지원 Viewer), 원본 다운로드/링크 복사, 오류·재시도, **전체 화면 종료**·**← 버전 목록**을 화면 안에서 사용합니다.

이는 브라우저 주소 표시줄까지 숨기는 native fullscreen이 **아닙니다**. 별도의 **브라우저 전체 화면** 버튼을 직접 누르면 Fullscreen API를 시도하고, 거부되어도 CSS 전체 뷰포트 상태는 유지됩니다. ESC는 native에서 native만 먼저 해제하고, CSS 모드에서는 일반 Viewer로 돌아옵니다. 일반 Viewer의 **전체 화면** 버튼으로 다시 들어갈 수 있습니다. 관련 요구·구현·시험은 [Issue25](out/Issue25.md)를 참조하세요. 이 변경의 PR CI 및 현장 수용 결과는 별도 확인 전까지 미확정입니다.



### v0.28.3 Private acceptance selection gate

실DXF 브라우저 수용 명령은 기본적으로 모든 반복에서 실제 선택 가능한 Source Entity가 **1개 이상**이어야 성공하며, 필요 시 `CAD_OUTLINE_ACCEPTANCE_MIN_SELECTED=10` 등으로 문턱값을 지정할 수 있습니다. 운영자가 확정한 실제 DXF SHA와 기준 CAD 치수/면적을 검증한 뒤에만 완전한 수용으로 기록하세요.


## Issue #31 v0.28.3 — 후속 DXF 정확도·성능 수용 도구

- P0 안전성: 지원되지 않는 BLOCK 자식이 일부라도 포함되면 INSERT의 Source ID를 stable로 인정하지 않아 잘못된 부분 외곽선의 영구 참조를 방지한다. 대형 CIRCLE/ARC에서 512 포인트로 허용 오차를 만족할 수 없으면 계산을 거부한다.
- P4 사전 검증: `src/server/outline/attestation.ts`는 저장 전 Server-owned DXF 원본 bytes와 SHA/Version/Handle을 검증하고 canonical Convex/Precise 경계를 재계산한 뒤 Client Polygon과 비교하는 순수 함수. **DB/쓰기 API 및 인증 기능은 아직 없으며**, Owner가 OIDC 또는 로컬 세션/RBAC·Site Scope 정책을 승인한 뒤에만 연결한다.
- PR CI: `npm run test:outline-benchmark`는 1k/10k/100k synthetic Source CPU 측정. 실제 설비 DXF를 Git에 올리지 않는다.
- 폐쇄망 실제 도면 브라우저 테스트: `cd src && npm ci && npm run build && CAD_OUTLINE_ACCEPTANCE_DXF=/private/sample.dxf CAD_OUTLINE_ACCEPTANCE_EXPECTED_SHA256=<SHA256> CAD_OUTLINE_ACCEPTANCE_REPORT_PATH=/private/report.json npm run test:outline-acceptance`. 5회 브라우저 Load·선택·매핑 제외·인덱스 시간/JS Heap 및 오류를 사내 JSON에만 기록한다. 기존 `npm run audit:outline -- --file /private/sample.dxf` Source-only 분석과 상보적이다.
- 실제 CAD 3종 이상/기하 기준 값·브라우저 GPU 측정·인가 정책이 제공되지 않아 Issue #31 최종 운영 수용/종료는 불가. [Issue31](out/Issue31.md), [Operation](out/Operation.md), [TestPlan](out/TestPlan.md).


## DXF 정밀 외곽선 v0.28.2 — Worker 호환성 및 사내 시험

- v0.28.1 GHCR은 게시됐으나 Webpack ESM `polygon-clipping` named-import 경고가 있었다. v0.28.2는 default export로 수정하고 Next Production Build에서 미해결 import/export 경고를 하드 실패 처리한다. Browser E2E에서 실제 Worker 연산 결과를 JSON으로 확인한다.
- 합성 P5 점검: `cd src && npm run test:outline-benchmark -- --quick` (1k, PR CI 포함), `npm run test:outline-benchmark` (1k/10k/100k, 선택 실행).
- 실도면 P0/P5 소스 점검: 사내 승인된 PC·폐쇄망에서 `cd src && npm ci && npm run audit:outline -- --file /private/sample.dxf`. UTF-8 ASCII DXF 100MiB 이하, 읽기 전용. JSON은 SHA/단위/Entity·안정 Handle·경고 분류/CPU p50·p95·heap/RSS 통계를 담고 **경로·원본·레이어 이름을 출력하지 않는다**. 실제 Renderer↔Source 매핑 및 GPU/Browser Acceptance는 별도.
- P4 서버 영구 저장 API/Schema 변경은 인증·인가 Owner 승인 전 계속 보류. 상세 [Issue31](out/Issue31.md), [TestPlan](out/TestPlan.md).


## Issue #31 성능·정확도 진단 (0.28.1 브랜치 / 검증 전)

- `three-dxf-viewer`는 Source top-level Entity의 Handle/Type/Layer/WCS XY Box를 실제 Three Object와 대조하고, 불일치 객체는 선택에서 제외합니다. Viewer `렌더 관측 / 매핑 제외 / 원본 인덱스·렌더 대조·공간 인덱스 ms`로 상태를 확인합니다.
- Synthetic 벤치마크: `cd src && npm ci && npm run test:outline-benchmark` (LINE 1,000 / 10,000 / 100,000개, JSON stdout), 빠른 테스트 `npm run test:outline-benchmark -- --quick` (1,000개). 이 값은 브라우저 GPU/실제 현장 CAD SLA가 아닙니다. 운영 DXF/DB 원본은 Git에 등록하지 마세요.
- P4의 버전/SHA/EntityRef JSON validator는 안전한 사전 준비일 뿐 서버 쓰기·DB migration이 아닙니다. RBAC 및 인증 정책 Owner 결정 전 CRUD를 배포하지 않습니다. 상세 [Issue31](out/Issue31.md), [Database](out/Database.md).



## 0.28.0 신규 기능 — 도면 내부 텍스트 검색 (#26)

열린 DXF Viewer의 검은 화면 오른쪽에서 **도면 내 텍스트 검색**을 펼치면 현재 도면의 TEXT/MTEXT 값을 검색할 수 있습니다. 한글·영문·숫자 부분 일치, 공백/MTEXT 개행, 검색 결과 목록과 이전/다음 및 클릭 위치 Pan/Zoom을 제공합니다. dxf-viewer와 three-dxf-viewer 모두 사용하며 일반/전체 화면 Viewer에서 검색할 수 있도록 패널을 도면 shell 안에 배치했습니다. **기존 도면 파일명·설명 검색과 별개**입니다.

검색 시 필요할 때만 원본 DXF의 브라우저 Worker 인덱스를 만듭니다. BLOCK/INSERT 기본 2D 좌표를 지원하지만 ATTRIB·ATTDEF·비기본 OCS·배열 INSERT 등은 제외됩니다. 검색 위치는 글꼴 bbox가 아니라 삽입점을 기준으로 하는 근사 범위입니다. 20,000개 텍스트 상한, 페이지당 100개 표시이며 숨겨진 레이어의 텍스트는 결과에서 제외하고 사용자의 레이어 설정을 바꾸지 않습니다. DWG는 현재 LINE 표시만 지원하므로 **DWG 내부 텍스트 검색은 지원하지 않습니다**. 제약/AC/테스트 상태는 [Issue26](out/Issue26.md)에 명시되어 있습니다. #25의 자동 전체 화면 시작은 별도 이슈입니다.



## DXF 복수 객체 선택·외곽선 실험 기능 (#31, 0.27.0 브랜치/CI 전)

DXF 도면을 `three-dxf-viewer`로 열고 도구의 **선택 모드**로 전환하면 클릭·Ctrl/⌘+클릭·양방향 영역 선택 후 **볼록/정밀 외곽선**을 각각 미리보기할 수 있습니다. 임시 확정 결과는 JSON으로 내보낼 수 있으나 **서버 저장·재진입 복원은 지원하지 않습니다**. 지원 Entity·오차·WCS/Handle 규칙과 미지원 BLOCK/OCS/HATCH·실도면 검증 상태는 [Issue31](out/Issue31.md) 참조. 기존 0.26.0 운영 배포 설명은 아래에 보존하며 0.27.0 GHCR 게시/운영 수용을 의미하지 않습니다.


## Docker 0.26.0 빠른 배포 안내 (#28)

- 신규/로컬 설치: `bash src/scripts/compose.sh .env build` 후 `bash src/scripts/compose.sh .env up -d`. 기존의 `docker compose --env-file .env -f src/docker-compose.yml ...`도 **태그가 명시된 이미지**에서는 사용할 수 있다. Helper는 기존 `.env`를 `source`하지 않고 이미지 참조 키만 읽는다.
- GHCR `GHCR_IMAGE=ghcr.io/planner77/layoutmanager:0.26.0`은 `:0.26.0-migrate`와 쌍으로 배포한다. **태그 없는** `GHCR_IMAGE=ghcr.io/planner77/layoutmanager`는 helper 사용 시 app `:latest`/migrator `:latest-migrate`로 정규화된다. 기존 raw Compose 사용 시에는 `GHCR_MIGRATION_IMAGE`를 명시해야 한다. digest pin은 두 이미지를 각각 명시적으로 고정한다.
- 릴리스 CI는 앱/마이그레이터의 immutable candidate digest를 **둘 다 빌드·검증한 뒤** 공개 `:version`/`:latest` 태그를 승격한다. 다중 태그의 완전 원자성은 제공되지 않으므로 운영 배포는 반드시 같은 버전의 두 이미지를 명시적으로 지정한다.
- **업그레이드는 기존 app stop 후 migration 재실행이 필수이다.** 데이터 백업/pull/중지/migrate exit0/app 시작/rollback 명령은 [Operation](out/Operation.md), 3단계 이미지 측정 및 테스트 상태는 [Issue28](out/Issue28.md)·[TestReport](out/TestReport.md) 참조. 최초 CI 크기 측정은 2,054,848,814 → 376,228,092 bytes(81.69% 절감); 최종 PR CI/GHCR 검증 결과는 별도 판정한다.


현재 제안 소스 버전은 0.28.0입니다. Docker는 Next.js standalone 웹과 별도 일회성 Prisma migration/backfill 이미지로 분리합니다. 0.25.0의 DB 계층 기능은 유지합니다. 사업부 → 제품 → 사업장/법인 → 동 → 층의 기준정보를 관리하고 활성 ID 계층을 선택해 도면을 등록합니다. 기존 도면은 사업부별 `미분류` 제품으로 이관하며 층 상세에서 전체 이력을 실제 제품 계층으로 재분류할 수 있습니다. 게시·배포 검증 결과는 [TestReport](out/TestReport.md)와 버전별 Release 문서를 기준으로 합니다.

공장·설비의 DXF/DWG 도면을 등록·검색·버전 관리하고, 세 오픈소스 기술의 브라우저 렌더링 적용 가능성을 평가하는 프로젝트입니다.

`/masters`에서 기준정보를 관리한 뒤 `/cad/upload`의 다섯 연동 선택 항목으로 도면을 등록합니다. 제품은 목록·상세·Viewer에 별도로 표시하며 기본 도면 이름 `[사업부][사업장][동][층]_V번호`는 유지합니다.

`/cad/upload`에서 DXF/DWG를 등록하면 `/` 목록에서 즉시 확인할 수 있습니다. ‘도면 이름’을 직접 입력하거나 비워두면 `[사업부][사업장][동][층]_V번호`를 기본 이름으로 사용합니다. 버전 번호는 등록할 때 확정되며 기존 도면도 기본 이름으로 표시합니다. 원본 파일명은 별도로 보존합니다. ‘도면 설명’에 여러 줄 메모를 입력하고 설명으로 검색할 수 있습니다. 선택한 파일이 현재 설정의 최대 MiB를 초과하면 전송 전에 안내하며 서버에서도 최종 크기 검증을 수행합니다. 실패 시 안전한 진단 상세를 복사하거나 JSON으로 저장하고 서버 요청 ID로 순환 로그를 검색할 수 있습니다. 위치별 상세에서 버전과 Current를 관리합니다. 실제 버전 기준은 `src/package.json`입니다. DXF Viewer 두 방식과 등록 DWG 조회를 지원하며 `/lab/dwg` 독립 실험도 유지합니다.

## 목표 기능

- DXF/DWG 업로드, 사업부·제품·사업장/법인·동·층 ID chain·등록일·도면 설명 입력, SHA-256 식별.
- 내부 ID의 층(CadLocation)별로 Current Version을 **최대 하나** 유지.
- 도면 목록·파일명/도면 설명 검색·위치/형식/Current 필터, Location별 Version 선택.
- DXF Viewer 두 방식 전환, DWG 전용 경로, 오류·부분 지원·성능 계측.
- 실도면 Entity 충실도·대형 파일·사용성 비교와 재현 가능한 테스트/문서.

현재 지원: 파일 등록·메타데이터 검증·SHA-256·원본 조회·목록·검색·페이지 이동·Location 상세·Current 변경. 파일명은 대소문자를 구분하는 부분 일치, 위치 네 항목은 정확히 일치하는 조건으로 검색합니다. DXF 행의 **도면 보기**에서 dxf-viewer를 실행합니다. 확대·축소·드래그 이동·화면 맞춤·Resize·다시 불러오기를 지원합니다. Viewer 버튼으로 dxf-viewer와 three-dxf-viewer를 새로고침 없이 전환합니다. three-dxf-viewer에서는 레이어 드롭다운으로 여러 레이어를 선택하거나 전체 선택·전체 해제할 수 있습니다. 선택은 현재 Viewer에서 유지되며 재로드·Viewer 전환 시 전체 선택으로 초기화됩니다. Viewer는 기본적으로 **CSS 전체 화면**으로 열리고 일반 모드로 나갔다가 다시 확대할 수 있으며 전체 화면에서도 확대·축소·화면 맞춤·이동을 사용할 수 있습니다. 표준 Fullscreen API가 제한되면 viewport fixed fallback을 사용하며 `Escape` 또는 **전체 화면 종료**로 복귀합니다. 전체 화면 전환 자체로 Viewer를 다시 생성하지 않아 현재 view state를 불필요하게 초기화하지 않습니다. 같은 Version의 원본 다운로드를 재사용합니다. DWG는 libredwg-web과 자체 LINE 렌더러로 표시합니다.

직접 링크는 목록·Location의 특정 Version 또는 Viewer에서 `링크 복사`를 선택해 사용합니다. Clipboard 권한이 없으면 표시된 URL을 직접 복사하거나 `도면 열기`를 선택합니다. 링크는 현재 origin의 Version 주소이므로 Current 교체 후에도 해당 Version을 열지만, `localhost`/`127.0.0.1`은 링크를 여는 장치 자체를 뜻하고 사설 IP는 같은 네트워크/VPN과 listener·방화벽이 필요합니다.

## 지원 형식과 Viewer 구성 계획

| 형식 | Viewer | 구성 |
| --- | --- | --- |
| DXF | dxf-viewer 1.0.48 | 전용 Adapter/Worker, 기본 도형 WebGL 검증 |
| DXF | three-dxf-viewer 1.0.44 | 별도 Three.js 0.171 scene, 기본 탐색 및 Layer 표시/숨김 |
| DWG | @mlightcad/libredwg-web 0.7.10 | 전용 Worker/WASM 파싱 후 자체 평면 LINE 렌더링; 부분 지원 |

`libredwg-web`은 파서이므로 직접 렌더링 계층이 필요합니다. DWG→DXF 변환은 범위에 포함하지 않습니다. 출처·실제 조사 버전·API 검증 과제는 [Architecture](out/Architecture.md), 선택 근거는 [Decisions](out/Decisions.md)를 참조하세요. 두 DXF 라이브러리와 libredwg-web을 고정 설치했습니다. 기본 도형과 한글 시험 결과는 TestReport에서 확인합니다.

## 기술 Stack와 구조

Next.js App Router, React, TypeScript, shadcn/ui, Tailwind CSS와 Next Route Handler→Application Service→Repository/Prisma→SQLite 및 Local Filesystem 또는 S3 호환 오브젝트 스토리지를 사용합니다. Viewer는 UI→Manager→Adapter→각 라이브러리로 분리했습니다. 설치 버전은 package/lock에 고정합니다.

```text
AGENTS.md          # 에이전트 개발 진입 규칙
README.md          # 프로젝트·실행 안내
.env               # 실제 로컬 설정, Git 제외
.env.example       # 변수명과 설명
.gitignore
src/               # 실행 가능한 앱·설정·테스트·migration
out/               # 요구·설계·테스트·운영 Markdown
data/              # DB/CAD 런타임 저장, Git 제외
```

## 사전 요구사항·환경설정

Node.js/npm/Git, 영속 local disk, 데스크톱 Browser를 사용합니다. 검증 환경은 Node 22.14.0/npm 11.10.0/Git 2.43.0입니다. Viewer에는 WebGL/WASM이 필요합니다. Docker는 격리 S3 시험 실행 시 필요합니다.

Root `.env`가 이미 있으면 보존합니다. 새 checkout에 없을 때만 `.env.example`을 기반으로 생성하고 실제 값은 로컬에서 입력합니다. 기존 Git 변수명 `remote_repo_url`, `remote_repo_token`을 유지합니다. 앱 설정은 `DATABASE_URL`, `CAD_STORAGE_PATH`, `MAX_UPLOAD_SIZE_MB`를 사용하며 상세/기본값/안전한 로딩은 [Operation](out/Operation.md)에 있습니다. Secret을 NEXT_PUBLIC_* 변수로 넣지 않습니다.

GitHub remote는 `.env`의 지정 저장소만 사용합니다. 기존 `origin`과 설정의 일치 및 인증을 확인했습니다. 작업 branch는 `main`입니다. 새 checkout은 지정 저장소를 clone하고, 기존 workspace는 설정과 remote 일치를 먼저 확인합니다. Token을 remote URL에 포함하지 않습니다. Commit/Push 결과는 [TestReport](out/TestReport.md)에 기록합니다.

## 설치·DB 초기화·실행·테스트

아래 명령은 Root에서 실행합니다. 먼저 설치→DB Client 생성→Migration 적용을 수행합니다. E2E는 Production Build 후 실행하며 운영 DB와 분리된 임시 DB/Storage를 사용합니다. Chromium 설치가 필요하면 `cd src` 후 `npx playwright install chromium`을 실행합니다.

| 작업 | 명령 |
| --- | --- |
| 설치 | `npm --prefix src ci` |
| DB Client 생성 | `npm --prefix src run db:generate` |
| DB 초기화/검토된 Migration 적용 | `npm --prefix src run db:deploy` |
| 개발 실행 | `npm --prefix src run dev` |
| Production Build | `npm --prefix src run build` |
| Production 실행 | `npm --prefix src run start` |
| Type Check / Lint | `npm --prefix src run typecheck` / `npm --prefix src run lint` |
| 자동 테스트 / E2E | `npm --prefix src test` / `npm --prefix src run test:e2e` |

기본 포트는 3000이며 `npm --prefix src run start -- --port 3100`으로 변경할 수 있습니다. 목록은 `/`, 등록은 `/cad/upload`, 위치 상세는 `/cad/locations/{locationId}`입니다. 새 Build 적용 시 서버를 재시작합니다. DB·업로드 파일 백업/복구 및 장애 대응은 [Operation](out/Operation.md), 실제 검증 결과는 [TestReport](out/TestReport.md)에서 확인합니다.

## 처음 설치하고 실행하기

모든 명령은 프로젝트 Root에서 실행합니다. Node.js 22.14 이상 23 미만을 사용합니다.

1. `.env`가 **없는 경우에만** `.env.example`을 복사해 `.env`를 만듭니다. 기존 파일이 있으면 필요한 변수만 추가합니다. 실제 인증정보는 로컬 편집기로 입력하고 커밋하지 않습니다.
2. 로컬 저장소로 시작하려면 `CAD_STORAGE_BACKEND=local`을 사용합니다. `DATABASE_URL`과 `CAD_STORAGE_PATH`가 비어 있으면 각각 Root의 `data/db/cad.sqlite`, `data/cad`를 사용합니다. 업로드 기본 한도는 100 MiB입니다. 해당 디렉터리에 서버 계정의 쓰기 권한이 필요합니다.
3. 의존성을 설치하고 DB를 준비합니다. `db:deploy`는 저장된 Migration을 적용하며 DB 삭제/초기화 명령이 아닙니다.

```bash
npm --prefix src ci
npm --prefix src run db:generate
npm --prefix src run db:deploy
npm --prefix src run db:check
```

4. 개발 서버를 실행합니다.

```bash
npm --prefix src run dev
```

브라우저에서 `http://127.0.0.1:3000`에 접속해 **파일 등록 → 메타데이터 입력 → 등록 → 목록 → 도면 보기**를 확인합니다. DXF는 두 Viewer를 전환할 수 있습니다. DWG는 아래에 명시한 부분 지원 범위를 적용합니다. 서버 종료는 실행 터미널에서 Ctrl+C입니다.

### Production 실행

같은 작업 폴더의 기존 dev/start 프로세스를 종료한 뒤 Build하고 시작합니다.

```bash
npm --prefix src run build
npm --prefix src run start -- --port 3100
```

접속 주소는 `http://127.0.0.1:3100`이며 같은 네트워크에서 접근 가능한 서버는 `http://<서버 IP>:3100`으로도 접속합니다. 기본 수신은 `0.0.0.0`입니다. Build/dev 과정에서 글꼴 JSON과 LibreDWG ESM/WASM 자산을 준비합니다. 배포 시 생성된 `src/public` 자산도 유지해야 합니다. `.env` 변경 후에는 서버를 재시작합니다. SQLite·CAD 데이터는 Build와 별도로 영속 보관합니다.

### 설치 후 검증

```bash
npm --prefix src run typecheck
npm --prefix src run lint
npm --prefix src test
```

브라우저 E2E는 Chromium 설치 및 Production Build 후 실행합니다. Chromium은 `src/`에서 `npx playwright install chromium`으로 설치하고, Root로 돌아와 `npm --prefix src run test:e2e`를 실행합니다. 기존 Chromium 사용 시 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`에 실행 파일 경로를 지정할 수 있습니다. 테스트 결과와 미검증 범위는 [TestReport](out/TestReport.md)를 참조하세요.

## 도면 설명

등록 화면에서 Version별 설명을 입력할 수 있습니다. 설명은 최대 2,000자이며 앞뒤 공백과 개행을 정리해 저장합니다. 목록의 설명 검색은 파일명·위치·형식·Current 조건과 함께 사용할 수 있고, `%`, `_`, 따옴표는 일반 문자로 검색됩니다. 설명은 목록·Location 상세·Viewer에서 일반 텍스트로 표시됩니다.

## 미지원 범위·알려진 제약

CAD 편집/Geometry 변경/저장, DWG→DXF 우회, 별도 검색 엔진·Backend 플랫폼, 사용자/권한 시스템과 공개 운영은 이번 범위에 없습니다. dxf-viewer의 LINE/CIRCLE은 Chromium에서 검증했습니다. 한글 기본 글꼴을 로컬에 포함했습니다. 원본 글꼴과 동일한 모양을 보장하지 않으며 잘못된 문자 인코딩은 별도 문제입니다. 합성 LINE 성능은 U8A에서 측정했습니다. 실도면·10 MiB 초과 파일·다른 Browser·복잡한 Entity 충실도는 미검증이며 업무 성능 목표도 제공되지 않았습니다. `libredwg-web` 경로는 현재 평면 LINE 최소 실험이며 CIRCLE/BLOCK/TEXT 등 업무 도면 렌더링은 후속 구현입니다. 상세 Known Issue와 시험 상태는 [TestReport](out/TestReport.md)를 기준으로 합니다.

## 상세 문서

| 문서 | 내용 |
| --- | --- |
| [AGENTS](AGENTS.md) | 개발/운영 핵심 규칙과 문서 참조 시점 |
| [Requirements](out/Requirements.md) | 요구 ID, 범위, Acceptance Criteria, 추적 |
| [Architecture](out/Architecture.md) | 시스템·API·Viewer·실패 처리 초안 |
| [Database](out/Database.md) | DB Schema의 단일 기준 |
| [TestPlan](out/TestPlan.md) | 구현 Unit, 순서, 테스트 기준 |
| [TestReport](out/TestReport.md) | 실제 검증 결과와 Viewer 평가 |
| [Operation](out/Operation.md) | 설정·명령·Git·복구·장애 대응 |
| [Decisions](out/Decisions.md) | 주요 판단·제안·확인 대기 |
| [ChangeLog](out/ChangeLog.md) | 변경 및 버전 이력 |
| [Issue10](out/Issue10.md) | GitHub #10 전체 화면 요구사항·설계·CI 추적 |
| [Release 0.21.0](out/Release-0.21.0.md) | 0.21.0 병합·태그·GHCR 게시 근거 |

Unit 9A DXF 통합·회귀, Unit 7B 등록 DWG Viewer, Unit 8B DWG 계측을 완료했습니다. Unit OBS에서 업로드 오류의 화면 진단과 요청 ID 기반 서버 로그를 연결했습니다. GitHub #9 전역 로딩 차단을 0.20.0에서 반영했고, GitHub #10 전체 화면 기능은 0.21.0에서 추적합니다. 등록 메모 요청(원격 이슈 #2)은 기존 도면 설명의 등록·저장·표시 검증으로, 파일 크기 사전 검증(#3)은 0.17.1 조치로 추적합니다. 승인된 범위에서는 Unit별 구현→테스트→문서→Commit→필요 시 Push를 반복합니다.

## 2026-09-07 실행 순서 변경

사용자가 계획 실행을 승인했다. DXF 두 Viewer와 공통 관리 기능·계측·회귀를 먼저 구현하고, libredwg-web은 그 다음 MINOR 버전으로 진행한다. DWG 선행 실험은 DXF 구현의 조건에서 제외한다. 최신 단계/승인 상태는 Decisions의 ADR-011과 TestPlan을 따른다. 기존 미실행 기록은 당시 상태이며 실제 완료 후 갱신한다.

## 글꼴 제공

`src/public/fonts/NanumGothic-Regular.ttf`와 OFL 라이선스를 포함합니다. dxf-viewer는 TTF를 직접 읽고, three-dxf-viewer는 build/dev가 생성하는 `CadKorean.typeface.json`을 읽습니다. 생성 JSON은 Git 제외이며 배포 시 public/fonts에 포함해야 합니다. 앱 실행 중 외부 font CDN을 사용하지 않습니다. 파일 출처·hash·변환 및 교체 방법은 Operation을 참조하세요.

## Viewer 측정

도면 아래에서 전체 시간·도면 처리·첫 화면 관찰·원본 재사용 여부를 확인하고 **측정 JSON 저장**으로 결과를 내려받습니다. 순수 파싱 시간은 미계측이며 도면 처리에는 파싱/준비/글꼴/렌더링이 포함됩니다. 표시 완료는 모든 CAD Entity의 충실도 보증을 의미하지 않습니다.

Production Build 후 `npm --prefix src run test:benchmark`로 생성 LINE 100/10,000/100,000개를 두 Viewer에서 cold/warm 각 5회 실행합니다. 기존 E2E와 같은 Chromium 설정을 사용하며 결과는 Git 제외 `src/benchmark-results/measurements.jsonl`에 저장됩니다. 측정 정의·실행 조건과 실제 값은 TestPlan/TestReport를 참조하세요. 실도면·전용 성능 장비의 시험을 대체하지 않습니다.

## DWG 기술 실험

`/lab/dwg`에서 20 MiB 이하의 로컬 DWG를 선택합니다. 서버에 등록하지 않고 WASM으로 읽어 평면 LINE만 직접 표시합니다. 제외 Entity 수와 파싱·해제 결과를 확인할 수 있습니다. 라이브러리 자체가 완성형 Viewer라는 의미는 아닙니다.

Build/dev는 고정 npm 배포본의 ESM/WASM을 `public/libredwg`에 준비합니다. Production에는 이 생성 자산도 필요합니다. 공식 샘플 준비는 `npm --prefix src run prepare:dwg-samples`, Browser 검증은 `npm --prefix src run test:dwg`입니다. Chromium 설정·샘플 출처·해시·GPL-3.0 표기와 메모리 제약은 Operation/Architecture/TestReport를 참조하세요.

## 등록 DWG 지원 범위

DWG 등록 후 목록/Location의 **도면 보기**로 엽니다. libredwg-web만 사용하며 확대·축소·이동·화면 맞춤·재시도를 제공합니다. 현재 처리 한도는 20 MiB, 도형은 평면 LINE입니다. TEXT/BLOCK/CIRCLE 등은 제외 건수로 안내하고 측정 결과에 partial을 기록합니다. 복잡한 실도면 전체 지원을 뜻하지 않습니다.

## S3 호환 저장소 (SeaweedFS 등)

### SeaweedFS / 기존 S3 서비스 연결

1. 접근 가능한 S3 gateway와 **미리 생성한 private bucket**을 준비합니다. 앱 계정에는 해당 bucket의 PutObject/GetObject/DeleteObject 권한이 필요합니다. 앱에서 SeaweedFS 서버나 bucket을 자동 생성하지 않습니다.
2. Root `.env`에 아래 설정을 추가합니다. endpoint는 앱 서버에서 접근 가능한 주소로, bucket은 실제 생성한 이름으로 바꾸고 두 인증정보를 입력합니다. 아래 주소와 bucket 이름은 예시이며 인증정보는 의도적으로 비워 두었습니다.

```dotenv
CAD_STORAGE_BACKEND=s3
CAD_S3_ENDPOINT=http://127.0.0.1:8333
CAD_S3_BUCKET=cad-drawings
CAD_S3_REGION=us-east-1
CAD_S3_ACCESS_KEY_ID=
CAD_S3_SECRET_ACCESS_KEY=
CAD_S3_SESSION_TOKEN=
CAD_S3_FORCE_PATH_STYLE=true
CAD_S3_TIMEOUT_MS=60000
```

endpoint에는 경로·query·인증정보를 넣지 않습니다. 앱이 컨테이너나 다른 호스트에 있으면 `127.0.0.1` 대신 해당 앱에서 접근 가능한 gateway 주소를 사용합니다. 임시 자격증명을 사용할 때만 session token을 채웁니다.

3. 최초 설치라면 위 설치/DB 준비 절차를 수행합니다. 기존 서버를 종료하고 `npm --prefix src run build` 후 `npm --prefix src run start -- --port 3100`으로 시작합니다.
4. `/cad/upload`에서 새 도면을 등록하고 목록과 Viewer에서 조회합니다. 이후 업로드 원본은 S3에 저장되며 사용자는 기존 UI를 그대로 사용합니다. 서버에서 원본을 제공하므로 브라우저에 S3 인증정보를 설정하지 않습니다.

기존 로컬 원본은 계속 조회할 수 있으며 자동 이동하지 않습니다. SQLite와 업로드 임시 파일은 로컬 디스크를 사용합니다. 버킷은 미리 준비해야 하며 endpoint/credential은 서버에서만 사용합니다. 상세 설정·전환·복구 제한은 [Operation](out/Operation.md), 실제 SeaweedFS 검증 결과는 [TestReport](out/TestReport.md)를 참조하세요.

Docker 기반 격리 시험은 `npm --prefix src run test:s3`, S3 저장소를 사용하는 웹 E2E는 Production Build 후 `npm --prefix src run test:s3:e2e`입니다. 실제 서비스 설정이나 기존 bucket은 변경하지 않습니다.

## Docker로 실행하기

Docker Engine과 Compose v2가 필요합니다. 아래 명령은 프로젝트 Root에서 실행하며, 처음에는 `.env.example`을 참고해 `.env`를 준비합니다. 기존 `.env`는 덮어쓰지 않습니다.

```bash
docker compose --env-file .env -f src/docker-compose.yml build
docker compose --env-file .env -f src/docker-compose.yml up -d
docker compose --env-file .env -f src/docker-compose.yml ps
```

Compose의 일회성 migrate 컨테이너가 DB migration·백필을 완료한 경우에만 app 컨테이너를 시작합니다. 기본 주소는 `http://localhost:3000`이며 다른 장치에서는 `http://<서버 IP>:3000`으로 접속합니다. `.env`의 `CAD_HOST_PORT`로 호스트 포트를 바꿀 수 있습니다. 같은 네트워크/VPN, 서버 방화벽과 수신 포트가 접근을 허용해야 합니다. `0.0.0.0`은 수신 설정이며 브라우저 접속 주소로 사용하지 않습니다.

프로젝트 `cad-layout-viewer`, 컨테이너 `cad-layout-viewer-app`, 네트워크 `cad-layout-viewer-network`, 데이터 볼륨 `cad-layout-viewer-data`를 사용합니다. 기존 호스트 `data/`를 자동 복사하거나 기존 서비스와 공유하지 않습니다. SQLite와 CAD/임시 업로드는 볼륨에 남고 S3 모드도 SQLite/임시 디스크가 필요합니다. `down`은 볼륨을 보존하지만 `down -v`는 데이터를 삭제하므로 정상 종료에 사용하지 않습니다.

```bash
docker compose --env-file .env -f src/docker-compose.yml logs --tail 100 app
docker compose --env-file .env -f src/docker-compose.yml stop
```

`/api/health`는 앱과 DB 조회 가능 여부만 반환합니다. 이미지에는 실제 `.env`, Git 자격증명, 업로드 CAD 및 런타임 DB를 포함하지 않습니다. S3 설정은 Compose의 앱 전용 환경변수로 주입합니다. 컨테이너에서 `localhost`는 컨테이너 자신이므로 S3 endpoint에는 컨테이너가 접근할 수 있는 실제 서버 주소를 사용합니다.

## GitHub Container Registry 이미지 내려받기

0.21.0 릴리스 이미지는 `ghcr.io/planner77/layoutmanager:0.21.0`이며 `main` 병합 시 GitHub Actions가 버전 태그와 `latest`를 게시합니다. 실제 게시 workflow, source revision과 digest는 [Release 0.21.0](out/Release-0.21.0.md)을 기준으로 확인합니다.

```bash
docker pull ghcr.io/planner77/layoutmanager:0.21.0
```

게시된 이미지 주소와 tag를 `.env`의 `GHCR_IMAGE`에 지정합니다. 저장소/계정 식별값은 환경설정으로 유지합니다. 비공개 package는 해당 package를 읽을 권한으로 먼저 `docker login ghcr.io`를 수행해야 합니다. Token을 명령행 인수·소스·로그에 기록하지 않고 password stdin 방식이나 승인된 credential 관리 방식을 사용합니다.

```bash
docker compose --env-file .env -f src/docker-compose.yml pull app
docker compose --env-file .env -f src/docker-compose.yml up -d --no-build app
```

검증 이미지의 플랫폼은 `linux/amd64`입니다. 0.21.0의 실제 digest와 `org.opencontainers.image.revision`은 게시 완료 후 `out/Release-0.21.0.md`에 기록합니다. `latest` 대신 검증한 버전 tag 또는 digest를 고정할 수 있습니다. 이미지 빌드 방법·볼륨 백업·실행 제약은 [Operation](out/Operation.md)을 참조하세요.

## GitHub Container Registry에 직접 빌드·게시하기

아래는 Bash 기준이며 Root에서 실행합니다. `<소유자>`와 `<이미지>`는 사용자가 지정한 GitHub 저장소의 소유자와 게시할 이미지 이름으로 바꾸고 모두 소문자를 사용합니다. 저장소 주소에는 credential을 넣지 않습니다. 게시 권한이 있는 계정의 Token을 사용하며 private package pull에는 읽기 권한도 필요합니다.

```bash
# 실제 저장소/이미지 주소는 로컬 배포 환경에서 지정합니다.
CAD_IMAGE_NAME='ghcr.io/<소유자>/<이미지>'
CAD_IMAGE_SOURCE='https://github.com/<소유자>/<저장소>'
CAD_IMAGE_VERSION="$(node -p "require('./src/package.json').version")"
CAD_IMAGE_REVISION="$(git rev-parse HEAD)"

# 게시 이미지는 커밋 완료한 소스에서 빌드해야 revision label과 일치합니다.
docker build -f src/Dockerfile \
  --label "org.opencontainers.image.source=$CAD_IMAGE_SOURCE" \
  --label "org.opencontainers.image.revision=$CAD_IMAGE_REVISION" \
  --label "org.opencontainers.image.version=$CAD_IMAGE_VERSION" \
  -t "cad-layout-viewer:$CAD_IMAGE_VERSION" .
docker tag "cad-layout-viewer:$CAD_IMAGE_VERSION" "$CAD_IMAGE_NAME:$CAD_IMAGE_VERSION"

# Token을 명령행 인수나 shell history에 적지 않고 표준입력으로 전달합니다.
read -r -p 'GitHub 사용자명: ' GHCR_USERNAME
read -r -s -p 'GHCR 게시 Token: ' GHCR_TOKEN
printf '\n'
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
unset GHCR_TOKEN

docker push "$CAD_IMAGE_NAME:$CAD_IMAGE_VERSION"
docker pull "$CAD_IMAGE_NAME:$CAD_IMAGE_VERSION"
docker image inspect "$CAD_IMAGE_NAME:$CAD_IMAGE_VERSION" --format '{{json .RepoDigests}}'
```

게시한 전체 이미지 주소를 `.env`의 `GHCR_IMAGE`에 넣으면 위의 Compose pull 절차로 실행할 수 있습니다. Token을 `.env.example`, Docker build argument, image label 또는 Git에 넣지 않습니다. Docker 인증 저장은 사용 환경의 credential helper 정책을 따르며 필요하면 작업 후 `docker logout ghcr.io`로 해제합니다. package 권한·visibility는 GitHub 설정을 따르고 임의 공개 전환을 하지 않습니다. GHCR 인증/권한 및 원본 연결 설명은 [GitHub 공식 문서](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)를 참조하세요.
