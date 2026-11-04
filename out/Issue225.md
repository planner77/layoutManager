## 2026-11-04 — CI #563 Docker WAL 성공, 320px Memo E2E 경쟁 조건 보완

[PR CI #563](https://github.com/planner77/layoutManager/actions/runs/41750908638)은 실제 0.56→0.60 업그레이드 및 readonly WAL/백업/복구 Docker 필수 Job을 통과했으나, unrelated `issue91-memo-export.spec.ts`의 320px 모바일 모달 전환 중 헤더 클릭이 막혀 General Chromium shard2/Required Verify FAIL로 종료됐다. 실제 메뉴 헤더의 모바일 drawer `inert` 해제 후 사용자 메뉴를 클릭하도록 테스트 순서를 보완하고, Native fullscreen 및 Memo 내보내기 전체 검증을 유지한다. 정확 실패 로그와 경계는 [FailureLedger](FailureLedger.md) 참조. 새 exact-HEAD CI는 미검증이며 GO-PILOT은 계속 차단한다.

---

## 2026-11-04 — CI #562 WAL Schema proof 보완

[PR CI #562](https://github.com/planner77/layoutManager/actions/runs/41748309671)에서 Plan·승인형 Apply/Backup은 진행됐으나 Docker WAL Smoke의 `backup-schema-verify`가 실패했다. 기존 #210 P2와 달리 업그레이드 후 합성 검증만 WAL readonly 원본을 직접 열고 있었으므로, 서버에 이미 있는 `withReadOnlyInspection` adapter로 검증을 정렬한다. schema DDL/4 indexes/2-history의 엄격 검증과 원본 DB·manifest SHA/권한/소유권/파일 목록 불변성 및 기존 업무 데이터 보전은 유지·강화한다. 정확한 내부 SQLite 오류는 이전 Run 로그에 없어 추론으로 분류하며 다음 exact-HEAD CI 통과 전 GO-PILOT 미승인. [FailureLedger](FailureLedger.md) 참조.

---

## 2026-11-04 — CI #558 WAL 시험 보완 / 승인형 Migration 회귀

[CI #558](https://github.com/planner77/layoutManager/actions/runs/41732045585)은 Test 1015 PASS/1 FAIL + async unhandled, Docker WAL readonly smoke FAIL. `g7-greenfield-upgrade-qa.test.ts`는 첫 `apply`가 잠금을 획득한 뒤 두 번째 `plan` 계산으로 사전 거절돼 pending backup을 정상 await하지 못한 것이 원인. 승인 Plan ID를 최초 시작 전에 계산하고 동일 식별자로 재호출의 잠금 거부와 첫 실행의 백업 완료를 검증하게 했다.

`smoke_greenfield_wal_readonly.py`는 기존 Zone schemaId를 정확 복원하고 `UPGRADE_MIGRATION_REQUIRED`인 Plan을 요구하며, 64-hex planId 승인형 apply, 정확 2행 history/Job DDL 검증을 추가. 기존 업무/사용자 데이터 hash는 유지하며 변경이 의도된 Job Table과 migration ledger만 분리한다. 상세 [FailureLedger](FailureLedger.md). 다음 CI 정확 HEAD 결과는 아직 미확인. B1 Draft/GO-PILOT 미승인, Worker/게시/UI 미구현.

---

## 2026-11-04 — CI #557 실패 후 수정 / 신규 검증 대기

[CI #557](https://github.com/planner77/layoutManager/actions/runs/41727427960)은 999 PASS / 17 FAIL(Static), Docker real upgrade Smoke FAIL, Required Verify FAIL. 실제 제품 자동 Scene Worker의 동작 검증에 앞서 **기존 버전 업그레이드 fixture의 구 Schema ID 불일치**, **R2 복원 fixture의 SceneBuildJob 테이블 잔존**, **Docker Smoke의 승인 없는 `auto` 실행**이 발견됐다. 구버전 Scheme ID/DDL을 테스트에 정확 복원하고 CI 소유 disposable volume에서 신규 Migration Plan ID의 명시 승인과 백업·복구를 통과시키도록 수정했다. 근거 [FailureLedger](FailureLedger.md).

다음 정확-HEAD CI에서 0.59→0.60 실제 DDL/업무 보전/WAL/복구 및 Docker migration image를 검증한다. Worker, G7 Background 게시, UI, GO-PILOT은 여전히 미완료; 기존 0.59 운영 이미지/데이터는 불변.

---

## 2026-11-04 — 0.60.0 Job G7 forward-only Migration 후보

- 신규 제품 버전은 0.60.0 (Draft)이며 이전 v0.59.0의 Zone 기준선·이미지는 불변이다. 신규 빈 설치는 Job 기준선 1행, 기존 설치에서 승인 Migration을 거치면 Zone 기준선+Job Migration 2행을 유지한다.
- G7 Registry에서 0.59.0→0.60.0은 COMPATIBLE이 아닌 MIGRATION이다. Plan ID 승인/백업/격리복구를 요구하고, Job SQL 원문·checksum·4 인덱스 및 기존 G7 DDL 지문을 검증한다. SQL drift/허위 이력은 차단한다.
- 기존 Zone/Outline/Memo 기능이 새 2행 이력에서도 동작하도록 스키마 판정 코드를 변경했다. 정확 HEAD CI와 실제 통합 회귀 결과는 아직 NOT VERIFIED.
- SCENE_AUTO_BUILD_ENABLED 기본 OFF 유지. 새 Job 스키마 등록과 별개로 실제 Background CPU Worker, G7 게시 권한·SceneRepository CAS, 상태 UI는 미구현; GO-PILOT 미승인. GHCR/운영 DB/Volume 변경 금지.

---

## 2026-11-04 — B1 저장 계약 및 G7 릴리스 선행 조건 (Draft)


**동시성 1 보증:** 기존 개별 Job `status+attempt` CAS에 더해, 후보 SQL의 partial UNIQUE `uq_scene_build_one_running`은 전역 `RUNNING` 상태를 하나만 허용한다. Claim은 활성 RUNNING을 먼저 검사하며 경쟁이 발생하면 DB UNIQUE 실패를 숨기지 않는다. 실 Worker가 여러 프로세스로 배포되는 분산 설계의 대체가 아니며, 활성화 전 신규 G7 릴리스 등록과 실제 통합 시험이 필요하다.
**부분 구현, GO-PILOT 미승인.** 이 PR은 `SceneBuildJob` Prisma 모델과 `deploy/scene-build-jobs/migration.sql`의 **검토용 전진 DDL**, `scene-build-job-queue.ts`의 트랜잭션 Enqueue·단일 Job CAS 선점·만료 재시도·실패 상태를 추가한다. `CadRepository.register()`는 `SCENE_AUTO_BUILD_ENABLED=true`일 때 승인된 G7 Runtime의 **DXF**에 한해서만 같은 `writeTransaction`으로 Job을 생성한다. 기본값 OFF, 승인되지 않은 Runtime 또는 등록되지 않은 Job 테이블이면 업로드도 fail closed/롤백하도록 설계했다.


**추가 차단:** 0.59.0의 기존 `G7_GREENFIELD_SCHEMA_ID`에서는 `SCENE_JOB_RELEASE_NOT_REGISTERED`(503)을 반환한다. 수동 테이블 생성만으로는 활성화되지 않는다. 승인된 신규 G7 Schema ID `G7-GREENFIELD-SCENE-JOBS-20261104-1`와 등록 Migration/DDL Fingerprint가 모두 반영된 이후에만 기능을 켤 수 있다.
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
