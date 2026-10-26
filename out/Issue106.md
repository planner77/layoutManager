# Issue #106 — G4 서버 Role/Site/Version 권한·Grant·Audit 영속 계층

## Issue #106 코드 완료·GHCR v0.41.1 후속 릴리스 경계 (2026-10-26)

- [PR #120](https://github.com/planner77/layoutManager/pull/120) 최종 HEAD `d4afaf0ae3cee51a172dad9305533d941daa5706`, [PR CI 40253887969](https://github.com/planner77/layoutManager/actions/runs/40253887969) Verify·Docker `completed/success`, P1 리뷰 2건 Resolved/미해결 0, main drift 0·mergeable true 후 squash [commit 0f59351e](https://github.com/planner77/layoutManager/commit/0f59351ef160e3cc79681a78c34714db8d088ab9). [Main CI 40254890094](https://github.com/planner77/layoutManager/actions/runs/40254890094)는 시작까지만 확인.
- 현재 `v0.41.0` App/Migrator 릴리스 Pair는 이전 #105 Main CI에서 게시 완료. 새 #106 코드에 대응하는 `0.41.1` Pair는 기존 tag/digest를 이동하지 않는 별도 릴리스 PR의 `src/package.json`/lock 버전 정렬 및 새 PR CI 통과→Main CI 이후 게시될 수 있다. **0.41.1 GHCR 게시 확인 전에는 RELEASE PENDING**. 코드 단위 완료/Issue 행정 종료와 릴리스 게시 성공을 구분한다.
- #109 G7 승인 전 운영 Auth/관리/API/Prisma/Migration/Nginx·Compose/실 CAD·S3 및 기존 익명 CAD GET/DELETE 권한 변경 없음. 현장 G6 #108 미실행.


## PR #120 최초 CI 실패·P1 리뷰 보완 (2026-10-26)

- **초기 CI:** [Run 40252656906](https://github.com/planner77/layoutManager/actions/runs/40252656906), HEAD `53b75ca17190cd101689a3f10877adcb737ff37c`, Verify Job `121347711873` failed / Docker Job `121347711740` success. Typecheck·Lint passed, Unit/Integration 288 passed/9 failed; 9개 G4 TC는 전부 같은 fixture `seedCad:37` 중복 Site 명칭으로 beforeEach 중단. Build/E2E skipped.
- **시정:** 동일 Product 아래 `Site-a`/`Site-b` 고유 이름으로 실 CAD Parent/Name Unique 제약 준수. P1 [r4373235025](https://github.com/planner77/layoutManager/pull/120#discussion_r4373235025) 지적 처리 및 Site 명칭 assertion 추가.
- **감사 P1:** [r4373235027](https://github.com/planner77/layoutManager/pull/120#discussion_r4373235027)는 Permission 허용/거부 및 Outline Create/Edit/Delete Audit가 **resolved Site를 잃는 결함**을 지적. 같은 원자 거래에서 DB Version→Site를 해석해 Audit `site_id`에 저장하며 G1 disposable CHECK는 Site Grant affectedUser+Site 의무와 scoped authorization/Outline Site 허용을 함께 유지. Audit table FK/append-only/Revision/Actor 불변 유지. TC001/005/009 확대.
- **테스트 증거:** 수정 HEAD PR CI 시작은 수용 완료와 다르다. 최신 Typecheck/Unit/Build/E2E 등 결과 모니터링 생략 시 `NOT VERIFIED`로 남기며, G4-AC 완료 체크/실 운영 활성화 판단은 별도. [TestReport](TestReport.md)·[FailureLedger](FailureLedger.md) 근거.


작성: 2026-10-26. [Issue #106](https://github.com/planner77/layoutManager/issues/106), #102 Owner G0-BIZ-01~06, 선행 #103 G1 / #104 G2 / #105 G3, ADR-051-R1 참조. 저장소 DESIGN.md는 없으며 AGENTS.md·Architecture·Database·Decisions를 설계 기준으로 삼는다.

## 범위 및 운영 차단

G4는 기존 G1 임시 SQLite에서 서버 세션·현재 계정/Grant/Version→Site를 확인하는 **비운영 격리 인가·영속 감사 서비스**다. 운영 Auth/Admin/Outline/Logs/Audit API, 운영 Prisma schema/migrations, App Router, Compose/Nginx/.env, 실 DB/CAD/S3/원본 SHA/Current·레거시 삭제 비밀번호는 변경하지 않는다. G7 #109 Owner 별도 Go/No-Go 전 기능 OFF. 실제 CadOutline CRUD는 #98, Logs 조회 연동은 #60의 책임이다.

## Owner 업무 권한 매트릭스

| 기능 | Role | Site/Version | 정책 |
| --- | --- | --- | --- |
| 기존 공개 CAD GET/Viewer/원본 다운로드 | 익명 가능 | 읽기에 SiteGrant 불요 | 기존 API 연결 변경 없음 |
| 기존 CAD POST 등록 | Editor/Admin | DB 확인 담당 Site | G7 운영 연결 전 OFF |
| Current PUT | Editor/Admin | DB Version→CadLocation→Building→CadSite | G7 전 OFF |
| Version DELETE | Editor/Admin | DB 담당 Site | **기존 삭제 비밀번호 AND**, G4 Role/Site 사전 인가만으로 최종 삭제 불가 |
| 신규 Outline GET/쓰기 | Reader 이상 / Editor 이상 | 명시 Site/Version Grant | 실제 API는 #98/G7 |
| Grant 및 User 관리 | Admin | global | Session 및 현재 DB 계정 확인 |
| Audit 조회 / Logs 조회 | 각각 Admin+audit:read / Admin+logs:read | global | 두 SpecialGrant는 독립 |
| 비인가 요청 | 401 무효 세션 / 403 유효 세션 권한 없음 | 비누설 | DB safe Audit |

Admin도 Site 전체 접근이 자동으로 주어지지 않는다. 기존 공개 CAD GET의 익명 예외가 미래 Outline/Memo/Type/관리·감사 GET로 확대되는 일은 없다. G4의 삭제 Role/Site 검사는 삭제 비밀번호를 대체하지 않는다. Cookie, 원시 Token, X-User/X-Role, 클라이언트 user/role/site/action claim, 삭제 비밀번호는 Actor 근거가 아니다.

## 설계와 소스

- **Policy:** src/domain/auth.ts에 cad:upload, cad:current, cad:delete와 requireResolvedPermission(현재 DB Actor·서버 Site 해석)을 추가. 기존 requirePermission 보존.
- **Port:** src/server/auth/g4-service.ts는 저장소 주입형 비라우팅 서비스와 Request/Response 테스트 계약. G3 Cookie token의 SHA-256 hash만 DB 조회에 사용. 정상 Origin/Session CSRF 검증을 유지하고 거절은 안전 code만 반환.
- **Adapter:** src/tests/fixtures/auth-g4/store.ts는 G1 경로 guard가 적용된 disposable SQLite만 사용. BEGIN IMMEDIATE 안에서 G3 Session(활성/8h/30m/회수/필수 변경), 현재 Role/Site/SpecialGrant, Version→Site를 다시 검사한다. Admin 전용 Grant/Account disable, 전체 Session revoke, 테스트 전용 ShadowOutline Revision CAS와 Audit INSERT까지 한 트랜잭션. 잠금/Audit 오류는 fail-closed/rollback. 마지막 유효 Admin disable/Role 회수 차단.
- **Audit:** src/server/auth/audit.ts 및 src/tests/fixtures/auth-g1/migration.sql에 AUTHORIZATION_GRANTED 안전 사건을 **격리 fixture만** 추가. G1 AuditEvent FK/actor_user_id/affected_user_id/site_id/target/revisions/outcome/UTC/requestId, UPDATE/DELETE 거부 trigger를 유지. 거부 401/403도 안전 Audit에 저장. Secret/Geometry/자유 본문은 저장하지 않음.
- **Business 실증:** G4ShadowOutline은 시험 전용 테스트 테이블이다. Generated id, CreatedBy 불변, edit/delete revision 충돌/감사 원자성 검증 용도이며 #98 실제 CadOutline 엔터티가 아니다.

## 보존

Audit 365일은 auditRetentionCutoff 및 정책상의 보존 경계. 만료 이력 정리 원칙은 승인되었지만 **자동/물리 파기 주기·관리권한·백업본 정리·복원 예외의 SOP가 미승인**이므로 삭제 Job/SQL/Purge는 구현·실행하지 않는다. G6 #108과 G7 #109 후속 승인 사항이다.

## AC / TC

| AC | 테스트 | 기대 결과 |
| --- | --- | --- |
| AC1 | TC-P4-G4-001~003 | Reader/Editor/Admin Site/Version 권한, 다른 Site/없는 Version 403, 회수 즉시 차단, Admin Site 자동허용 금지 |
| AC2 | TC-P4-G4-002,004,007~008 | Admin만 Grant/disable, Unique/BUSY 직렬화, 401/403, 정상 Origin/CSRF, 마지막 Admin 보존 |
| AC3 | TC-P4-G4-002,005~009 | 권한 성공/거부·Grant·Business Create/Edit/Delete Audit, actor/affected/Site/Revision/UTC, 실패 주입 rollback/민감정보 0 |
| AC4 | TC-P4-G4-005,009 + 기존 CAD 회귀 | FK/append-only, 보존 경계, 기존 CAD 원본 불변, 실제 Prisma/운영 API/G7 OFF |

테스트 작성은 PASS가 아니다. 실제 Typecheck/Lint/Vitest/Build/E2E/CI 로그는 [TestReport](TestReport.md)에만 실증으로 기록한다. 실 LAN/Nginx/브라우저·운영 Backup/Restore·기존 API 인증 전환은 NOT RUN 및 G6/G7 후속. 본 작업은 최신 HEAD 리뷰/충돌 처리, [FailureLedger](FailureLedger.md) 누적, PR CI **시작까지만** 수행하며 이후 모니터링/병합/Issue 종료/GHCR 게시를 하지 않는다.
