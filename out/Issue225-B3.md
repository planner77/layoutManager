## 2026-11-04 — B3 구현 후보 / 정확 HEAD CI 검증 전

PR [#232](https://github.com/planner77/layoutManager/pull/232)은 초기 표시 계약에서 다음 범위까지 확장됨:
- `GET /api/scene-build-jobs?versionId=<uuid>&versionId=<uuid>`: signed G7 Runtime 및 세션 기반 Site `cad:read` 교집합, 최대 100 ID, 세 번의 batched DB 조회로 Version/CPU Job/CurrentScene를 읽으며 unauthorized Version 키를 응답에서 생략. Server Scene Blob manifest/source SHA/전체 DTO readback만 READY. 응답엔 안전한 `state/phase/errorCode/canRetry`만 담음.
- `CadTable` 홈/Location에 별도 Scene 상태 열; visible pending만 5초 polling, 탭 hidden/페이지 이탈 시 중단, 네트워크 오류와 Worker FAILED를 분리.
- `POST /api/cad-files/[versionId]/scene-retry`: G7 로그인+Origin+CSRF, 현재 Editor/Admin+Site `cad:upload`, CPU Builder+schema2+source SHA 일치, 현재 pointer 부재, 일시 장애 FAILED/시도 1~2만 CAS로 QUEUED. attempt 누적 유지(최대3), 반복 요청 멱등, 새로운 요청 Actor/RequestID 기록.
- G7 v0.61 AuditEvent CHECK는 신규 `SCENE_RETRY_REQUESTED` action을 허용하지 않으므로, 실제 **인가 결정**을 기존 허용 `AUTHORIZATION_GRANTED`/VERSION/Site로 기록하고 Retry 상태는 동일 트랜잭션의 Job RequestID+Actor로 추적. 전용 이벤트 분류는 신규 서명된 G7 마이그레이션이 필요하며 본 PR이 완성하지 않는다.
- 순수/모의 DB 단위 테스트 보강. **실 DB API·권한·브라우저/Worker E2E, 정확 HEAD CI 결과는 아직 확인/실행 완료 전; GO-PILOT 미승인.**

#229 v0.61+ GHCR HOLD, #231 Tag Ruleset OPEN, 모든 자동 Scene 스위치 OFF, 운영 DB/CAD/.env/Volume/이미지 불변. B3 GO-INTEGRATE는 정확 HEAD CI+리뷰/충돌 및 실제 변경분 검사 후만 판정.

---

# Issue #225 B3 — Scene 상태/진단·재시도 UI 구현 계획

> 기준: Main `e69337af8ea9b3ba4a51d33eb984aadb8aea8e97`, Issue #218 Lean Policy, AGENTS.md, Issue #225. 이 문서는 구현 계획이며 GO-PILOT 승인 또는 완료 보고가 아니다.

## 이번 Draft PR의 현재 구현

- `src/domain/scene-build-display.ts`: public 상태라벨·표시 tone·보이는 pending 행에만 적용할 polling 판정의 순수 함수. 기존 `sceneBuildPublicSummary`를 사용해 검증된 immutable Scene pointer와 Job READY를 구별한다.
- `src/tests/unit/scene-build-display.test.ts`: 검증되지 않은 READY, DWG, stage allowlist, hidden tab, flag OFF, 비밀문자 노출 방지에 대한 순수 단위 회귀.
- **아직 API/도면 목록 UI/재시도/실 DB 통합은 구현하지 않았다.** 아래 작업을 통해 같은 Draft 또는 후속 PR에서 완성한다. 정확 HEAD CI 결과가 확인되기 전 PASS 주장 금지.

## B3 구현 잔여 및 의존성

1. **읽기 정책 정본 결정/구현**: G7 Runtime ACTIVE에서 Site 읽기 권한으로 Version ID를 먼저 인가한다. 비활성/이전 G7 schema에서는 Job 테이블을 가정하지 말고 `UNAVAILABLE` 또는 `MISSING`으로 안전 퇴화. 공개 DTO는 `scene/build/phase`와 허용된 실패 분류만; jobId, tokenHash, actorId, SourceSHA, raw stack/locator 비노출.
2. **배치 조회 API**: 화면의 현재 페이지 Version ID로 한 번에 해당 Job 최신 상태와 서버측 검증된 CurrentScene pointer를 조회한다. 임의 Version ID 열거, N+1, 사용자 권한 없는 타 Site 조회 금지. 서버 READY는 SceneAsset manifest 및 scoped immutability/검증 정보를 근거로 판정하며 Job status만으로 추론하지 않음.
3. **UI**: 홈 `CadTable` 및 Location Version 목록의 별도 'Scene 생성' 열. 파일이 DWG이면 해당없음, 비활성 플래그면 기능 비활성 안내. 기존 Current(도면 버전) 상태와 독립. 화면 표시 행 중 pending이 있을 때만 bounded polling, 숨김 탭/terminal/페이지 이동 시 중단. 네트워크 실패를 Job FAILED로 저장하거나 표시하지 않음.
4. **재시도 POST**: `prepareG7CadWrite` + 현 Site의 Editor/Admin 권한 + `Origin/CSRF` 적용, 현재 G7 Actor/Site 및 정확 version SHA·Builder·Schema를 재검사. terminal FAILED 또는 허용된 재시도 상태만 무결성 있는 CAS로 QUEUED 복귀, 기존 READY/Current 보호 및 감사. 중복 클릭/동시 재시도 멱등 처리, Retry 횟수 제한 명시. jobId와 session/tokenHash 미노출.
5. **회귀**: 401/403/503, site 권한 회수, 다른 사이트 버전, Job 미생성, 기존 READY, 빈/복수 페이지·메모 검색, DWG/legacy, stale polling, duplicate Retry, 브라우저 재접속, 실제 단일 OCI Worker restart/kill 및 G7 새/기존 설치 migration/restore smoke. 원본/기존 READY 보존 확인.
6. **문서**: AGENTS.md, Architecture/Decisions/Database/Operation/TestPlan/TestReport/FailureLedger, Issue #225/#218 완료 체크는 실제 검증 이후만 반영.

## 릴리스/운영 안전선

`SCENE_AUTO_BUILD_ENABLED=OFF`, `SCENE_CPU_WORKER_ENABLED=OFF` 유지. 신규 v0.61.x의 GHCR App/Migrator/Worker 3-image 게시와 Version tag는 #229 HOLD이며 #231의 Tag Ruleset/GHCR 권한 보강 전 출고 불가. 기존 운영 .env, DB, CAD/Volume, immutable v0.60 이미지 수정 금지. GO-INTEGRATE는 정확한 새 PR HEAD의 해당 기능 CI와 리뷰/충돌 검증 후에만 판정. GO-PILOT은 독립 별도 Gate.

## 현재 판정

B3 **IN PROGRESS / NOT COMPLETE**. 순수 표시 계약·단위시험 소스만 작성. 현 PR에서 CI가 아직 확인되지 않은 상태라 PASS 주장하지 않는다.
