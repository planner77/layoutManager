# Database Schema — 단일 기준 문서

## #109 S3-4-B1 — read-only restored clone boundary (2026-10-27)

- 운영 `src/prisma/migrations/**` 6개 CAD 이력 불변, 후보 Auth SQL은 `src/deploy/g7-s3/prisma/migrations/**` 격리 유지. B1은 자체 migration 명령 없이 **격리 복원 DB에 대한 읽기 전용** `PRAGMA quick_check`/FK 및 Version/Current/nextVersion·SHA 대조만 수행한다.
- 7번째 후보 테이블 존재 상태는 B1 `G7_CANDIDATE` marker와 맞아야 하며, marker만의 진위/운영 Schema 적용 근거는 불충분. 별도 B2 private Prisma migrate deploy+DB/CAD/S3 restore/rollback 실증 필요.


## #109 S3-4-A — Prisma Migration과 Snapshot 복원 범위 (2026-10-27)

- 현재 운영 자동 `src/scripts/deploy.ts`는 `src/prisma/migrations/**`에 있는 CAD 6개만 자동 migrate deploy. 추가 Auth SQL은 `src/deploy/g7-s3/prisma/migrations/202610260002_g7_operational_auth/**`의 **격리 후보**이며 이번 S3-4-A에서 승격·실행 금지.
- S3-4-A 패킷은 후보 이력 byte 동등/격리 여부, 사내 복제 DB Migration dry-run, FK=0·Version/Current·원본 SHA·삭제해시/감사 무결성, DB/CAD/S3 단일 Snapshot 복원과 rollback의 내부 증거 ID를 요구하지만 **직접 DB에 접속하지 않는다**. 후보 Migration CI Fixture PASS와 실 운영 Snapshot 복구를 혼동하지 않는다.
- S3-4-B 별도 사내 복제 볼륨과 완전 복구 실증 전 운영 Migration **NO-GO**.


## Issue #109 S3-3 — CAD API 권한·Audit 원자성 준비, 운영 OFF (2026-10-27)

- **기능:** 기존 CAD Multipart POST·Current PUT·Version DELETE에서 서버 DB의 최신 Session/Role/Site를 같은 Prisma Transaction 안에 재조회하고 승인된 Editor/Admin+Site만 쓰기 허용한다. DELETE는 기존 삭제 비밀번호도 요구하며, CAD DB 변경과 CAD_UPLOADED/CAD_CURRENT_CHANGED/CAD_VERSION_DELETED Audit INSERT 중 하나라도 실패하면 DB를 롤백한다. 기존 업로드 보상·삭제 Job, 익명 GET/Viewer·CAD 데이터 규약은 유지한다.
- **운영 차단:** `NODE_ENV=production`에서는 S3-3 프리뷰 활성화 불가. 정확한 S3-2 disposable DB/marker/7 migration, loopback origin, `G7_S3_AUTH_API_PREVIEW_ONLY=true`, `G7_S3_CAD_PREVIEW_ONLY=true`, `G7_AUTH_ENABLED=false`, `G7_CAD_WRITE_CUTOVER_ENABLED=false` 조건만 격리 시험 허용. 별도 Prisma Client와 0700 root 하위 로컬 CAD 저장소 이용. 운영 Migration·실 DB/CAD/S3·Compose/Nginx/.env·GHCR 게시·인증/쓰기 활성화 없음.
- **시험·잔여:** synthetic integration(Unit) 검증 코드 추가; 실제 PR CI는 시작 전이므로 결과 `NOT RUN`. 일회용 Preview Cookie의 Path는 `/api/g7-operational`이므로 다른 CAD 경로의 프로그램 시험에서는 테스트용 Cookie를 명시적으로 넘기며 운영 브라우저 인증이 활성된 상태는 아님. S3-4는 OCI/운영 Migration/실복구·신뢰 release binding, S3-5는 릴리스별 Owner GO 및 현장 수용. 기존 유사범위 PR #128은 미병합·충돌 상태이며 자동 병합하지 않는다. #109/#96 OPEN/BLOCKED.
- **후속 정확 Squash:** `#109 | S3-3 Isolated CAD write and Audit [G7-S3-3-NO-GHCR]` 및 개별 파일 allowlist만 GHCR 미게시. 내부 로그/비밀번호/IP/실 도면 반출 금지. [S3-3 Runbook](../src/deploy/g7-s3/S3-3.md).


## #109 S3-2 — 영속 Auth/Admin 거래와 DB 출처 경계 (2026-10-26)

- S3-1 정식 후보 `202610260002_g7_operational_auth`를 가진 **일회용 SQLite DB만** S3-2 preview open 가능. 공유 `disposable-target.ts`를 Prisma 설정과 HTTP/Admin CLI에서 같이 사용해 canonical `/tmp/cad-g7-s3-*/fixture.sqlite`·UID 0700/0600·marker/Nonce/Schema ID/양쪽 DB URL을 대조. `preview-db.ts`에서 `_prisma_migrations` 성공 행/8개 Auth 테이블·`PRAGMA foreign_key_check`를 확인하고 DB 연결 실패는 API 503(데이터 정보 비노출).
- G3 로그인/세션·비밀번호 갱신, G4 Role/Site/SpecialGrant/Disable·권한/감사 adapter는 검증된 SQLite BEGIN IMMEDIATE 거래 사용. S3-2 Admin 계정 생성은 먼저 DB users:manage 권한검사+Audit를 수행하고, KDF 수행 후 **같은 거래에서 세션/역할 재검증과 User INSERT+ACCOUNT_CREATED Audit**. 최초 비밀번호 변경 필요·역할 자동부여 0. G2 초기 Admin·복구는 Secret 0600·명시 CLI, nonce 해시 1회와 session 회수·AdminRecovery Audit 원자성.
- 운영 `src/prisma/migrations` 추가 SQL **0**, 운영 `scripts/deploy.ts`/`src/prisma.config.ts`/실 DB/CAD/S3 변경 0. 프로덕션 운영 DB에 User/Auth 테이블은 이번 PR로 추가되지 않는다. 운영 API 라우트도 프로덕션 OFF이며 실 Auth DB/Migrator 통합은 S3-4 릴리스별 승인까지 금지.


## Issue #109 S3-1 — 운영 Prisma 모델 통합 / 정식 후보 Migration 분리 (2026-10-26)

- **모델:** `src/prisma/schema.prisma`에 `User`, `AuthSession`, `UserRoleGrant`, `UserSiteGrant`, `SpecialGrant`, `AuditEvent`, `AdminRecoveryNonce`, `G3LoginAttempt`를 G7 S1의 검증된 Prisma 계약에서 **운영 Client Schema로 통합**. 기존 CAD `BusinessUnit/Product/CadSite/Building/CadLocation/CadFileVersion/CadDeletionJob` 모델·관계·Current/Version/해시 계약 보존. `CadSite.siteGrants`/`auditEvents` 관계 추가. User/Site FK·역할/Scope 제한·세션 불변·append-only Audit/복구 nonce 제한은 격리 후보 SQL에 정의.
- **Migration 경계:** 활성 운영 `src/prisma/migrations`에는 **CAD 6개만 유지**(`scripts/deploy.ts`가 배포 시 자동 prisma migrate deploy). 신규 후보 이력은 `src/deploy/g7-s3/prisma/migrations`에 기존 CAD 6개 **바이트 동등 복사** + `202610260002_g7_operational_auth/migration.sql` 총 7개로 작성. 이는 **실제 운영 승격 전 별도 승인 대기 중인 정식 형식의 Migration 후보**이며, S1 `202610260001_g7_staging_auth`·G1 fixture를 활성 운영으로 단순 복제한 것이 아님. 별도 승인 전 운영 SQL 적용 불가.
- **겹침 위험 차단:** `src/deploy/g7-s3/prisma.config.ts`는 실 운영 기본 Prisma config를 사용하지 않고, `G7_S3_MIGRATION_TEST_ONLY=true`·Auth/Write OFF·UID 소유 canonical `/tmp/cad-g7-s3-*/fixture.sqlite`(0700 디렉터리/0600 SQLite/0600 유효 marker) 및 `DATABASE_URL=G7_S3_TEST_DATABASE_URL` 일치 검증 후에만 Prisma에 URL 전달. 불일치 시 `G7_S3_DISPOSABLE_MIGRATION_ONLY`를 throw하여 SQL 미실행. 테스트는 7개 공식 Prisma deploy + 기존 CAD SQL 행·Current·SHA·삭제 암호 hash 논리 스냅샷, FK/유니크/Audit/강제 실패 rollback을 별도로 확인.
- **실 운영 적용 시 미충족:** 활성 migrator 이력 승격/과거 DB 보전, 스키마 적용 전·후 동일 snapshot DB/CAD/S3 복원 실증 및 rollback Pair 검증, 승인된 App/Migrator OCI 두 digest 필요. #109 S3-1 완료만으로 이 조건을 충족했다고 간주하지 않는다. [Runbook](../src/deploy/g7-s3/README.md).



## Issue #109 / PR #125 P1 — Staging Prisma CLI Migration 실행 전 대상 강제 검증 (2026-10-26)

- **원인:** Staging 전용 `src/deploy/g7-staging/prisma.config.ts`가 기존에는 `G7_STAGING_DATABASE_URL`의 실제 경로·UID·symlink/manifest 정합성을 확인하지 않고 Prisma datasource로 전달했고 기본 fallback URL도 포함했다. 운영 DB 경로를 실수로 지정하면 G1 Auth Migration DDL이 사용자 DB에 적용될 위험(리뷰 [r4374313165](https://github.com/planner77/layoutManager/pull/125#discussion_r4374313165)).
- **보완:** config import 즉시 `resolveG7StagingGate(process.env)`를 실행해 전용 `/tmp/cad-g7-staging-*/fixture.sqlite` realpath·UID·symlink·manifest Schema ID·고정 digest 형식·`DATABASE_URL`/`G7_STAGING_DATABASE_URL`/CAD 경로/Stage-only Operation Flag 전부 확인. 불일치 시 `G7_STAGING_PRISMA_TARGET_DENIED` 예외가 **Prisma Migration SQL 실행 전에 발생**하며 fallback은 없다. 정상 검증된 파일만 `datasource.url='file:'+target.databasePath`로 설정.
- **운영 범위:** 기존 운영 `src/prisma/schema.prisma`·`src/prisma/migrations/**`·기본 `prisma.config.ts`/deployment migrator는 불변. 새 `g7-staging-prisma-config.test.ts`는 임의 DB sentinel 불변·nonzero를 검증하도록 작성했고, 공식 Staging migration E2E는 새 HEAD CI 결과로 별도 확인한다. 이 수리는 운영 DB Migration GO가 아니다.


## Issue #109 G7 S1 — Staging 전용 정식 Prisma 계층 (2026-10-26)

- **정식 Staging Migration, 운영 OFF:** `src/deploy/g7-staging/prisma.config.ts`는 config 파일 기준 상대 경로의 Staging Schema·Migration만 사용한다(Prisma 7). 기존 CAD 6개 Migration의 동일 내용 및 `202610260001_g7_staging_auth`가 순서대로 적용될 일회용 SQLite에 별도 Prisma migration history 기록. **운영 `src/prisma/schema.prisma`/migrations와 운영 Migrator/실 DB 불변**.
- G1 User/Role·Site·SpecialGrant/Session/Audit/RecoveryNonce SQL, G3LoginAttempt, 감사 안전 Site FK/append-only, 3-session trigger, 365일 cutoff(실 purge 금지)를 Staging Schema에 투영. CAD_CHANGED/UPLOADED/DELETE Staging Audit action은 target_kind VERSION+DB Site 필수, 업무 변경+Audit는 BEGIN IMMEDIATE 내 일괄 commit/rollback. 삭제 암호 검사는 거래 직전 강도 높은 KDF 후 거래 내 해시·Session/Scope 재검증.
- `G7_STAGING_ROOT`가 Linux uid 소유 `/tmp/cad-g7-staging-*/`이고 DB 이름 `fixture.sqlite`·`DATABASE_URL` 일치·CAD 별도 경로·Release manifest 일치인 경우만 API를 오픈한다. 운영 파일 복사/임의 fixture 마이그레이션 직접 실행 금지.
- 신규 영속 Outline/Memo/Type/Logs나 Audit purge, 실제 운영 Migration·S3 접근·Origin/SHA 원본 변경 0. #109 Owner S2 운영 GO 이전 배포 불가. [Issue109](Issue109.md), [Operation](Operation.md).


## Issue #109 G7 — 정식 Migration, 동시점 백업·롤백 경계 (2026-10-26)

- G1 `src/tests/fixtures/auth-g1/{migration.sql,schema.prisma}`는 **합성 DB 전용**, 운영 `src/prisma/schema.prisma`/정식 migrations에 아직 배선되지 않았다. G7 후속 코드 PR에서 정식 User/Session/Role/Site/SpecialGrant/Audit/Nonce + 기존 CAD 테이블 FK/Unique·Audit append-only·Version→Site 계약의 동등성을 검토·시험해야 한다. 현 문서 PR은 DDL/DB 변경 0.
- 승인 후에만 운영 쓰기 정지 → **같은 snapshot ID**의 SQLite 안전 backup(단순 실행중 파일 복사 금지) + CAD local bytes + S3 object/version manifest·SHA → 격리 restore/migration dry-run → 승인된 App/Migrator 두 digest 및 정식 migration → FK/Unique·원본 bytes/SHA·Version/Current/delete hash 불변 확인. 무검증 fixture SQL 복사나 운영 `prisma db push` 금지.
- 실패 시 구 App만 신규 Schema에서 가동하지 말고 **호환 구 App/Migrator pair 및 동일 snapshot DB+CAD+S3 전체** 복원·세션 폐기·유실 업무 재처리/Owner 확인 후 운영 재개. Audit 365일 초과 purge 주기/복구본/예외 세칙 미승인으로 실행 금지. [Issue109](Issue109.md), [Operation](Operation.md).


## Issue #108 / G6 — 합성 백업·복구 DB 불변식 (2026-10-26)

G6 자동 검증은 별도 cad-auth-g1-*/fixture.sqlite에 **기존 여섯 CAD Schema Migration**을 재현하고 BusinessUnit/Product/CadSite/Building/CadLocation/CadFileVersion/CadDeletionJob의 전체 row, Version ID/순번/sha256/file_size/storage_path, Current 소속을 스냅샷 비교한다. 합성 local CAD와 mock-S3 mirror의 실제 바이트 SHA가 DB와 일치해야 한다. SQLite online backup을 별도 fixture로 복제해 G1 auth fixture migration.sql 적용 후 foreign_key_check=0·기존 CAD 행 불변을 확인한다. 손상 주입 후 DB와 두 파일 mirror를 복원해 원상/해시 동등성 확인. 이는 실제 원격 S3, 승인된 운영 Prisma dry-run/DB rollback의 증거가 아니며 실 Prisma/schema/migrations/원본 DB·CAD 불변. #109 전 Audit 물리 purge/운영 마이그레이션 금지. [Issue108](Issue108.md).


## Issue #106 / PR #120 P1 — G1 AuditEvent 안전 Site Scope 보완 (2026-10-26)

G1 일회용 fixture Audit CHECK가 과거에는 `SITE_GRANTED`/`SITE_REVOKED` 외 사건의 `site_id`를 반드시 NULL로 강제하여, G4의 scoped permission/Outline Audit에서 **DB Version→Site 추적정보가 소실되는 결함**이 있었다. [PR #120 P1 r4373235027](https://github.com/planner77/layoutManager/pull/120#discussion_r4373235027).
- 변경된 비운영 CHECK: Site Grant/Revoke = affected_user_id AND site_id 필수; Outline Create/Edit/Delete = target_kind OUTLINE AND site_id 필수; AUTHORIZATION_GRANTED/DENIED = site_id NULL(글로벌/세션) 또는 target_kind SITE/VERSION/OUTLINE인 경우에만 Site FK 허용; 기타 Account/Session/Role 사건은 site_id NULL. Site FK와 append-only, UTC, Revision, immutable Actor 기록은 보존.
- G4 fixture에서는 grant/update와 함께 동일 BEGIN IMMEDIATE 거래에서 DB version 실제 Scope를 해석하여 저장하며, 틀린 Site FK/비관련 action에 임의 Site/Outline site 누락을 TC009에서 거부 검증한다.
- 위 SQL 확장은 `src/tests/fixtures/auth-g1/migration.sql` 전용. `src/prisma/schema.prisma`, `src/prisma/migrations`, 실제 운영 DB·CAD/S3/기존 공개 GET는 변경하지 않는다. G7 Owner #109 승인 전 OFF. [Issue106](Issue106.md).


## Issue #106 G4 — Audit/Grant 격리 DB 계약 (2026-10-26)

G1 disposable migration.sql의 AuditEvent Action CHECK에 AUTHORIZATION_GRANTED만 추가하며 기존 DENIED/Role/Site/Account/Outline 사건, actor_user_id/affected_user_id/site_id FK, revision/outcome/UTC/requestId, append-only UPDATE/DELETE 차단 trigger를 유지한다. 운영 src/prisma/schema.prisma 및 src/prisma/migrations는 변경하거나 실행하지 않는다.
G4 SQLite adapter의 권한 검사/Grant/User disable/Session revoke/합성 ShadowOutline CAS/Audit는 BEGIN IMMEDIATE로 직렬화하며 Version→CadLocation→Building→CadSite를 실제 DB 관계로 판정한다. 401/403 거부는 안전 Audit commit 후 반환, DB Busy/Audit 장애는 503 fail-closed/원복. last_seen 단조 touch도 같은 거래에서 수행한다. G4ShadowOutline은 테스트만을 위한 테이블이며 #98 운영 CadOutline이 아니다.
365일 cutoff와 자동 파기 권한은 별개. G1 AuditEvent DELETE trigger를 보존하며 물리 정리/백업본 삭제/복구 SOP는 #108/#109 승인 전 미실행. [Issue106](Issue106.md).


## Issue #105 G3 — 기존 격리 Session 모델 재사용 (2026-10-26)

**새 운영 Table/Column/Index/Prisma migration 없이** #103 G1 `User/AuthSession/Grant/AuditEvent`와 #104 recovery 계약을 사용한다. G1 Session의 must-change 계정 INSERT 거부, 8h·30m·3개·불변 tokenHash/issued/expires·단조 lastSeen 트리거를 유지한다. 초기 변경은 credential 재확인 거래로 passwordHash/must-change 갱신+전체 revoke+Audit 후 새 로그인하며 별도 provisional Session은 만들지 않는다.

G3 login은 `BEGIN IMMEDIATE`에서 검증에 사용한 현재 hash·ACTIVE·must-change 확인→슬롯 count→Session INSERT→LOGIN_SUCCESS Audit을 묶는다. logout revoke/Audit와 password change/revoke/Audit도 원자 처리한다. authenticate는 DB 현재 User/Role/Site/SpecialGrant를 조회하고 유효 수명 안에서만 lastSeen을 갱신한다. token 원문은 DB/Audit에 저장하지 않는다. 두 연결 경쟁과 hash 변경 경쟁·Audit 실패 rollback을 [Issue105](Issue105.md)의 TC004~009로 검증한다. G1 disable/G2 recovery가 G3 session을 전량 무효화해야 한다.

G3 fixture 전용 `G3LoginAttempt(key_hash TEXT PRIMARY KEY, count INTEGER CHECK 1..5, until_at INTEGER >=0)`를 추가한다. 서버 peer+정규화 계정 key의 SHA-256만 저장하고 `BEGIN IMMEDIATE`에서 5회/60초 예약·창 만료 갱신을 직렬화하며 성공 후 해당 key를 reset한다. 이미 commit한 로그인/암호 변경의 reset 정리 실패는 성공 응답을 취소하지 않고 남은 창의 60초 만료에 맡긴다. G1 AuthSession 존재 확인 후에만 이 테이블을 생성하며 운영 Prisma/DDL로 복사하지 않는다. 기존 G1 세션/계정 제약은 유지한다. 실 DB/CAD/S3 및 운영 `src/prisma/**`는 변경하지 않는다. 향후 운영 Schema 반영·실 데이터 복구·활성화는 #108/#109의 별도 수용 범위다.

## Issue #104 G2 — G1 일회용 인증 DB 활용/운영 DDL 변경 0 (2026-10-26)

- 신규 운영 Table/Index/Prisma Migration **없음**. 격리 `User`/`UserRoleGrant`/`AuthSession`/`AuditEvent`/`AdminRecoveryNonce` 및 G1 BEGIN IMMEDIATE·Unique·append-only trigger 재사용.
- 최초 빈 인증 DB에만 User UUID + Admin RoleGrant + `must_change_password=1` + `ADMIN_BOOTSTRAP` Audit(actor=null/affected=User ID) 원자 생성. 다른 User/이력 존재 시 자동 승격 금지, 재시작 UUID/Hash/Role 불변.
- 기존 ACTIVE Admin 복구는 nonce SHA-256 unique+불변, passwordHash/초기 변경·Session revoke·`ADMIN_RECOVERY` Audit(actor=null/affected=대상 UUID) 단일 transaction. 재사용·실패 rollback, nonce 원문/비밀번호 로그·DB 저장 없음.
- 운영 `src/prisma/schema.prisma`/migrations 및 CAD Version/Current/SHA/삭제 비밀번호, 실제 DB/CAD/S3 변경 0. 실 데이터 Migration/Restore는 #108/#109. [Issue104](Issue104.md).

## Issue #102 G0 — 익명 CAD Read와 인증된 Mutation·Audit 보존 계약 (2026-10-25)

- 기존 도면 목록·위치·Version·Current·Viewer·원본 GET/다운로드는 Owner 승인 **익명 사내망 조회**. **익명 조회를 위해 User/AuthSession/UserSiteGrant/가상 Reader 행을 생성하지 않는다**. 공개 GET에는 Site 단위 사용자 기밀성 제약을 적용할 수 없음을 명시한다. 신규 CadOutline/Memo/Type 및 로그·Audit 영속 GET에는 자동 상속 금지.
- `PUT Location.currentVersionId`는 로그인한 **Editor 또는 Admin + 해당 Location의 Site Grant** 및 서버 소유 Site/Version 연관 검증 필수. `DELETE CadFileVersion`은 같은 Actor/Grant 조건에 **기존 삭제 비밀번호 검증**을 더한 AND 조건. 삭제 비밀번호 단독/클라이언트 User·Role·Site claim은 인가 아님. Mutation 성공·거부와 Revision/Actor/Audit DB 원자성은 G1/G4/D3 후속에서 설계·시험.
- 기존 `POST /api/cad-files` 권한은 **Editor 이상 + 담당 Site**로 Owner 승인(G0-BIZ-06); G7 이전 운영 Schema/Route 미변경.
- Admin 단발 Bootstrap/Recovery/Nonce가 실제 사람 책임 대신 DB 초기화 재시도에 노출되어서는 안 된다. 운영 담당자 실행, Owner 책임(실명/Secret 경로 비공개); G2 #104 SOP와 원자성 필요.
- Audit Event는 **365일 내 append-only 유지** 및 만료 이후 정리 대상이라는 방향이 승인됐다. 만료 판정(UTC), purge 주기/방법·권한, 운영 Backup에 잔존한 만료 원장의 Restore 후 처리, 예외 보존 정책은 **#106/#108/#109 승인 전 미확정**이다. 이번 문서 변경은 Prisma DDL·Migration·DB Job/데이터·복구 적용 **0**.
- 정식 Schema 활성화와 공개 CAD API의 Auth 쓰기 전환은 G7의 별도 Owner 승인이 필요하며 DXF bytes/SHA, Current 0~1·Version FK, 기존 deletePassword 계약은 보존한다. [ADR-051-R1](Decisions.md), [Issue102](Issue102.md).


## Issue #103 P1 교정 — 감사 대상 사용자·Site 영구 추적 (2026-10-26)

- PR #116 리뷰 [r4371167619](https://github.com/planner77/layoutManager/pull/116#discussion_r4371167619)에 따라 테스트 전용 `AuditEvent`에 `affected_user_id TEXT NULL`(User FK)와 `site_id TEXT NULL`(CadSite FK), `ix_g1_audit_affected_site_time` 색인 추가. `SITE_GRANTED`·`SITE_REVOKED`는 **두 컬럼 모두 필수**로 검사하며 다른 action은 `site_id IS NULL`을 요구한다.
- `actor_user_id`는 관리자, `affected_user_id`는 실제 권한 변경 대상 사용자, `site_id`는 대상 Site의 DB 식별자. 복합 문자열을 `target_id`에만 넣어두지 않는다. UserSiteGrant가 DELETE되어도 append-only Audit에는 누가 어느 Site에서 변경되었는지가 남는다. 이 변경은 독립 `src/tests/fixtures/auth-g1/{migration.sql,schema.prisma,store.ts}`에만 있으며 운영 Prisma/DDL 적용 **0**.



## #103 / #102 최신 Owner 업무 정책 연결 (2026-10-25)

#102 Owner는 기존 CAD GET 익명 조회 유지, Current=Editor/Admin+Site, Delete=Editor/Admin+Site+기존 삭제 비밀번호, Admin 초기/복구 담당자, Audit 365일 경과 이력 정리 원칙을 승인했다([PR #114](https://github.com/planner77/layoutManager/pull/114), 병합 미확인). 이 결정은 G1 User/SiteGrant DB 제약 자체를 바꾸지 않으며 G1의 `cad:read` 권한 테스트를 기존 익명 GET API로 연결하지 않는다. **Audit 물리 파기·백업 복원시 재출현 방지 SOP는 여전히 PENDING**으로 Fixture append-only/nonce 불변 정책을 유지한다.


## Issue #103 G1 — 격리 User/Session/Grant/Audit 물리 계약 (운영 DDL OFF, 2026-10-25)

적용 대상은 **기존 CAD 6개 SQL Migration을 실행한 일회용 DB 사본**뿐이다. `src/tests/fixtures/auth-g1/migration.sql`에 다음 7개 테이블의 실행형 SQL과 FK/Unique/CHECK/트리거를 명시했고, `schema.prisma`는 **검토용 독립 투영**(기존 CadSite의 id/관계만 표현)이다. 기존 `src/prisma/schema.prisma` 및 `src/prisma/migrations/**`는 수정·자동 적용하지 않음.

| 모델 / FK | 최소 무결성 계약 |
| --- | --- |
| `User` | 불변 PK id, normalized lowercase login_name unique(NOCASE/ASCII), password_hash, ACTIVE/DISABLED, must_change_password, UTC ms 시간. 비밀번호 원문 없음 |
| `AuthSession` → User | hash(토큰) unique, issued/lastSeen/expires/revoked 정수 UTC ms, expires=issued+8h, idle 30m, 3개 active 트리거/lock, clock rollback·reanimate 거부 |
| `UserRoleGrant` → User | 복합 PK(user, Reader/Editor/Admin), grant actor FK, 삭제시 다른 테이블의 referential history 보존 |
| `UserSiteGrant` → User/CadSite | 복합 PK(user,site), 기존 물리 CadSite FK; Version→CadLocation→Building→CadSite join으로 실제 소속 확인 |
| `SpecialGrant` → User | 복합 PK(user, permission); `audit:read`와 `logs:read` 별개, Admin role과 함께 검사 |
| `AuditEvent` → User? | 안전 actor/action/target/revision/outcome/requestId/UTC만; UPDATE/DELETE 트리거 차단; 365일 이후 실제 파기는 보류 |
| `AdminRecoveryNonce` → User | nonce_hash 64자리 sha256 PK, 원문 미저장; INSERT 후 UPDATE/DELETE 불가, 중복 복구 rollback |

세션 후보 생성 후 `BEGIN IMMEDIATE`에서 사용자 상태·active count와 DB 제약을 검사하고 INSERT를 원자 수행. Role/Site/Special 변경과 Audit, Disable+전체 Session revoke+Audit, nonce 해시 INSERT+비밀번호 변경+revoke+Audit는 같은 SQLite Transaction. 계정 비활성 시 대상 Session을 전량 revoke하며 실패 주입 시 이전 상태로 rollback. `AuditEvent`에는 Raw Token·Secret·CAD Geometry 등을 담을 열 자체를 만들지 않음.

기존 Version, Current, SHA, delete_password_hash 및 계층 5단계의 실제 컬럼 값을 전후 스냅샷으로 비교하고 `PRAGMA foreign_key_check`를 수행한다. SQL fixture의 기존 CadSite FK가 실패하거나 DDL 재실행하면 fail-closed. SQLite `NOCASE`는 완전한 Unicode case-fold가 아니므로 G2에서 계정명 정규화 계약 유지. `schema.prisma` 투영으로 운영 Migration을 생성/적용하는 것은 명시적 금지. 참조 [Issue103](Issue103.md), [ADR-051-G1](Decisions.md), [TestPlan](TestPlan.md).


## Issue #102 G0 / ADR-051-R1 — DB 계약 유지 (2026-10-25)

Owner는 외부 공개망 인바운드가 제한된 내부 사용자용 환경에서 **공격·탈취 대응 강화는 비범위**로 선택했다([Issue102](Issue102.md)). **DB 구조·원자성·FK/Unique/Grant/Audit/Session 수명·Admin RecoveryNonce 1회·365일 감사/정상 권한 허용/거부 및 DB/CAD/S3 백업/복구는 그대로 필수**다. 이는 해킹·탈취 방어의 보안시험이 아니라 업무 및 데이터 정합성 요구다. 추가 사내 CIDR/Host 공격 테스트는 DB G1/G6 선행 게이트가 아님. 신규 운영 Schema/Prisma Migration 적용은 여전히 G7 별도 Owner 승인 전 금지.


## Issue #96 — D1~D6 승인값 / 물리 DB 비활성 (2026-10-25)

- D1 최초 Admin/복구 .env + Secret 파일 단발 정책, D2 비밀번호 최소 8자/scrypt local-v1/강제 초기변경, D3 절대 8시간·idle 30분·동시 세션 3개, D4 명시적 Site Grant/Admin 전용 권한관리, D5 감사 365일/별도 audit:read, D6 LAN 접근제한+HTTP 위험 수용 원칙 승인. ADR-051이 기존 D0 미결정 표기보다 우선한다.
- 개념 User/AuthSession/UserRoleGrant/UserSiteGrant/AuditEvent 표와 FK 설계는 유지하며 **src/prisma/schema.prisma, src/prisma/migrations에 이번 변경 없음**. Session token은 해시만 저장하고 4번째 발급은 미래 DB 원자 count+insert로 거부. 단발 복구 nonce는 DB CAS/불변 이력으로 재사용 차단해야 한다. 실제 append-only/365일 Audit 조회·파기 정책 및 Version FK 구현은 차후 승인 대상.
- 원본 CAD/Version/Current/SHA·기존 CAD 삭제 비밀번호는 불변. 복제 DB 백업→Migration dry-run/foreign_key_check→복원, CIDR·권한 E2E 및 별도 Owner 배포 승인 없이는 새 Schema/API **OFF**. [Issue96](Issue96.md).



## Issue #97 / P4-D2 — 원본/Transform 서버 검증은 DB 변경이 아님 (2026-10-25)

- 새 `src/server/outline/transform-attestation.ts`가 서버 보유 immutable DXF bytes Version/SHA → Stable Root Handle·WCS Canonical baseGeometry/algorithmVersion·tolerance 0.02 → 명시적 Translate/Rotate → **서버 계산 effectiveGeometry**를 검증해 반환한다. 전역 `OutlineType` FK/활성 여부·영속 UUID는 여기서 판정하지 않는다.
- **Prisma `schema.prisma`/migration/데이터 모델/Current/Version/SHA/Source bytes를 수정하지 않는다.** D1 #96 인증·Role/Scope/Audit 및 D3 #98 `CadOutline` CRUD/revision CAS(409)/soft-delete/Memo reconcile/Version FK/Backup 시험 없이는 이 결과를 저장할 수 없다. 기존 D0 개념 Schema 제안을 실제 DB에 적용했다고 해석 금지.
- 구현·차단·후속 판정은 [Issue97](Issue97.md), [ADR-050](Decisions.md), [TestPlan](TestPlan.md) 참조.

## Issue #31 P4 D0 Owner 승인 설계안 — **DDL 미적용** (2026-10-25)

**우선순위:** 최신 Owner [ADR-048/049](Decisions.md) 승인 정책이 아래 과거 #41/#42의 OIDC/Scope-key 미결정 예시보다 우선한다. 이는 **개념 모델**, 배포된 `schema.prisma`/migration이 아니다. 신규 DB/CRUD 활성화는 별도 구현·검증 승인 전 BLOCKED.

| 제안 Model/Column | D0 계약 (물리형식·세부값은 후속 migration ADR) |
| --- | --- |
| `User(id PK, loginName unique, passwordHash, displayName, status, createdAt, updatedAt)` | 로컬 계정, 불변 ID가 감사 주체. 초기 Admin 발급·비밀번호/회수 정책 미확정 |
| `AuthSession(id/tokenHash PK, userId FK, expiresAt, revokedAt?, createdAt)` | 서버 소유 난수 세션; 원시 토큰 DB/감사 로그 기록 금지, HTTP-only cookie + SameSite. 일반 HTTP 서버 IP에서 Secure 쿠키 동작을 주장하지 않음. TTL/동시 로그인 미확정 |
| `UserRoleGrant(userId, role)` / `UserSiteGrant(userId, siteId, permissions?)` | Reader/Editor/Admin 및 담당 Site Scope; Version의 실제 Site 관계 서버 검증, 무범위 기본 거부. 실제 Grant/Unique 구조·관리자 범위는 D1에서 구체화 |
| `OutlineType(id, name, nameKey, description?, active, sortOrder, revision, ...)` | **단일 Global Catalogue**. Site/사업부별 Scope Key로 분리하지 않음. `nameKey`는 전체 앱 고유성, Unicode/NFC case-fold 규칙 및 DB index 검증 이후 확정. 관리 Admin만 허용, 참조 타입 물리 삭제 금지 |
| `CadOutline(id UUID, versionId FK, sourceSha256, kind, outlineTypeId FK?, name, sourceEntityRefs, algorithmName/Version, canonicalBaseGeometry, transform, revision, status, createdById, updatedById, createdAt, updatedAt, deletedAt?, deletedById?)` | GENERATED 서버 발급 ID; Source immutable bytes+SHA+stable Handle/instancePath 검증. `kind`=CONVEX/PRECISE이며 `outlineTypeId` 업무 분류와 독립. Geometry WCS XY, Translate/Rotate 강체 affine만 허용. 서버가 결과 Geometry 계산, 필요하면 파생 캐시로만 보관. `status=ACTIVE|DELETED` 논리 삭제; CAS `expectedRevision` / 409 |
| `AuditEvent(id, actorUserId?, action, targetKind/Id, siteId, versionId, beforeRevision, afterRevision, outcome, requestId, timestampUtc, safeMetadata)` | Create/Edit/SoftDelete/Grant 및 거부 이벤트, append-only. 원본 도면·비밀번호·세션·전체 Geometry 기록 금지; 보존 기간·읽기 권한·물리 삭제 미확정 |
| `CadMemo(...anchorStatus, targetOrigin, targetId?, lastResolvedWcsXY, revision...)` | #83/#84 담당. 영속 GENERATED target 삭제 시 동일 트랜잭션으로 `BROKEN_ANCHOR`+마지막 WCS 저장+연결 해제, 메모 행은 유지; 실제 FK/트랜잭션·Version 삭제 정책 후속 확정 |

- `CadOutline.visible` 공유 필드는 **추가하지 않음**. 외곽선 개별/그룹 Show/Hide는 각 사용자 **세션 상태**이고 Catalog·다른 Editor 데이터/Revision을 갱신하지 않는다. Reload/다중 탭 지속 정책은 미정.
- 글로벌 업무 타입도 사용자의 도면 Version/Site Read/Edit 권한을 확대하지 않는다. Editor는 할당된 Site/Version Scope 내에서 공동 편집하되 최초 작성자·source SHA/Version은 불변; 메모 Editor 권한은 승인된 것으로 확대 해석 금지.
- SOURCE 참조는 `{versionId, sourceSha256, handle, instancePath?}`, GENERATED는 서버 영속 UUID와 Origin. 클라이언트 local-N/UUID를 신뢰되는 DB ID로 취급하거나 다른 Version으로 자동 재연결 금지.
- API는 `/api/cad-files/[versionId]/outlines[/id]`를 후속 제안으로만 유지. 모든 읽기/쓰기에서 Session→Role/Scope→Version/SHA→서버 canonical/Transform 검증→revision CAS→DB/Audit atomicity. 인증 없는 미승인 신규 GET/POST/PATCH/DELETE를 만들지 않는다.
- **보류:** Version 물리 삭제와 논리 삭제 객체·감사/메모 FK 처리, Audit retention/복원·파기, Session TTL/계정 초기화, legacy typed v1/v2 이관, HTTP LAN 접근 범위. 백업→격리 migration dry-run→FK/변경 불변/복구 시험 승인 전 DDL 적용 금지.


## Issue #42 / v0.35.0 — 영속 Schema 변경 없음 (U5 safe contract)

- `outlineTypeId/outlineTypeName/name`은 **브라우저 `SavedOutline` DTO 및 선택적인 v2 다운로드 JSON 메타데이터**일 뿐, Prisma Column/FK/DDL/마이그레이션에 추가하지 않았다.
- #65 실제 `OutlineType` table/Scope/Unique/Revision 및 #31 `CadOutline` P4는 미승인 상태. `outlineTypeId`를 DB FK로 추가하거나 브라우저 JSON을 그대로 저장하면 안 된다. 서버 authoritative file SHA/Version/Handle/Geometry 검증, RBAC/Scope/CAS/Audit 승인 후 별도 Migration 설계 필요. [Issue42](Issue42.md).


## Issue #41 / v0.34.0 — OutlineType 영속 Schema는 미승인 (DDL 없음)

- 이번 단계는 **schema.prisma와 migration 변경 없음**. `/lab/outline-types`의 목록은 React state만 사용; 신규 DB 테이블, 임의 사용자, 서버 CRUD, FK 없음. 원본 CadFileVersion/CadLocation 및 #31 CadOutline 제안 불변.
- **승인 후 제안:** `OutlineType(id UUID PK, scope_key <미결정>, name NFC, name_key NFC+lowercase, description?, active BOOL, sort_order INT, revision INT, created_at UTC, updated_at UTC)` 및 scope별 Unique(name_key), CHECK/Index. `name_key`의 case folding/Unicode DB 구현, NULL scope와 key 구성은 Owner 결정 및 SQLite 실제 충돌 검증 뒤 확정. 조회 Scope 누락 시 기본 거부.
- 추후 `CadOutline.type_id`는 OutlineType.id FK를 참조하고 이름변경/비활성 뒤에도 보존; 타입 물리 DELETE 미제공. `revision` CAS UPDATE(expectedRevision)→409, 트랜잭션 FK/Unique와 감사 event(행위, actor, scope, result, timestamp, revision)를 원자적으로 기록.
- 기존 백업·복제 dry run→migration→foreign_key_check→복구 검증 및 IdP/CSRF/RBAC(Reader/Editor/Admin)/Audit 보존 승인 없이는 DDL·쓰기 API 시행 금지. [Issue41](Issue41.md) / ADR-037.


## Issue #31 v0.28.3 — CadOutline 미배포 상태와 정합성 사전 게이트

- 이번 브랜치는 **Prisma schema, Migration, 기존 DB, 원본 DXF, Storage locator를 수정하지 않는다**. 기존 P4 제안 Schema는 계속 *미승인*이다.
- 저장 로직 구현 선행 조건: 검증 가능한 IdP(OIDC issuer/audience/JWKS) 또는 별도 로컬 로그인/HttpOnly 세션 정책, Reader/Editor/Admin Roles와 Site·Version scope, 운영 관리자·감사 기록 보존 기간 확정. 임의 HTTP 헤더/삭제 비밀번호/공유 토큰만으로 쓰기 허용 금지.
- 코드의 `server/outline/attestation.ts`는 향후 저장 시 서버가 `CadFileVersion.id/sha256`와 immutable Source bytes 일치를 확인하고 stable Handle을 재파싱·Polygon을 재계산하여 Client 좌표 위·변조를 거부하는 **쓰기 기능이 없는** 보조 계약이다.
- 권한 승인 이후 기존 제안 CadOutline FK/Revision 및 Version 삭제 정합성(ON DELETE 정책), 감사·복구·백업 dry run, 영구 overlay load/update/delete API를 구현해야 실제 P4 완료라고 평가할 수 있다.


## Issue #31 P4 — 영구 저장 Schema 제안 (DDL / Migration 미적용)

**이 절은 제안이며 배포 DB schema가 아닙니다.** 사용자/Owner가 인증·인가 수단, 역할 및 Scope, 감사 보존 기간을 결정하기 전 새 Table·Route·Migration을 적용하지 않는다.

| 제안 필드 | 정책·DB 정합성 |
| --- | --- |
| `CadOutline.id` | 서버 생성 UUID PK, Browser 임시 ID 별개 |
| `versionId` + `sourceSha256` | `CadFileVersion`에 버전·원본 Hash 동시 귀속, 복합 FK/unique anchor 검증. Current 교체·새 Version에 자동 재바인딩 금지 |
| `name`, `kind`, `algorithm` | 이름 정규화·길이 제한, CONVEX/PRECISE 및 허용 Algorithm만 |
| `sourceEntities`, `geometry`, `parameters` | JSON; **server-owned DXF에서 Handle/WCS canonical Geometry를 재계산**하여 client-supplied JSON과 대조. 좌표·polygon 수와 요청 body 상한 |
| `revision`, `createdAt`, `updatedAt` | revision >=1, CAS UPDATE (id+expected revision) / 409 동시 변경. 시간 UTC |
| `createdBy`, `updatedBy` | 인증된 사용자 ID 기반 변경자 감사 (원본 경로·패스워드·RAW geometry 로깅 금지) |
| Version 삭제 | Version DELETE transaction 내 outline 연쇄삭제/이력 보존 정책 중 선택. 현재 원본 삭제 구조의 승인·Storage cleanup 안전성 유지 |

제안 Route: `GET/POST /api/cad-files/[versionId]/outlines` 및 `PATCH/DELETE /.../outlines/[id]` (현재 **미구현**). POST/PATCH/DELETE는 서명 검증된 JWT나 안전한 앱 세션, RBAC/Version scope, CSRF/Origin, validation/recompute, FK/409/413를 갖춘 뒤 개방. 삭제용 비밀번호/클라이언트 임의 헤더를 외곽선 편집 권한으로 재사용 금지.

운영 Migration 게이트: 같은 시점 DB/CAD local·S3 백업→격리 복제 DB dry run→fk_check/Version·Current·hash/행 수 검증→단일 app stop/migrate/start→오류 시 동일 시점 백업 복원. 실제 데이터·Schema 변경은 Owner 승인 후 별도 구현·시험.



상태: 2026-10-15 Issue #24 구현. Prisma/Client/SQLite adapter 7.10.0과 실제 migration이 존재한다. 현재 단일 기준은 아래 `0.25.0 기준정보 계층` 절, `src/prisma/schema.prisma`, `202610150001_master_hierarchy`이며 그 이전 네 문자열 CadLocation 표와 그림은 migration 전 역사 기록이다.

## GitHub #6 — 0.19.0 추가 schema

- `CadFileVersion.drawingName` → `drawing_name TEXT NULL`, 기본 NULL. 사용자 지정 이름만 저장하며 NULL은 위치 및 실제 version으로 만든 기본 표시 이름을 뜻한다. 기존 행은 NULL로 유지하고 원본 파일명 등 모든 기존 Column을 수정하지 않는다.
- additive migration `202609110003_drawing_name`에서 nullable column을 추가한다. 이름 정규화/255 UTF-16 길이/제어문자 검증은 Domain 경로에서 강제한다. 이름은 경로·Unique key가 아니며 기존 FK·Index·Current/순번 제약을 보존한다.
- 기존 등록 후 metadata 편집 제외 계약은 유지한다. migration 파일과 실제 검증 결과는 구현·QA 후 갱신한다.

## 관계

### Unit DELETE 추가 schema — 0.17.0 도입 / 0.17.1 제약 보완

아래 정의가 이 Unit의 schema 기준이다. `202609110001_delete_password`는 필드·삭제 작업과 기존 순번 초기화를, `202609110002_delete_invariants`는 삭제 locator Unique와 양수 순번 trigger를 추가한다. 실제 적용·검증 결과는 TestReport를 기준으로 한다. 아래 기존 표/그림은 0.16.0 상태이며 새로운 Column/Table은 이 절과 함께 읽는다.

| 모델 / Column | 타입·Null·초기값 | 계약 |
| --- | --- | --- |
| CadFileVersion.delete_password_hash (`deletePasswordHash`) | TEXT/String?, migration 기존 행은 NULL | 서버 전용 scrypt encoding. SQL default 비밀번호/hash 없음. backfill 완료 후 모든 활성 행 non-null; 신규 INSERT의 NULL/빈 hash는 DB trigger로 거부하며 기존 hash를 NULL/빈 값으로 돌리는 UPDATE도 거부. 공개 DTO에서 제외. |
| CadLocation.next_version (`nextVersion`) | INTEGER/Int NOT NULL DEFAULT 1, INSERT/UPDATE trigger로 > 0 강제 | migration에서 Location별 기존 MAX(version)+1로 채움. 등록 transaction이 이 값을 순번으로 사용하고 1 증가시킴. 삭제 시 감소하지 않음. 기존 `(location_id,version)` Unique 유지. |
| CadDeletionJob.id | TEXT/String PK | 삭제 작업 자체의 랜덤 UUID. 삭제된 Version을 참조하는 FK는 두지 않음. |
| CadDeletionJob.version_id (`versionId`) | TEXT/String NOT NULL | 삭제 승인된 Version UUID. 대상 행 삭제 뒤에도 작업 식별을 위해 보존한다. |
| CadDeletionJob.storage_path (`storagePath`) | TEXT/String NOT NULL UNIQUE | 승인된 삭제 대상 locator. 원본 정리 성공 때까지 보존하며 새 경로를 입력받지 않음. |
| CadDeletionJob.created_at (`createdAt`) | DATETIME/DateTime NOT NULL DEFAULT now | 삭제 승인 transaction 시각. 완료 job은 제거하고 원본 이름·설명·비밀번호/hash를 job에 복사하지 않음. |

삭제 transaction은 Current가 대상을 가리킬 때 먼저 NULL로 해제하고 job INSERT→Version DELETE를 같은 transaction에서 수행한다. 기존 Current 소속 복합 FK, Location 소유 FK 및 Unique/CHECK를 그대로 유지한다. 마지막 Version이 삭제된 Location은 유지되며 nextVersion으로 과거 순번을 재사용하지 않는다.

Migration/backfill은 쓰기 중지·백업 후 진행한다. additive SQL로 위 필드/Table/trigger와 nextVersion 초기화→Node backfill이 NULL hash 행 각각에 독립 랜덤 salt로 `1234` hash 계산→조건부 NULL 행 UPDATE→NULL 수 0/foreign_key_check/기존 Current·행 수·원본 식별 일치 검증 순서다. hash 계산은 짧은 DB 쓰기 transaction 밖에서 순차 처리한다. 중단 후 재실행은 남은 NULL만 처리한다. 이미 hash가 있는 신규/기존 행은 변경하지 않는다. 실행 중인 0.16.0 앱과 병행하지 않으며 migration 후 구버전만 재시작하지 않는다.

backfill은 `db:deploy`의 완료 조건으로 묶고 실패 시 Docker/start readiness를 열지 않는다. SQL만 적용하는 별도 경로를 사용했다면 backfill 검증 전 서비스 재개를 금지한다. 신규 INSERT trigger는 실수로 구버전이 hash 없이 작성하는 것을 차단한다. hash encoding의 유효성은 server 검증과 시험으로 확인하며 SQL이 scrypt 계산을 검증하지는 않는다.

```mermaid
erDiagram
    CadLocation ||--o{ CadFileVersion : owns
    CadLocation o|--o| CadFileVersion : current_pointer
    CadLocation {
        TEXT id PK
        TEXT business_unit UK
        TEXT site UK
        TEXT building UK
        TEXT floor UK
        TEXT current_version_id FK
        DATETIME created_at
        DATETIME updated_at
    }
    CadFileVersion {
        TEXT id PK
        TEXT location_id FK
        INTEGER version
        TEXT original_filename
        TEXT description
        TEXT file_format
        INTEGER file_size
        TEXT sha256
        TEXT storage_path
        TEXT registered_at
        DATETIME created_at
        DATETIME updated_at
    }
```

그림의 네 위치 UK는 각각 Unique가 아니라 **네 Column 조합 Unique**이다. 소유 관계는 1:N, Current는 Location당 선택적 단일 참조이고 해당 Location이 소유한 Version만 가리킨다. 독립 `is_current` Column은 만들지 않고 API/UI에서 pointer 비교로 계산한다.

## CadLocation

| Column | SQLite / Prisma 타입 | Null | Default/생성 주체 | 제약·의미 |
| --- | --- | --- | --- | --- |
| id | TEXT / String | 불가 | Service UUID | PK; 문자열 위치 결합값 아님 |
| business_unit | TEXT / String | 불가 | 없음 | 정규화된 사업부, 1–100자 |
| site | TEXT / String | 불가 | 없음 | 사업장, 1–100자 |
| building | TEXT / String | 불가 | 없음 | 동, 1–100자 |
| floor | TEXT / String | 불가 | 없음 | 층, 1–100자 |
| current_version_id | TEXT / String? | 허용 | NULL | 아래 복합 FK; 최대 하나 Current |
| created_at | DATETIME / DateTime | 불가 | UTC now | 생성 시각, migration에서 CURRENT_TIMESTAMP 기본값 |
| updated_at | DATETIME / DateTime | 불가 | 생성 시 UTC now | Current 변경 등 update 시 Service가 UTC 갱신; DB가 자동 갱신한다고 가정하지 않음 |

Unique: `(business_unit, site, building, floor)` BINARY 비교. 저장 전 trim+NFC, 대소문자/내부 공백 유지. DB CHECK로 길이/빈 문자열/앞뒤 ASCII 공백을 제한하고 NFC는 Service와 import 경로에서 보장한다. 임의 SQL이 Unicode 정규화를 수행한다고 가정하지 않는다.

## CadFileVersion

| Column | SQLite / Prisma 타입 | Null | Default/생성 주체 | 제약·의미 |
| --- | --- | --- | --- | --- |
| id | TEXT / String | 불가 | Service UUID | PK |
| location_id | TEXT / String | 불가 | Service | FK→CadLocation.id |
| version | INTEGER / Int | 불가 | transaction 내 다음 정수 | CHECK > 0; Location별 1부터; UI는 V 접두어 |
| original_filename | TEXT / String | 불가 | Upload basename metadata | 1–255자; 경로로 사용 금지, 제어문자 거부 |
| description | TEXT / String | 불가 | `''` | Version별 도면 설명. 생략 시 빈 문자열, 최대 2,000 UTF-16 code units, 저장 전 trim/NFC·개행 정규화 |
| file_format | TEXT / String | 불가 | 검증된 확장자 | CHECK IN ('DXF','DWG'); enum 사용 여부는 ORM 검증 후 |
| file_size | INTEGER / Int | 불가 | 실제 받은 bytes | CHECK > 0; 기본 상한은 앱 설정, Prisma Int 범위 내 설정만 허용 |
| sha256 | TEXT / String | 불가 | server streaming hash | 소문자 hex 64자 CHECK, Unique 아님 |
| storage_path | TEXT / String | 불가 | Storage key 생성 | Unique; local 상대 키 또는 S3 locator. 아래 Unit S3 정의 참조, client 경로 아님 |
| registered_at | TEXT / String | 불가 | 사용자 날짜, 기본 서울 오늘 | YYYY-MM-DD 달력 날짜; Service에서 실제 유효 날짜 검증 |
| created_at | DATETIME / DateTime | 불가 | UTC now | 생성 시각, migration CURRENT_TIMESTAMP 기본값 |
| updated_at | DATETIME / DateTime | 불가 | 생성 시 UTC now | update 경로에서 명시적으로 갱신 |

파일 bytes, location_id, version, storage_path는 등록 후 변경 불가인 서비스 계약이다. 파일 삭제는 초기 범위에서 제외했으나 Unit DELETE로 선택 Version 삭제를 추가한다. 버전 이동/metadata 편집 API는 범위에 없다. registered_at은 시각과 혼동하지 않도록 날짜 문자열로 유지한다.

## FK·Unique·Index

| 종류 / 이름(개념명 포함) | Column / 대상 | 목적 |
| --- | --- | --- |
| PK Location / Version | 각 id | 내부 식별자 |
| uq_location_key | Location(사업부,사업장,동,층) | 위치 중복 차단 |
| uq_location_current_owner | Location(id,current_version_id) | Prisma의 선택적 1:1 Current relation 표현 |
| uq_version_sequence | Version(location_id, version) | 동시 순번 중복 차단 |
| uq_version_owner_id | Version(location_id, id) | Current 복합 FK의 parent candidate key |
| uq_storage_path | Version(storage_path) | 파일 overwrite 방지 |
| fk_version_location | Version.location_id→Location.id | 존재하는 Location만 참조, DELETE/UPDATE NO ACTION |
| fk_location_current_owner | Location(id,current_version_id)→Version(location_id,id) | Current 소속 일치, DELETE/UPDATE NO ACTION |
| ix_location_current | Location(current_version_id) | pointer 역조회 |
| ix_version_registered | Version(registered_at DESC, created_at DESC, id) | 기본 목록 정렬 |
| ix_version_format_registered | Version(file_format, registered_at DESC) | 형식 filter |
| ix_version_sha256 | Version(sha256) | 중복 식별 |

위치별 Version 조회는 uq_version_sequence prefix를 활용한다. 임의 조합 위치 filter나 filename substring은 작은 SQLite P.O.C.의 scan을 허용하며 근거 없이 모든 column에 index를 추가하지 않는다.

Current FK 설계의 핵심 SQL 형태는 다음과 같다. **문서 예시이며 실행된 Migration이 아니다.**

```sql
-- CadFileVersion 제약
UNIQUE (location_id, version),
UNIQUE (location_id, id),
FOREIGN KEY (location_id) REFERENCES CadLocation(id)
  ON DELETE NO ACTION ON UPDATE NO ACTION

-- CadLocation 제약
UNIQUE (business_unit, site, building, floor),
FOREIGN KEY (id, current_version_id)
  REFERENCES CadFileVersion(location_id, id)
  ON DELETE NO ACTION ON UPDATE NO ACTION
```

`current_version_id`가 NULL이면 Current가 없는 상태를 허용한다. 값이 있으면 복합 FK가 자기 Location의 Version만 허용한다. 모든 DB connection에서 `PRAGMA foreign_keys=ON`을 확인해야 한다. 복합 FK는 parent key Unique가 필요하며 NULL을 포함하는 child key의 동작은 SQLite 공식 문서에 따른다. [SQLite Foreign Key Support](https://www.sqlite.org/foreignkeys.html)

## Transaction과 동시성

1. 신규 Location은 Current=NULL로 생성한다.
2. Version 생성 transaction에서 해당 Location의 MAX(version)+1을 계산하고 insert한다. Unique와 SQLite 쓰기 직렬화를 함께 사용하고 busy/충돌은 명시적 오류로 처리하고 commit 불확실 작업은 자동 재실행하지 않는다. transaction 밖에서 순번을 미리 확정하지 않는다.
3. `makeCurrent=true`이면 같은 transaction에서 Location.current_version_id를 새 Version ID로 바꾼다. false이면 pointer를 건드리지 않는다. 기존 Version flag를 별도로 update하지 않는다.
4. 기존 Version Current 변경은 Location/Version 존재·소속을 확인하고 단일 transaction으로 pointer와 updated_at을 갱신한다. 동일 ID 재요청은 멱등이다. 동시 유효 요청은 마지막 commit이 Current가 된다.
5. 예외 시 전체 rollback한다. FK는 API를 우회한 직접 SQL에서도 소속 위반을 거부해야 한다. 물리 파일과 DB의 실패 보상은 Architecture를 따른다.

Current 0개 허용, 다른 Location의 Current 독립, 잘못된 소속/존재하지 않는 Version/Current가 가리키는 Version 삭제 차단, 경쟁·rollback을 자동 시험한다.

## Migration 초기 계획 (당시 기록)

- Unit 0B에서 Prisma/SQLite driver 연결·정확한 버전·설정 로더를 검증하고 Unit 1에서 두 Table과 constraint를 구현한다.
- Prisma relation에서 소유 FK와 복합 Current FK의 겹치는 scalar 및 순환 relation을 검증한다. 선언만으로 불충분한 CHECK/복합 FK는 **검토 가능한 migration SQL**로 유지한다. Schema 대조 테스트로 누락을 방지한다.
- migration은 `src/prisma/migrations/`에 보관한다. 신규/기존 임시 DB 모두에 적용하고 `foreign_key_check`, table/index/FK introspection, 관련 DB 테스트로 Database.md와 대조한다.
- 기존 데이터를 변경할 때 사전 백업과 영향 분석을 한다. 운영에서는 검토된 migrate deploy 계열만 사용하고 reset/db push를 자동 실행하지 않는다. 실행 가능한 명령은 Unit 0B/1 완료 때 Operation에 확정한다.
- Prisma+SQLite에서 계획 제약을 표현/유지하지 못하면 실패 근거를 기록한다. ORM/DBMS 대체처럼 구조 영향이 큰 변경은 사용자와 확인한다.
- SQLite WAL/busy timeout은 driver 실제 지원과 concurrency 시험 후 설정하고 값을 문서화한다. 아직 활성화됐다고 보고하지 않는다.

## Schema 변경 이력

## 0.25.0 기준정보 계층 (schema 단일 기준)

`BusinessUnit(id, name, active) → Product(id, business_unit_id, name, is_unclassified, active) → CadSite(id, product_id, name, kind, active) → Building(id, site_id, name, active) → CadLocation(id, building_id, name, active)` 순서다. 각 이름은 1~100자 trim/NFC이며 부모+이름 Unique다. `CadSite.kind`는 `SITE|LEGAL_ENTITY`, 각 사업부의 `is_unclassified=1` Product는 최대 하나다. 일반 편집은 ID, 부모 FK, 미분류 표식을 바꾸지 않으며 미분류 제품 이름도 변경하지 않는다.

| Table | 핵심 필드와 기본값 | Unique / FK / 시각 |
| --- | --- | --- |
| BusinessUnit | `id TEXT PK`, `name TEXT`, `active INTEGER DEFAULT 1` | `name` Unique; `created_at`, `updated_at`은 `CURRENT_TIMESTAMP` 기본 |
| Product | `business_unit_id`, `name`, `is_unclassified INTEGER DEFAULT 0`, `active DEFAULT 1` | `(business_unit_id,name)` Unique, BU FK; `is_unclassified=1`은 사업부별 partial Unique; 두 timestamp 기본 |
| CadSite | `product_id`, `name`, `kind TEXT DEFAULT 'SITE'`, `active DEFAULT 1` | `(product_id,name)` Unique, Product FK, kind CHECK; 두 timestamp 기본 |
| Building | `site_id`, `name`, `active DEFAULT 1` | `(site_id,name)` Unique, CadSite FK; 두 timestamp 기본 |
| CadLocation | `building_id`, `name`, `active DEFAULT 1`, `current_version_id NULL`, `next_version DEFAULT 1` | `(building_id,name)` Unique, Building FK, Current 소유 복합 FK; 기존 `created_at`,`updated_at` 보존 |

CadLocation은 기존 UUID를 층 ID로 그대로 사용한다. `current_version_id`, `next_version`, timestamps와 CadFileVersion의 모든 열은 보존한다. `(location_id, version)` 및 `(location_id, id)` Unique와 `(CadLocation.id,current_version_id) → CadFileVersion(location_id,id)` 복합 FK가 층별 Current 소속을 강제한다. 신규 등록은 다섯 ID가 실제 같은 활성 chain인지 transaction 안에서 재검증한다.

`202610150001_master_hierarchy`는 FK를 잠시 끄고 즉시 transaction을 시작해 master dedup/backfill과 CadLocation 재구성을 원자 작업으로 수행한다. 복사 행 수/NULL 연결 guard와 `pragma_foreign_key_check` guard가 실패하면 commit하지 않는다. migration 후 이전 문자열 열이 없으므로 0.24 이하 이미지는 새 schema에 연결할 수 없다.

| 날짜 | 단계 | 변경 | Migration / 검증 |
| --- | --- | --- | --- |
| 2026-09-07 | 설계 초안 | Location/Version, 소속 검증 복합 Current FK, 순번/파일 식별/날짜 정의 | 없음 / 구현 전 |
| 2026-09-07 | 0.2.0 / Unit 1 | 두 모델·복합 Current FK·Unique/Index·위치/크기/형식/hash CHECK 구현 | 202609070001_locations / DB integration 6개 통과 |
| 2026-09-09 | 0.14.0 / Unit DESC | Version 설명 TEXT NOT NULL DEFAULT '', 기존 행 호환, description literal 검색 | 202609090001_description / 관련 Unit·E2E 검증 |
| 2026-10-15 | 0.25.0 / Issue #24 | 5단계 master, Product 미분류 표식, Location 층 ID 보존·master FK 전환 | 202610150001_master_hierarchy / TC-MASTER-001~007 |

실제 연결은 adapter의 FK 활성화를 PRAGMA 시험으로 확인했다. 쓰기는 단일 프로세스 queue로 직렬화하며 SQLite busy timeout 5초, transaction timeout 10초이다. commit 결과가 불확실한 작업을 자동 재실행하지 않는다. WAL은 아직 활성화하지 않았다. 운영 범위는 단일 Node 프로세스이다.

Unit 9A(2026-09-08): 실제 schema.prisma/migration의 두 Table, Column/Null/Default, 복합 FK 및 Unique/Index와 문서를 재대조했다. Schema 변경 없음. TC-DB-007 회귀 통과. 초기 계획의 retry 문구를 실제 단일 프로세스 queue/명시적 실패 정책과 일치시켰다.

## Unit S3 저장 위치 계약 — 0.11.0

Table/Column/migration 변경 없음. 기존 `storage_path TEXT NOT NULL UNIQUE`에 backend가 포함된 불투명 locator를 저장한다.

| Backend | storage_path 형식 | 의미 |
| --- | --- | --- |
| local (기존) | `<location-id>/<version-id>/original.dxf` 또는 dwg | CAD_STORAGE_PATH 기준 상대 키 |
| s3 | `s3:<bucket>:cad/<object-uuid>/original.dxf` 또는 dwg | DB transaction 전에 만든 object ID, 해당 bucket의 object key |

S3 object UUID는 Version ID와 다르다. 업로드 전 location/version을 DB에 미리 생성하지 않는다. SHA-256은 수신된 원본 bytes 기준이고 locator는 중복 hash마다 별도로 생성된다. Version/Location/Current FK/Unique는 불변이다.

CAD_STORAGE_BACKEND는 새 업로드 위치만 결정한다. 조회는 각 행의 locator를 따라 local/S3를 선택하고 S3 bucket은 행에 기록된 값을 사용한다. endpoint/credential은 DB에 저장하지 않는다. 현재 한 개 S3 endpoint를 사용하므로 기존 S3 데이터가 있을 때 endpoint 변경만으로 다른 저장소로 이동할 수 없다.

이전 앱(0.10.0 이하)은 S3 locator를 해석하지 못한다. S3 업로드 이후 무조건 이전 바이너리로 rollback하지 말고 호환 앱 또는 일관된 DB/원본 백업 복구 절차를 사용한다. 자동 데이터 이동/locator 변경은 구현하지 않았다.

| 날짜 | 단계 | 변경 | Migration / 검증 |
| --- | --- | --- | --- |
| 2026-09-08 | 0.11.0 / Unit S3 | storage_path에 S3 locator 의미 추가; 기존 local 키 호환 | 추가 migration 없음 / TC-S3-001–003 |
