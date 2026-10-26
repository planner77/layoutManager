# Issue #109 S2 — 사내망 비반출 증거 및 운영 전환 준비

## 상태 및 분리 원칙

- Owner의 S1 수용과 S2 승인 의사는 [Issue #109](https://github.com/planner77/layoutManager/issues/109)에 기록되어 있다.
- 이는 **실 운영 Cutover를 이미 구현·검증했다는 증거가 아니다.** 운영 API는 여전히 기존 익명 쓰기 경로이고 Auth/Grant/Audit와 동일 트랜잭션으로 연결되지 않았다. `G7_AUTH_ENABLED`를 운영에 설정하지 말 것.
- 사내 로그·CAD·SQLite·S3 원본·해시 목록·운영 주소·Secret을 GitHub에 올릴 필요가 없다. 대신 **사내 단독 보관**하는 증거와 외부 공유 가능한 상태 코드만 구분한다.
- 이 가이드는 **준비 및 Readiness 판정**이며 실 DB를 변경하거나 앱/마이그레이터를 배포하지 않는다.

## 사내 전용 Manifest/오프라인 평가

`src/server/g7-staging/s2-readiness.ts`는 22개 필수 항목을 열거하며 `src/scripts/g7-s2-readiness.ts`는 사내에만 있는 JSON을 검사한다.

실제 수행 담당자는 사내 보안 영역 밖의 리포지토리에 원본을 커밋하지 말고, 별도 절대경로에 JSON을 저장한다. JSON은 아래 필드만 허용한다.

- 최상위: `schemaVersion=1`, `scope=G7_S2_READINESS`, `operationalActivationOff=true`, `sourceCommit`, `schemaId`, `appDigest`, `migratorDigest`, `rollbackAppDigest`, `rollbackMigratorDigest`, `changeRequestId`, `proposedWindowUtc`, `ownerDecision`, `ownerApprovalId`, `ownerApprovedAtUtc`, `checks`.
- `checks`의 각 항목: `status`(`PASS/FAIL/NOT_RUN/CANCELLED`), `evidenceId`, `reviewerId`, `testedAtUtc`, 복구 관련 항목은 `snapshotId`. **ID는 사내 증거 원본의 위치를 참조하는 식별자일 뿐 실제 시험을 대신하지 않는다.**
- Stage/운영 식별에 사용할 digest 4개는 실제 OCI registry에서 확인한 `sha256:64hex`여야 한다. 단순 형식 검사 통과만으로 레지스트리 일치성이 입증된 것은 아니다.
- 제시된 상태의 검증이 불가능한 경우 `NOT_RUN`을 유지한다. 임의 증거 ID·가짜 SHA/PASS 생성 금지.

사내에서 `src/` 디렉터리 기준:

```bash
npx tsx scripts/g7-s2-readiness.ts /absolute/private/s2-approval.json
```

반환: `PENDING`(미수행), `BLOCKED`(잘못된 데이터/실패/승인 누락), `READY_FOR_OWNER_REVIEW`(형식적으로 완비). **세 상태 모두 `operationalGo:false`를 출력한다.** `READY_FOR_OWNER_REVIEW`는 실제 운영 승인/비밀·재해복구 결과 자동 확인이 아니다. 원본 데이터 값·비밀번호·주소·해시는 출력하지 않는다.

## 실제 미구현 항목 — 별도 구현·검증이 선행되어야 함

| 항목 | 현재 S1 | S2 완료/운영 GO에 필요한 실증 |
| --- | --- | --- |
| 기존 CAD 업로드 | Stage 전용 256KiB DXF JSON/base64 | 기존 Multipart + Local/S3 스트리밍 업로드에서 사용자·Site 재검증, 삭제 비밀번호, Audit와 DB 원자 커밋/실패 보상 |
| Current PUT | Stage 전용 SQL 거래 | 기존 `/api/cad-locations/[locationId]/current`와 인증된 Actor/Version→Site 및 Audit 같은 DB transaction |
| Version DELETE | Stage 전용 SQL 거래 | 기존 `/api/cad-files/[versionId]`의 암호 AND/삭제 Job/스토리지 보상·Audit 원자성, 인증 실패시 익명 쓰기 금지 |
| 사용자/세션·Admin | Stage 전용 쿠키/비공개 초기화 CLI | 운영용 Schema/세션·Admin 이중 Release/Operation 게이트, 기본 OFF, 유효 범위·정확 source/digest |
| Prisma | `deploy/g7-staging`의 격리 Migration | 운영 후보 정식 Prisma history와 앱·Migrator 호환/이전 버전 복구, 격리한 복제본에서 먼저 시험 |
| 배포 | S1 GHCR job SKIPPED | 일치하는 고정 OCI 앱·마이그레이터 immutable digest 쌍 **별도 승인**; 현재 `latest`는 인정하지 않음 |
| 백업/복구 | Synthetic local SQLite Snapshot | 사내 동일 시점 DB/CAD/S3 snapshot 실복구, Version/Current/원본 SHA/삭제 해시/감사·FK 검사 및 장애복구 책임 |
| 운영 SOP | 일부 설계 | 관리자·대리인/Secret 접근/재발급·Audit 365일/백업 예외·작업 창·롤백 중단점·사고 처리 담당 |
| 원격 현장 증거 | Owner 보고 #108 수용 | 사내에만 보관한 시험 EV ID, 평가 담당·일시·결과를 기입하고 공개 Git에는 **상태만** |

## 배포 차단·Fail-closed 게이트

- S2 승인 의사 기록 ≠ 대상·시각·해시·Schema가 확정된 운영 Cutover 실행 승인.
- 어떤 점검이라도 `FAIL`, `NOT_RUN`, `CANCELLED` 또는 원본 미대조면 `NO-GO/HOLD`. 준비 보고서가 `READY_FOR_OWNER_REVIEW`를 반환하더라도 Owner의 릴리스별 실행 승인과 별도 S3 명령이 없으면 STOP.
- 표준 운영 `src/prisma/migrations`는 현재 수정하지 않았다. Stage Migration을 운영 SQL 경로에 복사/자동 적용하거나 운영 Compose`migrate`를 실행하지 않는다.
- 승인 완료 후에도 백업 → 쓰기 중지 → 마이그레이션 → FK·비즈니스 불변식 확인 → 단계별 Auth ON → CAD Write Cutover라는 S3 실환경 실행 순서는 별도의 Runbook/승인 대상이다.
- 승인 기록에 접근할 수 없는 이 대화에서는 사용자 시험 결과를 신뢰하는 동시에 **원본 증거의 독립 검증 완료라고 주장하지 않는다**.

## 완료 판정

본 브랜치의 **S2 준비 도구**에 대한 CI가 성공하더라도 기존 CAD Route/운영 Prisma/실 배포 기능을 구현 완료했다고 표시하지 않는다. Issue #109·#96은 S3/수용 완료 전 OPEN/BLOCKED 유지하고 S2의 미구현 항목은 사용자 승인 없이 활성화하지 않는다.
