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
