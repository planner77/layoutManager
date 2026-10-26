# CAD Web Viewer P.O.C.

## Issue #105 — G3 격리 로그인·세션 (0.41.0 후보)

로그인·초기 비밀번호 변경·로그아웃, 세션 8h/idle 30m/최대 3개와 계정 변경 시 회수, 서버 DB Actor 및 정상 HTTP cookie 흐름을 비운영 서비스와 fixture에 구현했습니다. 실제 검증 결과는 TestReport에서 확인합니다. 초기/복구 계정은 비밀번호 변경 후 다시 로그인하며 운영 로그인 API/UI는 아직 연결하지 않습니다. 기존 공개 CAD 익명 조회·Current·삭제와 운영 Prisma/Compose/DB는 그대로 유지합니다. [요구·설계·AC/TC](out/Issue105.md), [실제 시험 결과](out/TestReport.md)를 구분하며 #109 별도 Owner 승인 전 운영 인증 기능은 OFF입니다. 이번 작업은 PR CI 시작까지이며 병합·배포를 포함하지 않습니다.

## Issue #104 — v0.40.5 GHCR 신규 Pair 준비 (2026-10-26)

이미 게시된 v0.40.4를 재사용하지 않고 사용자가 요청한 신규 GHCR App/Migrator 게시용으로 `src/package.json`과 `src/package-lock.json`의 루트 버전을 **0.40.5**로 정렬했습니다. 버전 변경 이전 G2 구현 HEAD `f5f7ea2e`은 [PR CI 40234510320](https://github.com/planner77/layoutManager/actions/runs/40234510320)에서 Verify/Docker 모두 성공했지만, **새 HEAD는 별도 PR CI 성공 후에만 병합/게시**합니다. G2 초기 관리자 서비스는 격리 CLI 전용이며 운영 Auth·Admin·Prisma/API·DB 기능은 #109 G7 승인 전 계속 OFF.

## Issue #104 — G2 격리 Admin 최초 생성·복구 (운영 OFF)

#102 Owner 정책(지정 운영 담당자 실행/Owner 책임)과 #103 G1 계약을 따른 명시 `server/auth/admin-setup.ts` 서비스, 실행 UID 제한 Secret 파일, 최초 User/Role/Audit·복구 nonce/Session 원자성 및 `scripts/auth-g2-isolated.ts` 임시 DB CLI를 작성했습니다. 실제 App 시작/관리·로그인 API/운영 Prisma migration/기존 익명 CAD 조회·Current·삭제 비밀번호에 **연결하지 않습니다**. 요구/AC/TC와 사내 운영자 비공개 SOP 템플릿은 [Issue104](out/Issue104.md)/[Operation](out/Operation.md)/[TestPlan](out/TestPlan.md). #109 Owner Go/No-Go 전 운영 OFF, 실행 안 된 시험은 PASS가 아닙니다.


## Issue #103 — G1 User/Session/Grant/Audit 격리 DB (운영 OFF)

- [Issue103](out/Issue103.md) / [ADR-051-G1](out/Decisions.md): 기존 CAD SQL 6개를 적용한 disposable SQLite 사본에 User/AuthSession/3종 Grant/Audit/RecoveryNonce DB 계약, 동시 세션 3개/nonce·감사 원자성, 합성 local CAD/S3 mirror 백업·복구 Fixture와 TC-P4-G1-001~009를 추가했습니다.
- 런타임·운영 Prisma/migrations·기존 API·Compose/Nginx·실 CAD/S3는 변경하지 않습니다. 실행 전 테스트는 NOT RUN이고 정식 운영 활성화는 G7 별도 Owner 승인이 필요합니다.
- 2026-10-25 #102 Owner 5개 승인: 기존 CAD 목록/Viewer/다운로드 익명 GET 유지, Current=Editor/Admin+담당 Site, Version 삭제=Editor/Admin+담당 Site+기존 삭제 비밀번호, 최초 Admin/복구=지정 사내 운영 담당자(Owner 책임), Audit 365일 경과 이력 정리 원칙. 관련 문서 PR #114는 병합·CI 완료 미확인. POST 업로드 권한, Secret/실 담당자, Audit 물리 정리·백업 복원 세칙, 실제 배포는 PENDING; #103 G1 운영 활성화 승인 아님.


## Issue #107 — PROD Nginx / DEV 직접 접속의 비운영 Preview

- 조직 내부 소수 사용자가 사용하는 HTTP 환경에서 **보안 침투·탈취 대응 강화 없이** 정상 배포 경로만 검증합니다. 운영 Nginx/Compose는 변경하지 않습니다.
- 독립 Compose `src/deploy/g5/compose.preview.yml`: PROD Preview 127.0.0.1:3302 → Nginx → App(직접 host port 없음), DEV Preview 127.0.0.1:3301 → 개발 App 직접 접속. 두 환경은 별도 테스트 DB/CAD 볼륨입니다.
- 격리 실행/철거와 Health·목록·Viewer/다운로드 확인 절차는 [Issue107](out/Issue107.md), [Operation](out/Operation.md)을 참고하세요. Preview 도면의 `--version-id ID`는 실제 `/cad/versions/ID/viewer` 및 content를 검증합니다. GHCR v0.40.4 App·Migrator Pair 게시가 Main CI #40225537167에서 성공했으며 운영 Nginx/Compose 변경은 없습니다. 실제 내부 PC 업로드·Cookie·운영 연결과 G7 승인 전의 운영 기능 활성화는 미수행입니다.


## Issue #99 — 실제 DXF 비공개 P0/P5 수용 (현장 전용)

**Issue #99 P1 비공개 파일 경로 제한:** 내부 DXF 경로와 보고서 출력 경로는 절대 경로뿐 아니라 심볼릭 링크를 해석한 최종 실제 경로까지 Git checkout 밖이어야 합니다. 보고서 출력 디렉터리는 시험 전에 별도로 만들고 쓰기 권한을 제한하세요. 재실행 시에는 새 JSON 보고서 파일명을 사용하세요(기존 파일 덮어쓰기 금지). 수정 HEAD `0.40.3`은 신규 GHCR 쌍 후보이며 CI/최종 릴리스·실 CAD 수용 완료를 의미하지 않습니다.



- 기존 `cd src && npm run audit:outline -- --file /private/sample.dxf`는 Source-only 분석(파서/Spatial/heap/경고)이며 Render/GPU 합격 근거가 아닙니다.
- **승인된 격리 테스트 DB/Storage에서만** `CAD_OUTLINE_ACCEPTANCE_DXF=/private/sample.dxf CAD_OUTLINE_ACCEPTANCE_EXPECTED_SHA256=<승인된 SHA256> CAD_OUTLINE_ACCEPTANCE_REPORT_PATH=/private/browser.json npm run test:outline-acceptance` (모든 경로는 Git 저장소 밖 절대 경로). 1개 실제 DXF의 Browser/Mapping/Box·프레임 5회 schema v2 보고서를 사내에 보관합니다.
- 서로 다른 실제 DXF 3종(1k/10k/100k), CAD 기준 WCS/면적·지원 Matrix, 8개 기능 동작, 외부 GPU 사용/VRAM, Owner SLA/서명 참조를 비공개 manifest로 묶어 `npm run verify:outline-acceptance -- /private/manifest.json`로 점검합니다. `BLOCKED`는 증거 부족/기준 위반, `READY_FOR_OWNER_REVIEW`는 형식상 리뷰 가능일 뿐 합격이 아닙니다.
- 이 자료는 Git/공개 CI artifact에 절대 업로드하지 않으며, 본 기능은 운영 API/DB/기존 DXF Source를 변경하지 않습니다. [구체 실행 절차와 샘플 계약](out/Issue99.md), [운영 가이드](out/Operation.md), [시험계획](out/TestPlan.md).


## Issue #96 — 앱 로컬 계정·Role/Scope·Audit 비활성 공통 기반

- Owner D1~D6 정책 확정: .env 관리자 단발 설정/복구, 비밀번호 최소 8자+scrypt, 세션 절대 8h/idle 30m/동시 3개, 명시 Site Grant, 감사 365일/별도 읽기, 지정 사내 LAN·HTTP 위험 수용.
- **운영 로그인·관리 API는 여전히 OFF.** 독립 도메인/헬퍼·Unit만 추가, 새 Route/UI/Prisma/Migration/Docker/Compose는 변경하지 않음. .env.example의 ADMIN_*는 실행시 읽지 않는 비활성 설정 예시다. DXF/Version/SHA/Current/기존 API 불변.
- 실 CIDR, Secret/단발복구/세션 DB 원자성/감사 DB/실 LAN 권한 E2E/Backup-Migration-Restore 및 별도 Owner 운영 승인이 완료되어야 실제 기능 활성화 가능. [Issue96](out/Issue96.md) / [ADR-051](out/Decisions.md) / [Operation](out/Operation.md). 버전 0.40.2 유지(운영 기능 미릴리스).



## Issue #97 — P4-D2 서버 DXF 이동·회전 검증기 (개발용, 영속 API 비활성)

- [Issue97](out/Issue97.md), [ADR-050](out/Decisions.md): 기존 `src/server/outline/attestation.ts`가 원본 canonical-only JSON을 검사하는 기능에 더해 별도 `src/server/outline/transform-attestation.ts`가 서버 불변 DXF의 SHA/Stable root Handle/INSUNITS/WCS XY 기준 Geometry와 **Translate·Rotate(pivot)만** 다시 계산합니다. JSON v1/v2 하위호환, 0.02 Drawing Unit, Polygon/MultiPolygon/Hole 및 client geometry 위조 거부. nested child BLOCK instancePath는 현 파서에서 안정적으로 발급되지 않아 거부하며, Scale/Shear/Mirror/Z/대좌표 오버플로우는 미지원입니다.
- **운영 기능이 아닙니다.** 실제 원본 획득·로그인/권한·사이트 범위·Prisma/CRUD/Revision CAS/감사는 미연결(#96/#98), 실제 공장 도면·GPU 실증은 #99 별도입니다. 도면 원본/Current/Version/SHA와 Viewer UI 및 브라우저 JSON 내보내기 동작은 바뀌지 않습니다. 기능 버전은 명시된 GHCR 게시 승인에 맞춰 0.40.2로 신규 패치 발행합니다(기존 v0.40.1 immutable tag 재사용 금지).
- 자동 Unit `src/tests/unit/outline-transform-attestation.test.ts`를 작성했으나 Node Typecheck/Vitest/Playwright/Docker/실 DXF는 현재 원격 작업에서 실행하지 않았습니다(**NOT RUN**). 사용 방법·오류 코드·입력 확장은 [Issue97](out/Issue97.md) 참조.

## v0.40.1 — Issue #93 도면 목록에서 이전 버전 표시·검색 복원

- **기본은 Current만 표시:** CAD 도면 목록(`/`)에 들어오거나 `초기화`를 누르면 Location별로 Current로 지정된 도면만 보입니다. 최신 등록/높은 V번호를 자동 Current로 지정하지 않습니다.
- **이전 버전 검색:** 목록 검색 영역의 `현재 버전만 표시` 버튼이 기본 **ON**입니다. 버튼을 한 번 눌러 **OFF**로 바꾸면 기존 Current와 모든 이전 Version, Current 미지정 층의 도면까지 같은 표에 표시되며 파일명·설명·5단계 위치·DXF/DWG로 검색할 수 있습니다. 상태 배지/버전 번호 및 Viewer 열기·원본 다운로드·Current 지정 작업이 유지됩니다.
- **상태 유지:** OFF에서는 `?versions=all`이 붙으며 검색 제출, 다음/이전 페이지, 뒤로/앞으로 및 새로고침에서도 유지됩니다. 토글 전환은 검색어·페이지당 개수를 유지하되 첫 페이지부터 시작합니다. `초기화`는 Current 전용으로 복귀합니다.
- **API/기존 링크:** 이전 홈페이지 `?current=false` 주소는 전체 버전 목록으로 해석합니다. 반면 API `GET /api/cad-files?current=false`는 이전 Version만 돌려주는 기존 의미를 유지합니다. #45의 별도 `위치별 버전 관리`도 계속 사용할 수 있습니다.
- 설계/검증 경계: [Issue93](out/Issue93.md)/[ADR-034-R1](out/Decisions.md)/[TestPlan](out/TestPlan.md). 이번 단계 작성 코드는 PR CI/실 CAD 검증 전이므로 실행 성공을 주장하지 않습니다.


## Issue #76 — GitHub Squash Merge 커밋 메시지 기본값 (운영 관리자 조치 필요)

- GitHub 저장소 Settings → General → Pull Requests → **Allow squash merging / Default commit message: Pull request title**로 지정해야 합니다. 현재 REST 확인값 `COMMIT_OR_PR_TITLE / COMMIT_MESSAGES`는 목표 `PR_TITLE / BLANK`와 달라 **미완료**입니다.
- PR CI는 이를 읽기 전용으로 조회해 `PASS`, `NOT APPLIED`, `NOT VERIFIED` 중 하나를 경고/Job Summary로 표시합니다. 경고 자체는 다른 PR CI를 차단하지 않으며, 실제 설정 변경·새 Main CI 단일행 확인을 대체하지 않습니다. 세부 절차 [Issue76](out/Issue76.md) / [Operation](out/Operation.md).
- 앱 버전, GHCR 게시 범위, 기존 #74 multiline 보호, DXF/DWG 데이터는 변동 없습니다.

## v0.40.0 — Issue #54 생성 개체 WCS 이동·그룹 이동 (E4)

- **DXF + three-dxf-viewer의 생성 확정 객체 전용:** 하단에서 **생성 개체만 선택** 또는 **원본·생성 선택**으로 GENERATED 개체 하나 또는 여러 개를 고른 뒤 **ΔX/ΔY → 이동 적용**을 누릅니다. 입력값은 도면 WCS XY 단위로 적용하며, 단위 정보가 없으면 **단위 미상**으로 표시합니다. 예: (10,20)에서 (+3,-5) 입력 시 (13,15).
- **캔버스 직접 이동:** 생성 개체 전용 선택 모드에서 먼저 선택한 개체의 **외곽선 경계**를 5px 이상 드래그하면 청록색 미리보기만 움직입니다. 포인터를 놓을 때 확정하고 선택한 개체 전체가 같은 양만큼 이동합니다. Esc·포인터 취소·Space Pan·Zoom/Fit·모드 전환은 미리보기만 취소하며 편집 기록을 남기지 않습니다. 경계 이외의 드래그는 기존 영역 선택입니다.
- **원자·복구:** SOURCE 또는 원본·생성 혼합 선택은 전체 거부. Polygon/MultiPolygon/Hole/트리 Focus/Hit/기존 JSON에 새 WCS 좌표가 반영되며 한 번의 이동=Undo 한 단계. 기존 원본 DXF/Layer/SHA/Current·DB/API는 불변, 세션 종료·Reload/Renderer 교체 시 브라우저 임시 개체가 사라집니다. 서버 영구 저장은 #31 P4 승인 전 불가합니다.
- [Issue #54 설계](out/Issue54.md) · [검증 계획](out/TestPlan.md). **로컬 검증/실 CAD/GPU/native Fullscreen은 NOT RUN이며 CI 시작을 성공으로 보지 않습니다.**

## v0.39.0 — Issue #53 생성 개체 개별·다중 삭제 (E3)

- **DXF + three-dxf-viewer 전용:** 기존 생성 외곽선을 선택한 후 하단 **선택 삭제**, 트리 행 **삭제**, 이미 선택된 개체의 Canvas 우클릭 **선택한 생성 개체 삭제**, 또는 **Canvas 초점**에서 Delete/Backspace로 브라우저 임시 개체만 삭제합니다. 삭제 전 개수/이름 확인창이 표시되고, 취소하면 아무것도 바뀌지 않습니다.
- **생성과 편집은 별도 모드입니다.** 외곽선 생성 메뉴가 OFF여도 **생성 개체만 선택** 또는 **원본·생성 선택** 모드에서 GENERATED만 선택한 뒤 삭제할 수 있습니다. 기본 Pan과 생성 ON 작업 중에는 삭제하지 않습니다. SOURCE 또는 원본·생성 혼합 선택은 읽기 전용이며 삭제 버튼도 비활성화됩니다. 입력창/검색창에 초점이 있는 Delete/Backspace는 CAD 삭제로 처리하지 않습니다.
- **복원/보호:** Undo/Redo로 삭제 개체의 UUID·좌표/변환/메타데이터·가시성과 순서를 복원합니다. Tree/Canvas·기존 임시 JSON 다운로드는 삭제된 객체를 제외한 동일 상태를 표시하며 Source/Layer/Preview·DXF 원본 파일·Current·DB는 변경되지 않습니다. 세션·Renderer/Version/reload 시 삭제/생성 이력도 소멸합니다. 서버 저장 및 영구 복원은 #31 P4 승인 전 차단됩니다. [Issue53 상세](out/Issue53.md), [테스트 계획](out/TestPlan.md). **현재 로컬 테스트/실 CAD·GPU NOT RUN이며 PR CI 성공 여부는 별도입니다.**


## v0.38.1 — Issue #67 GHCR 웹 이미지 Standalone native SQLite 중복 COPY 개선 (PR CI 검증 전)

- Next.js `.next/standalone` 추적 경로가 포함하는 `better-sqlite3` 패키지를 Docker runtime 단계에서 다시 COPY하지 않도록 변경했습니다. `next.config.ts`에서 Prisma와 native SQLite tracing을 유지하고 이미지 빌드 중 `.node`/메모리 DB 동작을 확인합니다. 데이터 스키마·API·기존 migrator/배포 계약은 그대로입니다.
- PR Docker 검증에는 실제 Docker TAR layer 경로·SHA256 중복, 비압축 image bytes 전후 비교, 자산(한국어 TTF/파생 typeface·DWG JS/WASM) raw·gzip proxy 크기, 재migration/app 재시작 후 임시 `/data` API 등록·조회·삭제를 포함합니다.
- 과거 약 **12.5MB 추가 COPY**는 이전 linux/amd64 로컬 비압축 계측으로 새 절감량이 아닙니다. 실제 PR CI 성공/감축 bytes와 GHCR OCI 압축 레이어/고정 digest는 각각 검증 후 판정합니다. GHCR app+`migrate` 버전 Pair 배포에는 동일 시점 DB/CAD/S3 backup, 기존 writer stop, migrator exit0가 필수입니다. [Issue67](out/Issue67.md), [Operation](out/Operation.md), [TestPlan](out/TestPlan.md).


Issue #52 CI에서 발견한 테스트 간 공유 geometry 오염을 교정했습니다. 최신 로컬 검증 결과와 PR CI·실도면 검증의 구분은 [TestReport](out/TestReport.md), 수정 범위는 [Issue52](out/Issue52.md)를 참조하세요.

- Undo 한도: 삭제한 개체의 복원 가능 객체 수·정점도 100개/100k 용량으로 예약합니다. 삭제 이후 새 개체를 확정하여 그 예약을 넘으면 이전 호환 불가 Undo 이력은 초기화되며 새 객체가 우선 보존됩니다. 선택 대상이 바뀌면 확정 전 편집 명령은 취소됩니다.


## v0.38.0 — Issue #52 생성 개체 편집 기반과 Undo·Redo (E2)

- DXF + **three-dxf-viewer**에서 임시 확정한 볼록/정밀 외곽선은 하나의 브라우저 전용 GeneratedDocument로 관리됩니다. E1의 원본 SOURCE와 생성 GENERATED 선택을 구분하며 SOURCE/혼합 선택은 **항상 읽기 전용**입니다. Tree/표시/선택/기존 JSON 다운로드는 한 Document를 참조합니다.
- Viewer의 생성 개체 선택 도구에 **실행 취소/다시 실행** 버튼과 Ctrl/⌘+Z / Ctrl/⌘+Shift+Z (Windows Ctrl+Y) 기반을 추가했습니다. 입력·텍스트 편집의 브라우저 기본 Undo는 그대로 유지합니다. 이력은 최대 **100건**(별도 계산 메모리 예산 16MiB)이며 이동/회전·Delete 동작은 **후속 #53~#55에서 제공**하므로 이번 버전에서는 기능 확인 버튼이 비활성화될 수 있습니다.
- **서버 자동 저장 없음**: 현재 생성 객체/이력은 새로고침, 도면 Version·Renderer 전환 시 사라집니다. 현재 JSON 다운로드는 과거 #31 v1 및 #42 typed v2 호환 경로이고, 편집본 안전 복원은 후속 **#56**입니다. 실제 CAD 원본·Current·Source Layer/Geometry는 수정되지 않으며 인증된 서버 저장(#31 P4)은 승인 전 미지원입니다. 다른 DXF Renderer와 DWG는 편집 미지원입니다. 요구/명령 API·시험 계획은 [Issue52](out/Issue52.md).


## v0.37.1 — Issue #66 migrator 이미지 의존성 경량화 (검증 전)

- 신규/업그레이드 시 `migrate` Compose 서비스와 `app`의 성공 순서·`/data` 볼륨·UID 10001은 종전과 동일합니다. 변경은 **migrator 이미지 내부 패키징**에 한정되며 앱 UI, DB 스키마, 원본 CAD는 변경하지 않습니다.
- Prisma CLI·TypeScript runner·SQLite Native와 실제 비밀번호 Backfill 모듈만 포함하도록 전용 의존성을 정리하고 웹/테스트·빌드 패키지 복사를 피합니다. 신규 웹 기능이 아니라 버전 `0.37.1` 패치입니다.
- 배포 전 동일 시점 DB/CAD/S3 백업 및 복구 확인, 기존 앱 writer 정지, **동일 버전** `ghcr.io/planner77/layoutmanager:0.37.1` + `:0.37.1-migrate` 사용, migrate exit 0 후 app health 확인. GHCR tag/이미지 게시 여부는 Main CI에서 실제 확인해야 합니다. 디지털 크기 절감률과 OCI 다운로드량은 PR CI/릴리스 측정 전 **미확정**입니다.
- [Issue66 상세](out/Issue66.md) · [운영 지침](out/Operation.md) · [테스트 계획](out/TestPlan.md).
## v0.37.0 — Issue #51 원본·생성 개체 통합 선택 (E1)

- DXF + three-dxf-viewer에서 외곽선 **생성 OFF** 상태로도 하단 **원본·생성 선택** 또는 **생성 개체만 선택**을 사용할 수 있습니다. Ctrl/⌘+클릭과 방향별 영역 선택, 트리 클릭/키보드 다중 선택을 같은 선택 집합에서 처리합니다. 일반 모드의 겹침 클릭은 원본 우선이며 생성 개체 선택은 전용 모드 또는 트리를 사용합니다.
- 원본 SOURCE는 항상 읽기 전용입니다. 생성 GENERATED만 향후 로컬 편집 가능한 개체로 표시되고, SOURCE 혼합·중복·다른 버전 Ref는 전체 편집 불가입니다. **E1은 실제 삭제·이동·회전·Undo를 구현하지 않습니다**(후속 #52~#55).
- 생성 개체 참조는 UUIDv4/Version/SHA 기반의 세션 내부 ID입니다. 기존 JSON v1/v2의 local-N 형식과 확정 Overlay/트리/가시성·생성 OFF 기본 Pan 계약을 보존합니다. Reload/Renderer/Version 변경 시 임시 객체가 폐기되고 서버 DB/원본 DXF는 변경되지 않습니다. 미지원 Renderer/DWG, 보안 승인 전 서버 저장은 비활성. [Issue51](out/Issue51.md) 참고. 로컬 테스트 및 PR CI 성공은 아직 검증되지 않았습니다.


## v0.36.0 — Issue #43 외곽선 목록·타입별 임시 트리

- DXF를 three-dxf-viewer에서 연 뒤 **외곽선 목록**을 누르면 우측 도크에 현재 세션의 확정된 외곽선이 나타납니다. 기존 타입이 없는 항목은 **미분류 (legacy)** 아래에 표시됩니다. 개별/그룹 표시·숨김, 클릭/키보드 선택 후 외곽선으로 이동·강조, 수량·임시 표식을 제공합니다.
- 표시 상태는 도면 Layer 체크/외곽선 생성 ON/OFF와 별개입니다. 숨겨도 트리·JSON 데이터는 유지됩니다. 임시 외곽선 삭제는 생성 ON에서만 가능하며 Reload·Version/Renderer 변경 때 사라집니다. **서버 영구 저장/재접속 복원이 아닙니다.**
- 실제 관리자가 등록한 타입 목록은 #65 인증/Scope 카탈로그 준비 전 제공되지 않습니다. 현재 legacy 트리만 정상 동작하며 타입 그룹의 두 타입 Unit 시험은 운영 기능 증명이 아닙니다. 자세한 범위/테스트: [Issue43](out/Issue43.md). CI 전 로컬 검증은 미실행.


## v0.35.0 — Issue #42 타입 지정 외곽선 계약·JSON v2 (서버 카탈로그 대기)

- DXF `three-dxf-viewer`의 외곽선 생성 ON 도크에 **업무 타입 선택/외곽선 이름/타입 지정 후 확정** 입력 경로를 준비했습니다. 업무 타입은 #65의 인증·Scope 서버 기준정보에만 연결하도록 설계하여 현재는 **타입 선택·확정 disabled** 상태입니다. 관리자 등록 필요 안내가 표시됩니다.
- `CONVEX/PRECISE` 기하 종류와 업무 타입 ID는 별도 필드입니다. 브라우저 결과의 type ID·type name snapshot·outline name은 schemaVersion **2** JSON에 포함되며 기존 미분류 v1 JSON import/export 경로는 보존됩니다. 타입이 없는 기존 U3 '임시 확정'은 **미분류·브라우저 메모리 전용**이며 운영 영속 저장을 의미하지 않습니다.
- Server-side 타입 카탈로그/인증·401/403·P4 geometry 재검증/CAS·감사/트리뷰는 아직 미구현. #65 및 #31 승인/수용 후 활성화해야 합니다. 상세: [Issue42](out/Issue42.md). 신규 테스트 코드는 CI 전 **실행 미확인**.


### Issue #41 / v0.34.0 PR CI 성공·부분 범위 릴리스 상태

- [PR #64](https://github.com/planner77/layoutManager/pull/64)는 [PR CI 40154979531](https://github.com/planner77/layoutManager/actions/runs/40154979531) 성공 후 병합되었습니다. 브라우저 메모리 시안 `/lab/outline-types`와 UUID·검증 기능만 포함하며 **실제 관리자 타입 DB 저장 및 접근 권한은 구현되지 않았습니다**.
- #41의 나머지 원래 영속/관리 수용 기준은 [후속 #65](https://github.com/planner77/layoutManager/issues/65)로 이관(인증·Scope·Audit 승인 전 BLOCKED)하고 #41은 범위 분할로 종료했습니다. [Main/GHCR workflow #40155833554](https://github.com/planner77/layoutManager/actions/runs/40155833554)는 시작했으나 GHCR 게시 성공·실서비스 배포는 별도 확인이 필요합니다.


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

> **역사 정책(후속 #93에서 변경):** 다음 0.31.0 절은 #45 당시 동작 기록입니다. 현재 기본 Current+전체 버전 검색 정책은 위 v0.40.1을 우선합니다.

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
