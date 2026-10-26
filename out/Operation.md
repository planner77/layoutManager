# 운영·환경설정 초안

## 0.42.0 게시된 앱·마이그레이터 쌍 (2026-10-27)

현재 확인한 태그는 `ghcr.io/planner77/layoutmanager:0.42.0`과 `ghcr.io/planner77/layoutmanager:0.42.0-migrate`이며 둘 다 source `f2c04bf`로 게시했다. digest·Main CI·실제 시험은 [TestReport](TestReport.md) U-ISSUES124-126-127-20261027을 따른다. 아래 기존 pair 고정·같은 시점 백업·migration 성공 후 앱 기동 절차를 적용한다. 이 작업은 이미지 게시까지이며 실제 서버/.env/볼륨·Auth/G7 활성화는 실행하지 않았다. Viewer의 Three 기본/단발 대체 및 수동 전환, 미저장 작업 확인은 아래 운영 안내와 [단위 가이드](Issues124-126-127.md)를 참조한다.


## #124/#126/#127 Viewer 복구와 작업 공간 (0.42.0 후보)

DXF 직접 링크에 renderer를 생략하면 Three를 사용합니다. 기존 ?renderer=dxf-viewer 링크는 그대로 열립니다. Three 초기화/도면 처리 실패에는 dxf-viewer를 한 번 대체 시도하며 원본 HTTP 오류는 대체하지 않습니다. 로딩이 응답하지 않을 때 지역 로딩 안내에서 반대 DXF 렌더러로 중단·전환하거나 명시 dxf 링크로 다시 엽니다. 수동 전환은 양방향이며 자동 대체는 Three 실패에서 dxf로 한 번만 수행합니다. 검증되지 않은 파일 크기/시간 임계값은 새로 도입하지 않습니다. JS 탭 종료·OOM 복구는 보장하지 않으며 Adapter의 bytes 사본으로 추가 메모리가 필요합니다.

도면 그룹은 버전 목록·원본 다운로드·링크 복사·재로드·정보, 보기 그룹은 renderer·확대/축소/맞춤·전체 화면, 작업 그룹은 레이어·선택/외곽선·트리·검색·하단 도구에 접근합니다. Drawer 개폐는 원본을 다시 읽거나 임시 편집 결과를 저장하지 않습니다. 수동 renderer 전환/재로드의 임시 작업 폐기 확인은 작업을 서버에 저장했다는 뜻이 아닙니다. 미지원 기능은 사유와 함께 비활성입니다.

설계/AC와 실행 결과는 [Issues124-126-127](Issues124-126-127.md)/[TestReport](TestReport.md). 기존 생산 환경 설정/DB/CAD/S3/G7 게이트는 변경하지 않습니다. 후보 기능 작성과 실제 배포/현장 수용을 구분합니다.


## Issue #109 S3-1 — 운영 적용을 차단한 Prisma 후보/이중 Gate 작업 절차 (2026-10-26)

- **운영 보안 경계:** `src/prisma/schema.prisma`에는 신규 User/AuthSession 등이 코드생성용으로 존재하나 현재 운영 DB는 여전히 CAD 6개 Migration만 적용. 운영 `scripts/deploy.ts`는 건드리지 않으며, **활성 `src/prisma/migrations`에 S3 Auth SQL 없음**. S3 후보에 실 운영 DB URL을 주입하거나 `prisma db push`·기본 `npm run db:deploy`로 새 모델을 적용하지 않는다.
- **허용된 격리 시험:** [`src/deploy/g7-s3/README.md`](../src/deploy/g7-s3/README.md)의 명시된 `/tmp/cad-g7-s3-XXXXXX/fixture.sqlite` 준비·0600 marker, `G7_S3_MIGRATION_TEST_ONLY=true`/`G7_S3_TEST_ROOT`/`G7_S3_TEST_DATABASE_URL` = `DATABASE_URL`, `G7_AUTH_ENABLED=false`/`G7_CAD_WRITE_CUTOVER_ENABLED=false`에서만 `npx prisma migrate deploy --config deploy/g7-s3/prisma.config.ts` 실행. 경로/마커/UID·모드 실패는 `G7_S3_DISPOSABLE_MIGRATION_ONLY`로 중단. 사내 실제 DB·CAD/S3 접근 명령 아님.
- **Release/Operation 검증:** `src/server/g7-operational/preflight.ts`는 준비 상태만 반환하며 운영 라우트·실 서버 실행에는 연결되지 않음. 성공한 synthetic test는 실제 digest 서명/registry pair, Owner 사내 EV 승인, 실 동일 snapshot Restore가 아니다. S3-2/3/4에서 검증 출처 연결과 업무/API 통합 및 롤백 검증 완료 후 S3-5 Owner 실행 GO 필요.
- **GHCR 미게시:** 이 PR은 `#109 | S3-1 Operational schema and gates [G7-S3-1-NO-GHCR]` 정확 제목과 한정된 S3-1 diff만 Main CI GHCR 게시 제외하도록 설계. 사용자 이번 요청에는 PR 생성 및 CI 시작만 포함, **병합/GHCR/운영 Auth·Prisma/Nginx·Compose/.env/실 데이터 변경 금지**.
- **S3-1 완료 범위:** 공식 후보 Migration SQL/Prisma Client/Gate/격리 Unit·Integration 코드가 **신규 HEAD CI PASS까지 확인**되어야 개발 게이트 충족. 여전히 실제 운영 활성화/이슈 #109·#96 종료 불가.



## Issue #109 S2 PR #129 — GHCR 게시 없이 준비 기능 병합하기 위한 운영 게이트 (2026-10-26)

- **정확 Squash 제목:** `#109 | S2 private-evidence readiness [G7-S2-NO-GHCR]`. 반드시 **커밋 첫 줄이 완전 일치**해야 하며 본문은 여러 줄이어도 된다. 이 제목이 아닌 다른 접미/후행 공백이 있으면 S2 Main 예외가 적용되지 않고 fail-closed한다.
- **허용 경로:** `.github/workflows/docker-publish.yml`, `AGENTS.md`, `out/{Decisions,FailureLedger,Issue109-S2-Readiness,Issue109,Operation,Requirements,TestPlan,TestReport}.md`, `src/scripts/g7-s2-readiness.ts`, `src/server/g7-staging/s2-readiness.ts`, `src/tests/unit/{g7-s2-readiness,g7-staging-ghcr-guard}.test.ts` **완전 일치 목록**. `*.md`나 `src/server/g7-staging/*` 같은 포괄적 예외는 사용하지 않는다.
- **실패 시 동작:** 승인 제목인데 비허가 파일이 하나라도 있으면 release-scope가 `stderr` 오류를 기록하고 `exit 1`한다. S2 유사 제목도 오류 종료. 일반 runtime 변경·정상 tag push는 기존 GHCR 발행 정책을 그대로 유지한다. S1 별도 좁은 예외도 보존.
- **현 요청 실행 범위:** 최신 PR CI 시작 후 CI 모니터링·Squash Merge·Main CI/GHCR 게시 실행 금지. 추후 명시 승인 시 release-scope SUCCESS와 Build/Push GHCR **SKIPPED** 실제 증거를 확인하고 PR #129와 #109/#96 운영/완료 상태를 분리한다. 실제 운영 계정/Prisma Migration·Compose/Nginx/.env·DB/CAD/S3는 이 브랜치에서 변경하지 않는다.


## #109 S2 현장 증거 비반출 운영 절차 (2026-10-26)

- 공개 리포지토리로 원본 시험자료를 제출할 필요가 없다. 사내 승인 담당자가 `out/Issue109-S2-Readiness.md`의 비밀/실 데이터 제외 Manifest JSON을 사내 전용 절대경로에 만들고 **사내에서만** `cd src && npx tsx scripts/g7-s2-readiness.ts /absolute/private/s2.json`을 실행한다.
- 결과는 `BLOCKED`/`PENDING`/`READY_FOR_OWNER_REVIEW` 및 사유 코드·개수뿐이며 **모두 operationalGo=false**. 상태만 Issue #109에 적고 원본 로그·실 CAD/DB·객체 SHA·내부 URL/IP/Secret은 비공개로 보관한다. 형식 검사 성공≠실 시험 증빙 검증/실 운영 GO. 미완료 legacy Auth/Prisma/Restore·OCI pair와 배포 중단 기준은 별도 구현·검증해야 한다.


## Issue #109 / PR #125 P1 — Prisma 대상 보호 및 GHCR 정확 제목 운영 절차 갱신 (2026-10-26)

- **Staging Prisma 실행 순서 변경:** 기존 Staging README의 "루트/URL만 먼저 설정하고 Migration 실행" 방식은 더 이상 허용하지 않는다. `g7-staging-prepare.ts`가 만든 전용 `/tmp/cad-g7-staging-*/fixture.sqlite`를 확인하고 `G7_STAGING_ROOT`, `DATABASE_URL`, `G7_STAGING_DATABASE_URL`, `CAD_STORAGE_PATH`, `G7_STAGING_ORIGIN`, `G7_STAGING_ONLY=true`, `G7_RELEASE_CAPABILITY=G7-S1-STAGING-V1`, `G7_OPERATION_APPROVAL=S1-STAGING-ONLY` 및 `G7_AUTH_ENABLED=true`(격리 Staging에서만)를 **Prisma CLI 시작 전에 함께 지정**해야 한다. 실제 명령: `npx prisma migrate deploy --config deploy/g7-staging/prisma.config.ts`. Gate 검증 실패면 `G7_STAGING_PRISMA_TARGET_DENIED`로 즉시 종료; 기본 fallback/운영 DB 접속 불가. `G7_CAD_WRITE_CUTOVER_ENABLED`는 별도 기본 OFF.
- **GHCR 미게시 정책:** Main S1 예외는 Squash Commit **첫 줄**이 정확히 `#109 | S1 Staging-only integration [G7-S1-NO-GHCR]`일 때만 허용(본문 여러 줄 가능). 유사 제목/공백 suffix는 Main CI fail-closed. 승인된 Stage/docs/해당 workflow 경로 이외 변경이 있으면 error를 stderr로 출력·중단. 기존 코드 릴리스/tag 게시 정책은 변경하지 않는다. 본 요청은 실제 병합·Main CI·GHCR 게시 금지, 보완 후 새 PR CI **시작**까지만.
- **시험 및 증거:** [Run 40275956996](https://github.com/planner77/layoutManager/actions/runs/40275956996) Unit 단계 stdout/stderr Assertion 실패 및 Codex P1 3건을 [FailureLedger](FailureLedger.md)에 별도로 누적. 새 HEAD Typecheck/Vitest/Prisma/후속 E2E는 결과 미확인/PENDING. 실제 사내 운영 Auth/Prisma/Compose/Nginx/.env/DB/CAD/S3와 미승인 Audit purge/영속 API는 OFF.


## Issue #109 PR #125 — 수용·쿠키 격리·GHCR 미게시 병합 Runbook (2026-10-26)

- **Stage만:** 기존 `/api/cad-files` Multipart와 일반 Current/Delete API는 그대로. `/api/g7-staging/**` DXF JSON/base64 미러와 일회용 Prisma·SQLite/CAD 로컬 fixture는 실제 운영 DB/CAD/S3/Viewer 수용 근거 아님. `cad_staging_session`은 전용 Path로만 발급·회수; 같은 hostname의 `cad_session`은 stage에서 사용하지 않고 내부 G3/G4로 전달할 때만 적응 변환.
- **수용 출처:** 첫 PR CI [40270394055](https://github.com/planner77/layoutManager/actions/runs/40270394055) HEAD `a82a04bb` Verify/Docker 성공. 이후 쿠키·GHCR skip 코드/테스트 수정이 있으면 신규 HEAD PR CI 성공/리뷰 완료/behind=0/무충돌 확인 전 병합 보류. Node/Vitest/Prisma 자동검증과 **실 PC·Nginx/원격 S3·복원 검증은 분리**.
- **GHCR 없는 Main CI:** G7 S1에만 별도 Main release-scope 예외가 적용된다. **병합 시 squash commit_title을 정확히 `#109 | S1 Staging-only integration [G7-S1-NO-GHCR]`으로 지정**해야 하며, diff는 stage 경로·Docs·`docker-publish.yml`만 허용. 예상외 경로면 Main CI 중단(게시 불가), 일반 runtime/tag 릴리스에는 예외 금지. Main CI의 `Main CI - verify release scope` success 및 `Build and push to GHCR` SKIPPED를 실제 확인; Main CI 시작만으로 GHCR 미게시 성공 선언하지 않는다.
- **추가 미해결:** Stage→운영 Multipart Cutover 동등성, 실제 App+Migrator immutable OCI 두 digest 검증, 동일 DB/CAD/S3 snapshot 복원, 관리자 Secret·Audit 365일 이후 purge/백업 세칙, #108 비공개 원본 EV ID 및 **별도 Owner S2 GO**. 이 게이트 완료 전 운영 .env/Compose/Nginx/Prisma/업무 API/데이터는 OFF·불변, #109/#96 OPEN/BLOCKED.



## Issue #109 G7 S1 — 오프라인 Staging 전용 실행·시험 절차 (2026-10-26)

**운영 G7 AUTH/API/DDL/Compose/Nginx/.env·DB/CAD/S3 변경 금지, Owner 별도 Go/No-Go 전 운영 NO-GO.** [src/deploy/g7-staging/README](../src/deploy/g7-staging/README.md) 기준으로만 시연한다.

1. `npx tsx scripts/g7-staging-prepare.ts --ack-disposable-only`는 오직 /tmp 새 DB/스토리지/비공개 release.json을 만든다. 검증된 staging candidate **참조 digest 두 개와 source commit**을 사전에 지정해야 한다. 이후 `G7_STAGING_DATABASE_URL=file:<temp>/fixture.sqlite npx prisma migrate deploy --config deploy/g7-staging/prisma.config.ts`로 **Staging Prisma 전용 7개 Migration**을 실행한다. 기본 `npm run db:deploy` 사용 금지.
2. staging Next 앱의 `DATABASE_URL=G7_STAGING_DATABASE_URL`, `CAD_STORAGE_PATH=<temp>/cad`, `G7_STAGING_ROOT=<temp>`, 고정 `G7_STAGING_ORIGIN`을 지정. `G7_STAGING_ONLY=true`, `G7_RELEASE_CAPABILITY=G7-S1-STAGING-V1`, `G7_OPERATION_APPROVAL=S1-STAGING-ONLY` 및 `G7_AUTH_ENABLED=true`가 모두 있어야 /api/g7-staging 계층을 열 수 있다. `G7_CAD_WRITE_CUTOVER_ENABLED` 별도 기본 false. 모두 격리 테스트 값이지 Owner 운영 승인값이 아님.
3. Admin 최초/복구는 승인된 0600 Secret과 `npx tsx scripts/g7-staging-admin.ts --ack-staging-only`로 **명시 1회만**. G3 login/initial-change/session/change/logout, G4 permit/grant/disable/audit 및 CAD Staging 전용 JSON/base64 DXF upload·current·version 기능 검증. **기존 운영 CAD multipart API와 동일한 endpoint/호환 완성 아님**. 기존 익명 GET·Viewer/Current/Version/SHA 불변 확인.
4. G7 staging tests는 `tests/unit/g7-staging-gate.test.ts`, `tests/integration/g7-staging.test.ts`에서 격리 스키마 migration, 세션·권한·Audit/CAD·snapshot restore를 수행하도록 작성됨. 실제 사내 PC 2대/실 S3/운영 Restore·digest 서명 검증은 이 환경 테스트로 주장하지 않는다. 실행 못한 시험은 NOT RUN, PR CI 결과는 해당 HEAD Run/Job 확인으로만 PASS.
5. 삭제는 Staging 버전 metadata와 tombstone만 바꾸고 파일 bytes는 복구 대비 격리 볼륨에 유지. Audit 365일 물리 purge는 실행하지 않는다. 실 사내 계정/Secret/URL·CAD 및 원시 로그 공개 Git/CI 포함 금지.


## Issue #109 — G7 승인 전 활성화·중단·롤백 Runbook (2026-10-26)

**현 상태 S0 문서 준비만 가능 / 실제 운영 NO-GO.** 상세: [Issue109 S0~S4](Issue109.md). #108의 Owner 현장 시험 수용은 완료됐지만, G7 운영 증거의 비공개 식별자/릴리스·복구 계획 확인 및 별도 Owner GO 전에 운영 Auth/API·Prisma·Nginx/Compose/.env·CAD write 전환 금지.

1. **S0 NOW:** 기본 OFF 이중 게이트·승인 패키지·스냅샷/복구 체크리스트 문서화. `G7_AUTH_ENABLED`와 `G7_CAD_WRITE_CUTOVER_ENABLED`는 **현재 미구현 설계용 이름**, env 설정/문서 PR로 Auth가 켜지지 않는다.
2. **S1 ISOLATED:** 고정 소스 SHA/App·Migrator 두 digest, 정식 Schema·migration 격리 dry-run, 기존 GET/쓰기·Session/Role/Site/Audit 검증, 두 PC·실 backup+restore #108 Owner 수용 결과의 비공개 증거 검토 및 G7 Staging 실증. 실제 운영 데이터 변경 0.
3. **S2 GO/NO-GO:** 사내 승인 ID, Owner/운영자·대체자/QA·유효 창, 정확한 두 digest·Schema·migration, 같은 DB+CAD+S3 snapshot ID, Audit purge 세칙 또는 보류·잔여 위험·롤백 계획 확인. 불일치·미승인은 NO-GO.
4. **S3 APPROVED ONLY:** 쓰기 중지→같은 snapshot 안전 backup+실 Restore 확인→쌍이 맞는 migrator→FK/Version/Current/원본 bytes/SHA 검사→App Auth OFF 시작/기존 익명 GET→단발 Admin→Auth ON→별도 CAD write cutover→Audit·현장 E2E/Owner 수용. 신규 메모/타입/외곽선/로그 API·Audit purge 별도 승인 전 OFF.
5. **S4 ROLLBACK:** 쓰기 중지·세션 폐기·flag OFF→구 호환 App/Migrator pair+**같은 snapshot DB/CAD/S3** 함께 복원→원본·Version/Current·FK·객체 checksum 검증. 구 App만 신규 Schema에서 실행 금지, backup 이후 작업 손실/재처리 및 Owner 승인 전 재개 금지.

공개 GitHub에 실제 URL/IP, Secret/사용자 비밀번호, 실 CAD·S3 key·원시 로그 기록 금지. 문서 작성/CI/GHCR 게시만으로 GO 또는 실복구 PASS 아님.


## Issue #108 / G6 — 사내 전용 증거 평가 및 격리 복원 절차 (2026-10-26)

- **비운영 실행:** src/tests/fixtures/g6/manifest.example.json은 전체 NOT_RUN 템플릿. 사내 접근제한·저장소 외부의 절대경로에 복사한 manifest만 `cd src && node scripts/g6-evidence.mjs /private/g6/evidence.json`으로 검증한다. 이 CLI는 정해진 코드/건수만 출력하고 실 호스트·S3·CAD·토큰/비밀번호/SHA/로그를 출력하지 않는다. 종료코드 0은 매니페스트 구조상 READY_FOR_OWNER_REVIEW, 3은 누락/차단, 2는 입력 거부. 실제 검사 실행/성공 및 Owner 수용과 분리.
- **현장 Runbook:** 사내 지정 운영 담당자의 사전 승인과 업로드/삭제/스토리지 정리·DB 경쟁 작업 quiesce → 하나의 snapshotId로 SQLite online backup + PRAGMA quick_check/foreign_key_check 및 CadFileVersion·Current·sha256/size 동결 → 동일 시점 local CAD bytes 및 S3 실제 object version/bytes hash+size 보관 → 사내 격리 DB/스토리지로 복제해 **별도로 승인될 실제 운영 Prisma migration만** dry-run → FK/Unique/Current·Version·원본 SHA 불변 확인 → DB+CAD+S3 실제 restore/Viewer 및 기존 GET/Current 확인 → App/Migrator/DB 호환 롤백·실패 시 안전 정지·운영자/Owner 기록. S3 ETag만으로 SHA-256 검증 불가. Audit 365일 물리 purge는 세칙 미승인으로 금지.
- 실제 사내 PC 2대의 PROD Nginx 및 DEV direct/서로 다른 DB/CAD·정상 Cookie/업무 쓰기 허용·거부는 **NOT RUN**; EV ID/실제 결과 확보 전 PASS 주장 금지. 현재 인증 쓰기 Route는 운영 연결되지 않아 기존 익명 API 테스트를 보호 E2E로 주장하지 않는다. 운영 DDL/Compose/Nginx/API/실 파일 수정은 G7 #109 별도 Owner Go/No-Go 전 금지. 상세 수용행렬 [Issue108](Issue108.md).


## Issue #106 G4 — 격리 운영 절차·배포 차단 (2026-10-26)

G4는 테스트에서만 G1 guarded cad-auth-g1 임시 SQLite를 사용하는 비라우팅 서비스다. 실제 App Router, 운영 인증/관리/Outline/Type/Memo/Logs/Audit API, Prisma/DDL, Compose/Nginx/.env, 실 DB/CAD/S3/기존 CAD GET·Viewer 동작에 연결하지 않는다. #109 G7 Owner Go/No-Go까지 OFF.
검증은 G1 CAD Migration으로 만든 합성 DB의 TC-P4-G4-001~009를 실행해 Admin/Role/Site/Version, revoke 재검증, 권한 부족·CSRF, 두 연결/Unique, 생성·수정·삭제와 Audit 원자성, 안전 필드/append-only/UTC, 기존 CAD 불변을 확인한다. 실제 실행/성공은 TestReport에만 기록. Audit 365일 만료 물리 삭제·백업본 복구/파기 세칙은 추가 승인 전 수동·자동 모두 실행 금지.
향후 G7 적용 시 Version DELETE는 G4 Editor/Admin+담당 Site 사전 인가뿐 아니라 기존 삭제 비밀번호를 별도로 AND 검증하고 DB 업무 변경+감사를 한 거래로 commit해야 한다. 실 LAN Nginx/WSL2/PC 2대와 DB/CAD/S3 복구는 G6 #108 인계. 운영 Secret/비밀번호/실 로그/CAD Geometry는 공개 GitHub/CI에 기록 금지. [Issue106](Issue106.md).


## Issue #105 G3 — 운영 연결 없는 세션 검증 (2026-10-26)

[Issue105](Issue105.md)의 로그인/암호 변경/세션 서비스는 disposable G1 SQLite를 사용하는 명시 격리 검증용이다. 운영 로그인 URL/UI·Admin API나 자동 migration을 추가하지 않으며 `.env`/Compose/Nginx 설정으로 활성화할 경로를 제공하지 않는다. 운영 연결은 #109 Owner Go/No-Go 이후 별도 작업이다.

초기 및 복구 계정은 일반 session cookie가 발급되지 않는다. credential 재입력으로 초기 비밀번호를 변경하면 다시 로그인해야 하고, 일반 암호 변경/disable/recovery도 기존 세션을 모두 폐기한다. HTTP cookie의 HttpOnly/SameSite는 TLS 암호화를 뜻하지 않는다. 정상 proxy/direct 격리 시험과 실제 Windows Nginx·WSL2/사내 PC 2대의 동작은 구분하며 현장 cookie·DB/CAD/S3 backup/restore는 #108로 인계한다. 실제 실행 명령과 성공 여부는 TestReport를 기준으로 확인한다.

## Issue #104 — GHCR v0.40.5 신규 Pair 게시 절차 (2026-10-26)

- G2 격리 서비스에 대한 GHCR 신규 게시 요청은 기존 v0.40.4 이미지·Git tag/digest를 이동하지 않는 새 PATCH 버전 **0.40.5** 준비로 처리한다. 신규 PR HEAD CI 검증·review 0·main 정렬 후 squash merge하면 Main push Workflow의 `release-scope`가 변경 경로를 확인하고 후보 App/Migrator 두 개를 빌드·digest 검증한 후 `:0.40.5`/`:0.40.5-migrate` 및 latest Pair를 승격하도록 설정되어 있다.
- **실제 게시 전/후 운영 경계 동일:** G2 도구는 격리 SQLite에만 연결하고 실제 `ADMIN_* `운영 플래그, 운영 DB/Prisma Migration 및 로그인/관리 영속 API, 기존 CAD 데이터/Viewer를 켜지 않는다. Main CI 시작, GHCR 태그의 실제 게시, 사내 장비 배포·G7 운영 활성화는 각각 별도 상태이며 후자의 둘은 실행하지 않는다. [Issue104](Issue104.md), [ChangeLog](ChangeLog.md), [TestReport](TestReport.md).

## Issue #104 G2 — 명시 Admin 초기화·복구 격리 SOP (2026-10-26)

**운영 적용/자동 초기화 금지; #109 G7 전 OFF.** 사내 지정 운영 담당자 실행, Owner 책임. 인명·대리인·승인·실 Secret 경로·nonce·backup·회수 기록은 사내 비공개 운영 문서에만 작성.
1. Owner 정책·작업 요청 ID(requestId)·임시 G1 fixture DB 준비와 백업/담당자 확인. 운영 DB/실 CAD/S3/Compose에 접속하지 않는다.
2. Linux/WSL2 실행 UID 소유 0400/0600 Secret regular file을 절대 경로로 공급. 최소 8자·1024 byte 이하, 유효 UTF-8/종단 개행 불허. Symlink/0444 Compose Secret/Windows 직접/원문 .env·로그·Git·CI 아티팩트 금지. Shell trace OFF.
3. 격리 프로세스에 `ADMIN_BOOTSTRAP_ENABLED=true`+username+password file 또는 `ADMIN_RECOVERY_ENABLED=true`+기존 Admin 불변 ID+16~128 문자 nonce+password file 설정(동시 ON 금지). 사전 G1 schema가 적용된 disposable fixture에서만 `cd src && npx tsx scripts/auth-g2-isolated.ts --fixture-db /tmp/cad-auth-g1-EXAMPLE/fixture.sqlite --request-id G2_PRIVATE_RUN_ID --ack-isolated` 실행. 예시 경로/ID는 비밀 없는 placeholder다.
4. 최초 User/Role/Audit 또는 복구 nonce/password/세션 revoke/Audit **원자 commit**과 장애 rollback, 재실행·재사용 거부 확인. Audit actor=null·affected Admin ID와 requestId를 사내 비공개 담당자 승인 이력에 연결한다.
5. Secret file/mount 즉시 회수·플래그 OFF·재기동 계정 덮어쓰기 금지 및 결과·실패/대체자 기록. 운영 경로 연결, 실제 backup/restore 및 Owner Go/No-Go는 #108/#109에서 별도 승인. 이 CLI를 App/Release migrator에 연결 금지.

[Issue104](Issue104.md), [ADR-051-G2](Decisions.md). 공격·탈취 강화는 Owner 비범위이나 Secret 비로그/원자성 필수, JS 문자열 완전 메모리 파기 미보장.

## Issue #102 G0 — Owner 5개 업무 정책에 따른 운영 절차 초안 (2026-10-25)

**정책 승인 ≠ 운영 적용.** [Issue102](Issue102.md)/[ADR-051-R1](Decisions.md) 최우선 Owner 결정.
- **CAD 열람:** 사내망 사용자는 로그인 없이 기존 도면 목록·검색/위치·현재/과거 Version·Viewer·원본 파일을 읽는다. 익명에게 별도 Reader/SiteGrant 계정을 부여하지 않으며 공개 도면은 Site별 읽기 비밀 보호 대상이 아님. 새 메모·외곽선 영속 조회와 로그/감사/관리 API는 공개하지 않는다.
- **Current 지정:** 향후 G7 적용 시 로그인된 Editor/Admin과 **서버가 확인한 담당 Site/Version Grant** 모두 필요(없는 Site는 Admin도 거부). 로그인하지 않은 사용자가 보기 가능한 Current 설정 UI를 누르더라도 실제 쓰기 승인 전 로그인/권한 확인이 필요; 지금 UI/Route 수정 금지.
- **Version 삭제:** 향후 G7 적용 시 **인증된 Editor/Admin + 담당 Site Grant + 현행 삭제 비밀번호** 모두 필수. 기존 삭제 비밀번호를 제거/변경하지 않고 기존 사용자·자동화 Script 및 Current/원본 데이터 호환 검증. 비밀번호만으로 Actor·Scope 인정 금지.
- **도면 등록 POST:** Owner 승인 **로그인 Editor 이상+담당 Site**. 기존 공개 익명 조회의 쓰기 예외 아님. #106 업무권한·#108 정상 동작 시험 후 #109 별도 운영 승인까지 현행 Route 불변.
- **Admin 책임:** Owner가 내부 운영 책임을 지고 지정 운영 담당자가 최초 Admin 초기화·단발 복구를 실행한다. 실제 이름·최초 부여 절차·Secret file 경로, 마운트·사용 후 폐기, 이력은 비공개 운영 SOP(#104)에만 보관. 재시작 시 계정/암호 덮어쓰기 금지.
- **Audit 만료:** 365일 이내 Event 보존(append-only). 365일 지난 이력은 정리 방향 승인. 구체 만료 기준·수동/자동 실행·정리 시점·백업본 보존·복구 후 재정리와 예외는 **후속 승인 전 물리/자동 파기 금지** (#106/#108/#109).
- **배포/회귀:** PROD Nginx / DEV direct/개발 데이터 분리 유지. 기존 익명 GET 성공, Current·Delete 인증/Scope/비밀번호 AND 및 관리 API 비공개, 외부 Client/북마크/삭제 비밀번호 UX, Backup→격리 Migration dry-run→실 Restore를 G6에서 시험. G7 별도 Owner Go/No-Go 전 현재 익명 GET·등록/Current/삭제 API·Nginx/Compose/.env/Prisma 변경 0.


## #103 후속 Owner 결정과 감사 파기 보류 (2026-10-25)

#102 5개 업무 원칙(기존 CAD GET 익명, Current Editor/Admin+Site, Delete Editor/Admin+Site+삭제 비밀번호, Admin 초기/복구 지정 운영자, Audit 365일 경과 정리)은 승인됐으나 문서 PR #114의 병합/CI 성공은 아직 별도 확인이 필요하다. **Audit 물리·자동 파기 시각/주기/백업본 처리/복원 후 재출현 방지 SOP와 업로드 POST 권한은 미정**이다. 이번 G1 backup/restore는 합성 fixture만 대상이고 원장 행의 물리 파기 명령은 포함하지 않는다.


## Issue #103 G1 — 격리 Migration·Backup·Restore Runbook (2026-10-25)

**운영 기능 OFF / G7 미승인:** `src/tests/fixtures/auth-g1/schema.prisma`는 운영/자동 Prisma migrator 입력이 아니며 `migration.sql`을 `src/prisma/migrations`로 옮기거나 `prisma migrate deploy/db push`로 실행하면 안 된다. `src/tests/integration/auth-g1.test.ts` 실행은 내부 테스트용 `mkdtemp('cad-auth-g1-*')` 아래 `fixture.sqlite`와 합성 CAD만 만든다. App routes/Docker/Nginx/GHCR는 이 작업에서 바꾸지 않는다.

**격리 Rehearsal 표준 절차** (실 데이터 사용 시 별도 승인 및 #108 G6 증거 필요):
1. App/DB/CAD/S3 쓰기를 정지·quiesce하고 같은 시점의 DB SQLite 일관 백업(API backup), CAD local bytes, S3 object/version list·SHA·크기 manifest를 하나의 snapshotId로 보존. 백업 원본은 사내 비공개로 보관하고 Secret/CAD/SHA 실내용 Git 업로드 금지.
2. 원본이 아닌 검증용 `cad-auth-g1-*/fixture.sqlite` 사본과 보관된 객체만 격리 복제. 기존 6개 CAD migration 및 Version/Current/SHA/delete hash·5단계 FK·`foreign_key_check` 사전 기준을 기록(시스템 비밀값 미출력).
3. 격리 DB에만 `PRAGMA foreign_keys=ON`, `BEGIN IMMEDIATE`, G1 `migration.sql` 실행. 같은 transaction에서 `foreign_key_check` 확인 후 commit. 비교 시 기존 CAD 행/Current/Version/SHA/delete hash 및 파일 SHA/크기 일치, Auth FK/Unique/3-session/nonces/rollback 시험. 장애/불일치 시 rollback 및 테스트 중단.
4. **실복구 리허설:** 앱을 중단한 격리 대상에서 동일 snapshotId의 DB+CAD local+S3 객체를 함께 복구, `foreign_key_check`와 양쪽 content SHA/Current/Version 비교. 스키마 및 데이터가 백업과 정확히 같은 상태인지 확인. 실패 시 운영 적용 **NO-GO**.
5. G1 합성 S3 mirror/일회용 DB 성공은 실제 S3 백업/복구 성공이 아니다. 실제 접근/권한·복원·기존 API 호환·Nginx PROD/DEV 접속은 #107/#108, 실제 신규 Prisma/DDL 및 애플리케이션 기능 활성화는 #109 Owner 서면 Go/No-Go 후 별도 PR·배포에서만 진행.

**테스트 명령:** `cd src && npm ci && npm run db:generate && npx vitest run tests/integration/auth-g1.test.ts`; 전체 PR Verify(Typecheck/Lint/Unit+Integration/Build/E2E)+Docker는 기존 Workflow대로. 로컬 실행하지 않았다면 `NOT RUN`; PR CI 시작은 성공 증빙 아님. [Issue103](Issue103.md), [TestPlan](TestPlan.md), [TestReport](TestReport.md).


## Issue #107 / G5 — 실제 운영 변경 없는 연결 Preview Runbook (2026-10-25)

- G5는 외부 공개망 인바운드 제한·소수 내부 사용자 환경의 **정상 운영 경로 확인**이다. 추가 TLS/WAF/침투/CIDR 하드닝 대신 Nginx↔App Viewer·API/업로드·Health, DEV 직결 및 독립 데이터만 점검한다. [Issue107](Issue107.md).
- 저장소 root에서 `docker build -f src/Dockerfile --target migrator -t cad-layout-viewer:g5-migrate .` 와 `docker build -f src/Dockerfile --target runtime -t cad-layout-viewer:g5-web .` 후 `docker compose -f src/deploy/g5/compose.preview.yml --profile g5-prod --profile g5-dev up -d`.
- 기본 접속: PROD Preview `http://127.0.0.1:3302`(Nginx)·DEV Preview `http://127.0.0.1:3301`(direct); `node src/scripts/g5-preview-smoke.mjs --base-url http://127.0.0.1:3302` 및 3301을 각자 실행. 선택적인 실 도면 Viewer/다운로드 검증에는 `--version-id ID`만으로 실제 Viewer `/cad/versions/ID/viewer`와 content를 확인한다. 선택적 `--viewer-path /cad/versions/ID/viewer`는 같은 ID를 써야 하며 위치 관리 화면은 Viewer 합격으로 판단하지 않는다. Preview 도면만 허용.
- 필요 시 Preview의 `G5_PROD_PORT`, `G5_DEV_PORT`, `G5_PROD_BIND_IP`, `G5_DEV_BIND_IP`만 조절. 사내 IP·장비명·실 Secret/CAD는 사내 비공개로 유지. Windows Nginx·WSL2 upstream 실동작은 G6 별도 확인.
- 임시 도면 등록/이력/Current·삭제 비밀번호 및 (후속 G3) 쿠키 왕복은 일회용 Preview 데이터에서 **수동** 검증. Preview는 local-only 두 개의 분리된 SQLite/CAD 볼륨. 실 운영 Compose·Nginx/DB/API·Prisma·Auth ON은 G7 승인 전 금지.
- 종료는 반드시 `docker compose -f src/deploy/g5/compose.preview.yml --profile g5-prod --profile g5-dev down -v` (Preview 전용 볼륨 삭제). `src/docker-compose.yml`과 함께 쓰지 않는다. 상세 재현 명령과 AC/누락 증거는 [Issue107](Issue107.md).


## Issue #102 / ADR-051-R1 — 내부망 PROD/DEV 경량 운영 계약 (2026-10-25)

**정책 승인, 운영 비활성:** 공개망 인바운드가 제한된 사내 업무망에서 내부 사용자끼리 HTTP로 사용한다. 운영 사용자 PC는 **Nginx**를 거쳐 App에 접근하고 개발 PC는 **별도 개발 App에 직접** 접근한다. 사용자별 상세 망 방어·침투테스트·HTTP 계정/세션 탈취 대응은 Owner가 비범위로 결정했다([Issue102](Issue102.md)). 평문 HTTP가 안전해진 것은 아니며 `OWNER_ACCEPTED_SCOPE`는 테스트 PASS가 아니다.

- G5/배포 전 정상 경로 체크: 운영 Nginx URL → Upstream App Health/도면 목록·Viewer/업로드/쿠키·설정 전달, 개발 App 직접 URL → 분리된 개발 DB/도면/설정. 실제 접근 주소/포트는 사내 운영 문서에서만 관리.
- 현재 Compose의 App `0.0.0.0:3000` Publish를 운영 최종 정상 경로라고 간주하지 않는다. 필요한 진입점/Upstream/host binding 변경은 **G7 승인 후**이며 이 문서 작업에서는 하지 않는다.
- 공격 대비용 Host/Origin/Forwarded/CSRF/브루트포스 위조 시뮬레이션과 추가 TLS/MFA/WAF 등은 필수 완료 판정 제외. 기존 Auth helper 및 Secret 비로그 정책·로그인/권한/세션 정상 기능은 보존.
- G0~G6 문서/격리 구현/테스트가 통과해도 **G7 Owner 별도 승인** 없이는 운영 Auth/관리·영속 API, Prisma Schema/Migration, Nginx/Compose/.env 및 기존 공개 CAD API 인증 전환 금지. 운영 전 DB/CAD(local)/S3 동일시점 백업→격리 migration dry-run→실 Restore·이전 이미지 호환 롤백은 필수.
- 상세 `out/Issue102.md`, [ADR-051-R1](Decisions.md), [TestPlan](TestPlan.md), [Issue96](Issue96.md). 이력 내 이전 '보안 실증 없으면 운영 승인 불가'는 해당 공격·탈취 부분만 R1로 대체하며 업무·무결성 항목은 유지한다.


## Issue #99 종료 후 실 도면 운영 수용 책임 분리 (2026-10-25)

- 사용자 요청의 #99 구현 PR 병합/신규 GHCR 게시 시작과 **실제 공장 DXF 수용은 서로 다른 게이트**다. 잔여 현장 수용은 [#113](https://github.com/planner77/layoutManager/issues/113)에서 Owner가 비공개 실측과 4개 AC를 완료한 뒤 별도로 승인한다. #99를 행정 종료해도 #113 미완 상태와 Auth/Outline 운영 기능 OFF는 변하지 않는다.
- #99 코드 보완에서 태그 `v0.40.2`를 재사용하지 않고 `0.40.3`으로 정렬했다. 최신 HEAD CI 성공 이전의 병합/게시 금지, Main CI 자동 시작은 GHCR pair 완료 증거가 아님.


## Issue #99 — P1 비공개 경로 방어 및 0.40.3 GHCR 준비 (2026-10-25)

- **경로 계약 변경:** `CAD_OUTLINE_ACCEPTANCE_DXF`는 사내 승인된 절대 경로이면서 실제 파일의 canonical `realpath`가 Git checkout 밖이어야 한다. `CAD_OUTLINE_ACCEPTANCE_REPORT_PATH`도 절대 경로이며 **출력 부모 폴더를 사전에 직접 생성해 ACL 제한**, 그 부모의 symlink 해결 후 실제 경로가 checkout 외부인지 확인한다. 기존 보고서 경로·dangling symlink 및 repo로 향하는 폴더 symlink는 오류. 파일은 `wx`/0600 배타 생성하므로 2회 수행할 때는 **새로운 보고서 파일명**을 사용한다. 실패 원인에 경로/SHA/민감한 운영 정보가 출력되지 않도록 한다.
- 사내 DB/Storage 격리 및 예외 처리/정리 의무는 기존 Issue #99 Runbook 그대로이며, Node 경로 검사만으로 악의적 다른 프로세스의 디렉터리 교체를 완전히 차단하지 않는다. **일반 사용자에게 쓰기 권한 없는 전용 출력 폴더**를 준비한다.
- GHCR: Git tag `v0.40.2` 이미 존재. 새로운 source/시험 하네스에 대한 사용자 요청은 `0.40.3` package/lock 준비와 PR 최신 CI/리뷰 게이트 통과 후 Squash Main CI → App/Migrator 후보 SHA digest 검증 → `0.40.3/-migrate`, `latest/-migrate` 게시 가능성 순서. Publish 성공 여부/실 digest는 Main Job 및 OCI 레지스트리 증거로만 기록. 사전 PR CI 성공은 신규 버전 릴리스 성공 아님.


## Issue #99 — 비공개 실 CAD P0/P5 현장 수용 Runbook (2026-10-25)

1. 실제 공장 DXF 사용/보관 승인을 받는다. 서로 다른 SHA 최소 3종, supported entities 1k/10k/100k 각 대표 도면을 Owner 선정. CAD WCS XY·기준 면적·Handle/INSERT/OCS·허용 오차 및 CPU/GPU/Browser p95/heap/VRAM SLA는 **시험 전에 Owner 서면 승인**한다. 미결정 값은 fail closed.
2. 사내 네트워크의 승인 PC에서 Docker/Next app **격리된 폐기 가능한 DB+Storage**를 먼저 구성하고 승인 DXF만 넣는다. `test:outline-acceptance`는 자체적으로 `POST /api/cad-files`를 사용하므로 `makeCurrent=false`라도 DB에 버전이 **추가**된다. 운영 실 DB 및 원본 백업본 사용 금지, 종료 후 작업자가 테스트 인스턴스를 안전 폐기/원상 확인.
3. `cd src && npm run audit:outline -- --file /private/sample.dxf > /private/source.json`. 외부 CAD 기준 실측과 비교. `CAD_OUTLINE_ACCEPTANCE_DXF=/private/sample.dxf CAD_OUTLINE_ACCEPTANCE_EXPECTED_SHA256=<64자리 승인 해시> CAD_OUTLINE_ACCEPTANCE_REPORT_PATH=/private/browser.json npm run test:outline-acceptance`로 sample당 5회 실제 Browser 관측. 실 DXF path와 보고서 path는 Git worktree **외부 절대 경로**.
4. Report schema v2에는 GPU/WebGL identity·rAF frame 간격이 있으나 실제 GPU util/VRAM은 없다. 별도 OS/GPU 계측 장비에서 GPU 사용률/VRAM 및 브라우저/드라이버 식별 기록, 클릭·box·레이어·ESC/Fullscreen·Pan/Zoom·Worker Cancel 실증. 지원 Matrix는 CAD 참조와 함께 검증하거나 미지원 명시·제외 건수 기록.
5. 승인 Source JSON + Browser JSON 세 쌍 및 Owner budgets/CAD 비교/기능 수동 확인/외부 GPU 수치를 사내 manifest v1에 취합, `npm run verify:outline-acceptance -- /private/manifest.json`. CLI stdout은 BLOCKED의 **이유 코드만**. READY_FOR_OWNER_REVIEW는 Owner 검토 후보일 뿐 PASS가 아니다. 검증 명령이 실패하면 재시험·오류 원장 기록.
6. 보고서 원본/장비 상세/Source 파일/레이어/Handle/정확한 위치/비밀값·개인 정보를 GitHub Issues/PR/Public Actions/Artifacts에 게시하지 않는다. Issue #99에는 비민감 판정·장비군·비공개 증거 ID 및 Owner 수용/거절 사유만 기록. 현재는 **FIELD BLOCKED**.

자세한 manifest 구조·검증 열·수동 Owner 최종 서명은 [Issue99](Issue99.md), [TestPlan](TestPlan.md), [ADR-052](Decisions.md). 이 작업은 새 운영 API·계정/외곽선 CRUD·Migration·Reverse Proxy/Docker를 활성화하지 않으며 #96/#98 분리 승인도 그대로다.


## Issue #96 — D1~D6 .env 기반 관리자 계약과 운영 차단 (2026-10-25)

**정책 승인, 실제 인증/영속 API/Prisma/Compose 런타임 OFF.** .env.example은 비밀값을 포함하지 않는 제안이며, 현재 launcher·Docker Compose·앱 API가 ADMIN_* 값을 사용하지 않으므로 true를 지정해도 관리자나 API가 생성되지 않는다.

| 항목 | 확정 정책 / 설정 계약 | 운영 전 차단 해제 증거 |
| --- | --- | --- |
| D1 | ADMIN_BOOTSTRAP_ENABLED=false, ADMIN_BOOTSTRAP_USERNAME, ADMIN_BOOTSTRAP_PASSWORD_FILE(절대 경로); ADMIN_RECOVERY_ENABLED=false, ADMIN_RECOVERY_TARGET_USER_ID, ADMIN_RECOVERY_ONCE_ID, ADMIN_RECOVERY_PASSWORD_FILE | 실제 Secret은 .env 내 원문 금지, 읽기권한 제한 Secret mount, DB 최초 한 번/복구 단발 nonce 원자 CAS, 재시작 계정 덮어쓰기 0 및 감사 |
| D2 | 최소 8자, built-in scrypt local-v1/salt, 초기 변경·로그인 시도 제한 | 작업 비용/병렬 리소스 계측, 추측 공격·분산 worker 방어, 회복 시 전체 세션 폐기 E2E |
| D3 | 절대 8h/유휴 30분/동시 세션 3개, 원시 token 로그/DB 미보관, HttpOnly/SameSite Cookie | 영속 DB 원자 issue/check/revoke/회수·동시 login/timeout E2E |
| D4 | Admin 전용 권한 부여, 개별 Site Grant, Admin의 타 Site 무권한 자동 접근 금지, audit:read/logs:read 별도 | Version→Site DB 관계·각 Role/Site/Version 검증, Grant 변경 Audit |
| D5 | 365일 append-only Audit, 별도 권한 보유 Admin 읽기, Secret/원본 CAD/Geometry 제외 | DB Audit 쓰기/조회·복구/백업, 365일 이후 파기/backup 정책 별도 승인 |
| D6 | 사내 지정 LAN CIDR/방화벽/Reverse Proxy/backend 차단, HTTP 잔여 위험 Owner 인지 | **구체 CIDR 미제공**, trusted peer/forwarded Host 규칙/서버 직접 접근 제한과 HTTP 위험 수용·실측 기록 |

**기준:** 실제 .env·비밀번호·토큰/파일경로/사내 IP를 코드·Git·공개 CI·운영 로그에 출력하지 않는다. 비밀번호 Secret은 권한제한 파일/Compose Secret 전달 제안. 네트워크 차단은 HTTP 암호화 대체가 아니다. 서버 설정/DB 마이그레이션/신규 인증 API는 Owner 별도 운영 승인과 보안·백업·실복구 검증 후 별도 PR에서 시행한다. [Issue96](Issue96.md), [ADR-051](Decisions.md), [TestPlan](TestPlan.md).



## Issue #97 / PR #100 — GHCR 0.40.2 신규 패치 게시 운영 경계 (2026-10-25)

- `0.40.1`은 [#93 Main 40184907533](https://github.com/planner77/layoutManager/actions/runs/40184907533)의 paired 이미지 promotion+OCI 측정까지 SUCCESS, `v0.40.1` 태그는 이미 존재한다. 신규 코드 #97을 같은 버전으로 병합하면 기존 이미지 존재 검사가 Build/Publish를 건너뛴다. 소스/lock root 버전을 `0.40.2`로 올려 기존 immutable `v0.40.1` 및 GHCR alias digest를 임의로 재사용하지 않는다.
- 새 HEAD PR CI 성공 후 merge만 허용. `main` push에서 `release-scope` → app+migrator candidates build → 두 digest inspect → version `0.40.2`/`0.40.2-migrate` pair→ `latest`/`latest-migrate` 순서 게시. 실행 시작/Job 단계 성공/실제 GHCR digest 확인을 구별한다. CI monitor 생략 시 publish 성공 주장하지 않는다.
- P4 D2는 비활성 validator 모듈; #96/#98 승인 전 인증·영속 API 활성화/운영 배포 승인 아니다. 현장 업그레이드는 복구 가능한 SQLite/CAD/S3 동시 백업 및 paired digest 확인 후 별도 수행.

## Issue #97 — D2 서버 Geometry 검증 구현의 비운영 상태 (2026-10-25)

- 신규 코드 `src/server/outline/transform-attestation.ts`는 Auth/HTTP Route/Prisma/Storage/배포 플래그 없이 D3에서 미래 호출할 수 있는 순수 validator이다. 어떤 신규 로그인·외곽선 영속 GET/Write API·실제 CAD 공유 편집 서비스도 **현재 열지 않는다**.
- 운영 전 의무: #96 최초 Admin·세션/Role/Site/Version Scope 및 Audit/HTTP LAN 잔여 위험 Owner 승인, #98 원본 Storage bytes SHA 재조회·Revision CAS/Soft Delete·FK/Backup Restore·Prisma migration dry-run, #99 실 DXF 3종/브라우저·GPU 성능 현장 수용. 비승인 데이터/자격증명·CAD 원본을 Git/CI artifacts/로그에 포함하지 않는다.
- 단위/형상 검증 계약은 [Issue97](Issue97.md)/[ADR-050](Decisions.md), TC 001~009; 테스트는 실제 실행 전에 NOT RUN. PR CI 시작/성공만으로 서버 쓰기/운영 승인 주장 금지.

## Issue #31 P4-D0 — LAN HTTP 경량 계정 운영 **계약만 승인** (2026-10-25)

- **배포 네트워크:** 외부 공개망에서 인바운드 접근이 제한된 사내 LAN의 여러 PC가 `http://서버IP:포트`로 접근한다. **HTTPS/TLS/인증서 구축과 OIDC/SSO/MFA는 이번 범위에서 제외.** 계정 목적은 권한 제한·공동 편집·작성자·변경 이력. 현재 실 운영 인증 기능은 아직 없다.
- **HTTP 잔여 위험:** 일반 HTTP에서는 전송되는 비밀번호와 세션 쿠키의 기밀성/무결성이 보장되지 않는다. 인터넷 인바운드 차단·LAN 접근대역/OS 방화벽·Nginx 백엔드 직접 접근 차단은 위험 감소 수단일 뿐 TLS의 대체 증거가 아니다. 쿠키 `HttpOnly`·`SameSite`, 서버 검증 Origin/CSRF 및 명시적 로그아웃/세션 만료가 필요하나, `Secure` Cookie는 일반 서버 IP HTTP에서 사용 가능하다고 주장하지 않는다.
- **D1 후속:** User/Admin 초기화·계정 해시, 세션 발급/폐기/TTL/동시 로그인, Role/Scope Grant 관리(Version→Site DB 검증), 로그인 시도 제한, 권한 실패 감사, `logs:read` 별도 권한. 초기 Admin·복구 절차/TTL 값/허용 LAN 대역/감사 보존 기간/HTTP 위험 수용 세부 책임은 **미확정**으로 기록하고 추후 Owner 결정한다. 값을 편의상 기본 승인하지 않는다.
- **D0 구현 차단:** 이 PR은 Markdown만; `schema.prisma`, 새 session/outline/memo API, 로그인/관리 UI, Docker/Nginx runtime 설정, Migration, S3/원본 데이터·GHCR 이미지는 수정하지 않는다. 필요한 Owner 결재·보안/권한/감사/DB/백업·복구 검증 전 운영 기능 ON 금지. 기존 도면 읽기·Version/Current 계약 유지.
- **D2~D6 운영 수용:** 원본 Source SHA/stable Handle/WCS canonical+Translate/Rotate server recalculation, Same-Scope Editor 공동 편집/409 CAS, Global OutlineType(#65), soft delete+Audit, Mono-transaction Memo BROKEN_ANCHOR(#83/#84), 세션 Show/Hide 분리(#73). 실DXF 최소 3종 및 1k/10k/100k 실 GPU 시험은 P0/P5에서 별도 기록. 문서 PR CI PASS만으로 실제 운영 적합성 보장 불가.
- **참조:** [Issue31](Issue31.md), [ADR-048/049](Decisions.md), [Architecture](Architecture.md), [Database](Database.md), [TestPlan](TestPlan.md). OIDC/TLS 우선이라는 과거 기록은 D0 Owner 확정 방침으로 대체하되 원래 기록은 역사·회귀 참고로 보존한다.


## Issue #76 — Squash Merge 기본값 관리자 적용 및 CI 감사 (2026-10-25)

**현황:** 공개 GitHub REST `GET /repos/planner77/layoutManager`로 `allow_squash_merge=true`, `squash_merge_commit_title=COMMIT_OR_PR_TITLE`, `squash_merge_commit_message=COMMIT_MESSAGES` 확인. 요구값 `true / PR_TITLE / BLANK`가 아니므로 **관리자 설정 적용되지 않음**. `DESIGN.md`는 없고 기존 ADR-041/Architecture 정책을 사용한다.

**변경 방법:** [Repository Settings → General](https://github.com/planner77/layoutManager/settings) → Pull Requests → Allow squash merging 켜기 → Default commit message에서 **Pull request title** 선택. 관리자 권한이 없는 자동화 도구는 이 설정을 변경하지 않는다. 공식 [UI 안내](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests) / [Repository REST](https://docs.github.com/en/rest/repos/repos#update-a-repository).

**독립 검증 명령 (공개 repo; 실패 시 미수용):**

```bash
curl -fsS -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  https://api.github.com/repos/planner77/layoutManager \
  | jq -e '.allow_squash_merge == true and .squash_merge_commit_title == "PR_TITLE" and .squash_merge_commit_message == "BLANK"'
```

**PR CI read-only 진단:** Verify Job은 같은 API 3개 필드의 실제 값을 확인한다. 일치=Summary `PASS`, 불일치=warning/`NOT APPLIED`, GET/JSON 장애=warning/`NOT VERIFIED`. 현재 관리자 미조치로 인한 오탐 CI 차단을 피하기 위해 **advisory/non-blocking**이다. PR CI 성공이 관리자 설정 성공을 뜻하지 않는다. 이 진단은 credentials를 출력하지 않으며 `contents:read`와 기존 트리거/Job/GHCR gate를 유지한다.

**최종 수용:** 변경 후 API 응답 + 다음 정상 `#N | 설명` PR의 기본 Squash subject 한 줄/빈 body + 실제 Main Actions `MAIN CI | #N | 설명` 증거로 확인한다. API/Agent squash 병합 시 `commit_title`을 명시하고 `commit_message=""`도 계속 지정한다. 이전 Run #35/#36은 변경 불가. [Issue76](Issue76.md), [TestPlan](TestPlan.md) 참고.


### Issue #67 P1 후속 PR CI — 이미 최적화된 base Dockerfile 처리 (2026-10-25)

- `audit_standalone_layers.py`는 baseline에 실제 중복이 있는 최초 migration transition일 때만 **positive uncompressed saving을 요구**한다. 이후 PR에서 baseline과 신규 runtime이 모두 최적화돼 있으면 size delta 0도 정상으로 기록한다. 단, 최종 package SHA/native `.node` 존재 및 새 이미지에 duplicate가 없는지 검사하고 Docker Compose/Runtime/Browser smoke는 모두 그대로 실행한다. [P1 리뷰](https://github.com/planner77/layoutManager/pull/80#discussion_r4369963432) 대응이며 새 HEAD CI PASS 전 완료 주장 금지.


## Issue #67 / v0.38.1 — Standalone 웹 중복 SQLite layer 검증 및 운영 절차 (2026-10-25)

- **동일 소스/플랫폼 기준선:** PR CI는 `git show <PR_BASE_SHA>:src/Dockerfile`로 기존 Dockerfile을 복원해 현재 PR HEAD와 같은 Source/Node22.14/linux-amd64로 `runtime` 빌드. 현재 Dockerfile은 `docker buildx build --load --platform linux/amd64 --target runtime -f src/Dockerfile -t cad-layout-viewer:ci .`로 빌드한다. 이전 #28 pre-standalone / #66 migrator 이미지 크기를 비교 분모로 쓰지 않는다.
- **재현 및 실측:** `python3 src/scripts/test_audit_standalone_layers.py` → `python3 src/scripts/audit_standalone_layers.py cad-layout-viewer:baseline cad-layout-viewer:ci [summary.md]`. 실제 `docker save` TAR 각 layer의 `better-sqlite3` SHA256/파일 경로/ordinal/diffID, final 파일 동일성 및 기존 중복/new 중복 없음/네이티브 .node 존재를 검사한다. 오류 또는 saving 증거 부재 시 fail-closed. `bash src/scripts/measure-images.sh cad-layout-viewer:baseline cad-layout-viewer:phase1 cad-layout-viewer:ci [summary.md]`에서는 `docker inspect .Size` 비압축 image bytes, `docker history --no-trunc`, `du`, TTF/typeface·LibreDWG JS/WASM 개별 raw/gzip(proxy), 서버 추적 대형 파일 top20을 확인. gzip TAR/파일 압축은 실제 GHCR OCI 전송 크기 아님.
- **런타임 검사:** `docker run --rm --entrypoint sh cad-layout-viewer:ci -c 'id -u; node -e "const DB=require(\"better-sqlite3\");new DB(\":memory:\").close()"'`. PR CI Docker Compose는 **disposable** `/data`에서 migrate exit0 후 app health 200, Master 5단계→DXF 업로드, 원본/Current/Version, app stop+재migration+restart, read/delete/404, 원본 Nanum TTF/파생 typeface/LibreDWG WASM 정적 200 확인. 실제 운영 DB/CAD/S3 볼륨과 분리한다. 기존 Browser/Legacy E2E 검증이 별도로 필요.
- **정식 GHCR 게시 후 OCI 확인:** `docker buildx imagetools inspect --raw ghcr.io/planner77/layoutmanager:0.38.1` 및 `:0.38.1-migrate`의 정확한 app+migrator image digest를 읽는다. immutable digest별 linux/amd64 OCI `layers[].size` 합/공유 digest를 `node src/scripts/measure-ghcr-pair.mjs ghcr.io/planner77/layoutmanager:0.38.1 ghcr.io/planner77/layoutmanager:0.38.1-migrate`로 측정. attestation `unknown/unknown`, index/config bytes와 `docker save|gzip` proxy를 제외. PR CI에는 GHCR public tag publish 권한 요구 금지. 고정 digest/OS/arch는 해당 릴리스 증거로만 기록.
- **현장 보호/롤백:** app+migrator 같은 버전/digest 존재 확인, 동일 시점 DB/local CAD/S3 백업·복구 검증 → 기존 writer stop → migrator exit0 → app healthy → 브라우저 DXF/DWG/Hangul·S3 실제 통합 확인. 실패 시 기존 schema 호환되지 않는 앱을 임의 시작하지 말고 같은 시점 데이터/이미지 복원. `docker compose down -v` 금지. 폰트/WASM/Unicode 강제 subset·삭제 금지. 개발 시점 실제 Docker/CI/GHCR/현장 실측은 **NOT VERIFIED**. 상세 [Issue67](Issue67.md).


## Issue #66 / v0.37.1 — 최소 migrator 이미지 구축·배포·측정

**빌드 범위:** `docker buildx build --load --platform linux/amd64 --target migrator -f src/Dockerfile -t cad-layout-viewer:ci-migrate .`. `dependencies` stage 전체 `npm ci` → lock 기반 전용 manifest → offline prune → 최종 작은 `node_modules` copy. 최종 컨테이너에서 npm install/prune을 수행하지 않으므로 GHCR 이미지 Pair Pull 후 인터넷 불필요. Prisma CLI, tsx, native SQLite, schema/migrations/generated client는 남는다.

**크기 계측:** PR CI가 같은 HEAD에서 *PR base Dockerfile* migrator를 `cad-layout-viewer:baseline-migrate`, 수정본을 `:ci-migrate`로 빌드하고 `bash src/scripts/measure-migrator.sh cad-layout-viewer:baseline-migrate cad-layout-viewer:ci-migrate "$GITHUB_STEP_SUMMARY"`를 실행. `docker image inspect Size`·history·`du`·패키지 상위 목록은 로컬 **비압축**, `docker save|gzip -1`는 네트워크 전송량 대체 불가 proxy. **30%는 soft target**. #28 pre-standalone web(2.05GB) baseline을 migrator 절감률에 쓰지 않는다.

**실제 GHCR OCI 압축 계측(게시 후):** `node src/scripts/measure-ghcr-pair.mjs ghcr.io/planner77/layoutmanager:0.37.1 ghcr.io/planner77/layoutmanager:0.37.1-migrate`. Workflow가 version pair 게시/inspect 후 Job Summary에 앱/마이그레이터 각각의 linux/amd64 **압축 layer.size** 합, 단순 합, 공통 layer digest 중복 제거 합/공유량을 남긴다. OCI index/config/attestation descriptor, docker-save gzip를 OCI 다운로드 크기에 혼합하지 않는다. **실제 version tag 게시 전에는 수치·digest를 확정할 수 없다.**

**신규 설치 / 업그레이드:** 운영 DB/CAD/S3를 같은 시점에 백업하고 실제 복구 경로를 확인 → 옛 `app` writer 중지 → 동일 `version` 앱/마이그레이터 이미지 Pair 존재·digest 확인 → `docker compose --env-file .env -f src/docker-compose.yml up --no-build --force-recreate migrate`(exit 0 필수) → `up -d --no-build app` → `/api/health` 200 및 데이터·Current·hash 확인. `migrate` 서비스 이름/volume 이름/depends_on 성공 조건은 그대로다. Tagless `latest` 정규화는 `bash src/scripts/compose.sh .env ...`, digest pin은 `GHCR_MIGRATION_IMAGE`을 반드시 명시. 구 앱과 schema 변경 중 동시에 쓰기 금지.

**고장/롤백:** Prisma 또는 backfill nonzero, DB read-only·invalid migration 발생 시 app 시작 금지·migrate 로그 확인·백업 복원 정책 적용. 이전 앱에 새 DB를 그냥 연결해 rollback하지 않는다. 같은 시점 DB/CAD/S3 전체 복구 후 호환 pair로 재기동하며 `docker compose down -v` 금지. S3 credential은 migrator에 전달하지 않음. 실제 운영 저장소를 PR CI 테스트에 절대로 연결하지 않는다. [Issue66](Issue66.md) 참조.

### Issue #74 / v0.36.1 — 승인된 GHCR 패치 릴리스 경로

- 사용자가 GHCR 게시를 명시적으로 요청하여 신규 버전 `0.36.1`을 `src/package.json` 및 lockfile 루트에 부여한다. 기존 #68 GHCR scope gate는 유지하고, runtime-impacting 변경 파일 `src/package.json`이 포함되어 기존 게시 Job이 조건에 따라 실행되도록 한다.
- `v0.36.0` tag/이미지 유지. 성공한 최신 PR CI HEAD를 `#74 | Main CI 실행명 커밋 본문 유입 방지` 제목과 **비어 있는 Squash 본문**으로 병합한다. Main push는 `v0.36.1` 태그 자동 생성(미존재 시) → 앱/마이그레이터 후보 build/digest 검증 → pair 공개 태그 승격을 시도한다. Main CI **시작 != GHCR 게시 완료**.
- 저장소 기본값 `PR_TITLE / BLANK` 변경은 관리자 수행이 필요한 [Issue #76](https://github.com/planner77/layoutManager/issues/76)에 분리. 운영 배포는 앱과 migrator 같은 버전 고정·DB/CAD/S3 백업 절차 유지.

## Issue #74 — Main CI 실행명 길이 회귀 방지 (2026-10-25)

[Run #34](https://github.com/planner77/layoutManager/actions/runs/40158498214)의 간결한 `MAIN CI | #68 | 설명`과 달리 [#35](https://github.com/planner77/layoutManager/actions/runs/40159667229)·[#36](https://github.com/planner77/layoutManager/actions/runs/40162889687)은 squash commit 본문(`Refs`, 증거, 잔여 작업 등)이 `run-name`에 추가됐다. `github.event.head_commit.message`는 첫 줄이 아니라 전체 commit message다. GitHub `run-name`은 workflow 시작 전 평가되어 step의 `git log -1 --format=%s` 또는 문자열 `split`으로 해결할 수 없다.

**권장 영구 조치(저장소 관리자 1회):** Repository → Settings → General → Pull Requests → **Allow squash merging → Default commit message: Pull request title**. REST equivalent: `squash_merge_commit_title=PR_TITLE` + `squash_merge_commit_message=BLANK`. 2026-10-25 읽기 API에서 확인된 **현재 설정은** `COMMIT_OR_PR_TITLE / COMMIT_MESSAGES`이므로 사용자/관리자가 바꾸기 전에는 *적용 완료가 아님*. 변경 후 다시 조회하여 확인한다. [GitHub REST 문서](https://docs.github.com/en/rest/repos/repos#update-a-repository).

**병합 시 실행 규칙:** PR 제목/최종 squash commit 제목을 `#<Issue> | 간략한 설명` 또는 `NO-ISSUE | 간략한 설명`으로 하고, 커밋 본문은 비운다. GitHub 병합 UI의 **commit message/body** 영역을 확인하고 삭제한다. API/agent 병합은 `merge_method=squash`, `commit_title="#N | 짧은 설명"`, `commit_message=""`을 명시한다. 복수행 본문이나 불필요한 `Refs/CI` 증거는 GitHub PR 본문·Issue·FailureLedger로 옮긴다. 병합 직후 실제 main commit 메시지가 단일 행인지 확인한다.

**워크플로 예외 대응:** 수정된 `docker-publish.yml`은 commit 메시지에 LF가 있으면 `MAIN CI | SUBJECT-ONLY-REQUIRED | run N`으로 **짧고 정직하게** 표시한다. 이 경우 제목의 Issue 추출이 불가능하므로 번호를 위조하지 않는다. 단일 행 정상 메시지의 `MAIN CI | #N | 설명`, tag `RELEASE` 및 PR CI 규약은 그대로 유지한다. 메타데이터/워크플로만 변경된 main push에서는 기존 GHCR 게시 제외 게이트를 유지한다. 이전 #35/#36 실행명은 변경할 수 없다. [Issue74](Issue74.md).

## GitHub Actions 실행명 / Issue #68 (2026-10-25)

- **자동 PR CI:** PR 제목을 `#68 | Actions 실행명 정리` 형식으로 작성한다. Actions Run에 `PR CI | #68 | Actions 실행명 정리`가 표시된다. PR 번호(`github.event.pull_request.number`)는 Issue가 아니므로 표시명에 대용하지 않는다.
- **수동 PR CI:** Actions → `PR CI` → `Run workflow`에서 `issue_ref`(예: `#68`, 기본 `NO-ISSUE`), `run_description`(기본 `수동 검증`)을 지정한다. 결과는 `MANUAL CI | #68 | CI 재검증` 형태. 입력 UI는 main에 워크플로 변경이 반영된 후 이용할 수 있다.
- **Main CI:** squash 병합 시 커밋 첫 줄을 `#68 | Actions 실행명 정리`로 명시한다. `MAIN CI | #68 | Actions 실행명 정리` 형태로 표시된다. 일반 push도 동일; 이슈가 전혀 없으면 `NO-ISSUE | 설명`으로 시작한다. 비정형 제목은 `ISSUE-UNKNOWN` 표시.
- **태그 푸시:** `vX.Y.Z` 형태에서는 `RELEASE | NO-ISSUE | vX.Y.Z GHCR 이미지 게시`. GitHub token이 생성한 자동 릴리스 태그는 추가 workflow를 트리거하지 않음(기존 정책 유지).
- **GHCR 게시 제외 게이트:** main push에서 `release-scope` Job은 git `before...GITHUB_SHA` 변경 경로를 점검한다. 모든 변경이 `.md` 또는 `.github/workflows/*.yml|*.yaml`만이면 `publish=false`로 GHCR Job 전체를 `skipped` 처리한다. 이때 Main CI scope 검증은 실행된다. source/빌드/배포 자산 등 다른 경로 하나라도 변경되면 기존 버전 이미지 판정/후보 digest 게시 및 검증 단계를 유지한다. tag `v*.*.*`는 기존 릴리스 대상으로 유지한다. 비교 기준 SHA를 확인할 수 없으면 자동 게시하지 않고 Main CI에서 오류로 중단한다. 이번 #68 워크플로+문서 PR 병합은 GHCR 게시 대상이 아니다.
- 중요: `run-name`은 실행 생성 시 고정되어 과거 Run에 소급되지 않는다. commit 본문이 긴 경우 Actions 표시가 잘릴 수 있으므로 첫 줄은 간결하게 작성한다. Workflow 이름은 최종 GHCR 이미지 게시를 인증하지 않는다. 상세 [Issue68](Issue68.md)·[ADR-038](Decisions.md).


## Issue #41 v0.34.0 — Main GHCR 게시 시작·운영 게이트 (2026-10-25)

- [PR CI #40154979531](https://github.com/planner77/layoutManager/actions/runs/40154979531) 성공 → [main squash 7da613d1](https://github.com/planner77/layoutManager/commit/7da613d1ed9e2893849a3c3a7f0931d4f32ff850) 반영. [Build/publish run #40155833554](https://github.com/planner77/layoutManager/actions/runs/40155833554) **시작 확인**. Runner는 `src/package.json=0.34.0`을 기준으로 `v0.34.0` Tag(기존 태그 없으면) 및 앱/마이그레이터 후보 digest 검증 뒤 두 버전·latest 태그 승격. 사용자 지시상 모니터링하지 않으므로 **게시 성공 및 이미지 digest 아직 확인하지 않음**.
- 운영 배포 시 앱 `ghcr.io/planner77/layoutmanager:0.34.0` 및 migration `ghcr.io/planner77/layoutmanager:0.34.0-migrate` 두 이미지를 **같은 버전으로 지정**하고 실제 registry에 모두 존재하는지 확인. 기존 Docker·Compose 절차대로 DB/원본 동시점 백업 후 app stop→migrator exit 0→app start. 이번 #41은 새 Prisma migration이 없으나 배포 기본 절차를 생략하지 않는다.
- `/lab/outline-types`는 실제 저장 기능이 아닌 메모리 Preview. Admin CRUD 인증/범위/감사 및 DB 스키마 변경은 #65(#31 P4 포함)에서 Owner 승인 전 BLOCKED. #41 종료를 관리자 기능 운영 허가로 해석하지 않는다.


### Issue #41 / PR #64 — HTTP 접근 제한과 UUID 시안 보완

- `/lab/outline-types`는 문서화된 `http://<server IP>:3000`에서도 사용자가 **메모리 타입 시안을 추가**할 수 있어야 한다. `crypto.randomUUID`는 HTTP insecure context에서 불가할 수 있어 `crypto.getRandomValues` UUIDv4 fallback을 추가한다. 실제 운영관리 등록/공유/DB/API/IdP 로그인은 **여전히 없다**.
- Browser의 암호학적 난수 API도 없는 환경은 명확한 오류로 차단한다. `Math.random`·삭제 비밀번호·임의 X-User/X-Role로 우회하지 않는다. 인증·Site scope·감사 정책 승인 전 실 관리자 CRUD 접근을 활성화하지 않는다.
- 회귀 `TC-U4-E2E-HTTP-003`는 randomUUID method 없는 브라우저를 **모의한 자동 시험**으로 현장 HTTP IP/Proxy 실제 확인과 별개. [Issue41](Issue41.md).


## Issue #41 / v0.34.0 — 관리자 타입 시안 운영 경계

- 이 변경은 DB migration/API/파일 저장소/환경변수/인증 구성을 추가하지 않는다. `/lab/outline-types`는 메모리 **단일 탭 시안**이며 reload/닫기/재배포로 모두 소멸. 운영 기준정보로 Import/Export하거나 관리자 권한으로 안내하지 않는다.
- 기존 Viewer 상단 '외곽선 타입 관리'는 **Owner 정책 승인 전 disabled**. 사용자가 `/lab/outline-types` URL을 직접 열 수 있어도 실제 타입 생성/도면 분류/DB 권한은 전혀 부여되지 않는다. 유효한 Admin을 client의 X-Role/X-User·삭제 비밀번호로 대체하지 않는다.
- 후속 운영 차단 해제 체크: IdP 또는 안전한 세션, Reader/Editor/Admin 및 Site/Version scope, 감사 보존 기간/읽기 정책, DB Unique/FK/CAS, CSRF/Origin 테스트, 기존 DB/CAD 백업·dry-run migration·복구 시험 **모두 완료 후 별도 승인을 득할 것**. 현 버전에서는 이 체크리스트를 충족했다고 주장하지 않는다.
- 롤백은 PR commit revert로 충분하며 신규 DB/운영 타입 데이터는 없다. 수용 경계·시험 명세는 [Issue41](Issue41.md) 참조.


## 2026-10-25 / Issue #45 — 도면 목록 Current-only 운영·조회 동선

- `/`은 `CadLocation.currentVersionId`에 지정된 Version만 표시한다. 등록된 파일이 있어도 Current를 지정하지 않았다면 홈에서 보이지 않는다. 가장 높은 Version 번호도 Current 지정이 없으면 보이지 않는다. 이는 데이터 손실이 아니다.
- 확인·복구 동선: `위치별 버전 관리`(`/masters`)에서 사업부→제품→사업장/법인→동→층을 선택하고 **버전 이력**을 열어 Version 목록과 Current 상태를 확인한다. 해당 Version의 **Current 지정**으로 목록에 다시 노출할 수 있다. 기존 Version 원본·직접 링크는 그대로다.
- `/api/cad-files?current=false`는 기존 이력 소비자 호환으로 non-Current Version을 반환한다. 홈의 과거 `?current=false` URL은 현재 도면 전용으로 해석한다. DB migration/데이터 정리·자동 승격 작업은 필요 없으며 금지.
- 진단/회귀 및 기능 범위는 [Issue45](Issue45.md), [TestPlan](TestPlan.md) 참조. 실제 배포 전 PR CI 및 권한별 운영 검증 필요.


## Issue #31 v0.28.3 — 폐쇄망 DXF 브라우저 수용 실행

- Source-only 검증: `cd src && npm run audit:outline -- --file /private/sample.dxf` (개인/운영 CAD는 외부에 업로드하지 않음).
- 실제 Browser 검증: 별도로 `cd src && npm ci && npm run build` 수행 후 아래처럼 **원본을 가진 승인된 운영망**에서 실행한다. 앱 개발용 격리 DB/스토리지에 테스트 원본이 등록되므로 실제 운영 DB 연결 절대 금지.
  ```bash
  export CAD_OUTLINE_ACCEPTANCE_DXF=/private/sample.dxf
  export CAD_OUTLINE_ACCEPTANCE_EXPECTED_SHA256=<approved-64-char-source-sha>
  export CAD_OUTLINE_ACCEPTANCE_REPORT_PATH=/private/acceptance-results/report.json
  npm run test:outline-acceptance
  ```
- 보고서: 원본 SHA, Entity 제외/선택 수, 5회 Render Source 인덱스/공간 Index ms, Load p50/p95, JS Heap(지원 브라우저에서만), Console/PageError count. 원본 도면 bytes·Filename 실제 경로·레이어명은 포함하지 않으며 지정한 사용자 전용 경로에 파일 mode 0600으로 저장한다. 시험은 별도 Playwright config에서만 동작하고 PR CI에는 포함되지 않는다.
- 수용 전제: 실제 DXF 최소 3종과 CAD 공식 면적/좌표/INSERT·OCS 기준값을 확보하고 사용 장비/Node/브라우저/GPU·1k/10k/100k 성능 목표 및 결과를 Owner가 확인할 것. Synthetic CI CPU 결과는 이 검증을 대체하지 않는다.
- P4 보안: Owner가 IdP와 RBAC/Scope 정책을 승인하기 전 서버 외곽선 CRUD·Migration은 미배포. 운영 배포 전 DB/원본/S3 백업, Migration dry run 및 복원 증거 필수.


## Issue #31 v0.28.2 — 실도면/정밀 외곽선 검증 운영 절차

1. v0.28.1 GHCR 게시 Run `38894507390`은 성공했지만 Webpack `polygon-clipping` named-export 경고가 있었으므로 정밀 외곽선의 Production 정상 작동은 보장되지 않는다. v0.28.2 PR CI에서 실제 PRECISE Worker JSON E2E와 오류 발생 시 Next build hard-fail을 확인한 뒤 업데이트한다.
2. 폐쇄망 승인된 사용자 PC에서만 `cd src && npm ci && npm run audit:outline -- --file /private/sample.dxf` 실행. 최대 100MiB UTF-8 ASCII DXF 원본을 **읽기만** 한다. JSON stdout은 SHA, 지원 Entity/Handle/경고 분류, CPU parse/query p50/p95, heap/RSS를 표시하지만 원본 내용·레이어 이름·경로는 출력하지 않는다. 승인된 내부 위치에만 결과 보존.
3. CI synthetic 1k: `npm run test:outline-benchmark -- --quick`; 선택적 CPU 1k/10k/100k: `npm run test:outline-benchmark`. 실제 고객 CAD 화면/Worker/GPU/메모리/작업자 입력 응답과 별개다.
4. P0/P5 현장 수용은 승인된 도면 3종 이상, BLOCK/INSERT/OCS 및 CAD WCS 기준값, 버전 SHA 고정, 1k/10k/100k 현장 반복 측정, 클릭/범위 선택·Renderer/GPU·Worker/Memory 및 p50/p95 지표가 필요하다. P4 Server 영속 CRUD는 Owner 인증/역할/사업장·Version Scope/감사 정책 승인 전 미지원.


## 0.26.0 — migration job / standalone 운영 절차

**운영 적용 전** 동일 시점 SQLite DB, local CAD 원본, S3 객체의 백업 및 복원 가능성을 검증한다. migration 중 구 앱이 동시에 DB를 쓰지 않도록 한다. 실제 운영 migration과 GHCR 게시 확인은 PR 구현 범위 밖이다.

**신규 설치:** 권장 실행은 `bash src/scripts/compose.sh .env build` → `bash src/scripts/compose.sh .env up -d`. 이 helper는 `.env`를 shell에서 실행하지 않고 `GHCR_IMAGE`/`GHCR_MIGRATION_IMAGE` 두 값만 읽어 image pair를 정규화한 뒤 Compose로 전달한다. `bash src/scripts/compose.sh .env ps -a`, `logs migrate app`, `/api/health` 200 확인. migrate 컨테이너는 성공 후 종료됨이 정상이다. `GHCR_IMAGE`가 이미 태그를 포함하면 기존 raw Docker Compose 명령과 호환된다.

**GHCR 업그레이드:** `.env`에 `GHCR_IMAGE=ghcr.io/planner77/layoutmanager:0.26.0`을 설정하면 `:0.26.0-migrate`가 선택된다. **태그 없는** `GHCR_IMAGE=ghcr.io/planner77/layoutmanager`를 helper로 실행하면 app은 `:latest`, migration은 `:latest-migrate`가 되며, **raw Docker Compose를 직접 쓸 경우에는 `GHCR_MIGRATION_IMAGE`를 반드시 명시**한다. registry host의 포트는 이미지 태그로 혼동하지 않는다. Digest-pinned app은 `GHCR_MIGRATION_IMAGE`도 명시해야 하며, 동일 릴리스의 두 digest가 일치하는 source revision에서 만들어졌는지 확인한다.

- 배포 준비 확인: `bash src/scripts/compose.sh .env --print-images`(두 이미지 참조만 표시) 및 `bash src/scripts/compose.sh .env config`로 확인한다. 이미지 변수를 포함한 `.env` 전체나 Secret 값은 출력하지 않는다.
- 버전별 pair가 GHCR에 모두 존재하는지 `docker buildx imagetools inspect`로 검사한다. Workflow는 `build-<SHA>-app/migrate` 후보 digest를 먼저 게시·검증하고, 두 빌드가 모두 성공한 다음에만 버전/최신 별칭을 승격한다. **GHCR에서는 두 공개 태그를 단일 트랜잭션으로 갱신할 수 없으므로** 자동 배포의 `latest` 의존을 피하고 앱·마이그레이터를 동일한 명시적 버전 또는 각각 검증한 digest로 고정한다.

1. 운영 쓰기 중단, DB/CAD/S3 일관 백업 및 기존 이미지·Compose 기록.
2. `bash src/scripts/compose.sh .env pull app migrate`
3. `bash src/scripts/compose.sh .env stop app`
4. `bash src/scripts/compose.sh .env up --no-build --force-recreate migrate` → **exit 0인지 확인**. 실패 시 앱 기동 금지, `logs --tail 200 migrate` 확인.
5. `bash src/scripts/compose.sh .env up -d --no-build app`
6. `/api/health` 200, 기존 도면/Current/비밀번호/원본/한글 및 WASM·S3 회귀 확인.

**복구:** schema가 비호환이면 변경된 DB에 과거 앱을 직접 연결하지 말고 원본·DB·S3 같은 시점 백업과 당시 Compose/이미지를 함께 복원한다. `docker compose down -v` 사용 금지. `docker buildx imagetools inspect`의 GHCR digest는 출시 후 검증; PR CI의 `docker save | gzip`는 OCI 전송 바이트와 다른 지표이다. 상세 `Issue28.md`.


현재 소스 기준 버전은 0.26.0이다. 0.25.0 절차는 해당 시점의 DB 변경 기록이다. 아래 과거 버전별 문구는 당시 운영 기록으로 읽는다.

## 0.25.0 기준정보 migration 운영 절차

운영 적용은 쓰기를 중지한 뒤 같은 시점의 SQLite DB, local CAD, 모든 S3 object를 함께 백업한다. 복제 DB에서 `npm --prefix src run db:deploy`를 dry run하고 migration 전후 Location/Version 행 수, Location UUID/current/nextVersion/timestamps, Version UUID/filename/drawingName/description/password hash/size/SHA-256/storage locator/registeredAt/timestamps를 비교한다. `PRAGMA foreign_key_check`, Current 소속, 부모별 이름 중복, 사업부별 미분류 Product 수를 확인하고 원본 bytes의 SHA-256을 DB 값과 표본 대조한다.

검증 후 새 이미지로 migration하고 readiness, 기준정보 조회, 기존 목록·상세·Viewer·원본 다운로드, 신규 ID chain 업로드를 smoke test한다. 실패하면 새 앱을 중지하고 DB와 원본의 같은 시점 백업을 복구한 뒤 이전 이미지를 시작한다. 0.25 schema는 legacy 문자열 열을 제거하므로 이전 이미지를 migration된 DB에 직접 연결하는 rollback은 금지한다.

**현재 소스 0.19.1, 도면 이름 선택 입력· 업로드 크기 사전 검증·삭제 비밀번호·폐쇄망 업로드 진단·Docker 배포·host IP 접속·S3 호환 저장소 및 DWG 계측 지원.** 실제 게시·배포 버전은 TestReport의 해당 실행 기록을 확인한다. install/generate/deploy/dev/build/start/typecheck/lint/test/db:check/test:e2e가 동작한다. 초기 설치는 npm ci → db:generate → db:deploy 순서이다. 서버는 `0.0.0.0`으로 수신하며 기본 검증 주소는 `127.0.0.1:3100`이다.

Playwright 기본 설치는 `cd src` 후 `npx playwright install chromium`이다. 이미 설치된 Chromium을 사용할 때는 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`에 실행 파일 경로를 설정한다. E2E는 기본 3101 포트와 독립 `/tmp/cad-e2e-*` DB/Storage를 사용하며, 포트 충돌 시 `CAD_E2E_PORT=3111`처럼 바꿀 수 있다. 이 임시 데이터는 운영 데이터와 분리되며 Git에 포함되지 않는다.

## 현재 확인한 환경

2026-09-07: Node.js v22.14.0, npm 11.10.0, Git 2.43.0이 존재한다. 이 사실이 선택할 Next.js/Prisma 버전과의 호환성 통과를 의미하지 않는다. 초기화 시 engine/peer 조건과 Build/DB smoke로 확인한다. Browser 및 native SQLite driver 빌드 도구 필요 여부도 그때 기록한다.

프로젝트는 Linux/WSL 등 영속 local disk가 있는 Node 환경을 기본으로 계획한다. 네트워크는 최초 package 설치·승인된 GitHub 연결에 필요하다. 폰트/WASM/worker는 로컬 자산으로 제공하는 방향이며 CDN 필수 의존을 만들지 않는다. Viewer 실행에는 WebGL/WASM Browser가 필요하다.

## 설정 파일과 변수

기존 Root `.env`는 그대로 보존하고 `.env.example`은 변수명/설명만 유지한다. 기존 파일 위에 template을 복사하지 않는다. 새 checkout에 `.env`가 없을 때만 example로 만들고 로컬 편집기에서 값을 입력한다. `.env` 전체를 화면에 출력하거나 shell `source`로 무조건 실행하지 않는다.

| 변수 | 용도 | 초기 상태 / 기본안 |
| --- | --- | --- |
| remote_repo_url | 사용자가 지정한 GitHub remote URL | 기존 값 존재, credential 없는 HTTPS URL 확인; 값 문서화 안 함 |
| remote_repo_token | GitHub 인증 | 기존 값 존재; Git 전용, 앱 전달 금지 |
| DATABASE_URL | SQLite file URL | 현재 미정의; Unit 0B에서 절대 file URL로 검증 |
| CAD_STORAGE_PATH | CAD 저장소 | 현재 미정의; 절대 local directory, public 밖 |
| MAX_UPLOAD_SIZE_MB | 파일 크기 제한 | 현재 미정의; 100 MiB 제안, 1 MiB=1,048,576 bytes |

DB 기본 위치는 `<WORK_FOLDER>/data/db/cad.sqlite`, CAD는 `<WORK_FOLDER>/data/cad`로 계획한다. 빈 앱 설정은 launcher가 repo root 기준으로 이 기본값을 계산하며 cwd에 의존하지 않는다. `DATABASE_URL`을 직접 설정할 때는 절대 `file:/.../cad.sqlite` 형태를 사용한다. 앱 설정의 우선순위는 명시적 프로세스 환경값→root .env allowlist→기본값이다. 잘못된 경로/숫자는 시작 시 값 전체를 출력하지 않고 변수명과 이유만 안내한다.

앱 launcher는 src/scripts에 구현하고 dev/build/start/Prisma/test가 공유한다. `.env`를 데이터로 parse한 뒤 세 앱 키만 전달하고 inherited Git 인증 키도 제거한다. Next의 기본 env discovery에 root .env 로딩을 맡기지 않는다. 어떤 Secret도 NEXT_PUBLIC_* 또는 next.config env에 넣지 않는다. [Next.js 공식 환경변수 문서](https://nextjs.org/docs/app/guides/environment-variables)

## 설치·DB·실행 명령

다음 명령은 src/package.json에 구현되어 있으며 Root에서 실행한다. 최초 셋업 및 실행 순서는 [README](../README.md)를 참조한다.

| 목적 | 명령 | 검증 Unit |
| --- | --- | --- |
| Lock 기준 의존성 설치 | `npm --prefix src ci` | 0B |
| Prisma Client 생성 | `npm --prefix src run db:generate` | 0B/1 |
| 개발 Migration 작성/적용 | `npm --prefix src run db:migrate` | 1 |
| 검토된 Migration 배포·최초 DB 초기화 | `npm --prefix src run db:deploy` | 1 |
| 개발 실행 | `npm --prefix src run dev` | 0B |
| Production Build | `npm --prefix src run build` | 0B 및 각 Unit |
| Production 실행 | `npm --prefix src run start` | 0B 및 통합 |
| Type Check | `npm --prefix src run typecheck` | 0B |
| Lint | `npm --prefix src run lint` | 0B |
| 자동 테스트 | `npm --prefix src test` | 0B 이후 관련 Unit |
| E2E | `npm --prefix src run test:e2e` | 4/9 |

dev/start는 기본 `0.0.0.0:3000`에서 수신하며 로컬 접속 주소는 `http://127.0.0.1:3000`, 다른 장치 접속은 접근 가능한 서버 IP를 사용한다. Next App Router와 local filesystem API를 사용하는 Node 서버이므로 정적 export만으로 실행하지 않는다. 원본 파일/DB를 src/public 또는 Build 디렉터리에 두지 않는다. 앱 실행 가능 시 현재 버전은 src/package.json에서 확인하고 README/ChangeLog와 대조한다.

## GitHub 연결·Commit·Push

원격 이름은 기존 `origin`, local branch는 `main`이다. 초기 읽기 연결에서 remote HEAD/branch가 없었다. 당시 인증 정보 존재·HTTPS URL 정합성·git ls-remote 성공을 확인했으며 write 권한은 미검증이었다. 이후 Commit/Push 확인 결과는 [TestReport](TestReport.md)를 기준으로 한다. public repo 읽기 성공만으로 token의 모든 권한을 검증했다고 주장하지 않는다.

Git 실행 전 `.env`를 비출력 parser로 읽고 remote URL을 메모리에서 비교한다. URL에 Credential이 포함됐으면 raw `git remote -v`를 출력하지 않는다. 현재 remote가 일치하므로 재설정할 필요가 없다. 새 checkout의 remote가 없을 때만 `.env` URL을 검증하여 설정하며, 다른 저장소가 연결되어 있으면 임의로 덮어쓰지 않는다.

인증은 token을 URL/명령행/문서에 넣지 않고 일시적인 GIT_ASKPASS 또는 안전한 credential helper를 사용한다. 이번 연결 확인은 임시 askpass가 프로세스 환경에서 token을 읽었고 임시 helper에는 Secret을 기록하지 않았다. shell tracing/GIT_TRACE를 켜지 않는다. Git author name/email은 인증 token과 별개이다. 2026-09-07 사용자가 제공한 작성자 정보를 이 저장소의 local config에 설정했다. 전역 설정은 변경하지 않았으며 실제 값은 문서에 복사하지 않는다.

Commit/Push 절차:

1. 안전하게 remote/branch/status/log를 확인하고 필요 시 fetch한다. 기존 remote history가 생겼으면 비교하고 무조건 pull/force push하지 않는다.
2. 작업 요약, 관련 테스트/문서/README/Database/Architecture/ChangeLog 검토.
3. `git diff --check`, 전체 intended diff 및 staged diff 확인. 새 파일은 untracked 상태에서도 내용을 검토한다.
4. `git check-ignore`와 후보 파일 scan으로 `.env`, token, credential URL, Runtime DB, CAD 원본, 임시/build 파일이 없는지 확인한다. Secret scan은 발견한 값/행을 출력하지 않고 count/category만 보고한다.
5. 정확한 파일만 stage, Conventional Commit, 필요 시 지정 origin의 현재 branch에 push한다. 최초 push 전 원격 변경을 다시 확인한다.
6. Commit ID와 Push 성공/실패, remote와 HEAD 일치 여부를 안전한 결과로 기록한다. 미검증 권한을 OK로 미리 쓰지 않는다.

인증 실패는 변수 존재→URL 형태→helper 방식→token scope/계정 접근 권한 순으로 확인한다. 값은 출력하지 않고 network/DNS, authentication/permission, branch protection 등 범주로만 안내한다. 자동 승인 검토나 sandbox 제약으로 차단되면 해당 action과 이유를 그대로 설명한다.

## 도면 이름 — 0.19.0

등록 화면의 도면 이름은 선택 입력이다. 비우면 `[사업부][사업장][동][층]_V번호`를 사용하고 입력하면 해당 이름을 우선한다. 버전 번호는 실제 등록 시 확정된다. 원본 파일명 검색과 원본 다운로드는 그대로 유지한다. 등록 후 이름 편집은 제공하지 않는다.

0.18.0에서 올릴 때에는 앱 쓰기 중지와 DB/원본 백업 후 `db:deploy`로 새 nullable 이름 Column을 추가한다. 기존 행은 NULL이며 조회 시 기본 이름이 표시된다. 새 Column 이외의 기존 metadata·Current·순번·비밀번호 hash와 원본을 비교하고 health를 확인한다. Docker 시작 절차도 같은 migration 명령을 실행한다. 실제 적용 결과는 TestReport U-ISSUE6-20260911을 따른다.

## 데이터 백업·복구 계획

### Unit DELETE 업그레이드 — 0.17.0 도입 / 0.17.1 보완

- 신규 등록은 삭제용 비밀번호가 필수다. 비밀번호를 아는 사용자는 선택 Version을 삭제할 수 있으며 열람·원본 다운로드에는 기존 정책이 유지된다. 기존 도면 비밀번호는 사용자 요청대로 최초 적용 시 `1234`로 초기화한다. 신규 등록에 이 값을 자동 입력하지 않는다.
- 실제 적용 순서: 운영 쓰기 중지→SQLite와 local/S3 원본의 일관된 백업→0.17.1의 `db:deploy`(migration+기존 NULL hash backfill)→NULL hash 0/기존 수·Current·locator 검증→앱 재시작/health·등록 페이지 확인. 기존 도면의 1234 검증은 읽기 전용 hash 검증으로 하고 사용자 도면을 시험 삭제하지 않는다. build만으로 운영 DB를 변경하지 않는다.
- backfill 실패 시 서비스 재개를 중단하고 같은 명령으로 남은 NULL 행만 재개한다. 이미 설정된 hash를 일괄 재설정하지 않는다. hash 자체를 로그/보고서에 출력하지 않고 처리 건수·성공 여부만 남긴다. 새 schema 적용 후 구버전 앱만 되돌리면 신규 등록 필수 입력과 정합성이 맞지 않으므로 호환 코드 또는 일관된 백업 복구를 검토한다.
- 삭제는 선택 Version만 대상이며 Current이면 NULL로 해제한다. 마지막 Version 삭제 후 Location은 보존한다. 성공 200은 원본 정리도 완료됐다는 뜻이고 202는 화면상 삭제 완료·원본 정리 대기이다. 원본 정리 실패는 DB의 승인된 job으로 남는다. `npm --prefix src run storage:cleanup`은 이 job만 재시도하며 다른 원본/orphan을 자동 삭제하지 않는다. 미처리 job 또는 오류가 있으면 종료 코드1이며 경로를 출력하지 않는 오류 코드로 확인한다. 실행 결과는 TestReport를 기준으로 한다.
- 비밀번호 오입력 제한 429는 남은 대기 시간 후 재시도하며 기본값/우회 비밀번호를 사용하지 않는다. 통신·COMMIT 결과 불확실은 먼저 목록에서 상태를 확인한다. 비밀번호·hash를 문의 로그나 진단 파일에 복사하지 않는다. 외부 백업·S3 versioning의 과거 원본 영구 삭제는 별도 보관 정책의 영역이다.

- 안전한 초기 방식은 앱 쓰기 중지 후 SQLite connection을 닫고 DB와 CAD directory를 함께 백업하는 것이다. WAL 사용 시 DB 한 파일만 임의 복사하지 않는다. 온라인 백업은 SQLite backup 방식 검증 후 제공한다.
- 복구는 별도 임시 경로에서 DB foreign_key_check, 파일 존재/hash, Location/Current 일치를 확인한 후 전환한다. 기존 데이터를 승인 없이 덮어쓰거나 초기화하지 않는다.
- 임시/최종 경로의 파일과 DB 참조를 대조해 orphan을 식별한다. 자동 삭제하지 않고 실행 중 upload가 아닌지·DB commit 여부·유예기간을 확인한 뒤 정리 대상으로 제시한다.
- missing content는 404와 관리용 로그로 알리고, 기존 Current/Version을 자동 삭제하거나 다른 파일로 대체하지 않는다.
- 데이터 reset/삭제/파괴적 migration은 기본 운영 명령에 포함하지 않는다.

## 장애 대응 초안

업로드 실패 화면의 **오류 상세 보기**에서 발생 시각·앱 버전·오류 코드·HTTP 상태·서버 요청 ID와 조치 안내를 확인한다. **진단 정보 복사**가 HTTP/권한 정책으로 실패하면 표시된 전체 내용을 직접 선택하거나 **진단 JSON 저장**을 사용한다. HTML·빈 응답·연결 실패와 성공 응답 해석 실패는 원문을 공개하지 않고 안전한 범주로 표시한다. 결과가 `확인 필요`이면 자동 재업로드하지 말고 목록에서 같은 도면의 등록 여부를 먼저 확인한다.

서버 로그는 업로드 요청마다 한 줄 JSON이며 `requestId`, `stage`, `outcome`, `elapsedMs`, `backend`로 수신·저장·DB 등록·정리 결과를 연결한다. 화면의 서버 요청 ID가 있으면 다음처럼 검색한다. 앱에 도달하지 않은 프록시/연결 오류는 서버 요청 ID가 없으므로 발생 시각과 프록시 로그를 대조한다. 로그에는 도면 파일명·설명·원본 locator·SQL·인증정보를 기록하지 않는다.

```bash
docker compose --env-file .env -f src/docker-compose.yml logs --since 30m --timestamps --no-color app > upload-error.log 2>&1
rg '화면에 표시된-requestId' upload-error.log
```

Compose의 app 서비스는 Docker `local` logging driver와 `max-size=10m`, `max-file=5`를 사용한다. 컨테이너 로그는 순환되고 컨테이너 제거와 함께 사라질 수 있으므로 교체·제거 전에 필요한 시간 범위를 별도 파일로 수집한다. 진단 파일과 서버 로그도 운영 정보로 취급해 접근을 제한하고 검토 후 보관 정책에 따라 폐기한다.

직접 링크 복사는 `navigator.clipboard.writeText`를 우선 사용한다. HTTP 환경, 권한 거부, 브라우저 정책 등으로 Clipboard API가 없거나 실패하면 읽기 전용 URL 입력과 동일 URL의 `도면 열기` 링크를 표시한다. 링크 도달성은 서버가 실행 중이고 사용자가 접근 가능한 동일 origin일 때만 보장된다. `localhost`/`127.0.0.1`은 링크를 여는 장치 자체를 가리키며, 사설 IP는 같은 네트워크/VPN·수신 listener·방화벽 조건이 필요하다. 공개 토큰이나 저장소 locator를 URL에 넣지 않는다.

| 증상 | 먼저 확인할 사항 | 처리 원칙 |
| --- | --- | --- |
| 앱 시작/DB 연결 실패 | 앱 변수명, 절대 경로, directory 쓰기 권한, driver version | 값 전체를 log에 출력하지 않음 |
| Upload 초과/저장 실패 | 설정 MiB 한도, 실제 received bytes, 디스크 여유·권한 | 서버 검증, transaction rollback/파일 정리 상태 확인 |
| DB locked | 실행 프로세스 수, 긴 쓰기 transaction, retry/timeout | 무제한 재시도·DB 삭제 금지 |
| Current 불일치 | pointer/소속 FK/connection foreign_keys, 캐시 | DB 사실 기준으로 진단; 임의 여러 flag 수정 금지 |
| 파일 없음 | Version 존재, 안전한 storage key, 파일 백업 | arbitrary path 요청을 허용하지 않음 |
| WASM 로딩 오류 | 동종 origin asset, MIME/URL, bundler 배포 파일, browser | 초기화 오류를 Parse 실패와 구분 |
| 도면 일부 누락/한글 오류 | Entity 지원, encoding/font, hash/기준 화면 | partial 결과와 parser/renderer 원인을 분리 기록 |
| memory 증가/느린 전환 | 반복 횟수, Worker/geometry/RAF/listener/Blob, cache 조건 | 측정 방법 명시, 오류 재현 후 Adapter 수정 |

## 세션 재개

AGENTS→README→안전한 Git 상태→package/version→ChangeLog→TestReport→해당 문서를 읽고 마지막 완료/미완료 Unit, 승인 상태, 실패 테스트, uncommitted 변경, remote 동기화, 다음 작업을 파악한다. 승인 계획 내이면 반복 전체 승인 없이 진행한다. 현재는 **문서 단계, 구현 계획 확인 대기**이다.

## 2026-09-07 실행 순서 변경

사용자가 계획 실행을 승인했다. DXF 두 Viewer와 공통 관리 기능·계측·회귀를 먼저 구현하고, libredwg-web은 그 다음 MINOR 버전으로 진행한다. DWG 선행 실험은 DXF 구현의 조건에서 제외한다. 최신 단계/승인 상태는 Decisions의 ADR-011과 TestPlan을 따른다. 기존 미실행 기록은 당시 상태이며 실제 완료 후 갱신한다.

## 목록 미표시 점검 및 Unit 3 사용법

GitHub #1 원인은 DB 저장 실패가 아니라 홈의 목록 조회 미구현이었다. 수정 버전에서 `/`는 실제 DB 목록이며 `/cad/upload` 등록 후 목록으로 돌아오면 새 행이 보인다. 도면 파일명/버전 정보 링크로 `/cad/locations/{locationId}`에 접근하고 이전 버전을 Current로 지정할 수 있다.

검색 조건은 URL query로 유지된다. 결과가 없으면 초기화로 전체 목록을 확인한다. 상세 의미와 API query는 Architecture를 참조한다. Viewer는 후속 단계로 아직 표시하지 않는다.

코드 갱신 후 `npm --prefix src run build`를 실행하고 기존 Node 서버를 정상 종료한 뒤 `npm --prefix src run start -- --port 3100`으로 재시작한다. DB/file 삭제나 DB reset은 필요 없다. 실행 환경의 DATABASE_URL/CAD_STORAGE_PATH가 등록 당시와 동일한지 확인한다. `/api/cad-files`의 total과 목록을 비교하되 사용자 파일명/원본을 공개 로그에 기록하지 않는다.

회귀 검증: `npm --prefix src test`, Build 후 `npm --prefix src run test:e2e`. 설치된 별도 Chromium이 필요하면 PLAYWRIGHT_CHROMIUM_EXECUTABLE에 절대 실행 경로를 지정한다. 테스트는 운영 DB를 사용하지 않는다.

## DXF Viewer 사용 및 장애 확인

DXF 등록 후 목록 또는 Location 상세의 **도면 보기**를 선택한다. 확대/축소, 마우스 드래그 이동, 휠 zoom, 화면 맞춤과 다시 불러오기를 제공한다. DWG는 원본/버전 관리만 지원한다.

WebGL 사용 가능한 데스크톱 Browser가 필요하다. 초기화 실패는 하드웨어 가속/브라우저 설정을 확인한다. 파싱 실패는 손상·미지원 DXF 또는 Worker 자산 요청 실패를 확인한다. 새 build의 `.next` 전체 자산을 함께 적용하고 서버를 재시작해야 한다. 파싱 Worker는 120초 timeout이며 대형 파일의 적합성은 미검증이다. 빈 도면과 오류를 성공 렌더링으로 혼동하지 않는다.

글꼴 미제공으로 TEXT/한글이 누락될 수 있다. 비교 평가 때 실제 CAD 원본과 대조하고 TestReport에 부분 지원을 기록한다. Console의 upstream parse 오류에는 도면 일부 정보가 들어갈 수 있으므로 공개 로그로 복사하지 않는다.

## Unit 5 — 글꼴 및 Viewer 선택

- DXF 도면 보기에서 `three-dxf-viewer로 열기` / `dxf-viewer로 열기`로 동일 Version을 연다. 현재는 전체 페이지 탐색이다. three Viewer에는 Layer 체크박스가 있다.
- 글꼴 원본: [Google Fonts Nanum Gothic](https://github.com/google/fonts/tree/main/ofl/nanumgothic), 다운로드 2026-09-08. 원본 `NanumGothic-Regular.ttf` 2,054,744 bytes, SHA-256 `76f45ef4a6bcff344c837c95a7dcc26e017e38b5846d5ae0cdcb5b86be2e2d31`. 원본 변경 없이 `src/public/fonts`에 보관하고 같은 폴더의 OFL.txt를 함께 배포한다.
- `scripts/fonts.mjs`가 고정 Three 0.171 TTFLoader로 `CadKorean.typeface.json`을 생성한다. 파생 typeface의 family/name은 CAD Korean으로 변경하고 원본 저작권/라이선스 정보는 유지한다. JSON은 약 25.8 MB로 TTF보다 크며 초기 전송·메모리 비용이 있다. gzip 및 실제 네트워크 성능 평가는 후속 Unit이다.
- build/dev 명령이 생성한다. Production 배포에는 `.next`와 public/fonts(생성 JSON 포함)가 모두 필요하다. `.env`나 사용자 CAD를 글꼴 폴더에 넣지 않는다. 다른 font로 교체할 때는 재배포 조건·한글 glyph·두 Viewer 포맷을 확인하고 scripts/Adapter URL/테스트를 함께 갱신한다.
- 한글 TEXT의 기본 글꼴 표시와 CAD 원본의 font/SHX/MTEXT 서식 재현은 별도이다. CP949 등 인코딩 문제는 font 제공만으로 해결되지 않는다. 현재 ASCII 구조/UTF-8 DXF를 기본 검증하며 binary DXF는 지원 평가 밖이다.

## Unit 6 — DXF 전환 사용법

도면 보기 상단의 dxf-viewer / three-dxf-viewer 버튼으로 같은 Version을 새로고침 없이 전환한다. 선택된 버튼은 비활성 표시이며 URL renderer query가 현재 선택을 반영한다. 재접속 시 해당 query를 초기 선택으로 사용한다. 브라우저 뒤로가기 이력을 매 전환마다 추가하지 않는다.

전환하면 카메라/Layer 선택은 초기화된다. 같은 화면에서의 원본 다운로드는 재사용하며 **다시 불러오기**는 원본을 다시 받는다. 읽기 실패 후 재시도할 수 있다. DWG는 이 선택 UI를 제공하지 않는다.

이전 Unit 5 절의 전체 페이지 링크 설명은 당시 동작이다. 현재 동작은 본 절을 기준으로 한다. 통합 검증 시 등록 데이터·메타데이터는 그대로 유지하고 generated test fixture를 사용한다.

## Unit 8A — 측정 및 재현

- 도면 하단 측정 상세와 JSON 저장을 이용한다. sourceWait는 실제 network fetch만이 아니라 공유 Promise 대기/메모리 반환을 포함한다. renderer 전환 시 새 기록, 명시적 다시 불러오기는 miss로 다시 측정한다.
- Root에서 Build 후 `npm --prefix src run test:benchmark` 실행. Chromium 설치/PLAYWRIGHT_CHROMIUM_EXECUTABLE은 기존 E2E와 같다. 같은 3101 테스트 포트를 쓰므로 E2E/benchmark를 동시에 실행하지 않는다. 운영 DB는 사용하지 않는다.
- 매 benchmark 시작 때 benchmark-results가 새 실행용으로 정리된다. 보존할 JSONL은 실행 전 별도로 복사한다. 결과는 각 도면·Viewer마다 새 Browser context(cold), 다른 Viewer 경유 후 같은 renderer로 복귀한 warm(memory source 재사용) 각 5회이다. warm에는 Browser/module/font cache도 영향을 준다.
- 100/10,000/100,000 LINE 반복 생성은 Entity 수를 통제하기 위한 합성 부하이다. 실도면 텍스트/블록/치수/HATCH 조합과 같지 않다. actual byte 수로 크기를 분류하고 브라우저·장비·GPU·동시 부하와 함께 해석한다. 단일 종합 점수로 기술 우열을 단정하지 않는다.
- Console/pageerror는 benchmark가 별도 수집한다. 앱의 모든 Console을 전역 가로채거나 사용자 CAD 내용을 수집하지 않는다. 앱 JSON의 error는 일반화된 오류이다.

## DXF 릴리스 회귀 검증 — Unit 9A

- 루트에서 `npm --prefix src run typecheck`, `npm --prefix src run lint`, `npm --prefix src test`, `npm --prefix src run build` 후 `npm --prefix src run test:e2e`를 실행한다. Browser 경로 설정은 기존 E2E 절차를 따른다.
- E2E 서버는 3101과 실행별 임시 DB/Storage를 사용한다. 기존 3100 사용자 데이터에 테스트 CAD를 등록하지 않는다. `workflow.spec.ts`는 UI 등록부터 두 Viewer까지 검증하며 `switch.spec.ts`는 20회 전환 자원 수를 확인한다.
- 0.8.0 Unit 9A는 테스트/문서만 변경하므로 앱/Schema/설치 의존성은 동일하다. U8A 성능 측정값을 참조한다. 새로운 환경의 재측정 시에는 별도 benchmark 명령을 사용한다.
- 기능 자동화 통과와 실도면 업무 적합성 승인은 구분한다. 전체 Entity 충실도 및 DWG는 후속 시험이다.

## DWG 최소 기술 실험 — Unit 7A

1. 고정 lock으로 설치 후 build/dev를 실행하면 `public/libredwg/{dist,wasm}`가 자동 생성된다. Production 배포에는 `.next`뿐 아니라 생성된 public 자산도 포함한다. 런타임 외부 CDN은 사용하지 않는다.
2. `/lab/dwg` 접속 후 로컬 DWG를 선택한다. 20 MiB 이하, 평면 LINE만 표시하는 실험이다. 서버 업로드/DB 등록은 수행하지 않는다. 기존 등록 DWG의 Viewer는 7B에서 연결한다.
3. `npm --prefix src run prepare:dwg-samples`는 공식 저장소 고정 커밋의 AutoCAD 2000 Line.dwg/circle.dwg를 SHA-256 확인 후 Git 제외 node_modules/.cache/cad-dwg-samples에 저장한다. 시험 샘플 원본을 Git에 추가하지 않는다.
4. Build 후 기존 Chromium 실행 파일 환경변수를 지정하고 `npm --prefix src run test:dwg`를 실행한다. 기존 `test:e2e`와 동일 임시 DB/3101을 사용하므로 두 browser suite를 동시에 실행하지 않는다. DXF 회귀는 별도로 `test:e2e`.
5. WASM 초기화 실패 시 `/libredwg/dist/libredwg-web.js`, `/libredwg/wasm/libredwg-web.js`, `/libredwg/wasm/libredwg-web.wasm`의 HTTP 200/MIME 및 생성 여부를 확인한다. 패키지 변경 시 자산 재생성/Build/서버 재시작과 DWG 시험이 필요하다.
6. npm 배포본은 GPL-3.0 표기이며 source는 Architecture 링크를 참조한다. wrapper/glue/wasm 파일을 임의 수정하지 않는다. 패키지의 README/package metadata도 생성 자산에 함께 보존한다.

성능 메모리 한계: INITIAL_MEMORY=1GB 빌드 옵션의 배포본이다. Worker를 종료해 인스턴스 생명주기를 분리하지만 저메모리 장비나 업무 대형 파일의 적합성은 별도 실측 대상이다. parse/free 실험 성공과 전체 renderer fidelity를 혼동하지 않는다.

## 등록 DWG Viewer — Unit 7B

- 일반 파일 등록에서 DWG와 메타데이터를 저장한 뒤 목록/Location에서 **도면 보기**를 선택한다. Current 관리와 원본 다운로드는 기존 규칙을 따른다. Viewer는 libredwg-web만 사용한다. `/lab/dwg`는 독립 실험으로 유지한다.
- 등록 상한(MAX_UPLOAD_SIZE_MB)과 Viewer 처리 한도는 구분한다. 현재 DWG Viewer는 20 MiB 이하의 평면 LINE만 지원하며 더 큰 원본은 저장 설정에 따라 등록할 수 있어도 표시 시 제한 안내가 나온다. 미지원 Entity는 제외 건수로 표시한다.
- 확대/축소/마우스 Pan/Fit/Resize를 사용할 수 있다. 재시도는 원본을 다시 받아 Worker를 재생성한다. WASM 404는 7A의 static asset 준비·배포 절차를 확인하고, 원본 404는 DB/Storage 복구 절차를 따른다. 원본 파일을 임의로 수정하지 않는다.
- `test:dwg`는 독립 실험과 등록 DWG UI 흐름·오류·취소를 함께 실행한다. 먼저 `prepare:dwg-samples`로 고정 공식 샘플을 준비한다. `test:e2e`는 DXF와 DWG 잘못된 입력의 공통 회귀를 실행한다. 같은 3101 테스트 서버를 사용하므로 두 suite를 직렬로 실행한다.
- 공통 JSON의 partial은 표시 제외 Entity가 있다는 의미이며 reasons.coverage를 함께 확인한다. LINE 표시 성공도 스타일/전체 Entity 정확성 보증은 아니다.

단일 Workspace의 Production 서버를 갱신할 때는 기존 start 프로세스를 중지한 후 build하고 새 프로세스로 시작한다. 실행 중인 서버와 동일 `.next`에 build하면 이전 모듈과 새 모듈이 섞일 수 있다. U7B 재시작 시 이전 프로세스의 webpack-runtime 오류를 확인했고 새 0.10.0 프로세스에서 홈/등록/WASM 정상 응답을 확인했다. 무중단 전환이 필요하면 별도 build 디렉터리/배포 절차를 먼저 설계한다.

## S3 호환 저장소 설정 — SeaweedFS 등

기본값은 local이다. S3 전환은 기존 CAD 파일을 이동하지 않고 이후 업로드의 저장 위치만 바꾼다. SQLite와 업로드 임시 파일은 계속 local disk를 사용하므로 DATABASE_URL/CAD_STORAGE_PATH를 유지한다. 기존 local 원본의 조회를 위해 CAD_STORAGE_PATH를 바꾸거나 삭제하지 않는다.

1. 관리자가 S3 호환 endpoint와 private bucket을 준비하고 앱 계정에 해당 bucket의 PutObject/GetObject/DeleteObject 권한을 부여한다. 앱은 버킷을 생성하거나 다른 bucket을 정리하지 않는다. rollback 보상 삭제 때문에 DeleteObject 권한이 필요하다.
2. Root `.env`에 아래 변수들을 설정한다. 기존 Git 변수는 보존하며 Secret은 출력/커밋하지 않는다. `.env.example`은 변수명과 빈 credential만 제공한다.

| 변수 | 설정 / 기본값 |
| --- | --- |
| CAD_STORAGE_BACKEND | local(default) 또는 s3 |
| CAD_S3_ENDPOINT | HTTP(S) origin. SeaweedFS S3 gateway 예: `http://127.0.0.1:8333`; 경로·query·URL 내 credential 금지 |
| CAD_S3_BUCKET | 미리 생성한 bucket 이름 |
| CAD_S3_REGION | us-east-1(default), 서버가 요구하는 region |
| CAD_S3_ACCESS_KEY_ID / CAD_S3_SECRET_ACCESS_KEY | 서버 전용 인증정보 |
| CAD_S3_SESSION_TOKEN | 임시 자격증명 사용 시 선택 |
| CAD_S3_FORCE_PATH_STYLE | true(default), SeaweedFS path-style 주소 |
| CAD_S3_TIMEOUT_MS | 60000(default), 1000–300000ms |

3. 기존 start 프로세스를 중지하고 `npm --prefix src run build` 후 start로 적용한다. 설정만 바꿀 때도 프로세스 재시작이 필요하다. 일반 등록→목록→Viewer를 그대로 사용하며 브라우저에 S3 주소/키를 입력하지 않는다.
4. 기존 S3 행이 있으면 local 모드로 돌아가더라도 S3 조회에 필요한 endpoint/credentials를 유지한다. 새 bucket 설정은 새 업로드에만 적용되며 이전 bucket 조회 권한도 필요하다.
5. 한 endpoint만 지원한다. endpoint 교체는 데이터 이전이 아니다. 원본 object와 DB locator를 일관되게 이전하는 별도 계획 없이 설정만 변경하지 않는다. 자동 local↔S3 이동은 제공하지 않는다.

### 장애·백업

- NoSuchKey: 원본 404. 인증/연결/버킷 문제: 안전한 503. 원본 API가 프록시하므로 S3 CORS 또는 브라우저 credentials는 필요 없다.
- PUT 불확실: 같은 `requestId`의 `storage_publish` 실패와 정제된 cause/status를 확인하고 현재 bucket의 신규 `cad/` key를 운영 도구로 대조한다. 업로드 성공 여부가 불명확한데 원본을 무조건 삭제하지 않는다.
- DB 실패 후 보상 삭제: DB에 해당 locator가 없다는 확인 후 새 object만 제거한다. 같은 `requestId`의 `compensation` warning이면 안전한 `recoveryId`를 사용해 DB와 bucket listing을 운영자가 비교한다. 삭제 전 진행 중 업로드가 없는지 확인하고 보존 기간/백업을 고려한다. 자동 orphan sweeping은 없다.
- 백업은 SQLite DB+local CAD 원본+각 S3 bucket object를 한 시점의 일관된 집합으로 보존한다. DB 파일만 백업해도 S3 원본이 복구되는 것은 아니다.
- 확인된 호환 제품은 SeaweedFS 4.45이다. 다른 S3 제품은 아래 시험/조건부 PUT·streaming GET·DeleteObject를 먼저 검증한다. 조건부 PUT을 지원하지 않는 제품에 overwrite 허용 fallback은 하지 않는다.

### 격리 자동 검증

- `npm --prefix src run test:s3`: Docker 임시 SeaweedFS/랜덤 인증/전용 임시 bucket에서 저장소 통합 시험. 기존 SeaweedFS 서비스/사용자 bucket을 사용하지 않는다.
- Production Build 후 Chromium 경로를 지정하고 `npm --prefix src run test:s3:e2e`: 별도 임시 SeaweedFS를 사용하는 전체 웹 E2E.
- 고정 이미지: `chrislusf/seaweedfs@sha256:fc9f76fa993ad69966ffeb2f65d0318fcae39c6f8e20cf68ef7b3a5cb97769e5`(4.45). 최초 실행은 이미지 다운로드가 필요할 수 있다.
- 테스트 런처가 random loopback port·임시 credential 파일(0600)을 사용하고 종료 시 해당 컨테이너·설정 파일을 제거한다. 기본 test:e2e/test:dwg는 local backend를 명시해 실제 S3로 시험 데이터가 쓰이지 않도록 한다.
- 웹 시험들은 3101을 사용하므로 직렬 실행한다. 컨테이너 종료 전에 중단되었다면 cad-s3-test-* 중 해당 실행에서 생성한 컨테이너만 확인해 정리한다.

## Docker 설치·게시 운영

Root에서 `docker compose --env-file .env -f src/docker-compose.yml build` 후 `up -d`를 실행한다. README의 Docker/pull 절차를 사용한다. `.env` 전체를 container env_file로 주입하지 않고 Compose environment의 앱 변수만 전달한다. `GHCR_IMAGE`는 image 주소, `CAD_HOST_PORT`는 host port이며 기존 Git 변수는 Git tooling에만 남는다. `docker compose config`는 실제 credential이 치환될 수 있으므로 설정 확인에는 `config --quiet`를 사용한다.

- 이름: project `cad-layout-viewer`, service `app`, container `cad-layout-viewer-app`, volume `cad-layout-viewer-data`, network `cad-layout-viewer-network`, port `http`. 같은 이름의 기존 자원을 임의 삭제하지 않는다.
- 데이터: volume `/data/db/cad.sqlite`, `/data/cad`. host `data/`는 자동 이전하지 않는다. container 교체는 volume을 보존하며 `down -v`는 사용자가 데이터 삭제를 승인한 경우에만 사용한다. 백업 전 앱 쓰기를 중지하고 DB/원본을 일관되게 보존한다.
- 바인딩: npm dev/start 및 Docker는 기본 `0.0.0.0`; 로컬 한정 실행은 `-- --hostname 127.0.0.1`로 override할 수 있다. 다른 장치에는 localhost 링크 대신 접근 가능한 서버 IP/호스트명으로 앱을 방문해 링크를 복사한다. 실제 방화벽/라우터 설정은 자동 변경하지 않는다.
- health: migration 후 앱/DB 조회 성공200 또는 안전한503. 실패 시 logs의 안전한 오류 범주와 volume 쓰기 권한, port충돌, DB migration 상태를 확인한다. endpoint는 S3 연결/모든 CAD 검증을 대신하지 않는다.
- GHCR: build 실행자가 OCI `org.opencontainers.image.source`, `revision`, `version` label을 실제 지정 저장소/commit/버전으로 전달해 image를 source와 연결한다. 저장소 URL을 Dockerfile에 하드코딩하지 않는다. 검증한 버전 tag를 publish하고 digest를 기록한다. private image pull은 package read 권한이 필요하며 visibility를 임의 공개로 바꾸지 않는다. image upload credential을 build arg나 image layer에 전달하지 않는다. Token값을 CLI에 직접 쓰지 않는다.
- 배포 범위: Linux native SQLite와 단일 app instance를 먼저 검증한다. 여러 replica, 자동 TLS/인증/공개 인터넷 운영, 기존 데이터 migration은 별도 요구 없이는 추가하지 않는다.

공식 근거: [GitHub Container Registry 인증·push/pull](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), [Compose service/port/container 설정](https://docs.docker.com/reference/compose-file/services/), [Compose project name](https://docs.docker.com/reference/compose-file/version-and-name/). 실제 설치/실행 결과와 공식 지원 설명은 TestReport에서 구분한다.
