# Issue #103 — G1 User·Session·Grant·Audit 격리 DB 계약·Migration

2026-10-25 / [GitHub #103](https://github.com/planner77/layoutManager/issues/103) / #96 D1 기반 / 선행 #102 Owner R1 [ADR-051-R1](Issue102.md). **코드 준비·시험 대기 / 운영 기능 OFF**.

## 1. 계약 범위와 배치 경계

- **허용:** 기존 CAD migration을 재현한 disposable \`cad-auth-g1-*/fixture.sqlite\` DB에서 User/AuthSession/UserRoleGrant/UserSiteGrant/SpecialGrant/AuditEvent/AdminRecoveryNonce 테이블을 추가·확인. 테스트 전용 \`src/tests/fixtures/auth-g1/{schema.prisma,migration.sql,store.ts}\`; \`src/tests/integration/auth-g1.test.ts\`.
- **금지:** \`src/prisma/schema.prisma\`, \`src/prisma/migrations/**\`, \`src/app/api/**\`, \`src/server/db.ts\`, 운영 DB/CAD/S3, Compose/Nginx/GHCR/Runtime flag 변경 및 실제 Auth/Admin/Audit/Outline/Memo/Type/Logs API 활성화. 이 G1 SQL을 migrator에 연결하거나 Prisma 문서 투영에서 정식 migration 생성 불가. 적용은 #109 G7 **별도 Owner 승인**.
- **미결정 유지:** G0 #102 기존 익명조회·Current/DELETE/기존 삭제 암호 전환, 최초/복구 Admin 책임자, Audit 365일 이후 파기/백업 보존, 실제 Nginx/DEV 설정. 이에 대한 임의 기본값 없음. 공격/탈취 보안 강화·침투 실증은 Owner R1 비범위이나 데이터·업무권한·원자성·복구는 필수.
- **DESIGN.md 부재:** [AGENTS](../AGENTS.md), [Decisions](Decisions.md) ADR-051-G1, [Architecture](Architecture.md), [Database](Database.md), [Requirements](Requirements.md), [TestPlan](TestPlan.md), [Operation](Operation.md)를 설계 기준으로 한다.

## 2. 물리 모델과 Lifecycle

| 테이블 | FK/Unique/CHECK 및 운영 계약 |
| --- | --- |
| \`User\` | immutable id PK; lowercase trimmed login_name unique(ASCII NOCASE); 비밀번호는 hash만; ACTIVE/DISABLED, must_change_password, UTC ms. 삭제보다 비활성·감사 추적 우선 |
| \`AuthSession\` | User FK/token_hash SHA-256 unique; UTC ms issuedAt/lastSeenAt/expiresAt/revokedAt; 절대 28,800,000ms, idle 1,800,000ms, 최대 active 3개; 4번째/시계 역행·만료 touch/폐기 후 부활 거부 |
| \`UserRoleGrant\` | PK(userId, Reader/Editor/Admin); 부여 Actor User FK. Admin만 변경, 다른 Site 자동 허용하지 않음 |
| \`UserSiteGrant\` | PK(userId,siteId), 기존 \`CadSite.id\` 실 FK. Version→CadLocation→Building→CadSite 검증, 조회 대상 Version이 다른 Site면 거부 |
| \`SpecialGrant\` | PK(userId,permission) permission \`audit:read\`/\`logs:read\` 구분; Admin도 명시 grant 필요 |
| \`AuditEvent\` | event PK/actor User FK nullable/action/target/revision/outcome/UTC/requestId만; DB UPDATE/DELETE 금지, 365일 보존 요구이되 승인 전 자동파기·백업 purge 없음 |
| \`AdminRecoveryNonce\` | nonce_hash SHA-256 unique PK, target User FK/consumedAt UTC ms; 원문 nonce 미보관·기록 UPDATE/DELETE 거부, 재사용은 transaction 전체 rollback |

SQL 트리거는 체크 값을 보호하며 Prisma 모델은 읽기/설계 **투영**이다. SQLite \`NOCASE\`는 일반 Unicode 전자 case-fold가 아니므로 G2 계정명 입력은 ASCII/정규화 정책 유지. \`AuditEvent\` 입력은 기존 \`server/auth/audit.ts\`의 allowlisted 필드 사용. 사용자에게 원시 세션 토큰은 발급 시에만 제공하며 DB에는 hash만.

## 3. 원자성·경쟁·장애 계약

1. **Session issue:** 서버 생성 token candidate → \`BEGIN IMMEDIATE\` writer lock → User ACTIVE 및 mustChange false 검사 → DB count(active: not revoked, not absolute/idle expired)·clock rollback 검사 → DB trigger 3 슬롯 재확인 → unique tokenHash insert → commit. 4번째 혹은 SQLite busy/장애는 기본 거부; 만료 Session 기록은 남되 active count에서 제외. Idle session touch는 idle>=30m에서 금지.
2. **Role/Site/SpecialGrant:** Admin 검증, FK/Unique 확인, Grant INSERT/DELETE와 **같은 transaction**으로 안전 Audit INSERT. 실패 주입·중복·대상 부재 시 Grant/Audit 둘 다 rollback. Audit UPDATE/DELETE는 SQL trigger 거부.
3. **User disable:** 상태 변경+기존 Session 전체 \`revoked_at\` 갱신+Audit가 한 transaction. 장애에서는 활성 계정과 기존 Session이 보존됨.
4. **Admin recovery:** G2에서 검증한 단발 nonce 원문은 호출자가 공급하되 저장 전 SHA-256. nonceHash INSERT(유일성) + User passwordHash 갱신/mustChange=true + Session 전량 revoke + Audit가 한 transaction. 재사용·장애 시 어떤 변경도 남지 않음. G1 Fixture에는 \`.env\`/Secret 파일 열람 및 실제 운영 Bootstrap 실행 경로가 없다.
5. **Version grant:** CAD 기존 FK 체인을 SQL로 직접 조회하고 [domain/auth](../src/domain/auth.ts) \`requirePermission\`에 사용. 임의 header/Client Site 신뢰 없음.

## 4. Migration/Backup/Restore와 검증 기준

실수로 운영에 적용하는 위험을 막기 위해 Fixture opening에는 \`tmpdir\`의 \`cad-auth-g1-*\` 디렉터리/파일명 \`fixture.sqlite\` 검증·DB 파일 Symlink 거부가 있다. Actual tests는 기존 6개 \`src/prisma/migrations\` SQL을 temp DB에 순서대로 설치, 합성 사이트 2곳과 Version/Current/SHA/삭제 암호 hash를 등록한다. 그 뒤 격리 SQL DDL을 \`BEGIN IMMEDIATE\`에서 실행해 \`foreign_key_check\`, CHECK/Unique, CRUD 원자성, rollback, 동시 connection busy 거부를 검증한다.

백업 rehearsal은 **write-quiesced 합성 DB**의 SQLite backup API와 동일 시점 합성 local CAD+S3 mirror 객체 복제→G1 dry-run→Current 고의 변형→백업 세트 복원→DB 전체 CAD row/Current/Version/sha256/delete_password_hash·파일 bytes/SHA/foreign_key_check 동일 확인. Mock S3는 실제 AWS/S3 원격 복구가 아니며 **#108 G6 실제 사내 DB/CAD/S3 snapshotId/manifest·Restore 증거를 대체하지 않는다**. 상세 Runbook [Operation](Operation.md).

## 5. AC/시험과 실제 상태

| AC | 실증/증거 | 현재 |
| --- | --- | --- |
| AC1 | 7 물리 모델/Prisma 투영·FK/Unique·D1~D5 수명주기·Version Site 관계 | 작성, 실행 NOT RUN |
| AC2 | TC-P4-G1-002~008; lock/3 session/Grant audit/disable/nonce/rollback | 작성, 실행 NOT RUN |
| AC3 | TC-P4-G1-001/009; 기존 CAD 실제 Migration 기반 dry-run/FK/스냅샷·backup/restore | 작성, 실행 NOT RUN; 실 S3 G6 |
| AC4 | PR diff에서 \`src/prisma/**\` 및 API/Runtime/운영 변경 0, 최신 HEAD PR CI 결과 | PR 후 확인 대기 |

**권장 검증:** \`cd src && npm ci && npm run db:generate && npx vitest run tests/integration/auth-g1.test.ts && npm run typecheck && npm run lint && npm run test:e2e && npm run test:master-migration\`; Docker Verify 포함 전체 PR CI는 생성 후 확인. 원격 GitHub 작업 환경에서는 직접 실행하지 않았으므로 PASS 주장 금지.

## 6. 후속 인계

- #104 G2: Secret/.env 최초 관리자·단발 복구 실제 서비스, 장애 복구·절대 경로 Secret 책임.
- #105 G3: Auth API의 DB 연결·cookie/3 슬롯/만료·로그아웃 등; 임의 운영 활성화 없음.
- #106 G4: 실제 Role/Site/Version DB 권한 adapter와 Audit endpoint, 특별권한·365일 retention.
- #107 G5: PROD Nginx/DEV direct 정상 연결·배포 경로.
- #108 G6: 실제 사내 업무 E2E 및 동일시점 DB/CAD/S3 실복구.
- #109 G7: 잔여 Owner 결정·실운영 DDL/Auth 활성화 승인/배포/롤백 Go/No-Go.

**상위 Issue #96는 OPEN/BLOCKED 유지.** 작성한 테스트가 실행되기 전에는 #103 AC 체크, CI PASS 또는 실 운영 승인 판정 금지.
