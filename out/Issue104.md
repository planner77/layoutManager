# Issue #104 — G2 최초 Admin 생성·단발 복구 및 Secret 보호

## Issue #104 / PR #118 — CI 검증과 신규 GHCR v0.40.5 게시 후보 (2026-10-26)

- **기존 코드 HEAD 검증 성공:** [PR CI 40234510320](https://github.com/planner77/layoutManager/actions/runs/40234510320), `f5f7ea2e`, Verify·Docker completed/success. 첫 실패 Run 40232479678는 실패 원장에 보존.
- **신규 릴리스 요청:** 기존 v0.40.4 GHCR App/Migrator pair/tag 불변을 지키기 위해 0.40.5 PATCH 후보 package/lock 루트 일치. G2는 사내 비운영 격리 초기 관리자·Nonce 복구 테스트/도구이며 실제 기존 CAD/Viewer/Auth API/Prisma/운영 데이터 기능 자동 활성화 아님.
- **잔여 게이트:** 0.40.5 HEAD의 새로운 PR CI 성공+리뷰 0+Main behind 0/mergeable 이후 PR squash 병합/Issue 종료, 이어 Main CI conditional paired GHCR build/promotion 시작. Main CI 시작만으로 GHCR 공개 게시 완료를 주장하지 않으며 사용자는 CI 모니터링을 요청하지 않았음. G7 Owner 별도 운영 Go/No-Go와 G6 실제 DB/CAD/S3 복구는 계속 BLOCKED.

## #118 최초 PR CI 실패·파서 교정 (2026-10-26 KST)

- **Run 40232479678 / HEAD `534de74c`:** Verify Job `121286959176` TypeScript 파서 오류로 `completed/failure`, Docker Job `121286959564` `completed/success`. `tests/integration/auth-g2.test.ts:198:22` TS1005 및 :232 TS1128 후속 파싱 오류. :213도 같은 잘못된 괄호와 optional chaining 결합으로 확인.
- **Fix [ae002997](https://github.com/planner77/layoutManager/commit/ae002997bcbc394cf40a9adb9c0475d74f73f22e):** 복구 재사용/장애 테스트의 `db.prepare(...).get(adminId)?.password_hash`와 `?.revoked_at`를 각각 `replayHash`/`revokedAtBeforeRetry` 변수로 분리하여 올바른 식으로 변경. 코드 작성 당시 TypeScript 검증을 실행하지 않은 것이 직접 예방 검증 공백. 로컬 tests 및 최신 HEAD CI 성공은 아직 `NOT VERIFIED`.
- `npm ci`/Prisma Client 생성 성공, Typecheck exit2로 Lint·Unit/Integration·Build·E2E는 **SKIPPED**. 실제 런타임 장애나 권한/보안/DB의 실패로 확장하지 않는다. #102 Owner 6개 승인 문서 PR #114가 main에 병합됨에 따라 G2 문서와 최신 main을 통합하며, 실 운영 Auth/Prisma·관리 API는 G7 #109 승인 전 OFF.

## Owner 승인·범위

2026-10-26 기준 #102 G0 Owner R1(지정 사내 운영 담당자 실행, Owner 운영 책임), 병합된 #103 G1 User/Session/Grant/Audit/Nonce SQLite fixture 및 #107 G5 Preview를 따른다. 실 수행자/승인·대리인·Secret 실제 경로/Nonce/backup/회수 이력은 **사내 비공개 SOP**, 공개 GitHub/CI 로그에는 기록하지 않는다. #102 문서 PR #114는 2026-10-26 main에 병합 완료. G0 #102는 별도 OPEN이며 POST 도면 등록도 Editor/Admin+담당 Site로 Owner 최종 승인되었다. 실 운영 Auth/Admin/영속 API·Prisma/DDL·Compose/Nginx/.env 및 CAD DB/S3 원본·익명 GET/Current/Delete 변경 **0**, G7 #109 Owner 별도 Go/No-Go 전 OFF.

## 기술 구현

- `src/server/auth/bootstrap.ts`의 `decideAdminSetup` (최초/복구 flag 모두 OFF 기본, 동시 ON/불완전 설정 거부)와 `password.ts` salted scrypt(local-v1) 재사용. 사용자명 영문 시작 ASCII 3~64·lowercase, 비밀번호 8자 이상·UTF-8 1024 byte 이하·첫 변경 필수.
- `src/server/auth/admin-setup.ts`는 명시 `executeAdminSetup(env,store,requestId,now)`에서만 Secret 파일을 읽는다. 파일은 Linux 실행 UID 소유 0400/0600 regular absolute path, final symlink O_NOFOLLOW, UTF-8·NUL·개행 검증, 0444 Compose Secret/Windows 직접 거부. 파일 값·경로·hash·nonce를 출력하지 않으며 입력 Buffer는 사용 후 0으로 지우지만 JS 문자열 완전 zeroize는 보장하지 않는다.
- `src/tests/fixtures/auth-g2/store.ts`는 G1 임시 DB에서만 `BEGIN IMMEDIATE`로 **인증 DB 최초 빈 상태** 검사 후 User UUID+Admin RoleGrant+`ADMIN_BOOTSTRAP` Audit 원자 생성. 이미 User나 이전 인증 이력이 있으면 Admin 자동 승격 금지, 동시 생성 중 한 건만 성공, 재시작 기존 Admin ID/Hash/Role 덮어쓰기 0. 감사 actor=null/affected_user_id=신규 Admin, 사내 담당자 기록 requestId와 연결.
- 복구는 기존 ACTIVE Admin UUID/16~128 URL-safe 단발 nonce를 사용. G1 `consumeG1Recovery`가 nonce SHA-256 unique + password hash/must-change + 모든 기존 AuthSession revoke + `ADMIN_RECOVERY` Audit을 한 거래로 변경하며 replay/실패 시 전체 rollback. G1 감사 actor=null/affected_user_id=대상 Admin으로 구분해 실제 운영자 신원을 허위 로그인 Actor로 쓰지 않는다. Status/Role/Site/UUID 불변.
- `src/scripts/auth-g2-isolated.ts`는 `--ack-isolated`와 G1 `cad-auth-g1-*/fixture.sqlite` Guard만 지원, 앱 startup·release migrator·운영 DB에 연결하지 않는다. 사용 전 G1 migration까지 적용된 임시 DB가 필요하다.

## 비공개 담당자 SOP / 격리 실행

실 인명/대리인·승인 근거, 작업 ID/requestId, 상태 확인·백업·권한 제한 Secret 생성/마운트/회수, 복구 nonce 단발성·재사용 금지, 실패 rollback·Owner 서명을 사내에서 기록한다. Secret 내용은 .env에 쓰지 않는다. 제한 임시 프로세스에서 `ADMIN_BOOTSTRAP_ENABLED=true`+username+file 또는 `ADMIN_RECOVERY_ENABLED=true`+Admin ID+nonce+file을 공급하고(둘 다 true 금지), `cd src && npx tsx scripts/auth-g2-isolated.ts --fixture-db /tmp/cad-auth-g1-EXAMPLE/fixture.sqlite --request-id G2_PRIVATE_RUN_ID --ack-isolated` 실행. 경로·ID는 placeholder이며 실 값은 공개 문서에 기록 금지. 실행 뒤 secret file/mount 회수, flag OFF, nonce 재사용 금지.

## AC와 증거

| AC | Test ID | 현재 상태 |
| --- | --- | --- |
| G2-AC1 환경값/Secret 누출 0·실패 차단 | TC-P4-G2-001~003 | 테스트 작성, 실행 NOT RUN |
| G2-AC2 최초 한 번/동시성·재시작 불변 | TC-P4-G2-004~006,009 | 테스트 작성, 실행 NOT RUN |
| G2-AC3 복구 nonce/세션 revoke/감사 원자성 | TC-P4-G2-007~008 | 테스트 작성, 실행 NOT RUN |
| G2-AC4 격리 DB/장애복구/운영 OFF | TC-P4-G2-001~009 + PR diff | 테스트 작성, 실행 NOT RUN |

이 연결 환경에서는 tsc/npm/Vitest/Playwright/Docker/실 사내 PC·DB/CAD/S3 시험 미수행. CI Run 시작/성공을 구분하며 실제 실행 확인 전 PASS 체크 금지. 이후 #105 G3 로그인/초기 변경, #106 G4 권한, #108 G6 E2E·Backup/Restore, #109 G7 별도 운영 승인 순서. POST 업로드 Editor/Admin+담당 Site는 Owner 승인 완료. Audit 365일 이후 실제 자동 정리·Backup/Restore 세칙과 G7 별도 운영 승인은 여전히 미확정이다.
