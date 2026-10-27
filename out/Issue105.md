# Issue #105 — G3 격리 로그인·세션·초기 암호 변경

작성: 2026-10-26. 기준 main `413dea7`에서 구현 전 Manager 계획을 먼저 기록한 뒤 구현 경계를 정렬했다. 별도 DESIGN.md는 없으며 [Architecture](Architecture.md), [Database](Database.md), [Decisions](Decisions.md)를 설계 기준으로 사용한다. 상위 [Issue96](Issue96.md), 최신 Owner [Issue102](Issue102.md) R1, 종료된 [Issue103](Issue103.md) G1과 [Issue104](Issue104.md) G2 계약을 재사용한다.

## 범위와 인계

G3는 비운영 서비스와 disposable SQLite adapter 및 요청/응답 계약 시험이다. 실제 App Router 로그인/관리 UI·API, 운영 Prisma/migrations/DB, Compose/Nginx/.env, CAD 원본·S3·Current·삭제 비밀번호를 변경하거나 연결하지 않는다. 운영 활성화는 #109 G7 별도 Owner Go/No-Go 이후다. 새 공격·탈취 방어, 침투/브루트포스 모의시험은 Owner R1 비범위이며 기존 Origin/CSRF 헬퍼와 정상 요청 검증은 유지한다. 로그인 실패 제한 5회/60초의 다중 프로세스 일관성은 기능 요건으로 검증한다.

기존 공개 CAD 목록·검색/위치·Version/Current·Viewer·원본 GET/다운로드는 익명 상태 그대로 둔다. 익명 Actor/Reader를 만들지 않는다. 이후 #106 G4에서 도면 POST 및 Current PUT = Editor/Admin+담당 Site, DELETE = 동일 조건+기존 삭제 비밀번호 AND를 적용할 준비만 제공한다. Admin도 Site 자동 권한은 없다. 신규 영속 Outline/Memo/Type·관리/Audit GET를 익명 공개하지 않는다.

작업 순서는 Manager 요구/설계/AC 기록 → Developer 구현 → Manager 검토 → QA 독립 검증·결과 기록 → Manager 판정 → root commit/push·PR 리뷰/충돌 확인·CI 시작이다. 현재 요청에는 CI 결과 모니터링, 병합, 이슈 종료, GHCR 게시 또는 배포가 포함되지 않는다. 지정 역할과 실제 수행 모델·대행 사유는 TestReport에 사실대로 기록한다. 계획 작성 시점 구현/시험은 **NOT RUN**이었다. 현재 구현·독립 QA 실행 상태는 TestReport를 기준으로 한다.

## 구현 및 Manager 인계

- `src/server/auth/login-service.ts`: 명시 서비스·초기/일반 암호 변경·Session/Actor·HMAC proof, `g3-request.ts`: 실제 Route와 분리된 Request/Response 계약.
- `src/tests/fixtures/auth-g3/store.ts`: G1 DB adapter·원자 Audit/세션·공유 limiter, `login-worker.ts`: 실제 독립 프로세스 경쟁 시험용 결과 코드 전용 harness.
- `src/tests/integration/auth-g3.test.ts`: TC001~012와 경쟁/로그아웃 중 암호 변경/limiter 정리 실패 회귀. Typecheck/Lint·전체 자동 시험·기존 앱 E2E 실행 근거는 TestReport에 분리 기록한다.

Manager는 소스 검토 및 [TestReport](TestReport.md)의 독립 QA(53 files/288 tests, G3 18개 포함; Typecheck/Lint/Build 및 기존 CAD 브라우저 회귀 4개 PASS)를 근거로 **격리 G3 로컬 구현 수용 / 재작업 없음**으로 판정했다. PR CI/Docker 결과는 아직 PENDING이며, 실제 LAN·운영 복구/G7 Owner 승인과 Auth/API/Prisma/Compose 활성화는 이번 수용에 포함되지 않는다. G7 운영 OFF 유지.

## 요구사항

| ID | 계약 | AC / TC |
| --- | --- | --- |
| P4-G3-R01 | scrypt 기존 계정 검증, 최초/복구 비밀번호 강제 변경, 로그인·로그아웃과 401/403 결과 분리 | AC1 / 001~003 |
| P4-G3-R02 | CSPRNG 32 byte token, DB에는 SHA-256 hash만, 절대 8h·idle 30m·최대 3개 원자 발급, 네 번째 거부 | AC2 / 004~006 |
| P4-G3-R03 | logout 단일 세션, disable·암호 변경·복구 전체 세션 revoke, 상태/암호 변경과 Audit 원자성 | AC3 / 003,007~008 |
| P4-G3-R04 | 매 요청 서버 Session→ACTIVE User→Role/Site/SpecialGrant로 신뢰 Actor 구성, 클라이언트 ID/Role/Site 및 삭제 암호를 신원으로 사용하지 않음 | AC4 / 009 |
| P4-G3-R05 | HttpOnly/SameSite=Strict/Path=/ HTTP cookie·삭제 cookie, PROD proxy 및 DEV direct 정상 Origin/CSRF/로그인 제한 흐름 | AC5 / 010~011 |
| P4-G3-R06 | 격리 DB/운영 OFF, 기존 CAD/API·Version/Current/SHA 불변, 승인 범위/실행 증거 구별 | AC6 / 012 + 회귀 |

## 설계

### 서비스·저장소 경계

`server/auth/`에 명시 호출 서비스와 타입을 두고 DB 인터페이스를 주입한다. G3 fixture adapter는 `tests/fixtures/auth-g3/`에서 G1의 경로 guard와 일회용 DB만 연다. App Router/`server/db.ts`는 이 서비스를 import하지 않는다. G3 요청/응답 adapter가 필요하면 App Route 밖의 비연결 함수로 만들고, Node Request/Response 또는 격리 시험 harness로 검증한다. SQL/제약의 단일 기준은 [Database](Database.md)이며 운영 Schema를 만들지 않는다.

기존 `password.ts`, `session.ts`, `guards.ts`, `audit.ts`를 우선 사용한다. G1의 Session INSERT 트리거는 must-change 계정을 거부한다. **일반 세션을 발급하기 위해 이 제약을 약화하거나 must-change를 임시로 끄지 않는다.** 새 provisional Session 테이블도 만들지 않는다.

### 초기 변경 및 결과 계약

1. 로그인명은 기존 G2 규칙과 동일하게 정규화하고 현재 scrypt credential을 확인한다. 로그인명 형식 오류는 400, 존재하지 않는 계정/잘못된 비밀번호는 401이며 세션을 발급하지 않는다.
2. 올바른 credential이나 DISABLED 계정이면 403 `ACCOUNT_DISABLED`, ACTIVE+must-change이면 403 `PASSWORD_CHANGE_REQUIRED`다. 후자는 cookie/Actor 없이 초기 변경 화면용 상태만 제공한다.
3. 초기 변경은 로그인명+기존 비밀번호+새 비밀번호를 다시 제출한다. trusted Origin을 확인하고 현재 hash와 must-change 상태를 재검증한다. 최소 8자·기존 용량 제한 및 이전 값과 다른 새 비밀번호를 사용한다. 새 hash, must-change=false, 기존 세션 전량 revoke, `PASSWORD_RESET` Audit을 한 거래로 처리한다. 성공 시 cookie를 지우고 **새 로그인**을 요구한다.
4. 일반 암호 변경은 유효 세션/현재 credential/정상 CSRF 검증을 요구하며, KDF 이후 최종 transaction에서 그 세션의 수명·폐기 상태와 credential을 다시 확인한다. 모든 세션을 폐기하고 새 로그인한다. G2 복구로 must-change가 켜지면 다시 2~3 흐름을 따른다.
5. 보호 요청은 cookie 없음·형식/토큰 오류·미발견·만료·폐기 401, 유효 세션에서 확인된 계정 비활성/필수 변경 및 업무 권한 부족은 403이다. 계정 비활성 처리로 이미 폐기된 세션은 401이 된다. 세션 상한은 409 `SESSION_LIMIT`, 기존 로그인 제한은 429, 입력 오류는 400으로 구별한다.
6. logout은 유효 세션을 DB에서 revoke하고 삭제 cookie를 보낸다. 이미 없거나 폐기된 cookie의 재로그아웃은 성공적인 삭제 cookie 응답으로 일관되게 처리한다. 인증된 변경 요청의 정상 CSRF guard는 유지한다.

위 응답 계약은 격리 adapter에만 적용하며 기존 운영 API 응답을 바꾸지 않는다. 비밀번호·token/hash·Cookie 헤더·개인 credential 입력을 에러/로그/Audit에 넣지 않는다. 로그인 raw token은 성공 commit 후 Set-Cookie 전달에만 사용한다.

### 원자성·만료·Actor

- scrypt 비동기 작업은 DB write lock 밖에서 수행할 수 있다. 이후 `BEGIN IMMEDIATE` 안에서 현재 User 상태와 **검증에 사용한 password hash가 여전히 동일한지** 재검증한다. 오래된 credential로 복구/암호 변경 이후 세션이 생성되는 경쟁을 막는다.
- login은 상태 확인+활성 세션 count+INSERT+`LOGIN_SUCCESS` Audit을 한 거래로 수행한다. 실패하면 세션/Audit 모두 rollback하며 raw token/cookie를 반환하지 않는다. DB의 기존 3개 슬롯 트리거도 유지한다. SQLite BUSY는 성공으로 처리하지 않는다.
- 인증은 hash 조회, 현재 계정·수명 검사, monotonic lastSeen touch, DB grants 조회를 하나의 일관된 작업으로 처리한다. `now >= expiresAt` 또는 idle `>= 30m`는 만료이고, touch가 절대 expiresAt을 연장하지 않는다. 미래 lastSeen/시계 역행은 거부하며 만료 세션을 부활시키지 않는다.
- Actor의 User ID/Role/Site/SpecialGrant는 DB에서만 읽고 매 인증 요청 갱신한다. 반환에는 passwordHash/tokenHash/raw token이 없다. 클라이언트 claim을 merge하지 않는다. G4의 업무 write transaction에서는 Actor/권한을 다시 확인해야 하므로 이 스냅샷만으로 미래 쓰기 원자성을 주장하지 않는다.
- logout revoke+Audit, 암호 변경+전체 revoke+Audit은 한 거래다. G1 disable 및 G2 nonce recovery를 실제 호출하여 G3 세션이 모두 무효화됨을 검증한다. 실패 주입 시 상태/hash/session/audit의 이전 상태를 보존한다.
- `LOGIN_DENIED` 감사 Actor는 null이며 서버가 확인한 User는 affected/target에만 기록한다. 미존재 계정은 null affected·안전한 고정 target을 사용한다. 제출 username·password·cookie·CSRF/token/hash를 감사 ID나 내용으로 복제하지 않는다. 알려지지 않은 사용자를 위해 가짜 User FK를 만들지 않는다.

### Cookie·정상 요청

HTTP용 기존 `cad_session`은 `HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`, 만료 cookie는 Max-Age=0을 사용한다. Secure/TLS 보호가 있다고 주장하지 않는다. DB idle/절대 만료가 cookie 잔여 시간보다 우선한다.

신뢰 Origin/peer는 시험 또는 향후 서버 설정에서 전달하고 임의 Client Role/Host claim으로 Actor를 만들지 않는다. 로그인 및 초기 변경은 정상 Origin과 기존 limiter를 적용하며, 로그인 후 변경은 기존 `requireSessionCsrf` 계약에 맞는 세션 귀속 proof를 사용한다. proof는 raw session token을 key로 한 HMAC-SHA256(`cad-g3-csrf-v1`)이며 login/session 응답에서만 제공한다. 이후 요청의 `x-csrf-token`과 cookie에서 서버가 재계산한 proof를 기존 guard로 비교한다. DB에는 별도 raw secret을 저장하지 않는다. 기존 5회/60초 limiter 정책은 동일 SQLite를 쓰는 다중 프로세스에서도 일관되게 적용한다. G3 fixture의 `G3LoginAttempt`는 key hash/count/window end를 보존하고 `BEGIN IMMEDIATE`로 예약하며 성공 후 reset한다. 이미 세션/암호 거래가 commit된 뒤 reset에 실패하면 성공 응답/cookie를 보존하고 남은 제한 창은 60초 만료에 맡긴다. 물리 계약은 Database에 기록하며 운영 Prisma/DDL에는 반영하지 않는다. 별도 공격/IP 위조 방어 구현으로 확대하지 않는다. 정상 PROD proxy의 외부 Origin/Host와 DEV direct Origin, cookie 발급→다음 요청→logout 삭제를 시험한다. 격리 함수/HTTP 검증은 실제 Windows Nginx·WSL2·사내 PC 2대의 브라우저 cookie 실증을 대신하지 않는다(#108).

## Acceptance Criteria / Test Case

| TC-P4-G3 | AC | 검증 |
| --- | --- | --- |
| 001 | AC1 | 유효/오류/미존재/비활성 계정 로그인 결과, 세션·Audit/정보 제외 |
| 002 | AC1 | G2 bootstrap/recovery must-change가 일반 세션을 발급하지 않음; 기존 암호 재검증·최소 길이/동일 암호 거부·변경 후 새 로그인 |
| 003 | AC1/3 | 일반 암호 변경 및 최초 변경 실패 rollback, 기존 세션 전량 폐기, 새 암호 로그인만 성공 |
| 004 | AC2 | 토큰 32 byte/43문자, hash만 저장, absolute 8h/idle 30m 직전·정각, touch·clock rollback·재연결 후 지속 |
| 005 | AC2 | 3개 발급/4번째 거부, 두 DB 연결의 경쟁에서 총 3개 이하, 만료/폐기 후 슬롯 재사용 |
| 006 | AC2 | 발급 Audit 실패 rollback/쿠키 미발급, credential 검증 후 비밀번호·계정 변경 경쟁 재검증 |
| 007 | AC3 | logout 단일 세션 폐기·삭제 cookie·다른 세션 유지·반복 호출, 실패 rollback |
| 008 | AC3 | 실제 G1 disable/G2 recovery 호출 후 전체 세션 불가, nonce/암호/세션/Audit 원자성 회귀 |
| 009 | AC4 | DB User/Role/Site/SpecialGrant Actor, Grant 변경 다음 요청 반영, claim 미사용, 익명 Actor 없음 |
| 010 | AC5 | PROD proxy/DEV direct 정상 Origin·세션 cookie round-trip·logout 삭제·CSRF proof·401/403 계약 |
| 011 | AC5 | 기존 정상 Origin/CSRF 및 shared DB 로그인 5회/60초 제한·만료/reset·두 연결 일관성, 비밀값 응답/감사/로그 제외 |
| 012 | AC6 | G1 격리 guard/운영 API·Prisma·Compose 등 diff 0, 기존 CAD Version/Current/SHA/삭제 암호 불변·일반 E2E |

각 TC는 구현 후 실제 실행 명령·결과를 [TestReport](TestReport.md)에 기록한다. 최신 소스의 Typecheck, Lint, Unit/Integration, Build, 관련 E2E와 기존 CI Docker/Migration 검증을 수행하고 실패를 해결한다. 로컬 실행과 PR CI 시작/성공, 사내 현장 증거를 구분한다. 실제 LAN/운영 데이터 백업·복원과 G7 승인은 이번 PASS 범위가 아니다.

## Developer 작업 분할과 완료 조건

1. 현재 fixture/policy를 재사용하는 서비스·store 타입, 오류 계약과 초기/일반 변경 흐름을 구현한다. 원자 login/hash 재검증 및 Actor 재조회가 코드로 확인되면 완료.
2. disposable G3 DB adapter와 TC001~009를 구현한다. G1/G2 회귀를 유지하고 실패·경쟁·만료 경계를 실제 DB로 검증하면 완료.
3. 비연결 요청 adapter/정상 cookie·Origin·CSRF·limiter TC010~012를 구현한다. 운영 import 경로 0과 비밀값 미출력이 확인되면 완료.
4. 구현 파일·명령·잔여 한계와 요구→TC 관계를 Manager에 보고한다. QA 전 PASS 또는 운영 활성화를 선언하지 않는다. 새 내부 기능 버전 후보는 0.41.0이며 package/lock·README/ChangeLog는 같은 값으로 정렬한다.

Manager는 broad 설계/요구/시험 참조 문서를 정렬하고 QA는 실제 결과를 독립 기록한다. root가 최종 diff·비밀/산출물 제외·review/conflict를 확인하고 commit/push·PR CI 시작까지만 수행한다.
