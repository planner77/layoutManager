# Issue #96 — 로컬 계정·세션·Role/Site·감사 공통 기반

## G2 #104 — 단발 Admin/Secret 격리 구현 (2026-10-26)

#103 G1 User/Role/Audit/Nonce DB와 #102 Owner R1 기준으로 #104 명시 executor, 실행 UID 0400/0600 Secret, 최초 User/Admin Role/Audit 한 거래, 복구 nonce SHA unique·Session revoke/Audit, 9개 통합 TC 작성. [Issue104](Issue104.md)/[ADR-051-G2](Decisions.md). 실제 수행자·승인/Secret 경로는 사내 비공개 SOP. **운영 Auth/Admin/Prisma/API/Compose/Nginx·실 DB/CAD/S3 기능 OFF**, #96/#109 BLOCKED. 테스트 코드 작성은 PASS 아님; 새 HEAD CI 결과 전 G2-AC1~4 수용 보류. #105 G3/#106 G4/#108 G6 후속. G0 #102 PR #114 main 병합·POST 업로드 Editor/Admin+담당 Site 정책 승인 완료. 사내 담당자/감사 파기·백업 세칙은 G2/G4/G6/G7 후속이며 G7 전 운영 OFF.

## G0 #102 Owner 5개 업무 정책 승인 — 최우선 경계 (2026-10-25)

[Issue102](Issue102.md) / [ADR-051-R1](Decisions.md): 사내망의 **기존 공개 도면 GET/Viewer/원본 다운로드는 익명 허용**하며 해당 경로에는 UserSiteGrant로 Site 읽기 기밀성을 주장하지 않는다. **Current 지정은 로그인한 Editor 이상 + 담당 Site, 기존 도면 Version 삭제는 로그인한 Editor 이상 + 담당 Site + 기존 삭제 비밀번호**(AND)로 G7 이후 적용할 정책이 승인됐다. Admin도 Site 자동 전체 접근 없음.
최초 Admin 생성·단발 복구 실행은 **지정 사내 운영 담당자**, 운영 책임은 Owner. Audit 365일 유지 후 만료 기록 정리 원칙만 승인; **자동 파기·백업본 세칙은 후속 #106/#108/#109**에서 확정 후 구현. 도면 `POST` 등록은 **Editor 이상+담당 Site**로 G0-BIZ-06 Owner 추가 승인.
이 결정은 기존 #96 D1~D5 인증/업무 Role/Scope/Audit의 **쓰기 및 미래 영속 API**에 적용하는 것이며, 기존 익명 CAD 읽기까지 인증 강제하는 기존 제안은 명시적으로 대체한다. 신규 Outline/Memo/Type/Logs GET/관리 API의 익명 허용 또는 운영 기능 활성화를 승인하지 않는다. G0 정책/문서 PR과 G7 운영 Go/No-Go 별개, 현재 API·Schema·Nginx/Compose·DB 및 운영 기능 OFF 상태 불변.


## G1 #103 — 격리 User/Session/Grant/Audit 물리 모델 및 원자성 (2026-10-25)

- [Issue #103](https://github.com/planner77/layoutManager/issues/103)에서 User/AuthSession/Role·Site·Special Grant/AuditEvent/RecoveryNonce의 **비운영 SQLite DDL, Prisma 참조 투영, Lock/Transaction 원자성 Fixture 및 9개 Integration 테스트**를 구현했다. 상세 [Issue103](Issue103.md), [ADR-051-G1](Decisions.md).
- **운영 승인 아님:** `src/tests/fixtures/auth-g1/**`·Integration/문서만 변경, `src/prisma/schema.prisma`와 자동 migrations, 실제 API/Runtime/DB/로그인·관리·Audit 활성화는 0. #102 Owner 5개 업무 승인 기록은 적용하되 POST/Secret/Audit 파기 세칙과 #104~#109 선행/운영 게이트는 그대로 남고 #96 OPEN/BLOCKED. 실행 확인 전 G1 AC PASS 기록 금지.


## G0 #102 — Owner 경량 보안 범위 결정 R1 (2026-10-25)

- **최신 기준:** [Issue102](Issue102.md) 및 [ADR-051-R1](Decisions.md). 공개망 인바운드가 제한된 사내 업무망에서 **운영 사용자 PC는 Nginx 경유**, 개발자는 **별도 개발 App 직접 접속**. 공격 대응·자격증명/세션 탈취 방어·침투시험 및 상세 보안 수용 실증은 **비범위**로 Owner가 결정했다. HTTP 평문 위험은 여전히 존재하며 정책상 `OWNER_ACCEPTED_SCOPE`로 기록하되 안전성 PASS로 쓰지 않는다.
- 이전 D6와 아래 후속 게이트의 'Host/Origin/CSRF 공격 시험·CIDR 차단/탈취 위협 검증/별도 위험 서명'은 이 R1이 **완료 요건을 축소**한다. 기존 코드/Unit을 자동 삭제하거나 우회하라는 뜻은 아니다.
- **계속 필수:** D1~D5 Admin/계정/세션/Role/Site/Audit의 업무 기능, DB 원자성·변경 감사/365일 보존, 개발/운영 데이터 분리, PROD/DEV 정상 경로 검증, CAD Source/SHA/Version/Current·기존 API 동작 보호, DB/CAD/S3 backup→격리 migration→실 restore, 별도 G7 Owner 운영 Go/No-Go. 보류된 Current/삭제/기존 API 인증 전환 및 Audit 만료 파기는 미승인.
- 이 문서의 아래 원래 승인 D1~D6 수치/역사 기록은 유지하고 **R1이 충돌하는 보안 게이트만 우선**한다. 현재 Auth/API/DDL/Prisma/Compose/Nginx/운영 데이터 변경 없음, #96 OPEN/BLOCKED 유지.


## Owner D1~D6 결정 (2026-10-25)

**정책 승인 / 실제 운영 기능 BLOCKED.** 원 이슈 [#96](https://github.com/planner77/layoutManager/issues/96), 선행 #31 D0/ADR-048/049 및 최신 ADR-051. 별도 DESIGN.md는 저장소에 없고 AGENTS/Architecture/Decisions가 기준.

- **D1:** .env 기반 bootstrap/복구. ADMIN_BOOTSTRAP_ENABLED / ADMIN_BOOTSTRAP_USERNAME / ADMIN_BOOTSTRAP_PASSWORD_FILE 및 ADMIN_RECOVERY_ENABLED / ADMIN_RECOVERY_TARGET_USER_ID / ADMIN_RECOVERY_ONCE_ID / ADMIN_RECOVERY_PASSWORD_FILE 제안. 플래그 모두 false가 초기값; 비밀번호 내용은 env에 두지 않고 별도 Secret file만 사용. 이미 초기화된 DB에서 재시작 bootstrap 금지, 명시적 복구 nonce 단발·감사 필요.
- **D2:** 계정 비밀번호 최소 8자, 최초 변경, 로그인 실패 횟수 제한. 기존 삭제 비밀번호와 다른 Node 내장 scrypt(local-v1) 사용. Argon2id 신규 의존성 없음.
- **D3:** 8시간 절대/30분 idle/3개 동시, 원시 token 미저장, cookie HttpOnly/SameSite. 실제 DB 원자 발급 및 로그아웃/disable/reset revoke는 운영 기능 구현 단계.
- **D4:** Admin만 User/Role/Site 부여·회수, Admin도 Site 자동 전체 열람 불가. Version→Site는 서버 권위 조회. audit:read/logs:read는 각각 별도 grant, 미승인 Memo Editor 쓰기는 거부.
- **D5:** Audit append-only(향후 DB), 안전한 actor/action/target/revision/outcome/UTC/requestId만 기록. 보존 365일, audit:read 별도 권한 Admin만 조회. 물리 파기 미승인.
- **D6:** 허용 사내 IP/CIDR+OS 방화벽/Reverse Proxy backend 직접 접근 차단, Owner HTTP 잔여 위험 인지·수용 원칙. 실제 IP/CIDR 및 실증 수용 기록은 아직 없음.

## 구현 범위·의도적 비활성

1. src/domain/auth.ts: trusted UserAccess+SiteGrant, VersionSiteResolver, deny-first requirePermission.
2. src/server/auth/bootstrap.ts: 명시 env/planned bootstrap/recover(파일·DB 접근 없음).
3. src/server/auth/password.ts: 단방향 scrypt/KDF 용량 제한, 최소 8자·검증.
4. src/server/auth/session.ts: 토큰 해시·만료/동시 개수·폐기·HTTP 쿠키 정책의 순수 함수.
5. src/server/auth/guards.ts: 세션 귀속 CSRF/Origin 및 mock 로그인 횟수 limiter.
6. src/server/auth/audit.ts: 무비밀 immutable 이벤트·365일 보존 cutoff.
7. src/tests/unit/auth-foundation.test.ts, auth-password.test.ts: TC-P4-D1-003~012.

**금지:** 새 app API Route/로그인 UI/DB/Prisma schema/migration/Docker Compose/Nginx/실 데이터 및 GHCR 변경 없음. .env.example 설정을 true로 바꿔도 앱 런타임에서 소비하지 않으므로 활성화되지 않는다. 기존 CAD 원본 bytes/SHA/Current/Version/Viewer/삭제비밀번호 불변.

## 후속 게이트/AC

- TC-P4-D1-003~012 Unit 코드 작성. 원 HEAD d85ee35의 PR CI 40190126225는 Verify/Docker 모두 PASS. #97 main 통합 HEAD의 CI는 별도 검증 필요하며 현장 E2E 미실행.
- 실제 Secret 파일 권한·초기/복구 DB CAS/nonce 영속, KDF 워크팩터/실 계정 악의적 로그인, Session 발급 3개 원자성·폐기, Server Peer Origin/CSRF·LAN CIDR, Role/Site 교차 접근, append-only Audit와 감사 보존/백업·파기, DB/CAD/S3 동일 시점 backup→격리 migrate dry-run/FK→restore 및 별도 Owner 운영 배포 수용 모두 완료 전 서버 기능 OFF.
- #97 Canonical/Transform은 병행 가능. #98 영속 Outline, #60 Logs, #65 Global Type, #83 Memo 영속은 권한 연동·별도 승인 후. #99 실 DXF/GPU 수용 별도.

[Architecture](Architecture.md) · [Database](Database.md) · [Requirements](Requirements.md) · [TestPlan](TestPlan.md) · [TestReport](TestReport.md) · [Operation](Operation.md).
