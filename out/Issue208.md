# Issue #208 — 서버 영속 Scene 자동 생성 / P1-A 기술 게이트 (2026-11-03)

> 상태: **PARTIAL / P1-A 실행형 PoC 작성, Node 합성 시험·CPU-only 컨테이너 실측·브라우저 동등성 NOT VERIFIED.** P1-B/C/D는 아직 구현되지 않았으며 최초 업로드→Scene 자동 게시를 운영에 사용하지 않는다. 승인/병합/릴리스가 아니라 검증 후보 문서다.

## 1. 요구사항·기준 소스

- 정본: [Issue #208](https://github.com/planner77/layoutManager/issues/208), AGENTS.md, Requirements/Architecture/Decisions/Database/Logging/Operation/TestPlan/TestReport/FailureLedger, G7 #209/#211 배포 정책.
- 기존 수동 브라우저: `ThreeDxfViewerAdapter.load` → `DXFViewer.getFromPath` → preflight → material clone → `tagImportedTree` → 선택적 Outline index → text index → `serializeSourceScene(...,CUSTOM_DTO)`; 사용자 명시 저장 후 `SceneRepository.publish`.
- 기존 `SceneRepository.status`는 immutable Scene bytes/manifest·Source SHA 검증 후에만 `READY`를 반환한다. `SceneOrphanJob`은 삭제/정리용이지 SceneBuildJob queue가 아니다.
- `CadRepository.register`는 Version·Current·Audit를 하나의 SQLite transaction으로 등록한다. 별도 요청 비동기 실행은 응답 뒤 유실될 수 있으므로 허용하지 않는다.
- `requireG7CadPermission`/ `appendG7CadAudit`는 현재 인증 세션 tokenHash로 Actor/Runtime/Site를 재검증한다. Worker가 request cookie/tokenHash를 DB에 보관하거나 G7 권한을 mock하는 방식은 불허.
- 현재 `src/Dockerfile`은 App(standalone)·Migrator만 제공한다. `src/docker-compose.yml`에는 별도 Worker/health가 없다. 현재 G7 신규 설치 baseline/Schema ID는 #196 Semantic Zones; #209 registry가 승인하지 않은 운영 Schema 자동 upgrade 금지.
- #212는 수동 Scene 진단 및 검증 후보만 정리했으며 #208의 자동 Worker를 구현하지 않았다. #216은 신규 이미지·릴리스 버전 별도 이슈.

## 2. P1-A 실험(현재 PR 범위)

`src/server/scene/node-converter-poc.ts`가 **Node 프로세스 내에서만** 실제 pinned `three-dxf-viewer@1.0.44` DXF→Three Object3D→기존 `CUSTOM_DTO` serializer→full validator→restore를 시도한다. 브라우저 Renderer, tab, WebGL, 로컬 HTTP Scene API, 기존 사용자 Session은 사용하지 않는다.

- source bytes를 지정 SHA와 대조하고 16MiB **PoC 메모리 안전 상한**을 먼저 적용한다(운영 100MB 업로드/Scene 32MiB 상한을 변경하지 않음).
- 브라우저와 동일 `TextDecoder`, `explicitElevation`, `sourceUnitFromDxf`, `tagImportedTree`, 사유있는 material 복제(black→white), `extractDxfText`, `preflightSceneRoot`, `serializeSourceScene`를 재사용한다.
- `FontLoader.parse`로 프로젝트 자체 TypeFace 파일을 읽고, 해당 패키지의 private `_font`을 설정한다. 변환기 URL에는 Node의 표준 `data:` fetch를 사용한다. **이 두 부분은 공식 지원 API가 아니며 프로덕션 설계로 간주하면 안 된다.**
- 이전 DXF/압축·메모리 비용, 16MiB 초과, 구형 CP949 인코딩, 외부 참조, OLE/RTF, 깊은 BLOCK/INSERT, optional index, 한글 glyph, 대형 20MiB+ 및 브라우저 Scene의 좌표/ID/재현성 동등성은 **미검증**.
- `scene-node-converter-poc.test.ts`는 실제 합성 LINE/CIRCLE/LWPOLYLINE/BLOCK/INSERT/TEXT/MTEXT fixture의 Node 변환, 완전한 manifest/SHA·복원, source mismatch/size/font 실패를 실행한다. fake parser/Scene payload로 성공을 속이지 않는다.
- `scene-build-job.ts`는 순수 상태/오류/phase 공개 계약, READY 검증 우선순위, 안전한 재시도 간격만 정의한다. **저장형 작업 Queue나 Worker는 존재하지 않는다.**

### P1-A GO/NO-GO 판정

| Gate | 필요한 증거 | 현재 |
|---|---|---|
| A1 Node CPU-only | font 포함한 Node 실제 DXF→Object3D; npm Unit 실행/종료 | NOT VERIFIED; CI 실행 대상 |
| A2 fidelity | 브라우저 수동 #212 vs Node 동일 합성 fixture에 대해 stable ID/treePath, WCS/Layer/geometry count, TEXT/MTEXT/BLOCK, DTO digest 및 restore | NOT VERIFIED; Node round-trip만 코드로 작성 |
| A3 보안·리소스 | Node 별도 프로세스 중단/OOM/timeout·디스크/메모리 상한; 불신 입력/민감 정보 비노출 | NOT IMPLEMENTED |
| A4 OCI/폐쇄망 | UID10001·font/tsx/Prisma/Native 설치, App/Migrator/Worker 동일 버전, CPU-only Compose smoke | NOT IMPLEMENTED |
| A5 G7 게시 승인 | 내부 작업 전용 제한된 신뢰+실 Actor/Site/Session/승인 재검증·Audit, 기존 `SceneRepository.publish`의 CAS/정본 검증 보존 | NOT IMPLEMENTED |

**A1만 CI에서 성공하더라도 자동 Scene 게시 GO가 아니다. A1 실패시 Node 방식은 NO-GO로 판단하고 Headless Chromium 단독 Worker(서버 독립 프로세스·software renderer) 또는 공식적으로 지원되는 순수 파서 검증을 별도 기술안으로 선택해야 한다.** 브라우저 자동 탭/숨김 Viewer/요청 종료 Promise로 회귀 금지.

## 3. P1-B 영속 작업/권한 설계 (구현 대기)

- 최신 빈 G7 schema에는 `SceneBuildJob` (id/versionId/sourceSha256/builder/schema/state/phase/attempt/leaseOwner/leaseUntil/fencing/nextRunAt/requestId/actorId/sessionId/createdAt/updatedAt) 및 `SceneBuildAttempt` (jobId/attempt/phase/outcome/elapsedMs/errorCode/category/utc) 등 FK·unique version+source+builder+schema+request intent를 추가. `SceneOrphanJob`과 구별. 작업 상태는 metadata만 기록; CAD bytes/URL/tokenHash/password/session cookie/error raw는 금지.
- `CadRepository.register`의 승인된 DXF Version INSERT와 Job INSERT를 **같은 `writeTransaction`**에 적용하고, 재시도 충돌 시 rollback/기존 job 재사용. 응답 201은 원본 등록과 QUEUED의 정본 ID만 반환. DB 트랜잭션 실패/응답 유실시 등록 상태와 intent를 조회하는 reconciliation 정책 명시. DWG/과거 Version 자동 enqueue 불가.
- Claim은 SQLite 단일 writer `UPDATE ... WHERE state IN (...) AND lease conditions ... RETURNING` + transaction lease/fencing 증가, heartbeat/expire/reclaim·attempt 이력, 1개 기본 concurrency, 최대 N번 backoff 및 실패 시 terminal state를 명시. 2개 Worker 중 동일 fencing token만 CAS/ACK; ACK 손실·staging orphan·Lease expiry에도 기존 pointer 보존. 실제 JOB 성공이 `SceneRepository.status()==READY`를 대체할 수 없음.
- 게시 직전 Worker는 token/cookie 없이 안전한 `jobId+actorId+sessionId+sourceSha+site scope`를 DB 정본과 재검증하고, G7 ACTIVE + writer 승인 + 동일 signed site gate + actor ACTIVE + 현재 Site Editor permission + session revoke/expiry 체크. 현재 `requireResolvedPermission` semantics 재사용 및 내부 전용 Audit를 새로 설계하되 외부 HTTP auth route를 만들거나 기존 `publish`의 G7 proof 요구를 약화하지 않음. 가능하면 DB transaction 내 내부 proof 타입 및 Audit CAS를 명시한다. 조건 불충족은 BLOCKED; 이전 READY 유지.
- 원본 저장소 바이트 SHA, Scene serializer/DTO full domain validator, blob put/verify와 `CurrentScene` expected revision CAS+Audit를 기존 Repository/Storage 흐름으로 재사용. 기존 정상 READY는 새 Scene 검증·atomic publish 성공 전 무조건 유지. APP_CREATED/Memo/Zone/Outline 원형 유지.
- 신규 G7 baseline/Prisma client/DDL·Migration·#209 registry compatibility chain을 독립 검증하고, **이미 설치한 데이터 자동 migration은 별도 정확 승인 없이는 금지**.

## 4. P1-C 목록/API/UX (구현 대기)

- 기존 `CadListItem.isCurrent`와 별도 `sceneBuild` 공개 요약을 **페이지 단위 JOIN/Batch**하여 DXF 작업 QUEUED/RUNNING/RETRY_WAIT/FAILED/BLOCKED/미생성/검증 READY, DWG 해당없음을 구분한다. 익명 목록은 actor/jobId/민감 원인/Source SHA 노출 불가.
- 현재 Scene가 검증 READY면 복구 가능한 재빌드 작업이 진행 중이더라도 CurrentScene READY는 보존하고 작업 상태는 별도 표기한다. JOB READY만으로 목록 ‘완료’ 표시 금지.
- 상세 GET 및 retry POST는 해당 Version Site Editor/G7 ACTIVE/실 로그인/Origin/CSRF 재검증·no-store·명시 Audit, 중복 ACTIVE job 동일 ID 및 attempt 이력 보존. LOG raw는 기존 logs:read 권한만.
- 목록/위치 버전 테이블에 ‘Scene 생성’ 별도 열. visible pending rows에 한해 5–10초 유한 polling+hidden/stale 종료, 현재/모든 버전/메모 검색·pagination/E2E 유지. 업로드 성공 후 ‘원본 등록 완료·Scene 대기’로 표시; Viewer fallback과 서버 READY를 명시 구분.

## 5. P1-D CPU-only 배포·수용 게이트 (구현 대기)

- 분리된 Node worker entrypoint, OCI runtime/COPY self-contained font·Node dependencies, non-root UID10001, Compose `migrate: service_completed_successfully`, 동일 `/data`, health/readiness, CPU/memory/pids/timeouts, graceful SIGTERM·restart policy, S3 and local, 로그 allowlist. #209 #211 release registry/image pair consistency 확정 후 활성.
- Unit: 타임라인/에러/Transition, fidelity, immutable source hash, queue idempotency/reconciliation, 2-worker fencing, auth revoke, Job READY vs verified Scene ready.
- Integration: new Greenfield migration, SQLite busy/restart/ACK loss/S3 503/staging cleanup, upload 201 browser close/other PC still READY, same version retry without changing Current/old READY.
- E2E: 홈/Location list/anonymous vs Editor failure details, memo search #202, DWG none, visible poll, Runner offline CPU; negative test Actor revoke/site mismatch.
- 현장 실제 대형 DXF/2PC/GPU·장기 SLA는 #113/#193 별도 OPEN. Owner 승인 전 PRODUCTION GO 금지.

## 6. 결과·다음 게이트

현재 등록 변경은 P1-A `src/server/scene/node-converter-poc.ts`, `src/domain/scene-build-job.ts`, 두 Vitest 파일 및 문서뿐이다. `src/server/services/upload.ts`, `CadRepository.register`, `SceneRepository.publish`, Prisma schema, `Dockerfile`, `docker-compose.yml`, 업로드/목록 UI는 의도적으로 수정하지 않아 **운영 동작은 기존 수동 Scene 생성 그대로**다. PR CI는 새 실행의 실제 결과를 확인하기 전 성공으로 기록할 수 없다. Gate A1–A5가 확인될 때까지 Issue #208을 완료/종료하지 않는다.
