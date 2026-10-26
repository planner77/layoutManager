# Issue #108 — G6 사내 업무 E2E·일관 백업/격리 Migration/Restore 수용

작성: 2026-10-26. [GitHub #108](https://github.com/planner77/layoutManager/issues/108), 상위 [#96](Issue96.md), 선행 [#102](Issue102.md)·[#103](Issue103.md)·[#104](Issue104.md)·[#105](Issue105.md)·[#106](Issue106.md)·[#107](Issue107.md), 후속 [#109](https://github.com/planner77/layoutManager/issues/109). 별도 DESIGN.md 없음; [AGENTS](../AGENTS.md)·[Architecture](Architecture.md)·[Decisions](Decisions.md)·[Database](Database.md)를 기준으로 한다.

## 0. 현재 판정 — 구현과 현장 수용 분리

- **구현 범위:** 비운영 src/scripts/g6-evidence.mjs 증거 매트릭스/사내 비공개 매니페스트 검사, src/tests/unit/g6-evidence.test.ts 정책 Unit, src/tests/integration/g6-backup-restore.test.ts 일회용 실제 CAD 6개 Migration SQLite+합성 local CAD+**모의** S3 객체 백업·격리 G1 DDL dry-run·데이터 변형·실 파일 복원, src/tests/fixtures/g6/manifest.example.json 전부 NOT_RUN 템플릿. 신규 실 스키마/인증 Route·배포 기능 **0**.
- **아직 미확인:** 해당 변경 HEAD의 CI/독립 QA, 사내 Windows Nginx↔WSL2 실접속, 서로 다른 PC 2대/DEV 직결·실 Viewer·Upload·Cookie, 실 원격 S3/DB/CAD 동일시점 백업과 실제 Restore/롤백, 운영자의 증거 서명. 모두 수행 증거 전 **NOT RUN/PENDING**, 자동 시험 PASS여도 현장 수용 아님.
- **불변:** 운영 src/prisma/schema.prisma, migrations, src/app/api, src/server/db.ts, .env, Compose/Nginx, 실제 CAD bytes·SHA/Version/Current·삭제 비밀번호 및 GHCR 태그 수정·활성화 금지. #109 Owner **별도** Go/No-Go 전 운영 Auth/Admin/관리·Outline/Memo/Type/Logs/Audit 영속 API OFF. 기존 CAD GET 익명 유지.
- **R1 우선:** 사내 HTTP 공격·탈취/침투·TLS/MFA 위협 E2E는 #102 Owner 범위 밖(OWNER_ACCEPTED_SCOPE), '보안 PASS'가 아니다. 정상 업무/세션/원자성/데이터 복구 검증은 필수.

## 1. 현장 수용 행렬·증거 ID

사내 실제 값은 비공개 원본 증거 저장소에서 관리한다. GitHub에는 아래 TC ID와 EV-... 같은 불투명 증거 **식별자**, 상태/Run·Job·HEAD와 공개 가능한 사유 코드만 기록한다. 실제 IP/CIDR/호스트/계정명·비밀번호·Session Cookie·Raw SHA·원본 CAD·S3 bucket/key·로그 본문은 올리지 않는다.

| AC / 실행 항목 | 세부 확인 | 현 시점 |
| --- | --- | --- |
| G6-AC1 / TC-P4-G6-003~004 | G3 정상 Login/Logout, 8h/idle30m/max3, bootstrap/recovery, G4 Role/Site/Version·Grant·Audit, 허용/거부/원자 rollback | 기존 합성 G1~G4 테스트 존재. 실 Route 통합 E2E **NOT RUN** |
| G6-AC1 / G0-BIZ-01~06 | 익명 기존 GET/Viewer/다운로드 성공; POST·Current는 Editor+담당 Site, DELETE는 Editor+Site+기존 암호 AND. 익명·Reader·타 Site·무 Grant Admin 거부, Actor/Audit·SHA·Current 불변 | 실제 인증 쓰기 Route는 G7 전 OFF → **NOT RUN** |
| G6-AC2 / TC-P4-G6-004 | 서로 다른 사내 PC 최소 2대 → **실 PROD Nginx 경유**, 실제 Viewer·다운로드/기존 허용 업무 동작, 직접 Backend 포트의 비의도 publish 점검, **별도 DEV App 직결 + DB/CAD 분리** | G5 Preview만 자동 검사됨; 현장 **NOT RUN** |
| G6-AC3 / TC-P4-G6-007 | 동일 snapshotId의 SQLite online backup + local CAD bytes + 실제 S3 object/version bytes, 격리 dry-run FK/Unique/Current·Version·SHA 검증, 실 Restore·이전 호환 App/Migrator Pair/DB 롤백 | 이 PR에는 **합성 local+mock S3 격리 리허설**만 있음; 실제 **NOT RUN** |
| G6-AC4 / TC-P4-G6-001~006 | Run/Job/HEAD, TC 결과와 스킵/취소·실패 원장, 내부 EV ID, Owner/운영 담당자·QA 판정, 미확정 보존 | 평가 도구 작성; 현장 증거 **NOT RUN** |
| G6-AC5 / TC-P4-G6-002 | 배포/Schema/기존 API 변경 0, 운영 OFF, #109 별도 Owner Go/No-Go | 코드/문서 범위에서 OFF 유지. 실제 운영 상태는 현장 확인 필요 |

## 2. 사내 실제 환경 — 비공개 SOP (실행 전 Owner/담당자 승인 필수)

1. **작업 범위/분리:** 운영 백업 대상 식별·작업창/대체자/복원 책임 승인, 충돌 작업·백그라운드 업로드/삭제/스토리지 정리/DB 쓰기 정지(quiesce) 및 DB/CAD/S3 동기 복구 경계 확정. 실 DB·S3·CAD는 GitHub CI나 개인 개발 환경에 복사 금지. 테스트 중 기존 운영 서비스에 인증 G1 DDL을 적용하지 않는다.
2. **스냅샷:** 하나의 불투명 snapshotId와 사내 UTC 시각으로 SQLite online backup 및 PRAGMA quick_check, foreign_key_check, DB CAD 테이블/Version 행 수/ID·Current 소속/원본 sha256/size 목록을 동결. 같은 정지 시점에 local CAD 파일 원본 bytes와 S3 **실제 객체 bytes** 및 version identifier를 보관하고 각각 SHA-256·size·누락/중복을 검증. S3 ETag는 multipart 등에서 SHA-256 증명이 아니므로 ETag만으로 대체하지 않는다. AuditEvent 및 nonce는 물리 파기하지 않는다.
3. **격리 dry-run:** 위 스냅샷 사본을 **별도** DB·파일/스토리지 namespace로 가져와 G7에서 실제로 승인할 Prisma migration 순서만 dry-run. foreign_key_check=0, FK/Unique·삭제 비밀번호·Version·Current 0/1·원본 SHA, User/Session/Audit 및 App/Migrator 버전 호환성 비교. 지금 제공한 G1 fixture 테스트는 **운영 Prisma 전환 dry-run 자체가 아님**. 원본 DB에 G1 SQL/운영 DDL 적용 금지.
4. **실 Restore 리허설:** 테스트 대상 서비스를 중지하고 백업 스냅샷으로 격리 DB·local CAD·S3 객체를 실제 복원, 이전/이후 Version/Current/sha256/size와 bytes를 비교. 조회/Viewer/다운로드/Current 상태를 확인. DB만 돌리고 CAD/S3를 안 돌리는 부분 복구는 FAIL. 장애 주입 및 App/Migrator/DB Pair 하향 호환 체크 후 **복구 실패 시 즉시 중지**하고 Owner 판단 전 자동 재시작/자동 역마이그레이션 금지.
5. **LAN 경로/업무 수용:** 서로 다른 PC 두 대의 PROD URL→현장 Nginx→App/업무 Viewer/다운로드를 시험하고 운영 App 직접 port의 의도하지 않은 외부 publish 여부 확인. DEV direct는 분리된 테스트 DB/CAD만 사용. Auth Session/Cookie/POST/Current/Delete 보호 Route는 G7 전 실 운영에 없으므로 **현행 익명 API 성공**을 새 RBAC E2E PASS로 전용하지 않는다. 승인된 격리 환경/추후 G7 전환 리허설에서만 인증 쓰기를 시험한다. 테스트 누락은 그대로 NOT RUN.
6. **승인 기록:** 사내 EV ID, 담당자/QA/Owner 결론, 오류/장애·Run/Job/HEAD, Snapshot ID 일관성, 복원 소요·정합성 측정, 롤백 실행/중단 조건을 비공개 기록. 공개 요약에는 사례·상태·최소 참조만 기록. 부족하거나 실패하면 #109 BLOCKED, 미결정 감사 365일 만료분 purge SOP는 후속 승인까지 보류.

## 3. 로컬 증거 점검 사용법 (실데이터 출력 금지)

공개 저장소의 src/tests/fixtures/g6/manifest.example.json은 **모두 NOT_RUN**의 스키마 참고용이다. 사내 전용 접근제한 위치(저장소 외부)에 복사한 후에만 체크별 상태(PASS/FAIL/CANCELLED/NOT_RUN), EV-... 증거 ID를 기록. 합격 주장에는 PC 두 개 서로 다른 PC-... 식별자, Snapshot 관련 다섯 항목이 공통 SNAP-... ID, dry-run/restore 여섯 정합성 boolean 전부 true, App/Migrator 동일 SemVer, 운영 OFF 필요. 사내 실제 주소·SHA·사용자 이름을 ID 자리에 쓰지 않는다.

    cd src
    node scripts/g6-evidence.mjs /private/g6/evidence.json

종료코드 0은 매니페스트 **형식상 READY_FOR_OWNER_REVIEW**일 뿐 실제 현장 PASS/수용/배포 승인이 아니다. 3은 PENDING 또는 BLOCKED, 2는 비공개 입력 경로·구문·크기 오류다. 입력은 절대 경로/regular/저장소 밖/262144 byte 이하이고 symlink 직접 입력·Git worktree 내부(상위 symlink 포함)는 거부한다. 출력은 정해진 코드와 건수만, 원본 경로/토큰/SHA/내용을 출력하지 않는다. 사내 전용 접근제어는 별도 필요. 이 CLI는 어떤 네트워크나 DB도 열거나 수정하지 않는다.

자동 합성 검사: cd src && npm test -- tests/unit/g6-evidence.test.ts tests/integration/g6-backup-restore.test.ts. 실제 실행 PASS는 [TestReport](TestReport.md)에 **관측 근거가 있을 때만** 기록한다. 기존 G1 TC-P4-G1-009와 G5 TC-P4-G5-007은 관련 기초 증거이며 실제 S3/현장 E2E는 아니다.

## 4. PR 및 G7 인계

- 변경 파일은 test-only + offline script + Markdown + 전체 NOT_RUN 샘플. src/app/운영 Prisma·Migration/Compose/Nginx/.env/기존 CAD 저장소·릴리스 태그를 수정하지 않는다.
- 최신 HEAD의 Typecheck/Lint/Vitest/Build/Chromium E2E/Legacy E2E/Docker 각 실행·취소·스킵·실패를 [TestReport](TestReport.md)/[FailureLedger](FailureLedger.md)에 **구별**해 기록한다. PR CI 시작은 SUCCESS가 아니며 CI 모니터링·병합·Issue 종료·GHCR 게시를 이번 지시 범위에 포함하지 않는다.
- #108은 합성 도구 구현 PR을 만들더라도 **실 LAN과 실제 S3/DB/CAD 복원 및 Owner 증거 전 OPEN/BLOCKED**. #109는 G6 현장 수용 및 별도 Owner Go/No-Go까지 계속 BLOCKED. 기존 공개 GET 및 업무 API 현행 동작은 변경하지 않는다.
