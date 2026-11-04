## 2026-11-04 — PR #228 CPU Job 릴리스 라우팅·bounded recovery (Draft)

신규 G7 CPU schema+Feature flag에서만 Version 등록 → CPU Builder Queue를 한 DB TX에서 연결하도록 분기 추가. 0.60.0은 기존 Browser enqueue 유지하고 잘못 설정된 CPU 플래그를 차단한다. transient error RetryWait 30s/60s, attempt3 FAILED, auth/source/pointer 등 terminal, CAS lost는 거짓 실패를 피한다. 단위시험 3곳 보강. CI 확인 전 UNVERIFIED; 신규 G7 schema/실제 별도 CPU Worker OCI/배포·B3·브라우저 복원 미완료, #225/#218 OPEN.

---

## 2026-11-04 — B2-B SQLite 통합·현재 릴리스 차단 시험 작성

B2-B 내부 권한·Blob·CurrentScene CAS/Audit 구현에 대한 강한 양/음성 증거를 위해 소유 disposable G7 0.60 DB+실 original/Scene Blob을 사용하는 `scene-cpu-worker-g7.test.ts`를 작성했다. 정상 첫 게시·Current0/Job READY/Audit·조회 가능한 CPU DTO와, 기존 Pointer 보존/2차 게시 거부, Audit SQL trigger 실패의 트랜잭션 롤백·Orphan CLEANUP을 시험한다. 이 시험의 G7 Worker 인가는 **모의**이므로 실제 signed Runtime·보안 승인이 아니다. `scene-cpu-worker-current-release.test.ts`는 실제 v0.60.0에서 CPU Worker Enqueue/Claim/Auth가 future schema ID 불일치 때문에 무조건 차단되는지 확인한다. 실행 성공은 새 CI 완료 전 **미검증**이다. B2 실제 독립 OCI, CPU 자원/네트워크 격리, 지원 DXF 확대, G7 새 버전 및 B3·GO-PILOT은 여전히 미완료. #225/#218 OPEN, 현 0.60.0 GHCR·.env/DB/Volume/CAD 비변경.

---

## 2026-11-04 — PR #228 B2-B 미래 전용 Worker 파이프라인 코드 추가

[PR #228](https://github.com/planner77/layoutManager/pull/228)의 B2-B 구현을 데이터 출처 검사에서 **미래 서명 G7 릴리스 전용 내부 Worker 함수/안전한 신규 Scene 게시 단계**로 확장했다. 세부 코드는 `src/server/scene/scene-build-job-queue.ts`(CPU Builder 전용 Enqueue/Claim/Stale/Retry/Stage), `scene-worker-g7-authorization.ts`(DB 현 시점 Actor/Site/Role·Version/sha·signed G7 Runtime 재검사), `scene-worker-publish.ts`(권한 재검사, 저장된 원본 재조회/SourceSHA, CUSTOM_DTO v2 검증, immutable Blob readback, **기존 CurrentScene이 없을 때만** Asset+Current 0+Job READY+Audit atomic, Orphan 사후처리), `scene-cpu-worker-once.ts`(한 건 오케스트레이션·오류 allowlist)이다. 새 순수 Unit의 승인/거부/중단/TOCTOU/상태 CAS/원본 불변 경로를 검증하도록 작성했다.

**잔여 필수:** B2-B는 현재 `G7-GREENFIELD-CPU-WORKER-20261104-1`이 릴리스 registry/G7 baseline에 **등록되지 않았기 때문에 운영/스테이징에서 실행 불가**. 기존 0.60.0 Queue/Schema·GHCR 그대로. 향후 새 SemVer+정확 G7 schema/OCI App/Migrator 승인, 실 독립 CPU Worker OCI의 비루트 cgroup·시간·pids·read-only·network 격리, LINE 외 실제 제조 도면 2D 도형(Text/Block 포함), 원본 출처 및 브라우저 restore, 장애/재시작/권한 변경 실 DB·파일/배포 통합 시험 필수. `SCENE_AUTO_BUILD_ENABLED=OFF`, `SCENE_CPU_WORKER_ENABLED` 미설정, GO-PILOT BLOCKED; #225/#218 OPEN. 현 Branch CI의 최종 성공 여부는 정확 HEAD 검증 전 미확정. 이전 #572 TypeScript 오류는 별도 FailureLedger에 보존한다.

---

## 2026-11-04 — B2-A Main 병합·B2-B 별도 Draft 시작

[PR #227](https://github.com/planner77/layoutManager/pull/227)은 PR HEAD `f2ac283c62dc3eaed513d4f67a0b4355adbb3a3c`의 [CI #566](https://github.com/planner77/layoutManager/actions/runs/41768798168) 적용 필수 Job SUCCESS, review0/충돌0/behind0 확인 후 **Main `73957d20295d6300c4f0c9b89ca5032574eb24bc` Squash 병합**, [Main CI #147](https://github.com/planner77/layoutManager/actions/runs/41771625231) 성공. 기존 0.60.0 immutable GHCR Pair가 있어 중복 빌드 생략. B2-A는 LINE 오프라인 후보 완료이지 운영 자동 Scene 구축 완료가 아니다.

별도 B2-B Draft 첫 구현: 기존 Browser Builder 식별자를 유지하고 CPU 후보를 `node-cpu-line@1.0.0+cad-scene-1`의 고유 출처로 분리한다. 순수 `inspectCpuCandidateForJob`은 RUNNING Job·attempt·Builder/schema2·원본 SHA·manifest·DTO 전체 Validator와 payload SHA의 정합성만 확인한다. **기존 v0.60.0 Queue의 Browser Builder Job은 CPU 검증에서 거부**되며, SceneRepository 수동 게시 경로는 CPU 출처를 거절한다. B2-B 안에서 2D geometry 확대, 버전 등록·Queue 전환, 독립 non-WebGL CPU Worker, G7 Actor/Site/Writer 최신 권한 재검증, 검증된 SceneRepository immutable 게시/CurrentScene CAS/Audit 및 기존 READY 보호를 이어서 구현한다. B3 목록 상태/UI/retry/배포 Smoke는 미완료. #225/#218 OPEN, GO-PILOT BLOCKED, `SCENE_AUTO_BUILD_ENABLED=OFF`, 0.60.0 배포·운영 DB/CAD/Volume 변경 금지. 이 Draft 변경의 정확 CI 결과는 확인 전 미검증.

---

## 2026-11-04 — B2-A Node CPU LINE 후보 구현 착수 (별도 Draft PR)

B1 완료(G7 0.60.0 Main 병합/이미지쌍 게시)의 다음 작업으로 `src/server/scene/cpu-line-candidate.ts`와 단위 테스트를 구현한다. 배포를 활성화하지 않고 엄격 UTF-8/16MiB·2D LINE(Layer0/흰색, `$INSUNITS=4`)만 변환한다. 실제 Three Line Geometry → CUSTOM_DTO v2/manifest/SHA/domain full validator/임시 저장·readback을 수행하고 비지원 DXF/중복 handle/3D/규모 상한을 fail-closed한다. 이전 A2 Browser 테스트 코드/직접 Node `DXFViewer` 경로를 운영에 복제하지 않는다.

**지금 구현하지 않는 것:** 신규 CPU Builder Identity 및 릴리스 호환 등록, TEXT/MTEXT/POLYLINE/BLOCK 등 일반 지원 도형, G7 내부 Actor/Site/Writer 재인가, 외부 무권한 환경에서 검증된 CPU/RAM/PID/time 격리, SceneRepository immutable CAS/기존 READY 불변, Worker OCI, 상태·Retry UI/B3. 기존 Scope의 `CAD_SCENE_BUILDER`는 Browser 출처이므로 이 Candidate DTO를 현재 버전의 공개 Scene READY로 게시해서는 안 된다. 이번 산출물은 **OFFLINE_PROOF_ONLY**이며 `SCENE_AUTO_BUILD_ENABLED=OFF`, GO-PILOT BLOCKED, #218/#225 OPEN. 정확 HEAD CI 및 런타임 검증 전 완료로 표기하지 않는다. [ADR](Decisions.md), [TestPlan](TestPlan.md) 참조.

---

## 2026-11-04 — PR #226 B1 0.60.0 Main 병합 / 후속 B2·B3 OPEN

검증 HEAD `03e21f4242e499a0a8afc834361e625e4433b2c2`의 [PR CI #564](https://github.com/planner77/layoutManager/actions/runs/41753808890) 모든 적용 필수 Job SUCCESS(별도 A2 합성 Job은 변경 범위 밖 Skip). 리뷰 미해결0/충돌0/behind0 확인 후 [PR #226](https://github.com/planner77/layoutManager/pull/226) **Squash Main `9eb8ac764ddb658bf8f9aaef9f15f18e099f9f63` 병합**. 0.60.0 Job 등록·G7 승인형 Zone→Job Migration 및 B1 영속 Queue/멱등/CAS가 구현·검증되었다. [Main CI #145](https://github.com/planner77/layoutManager/actions/runs/41762192190)와 `v0.60.0` tag 시작은 검증했으나 App/Migrator GHCR 최종 2개 digest 게시 여부는 아직 별도 확인 필요. 상세 [FailureLedger](FailureLedger.md).

**잔여:** B2 실제 CPU non-WebGL DXF→CUSTOM_DTO 변환·제한/인가·SceneRepository 검증 게시 및 B3 상태/재시도 UI, Worker OCI·재기동/브라우저 종료 후 실제 READY는 **미완료**. #225/#218 OPEN, GO-PILOT BLOCKED, `SCENE_AUTO_BUILD_ENABLED=OFF`, 실 운영 `.env`/DB/Volume/CAD 변경 금지. 기존 이 문서의 미완료 시점 기록은 이력으로 보존한다.

---

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
