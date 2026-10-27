# Issue #103 — G1 User·Session·Grant·Audit 격리 DB 계약·Migration

## Issue #104 G2 후속 — G1 Recovery Audit actor 정정 (2026-10-26)

종료된 G1 fixture의 User/Session/Role/Audit/Nonce·`consumeG1Recovery` 원자성을 G2에서 재사용한다. 실제 단발 복구의 행위자는 세션으로 로그인한 Admin 자신이 아닌 사내 지정 운영 담당자다. 따라서 G1 fixture `ADMIN_RECOVERY` 이벤트의 `actor_user_id=null`/`affected_user_id=대상 Admin UUID`로 정정, 실행자 실명은 사내 비공개 SOP requestId로 추적한다. nonce Unique/회수·rollback/Role/기존 CAD 계약 불변. 운영 Prisma/실 데이터/Auth/API 비활성·G7 별도 승인 유지. [Issue104](Issue104.md).



## #107 Main 선행 병합에 따른 G1 정렬 기록 (2026-10-26)

- #103 PR #116 수정 HEAD `40153240d593c9d645dcc7c79bc9d9ac82d073e0`의 [PR CI #40225147249](https://github.com/planner77/layoutManager/actions/runs/40225147249)는 Verify `121264822767`, Docker `121264822603` 두 Job **SUCCESS**. 이는 #107 main 통합 **이전 HEAD의 결과**이며 새 정렬 HEAD에는 그대로 적용되지 않는다.
- [#107 Main `142c4b9bc0bd`](https://github.com/planner77/layoutManager/commit/142c4b9bc0bdb2ad0403fb1ee6640cf070d0bbbc)가 들어온 뒤 #116이 `behind=1` / `dirty`가 됨. 이는 CI 테스트 실패가 아닌 동시 병합에 의한 문서 충돌이다. G1/#103과 G5/#107의 AGENTS·README·Architecture·FailureLedger·Operation·Requirements·TestPlan·TestReport 신규 절을 모두 보존하고, G5의 workflow/Preview compose·nginx/스크립트/Unit/package 버전을 최신 Main 그대로 유지하는 비강제 2-parent merge 정렬을 진행.
- #103 격리 User/Session/Grant/Audit/RecoveryNonce SQL/Prisma Fixture·Integration Tests, Owner #102 업무 정책, P1 Site Audit 대상 사용자/사이트 추적 및 과거 실패 원장 전체 보존. 운영 Auth/API/Prisma/migrations/Compose 적용·실 DB/CAD/S3 변경 **0**.
- 새 PR CI는 정렬 HEAD의 `pull_request.synchronize` 실행 시작만 확인하며 최종 결과 모니터링 생략. 기존 성공 40225147249를 새 HEAD PASS로 전용 금지. 리뷰 unresolved 0 및 새 병합 충돌 해소 여부 검증이 선행조건.


## PR #116 최초 실패 및 R2 보완 (2026-10-26)

- 원 HEAD `50014e68`, PR CI [#40202066291](https://github.com/planner77/layoutManager/actions/runs/40202066291) Verify/Docker 모두 **failure**. 공통 원인은 `store.ts:134:98` TS1002 및 연쇄 구문 오류(비밀번호 변경/복구 helper 치환 중 선언 파손·중복), 후속 Unit/E2E/Docker smoke는 미실행. 실행 이력은 [FailureLedger](FailureLedger.md)에 보존.
- Reviewer P1 [r4371167619](https://github.com/planner77/layoutManager/pull/116#discussion_r4371167619) 해결안: Site Grant 변경의 `AuditEvent`에 관리자 actor 외 `affected_user_id`와 `site_id`를 독립 FK 컬럼으로 추가, Site 이벤트에는 필수 제약. `TC-P4-G1-005`에 사용자 A/B 동일 Site 부여·철회 후 양쪽 이력 보존과 결손 거부 추가.
- 수정 Fixture는 여전히 **비운영 격리 데이터**이며 `src/prisma/schema.prisma`/자동 migrator/실 Runtime 전부 OFF. 신규 HEAD 테스트 PASS 및 Owner G7 승인은 별도.



2026-10-25 / [GitHub #103](https://github.com/planner77/layoutManager/issues/103) / #96 D1 기반 / 선행 #102 Owner R1 [ADR-051-R1](Issue102.md). **코드 준비·시험 대기 / 운영 기능 OFF**.

## 1. 계약 범위와 배치 경계

- **허용:** 기존 CAD migration을 재현한 disposable `cad-auth-g1-*/fixture.sqlite` DB에서 User/AuthSession/UserRoleGrant/UserSiteGrant/SpecialGrant/AuditEvent/AdminRecoveryNonce 테이블을 추가·확인. 테스트 전용 `src/tests/fixtures/auth-g1/{schema.prisma,migration.sql,store.ts}`; `src/tests/integration/auth-g1.test.ts`.
- **금지:** `src/prisma/schema.prisma`, `src/prisma/migrations/**`, `src/app/api/**`, `src/server/db.ts`, 운영 DB/CAD/S3, Compose/Nginx/GHCR/Runtime flag 변경 및 실제 Auth/Admin/Audit/Outline/Memo/Type/Logs API 활성화. 이 G1 SQL을 migrator에 연결하거나 Prisma 문서 투영에서 정식 migration 생성 불가. 적용은 #109 G7 **별도 Owner 승인**.
- **Owner 최신 정책:** 2026-10-25 #102 Owner 5개 승인: 기존 CAD 목록/Viewer/다운로드 익명 GET 유지, Current=Editor/Admin+담당 Site, Version 삭제=Editor/Admin+담당 Site+기존 삭제 비밀번호, 최초 Admin/복구=지정 사내 운영 담당자(Owner 책임), Audit 365일 경과 이력 정리 원칙. 관련 문서 PR #114는 병합·CI 완료 미확인. POST 업로드 권한, Secret/실 담당자, Audit 물리 정리·백업 복원 세칙, 실제 배포는 PENDING; #103 G1 운영 활성화 승인 아님. **계약 경계:** G1의 인증된 User/SiteGrant 검사 Fixture는 기존 익명 CAD GET 경로에 연결하지 않는다. 공격·탈취 강화는 비범위지만 데이터 정합성/복구는 필수.
- **DESIGN.md 부재:** [AGENTS](../AGENTS.md), [Decisions](Decisions.md) ADR-051-G1, [Architecture](Architecture.md), [Database](Database.md), [Requirements](Requirements.md), [TestPlan](TestPlan.md), [Operation](Operation.md)를 설계 기준으로 한다.

## 2. 물리 모델과 Lifecycle

| 테이블 | FK/Unique/CHECK 및 운영 계약 |
| --- | --- |
| `User` | immutable id PK; lowercase trimmed login_name unique(ASCII NOCASE); 비밀번호는 hash만; ACTIVE/DISABLED, must_change_password, UTC ms. 삭제보다 비활성·감사 추적 우선 |
| `AuthSession` | User FK/token_hash SHA-256 unique; UTC ms issuedAt/lastSeenAt/expiresAt/revokedAt; 절대 28,800,000ms, idle 1,800,000ms, 최대 active 3개; 4번째/시계 역행·만료 touch/폐기 후 부활 거부 |
| `UserRoleGrant` | PK(userId, Reader/Editor/Admin); 부여 Actor User FK. Admin만 변경, 다른 Site 자동 허용하지 않음 |
| `UserSiteGrant` | PK(userId,siteId), 기존 `CadSite.id` 실 FK. Version→CadLocation→Building→CadSite 검증, 조회 대상 Version이 다른 Site면 거부 |
| `SpecialGrant` | PK(userId,permission) permission `audit:read`/`logs:read` 구분; Admin도 명시 grant 필요 |
| `AuditEvent` | event PK/actor User FK nullable/action/target/revision/outcome/UTC/requestId만; DB UPDATE/DELETE 금지, 365일 보존 요구이되 승인 전 자동파기·백업 purge 없음 |
| `AdminRecoveryNonce` | nonce_hash SHA-256 unique PK, target User FK/consumedAt UTC ms; 원문 nonce 미보관·기록 UPDATE/DELETE 거부, 재사용은 transaction 전체 rollback |

SQL 트리거는 체크 값을 보호하며 Prisma 모델은 읽기/설계 **투영**이다. SQLite `NOCASE`는 일반 Unicode 전자 case-fold가 아니므로 G2 계정명 입력은 ASCII/정규화 정책 유지. `AuditEvent` 입력은 기존 `server/auth/audit.ts`의 allowlisted 필드 사용. 사용자에게 원시 세션 토큰은 발급 시에만 제공하며 DB에는 hash만.

## 3. 원자성·경쟁·장애 계약

1. **Session issue:** 서버 생성 token candidate → `BEGIN IMMEDIATE` writer lock → User ACTIVE 및 mustChange false 검사 → DB count(active: not revoked, not absolute/idle expired)·clock rollback 검사 → DB trigger 3 슬롯 재확인 → unique tokenHash insert → commit. 4번째 혹은 SQLite busy/장애는 기본 거부; 만료 Session 기록은 남되 active count에서 제외. Idle session touch는 idle>=30m에서 금지.
2. **Role/Site/SpecialGrant:** Admin 검증, FK/Unique 확인, Grant INSERT/DELETE와 **같은 transaction**으로 안전 Audit INSERT. 실패 주입·중복·대상 부재 시 Grant/Audit 둘 다 rollback. Audit UPDATE/DELETE는 SQL trigger 거부.
3. **User disable:** 상태 변경+기존 Session 전체 `revoked_at` 갱신+Audit가 한 transaction. 장애에서는 활성 계정과 기존 Session이 보존됨.
4. **Admin recovery:** G2에서 검증한 단발 nonce 원문은 호출자가 공급하되 저장 전 SHA-256. nonceHash INSERT(유일성) + User passwordHash 갱신/mustChange=true + Session 전량 revoke + Audit가 한 transaction. 재사용·장애 시 어떤 변경도 남지 않음. G1 Fixture에는 `.env`/Secret 파일 열람 및 실제 운영 Bootstrap 실행 경로가 없다.
5. **Version grant:** CAD 기존 FK 체인을 SQL로 직접 조회하고 [domain/auth](../src/domain/auth.ts) `requirePermission`에 사용. 임의 header/Client Site 신뢰 없음.

## 4. Migration/Backup/Restore와 검증 기준

실수로 운영에 적용하는 위험을 막기 위해 Fixture opening에는 `tmpdir`의 `cad-auth-g1-*` 디렉터리/파일명 `fixture.sqlite` 검증·DB 파일 Symlink 거부가 있다. Actual tests는 기존 6개 `src/prisma/migrations` SQL을 temp DB에 순서대로 설치, 합성 사이트 2곳과 Version/Current/SHA/삭제 암호 hash를 등록한다. 그 뒤 격리 SQL DDL을 `BEGIN IMMEDIATE`에서 실행해 `foreign_key_check`, CHECK/Unique, CRUD 원자성, rollback, 동시 connection busy 거부를 검증한다.

백업 rehearsal은 **write-quiesced 합성 DB**의 SQLite backup API와 동일 시점 합성 local CAD+S3 mirror 객체 복제→G1 dry-run→Current 고의 변형→백업 세트 복원→DB 전체 CAD row/Current/Version/sha256/delete_password_hash·파일 bytes/SHA/foreign_key_check 동일 확인. Mock S3는 실제 AWS/S3 원격 복구가 아니며 **#108 G6 실제 사내 DB/CAD/S3 snapshotId/manifest·Restore 증거를 대체하지 않는다**. 상세 Runbook [Operation](Operation.md).

## 5. AC/시험과 실제 상태

| AC | 실증/증거 | 현재 |
| --- | --- | --- |
| AC1 | 7 물리 모델/Prisma 투영·FK/Unique·D1~D5 수명주기·Version Site 관계 | 작성, 실행 NOT RUN |
| AC2 | TC-P4-G1-002~008; lock/3 session/Grant audit/disable/nonce/rollback | 작성, 실행 NOT RUN |
| AC3 | TC-P4-G1-001/009; 기존 CAD 실제 Migration 기반 dry-run/FK/스냅샷·backup/restore | 작성, 실행 NOT RUN; 실 S3 G6 |
| AC4 | PR diff에서 `src/prisma/**` 및 API/Runtime/운영 변경 0, 최신 HEAD PR CI 결과 | PR 후 확인 대기 |

**권장 검증:** `cd src && npm ci && npm run db:generate && npx vitest run tests/integration/auth-g1.test.ts && npm run typecheck && npm run lint && npm run test:e2e && npm run test:master-migration`; Docker Verify 포함 전체 PR CI는 생성 후 확인. 원격 GitHub 작업 환경에서는 직접 실행하지 않았으므로 PASS 주장 금지.

## 6. 후속 인계

- #104 G2: Secret/.env 최초 관리자·단발 복구 실제 서비스, 장애 복구·절대 경로 Secret 책임.
- #105 G3: Auth API의 DB 연결·cookie/3 슬롯/만료·로그아웃 등; 임의 운영 활성화 없음.
- #106 G4: 실제 Role/Site/Version DB 권한 adapter와 Audit endpoint, 특별권한·365일 retention.
- #107 G5: PROD Nginx/DEV direct 정상 연결·배포 경로.
- #108 G6: 실제 사내 업무 E2E 및 동일시점 DB/CAD/S3 실복구.
- #109 G7: 잔여 Owner 결정·실운영 DDL/Auth 활성화 승인/배포/롤백 Go/No-Go.

**상위 Issue #96는 OPEN/BLOCKED 유지.** 기존 공개 CAD 익명 조회는 인증 도메인과 별개이며, TC-P4-G1-006은 인증된 User의 Version/Site 허용/거부만 검증한다. Current/DELETE 업무 API 반영은 G4/G7 별도. 작성한 테스트가 실행되기 전에는 #103 AC 체크, CI PASS 또는 실 운영 승인 판정 금지.
