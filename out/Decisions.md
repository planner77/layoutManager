# 주요 기술 결정과 승인 기록

## ADR-053-R1 — Viewer Drawer 보존 + 이동 가능한 보조 창 공통 정책 (#138, 2026-10-27)

- **Context:** #127은 화면 점유를 줄이는 좌/우/하단 overlay Drawer와 실행형 그룹 메뉴를 완료했지만 사용자가 외곽선 목록·TEXT 검색·생성/편집 도구의 위치를 자유 배치할 수 없다. 별도 패널마다 개별 absolute drag를 구현하면 Canvas gesture·modal/keyboard·fullscreen/resize 정책이 어긋난다.
- **Decision:** 기존 ADR-053의 #127 Drawer를 **초기 edge/모바일 modal**로 보존하고 데스크톱에서는 공통 movable panel의 header 전용 drag handle로 독립 floating 위치를 지정한다. 독립 열린 상태/position/z-order/Reset 및 안전 clamp, CSS/native fullscreen·320px 대응을 구현한다. Pointer/keyboard/ESC 및 Canvas 입력 경계를 공통으로 만들고 panel 이동과 Viewer render/Source lifecycle을 분리한다. 같은 Viewer 세션 내 위치 유지, 새 Version·탭·세션 기본 위치; 무단 localStorage/DB 영속화는 하지 않는다.
- **Policy:** 향후 Viewer 내부 독립 조회·작업 창은 #127 그룹 메뉴/공용 `ViewerPanelPolicy`를 기본 적용. 확인 모달·툴팁·일회 메뉴·독립 페이지 등은 이유 기록 후 예외. #26/#40/#43 기능은 #138 범위에서 retrofit, #37/#49/#73/#82/#85/#90 후속 기능에 공통 적용을 이슈 AC로 명시한다.
- **Consequences:** CAD 데이터/WCS selection/Undo, Layer visibility, 검색 Query/결과, Runtime Manager/Adapter, DXF source bytes/Version/Current 및 G7 API/Auth 불변. 기존 모바일 focus trap/한 ESC 한 단계/메뉴·modal 우선순위는 유지. 자세한 근거/시험 계약 [ViewerPanelPolicy](ViewerPanelPolicy.md), [#138](https://github.com/planner77/layoutManager/issues/138). **구현·E2E NOT RUN.**


## #109 S3-4-B1 — 복제본 무결성과 운영 Snapshot 복구 증거의 구분 (2026-10-27)

- B1은 `ISOLATED_INTEGRITY_ONLY`로 **격리 파일 내용의 DB↔CAD↔S3 내보내기 일치**만 표시한다. `snapshotId`만 같다고 운영 원본의 쓰기 정지·실제 동일 시점 백업·Registry provenance를 입증하지 않는다. 따라서 결과 `operationalGo=false`/`runtimeActivated=false` 고정.
- B2 원본 사내 실제 복구/OCI 확인과 C 신뢰 binder/Owner GO는 별도 승인/입증 필수, 실행 없이 완료로 표기 금지.


## #109 S3-4-A — 운영 승인과 오프라인 증거형식 검증 분리 (2026-10-27)

- 기존 G7 이중 Release/Operation 게이트 유지. S3-4-A 오프라인 증거 패킷이 완전해도 Owner GO·실 이미지 digest 검증·실 DB/CAD/S3 복구는 자동 승인하지 않는다. 도구 출력은 `operationalGo=false`/`runtimeActivated=false`만 가능하다.
- 17개 검증 항목의 승인 근거는 사내 EV/QA/SNAP 식별자로만 공개하고 원본 CIDR·Secret·도면·로그·Object 목록은 비반출. 부적합/취소/미실행은 fail-closed, 만료 Audit purge SOP 전 물리 삭제 금지.
- S3-4-B/C와 최종 S3-5 Owner 릴리스별 GO는 독립 후속 게이트. 정식 Migration 운영 승격·GHCR 배포는 이 PR 범위 밖.


## ADR-051-G7-S3-2 — 예약 운영 API 계약의 프로덕션 강제 OFF 및 시험 격리 (2026-10-26)

- **결정:** S3-2는 기존 G3/G4 Service와 SQLite 영속 adapter를 재사용하여 Login/Session/Logout·Role/Site/Grant·Account Disable/Audit 및 Admin-only User Create를 `/api/g7-operational/**`의 **예약 API**로 연결한다. 단순 `G7_AUTH_ENABLED=true`나 Owner S2 준비 승인은 운영 활성화를 허용하지 않는다. **`NODE_ENV=production`은 전체 응답 404로 고정**하며 테스트 비운영에서만 명시된 전용 임시 DB·loopback/추가 Preview flag·Auth OFF가 전부 만족할 경우 서비스가 열린다.
- **거래/권한:** Session/Actor/Role/Site/Grant는 DB 권위, 쿠키는 기존 운영·Staging과 분리. G4 Permit·Grant·Disable/Audit BEGIN IMMEDIATE. Admin-only User Create는 권한 사전검사/감사 이후 KDF, transaction 내 Role/Session 재검증과 INSERT/Audit Commit을 하나로 처리하고 실패 시 rollback. 새 계정은 강제 암호 변경, Role/Scope 자동 부여 없음. G2 최초 생성/복구는 UI나 API 호출 없이 **별도 명시 승인된 일회용 CLI**에서만, Startup 자동 실행 금지.
- **안전:** S3-1의 Release/Operation preflight가 아직 런타임 Verified Build/Registry 및 실제 DB 증거를 공급받지 않아 `runtimeActivated=false`이고, 기존 CAD API Auth/Audit 업무 Cutover도 S3-3 별도 단위다. S3-4 릴리스/복구 승인 전 프로덕션 NO-GO 유지. 새 Admin 영속 UI/관리 화면 미포함; API 계약만 구현.
- **GHCR 예외:** 정확한 추후 squash 제목 `#109 | S3-2 Operational Auth/Admin API [G7-S3-2-NO-GHCR]` 및 23개 정확한 S3-2 파일만 제외, 예상 밖 활성 Migration/기존 CAD/Compose/runtime 파일은 CI fail-closed. 기존 S1/S2/S3-1 예외·일반 runtime/tag 게시 정책 불변, 이번 브랜치 CI까지만 진행.


## ADR-054 — #57 공통 Logger Schema v1/Emitter 단일화 (2026-10-27)

- **결정:** 기존 #18 `writeLog/RequestLogContext`를 앱이 소유한 JSON 로그의 단일 emitter로 유지하고 업로드별 별도 console 출력을 제거한다. 업로드 오류의 안전한 code/category/message는 공통 정적 Catalog에서 **재정제**, 임의 값/stack/내부 path·Locator/bytes·메타데이터 override 차단.
- **계약:** `timestamp/schemaVersion:1/level/event/component/operation/appVersion` 필수; `requestId/jobId/outcome/elapsedMs/httpStatus/errorCode` 선택, 확장은 `method/route/stage/backend/recoveryId/status/jobCount/error`로 제한. 공개 업로드 DTO·X-Request-Id·first failure 보존; 성공 Health 200만 debug, 다른 API 시작·종료 info 유지.
- **향후:** Breaking 필드 타입·의미 변경 시 별도 Schema version. Next/Nginx/브라우저/운영자 CLI는 app emitter 밖. 영속 저장/조회/권한·G7 운영 Auth는 #59~#63과 승인 게이트 이전 OFF. 상세 [Issue57](Issue57.md).


## ADR-053 — 홈 sticky·Three 단발 복구·Viewer overlay Drawer (2026-10-26)

[Issues124-126-127](Issues124-126-127.md)의 Manager 설계를 채택한다. 기존 색/글꼴/업무 동작을 유지하고 홈 한정 density를 축소한다. Three 실제 로드 실패에만 dxf 자동 대체 최대 1회, source/abort는 제외. 정상 대형 실측이 없어 자동 timeout/MB 임계값은 도입하지 않고 loading 중 명시 중단·대체를 제공한다. Adapter copy 때문에 peak memory/OOM 복구 보장은 하지 않는다. #38의 공간 점유 dock을 가장자리 overlay Drawer로 대체하고 상태·Canvas·Source 수명은 유지한다. 생성 OFF 정책 ADR-036 및 한 Escape 한 계층 ADR-033을 유지·확장한다. 운영 Auth/DB/API 활성화 없음.


## ADR-051-G7-S3-1 — Auto-migrator 충돌 예방·운영 Schema 타입 선반영 (2026-10-26)

- **결정:** 현재 `src/scripts/deploy.ts`는 기동 시 무조건 `prisma migrate deploy`를 실행한다. 이번 S3-1의 Auth DDL을 즉시 `src/prisma/migrations`에 넣으면 GHCR 게시 여부와 무관하게 **향후 일반 배포가 실 운영 DB에 미승인 Migration을 적용할 위험**이 있다. S3-1에서는 Prisma Client용 운영 `schema.prisma`에 G1~G4 모델을 반영하되 Auth DDL은 **Prisma 공식 candidate history** `src/deploy/g7-s3/prisma/migrations/202610260002_g7_operational_auth`로 분리한다. 활성 운영 migration history와 자동 migrator 그대로 두고, S3-4/5 별도 PR에서 Release/Owner GO 및 백업·실복구 완결 후 승격·적용을 재검토한다.
- **원본 동등성:** Candidate는 현재 CAD 6개 Migration을 바이트 단위 동일하게 복제한 후 G1/G4의 제약·감사 Site FK/append-only·User/AuthSession/Role/Site/SpecialGrant/RecoveryNonce·G3 제한을 신규 additive SQL로 담는다. 과거 CAD 테이블의 원본 행·Current/Version/SHA/Delete Hash/외래키를 변경하지 않으며, 진짜 Prisma migrate deploy는 UID 소유 `/tmp` fixture에서만 가능.
- **이중 게이트:** `G7-S3-AUTH-V1` capability, App+Migrator 버전·Source SHA·실 검증된 immutable OCI digest pair·Schema/FK/rollback·snapshot 증거와 릴리스별 Owner GO ID/Scope/기간/변경 ID/rollback Pair를 모두 요구하는 순수 검증을 추가. Flag default OFF, CAD Write 별도 OFF; 실패 시 거부. **사내 제출할 수 없는 실제 증거를 창작하지 않고, preflight는 런타임 Auth 활성화로 배선하지 않는다**.
- **비게시 병합:** 정확한 미래 Squash 제목 `#109 | S3-1 Operational schema and gates [G7-S3-1-NO-GHCR]`+S3-1 변경 경로 allowlist로만 Main GHCR Job을 SKIPPED; 다른 runtime/운영 Migration/Compose 경로는 fail-closed. S1·S2 기존 게시 예외를 확대하지 않는다. 이번 요청은 PR CI 시작까지만, S3 실제 배포/병합·GHCR/Issue 종료 제외.



## ADR-051-G7-S2-NO-GHCR — 내부 증거 준비 전용 Main GHCR 발행 차단 (2026-10-26)

- **정책:** S2 `g7-s2-readiness`는 운영 연동 코드가 아니라 사용자의 **사내 증거 비반출** 조건을 지키는 오프라인 점검 도구다. S1에서 이미 사용한 `G7-S1-NO-GHCR` 범위를 이 재사용 불가 작업에 억지로 확장하지 않는다. 별도의 정확한 squash 제목 `#109 | S2 private-evidence readiness [G7-S2-NO-GHCR]`을 사용한다.
- **허용 변경:** `.github/workflows/docker-publish.yml`, `AGENTS.md`, `out/{Decisions,FailureLedger,Issue109-S2-Readiness,Issue109,Operation,Requirements,TestPlan,TestReport}.md`, `src/scripts/g7-s2-readiness.ts`, `src/server/g7-staging/s2-readiness.ts`, `src/tests/unit/{g7-s2-readiness,g7-staging-ghcr-guard}.test.ts` **각 명시 경로만**. 범용 `*.md`, `src/server/g7-staging/*`, `src/prisma/**`, `src/app/api/**` 등의 와일드카드를 S2 허용하지 않는다.
- **Fail-closed:** Main branch에서 제목 첫 줄이 정확하게 일치하고 변경 파일 전체가 허용목록일 때만 `publish=false`. 제목 오타·후행 텍스트 또는 미승인 파일을 만날 경우 `stderr` 오류/exit 1, Main CI 전체 STOP하여 예기치 않은 GHCR 게시 회피. 정상 런타임/태그 릴리스 정책은 변경하지 않으며 S1 별도 룰 유지.
- **검증:** 실제 Bash release-scope를 독립 Git fixture로 실행하는 Unit에 S2 본문 포함 정상, 유사 제목, 운영 CAD/Prisma/Compose 및 S1 전용 파일/다른 Workflow 거부, S1 역방향 거부, 정상 런타임/태그 유지 사례를 추가한다. **PR CI 성공·Codex 리뷰/스레드/최종 Main scope 확인 전 병합하지 않는다.**
- **Owner 권한 경계:** S1 수용과 S2 준비 승인≠실 운영 Go-Live. OCI pair·사내 실복구 증거를 만들어내거나 GHCR 이미지·태그를 게시하지 않는다. #109/#96 OPEN/BLOCKED 유지.


## ADR-051-G7-S1-R2 — 잘못된 제목·운영 DB Migration의 사전 차단 (2026-10-26)

- [PR #125](https://github.com/planner77/layoutManager/pull/125) P1 #4374313158/3165/3173 교정: GHCR 건너뛰기는 커밋 메시지 **첫 줄의 정확한 승인 제목**에만 적용(본문 허용), 비슷한 제목은 Main CI 오류 종료. 비허용 변경 경로에서는 `echo >&2`/exit 1을 유지한다. Unit Test는 stdout/stderr와 부정 제목을 검증한다.
- Staging 독립 Prisma config는 이제 `G7_STAGING_DATABASE_URL`을 그대로 믿지 않고 `resolveG7StagingGate` 전체 비운영 검증을 통과한 실제 파일만 datasource로 전달한다. 경로/소유권/심볼릭 링크/스테이징 manifest/Schema/Origin/Stage 승인/두 URL·저장소 불일치 또는 기본값 누락 시 SQL **실행 전 차단**. 이 결정은 운영 migration 시점을 앞당기지 않고, 서비스 운영 기능을 ON 하지 않는다.
- 원래 G0~G6 Owner 업무/보안 범위와 #109의 S2 별도 Go/No-Go·S3 통제 단계 불변. 실패 Run과 리뷰 결함은 독립 실패 원장에 기록하며 새 CI 결과를 기다리지 않고 성공 판정하지 않는다.


## ADR-051-G7-S1-R1 — Stage 세션 쿠키 분리 및 단일 PR GHCR 미게시 (2026-10-26)

**Decision: S1 Staging만 허용, 운영 Go/No-Go 승인 아님.** 동일 hostname 내 서로 다른 port는 브라우저 Cookie 범위를 격리하지 않으므로 Stage 응답 Cookie를 `cad_staging_session; Path=/api/g7-staging`으로 변경하고 Request 단계에서만 G3/G4 내부 `cad_session`으로 정규화한다. 운영 인증 서비스/Route와 기존 CAD 읽기·쓰기 API는 변경하지 않는다.

사용자가 이번 S1 병합에 GHCR **미게시**를 명시했고 기존 [Main release-scope](../.github/workflows/docker-publish.yml)는 runtime source 변경에서 GHCR 게시 Job을 자동 실행한다. 이에 **정확한 squash 제목** `#109 | S1 Staging-only integration [G7-S1-NO-GHCR]`, `main` branch push, stage 코드/Stage Prisma·테스트 및 Markdown/해당 workflow **allowlist-only** 확인을 동시에 충족하는 경우에 한해 `publish=false`. 다른 runtime 경로가 포함되면 임의 게시 대신 Main CI 오류로 차단하며 일반 tag/다른 runtime 릴리스는 기존 원칙 유지한다. `g7-staging-ghcr-guard.test.ts` synthetic Git diff 테스트, CI 최신 HEAD 성공 및 Main GHCR Job SKIPPED 확인이 필수.

이 결정을 정상적인 상시 release 변경에 재사용하거나 `src/prisma/migrations`/일반 CAD API/Nginx/Compose/실 DB/CAD/S3에 S1 Auth를 연결하는 근거로 사용하지 않는다. [Issue109](Issue109.md), [Operation](Operation.md).



## ADR-051-G7-S1 — 단일 Staging 통합·운영 분리 (2026-10-26)

**결정:** #109 S1에 G1~G4의 서비스·DB 어댑터를 staging-only 서버 모듈로 이식하고 전용 Prisma Schema/Migration + `/api/g7-staging/[...segments]`를 구성한다. 단일 PR 내 구현하며 실 운영 Auth/Prisma/Compose/Proxy/CAD API는 그대로 유지한다. [Issue109](Issue109.md).

- **Release/Operation 이중 게이트:** staging-capable 코드 `G7_RELEASE_CAPABILITY=G7-S1-STAGING-V1`, 격리 릴리스 매니페스트 App/Migrator sha256 식별자·고정 source commit/schema ID 및 `G7_OPERATION_APPROVAL=S1-STAGING-ONLY`, `G7_AUTH_ENABLED=true`; 지정 `/tmp/cad-g7-staging-*/fixture.sqlite`와 앱 DATABASE_URL 동일/별도 CAD 저장소 검증. 값 미설정/불일치=404/기능 OFF. `G7_CAD_WRITE_CUTOVER_ENABLED=true`는 전자 유효 시에만 격리 쓰기 활성. 이 매니페스트는 **참조값 일치 검사**이며 OCI 실제 서명·레지스트리 해시 검증이나 **운영 Owner GO가 아님**.
- `src/deploy/g7-staging/prisma/migrations`는 기존 CAD 6개와 G1 확장 1개를 복제한 **독립 Prisma 히스토리**. 운영 migration 경로로 SQL 복사 금지, 운영 migrator 자동 적용 영향 0. G3 limiter, Account/Role/Site/SpecialGrant/Session/Audit/Nonce FK·Unique·append-only 및 Staging CAD 안전 Audit 포함. Admin 최초/복구는 별도 CLI 명시 호출만.
- G3 로그인·초기 변경·암호 변경·로그아웃·세션과 G4 Grant·disable·audit/permit는 원래 검증된 도메인/서비스 계약을 재사용. 새 CAD stage mirror의 POST/Current/DELETE는 Session/Role/Site(Version→DB Site)와 업무 변경+Audit를 단일 BEGIN IMMEDIATE 안에서 검증, DELETE는 기존 삭제 암호 AND. **기존 운영 CAD 멀티파트 Route는 이번 S1에 연결하지 않음**, S2/S3 전 별도 비교 필요. 기존 익명 GET/Viewer 불변, 신규 Memo/Outline/Type/Logs 영속 API 공개 금지.
- S2 Owner 운영 GO, 비공개 현장 증거 ID·관리자 Secret SOP·Audit 365일 이후 purge/백업·복구 세칙은 여전히 PENDING. STAGING 성공/PR CI/GHCR로 GO 자동 대체 금지.


## ADR-051-G7-PLAN — #109 기본 OFF·운영 승인·복구 설계 (2026-10-26)

**설계 계약만 작성 / 실행 승인 아님.** #108 G6는 Owner의 현장 검증 정상 보고로 종료됐지만 개별 비공개 로그/증거 ID는 독립 확인되지 않았다. G7 운영 증거 패키지 확인 및 Owner **별도** Go/No-Go 없이는 G7 #109·상위 #96 BLOCKED. [Issue109](Issue109.md).

1. **이중 게이트:** G7-auth-capable 앱 코드와 source SHA/immutable App+Migrator OCI digest pair·정식 Schema 호환을 확인하는 release gate, 별도 Owner GO 승인 ID/범위/유효 시간·운영 manifest·`G7_AUTH_ENABLED`를 확인하는 operation gate. 미설정/false·부정확한 값은 OFF, 정확히 true라도 release/GO/Schema 불일치면 fail-closed. **현재 실제 런타임에는 이러한 flag·라우팅이 구현되지 않았으며 설계 이름만 정의**한다.
2. **쓰기 별도 cutover:** `G7_CAD_WRITE_CUTOVER_ENABLED`는 기본 false·Auth OFF 시 강제 OFF. 기존 CAD GET/Viewer/원본 익명 유지. POST/Current는 인증 Editor 이상+담당 Site, DELETE는 추가 기존 삭제 비밀번호 AND, 서버 권위 Session/Role/Site/Version·업무 변경+Audit 원자성. 인증 오류에서 익명 write fallback 금지. Admin도 타 Site 자동 권한 없음.
3. **독립 범위:** 신규 Outline/Memo/Type/Logs/Audit/Admin 영속 API는 각 개별 DB/권한·QA 승인이 있어야 운영 노출. `audit:read`와 `logs:read` 독립, Audit 365일 초과 purge는 주기·백업/복구·법적 예외 세칙 미승인으로 물리/자동 실행 금지.
4. **승인 후 절차:** 운영 쓰기 정지→동일 snapshot ID의 SQLite 안전 backup+CAD local+S3 실 Restore 확인→고정 App/Migrator pair의 정식 migration→FK/Version/Current/Source SHA 불변 확인→기본 OFF 기동·익명 GET 점검→단발 Admin→Auth ON→별도 CAD write 전환·현장 E2E→Owner 운영 수용. 장애시 쓰기 중단·세션 폐기, 이전 호환 App/Migrator 쌍과 **동일 snapshot DB/CAD/S3 전체 복원**, 신/구 Schema 혼용 금지.
5. ADR-051-R1의 HTTP 잔여 위험 `OWNER_ACCEPTED_SCOPE`는 안전성 PASS가 아님. TLS/MFA/침투·적대적 탈취시험을 추가 필수 게이트로 되살리지 않되 정상 업무/권한·복구·Owner GO는 필수. 지금은 **docs-only / 운영 실행 0**.


## ADR-051-G6 — #108 실제 현장 증거와 합성 준비물 구분 (2026-10-26)

- **결정:** G6 코드 범위는 비연결/offline 자체 기입 증거 상태 평가와 disposable SQLite+합성 CAD/mock-S3 백업·격리 migration·Restore 리허설로 한정. 실 사내 PC 2대 PROD Nginx/DEV 분리, G3 Cookie/G4 업무 Route 정상 E2E, 동일 시점 **실** DB/CAD/S3 bytes 보존·운영 Prisma dry-run·실 restore/rollback은 별도 Owner 비공개 증거 필요. 공개 Git에는 TC/AC/Run/HEAD·EV 증거 ID/상태만.
- **금지:** 합성 테스트 PASS·manifest READY_FOR_OWNER_REVIEW·#107 GHCR SUCCESS를 #108 실 수용 또는 #109 Go/No-Go로 대체하지 않는다. 기존 익명 CAD GET/Viewer 보존, 미래 POST/Current Editor+Site, DELETE Editor+Site+기존 암호 AND. Audit 365일 자동/물리 purge SOP 미승인.
- 신규 운영 Auth/Admin/Outline/Memo/Type/Logs/Audit API, Prisma/DDL/DB, Compose/Nginx/.env/실 CAD/S3/GHCR 변경·활성화 0. R1 OWNER_ACCEPTED_SCOPE는 공격·탈취 E2E 비범위이지 정합성/복구 시험 면제 아님. [Issue108](Issue108.md).


## ADR-051-G4-P1 — #106 Scoped Audit에 Authoritative Site 유지 (2026-10-26)

**P1 결정:** G4 인가 성공·거부/Outline Create·Edit·Delete 안전 감사는 반드시 같은 transaction에서 확인한 **DB Version→Site**를 `AuditEvent.site_id`로 보존한다. 글로벌 Auth/Grant Role/Session 사건은 Site를 임의 생성하지 않는다. G1 fixture CHECK는 Site Grant/Revoke에 영향 사용자+Site 필수, Outline 사건 Site 필수, Authorization 사건에는 SITE/VERSION/OUTLINE Scoped target의 non-null Site만 허용, 일반 Action은 Site NULL을 유지한다. `CadSite` FK/append-only trigger 유지. 구 HEAD `53b75ca`의 감사 Site NULL은 [r4373235027](https://github.com/planner77/layoutManager/pull/120#discussion_r4373235027)에서 발견된 결함으로 분류한다.
**동반 수정:** 구 HEAD `seedCad`의 동일 Product/동일 이름 `Site` 중복은 실 CAD `uq_site_parent_name` 위반으로 CI의 G4 9개 테스트가 공통 beforeEach에서 실패한 직접 원인. 각 Site 고유 이름과 Assertion으로 교정. 관측 실패와 코드 리뷰 추가 위험은 [FailureLedger](FailureLedger.md)에 구분 기록한다.
**운영 승인 아님:** 실제 Prisma/Route/Origin/Compose/Nginx/DB/CAD/S3·익명 CAD GET 변경 및 Audit physical purge/배포 없음. G7 #109 별도 Owner Go/No-Go 전 OFF. [Issue106](Issue106.md).


## ADR-051-G4 — #106 Role/Site/Version·Grant·Audit 트랜잭션 (2026-10-26)

**결정:** #102 G0 업무 6개 정책과 G1/G2/G3를 재사용. G4 서버 Store는 G1 임시 DB의 BEGIN IMMEDIATE에서 G3 Session(유효성·8h/30m·회수)와 현재 DB User/Role/Site/SpecialGrant, Version→Location→Building→Site를 재조회한다. Admin만 Role/Site/Special Grant·계정 변경, Admin이어도 Site 자동 전체 권한 없음. Grant 철회 즉시 403, 세션 무효 401, Audit/DB 오류 503 fail-closed. Unique/FK 및 마지막 유효 Admin 보호. 권한 성공·거부/Grant·가상 ShadowOutline 변경과 Actor/affected/site/Revision/outcome/UTC/requestId 안전 Audit은 동일 transaction으로 commit/rollback한다. Audit는 append-only·365일 보존 경계만 명세; 실제 물리 정리/백업본 삭제 SOP 미승인으로 금지. audit:read와 logs:read는 별도의 Admin SpecialGrant다.

기존 CAD GET/Viewer/원본은 익명 허용. POST/Current Editor 이상 + 실제 Site, Version DELETE는 이에 **기존 삭제 비밀번호 AND**. G4 cad:delete 허용은 역할·Site 필요조건 확인이며 삭제 비밀번호·최종 Version 삭제 승인 아님. 실제 운영 API/Prisma/migration/Compose/Nginx/실 DB/CAD/S3 **OFF**, #109 G7 Owner Go/No-Go와 G6 #108 현장·복구 승인 후 별도 연동. 실제 CadOutline은 #98, logs:read 소비자는 #60. [Issue106](Issue106.md).


## ADR-051-G3 — #105 격리 DB Session과 초기 변경 (2026-10-26)

**Manager 설계 결정 / 운영 승인 아님.** [Issue105](Issue105.md), #102 Owner R1, 기존 G1/G2를 따른다.

- G1이 must-change 계정의 일반 세션 발급을 거부하므로 초기/복구 로그인은 403 PASSWORD_CHANGE_REQUIRED만 반환한다. 현재 credential 재입력→암호·flag·전체 revoke·Audit 원자 변경→fresh login을 선택한다. provisional session/schema 없이 기존 DB 제약을 보존한다.
- 로그인 발급은 scrypt 검증 이후 transaction 안에서 같은 passwordHash/현재 계정 상태를 재검증하고 count/insert/Audit을 묶는다. 과거 credential 확인 후 동시 recovery/disable이 있었는데도 새 세션을 발급하는 경쟁을 허용하지 않는다.
- Actor는 유효 session과 현재 DB grants의 결과만 사용한다. 기존 공개 CAD GET에 인증을 붙이지 않으며 G4의 미래 업무 권한 판정과 분리한다. G4 write는 거래 안에서 권한을 다시 확인한다.
- 기존 HTTP cookie/Origin/CSRF/limiter의 정상 흐름을 유지하고 Owner가 제외한 공격 대응/침투시험을 새 완료조건으로 추가하지 않는다. 실제 LAN E2E는 G6, 운영 Auth/API/Prisma/Compose 연결은 G7 후속이다.
- 이번 전달 범위는 구현·검증·문서 및 PR 리뷰/충돌 조치·CI 시작까지다. CI 모니터링/병합/Issue 종료/GHCR 게시/배포는 수행하지 않는다.

## ADR-051-G2 — #104 단발 Admin 생성·복구, Secret 보호 (2026-10-26)

**범위:** G2 격리 구현 결정/운영 승인 아님. #102 지정 운영 담당자 실행·Owner 책임, #103 G1 SQLite 계약 준수. [Issue104](Issue104.md).
- `executeAdminSetup`는 명시 호출만, Linux/WSL2 실행 UID 소유 absolute Secret regular file(0400/0600, O_NOFOLLOW, 유효 UTF-8·NUL/CRLF 거부)에서만 비밀번호 취득·scrypt(local-v1) 사용. 0444 Compose Secret 기본 마운트/Windows 직접은 fail closed; JS 문자열 완전 zeroize는 보장하지 않음.
- 최초 생성: 인증 관련 전 테이블 공백 확인을 `BEGIN IMMEDIATE` 안에서 재검증해 User UUID/Admin RoleGrant/`ADMIN_BOOTSTRAP` Audit 한 거래, username ASCII lowercase·must-change. 동시성·기존 사용자 승격/재기동 Hash/Role/ID 변경 차단.
- 복구: 기존 ACTIVE Admin + SHA-256 nonce Unique/append-only, password hash/필수 변경/모든 세션 revoke/`ADMIN_RECOVERY` Audit 한 거래, 실패·replay 전체 rollback. Auth되지 않은 운영자 실행이므로 Audit actor=null/affected_user_id=대상 Admin; requestId를 사내 비공개 운영자 수행 기록과 연계.
- `--ack-isolated` 임시 G1 SQLite 전용 CLI 이외 App Runtime/운영 Prisma/Auth Route/Compose/DDL 연결 0. G7 #109 별도 Owner Go/No-Go 전 OFF, G6 백업·실복구 선행. Owner R1 공격/탈취 강화는 비범위지만 Secret 비로그/데이터 무결성 필수. #102 PR #114 main 병합 및 POST 업로드 Editor/Admin+담당 Site 업무 정책 승인 완료. G0 이슈 #102과 Audit 파기·백업 세칙은 후속.

## ADR-051-R1 / #102 G0 Owner 업무 정책 5개 승인 (2026-10-25)

**정책 확정 / 구현·운영 활성화 미승인.** 아래 여섯 개 Owner 명시 결정은 ADR-051-R1 및 이전 ADR-048/049/051 중 상충하는 권장/미확정 표현보다 **최우선**으로 적용한다. [Issue102](Issue102.md) 참조.

| ID | Owner 승인 | 경계와 후속 |
| --- | --- | --- |
| G0-BIZ-01 | **사내망 익명 CAD 조회 허용** | 기존 공개 CAD 목록·검색, 위치·버전·Current 메타데이터, Viewer, 원본 DXF/DWG GET/다운로드는 **로그인·SiteGrant 없이** 유지. 익명 Actor/Reader를 만들지 않고, 공개 도면에 Site별 기밀성 필터를 주장하지 않는다. 신규 Outline/Memo/Type 영속 GET, 로그·Audit·관리 UI는 이 승인에서 제외 |
| G0-BIZ-02 | **Current 지정은 Editor 이상 + 담당 Site** | 등록된 계정/세션으로 확인된 Editor·Admin 및 서버가 확인한 Site/Version Grant. Admin도 다른 Site 자동 접근 불가. 기존 PUT 경로는 G7 전에 변경 없음 |
| G0-BIZ-03 | **Version 삭제는 Editor 이상 + 담당 Site + 기존 삭제 비밀번호 유지** | 로그인·업무 Grant·기존 비밀번호의 **논리 AND**. 삭제 암호만 있거나 다른 Site면 거부. 삭제 감사 Actor/Revision 불변식 및 원본/Current 보존. 현재 DELETE 구현은 G7 전 그대로 |
| G0-BIZ-04 | **최초 Admin/복구는 지정 운영 담당자가 실행, Owner가 운영 책임** | 실제 담당자/Secret file/SOP와 단발 복구 절차는 #104·사내 운영 기록에서 구체화. 자동 재시작 재설정 불허 |
| G0-BIZ-05 | **Audit 365일 보존 후 만료 기록 정리** | 365일 이내 append-only. 365일 경과 기록 정리 **방향만 승인**, 실제 실행 주기·물리/자동 파기 방법·백업 사본 보존/복원·예외는 #106/#108/#109 세칙 승인 전 **보류** |
| G0-BIZ-06 | **도면 등록 POST = 로그인 Editor 이상 + 담당 Site** | 기존 CAD 익명 조회 범위 밖; 등록 시 Actor·Site/Version·Audit 확인. 운영 기능 G7 승인 전 OFF |

**Owner 승인:** 기존 `POST /api/cad-files`의 Editor+담당 Site 등록 권한 추가 확정(G0-BIZ-06). **미승인:** 신규 영속 API 익명 READ 확장. PROD Nginx/DEV 직접 접속 실배치·실명 담당자/비밀 경로·백업 세칙은 후속 게이트에서 확정한다. 현재 공개 CAD 조회·등록·Current·삭제 API의 실제 동작, 원본 DXF bytes/SHA, CadFileVersion/Current, 삭제 비밀번호는 **변경 0**.

**G0 재평가:** AC1 = Owner 업무 정책 6개 확정 및 운영 세칙 후속 인계, AC2 = HTTP 공격·탈취 대응 비범위 Owner 수용(안전성 PASS 아님), AC3 = 배포/기능 OFF, AC4 = 이 문서의 PR CI/리뷰/병합 근거 필요. G0 설계 계약 확정과 **G7 운영 활성화는 별개 승인**이다.


## ADR-051-G1-R2 — SiteGrant 감사 피감사 사용자 추적 및 검증 게이트 (2026-10-26)

- [PR #116 리뷰 P1](https://github.com/planner77/layoutManager/pull/116#discussion_r4371167619): 관리자 actor + Site ID만 기록하면 동일 Site 여러 사용자에 대한 Grant 철회가 발생했을 때 대상 사용자를 복구할 수 없다. **결정:** `AuditEvent.affected_user_id` (User FK) 및 `site_id` (CadSite FK)를 각각 둬서 Site grant/revoke 이벤트에 필수로 기록하고 원장 UPDATE/DELETE 금지·Grant/Audit 원자성을 유지한다.
- 적용은 G1 격리 Fixture SQL·Prisma 참조 투영·Integration Test에 한정. G0의 기존 CAD 익명 GET 승인 및 운영 G7 별도 승인 경계는 유지. 첫 CI TS 구문 실패를 정상 컴파일/테스트 PASS로 오인하지 않고 신규 HEAD CI로 재검증한다.



## ADR-051-G1 — Issue #103 비운영 SQLite·Prisma 계약과 원자성 구현 결정 (2026-10-25)

**상태: 격리 구현·검증용 기술 결정 / 운영 배포 승인 아님.** [#103](Issue103.md)은 [ADR-051-R1](Issue102.md)의 사내 LAN 경량 보안 범위와 D1~D5 업무 무결성을 따른다. 2026-10-25 #102 Owner 5개 승인: 기존 CAD 목록/Viewer/다운로드 익명 GET 유지, Current=Editor/Admin+담당 Site, Version 삭제=Editor/Admin+담당 Site+기존 삭제 비밀번호, 최초 Admin/복구=지정 사내 운영 담당자(Owner 책임), Audit 365일 경과 이력 정리 원칙. 관련 문서 PR #114는 병합·CI 완료 미확인. POST 업로드 권한, Secret/실 담당자, Audit 물리 정리·백업 복원 세칙, 실제 배포는 PENDING; #103 G1 운영 활성화 승인 아님.

- `src/tests/fixtures/auth-g1/schema.prisma`는 User/Session/Role/Site/Special/Audit/Nonce **물리 모델 참조**이며 기존 `CadSite`를 부분 투영한다. 실제 적용 가능한 SQL은 동일 fixture `migration.sql`; 이 Prisma 투영으로 `prisma migrate`/push를 돌리는 것은 **금지**. 실행 Fixture는 기존 6개 CAD Migration을 우선 적용한 `cad-auth-g1-*/fixture.sqlite` 일회용 사본만 허용하며 G7 승인 전 정식 `src/prisma/` 경로에 반영하지 않는다.
- SQLite 쓰기 직렬화 `BEGIN IMMEDIATE` + DB 트리거로 8h 절대/30m idle/3개 active 동시 세션을 확인하며, 재활성화/clock rollback/4번째 원시 SQL INSERT도 기본 거부. 비밀번호/원시 Session 토큰/복구 nonce 원문/전체 CAD Geometry는 이벤트·DB에 저장하지 않는다. 계정 ID 불변, Role·Site·Special FK/Unique/값 범위, 명시적 Site 소유권 확인.
- Admin만 Grant 변경. 각 Role/Site/Special 변경+안전 Audit는 원자 commit/rollback. 비활성/관리자 복구는 세션 회수와 함께 수행. nonce hash insert(unique)+passwordHash 갱신+세션 폐기+Audit는 단일 트랜잭션. Audit/소비 nonce는 append-only; Audit 365일 경과 이력 정리 원칙은 Owner 승인됐지만, 실제 자동/물리 파기·백업/복원 SOP는 후속 결정·검증 전까지 금지.
- 격리 SQL 테스트 결과만 G1 증거. 실제 사내 CAD/DB/S3 백업·복구, 배포 인입 경로, 기존 API 인증 전환, Admin secret 절차는 #102/#104~#109 책임으로 유지. 상세 근거/롤백 [Issue103](Issue103.md) 및 [Operation](Operation.md).


## ADR-051-R1 — #102 내부망 경량 보안 범위 재결정 (2026-10-25)

**Owner 결정 승인 / 운영 활성화 미승인.** 기존 ADR-048/049/051 및 #96 D1~D6 가운데 공격 방어·탈취 대비가 **G0~G7 진행을 차단하는 보안 게이트**였던 부분을 다음과 같이 개정한다. 상세 [Issue102](Issue102.md).

1. **전제:** 외부 공개망으로부터 인바운드 접근이 제한된 사내 업무망의 내부 사용자끼리 사용한다. PROD 접속은 **사용자 PC → Nginx → App**, DEV 접속은 **개발 PC → 개발 App 직접 연결**이다. 경로는 기능/배포 정합성으로 확인하며 실제 IP/CIDR·포트/Secret은 비공개.
2. **명시적 범위 제외:** 공격 방어 수준 고도화, 인증정보·세션 탈취 공격 대응, 모의침투/취약점 스캔·공격 실증, TLS/HTTPS·OIDC/SSO/MFA, 방화벽/CIDR별 위협 방어, Host/Forwarded/Origin 위조·CSRF·브루트포스 적대적 E2E 및 별도 보안 위험 서명은 필수 수용 기준이 아니다. 이전 문서의 '보안 공격 테스트 0건 통과 없이는 G7 금지'는 **R1이 대체**한다.
3. **위험 지위:** Owner는 HTTP 평문 비밀번호/세션 도청·변조, 탈취·재생, 최소 8자 비밀번호와 관련된 위험이 **여전히 존재함을 인지한 채 추가 보호를 범위 밖으로 수용**한다(`OWNER_ACCEPTED_SCOPE`). 이는 안전하다는 주장이나 기술 검증 PASS가 아니며 공격방어 보완을 실행했다는 의미도 아니다. 업무/운영 미확정은 여전히 PENDING이다.
4. **유지하는 기능:** 이전 승인 D1~D5의 로컬 계정/1회 bootstrap·복구, 최소 8자+scrypt, 8h 절대·30m idle·최대 3개 세션 및 회수, Reader/Editor/Admin·Site/Version Scope, 365일 Audit·별도 열람 권한, DB/Grant/Session 원자성·업무 정합성·비밀 로그 제외·백업/복구/원본 DXF·Current/SHA 불변. 기존 비활성 Origin/CSRF/Session helper를 자동 삭제/무력화하지 않는다.
5. **릴리스 게이트:** G0 #102은 접속·업무 범위/잔여 운영 결정을 정리, G5 #107은 PROD Nginx/DEV direct **정상 연결/배포 경로**, G6 #108은 **기능 E2E·DB/CAD/S3 Backup/Migration dry-run/Restore**, G7 #109는 **Owner 별도 Go/No-Go**로 역할 축소. 인증/관리/영속 API 및 운영 Prisma·Nginx·Compose 실제 변경은 G7 승인 전 OFF.
6. **기존 API 전환:** 기존 공개 CAD 목록·Viewer·원본 GET는 **사내망 익명 허용**. 도면 등록 `POST /api/cad-files`·Current PUT는 **로그인 Editor 이상+담당 Site**, Version DELETE는 **Editor 이상+담당 Site+기존 삭제 비밀번호**(AND). G0-BIZ-01~06 Owner 정책 승인. 신규 Outline/Memo/Type/Logs/Audit 영속 GET 익명 개방은 미승인, G7 이전 기존 API 불변.

**효력:** ADR-051-R1은 본 이슈의 이전 공격 중심 PENDING/개별 보안 실증 선행 게이트 서술보다 우선한다. 타 작업의 데이터 무결성·업무권한 검증 및 실 운영 배포 통제는 완화하지 않는다.


## ADR-052 — #99 실 CAD P0/P5 수용 증거 분리·자동 게이트 fail-closed (2026-10-25)

### ADR-052-R1 — Private DXF evidence symlink 차단·릴리스 후보 버전 (2026-10-25)

- 원본 검증은 기존 `realpathSync`로 Git checkout과 source file, **출력 부모**의 canonical file-system 경로를 비교하는 것으로 보강. 단순 `resolve`는 Symlink를 따라가지 못하므로 검증에 사용하지 않는다. 결과 파일 이름은 미사용이어야 하고 기존 결과/심볼릭 링크는 덮어쓰지 않는다(`wx`/0600). 사내 승인된 출력 부모 디렉터리의 권한과 안정성은 현장 작업자의 책임이다.
- 본 변경은 공개 CI의 실DXF 수용 근거가 아니며 Owner 현장 판정은 계속 BLOCKED. 이미 존재하는 `v0.40.2` Git tag와 GHCR immutable 릴리스를 재사용하지 않도록 신규 App/Migrator 쌍 후보 `0.40.3` package/lock를 준비한다. **최신 HEAD CI 성공·리뷰 0·무충돌** 후에만 main squash→조건부 GHCR 신규 릴리스; 시작을 게시 성공으로 주장하지 않는다. [Issue99](Issue99.md), [FailureLedger](FailureLedger.md).



- **결정:** Synthetic PR CI·SOURCE-only CPU·비공개 Browser 5회 관측과 최종 실 CAD 좌표/면적·Render 매핑/장치 GPU 운영 수용을 분리. 승인된 실제 SHA 3개 이상 및 1k/10k/100k, CAD WCS XY·relative area·Handle/instancePath/BLOCK/OCS·곡선/Hole 지원 Matrix, click/box/layer/zoom/pan/ESC/fullscreen/Worker cancel, CPU/heap/frame·외부 GPU 장비 근거가 모두 있어야 최종 Owner 판정 대상으로 올린다. 미측정 항목은 PASS 대체 불가.
- **정확성/성능 Budget:** 허용 최대 CAD 오차(도면 단위/상대 면적), parse/index/query, browser load/box p95/rAF frame, heap 및 외부 VRAM은 Owner가 현장 운영 SLA로 **사전 결정**해야 하며 지금 임의의 ms/bytes 수치를 승인하지 않는다. 현장 기준 5회 p95(nearest rank)는 참고 최소 표본. 1k/10k/100k 구간은 분석된 supported entity 500–4,999/5,000–49,999/50,000–1,000,000로 분류한다(실 측정 대상의 정보이지 renderer 보장치 아님).
- **증거 게이트:** `src/tests/benchmark/outline-acceptance-gate.ts`는 비공개 manifest 입력 검증 후 `BLOCKED` 또는 `READY_FOR_OWNER_REVIEW`만 반환한다. latter는 실제 측정 진위 또는 운영 합격이 아니다. `audit:outline` schema v1 + `outline.acceptance.ts` schema v2를 연결하며 SHA mismatch·3종 부족·반복 부족·오차/SLA 초과·불명확한 지원/제외·GPU 증거 없음/인간 기능 확인 없음은 차단한다. 기능 미지원은 제외 건수를 기록하며 필수 특징의 실검증 누락은 차단.
- **권한/데이터:** 실제 DXF·위치·레이어·Handle·로컬 경로·GPU 장비 상세는 사내 비공개로 유지, artifact·로그/Issue에는 비민감 결과코드와 승인 증거 참조만. 실제 Browser 테스트가 추가한 version은 별도 폐기 DB/Storage에만 남도록 현장 운영자가 격리한다. 원본 bytes/SHA/Current, 기존 API/Prisma/인증/Viewer/GHCR 동작 불변.
- **승인 경계:** #31 P0/P5→#99 독립 AC, #96 D1/#97 D2/#98 D3 및 #65/#71/#73 운영 승인과 별개. CI 성공/PR 병합은 실 CAD PASS나 신규 권한/서버 API 활성화 근거가 아님. [Issue99](Issue99.md), [TestPlan](TestPlan.md), [TestReport](TestReport.md).


## ADR-051 — Issue #96 D1~D6 Owner 정책과 운영 차단 (2026-10-25)

**상태: 세부 정책 승인, 운영 API/DB/배포 미승인.** ADR-048/049의 사내 LAN HTTP·앱 로컬 계정·Role/Site 권한 계약을 보완하며, 구 D0 미확정 표현보다 본 기록이 우선한다.

- **D1:** .env 플래그로 최초 Admin 생성 및 관리자 분실 시 명시적 단발 복구를 선택한다. 설정에는 사용자명/대상 불변 ID/복구 일회 ID/Secret 파일 경로만 허용하며 **비밀번호 원문은 .env에 넣지 않음**. 이미 초기화된 DB의 Admin·권한을 재기동 시 자동 변경하지 않는다.
- **D2:** 최소 8자, 초기 암호 강제 변경, 로그인 시도 제한. 기존 삭제 암호와 분리한 scrypt(local-v1, 16-byte salt, bounded work) 선택; 새 Argon2id 패키지는 도입하지 않음. NIST SP 800-63B-4의 단일 요소 비밀번호 최소 15자보다 완화된 정책임을 고지하며 준수라고 주장하지 않는다.
- **D3:** 서버 절대 만료 8h/미사용 만료 30m/최대 3개 동시 활성 세션. 원본 token 저장·로그 금지, SHA-256 digest와 HttpOnly/SameSite Cookie. 네 번째 발급은 거부, 로그아웃·계정 비활성·암호 변경 시 기존 세션 폐기.
- **D4:** Admin만 Role/Site 권한 부여·회수, Site 범위 자동 전체 부여 금지. Version의 Site는 서버 권위 DB 조회. audit:read 및 logs:read는 Admin이라도 별도 허가 필요. Memo Editor 공동 편집 미승인.
- **D5:** 허용된 안전 필드만 append-only 감사 원장에 보존하고 별도 audit:read Admin만 조회. 보존 기간 365일. 기한 이후 삭제·백업/복구·물리 파기는 별도 승인 전 자동 실행 금지.
- **D6:** 지정 사내 LAN CIDR/OS 방화벽/Reverse Proxy/backend 직접 접속 제한과 Owner의 HTTP 잔여 위험 수용 원칙 승인. 실제 CIDR 및 검증 기록 미제공; LAN을 TLS로 간주하지 않는다.
- **결정의 적용 범위:** 독립 domain/helper/fixture/tests/doc만 허용. 실 운영 Session/Role/Grant/Audit DB 트랜잭션·계정 복구와 Secret 보호/프록시 실증·DB backup/migration/restore·실제 LAN 권한/CSRF E2E/Owner 배포 승인 전 신규 로그인/관리·로그·Outline/Memo/Type 영속 API 및 Prisma DDL **OFF**. 기존 CAD 원본/Version/SHA/Current 불변.

[Issue96](Issue96.md), [Architecture](Architecture.md), [Database](Database.md), [Requirements](Requirements.md), [TestPlan](TestPlan.md), [Operation](Operation.md).



## ADR-050 — #97 P4-D2 Server-owned DXF Canonical + Rigid Transform (2026-10-25)

- **결정/경계:** ADR-048/049·#31 D0의 P4-POL-04 구현을 #97에 한정. 기존 `attestation.ts`의 immutable bytes SHA, Version, unit, stable root Handle 및 canonical CONVEX/PRECISE XOR 비교를 유지하며, 새 `server/outline/transform-attestation.ts`는 Server 입력 bytes만으로 baseGeometry와 effectiveGeometry를 계산한다. Browser GeneratedDocument는 신뢰 근거가 아니다.
- **계약:** 기존 v1/v2 browser export 그대로 수용. 편집 D2 확장은 원본 `baseGeometry` claim, 최대 64개의 순서 있는 `transformOperations` (Translate/Rotate·pivot), 마지막 `geometry` claim, 검증용 선택적 6원소 `transform`이다. Raw affine 단독, Scale/Shear/Reflect/Z, 비유한·초과 좌표/각도/미승인 알고리즘·tolerance는 거부. CCW+deg, 2D affine 좌측 합성, 좌표 상한 ±1e12, server tolerance 0.02 Drawing Unit. Polygon/MultiPolygon/Hole topology·링 면적·winding은 서버 검증하며 Client geometry를 반환값으로 신뢰하지 않는다.
- **Stable identity의 한계:** 현재 DXF parser는 stable root INSERT Handle/WCS expanded geometry만 제공하고 nested child `instancePath`를 발급하지 않는다. 따라서 선택적 sourceEntityRefs의 비어 있지 않은 `instancePath`는 지원한다고 가정하지 않고 **fail-closed**. Duplicate/missing handles, unsupported OCS/BLOCK, partial source geometry 역시 거부. 고 WCS 원점에서의 면적 상쇄를 방지하기 위해 원점 상대 삼각형 면적 계산을 사용.
- **보안·수명:** 이 검증기는 AuthN/AuthZ·Source Storage retrieval·D1 role/site scope·D3 CAS/Prisma/Audit/HTTP CRUD가 아니다. 서버 UUID가 아닌 browser local ID만 통과한다. #96/#98/#99의 Owner 보안·DB·현장 수용 게이트는 여전히 미완/활성화 금지, Current/원본 DXF 불변. #56 미래 `objects[]` 브라우저 파일은 명시적 변환 adapter가 생기기 전 서버에 자동 등록하지 않는다.
- **근거/검증:** [Issue97](Issue97.md), [TestPlan](TestPlan.md) TC-P4-D2-001~009, [TestReport](TestReport.md). 코드와 Unit 작성은 실제 CI·현장 PASS의 증거가 아니다.

## ADR-049 — #31 P4 GENERATED 외곽선 영속 ID·기하 검증·논리 삭제·메모 연계 (2026-10-25 / D0 Owner 정책 승인)

- **상태:** Owner 업무 정책 확정 / 설계 계약만 승인. 구현·DB migration·Server GET/CRUD·릴리스 미승인; #31 OPEN. ADR-042/044/046/047의 브라우저 임시 작업 계약과 원본 DXF 불변은 유지한다.
- **식별:** SOURCE는 변경 불가능한 DXF Version+SHA256+검증된 unique Handle+필요한 instancePath, GENERATED는 서버 발급 불변 UUID와 Version/SHA를 사용한다. 브라우저 UUID/local-N은 영속 ID로 인정하지 않으며 신규 저장 응답에서 매핑한다. 미확인/중복 Handle, unsupported OCS/BLOCK은 저장 참조 거부.
- **외곽선 타입:** CONVEX/PRECISE `kind`(기하)와 전역 `OutlineType.id`(업무 분류)를 분리한다. #65 카탈로그는 전체 앱 공통, 서버에서 활성 타입과 ID/FK를 검증한다. 명칭의 Unicode case-fold/중복 세부값은 이 후속 DB 검증에서 확정.
- **서버 소유 기하:** 신뢰되는 불변 원본 bytes SHA→Stable SourceRefs→WCS XY Canonical `baseGeometry`(기존 0.02 Drawing Unit 서버 고정 tolerance, 알고리즘 버전 명시)→허용된 Translate/Rotate 강체 2D affine `transform`→서버 `effectiveGeometry` 계산/검증. client geometry·JSON·raw affine·권한 claims를 그대로 신뢰하지 않는다. Scale/Shear/Mirror/Z/임의 vertex 수정은 초기 범위에서 금지하며 허용 범위·오차 초과는 실패로 처리한다. #54/#55 편집 결과는 이 확장 검증기 승인 뒤에만 서버 저장 가능; 현재 canonical-only attestation이 edited geometry를 승인하는 것은 아님.
- **공동 편집/충돌:** 서버 확인된 Site·Version Scope에 속한 Editor는 작성자가 다르더라도 GENERATED 외곽선을 수정·논리 삭제할 수 있다. `createdById`는 불변, `updatedById` 및 revision은 매 변경 시 기록한다. atomic CAS(expectedRevision) 불일치=409, partial write 금지. 이는 메모(#83)의 Editor 정책까지 자동 승인하는 것이 아니다.
- **삭제:** `status=DELETED`, `deletedAt/By` 등으로 논리 삭제하고 append-only 감사 이벤트를 보존한다. 정상 목록/선택·Export에서는 기본 제외; 물리 파기·복구 API는 별도 Owner 결정 전 금지. Version 삭제 시 FK/감사 보존 정책은 미확정이므로 삭제 경로 확장 구현을 차단한다.
- **메모 참조:** 서버 영속 GENERATED가 삭제되면 동일 트랜잭션에서 연결된 메모의 마지막 정상 WCS 위치를 보존하고 참조를 해제해 `BROKEN_ANCHOR`로 표시한다. 자동 다른 객체 재스냅/메모 동반 삭제 금지. #83/#84가 구현되기 전 기존 Browser 생성 객체의 스냅은 세션 전용이고 서버 보존을 주장하지 않는다.
- **표시:** 외곽선 개별/그룹 Show/Hide는 사용자 세션별 화면 상태이며 서버 공유 `CadOutline.visible`로 저장하거나 다른 사용자에게 전파하지 않는다. 새로고침/다중 탭 사이 상태의 지속 기간은 별도 결정; 트리 #73·Layer Visibility와 독립.
- **미확정/차단:** 감사 보존 기간, Version 삭제 FK 및 고아 데이터 처분, 복구·물리 삭제, 세션 visibility lifetime, 실 DXF P0/P5 수용치, UUID 이관/legacy typed 정책. 필요한 결정과 구현·회귀·백업 승인 전 실제 CadOutline API/Prisma migration/운영 복원은 BLOCKED. 관련 #49/#54/#55/#56/#65/#71/#73/#83/#84/#91.
- **범위:** DXF + three-dxf-viewer 우선, DWG와 dxf-viewer의 확대 해석 금지. 원본 DXF, Current Version, 로컬 E2 Undo/Redo, JSON v1/v2 계약 유지. [Issue31](Issue31.md), [Database](Database.md), [Architecture](Architecture.md), [TestPlan](TestPlan.md).

## ADR-048 — #31 P4 사내 LAN HTTP·앱 로컬 계정 및 공통 Role/Scope/Audit (2026-10-25 / D0 Owner 정책 승인)

- **상태/목적:** Owner가 **인터넷 공개망 인바운드 제한 + 여러 PC가 서버 IP의 HTTP로 접속하는 사내 LAN**을 선택하고, 계정을 주로 업무 권한·작업자 식별·변경 이력 관리에 사용하기로 확정했다. 앱 로컬 계정과 서버 관리 세션으로 통일; OIDC/SSO/MFA/HTTPS/TLS 구축은 이번 범위에서 제외. 과거 #31/#41/#60/#65/#83의 OIDC 우선 또는 인증 방식 미정 기록은 역사 기록이며 본 Owner 결정이 우선한다.
- **위험 경계:** 일반 `http://서버IP:포트`는 암호화되지 않아 사내 LAN에서 비밀번호·세션 쿠키 도청/변조 위험이 남는다. 외부 인바운드 차단·방화벽/허용 LAN 대역·프록시 백엔드 포트 비노출은 표면을 줄일 뿐 TLS와 동등하지 않다. `Secure` 쿠키를 일반 HTTP 주소에 강제로 사용해 작동한다고 주장하지 않는다. `HttpOnly`, `SameSite`, 검증된 Host/Origin 및 CSRF 방어, 서버 전용 랜덤 세션 토큰, 비밀번호 단방향 해시, 세션 폐기, 기본 속도 제한을 요구한다. 로그인·세션으로 얻은 감사 주체 신뢰 수준에 해당 전송 위험을 명시한다.
- **단일 인증 계약:** `User`(불변 ID), 서버 세션, Reader/Editor/Admin, 사용자가 허가받은 Site(및 검증된 Version 종속 관계) 범위, `requirePermission(action, version/site)` 공통 서버 권한 추상화를 적용한다. `X-User/X-Role`, 요청 body의 actor/scope, 기존 CAD 삭제 비밀번호, 단순 UI 숨김은 인증·권한 근거로 인정하지 않는다. 기본 거부/Role+Scope 모두 만족 필요. `logs:read`는 별도 권한으로 #60이 연결.
- **Global Type:** `OutlineType` 카탈로그는 전체 앱 공통. Admin만 관리; Reader/Editor가 업무 타입 이름을 읽어도 Outline/Version 접근은 개인 Scope로 제한한다. Reader 조회, Editor 담당 Scope 내 GENERATED 공동 편집, Admin은 정책상 허용 범위 검증 이후 관리(무조건 모든 사업장 접근을 뜻하지 않음).
- **감사/동시성:** Create/Edit/Delete/Role·Scope 변경의 actor immutable ID, target Version·ID, before/after revision, action/outcome/UTC/requestId를 보존; 민감 본문·비밀번호·세션·전체 CAD Geometry는 원시 운영 로그에 기록 금지. 보존 기간·접근·복구는 추후 결정, 값 임의 지정 금지.
- **별도 결정 필요:** 최초 Admin 발급/계정 복구, 비밀번호 최소 정책·해시 구성값, 세션 만료/동시 세션·재로그인, LAN 허용 대역/HTTP 잔여 위험 수용 절차, Role·Scope 부여 담당자, 감사 보존 기간/조회 주체, Version 삭제 보존/복구. 승인된 기본 방향과 운영 활성화 승인을 구별한다.
- **게이트:** D0는 설계만. 공통 auth/role/scope/audit 구현 및 정책 세부 결정·테스트/운영 승인 전 관리자·메모·로그·외곽선의 신규 영속 GET/쓰기 API 및 DB migration/복원을 금지한다. 기존 공개 도면 읽기 API까지 일괄 차단하는 변경은 하지 않는다. 문서/테스트 준비만 진행 가능. [Issue31](Issue31.md), [Operation](Operation.md), [Database](Database.md), #60/#65/#83.


## ADR-034-R1 — 기본 Current + 명시적인 전체 버전 검색으로 홈 정책 갱신 (2026-10-25 / #93)

- **Context:** #8에서 Current 토글을 도입, #16에서 중복 드롭다운 제거, #45(ADR-034)에서 아예 Current-only로 고정. 사용자가 과거 도면을 찾으려면 층 상세를 거쳐야 하고 홈 파일명/설명 검색에서 이전 Version을 찾을 수 없는 회귀가 발생.
- **Decision:** 홈 `/`은 기본 Current-only지만, 단일 `현재 버전만 표시` 토글(기본 ON)을 통해 OFF에서 **전체 Version(Current+이전+Current 없는 층)** 을 검색·관리할 수 있다. Current는 `CadLocation.currentVersionId` 포인터 기준이며 최대 1개; 자동 승격 없음. 기존 #16의 드롭다운 부활 금지.
- **파라미터 계약:** 홈에서만 `versions=all`을 명시 전체 모드로 사용. 생략/`current=true`는 Current, 레거시 홈 `current=false`는 전체 모드로 정규화. `versions=all&current=true` 충돌, `versions` 중복/미지원 값은 거부. API `GET /api/cad-files?current=false`는 **non-Current-only**로 유지. 공통 `listQuery()`/Repo/DB는 변경하지 않는다.
- **UI/질의 일관성:** 검색·토글 별도 GET form으로 nested form을 방지하고 query/5단계 위치/format/pageSize를 보존, 모드 전환 시 page=1. 페이지 URL은 `drawingListUrl`을 통해 all mode를 확실히 직렬화. Server 검색 SQL과 count/page를 함께 전환하여 프런트엔드 행 숨김 금지. Button `aria-pressed`와 ON/OFF 설명 표시.
- **대안:** API의 `current=false`를 전체로 재정의하면 외부 클라이언트 기존 의미 파괴; UI에서 전건 조회 후 이전 버전을 숨기면 count/pagination 불일치; 전체 버전 목록만 기본으로 쓰면 일상 Current 우선 원칙 위반. 모두 배제.
- **Supersession:** 아래 ADR-034의 '홈 항상 Current·토글 제거' 문장만 R1으로 대체하고 기타 API/보안/이력 경로 결정은 유지한다. [Issue93](Issue93.md)/[Requirements](Requirements.md)/[TestPlan](TestPlan.md).


### ADR-047 보완 — Camera 변경 시 GENERATED 드래그 후보 임계값 이전이라도 폐기 (#54 PR #92)

- [P1 리뷰](https://github.com/planner77/layoutManager/pull/92#discussion_r4370223581)의 원인은 `SelectionController.cancelGeneratedDrag`가 `down.moving`만 검사해 pointerdown 후 5px 미만의 후보를 wheel/Resize 이후에도 유지한 것이다. 화면/카메라 변환 경계가 바뀌면 이전 `down.world`는 유효하지 않다.
- **결정:** 휠/Resize/Fit/Zoom 등 camera change에서 모든 활성 pointer/box/ghost를 `cancelDrag` 경로로 취소한다. 이동 확정은 해당 입력 제스처의 최초→최종 WCS가 같은 카메라 상태에서 계산된 경우에만 허용한다. Stage 취소/History0 및 기존 SOURCE/로컬 보안 경계 유지. `TC-E4-E2E-004` 추가.


## ADR-047 — E4 생성 개체 이동은 WCS Camera 역투영 + Scene Ghost + E2 원자 Translate로 분리 (2026-10-25 / #54)

- **문제:** E2에는 `Translate` 명령·Undo가 있지만 실제 Pointer/숫자 UX가 없고, #51 Drag Selection 및 OrbitControls Pan과 동일 pointer를 경쟁시키면 의도치 않은 DXF/Overlay 변경 위험이 있다. 화면 Pixel을 WCS로 저장하는 방법은 Zoom/고 DPI/Fullscreen에서 틀리다.
- **결정:** GENERATED 전용 모드에서 *이미 선택된 경계*의 modifier 없는 5px 이상의 제스처만 이동, 기타 입력은 기존 #31/#51 선택. `screenToWorld` canvas CSS rectangle→orthographic camera.unproject로 WCS 변위 산정. 수치 입력은 독립 strict parse, `$INSUNITS` 미상 표기. 전 선택 집합은 GENERATED·유일 ID·Scope/visible 일치 검증, 혼합/SOURCE 필터링 후 부분 실행은 금지.
- **미리보기/원자성:** Ghost는 별도 THREE.Group으로 Scene에만 존재하고 Document에는 stage만 기록(History 0). pointerup에서만 최신 선택을 다시 검증해 `Translate` 한 번=Undo 한 단계. ESC/cancel/lostpointercapture/Space/2차 touch/blur/Zoom/Fit/Resize/모드·선택·Dispose는 rollback, GPU 자원 해제. Scene/Tree/JSON/Hit/bounds는 기존 E2 Document projection과 동일하며 변환 전후 NaN/Infinity/1e12 bounds는 fail-closed.
- **결과/미지원:** 원본 DXF, Source Index/Layer, Version/SHA, server API/DB, #31 P4 보안 승인 미변경. 스냅/그리드/3D Z/Rotate/영구 Import는 E4 제외. 성능 최적화는 100개/100k vertices의 기존 E2 상한을 따르며 GPU/실 CAD/native fullscreen 검증은 별도. [Issue54](Issue54.md), [TestPlan](TestPlan.md).

## ADR-046 — E3 GENERATED 삭제는 E2 원자 Command로 단일화하고 확인 시점에 다시 검증 (2026-10-25 / #53)

- **문제:** 기존 U6 `deleteSavedOutline→discardLegacy`는 직접 제거/Undo 초기화를 사용해 #52의 원자·이력·scope 검증을 우회한다. UI만 생성 OFF에 묶으면 생성과 편집을 분리한 E1/#49 계약도 위반한다.
- **결정:** 이력 없는 삭제 인터페이스 제거. 이미 선택된 단일/복수 GENERATED와 Tree 행은 동일 `Delete(ids)` 명령을 Manager→Adapter→Document에 전달하고 UI 삭제 전 명칭·개수를 공개하며 Confirm/Cancel을 제공한다. Confirmation 스냅샷은 현재 선택/Version/SHA와 다시 비교한다; SOURCE 또는 혼합은 전체 거부, Source 분리 자동 필터링 금지. Adapter의 `objects/generated` 편집 모드 검사와 E2 domain 재검증을 유지한다.
- **조작/접근성:** 생성 OFF에서는 Pan 기본 상태를 지키되 명시적 객체 편집 선택 모드에서 삭제 허용. Canvas에 실제 focus가 있고 modifier 없는 Delete/Backspace만 삭제. Form/search/native keys를 침범하지 않고 ESC는 Confirm→Context→E2 stage→Selection→Fullscreen 우선. Tree 접근성·포커스/리사이즈 수명주기 보존.
- **결과:** 삭제 ID와 Geometry/Transform/Visibility/metadata는 E2의 before patch 및 동일 UUID로 Undo/Redo 복원. GPU 객체 제거는 기존 Three Scene release 로직에 위임; Source/Preview/레이어/원본 DXF/DB/P4 불변. 생성 최대 100개·100k 정점/이력 제한 유지. 기존 #43 생성 ON에서만 삭제 가능했던 정책은 E3 이후 확정 개체 편집과 분리(과거 기록은 보존). #54/#55가 같은 명령·scope UI 패턴을 재사용 가능.
- **거부 대안:** 별도 SavedOutline 배열/서버 삭제 API/이력 없는 legacy delete, 임의 mixed 부분 삭제, hidden/Version 불일치 자동 복원, 입력창 전역 Delete 매핑은 데이터 무결성·접근성·보안 위험으로 채택하지 않는다. [Issue53](Issue53.md)와 TC-E3.


### ADR-045 보완 — 전환 시 절감 강제, 안정 상태에서는 무중복/ABI 검증 유지 (#67 P1, 2026-10-25)

- 최초 성공 CI 뒤 [P1 4369963432](https://github.com/planner77/layoutManager/pull/80#discussion_r4369963432)에서 후속 PR이 이미 deduplicated main을 기준으로 할 경우 positive saving 강제 검사로 정상 CI가 막히는 문제를 발견.
- **결정:** baseline에 실제 duplicate가 있을 때만 동일 SHA의 중복 package+positive uncompressed image saving 필수. 기존 최적화된 baseline이라면 0 byte reduction도 정상. 어느 쪽이든 native `.node` 존재, baseline/new package **전체 최종 파일 SHA 동일**, optimized package에 double layer 없음, Docker/Compose/Browser 검사는 필수. Test skip이나 issue number flag로 우회하지 않는다.
- 기존 Main GHCR OCI published version+immutable digest 구별 규칙은 불변. [Issue67](Issue67.md), [FailureLedger](FailureLedger.md).


## ADR-045 — 웹 native SQLite는 Standalone tracing 단일 경로, 중복 layer는 실제 SHA로 검증 (2026-10-25 / #67)

- **문제:** #28 `.next/standalone`에 `next.config.ts`의 강제 include glob으로 `better-sqlite3`가 수록될 수 있으나, Docker runtime은 같은 node_modules 경로를 별도 COPY한다. 기존 약 12.5MB COPY는 **로컬 비압축 계층**이며 실제 GHCR OCI 압축 전송량이 아니다.
- **결정:** native/Prisma 동적 require 안정성을 우선해 `serverExternalPackages`와 `outputFileTracingIncludes`는 유지, 중복 가능성 높은 *별도 Docker COPY*만 제거한다. 새 runtime의 native `.node` 존재와 `better-sqlite3` 메모리 DB open 실패 시 이미지 빌드 차단. ABI·UID10001·schema/API/migrator/Compose/GHCR release pair 불변.
- **검증:** 같은 PR HEAD source + Node22.14 + linux/amd64로 base/new Dockerfile 빌드; 실제 `docker save` TAR 각 패키지 경로·SHA256 동등성/중복 횟수·원시 bytes, `docker image inspect .Size`, `docker history --no-trunc`; fonts/생성 typeface/WASM JS와 traced server 대형 파일은 raw/gzip(proxy) 보고만 하고 실제 렌더링 동일성 증명 전 삭제하지 않는다. OCI compressed layer는 정식 version+immutable digest의 amd64 manifest `layers[].size`로만 계측한다.
- **기각 대안:** 강제 tracing 전체/부분 제거(Prisma·native runtime 누락), TTF/Hangul glyph subset/LibreDWG WASM 제거(한글·DWG 회귀), 정적 파일명만 보고 중복 판정, PR에서 GHCR 공개 tag 게시. 이미지 크기 감소보다 운영 안정성 우선. [Issue67](Issue67.md), [Operation](Operation.md), [TestPlan](TestPlan.md).


### ADR-044 보완: CI 오류 및 P2 안전성 계약 (2026-10-25 / PR #79)

- Polygon 면적 검증은 절대좌표 Shoelace의 부동소수점 상쇄 대신 첫 꼭짓점 대비 상대좌표 사용. 작은 외곽선이 큰 WCS 원점 근처에서 소멸하지 않아야 한다.
- `Delete` Undo 가능 객체는 실재 객체와 별도로 **복원 용량 예약**. 새 객체 확정 후 100개/100k 정점 제한을 벗어나면 기존 불일치 Undo 이력을 무효화한 다음 append하여 항상 용량 불변식 유지. 이전 UUID는 재사용 불가.
- `commitPending(currentSelection)`은 stage 시점 캡처 대상이 아니라 최신 selection의 전부 GENERATED/동일 Scope·ID를 재검증한다. 선택·모드 변경 시 준비 중 명령 취소. TC-E2-UNIT-006~008로 고정.


## ADR-044 — E2 생성 개체는 버전 스코프 메모리 Document/원자 Command/유한 history로 관리 (2026-10-25 / #52)

- **Context:** #31 savedGroup/JSON local-N 과 E1 Generated UUID 인덱스를 각각 직접 수정하면 트리/선택/외곽선/내보내기가 불일치하고 Delete/Translate/Rotate Undo가 불안정해진다. Source DXF 편집 및 #31 P4 서버 영속은 Owner 보안 정책 미승인으로 제외된다.
- **Decision:** E1 Ref(UUID, origin, versionId, SHA)를 Document의 불변 identity로 채택, v1/v2 legacy local-N은 외부 호환 키로만 유지. `baseGeometry`는 깊은 불변 WCS 복사, 개별 edit 상태는 affine matrix 및 patch 이력. 먼저 전 선택 대상 scope·GENERATED·중복/존재/visible·좌표·명령 결과를 **전체 검증**, 한 번의 array 교체로 commit한다. Undo/Redo는 제거 위치 포함 before/after를 재적용하며 source bytes/geometry Worker는 건드리지 않는다.
- **Capacity:** 메모리 이력 최신 100단계 및 추정 patch 참조 16MiB 양쪽 상한, 총 100개 객체/100k 좌표. 이동·회전 history는 immutable base geometry 공유, E3 Delete history는 참조 보존; GPU 메모리와 실제 고용량 도면 성능은 별도 QA/실측 필요.
- **UX/Safety:** E2는 Command fixture 및 Undo/Redo UI만 제공. 실제 Delete/Move/Rotate 조작은 E3~E5, 편집 상태 수동 안전 JSON v2 저장·복원은 E6, 인증된 영속 API는 #31 P4. 입력 키보드 native Undo 보존, Zoom/Pan/Visibility 이력 제외, 취소/Dispose/Version 변경 rollback. 과거 #43 삭제는 legacy 동작으로 분리해 history 무효화.
- **Consequences:** Scene/Tree/Export는 Document의 projection, 기존 다운로드 형식은 유지하되 edited geometry는 canonical attestation으로 서버 수용 불가. 다른 렌더러/DWG 비지원. 재로드 시 작업 소멸을 UI 고지. AC/테스트는 [Issue52](Issue52.md)/[TestPlan](TestPlan.md)이며 PR CI 및 실 CAD 성공은 별도 확인.


## ADR-043 — Migrator 이미지 전용 런타임 의존성을 잠금 그래프에서 가지치기 (2026-10-25 / #66)

- **문제:** #28 이후 운영 웹 standalone 이미지는 경량화됐지만 별도 migrator는 전체 web/dev `node_modules` ~1.1GB 레이어를 복사하여 로컬 비압축 약 1.34GB로 남았다. `prisma`, `tsx`는 devDependencies 분류지만 실제 운영 migration/backfill에 필수라 단순 `--omit=dev`가 기능 장애를 만든다.
- **결정:** 기존 `src/package-lock.json`과 full `npm ci` Build graph 유지 → 자식 stage에서 정확히 잠긴 migrator direct runtime 패키지/SQLite native 버전으로 manifest 파생 → `npm prune --omit=dev --offline --legacy-peer-deps`. 전체 web/dev/transitive 테스트 패키지의 **최종 복사**를 금지하고 CLI/DB/tsx/Generated Prisma 및 최소 TS source만 복사. Prisma Studio의 React peer 자동 설치는 피하되 Prisma CLI 자체 transitive 패키지 임의 제거 금지. 최종 USER 10001에서 CLI/native 로드와 독립 Compose migration을 검증.
- **대안 배제:** 기존 full `node_modules` 복사(절감 없음), 원 root 그대로 `npm prune --omit=dev`(Prisma CLI/tsx 제거), Dockerfile 빌드 중 매번 floating `npm install`(잠금/재현성 결함), 수동 `rm -rf`로 Prisma package internals 삭제(숨은 의존성/CLI 불안정). 근본적으로 별도 lockfile 설치 stage로 옮기는 것은 빌드 비용·이중 잠금 운영 및 E2E 증거를 갖춘 뒤 검토.
- **측정:** #28의 2.05GB **pre-standalone 웹** baseline은 절감률에 재사용 금지. PR base migrator와 #66 migrator 동일 Node/소스/amd64 비압축 비교(30% soft target); GHCR 공개 version+version-migrate의 OCI 압축 layer 합, shared digest dedup 합 및 docker-save gzip proxy **분리**. 기준 미달·실행 실패는 수치와 근거로 남기며 성공으로 위장하지 않는다.
- **통제:** candidate app+migrator digest 둘 다 확인 후 공개 tag 승격. 보안/데이터/Compose 계약 불변; 운영 writer 중지·백업·복구 확인 필수. [Issue66](Issue66.md), [Operation](Operation.md), [TestPlan](TestPlan.md).
### ADR-042 추가 — 기존 U6 호출 호환 및 작은 좌표의 수치 안정성 (2026-10-25 / PR #77)

- E1 확장으로 `selectSavedOutline(id,false)`를 무조건 넘겨 기존 Manager→Adapter 단일 선택 호출 계약을 변경하는 것은 불필요하다. 기본 선택은 `selectSavedOutline(id)`, 실제 additive만 `(id,true)`를 전달한다.
- Segment/Box 교차의 orientation determinants는 **WCS 길이²**이고 두 값의 곱은 **WCS 길이⁴**. 길이와 무관한 절대 임계값 `u*v<-1e-9`는 작은 좌표에서 참인 교차를 배제한다. proper crossing은 orientation 부호로, endpoint collinearity는 곱 규모에 따른 부동소수점 오차로 구분한다. 교차 및 근접 미교차 단위 회귀 후에도 운영 실도면 정확도는 별도 검증한다.


## ADR-042 — E1 CanvasSelection은 Origin/Version/SHA를 검증한 단일 Controller로 관리 (2026-10-25 / #51)

- **Decision:** 기존 #31 SOURCE/RenderCoverage/SpatialIndex를 재사용하고 브라우저에서 확정한 GENERATED Polygon/MultiPolygon만 동적 hit 후보로 확장한다. 일반 객체 모드 겹침 SOURCE 우선; generated 전용 모드/트리에서 Overlay 선택. 이전 Source-only `select`는 Worker와 연결된 별도 모드이고 #40 OFF→Pan을 침해하지 않는다.
- **Identity:** 외곽선 JSON v1/v2 및 #43 Tree local-N은 호환성 보존. 생성 객체의 편집용 참조는 별도의 crypto UUIDv4 + current Version/SHA + Origin 네임스페이스, 발급 실패/충돌 시 중단. 서버 인증/영속 identifier로 해석 금지.
- **Edit boundary:** `canEdit`는 비어 있지 않은 동일 Scope의 전부 GENERATED인 Ref 집합만 true. SOURCE 또는 혼합·중복·유효하지 않은 Ref는 전부 거부, 부분 편집 금지. E1은 편집 Command를 구현하지 않으며 E2~E5가 유효성 재검증한다.
- **Security & lifecycle:** Current 원본/Layer/File SHA/DB/Server Auth 변경 없음. #31 P4/#65 승인 전 영속 Write/API를 열지 않는다. 선택은 Session-only, Renderer/Version/Reload/Dispose에서 해제. [Issue51](Issue51.md) 참고.


## ADR-041 — Main Actions 실행명은 단일행 Squash 제목 계약으로 제어 (2026-10-25 / #74)

- **원인:** #68 `run-name`에서 main `head_commit.message`를 직접 쓰면서 PR #70·#72 병합의 squash commit 본문까지 UI에 노출. #34와 #35·#36의 차이는 Workflow 로직 변경이 아니라 commit message의 줄 수였다. 저장소 squash 기본값 `COMMIT_OR_PR_TITLE / COMMIT_MESSAGES`는 문제를 반복시킬 수 있다.
- **결정:** GitHub Expressions에 `split`/정규식/사후 step output이 없는 제약을 인정. 정상 main push는 `#N | 짧은 설명` 단일행 commit이며 이전 표시명 유지; LF가 존재하면 `SUBJECT-ONLY-REQUIRED | run N`으로 폴백하여 복수행 본문이 run-name에 유입되지 않게 한다. Tag/PR CI 표기, 트리거/permissions/release scope/GHCR promotion은 변경하지 않는다.
- **영구 운영 통제:** 저장소 squash default를 `PR_TITLE / BLANK`로 변경하고, agent/API squash merge는 `commit_title` 지정 및 빈 `commit_message` 명시. 현재 관리자 설정 변경 기능은 사용 가능한 GitHub 연결에서 제공되지 않으므로 문서화만 하고 실제 변경 완료는 별도로 검증한다. 증거/추적 정보는 PR, Issue, FailureLedger 등에 남긴다.
- **대안 기각:** 임의 커밋 본문에서 Issue 번호 추측(잘못 연결될 위험), 인위적인 merge/push 재트리거 또는 GHCR CI 대폭 재설계(중복 실행·게시 위험), 과거 run-name 소급 변경(미지원). [Issue74](Issue74.md)·[Operation](Operation.md).

## ADR-040 — 외곽선 트리는 브라우저 세션 기반 Overlay 뷰로 제공 (2026-10-25 / #43)

- **Decision:** U6 트리 상태의 원천은 현재 Adapter의 SavedOutline 목록이며 UI에는 immutable local ID와 typeId 기준으로 투영한다. 원본 Geometry/CAD Source Layer/Type DB를 조작하지 않고 임시 Overlay 자식 THREE.Group만 개별/타입별 표시. 강조는 별도 Geometry, 이동은 validated WCS bounds에 의존. v1 JSON 필드에 UI Visibility·Selected를 추가하지 않는다.
- **Contract:** U1 Layer Dock와 Outline Dock, U3 생성 ON/OFF, Source Layer visibility는 독립. 생성 OFF에서도 트리 보기·숨김/표시는 허용하되 U3 삭제 정책을 존중하여 임시 삭제만 ON에서 허용. Hidden Overlay는 존재·export 보존. local ID 재사용 금지·임시 최대100개.
- **Authority:** 현재 #65의 실제 active Scope Server Catalog 없음 → legacy 그룹만; Unit fixture의 두 업무 타입은 실제 관리자 저장 증거 아님. #31 P4·#65 IdP/RBAC/Scope/감사 승인 전 server CRUD/GET/restore 금지. 보안 승인 후 새로운 API/Cache 전략·대량 row virtualization은 별도 설계로 결정.
- **Evidence:** [Issue43](Issue43.md), [TestPlan](TestPlan.md), [TestReport](TestReport.md). PR CI 시작과 결과 성공 구분.


## ADR-038 — CI 실행명은 실행 시작 전 입력으로만 결정 (2026-10-25 / Issue #68)

- **문제:** 기존 PR CI 및 Build/publish가 GitHub 기본 PR 제목/commit message를 그대로 사용하므로 Run Type·업무 Issue·목적이 일관되게 식별되지 않는다.
- **결정:** 최상위 `run-name`을 도입해 `PR CI`, `MANUAL CI`, `MAIN CI`, `RELEASE`를 구분한다. 연결 Issue 번호는 PR 제목 또는 squash commit 첫 줄의 `#N | 설명`에서 **사람이 명시**한다. 수동은 `workflow_dispatch.inputs`를 사용하고, 비정형 자동 실행 제목은 `ISSUE-UNKNOWN`으로 남긴다. 진짜 Issue 없는 건 `NO-ISSUE`로 표시한다.
- **근거:** [GitHub 공식 workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#run-name)에 따라 실행명은 생성 시 `github`/`inputs` context에서만 계산된다. Job output에서 추출, 정규식 파싱 또는 workflow 실행 후 이름 변경은 이 구조에서 사용할 수 없다. `github.event.pull_request.number`는 Issue가 아닌 PR 번호이다.
- **GHCR 정책 보완:** 사용자 지정 #68 순수 메타데이터 병합 시 게시 금지를 우선한다. `release-scope`가 main `before...sha` 변경 경로를 분석하고 모든 변경 파일이 Markdown 또는 GitHub workflow YAML일 경우 `publish=false`로 게시 Job 전체를 skip한다. `src/` 등 런타임 변경, 명시적 버전 태그 push는 원래 릴리스/후보 검증 경로로 진행한다. base를 확인하지 못하면 게시 전에 fail-closed로 중단한다. 이는 기존 GHCR 릴리스 job 로직을 바꾸지 않고 사전 게이트만 추가한다.
- **영향:** 기존 push/PR/dispatch 이벤트, 릴리스 직렬화/concurrency/공개 태그 승격 순서 불변. Release scope Job이 추가되고 GHCR publish job은 조건부 실행된다. main squash commit body가 긴 경우 첫 줄만 보여야 식별성이 높다. release Run 자체를 성공으로 오인하지 않으며 기존 Run 이름은 소급 변경되지 않는다. [Issue68](Issue68.md)·[Operation](Operation.md).


## ADR-039 — U5 외곽선 타입 메타데이터는 독립, 서버 카탈로그 전 fail-closed (2026-10-25)

- **Decision:** `kind`(기하 알고리즘)와 `outlineTypeId`(업무 분류)는 서로 독립. `outlineTypeName`은 다운로드 시점 표시용 snapshot, 실제 동일성은 타입 ID. 이름은 1~100자 NFC/trim, 기본 `외곽선 N`, 중복 허용(로컬 ID 고유).
- **Schema:** 미분류 브라우저 임시 확정의 schemaVersion 1 출력은 보존, 타입 지정/혼합은 v2. v2에서 Legacy 항목만 ID/타입명/이름을 모두 null로 표시. v1 Parser는 그대로 지원하며 v2도 같은 Version/SHA/WCS/Handle/Persistable 검사 실시.
- **Security:** #65 실제 Admin 타입 등록·Server Scope/세션/권한이 아직 없다. #41 lab 타입 주입·가짜 헤더·임의 카탈로그 API/DB 또는 server outline write 절대 금지. UI의 U5 typed confirm은 서버 근거 없으면 disabled; 기존 U3 로컬 미분류 버튼은 이전 실험 경로와 구별한다. #65/#31 P4 승인 후 운영 typed-only 강제 전환을 별도 수용한다.
- **Consequence:** 현재 AC-U5 전체 운영 완료 아님. 타입 재분류·레거시 마이그레이션·색상·트리뷰 #43은 승인 전 범위 밖. [Issue42](Issue42.md).


### ADR-037 종결 보강 — #41 안전 시안 인수, 운영 CRUD는 #65 (2026-10-25)

- PR #64의 최종 [CI #40154979531](https://github.com/planner77/layoutManager/actions/runs/40154979531) 성공 및 병합은 **브라우저 메모리 시안만의 수용**이다. Owner 인증·Admin RBAC·Scope·감사 보존 정책은 여전히 결재 대기이므로 실제 관리 API/Prisma Migration/Type FK를 만들지 않는다.
- 사용자의 이슈 종료 요청을 원래 영속화 AC 완료로 오해하지 않기 위해, #41은 부분 범위 분할로 종결(not_planned)하고 **AC-U4-01~04 영속 기능 수용을 #65**에서 계속 추적한다. #31 P4 정책 및 후속 #42/#43 관계를 훼손하지 않는다.
- Main workflow가 자동으로 GHCR 게시를 시도하지만 **시작과 성공은 다른 사건**이다. Run #40155833554는 시작 확인만 수행하고 최종 GHCR/DB 운영 수용을 PASS로 표기하지 않는다.


### ADR-037 보완 — 시안 UUID의 일반 HTTP 지원·테스트 Locator 범위 (2026-10-25 / PR #64)

- **Decision:** 운영에서 문서화한 `http://<IP>:3000`는 secure context가 아니어서 Web Crypto `randomUUID`가 없을 수 있다. 비영속 U4 시안 UUID는 native randomUUID가 있을 때 사용하고, 없으면 `crypto.getRandomValues` 16 cryptographic bytes에 RFC 9562 v4/variant bits를 부여한다. 난수 API 전체 부재 시 명시적 오류 처리; `Math.random` 부정, Admin ID·server persisted FK/authorization과 무관.
- **E2E scope:** Next.js 내장 `__next-route-announcer__`의 role=alert와 앱의 validation alert를 혼동하지 않도록 `outline-type-prototype` 범위 내 `role=alert`를 검사한다. Next 내장 접근성 announcer를 제거/변조하지 않음.
- **Evidence:** [PR CI 실패 40153913566](https://github.com/planner77/layoutManager/actions/runs/40153913566), [review 4369348797](https://github.com/planner77/layoutManager/pull/64#discussion_r4369348797), [commit `b389b66e`](https://github.com/planner77/layoutManager/commit/b389b66e11a34ad6fa737fc5ff760277d192797a), [FailureLedger](FailureLedger.md). 새 CI 결과 검증 전 NOT VERIFIED.


## ADR-037 — #41 인증 없는 관리자 CRUD 대신 비영속 카탈로그 시안만 제공 (2026-10-25)

- **Context:** #38 메뉴에 '외곽선 타입 관리' 진입점이 있으나 #31 P4의 IdP/Admin RBAC/Scope/감사 운영 정책은 승인되지 않음. 화면 숨김이나 deletePassword/X-User는 보안수단이 아니다.
- **Decision:** 지금은 관리 메뉴 disabled, 관리자 API/Prisma migration/사용자 Scope 감지 불구현. `/lab/outline-types`에서 React 메모리 시안으로 입력 UX·고정 ID·NFC+case-insensitive 예약명·soft deactivate·CAS revision 도메인 로직만 실험한다. 브라우저 refresh 시 삭제되는 비영속 상태를 눈에 띄게 표시한다.
- **Schema pending:** 제안 `OutlineType(id,name,description,active,sortOrder,scopeKey?,revision,createdAt,updatedAt)` + immutable ID/FK. scopeKey=null은 미확정이지 global default가 아니다. 비활성 이름도 예약; 이름 키 NFC+locale-independent lowercase는 **초기 제안**, DB 실제 collations/Unique key와 Site visibility는 Owner 승인 필요.
- **Rejected:** 익명 작성 API·admin query flag·X-Role 헤더/삭제 비밀번호 재사용, localStorage를 실제 기준정보로 취급, 임시 외곽선 JSON에 서버 권한 없는 typeId 주입, 권한 없이 '관리자 모드' 클릭을 허용.
- **Consequences:** AC-U4-01~04는 실서비스 미완, AC-U4-05 fail-closed 증거만 코드에 준비. Owner 승인 후 #31 인증·감사 재사용 → additive schema/FK→Service/GET/POST/PATCH/RBAC/CAS/Audit→#42/#43 연계. [Issue41](Issue41.md).


## ADR-036 — 외곽선 도구 ON/OFF는 비확정 작업만 취소 (2026-10-25 / Issue #40)

- **배경:** #38 U1에서 상단 메뉴는 비활성이지만 하단 #31 도구로 객체 선택이 가능했다. 실제 ON/OFF를 도입하면서 Worker가 늦게 반환된 Preview, Renderer/Version 경계, 이미 확정한 Overlay/다운로드의 수명을 명시해야 한다.
- **결정:** 단일 `ViewerAppState.outlineToolEnabled` 기본 OFF, `ViewerMenuBar` controlled button으로 ON 시 select/OFF 시 pan. OFF는 Worker와 미확정 Preview를 *먼저* 취소하고 selection을 비운다. `outlineEnabledRef` 및 monotonically increasing revision으로 비동기 stale callback을 차단한다. **임시 확정 `savedGroup`은 유지하고 OFF에서도 JSON Export**; 도구 활성 여부와 Overlay 가시성은 독립이다.
- **Availability:** DXF+three-dxf-viewer, ready, loaded, 64-hex Version SHA 메타데이터, Source↔Renderer audit의 mapped Entity 1개 이상을 모두 요구. 불확실한 매핑/미지원 Renderer/비정상 버전은 false + 사유. 실제 SHA 원본 bytes 검증까지 새 UI가 수행한다고 주장하지 않는다.
- **기각한 대안:** OFF 때 Adapter dispose/reload(카메라/확정 경계 소멸), OFF 때 savedGroup clear(사용자 결과 손실), 단순 도구 panel hidden(선택 이벤트/Worker 계속 동작), 비활성 상태에서 확정/삭제 허용(도구 ON/OFF 계약 파손).
- **영향/제외:** #31 Layer/Space Pan/ESC/Worker·Geometry 및 #38/#39 Canvas·Shell 계약 유지. Renderer/Version/reload에서는 기존 세션 삭제. 트리 기반 Overlay 가시성(#43), 관리 타입(#41), DB/RBAC P4 미구현. 실기기 native·실 CAD 수용은 별개. [Issue40](Issue40.md).


### ADR-036 보완 — Renderer callback 경계 및 포커스된 Space 키 (PR #48, 2026-10-25)

- 초기 PR CI [Run 40149077671](https://github.com/planner77/layoutManager/actions/runs/40149077671)의 `react-hooks/refs` 차단은 Ref를 읽는 `resetOutline`가 render `map`의 callback 경로에 노출된 것이 원인. Ref 정리 함수를 안정적인 hook callback과 명시적 Renderer JSX로 분리하고 effect dependency를 명시한다. ESLint 규칙을 임의 비활성화하지 않는다.
- 기존 Space+drag 이동은 Canvas/비대화형 키 이벤트에서만 수행한다. 버튼·링크·메뉴 포커스의 Space는 Browser click이 우선하며 전체 키보드 ON/OFF 접근을 보존한다. ESC 선택 우선 처리와 영구 저장 보류는 불변. [Issue40](Issue40.md), [FailureLedger](FailureLedger.md).

## ADR-035 — 지원 Renderer에서 레이어 도크 host 유지·포커스 복원 (2026-10-25 / Issue #39)

- **Context:** #38의 U1에서 메뉴/레이어 패널 열림 state는 통합됐지만, 닫힘 시 도크 DOM까지 제거되어 사용 가능한 메뉴의 `aria-controls=viewer-layer-dock` 참조가 사라졌다. 내부 접기 버튼은 클릭 후 DOM에서 사라져 키보드 포커스가 유실될 수 있었다.
- **Decision:** 열린/닫힌 상태를 `ViewerAppState.layerPanelOpen` 하나로 제어하되 **지원 가능한 Viewer에서는 도크 host를 계속 mount하고, 닫힌 경우 CSS hidden 처리하며 내용 panel만 unmount**한다. 메뉴 버튼 ref를 내부 닫기 콜백에 전달하여 close 후 focus를 상단 메뉴로 이동한다. 메뉴의 `aria-controls`는 host가 있는 동안만 제공한다.
- **Rejected:** (1) 패널 상태와 실제 `selectedLayers`를 결합→CAD 객체 가시성 변경 위험. (2) 패널 닫을 때 ViewerManager/Adapter reload→camera/source/Selection 유실. (3) 숨긴 내용을 키보드 탐색 가능한 상태로 유지→접근성/포커스 문제. (4) 미지원 Renderer에서도 빈 도크 노출→기능 오인.
- **Effects:** 기존 #17 레이어 조작/Canvas 생명주기, #25 CSS/native Fullscreen 및 #38 compact 도킹 유지. 패널 토글만으로 재파싱·영속 데이터 변경 없음. 실제 native/접근성 실기기 수용은 E2E 모의 이벤트와 구분. [Issue39](Issue39.md).

> **후속 변경 #93 / ADR-034-R1:** 아래 ADR-034는 0.31.0 당시 정책 기록입니다. 홈 Current-only 고정 및 토글 제거는 0.40.1부터 대체합니다. API 이력 조회 불변 원칙은 유지합니다.

## ADR-034 — 홈 Current 전용 목록, API 이력 조회 유지 (2026-10-25 / Issue #45)

- **Context:** #8 토글은 기본 OFF, #16에서 중복 드롭다운만 제거했다. 따라서 `/` 접근 시 과거 Version이 함께 보이며 `?current=false` 같은 레거시 URL도 목록의 전체 Version을 노출한다. Location별 Current는 최대 하나이며 최신 등록 Version과 다를 수 있다.
- **Decision:** UI 홈에서만 기존 조회 파서의 유효성을 검사한 뒤 `current=true`로 강제한다(`currentOnlyListParams`). 리포지토리에서 필터링하고 총건수·pagination을 재계산한다. 토글/전체 모드 삭제. 공유 `listQuery`·`/api/cad-files?current=false` 계약은 보존한다. 기준정보 트리의 층마다 `버전 이력` 링크를 제공하여 Current 없는 위치의 접근·재지정을 보장한다.
- **Rejected:** (1) API 기본값을 Current로 변경→외부 소비자/이력 조회 파괴. (2) 프런트엔드 row 숨김→count/pagination 불일치. (3) Current 없는 위치 자동 승격→관리 의도 위반. (4) 이력 조회/다운로드 제거→기존 Version 손실·업무 퇴행.
- **Consequences:** 홈페이지의 `current=false`는 별도의 안내 없이 Current-only로 정규화되며, Location 상세에서는 전체 이력 조회/Current 지정이 가능하다. DB/API/migration/원본 변경 없음. 실제 E2E/CI 결과는 [TestReport](TestReport.md)에서 별도 확인; 검증 전 PASS 금지. 상세 [Issue45](Issue45.md).


## ADR-033 — 앱형 도킹 Viewer와 Escape 단일 계층 우선순위 (2026-10-24, Issue #38)

- **Context:** #25는 CSS immersive 자동 진입, native 요청은 클릭으로 제한한다. #17 레이어 Overlay와 #31 하단 외곽선 Overlay가 캔버스 hit test·가용 영역을 침범하고, #25/#31 ESC가 같은 키 입력으로 선택 취소와 fullscreen 이탈을 동시에 실행하는 충돌이 있었다.
- **Decision:** Version 단위 `CadViewer`/ViewerManager 생명주기는 그대로 두고 `<ViewerAppShell>`에 메뉴바·좌/중/우 flex 도킹 영역, 스크롤 가능한 하단 #31 도구 및 상태바를 넣는다. `ViewerAppState`의 패널 토글은 개별 CAD Layer visibility와 독립. 지원 Renderer만 layer 도킹 노출, U3/U4/U6 미구현/보안 게이트 항목은 명시적으로 비활성.
- **ESC policy:** 선택 도구의 active selection 취소가 우선(SelectionController defaultPrevented), 다음 검색 패널 닫기, 그 다음 native fullscreen 종료, 마지막 CSS immersive 종료. 이벤트 하나로 여러 계층을 종료하지 않는다. 이 부분만 #25 기존 ESC '패널 없는 상태에서 CSS 종료'를 구체화한다.
- **Alternatives:** absolute overlay 계속 확대, Renderer 새로 load하는 Layout mode, 미완성 버튼 가짜 활성화. 모두 캔버스 occlusion/state loss/기능 오인 우려로 배제.
- **Effects:** 큰 화면 좌우 도크는 실제 레이아웃 공간을 차지, 모바일은 하나의 compact dock만 문서 흐름에 표시. 도킹/검색 state는 Manager.load 의존성에 넣지 않고 native fullscreen은 동일 shell subtree 사용. DB/API/원본/외곽선 Geometry/Worker 변경 없음. 실제 CI/브라우저/실도면 시험은 검증 전 NOT RUN. [Issue38](Issue38.md).


## ADR-032 — Viewer 기본 viewport immersive, native fullscreen은 명시 클릭 전용 (2026-10-17)

- Context: #10은 로드 후 전체 화면 버튼 선택, #17은 fullscreen layer UI 제공. #25는 모든 URL/목록 진입에서 자동 전체 화면을 원하지만 Fullscreen API는 일시적 사용자 활성화가 필요해 URL 접근에서 자동 요청하면 실패한다.
- Decision: 공통 Viewer 페이지에서 React state를 기본 CSS fixed `inset-0;height:100dvh` immersive로 시작한다. URL schema/Renderer 강제 규칙은 유지. 사용자에게 보이는 `브라우저 전체 화면` 버튼의 onClick에서만 `requestFullscreen()`을 요청한다. 브라우저 거절은 CSS 상태를 변경하지 않는다. Native/fullscreenchange와 CSS immersive/ESC 상태를 구분하고 일반 모드·목록 복귀를 제공한다.
- Layout: 파일명·Version, Renderer, 원본 다운로드/링크/에러·재시도, 기존 #17 layer panel/#26 search/#31 outline을 동일 Viewer shell 안에 유지. 앱 header inert, html/body scroll lock, focus cleanup. Viewer load effect와 독립 상태이므로 확대/팬/레이어 상태와 Canvas가 fullscreen 토글만으로 초기화되지 않는다.
- Consequences: 기존 외부 툴바의 정상 화면 위치가 변경되므로 이전 #10/#17/Layer/Metric E2E를 새 초기값에 맞게 수정한다. Native API가 거절되는 모바일/브라우저에서도 CSS immersive만 보장하며 주소창을 숨긴다고 주장하지 않는다. DB/API/원본/Adapter 수정 없음. 검증 결과는 [Issue25](Issue25.md), [TestReport](TestReport.md)를 따른다.



## ADR-031D — 부분 BLOCK/곡선 허용오차는 참조 승인 불가, Source는 서버 재계산 (2026-10-16)

- P0 결정: 일부 자식 Entity가 미지원인 INSERT는 전체를 신뢰 가능한 Source reference로 식별하지 않는다(fail-closed). 커브 512 샘플 상한이 지정한 0.02 WCS sagitta를 만족하지 못하면 좌표 수를 임의 축소하지 않고 제외한다.
- P4 결정: 사용자가 제공한 JSON은 진위가 보장되지 않는다. 서버의 immutable DXF bytes SHA, Version/단위, 유일/지원 Handle 검증 뒤 canonical Convex/Precise Geometry를 재계산하고 XOR 면적을 비교하여 **서버 계산 결과만** 신뢰한다. 인증 Provider·세션/RBAC/Scope·감사는 별도 승인 전 미구현.
- P5 결정: CI synthetic 100k CPU와 private 사용자 DXF의 Browser 5회 관측을 구분한다. 실제 회사 도면/측정값/직원 정보는 외부 CI 및 PR artifact에 올리지 않는다. 데이터·기준 SLA가 없으면 현장 수용 PASS 금지.


## ADR-031C — ESM Worker import 경고는 릴리스 차단 오류 (2026-10-16)

- Main CI `38894507390`에서 `polygon-clipping`에 없는 named `union` import Webpack 경고가 기록됐는데, CI와 GHCR 게시가 성공했다. TypeScript declaration/CJS import 형태와 실제 ESM Worker bundle Export 계약이 달라 발생할 수 있는 기능 위험으로 판정한다.
- 조치: 공식 v0.15.7 ESM default export를 사용하고, `run.mjs build`에서 import/export warning을 exit 0과 무관하게 fail-closed 처리. 실제 Polygon Union의 수치 E2E와 export 데이터 검증 추가.
- Scope: 원본 CAD/SQLite/S3/현장 비밀정보 불변. P0 실제 도면·P5 Renderer 성능은 제공된 승인 데이터로 별도 수용하고 P4 서버 쓰기는 사용자 인증 방식 승인 전 계속 금지. v0.28.2 테스트/릴리스는 실행 결과 확인 전에 성공이라고 기록하지 않는다.


## ADR-031B — Source↔Renderer 오매핑 방지, P4 영속 fail-closed

- 2026-10-16 / 코드 추가, CI 전. `three-dxf-viewer`는 BLOCK 내부 geometry 병합이 가능하며 Object3D userData.entity를 노출한다. 단순 원본 Handle만으로 렌더된 객체라고 가정하거나 화면 픽셀 Bounds로 영속 ID를 만들면 위험하다.
- 대안: Rendered Handle/Type/Layer/World XY bounds를 1:N 합산 후 Source와 대조하고 일치하지 않는 Entity는 선택에서 제외. SpatialIndex는 ID 대신 탐색 가속 전용으로 사용하며 오류/누락 수를 표시한다.
- P4 인증 정책은 **Owner 승인 대기**(내부 OIDC signed token+RBAC 권장, IdP 없는 경우 로컬 계정/세션 가능). 인증 없는 외곽선 서버 쓰기·도면 삭제 비밀번호 재활용·서명 없는 `X-User` 신뢰 금지.
- 합성 100k CPU benchmark 결과는 실 CAD/GPU와 동일하지 않으므로 실도면 반복 수용 전 운영 PASS 금지. [Issue31](Issue31.md).



## ADR-029 — 도면 내부 텍스트 검색을 브라우저 원본 기반/좌표 focus로 분리

- Date / Status: 2026-10-16 / Issue #26 기능 구현, PR CI·독립 QA 검증 대기.
- Context: 기존 Viewer는 렌더링만 담당하며 TEXT/MTEXT 위치 검색과 좌표 중심 이동 계약이 없다. DWG는 LINE 중심이라 실제 글자 추출/표시가 성립하지 않는다.
- Decision: DXF 텍스트는 브라우저 내 별도 순수 parser+Worker로 필요시 추출하고, 메모리 원본/색인을 Version별 공유한다. ViewerManager.focusBounds를 추가하여 dxf-viewer GetOrigin 보정 또는 Three camera target으로 변환한다. 검색 UI는 Viewer shell 내부 배치. 숨김 레이어는 검색 결과 제외. 불확실한 좌표/OCS/속성은 잘못된 Pan을 수행하는 대신 제외 사유를 표시한다.
- Trade-off: 추가 파서 로직 유지보수와 추정 focus 영역(정확한 glyph bbox 아님), 20k 제한이 따른다. 직접 upstream 패키지 수정·서버 원본 인덱싱·DWG 지원 추정·외부 CAD 전송보다 격리와 취소/검증 가능성을 우선한다. 실제 도면/글꼴/삽입 변환 적합성은 QA 증거로 별도 확인한다.
- Scope: DXF TEXT/MTEXT와 기본 2D INSERT, 기타 형식은 비지원. #25 기본 fullscreen 진입을 변경하지 않는다. 결정 상세/테스트 추적은 Issue26.md.


## ADR-031 — DXF Outline를 Viewer Adapter와 브라우저 임시 데이터로 격리

- Date/Status: 2026-10-16 / Issue #31 P0~P3 부분 구현, 합성 자동시험·CI·실도면 검증 전.
- Decision: three-dxf-viewer DXF만 지원, 원본 Scene/Object3D는 수정하지 않고 별도 source WCS index + Worker geometry + 독립 Overlay 사용. Convex 및 실제 Polygon Union은 다른 결과 유형이며 열린 선분을 추정 폐합하지 않는다. polygon-clipping 0.15.7(MIT)을 선택했다.
- Data: Version/SHA/unique Handle 외 키는 임시로만 사용, 서버 영속 API/권한 부재. 운영 인증 모델 결정과 실제 CAD Viewer 객체 변환 검증 전 P4·P5 수용 금지. 자세한 변환/오차/미지원 요소는 [Issue31](Issue31.md).


## ADR-026 — Docker image pair 정규화 및 GHCR 게시 단계 보호

- Date / Status: 2026-10-16 / PR #29 (#28) 리뷰 후 설계 보강, 최종 PR CI·실운영 릴리스 검증 대기.
- Context: Next.js standalone 앱과 Prisma migrator를 별도 GHCR 이미지로 게시한다. 앱 공개 태그를 먼저 갱신하면 후속 migrator 빌드 실패 시 버전이 엇갈린다. Compose는 태그 없는 이미지 참조를 `:latest`로 해석하지만 `${GHCR_IMAGE}-migrate` 문자열 결합만으로는 `:latest-migrate`를 생성하지 못한다.
- Decision: 두 타깃을 커밋 SHA에 연계된 별도 후보 이미지로 우선 빌드·게시하고 둘 다 registry에서 확인된 경우에만 공개 `:version-migrate`, `:version`, `:latest-migrate`, `:latest`를 순서대로 승격한다. Publish workflow의 취소를 방지한다. Compose 실행 helper는 `.env`를 실행하지 않고 두 image 키만 안전하게 읽어 태그 없는 앱 참조를 `:latest`와 `:latest-migrate`로 정규화한다. Digest pin은 migrator 별도 명시를 필수로 한다. CI health 검증에는 연결 초기화(exit 56) 재시도를 포함한다.
- Alternatives: 앱 공개 태그 직접 push(릴리스 불일치 위험), 항상 명시적 migrator tag 입력(기존 사용 흐름 저해), 별도 GHCR 패키지로 image alias 발행(운영·권한 복잡도 증가).
- Trade-off: 두 레지스트리 태그의 승격은 원자적 트랜잭션이 아니므로 아주 짧은 최신 별칭 불일치 창이 가능하다. 운영 업그레이드에는 항상 일치하는 명시적 릴리스 버전/검증된 digest pair를 사용하고 구 앱 중지→migrator 성공→신규 앱 기동 순서를 지킨다. 후보 SHA 태그는 감사/복구용으로 남기며, GHCR 게시 및 수용은 Main CI 이후에만 판정한다.
## ADR-028 — Standalone 웹과 별도 DB migration Job

- Date/Status: 2026-10-16 / 소스 구현·PR CI 검증 대기. 기존 단일 Docker 이미지 전체 source/node_modules 복사는 개발용 자산 포함 위험. Prisma CLI/tsx를 제거하면 DB migration/backfill 실패.
- Decision: Debian bookworm-slim Node22, UID10001, /data 영속성을 보존하면서 웹 runtime을 Next standalone으로 축소. 별도 Prisma/tsx migrator를 동일 release로 배포, Compose에서 exit0 게이트. 기본 `phase1`은 크기 측정 기준을 위한 비게시 target.
- Reject: 근거 없는 Alpine 전환, migration 제거, 구 앱 실행 중 DB migration, 전체 dev node_modules 웹 포함. Trade-off: 웹은 가벼워지나 migrator 이미지 하나가 추가된다. GHCR 두 태그를 같은 source로 관리하고 업그레이드 시 백업·앱 정지 필수. 30% 감소는 측정 전 확정하지 않는다.


기준일: 2026-09-07. `요구사항 확정`은 사용자 원문이 결정한 사항, `제안`은 이 계획 확인 후 채택할 기본안, `확인 대기`는 별도 중요한 판단이 필요한 사항이다. 2026-09-07 사용자가 DXF 우선, DWG 다음 버전 순서로 계획 실행을 승인했다. 최신 순서는 ADR-011을 따른다.

## ADR-025 — Version별 삭제 비밀번호와 승인된 원본 정리

- Date / Status: 2026-09-11 / 사용자 요청 범위로 구현했으며 미게시 0.17.0의 검증 누락을 0.17.1에서 보완한다. 실제 수용·운영 적용은 TestReport의 U-ISSUES-20260911 결과를 따른다.
- Decision: 선택 Version 1개의 삭제만 비밀번호로 보호한다. 신규 비밀번호는 필수이며 기존 행만 최초 적용 시1234로 salt hash 초기화한다. Node 22 내장 scrypt를 사용하고 평문/hash를 public 정보로 보내지 않는다. 로그인·열람보호·재설정/우회 기능을 추가하지 않는다.
- Current/순번: 삭제 대상이 Current이면 같은 transaction에서 NULL로 해제하고 자동으로 다른 Version을 Current로 정하지 않는다. 빈 Location은 보존하고 nextVersion으로 삭제 순번을 재사용하지 않는다.
- 정합성: DB transaction에서 승인된 `CadDeletionJob`을 만들고 Version 삭제를 확정한 뒤 원본을 지운다. 원본 실패는 202 정리 대기이며 DB job으로 재시도한다. 별도 큐/서비스는 없고 승인되지 않은 원본을 스캔 삭제하지 않는다. Soft-delete로 도면 설명·파일명을 장기 보관하는 대안과 원본 선삭제의 DB 실패 위험을 고려한 선택이다.
- Migration: 실제 DB/원본 백업 후 additive SQL+NULL 행 전용 hash backfill. 기존 1234 설정은 사용자가 요청한 호환 초기값이며 신규 기본값이나 관리자 우회가 아니다. 재실행은 사용자 비밀번호를 바꾸지 않는다. 이전 앱 단독 rollback은 신규 필수 입력/삭제 상태 정합성 검토 없이 지원하지 않는다.
- Consequences: 신규 기능 0.17.0, 신규 등록 API에 필수 필드 추가. DB/파일 원자성은 제공할 수 없어 도면 삭제와 원본 정리 대기를 구분한다. 이미 전달된 Browser bytes·외부 백업·S3 과거 object version의 회수는 범위 밖이다. DB 세부 정의는 Database, 시험은 TC-DELETE-001–008을 따른다.

## ADR-024 — 폐쇄망 업로드 오류 진단과 원인 보존

- Date / Status: 2026-09-09 / 구현·자동 시험·S3 검증·cleanup 재시험 및 0.16.0 Docker/GHCR lifecycle 완료. 실제 폐쇄망 현장 장애·로그 롤오버는 별도 미검증.
- Context: 화면이 message만 사용하고 HTTP 상태/requestId를 버리며, 서버 일반 예외는 이름만 기록하고 S3 변환에서 cause를 잃는다. 실제 폐쇄망 오류는 미재현이다.
- Decision: Unit OBS 0.16.0에서 공개 진단 상세·복사·JSON 저장·Console과 서버 요청 ID 기반 구조화 로그를 제공한다. 공개 진단과 서버의 정제된 원인/스택은 분리하고 외부 로그 서비스 없이 Docker 순환 보관을 사용한다. 오류 직렬화는 허용 필드/제한/마스킹을 적용한다.
- Trade-offs: 임의 raw 예외/응답 전체를 공개하면 원본·credential이 섞일 수 있으므로 공개 필드는 제한한다. 서버에서도 안전하게 정제할 수 없는 메시지는 범주/코드로 대체한다. 앱에 도달하지 않은 요청에는 서버 ID가 없으며 시각과 Network/프록시 로그가 필요하다.
- Consequences: S3 원인을 보존하며 정리 실패가 최초 오류나 확정된 등록 성공을 덮지 않게 한다. DB schema/Current/불확실 원본 보존은 유지한다. 배포는 기존 승인된 단일 인스턴스/GHCR 절차를 따르며 폐쇄망 현장 배포 여부는 실제 접근·실행 근거와 구분한다. 검증은 TC-OBS-001–008 및 관련 회귀로 기록한다.

## ADR-001 — 문서 Bootstrap와 환경 초기화 분리

- Date / Status: 2026-09-07 / 요구사항 확정에 따른 단계 해석.
- Context: 원문 Unit 0에는 Next.js 초기화가 있지만 최초 Bootstrap에서 실제 구현을 금지한다.
- Decision: 0A는 조사·문서·계획·ignore, 0B는 사용자 계획 확인 후 코드/의존성/DB 환경 초기화.
- Alternatives: 초기 지시에서 앱까지 생성.
- Reason: §91/100의 명시적 순서를 지킨다.
- Trade-offs / Consequences: 현재 실행 명령/버전/기능 테스트는 미확정이며 README에 계획으로 표시한다. src에는 빈 placeholder만 둔다.

## ADR-002 — Next.js 단일 앱, SQLite + Prisma 우선

- Date / Status: 2026-09-07 / 기본 Stack은 요구사항 확정, 상세 버전은 제안 단계.
- Context: P.O.C.의 관리 기능·테스트 가능성과 구조적 단순성.
- Decision: src를 Next.js 루트로 두고 TS/React/shadcn/Tailwind, Route Handler→Service→Repository→SQLite 사용. npm lock으로 재현.
- Alternatives: 별도 Backend, 다른 ORM/DBMS.
- Reason: 기본 요구 충족, 외부 의존 최소화.
- Trade-offs / Consequences: SQLite 단일 writer·로컬 디스크 제약이 있다. Prisma relation/SQLite driver/Next 조합을 0B/1에서 검증하고 exact version을 기록한다. 중요한 대체는 사용자 확인 대상이다.

## ADR-003 — Viewer Adapter와 Browser 경계

- Date / Status: 2026-09-07 / 요구사항 확정.
- Context: 서로 다른 CAD API·Three/WebGL/WASM 생명주기.
- Decision: UI→Manager→각 Adapter로 격리, Client dynamic import. DXF 두 Renderer 선택, capability에 따라 기능 표시.
- Alternatives: UI에서 직접 Library 호출, 강제로 동일 API 흉내 내기.
- Reason: 독립 평가·전환·자원 해제와 교체 용이성.
- Trade-offs / Consequences: Adapter 코드가 필요하다. library 별 Three 객체 교환을 피하고 upstream source 수정보다 Wrapper를 우선한다.

## ADR-004 — LibreDWG 파서 이후 직접 렌더링

- Date / Status: 2026-09-07 제안 → 2026-09-08 승인된 Unit 7A 최소 실험에서 채택.
- Context: [공식 JS 문서](https://github.com/mlightcad/libredwg-web/blob/master/bindings/javascript/README.md)는 `@mlightcad/libredwg-web`을 DWG parser로 소개한다. 요구사항의 화면 표시를 위해 parse 이후 렌더링 책임을 정해야 한다.
- Decision 제안: LibreDwgWebAdapter 안에서 WASM으로 DWG를 읽고 반환 객체를 직접 Three.js geometry로 표시한다. UI의 Viewer 명칭은 libredwg-web, 보고서는 파서와 자체 렌더러 기여/한계를 구분한다. DXF 변환 및 두 DXF Viewer 사용은 금지한다.
- Alternatives: 파싱만 검증(최종 화면 요구 미충족), 다른 완성형 CAD Viewer 도입(제품 선택과 범위 변경 필요).
- Reason: 지정 기술·직접 DWG 경로를 유지하면서 실제 표시 목표를 달성하기 위한 최소 구조.
- Trade-offs: 직접 렌더링에는 Entity별 구현·font·block·hatch/curve 등의 추가 작업이 필요하다. 미지원 Entity를 숨기지 않고 부분 지원으로 기록한다. 자체 renderer 결함을 LibreDWG parser 한계로 잘못 귀속하지 않는다.
- Consequences: Unit 7A는 ADR-011에 따라 DXF 릴리스 이후 최소 DWG parse/render/free 실험으로 수행한다. 초기 최소 기하 성공은 최종 업무 도면 호환성 증명이 아니다. DXF 완료 후 다음 작업 진행 지시에 따라 기존에 명시된 최소 실험을 수행하며, 추가적인 중요 구조 변경이 생기면 확인한다.

## ADR-005 — Location의 단일 Current pointer

- Date / Status: 2026-09-07 / 제안(원문 우선 검토 모델).
- Context: Location별 동시에 Current 최대 하나, 소속 일치 필요.
- Decision: nullable current_version_id를 유일한 Current 기준으로 사용하고 복합 FK로 같은 Location의 Version만 참조한다. 교체/등록은 transaction, UI는 pointer로 Current 파생.
- Alternatives: Version별 boolean+partial unique index.
- Reason: 중복 flag 없이 최대 하나를 구조적으로 표현한다.
- Trade-offs / Consequences: 순환/복합 relation의 ORM migration 검증이 필요하다. Current 0개 허용, Upload 체크 기본 true, false는 기존 pointer 유지. DB 상세는 Database.md만 갱신한다.

## ADR-006 — 도면 순번·위치 정규화·등록일

- Date / Status: 2026-09-07 / 제안.
- Context: CAD Version 문법·문자열 동일성·등록일 타입이 미정이다.
- Decision: 도면 버전은 Location별 정수 1부터 Vn 표시. 위치는 trim+NFC 후 대소문자/내부 공백 유지. 등록일은 YYYY-MM-DD, 기본 서울 오늘; 생성/수정 시각 UTC.
- Alternatives: 사용자 입력 SemVer/문자열 버전, 자동 영문 case folding/층 별칭 통합, 등록일=타임스탬프.
- Reason: P.O.C. 범위에서 순번 경쟁을 검증하기 쉽고 임의 별칭 병합·시간대 날짜 변형을 피한다.
- Trade-offs / Consequences: 외부 업무 revision label은 별도 요구 시 추가한다. 앱 SemVer와 도면 버전은 독립이다.

## ADR-007 — 로컬 파일·Hash·중복 정책

- Date / Status: 2026-09-07 / Local Filesystem은 확정, 세부 정책 제안.
- Context: CAD 원본과 Metadata/DB 원자성이 다르다.
- Decision: 원본은 안전한 UUID 경로, server SHA-256, 동일 hash 등록 허용+중복 정보 제공, temp→rename→DB commit와 실패 보상. 기본 Upload 한도 100 MiB 제안.
- Alternatives: hash Unique로 중복 거부, DB Blob, object storage.
- Reason: 의도적인 같은 파일의 새 Version을 차단하지 않고 식별 근거를 유지한다.
- Trade-offs / Consequences: 중복 파일이 공간을 소비하며 DB/FS crash orphan 복구가 필요하다. 자동 삭제·dedup storage는 추가하지 않는다.

## ADR-008 — 루트 .env와 앱 Credential 분리

- Date / Status: 2026-09-07 / 비밀보호 확정, 로더 구현 제안.
- Context: 기존 변수 `remote_repo_url`, `remote_repo_token`이 있고 앱 루트는 src이다.
- Decision: 기존 .env를 보존한다. Git tooling만 해당 키를 사용하고 앱 launcher는 DATABASE_URL/CAD_STORAGE_PATH/MAX_UPLOAD_SIZE_MB만 allowlist로 읽어 child process에 전달한다. Git 키는 inherited env에서도 제거한다.
- Alternatives: .env 전체를 source하여 앱 실행, src/.env로 Secret 복사, 변수명 변경.
- Reason: Git 인증은 앱 기능에 필요하지 않으며 root/src cwd 차이를 명시적으로 해결한다.
- Trade-offs / Consequences: Next/Prisma/test 모두 동일 loader를 사용해야 한다. 실제 loader와 scripts는 0B에서 작성·검증한다. [Next env 문서](https://nextjs.org/docs/app/guides/environment-variables)는 앱 환경 로딩과 NEXT_PUBLIC 번들 노출을 구분한다.

## ADR-009 — 실행·평가의 경계

- Date / Status: 2026-09-07 / 제안.
- Context: 로그인/배포망·대표 도면·성능 SLA가 제공되지 않았다.
- Decision: 단일 Node 프로세스의 로컬 loopback P.O.C. 기본. 기능 자동화는 생성 DXF/허가된 DWG fixture, 최종 실도면 fidelity는 Sample 제공 후 검증한다. 숫자 성능 목표를 임의 확정하지 않는다.
- Alternatives: 인터넷 공개 서비스·SSO 도입, 임의 SLA/임의 도면을 업무 합격 근거로 사용.
- Reason: 사용자 범위와 객관적 증거를 유지한다.
- Trade-offs / Consequences: 실제 운영망 배포/권한/업무용 성능 적합성은 별도 조건 확인이 필요하다. 라이선스 명칭은 Architecture에 조사 근거로 기록하고 배포 조건이 정해지면 해당 배포 정책을 검토한다.

## ADR-010 — Git, 앱 버전과 Release

- Date / Status: 2026-09-07 / 요구사항 확정.
- Context: 지정 remote와 안전한 형상관리, 아직 앱 package가 없음.
- Decision: origin과 .env 일치 확인 후 의미 있는 Conventional Commit. 앱 version은 src/package.json이 생긴 뒤 단일 기준, 최초 0B 목표 0.1.0, 의미 있는 기능마다 MINOR 검토, 호환 수정 PATCH.
- Alternatives: 문서 Bootstrap에 가짜 앱 version 부여, arbitrary 원격/force push.
- Reason: 재현·복구·버전 사실성을 유지한다.
- Trade-offs / Consequences: 현재 앱 버전 없음/Release Tag 없음. 초기 Git author 미설정은 2026-09-07 사용자가 제공한 정보로 repository-local config를 설정하여 해결했다. 작성자 정보 제공은 구현 계획 승인과 구분한다. 연결 성공은 Push 권한 검증과 구분한다.

## 확인 및 진행 기록

| 항목 | 상태 | 다음 조치 |
| --- | --- | --- |
| 전체 구현 계획 | 2026-09-07 실행 승인 | DXF 우선 순서로 0B 시작 |
| ADR-004 직접 DWG 렌더링 | 다음 버전으로 이관 | DXF 릴리스 후 실제 API 실험, 중요한 추가 구조 변경만 확인 |
| 첫 Git 문서 Commit 작성자 | 2026-09-07 사용자 제공 정보로 local 설정 완료 | 보안 점검 후 지정 remote에 문서 commit/push; 실제 결과는 TestReport 참조 |
| 실도면·업무 성능 목표 | 미제공 | 합법적인 최소 fixture로 초기 시험, 실도면 평가는 미검증 유지 |

확인일·범위·사용자 변경 지시를 실제 응답이 왔을 때 기록한다. 단순한 문서 작성이나 시간 경과를 승인으로 간주하지 않는다.

## ADR-011 — DXF 우선 릴리스와 DWG 후속 버전

- Date / Status: 2026-09-07 / 사용자 승인.
- Context: 사용자가 dxf-viewer와 three-dxf-viewer를 먼저 구현하고 libredwg-web은 다음 버전에서 구현하도록 명시했다.
- Decision: 공통 DB/등록/검색 기반과 두 DXF Adapter, 전환, DXF metrics/E2E를 먼저 완성한다. DWG 등록/메타데이터는 공통 기반에 유지하되 DXF 릴리스의 DWG 화면에는 렌더링 미구현 상태를 명확히 표시한다. 실행 가능한 DWG Viewer 선택 버튼은 제공하지 않는다.
- Alternatives: DWG 실험 선행(기존안).
- Reason / Trade-offs: 우선 사용할 DXF 경로를 먼저 검증한다. DWG 불확실성은 후속 MINOR 버전에 남으며 DXF 릴리스 완료와 전체 P.O.C. 완료를 구분한다.
- Consequences: 8/9를 DXF 단계(A)와 DWG 단계(B)로 나누고 각각 결과를 기록한다. 0B는 0.1.0, DB/Upload/목록/dxf/three/전환 및 검증의 기능 증가를 순차 MINOR로 관리한다. DWG는 DXF 릴리스보다 높은 MINOR로 별도 구현한다. 이번 지시는 구현 시작 승인으로 기록하며 반복 전체 승인을 요청하지 않는다.

## ADR-012 — 실제 DB 목록과 갱신 일관성

- Date / Status: 2026-09-08 / 승인된 Unit 3 범위에서 채택.
- Context: GitHub #1에서 등록 후 목록 미표시. 기존 홈은 정적 안내였고 DB 조회가 없었다.
- Decision: 서버 동적 목록과 안전한 DTO, 매개변수화 SQLite 검색, 등록/Current 변경 후 경로 및 클라이언트 캐시 갱신을 사용한다.
- Alternatives: 클라이언트 전용 목록 fetch, 별도 검색 엔진.
- Reason: 기존 Next/SQLite 계층으로 충분하며 검색 엔진 추가가 불필요하다.
- Trade-offs / Consequences: 파일명은 대소문자를 구분하는 문자 그대로 부분 검색이다. count/rows 일관성을 위해 기존 프로세스 트랜잭션 큐를 공유한다. 단일 프로세스 P.O.C.에 적합하며 고동시성 확장은 별도 평가한다. Schema 변경은 없다.

## ADR-013 — 첫 DXF Adapter와 Worker

- Date / Status: 2026-09-08 / 승인된 Unit 4 범위에서 채택.
- Context: DOM/WebGL 코드의 SSR 실행을 피하고 이후 두 번째 DXF Viewer를 분리해야 한다.
- Decision: dxf-viewer 1.0.48 고정, Browser effect의 동적 import 및 bundled Worker, 공통 Manager/Adapter. 라이브러리 소스 수정 없이 public API로 탐색과 정리 구현.
- Alternatives: 메인 스레드 파싱, 외부 CDN Worker.
- Reason / Trade-offs: 파싱을 Worker로 분리하고 외부 CDN 의존을 피한다. 취소 시 라이브러리 Worker의 미완료 Promise는 Adapter cancellation과 timeout으로 차단한다. 실도면 메모리 추세는 이후 평가한다.
- Consequences: 기본 글꼴을 아직 제공하지 않아 TEXT/한글은 제한이 있으며 명시적으로 안내한다. 향후 font/encoding·Layer 지원은 Sample 및 라이선스 검토와 함께 확장한다. 이번 검증을 전문 CAD 수준 충실도 보장으로 해석하지 않는다.

## ADR-014 — three-dxf-viewer 및 공통 한글 글꼴

- Date / Status: 2026-09-08 / 승인된 Unit 5에서 채택.
- Context: 두 번째 라이브러리는 font JSON이 필요하고 Scene/탐색을 앱에서 구성해야 한다. 사용자도 한글 글꼴 제공 방식을 문의했다.
- Decision: 고정 three-dxf-viewer 1.0.44 / Three 0.171, 별도 Adapter와 Scene, 로컬 한글 TTF 및 build-time typeface 변환. upstream 코드 변경 대신 material clone/대비 보정과 검증을 Wrapper에 둔다.
- Alternatives: font CDN, 라틴 전용 font, upstream fork.
- Reason / Trade-offs: CDN 없이 두 Viewer에서 같은 글꼴을 검증한다. 전체 한글 typeface JSON의 크기(약 25.8 MB)와 메인 스레드 파싱 비용은 남는다. subset은 실제 도면 문자 범위가 확인된 후 평가한다.
- Consequences: Layer는 UI 연결. Hover/Select/CADControls는 anonymous listener와 public Dispose 부재가 확인되어 현재 UI에 넣지 않는다. SnapsHelper는 clear가 있지만 정확도/복잡도는 아직 실측하지 않았다. source-level 지원 사실을 runtime PASS로 기록하지 않는다. Unit 6에서 전환과 자원 stress를 검증한다.
- 실제 검증에서 생략된 Z 좌표→NaN bounds를 확인했다. 일부 Entity의 생략된 Z=0 보완과 finite bounds 검증을 Wrapper에 추가했다. 원본 bytes는 그대로 보관하며 변환은 브라우저 임시 표현에 한정한다.

## ADR-015 — Version 범위 원본 공유와 Renderer 수명 분리

- Date / Status: 2026-09-08 / 승인된 Unit 6에서 채택.
- Context: 같은 도면 전환마다 전체 navigation/다운로드가 발생했고 빠른 전환의 지연 결과를 차단해야 한다.
- Decision: mounted Version에 ViewerSource를 두고 renderer별 Manager/Adapter를 생성한다. 공유 원본은 독립 복사본으로만 전달한다. URL은 replaceState로 반영하고 explicit reload에서만 cache를 비운다.
- Alternatives: 전환마다 fetch, 전역 무제한 CAD cache, 외부 상태관리 추가.
- Reason / Trade-offs: 동일 bytes 비교와 한 번 다운로드를 보장하며 문서 이탈 시 해제한다. 원본+작업 복사본의 메모리 비용은 허용하고 전역 CAD cache를 만들지 않는다. 시점/Layer 상태 공유는 라이브러리별 좌표 차이 때문에 이번 범위에서 제외한다.
- Consequences: Unit 6은 lifecycle과 자원 수를 검증하며 대형 도면 성능/heap 추세와 P.O.C. 종합 평가는 Unit 8A에 남는다.

## ADR-016 — 관측 가능한 통합 처리 시간

- Date / Status: 2026-09-08 / 승인된 Unit 8A에서 채택.
- Context: 두 라이브러리의 parse/preparation/font 구조가 달라 임의 시간을 순수 parse로 비교하면 오해를 만든다.
- Decision: source/init/adapter 통합 처리/frame 관찰을 공통 측정하고 pure parse는 null+사유. entityCount는 공개 parsed source가 있는 three만 사용, dxf는 미계측. 현재 UI JSON과 독립 benchmark harness로 검증한다.
- Alternatives: upstream parser 수정, 추정 parse 시간, 별도 모니터링 플랫폼.
- Reason / Trade-offs: 원본 수정/대규모 의존 추가 없이 재현성을 확보한다. 세부 parse 비교와 dxf Entity count는 남지만 잘못된 정밀도를 제공하지 않는다.
- Consequences: browser JS heap은 참고 snapshot이며 GPU/전체 누수 보장이 아니다. 실도면/10 MiB 초과 샘플/업무 SLA는 제공된 근거가 없으면 미검증으로 남긴다.

## ADR-017 — DXF 회귀 완료와 실도면 평가 분리

- Date / Status: 2026-09-08 / Unit 9A에서 채택.
- Context: 승인된 DXF 우선 순서에서 통합 검증 단계에 도달했으며 실제 업무 Sample과 SLA는 제공되지 않았다.
- Decision: UI 전체 흐름·Current·양방향 Viewer·20회 전환을 자동화하고 DXF P.O.C. 기능 검증으로 기록한다. 실도면 적합성/DWG는 NOT RUN을 유지한다. 기능 변경 없는 테스트/문서이므로 버전 0.8.0을 유지한다.
- Alternatives: 샘플 없이 전체 P.O.C. 완료 선언, 테스트 추가만으로 MINOR 증가.
- Reason / Trade-offs: 실행 근거와 버전 의미를 보존한다. 합성 도면 통과는 복잡한 업무 CAD의 보증이 아니다.
- Consequences: 다음 승인 Unit은 7A 기술 실험. 신규 원격 이슈 #2 메모는 후속 기능으로 별도 추적한다. Tag는 전체 실도면 적합성 승인으로 오해하지 않도록 이번에 생성하지 않는다.

## ADR-018 — LibreDWG 배포본 ESM과 WASM Worker 격리

- Date / Status: 2026-09-08 / Unit 7A 채택.
- Context: 0.7.10은 완성형 viewport가 아닌 parser이며 Emscripten glue의 Node 조건부 import 때문에 Next Webpack 직접 bundling이 실패했다.
- Decision: 고정 npm 배포본을 local public asset으로 그대로 준비하고 Worker가 native ESM으로 읽는다. 각 요청의 포인터/임시 FS를 finally에서 해제하고 Worker를 종료한다. LINE 최소 직접 renderer로 실험한다.
- Alternatives: upstream 수정/fork, Webpack의 node 모듈 전역 무시, 메인 thread에 WASM 장기 유지.
- Reason / Trade-offs: 파서 원본 변경 없이 Browser/Server 경계와 취소를 유지한다. 요청마다 초기화 비용과 큰 WASM 메모리 비용이 발생한다. 완료/종료 후 OS RSS의 즉시 감소는 보장하지 않는다.
- Consequences: 0.9.0은 독립 기술 실험이며 업무 DWG Viewer 전체 구현이 아니다. 등록 도면 연결·Adapter 계약·오류/재진입 확장은 Unit 7B. 라이브러리 GPL-3.0 표기와 source 링크는 Architecture/Operation에 보존한다.

## ADR-019 — DWG 전용 형식 선택과 부분 표시 결과

- Date / Status: 2026-09-08 / 승인된 Unit 7B에서 채택.
- Context: 등록 DWG를 기존 Viewer 화면에 연결하되 다른 DXF renderer 선택 및 LINE 외 Entity의 거짓 성공을 막아야 한다.
- Decision: DB 형식 기준 selectRenderer와 Manager format 경계를 적용한다. DWG는 libredwg-web Adapter만 선택하고 7A의 planar LINE/20 MiB 한도를 유지한다. 제외 건수가 있으면 UI 경고+metric partial을 기록한다.
- Alternatives: DWG에 DXF 버튼 노출, DXF 변환, 표시 불가 Entity를 empty 성공으로 숨김, 이번 Unit에 전체 CAD renderer 구현.
- Reason / Trade-offs: 승인된 통합 범위와 파서/renderer 책임을 유지한다. 등록 DWG를 조회할 수 있지만 전체 업무 도면 충실도는 아직 충족하지 않는다.
- Consequences: 버전 0.10.0. 공통 measurement result에 partial 추가, 원본·DB 불변. 8B에서 DWG 상세 계측/성능, 9B에서 최종 DWG 회귀/평가를 진행한다.

## ADR-020 — 선택적 S3 호환 저장소와 locator 호환성

- Date / Status: 2026-09-08 / 사용자의 SeaweedFS 등 S3 지원 요청에 따라 채택.
- Context: 기존 CAD 원본은 Local Filesystem이며 S3 추가가 필요하다. 네트워크 업로드를 SQLite transaction에 넣으면 잠금/timeout 위험이 커진다.
- Decision: 고정 AWS SDK S3 adapter, server env 설정, prepare PUT을 DB transaction 전에 수행. storage_path의 namespace로 기존 local과 S3 bucket/key를 구분하고 실패 보상과 혼합 조회를 지원한다.
- Alternatives: 모든 파일 즉시 S3 migration, 전역 backend만 보고 기존 경로도 S3로 해석, 원격 PUT을 DB transaction 안에 배치, presigned browser 업로드.
- Reason / Trade-offs: 기존 데이터와 API를 보존하며 큰 파일 네트워크 대기 동안 DB writer lock을 유지하지 않는다. object locator는 Version ID와 별도 UUID이며 기존 schema를 바꿀 필요가 없다. 현재 한 endpoint만 설정할 수 있고 local 임시 저장 공간은 계속 필요하다.
- Consequences: 0.11.0 신규 기능. 기존 파일 자동 이동/외부 bucket 생성/실제 .env 활성화는 수행하지 않는다. opaque S3 locator를 이해하지 못하는 구버전으로 rollback할 때 별도 복구 검토 필요. Unit 8B DWG 계측은 이 사용자 요청 완료 후 다음 승인 단계로 유지한다.

## ADR-021 — Version 직접 링크와 팀 역할 기록

- Date / Status: 2026-09-08 / Unit LINK 구현 채택.
- Decision: 링크는 현재 origin의 `/cad/versions/{versionId}/viewer`와 허용 renderer query만 포함하는 불변 Version 주소로 만든다. Clipboard 실패에는 수동 복사/열기를 제공하며 DWG는 항상 libredwg-web로 강제한다. 역할은 gpt-6-astra Manager → gpt-5.6-sol Developer → gpt-5.6-luna QA → Manager 승인/재작업 → root release commit/push 순서로 기록한다.
- Consequences: Current 교체와 무관하게 대상 Version이 유지된다. 실제 접근성은 실행 중 서버와 origin reachability에 의존하며 공개 운영/인증은 범위 밖이다.

## ADR-022 — Docker 단일 인스턴스 배포와 GHCR

- Date / Status: 2026-09-08 / 사용자 요청에 따른 설계 채택, 실제 배포 검증은 U-DEPLOY-20260908.
- Context: 다른 host IP 접속과 재현 가능한 image 배포/pull이 필요하며 기존 SQLite/S3 설정과 Secret 경계를 보존해야 한다.
- Decision: src의 multi-stage Dockerfile/명시 이름 Compose, root context `.dockerignore`, Node22 고정, nonroot runtime, named data volume, migration 후 모든 인터페이스 수신. 지정 GitHub 소유자 GHCR만 사용하며 실제 Token은 image 밖에서 취급한다.
- Alternatives: 단순 host npm 배포 유지, 별도 DB server/여러 app replica, Git credential을 image에 포함하는 자동 clone. 마지막 방식은 Secret 규칙에 위배되어 배제했다.
- Reason / Trade-offs: 기존 단일 SQLite 모델과 CAD 관리 API를 유지한다. migration CLI를 위해 runtime에 기존 dependency집합을 포함해 image가 크며 이 단계에서 과도한 slim화는 하지 않는다. hostIP 수신은 접근성을 제공하며 별도 인증/TLS를 추가한 의미가 아니다.
- Consequences:0.13.0. Root `.dockerignore`는 build context 필터상 필수 예외. 기존 host data와 SeaweedFS를 자동 변경하지 않는다. Luna QA 사용량 제한은 숨기지 않고 root 실행/Manager 검토의 실제 대행 이력을 기록한다.

## ADR-023 — Version별 선택 설명과 별도 부분 검색

- Date / Status: 2026-09-09 / 사용자 도면 설명·검색 요청에 따라 채택.
- Context: 도면 파일명만으로 업무 목적을 구분하기 어렵다. Location/Current와 별개로 등록한 도면 Version의 설명이 필요하며 기존 등록·검색 계약을 보존한다.
- Decision: CadFileVersion.description을 TEXT NOT NULL DEFAULT ''로 추가한다. 입력 생략은 빈값, trim/NFC/CRLF→LF 후 최대2000 UTF-16 code units, LF/TAB외 제어문자거부. React plain text로 표시한다. 별도 description query의 SQL instr literal검색을 기존조건과AND 결합하며 파일명검색 의미는 바꾸지 않는다.
- Alternatives: Location 공통 메모, filename과 설명을 하나의OR검색에 병합, richtext editor, 별도 fulltext검색엔진. 사용자 요청범위·기존검색호환·구조단순성을 기준으로 제외했다.
- Reason / Trade-offs: 작은 additive migration으로 기존Version/Current/원본을 보존한다. 대소문자구분 substring은 기존filename과같고 대규모검색성능/텍스트색인은이번P.O.C.범위에서추가하지 않는다. 등록후설명편집은 별도요청이필요하다.
- Consequences:0.14.0. UTF16길이는 textarea maxlength/JS문자열과일치하며 UTF8전송바이트한도는8192로 별도설정한다. 최종Migration검증/설명없는기존API회귀/검색과HTML표시는 TC-DESC-001–005로검증한다.

## ADR-026 — GPT-6 Sol/Luna 도입에 따른 역할별 모델 매핑 갱신

- Date / Status: 2026-09-23 / 사용자 요청으로 채택.
- Context: 현재 역할 정책은 gpt-6-astra Manager, gpt-5.6-sol Developer, gpt-5.6-luna QA로 운영되고 있었다. 새 GPT-6 Sol/Luna 사용 가능성을 반영하되 역할 책임과 검증 독립성은 유지할 필요가 있다.
- Decision: Manager는 gpt-6-astra를 유지한다. Developer는 gpt-6-sol로 갱신하여 구현, 리팩터링, 복잡한 기술 분석의 주 실행 모델로 사용한다. QA는 gpt-6-luna로 갱신하여 독립 검증, 회귀 시험, 문서·추적성 점검을 담당한다. Manager가 요구사항/AC/작업 분배와 최종 재작업 여부를 판단하는 구조는 유지한다.
- Fallback / Evidence: 지정 모델 사용이 불가능하거나 사용량 제한이 발생하면 실제 대행 주체와 검증 근거를 TestReport에 기록한다. 역할을 수행하지 않고 수행한 것으로 기록하지 않는다. 과거 TestReport와 기존 ADR에 남은 gpt-5.6-sol/luna 기록은 당시 실행 증거이므로 소급 수정하지 않는다.
- Consequences: 새 세션은 AGENTS.md의 최신 역할 매핑을 따른다. 애플리케이션 소스, DB, 런타임, SemVer, Docker/GHCR 산출물에는 영향이 없다.


## ADR-027 — 제품 계층과 기존 층 식별 보존

Manager 결정 (2026-10-15): 제품별 운영 site 계층, 명시 SITE/LEGAL_ENTITY 종류, CadLocation ID 보존, 사업부별 미분류 제품 및 수동 재분류, #6 기본 이름 형식 유지. 상세 근거와 수용 기준은 [Issue24](Issue24.md). 전사 물리 자산의 추정 병합은 하지 않는다. 운영 migration은 이번 실행 범위 밖이다.
