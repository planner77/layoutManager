## 2026-11-04 — B1 저장 계약 및 G7 릴리스 선행 조건 (Draft)

**부분 구현, GO-PILOT 미승인.** 이 PR은 `SceneBuildJob` Prisma 모델과 `deploy/scene-build-jobs/migration.sql`의 **검토용 전진 DDL**, `scene-build-job-queue.ts`의 트랜잭션 Enqueue·단일 Job CAS 선점·만료 재시도·실패 상태를 추가한다. `CadRepository.register()`는 `SCENE_AUTO_BUILD_ENABLED=true`일 때 승인된 G7 Runtime의 **DXF**에 한해서만 같은 `writeTransaction`으로 Job을 생성한다. 기본값 OFF, 승인되지 않은 Runtime 또는 등록되지 않은 Job 테이블이면 업로드도 fail closed/롤백하도록 설계했다.

- **중요:** 현재 G7 0.59.0 Greenfield baseline의 고정 DDL·fingerprint·Upgrade Registry는 그대로다. SQL은 아직 등록/적용되지 않으며 `SCENE_AUTO_BUILD_ENABLED`를 운영에서 활성화하면 안 된다. 신규 불변 버전 및 승인된 G7 release migration, fingerprint/backup/restore/DB 드리프트 수용이 뒤따라야 한다. 수동 `ALTER/CREATE TABLE`로 현재 설치를 우회하지 않는다.
- 작업 DB에는 `versionId/sourceSha256/builder/payloadSchema` UNIQUE 및 actorId/siteId/requestId 등 최소 참조만 저장하고 세션 tokenHash·쿠키·암호는 저장하지 않는다. `SceneOrphanJob`은 기존 Storage cleanup 전용으로 유지한다.
- Claim은 SQLite 트랜잭션 `updateMany` CAS를 이용한다. stale RUNNING의 유한 retry, maxAttempts3, 오류 allowlist는 `SceneRepository` 게시 성공과 구분하며, 이 코드에는 **READY 게시 함수가 없다**.
- `src/tests/unit/scene-job-schema-b1.test.ts`: 별도 인메모리 SQLite에 DDL을 적용해 FK/유일성/상태 CHECK/롤백 검증. `scene-job-queue-b1.test.ts`: DB-transaction mock의 Enqueue/CAS/stale/retry/실패 경로 검증. 이 시험은 **실 G7 Baseline→새 릴리스 upgrade E2E의 대체가 아니다**.
- 다음 필수: 신규 SemVer/G7 migration 승인·릴리스 정합화, 실제 G7 DB 영속 transaction 통합 E2E, 독립 CPU non-WebGL converter, background permission 재확인·`SceneRepository` CAS·verified READY, UI/Worker OCI. 이전 READY·원본/메모·구역 데이터 불변.
- 이전 #225 단일-Worker admission의 순수 상태 판단 코드는 그대로 유지하고, 과거 #221/#222 A2 원본 시험과 실패 원장을 재해석하지 않는다.

---

# Issue #225 — B1 단일 CPU Worker 상태 판정 로직 착수

> Parent: #218 (GO-DEV 승인). 이 PR은 **제품 자동 Scene 생성 구현 완료가 아니다**.

## 이 PR에 포함한 실제 코드

- `src/domain/scene-single-worker-admission.ts`: 신규 SceneBuildJob 네 부분(Version/SourceSHA/Builder/PayloadSchema) 멱등 키 검증, 단일 Worker의 QUEUED/RETRY_WAIT/RUNNING stale 판정 및 bounded 재시도. 순수 함수이며 실제 사용 전 데이터베이스 UNIQUE/CAS 원자성을 별도 구현해야 한다.
- `src/tests/unit/scene-single-worker-admission.test.ts`: invalid digest/schema, due/undue, stale timeout, terminal 상태, 불량 시간/횟수 등 회귀.

## 현재 한계 및 다음 우선 작업

1. `src/prisma/schema.prisma`와 G7 Greenfield/릴리스 Registry의 Job 테이블·DDL/Migration/호환성 검증.
2. `CadRepository.register`의 **동일 transaction**에 승인 DXF만 자동 enqueue. Job에 cookie/tokenHash/password 보관 금지. Origin/CSRF/G7 기존 승인 회귀 유지.
3. SQLite 단일 Worker claim/재시작 recovery, 실제 DXF bytes SHA 재검증, 시간·CPU/RAM·프로세스 격리.
4. **WebGL 없는 CPU DXF→CUSTOM_DTO v2** 생산용 경로와 실제 SceneRepository publish의 신규 내부 G7 권한 검증 설계. 기존 `G7CadWrite.tokenHash`를 Job에 저장해 재사용 금지.
5. READY는 작업 테이블의 문자열이 아니라 **검증된 CurrentScene**으로 확정. 이전 READY 불변, 원본 및 Memo/Zone/Outline 보전.
6. 최소 상태/retry UI와 실제 파일·권한·브라우저 복원·재기동 검증 후만 GO-PILOT 별도 판정.

단일 Worker 핵심 판단 함수를 작성한 것은 B1 코드 착수의 증거일 뿐, 실제 DB/배포 동작은 **NOT IMPLEMENTED/NOT VERIFIED**. 초기에 과거 P1-A2 Server WebGL restore, 다중 Worker/Fencing, 전체 Entity 매핑, 현장 DXF 3종을 구현 착수 차단 조건으로 요구하지 않는다. `AGENTS.md`/Issue218LeanPolicy 기준, 현재 repository-required PR CI는 유지한다.
