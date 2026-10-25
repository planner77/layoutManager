# Issue #104 — G2 최초 Admin 생성·단발 복구 및 Secret 보호

## Owner 승인·범위

2026-10-26 기준 #102 G0 Owner R1(지정 사내 운영 담당자 실행, Owner 운영 책임), 병합된 #103 G1 User/Session/Grant/Audit/Nonce SQLite fixture 및 #107 G5 Preview를 따른다. 실 수행자/승인·대리인·Secret 실제 경로/Nonce/backup/회수 이력은 **사내 비공개 SOP**, 공개 GitHub/CI 로그에는 기록하지 않는다. #102 문서 PR #114는 확인 당시 OPEN/mergeable=false로 G0 별도 정렬 필요. 실 운영 Auth/Admin/영속 API·Prisma/DDL·Compose/Nginx/.env 및 CAD DB/S3 원본·익명 GET/Current/Delete 변경 **0**, G7 #109 Owner 별도 Go/No-Go 전 OFF.

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

이 연결 환경에서는 tsc/npm/Vitest/Playwright/Docker/실 사내 PC·DB/CAD/S3 시험 미수행. CI Run 시작/성공을 구분하며 실제 실행 확인 전 PASS 체크 금지. 이후 #105 G3 로그인/초기 변경, #106 G4 권한, #108 G6 E2E·Backup/Restore, #109 G7 별도 운영 승인 순서. 업로드 POST의 Editor+Site 권장안, Audit 365일 경과 자동 정리/Backup 세칙은 여전히 미확정이다.
