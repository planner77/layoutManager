# Issue #41 — 관리자 최상위 외곽선 업무 타입 (U4) / v0.34.0 안전 선행 시안

## PR #64 첫 PR CI 실패 및 P2 리뷰 조치 (2026-10-25 KST)

- [Run 40153913566](https://github.com/planner77/layoutManager/actions/runs/40153913566) (HEAD `d548df2b4bb183ff6a2df1c227124e93f40c4054`, completed/failure). [verify job 121051041258](https://github.com/planner77/layoutManager/actions/runs/40153913566/job/121051041258): TS/Lint/Unit/Integration/Benchmark/Build PASS → Chromium E2E **55/56 PASS, 1 FAIL** → Legacy migration E2E SKIPPED. [Docker job 121051041382](https://github.com/planner77/layoutManager/actions/runs/40153913566/job/121051041382) PASS. E2E 증거 [artifact 12583742658](https://github.com/planner77/layoutManager/actions/runs/40153913566/artifacts/12583742658).
- **원인:** `TC-U4-E2E-PREVIEW-001`의 `page.getByRole('alert')`는 실제 validation error `<p role=alert>`와 Next.js 빈 `__next-route-announcer__` `<div role=alert>`를 동시에 찾아 Playwright strict-mode 위반. 실제 중복 이름 차단은 정상적으로 발생했고 제품 도메인 실패나 DB 오류 아님. 제품 로직/Next Route Announcer 제거 대신 `preview.getByRole('alert')`로 범위 제한.
- **별도 P2 Review:** [4369348797](https://github.com/planner77/layoutManager/pull/64#discussion_r4369348797) — 사내 non-local HTTP에서 `crypto.randomUUID`는 secure-context-only, 타입 시안 추가 중 예외 발생. `preview-uuid.ts`에서 지원시 `crypto.randomUUID`, 미지원시 `crypto.getRandomValues`로 UUIDv4의 version/variant 비트를 설정한다. CSPRNG 자체가 없으면 안전하게 거부하며 `Math.random`은 사용하지 않는다. 이 ID는 **비영속 메모리 시안 전용**이며 서버·권한·영속 ID가 아니다.
- **수정 코드:** [commit `b389b66e`](https://github.com/planner77/layoutManager/commit/b389b66e11a34ad6fa737fc5ff760277d192797a) — scoped locator + `TC-U4-UNIT-005~006`와 `TC-U4-E2E-HTTP-003`. 기존 `TC-U4-E2E-PREVIEW-001`는 이후 수정/비활성/복구/새로고침까지 확인하도록 유지. `TC-ISSUE14-001`의 HTTP method removal 패턴 재사용.
- **검증 상태:** 원래 HEAD의 나머지 PASS는 수정 HEAD 통과 증거가 아니다. 새 unit/E2E/legacy/build/실 HTTP IP 운영 검증은 원격 재CI 완료 전 NOT VERIFIED; 운영 Admin CRUD 인증·migration/Scope/audit 여전히 BLOCKED. 문서 및 실패 원장 함께 commit한 뒤 branch ref를 **1회 fast-forward**하여 새 `pull_request.synchronize` CI를 시작, 모니터링/병합/Issue 종료하지 않음.


- GitHub: https://github.com/planner77/layoutManager/issues/41
- 기준 HEAD: `4818f666f2186c9209f91aa847bb8c53c8f62e11` (v0.33.0, #40 병합 후). 작업: `feat/issue-41-outline-type-safety-preview`.
- Epic #37 / 선행 #38(앱 메뉴), #31 P4(인증·외곽선 영속화), 후속 #42(타입 지정), #43(업무 타입별 트리).
- DESIGN.md는 저장소에 존재하지 않음(조회 404). 현행 Architecture.md / Decisions.md / Database.md / AGENTS.md를 설계 기준으로 사용.

## 현황·보안 의존성

- **BLOCKED:** Owner가 IdP/세션, Reader·Editor·Admin 권한, 전역 vs 사업부/제품/사업장 scope, 감사 보존/열람 정책을 승인하지 않았다. 서버에서 검증할 관리 인증 수단도 없다. #31 P4와 동일 보안 게이트를 재사용해야 하며, 삭제 비밀번호, X-User/X-Role, 클라이언트 화면 상태를 Admin 증거로 사용하지 않는다.
- 따라서 이 PR은 **관리자 기능 완료가 아니다.** 실제 /api/outline-types GET/POST/PATCH/DELETE, Prisma OutlineType 테이블·migration, 서버 repository, 실제 외곽선의 typeId, 로그인·RBAC 및 감사 쓰기를 의도적으로 구현하지 않는다. 기존 앱 메뉴 '외곽선 타입 관리'는 disabled를 유지한다.
- 대신 공개되지 않은 관리자 기능인 척하지 않는 `/lab/outline-types` **메모리 전용 설계 시안**을 추가한다. 모든 항목은 브라우저 React state에만 존재하고 reload에서 소멸; 실제 CAD 도면·DB·관리 API와 결합하지 않는다. 운영 API를 우회하는 헤더·패스워드 경로는 없다.

## 타입 계약 (제안, 배포 DB 아님)

| 필드 | 제안 계약 |
| --- | --- |
| id | 발급 후 불변 UUID (실서비스는 서버 발급) |
| name | trim→Unicode NFC, 1~100 UTF-16 units, Cc/Cf/Cs 거부, 정규화 중복 차단 |
| description | nullable, trim→NFC, 최대 500, Cc/Cf/Cs 거부 |
| sortOrder | 0~9999 안전 정수, 표시순서 + 이름 + ID로 안정 정렬 |
| active | false도 ID·표시명·참조는 유지; 신규 타입 선택에서는 제외 |
| scopeKey | **결정 대기**: null은 시안에서 미확정 표시일 뿐 전역 scope 확정 아님 |
| revision | >=1, 변경 시 +1; 동시 변경 CAS/409 제안(시안에서는 stale revision Error) |
| createdAt, updatedAt | UTC; 실서비스는 서버시간·감사와 원자적 기록 |

- 시안의 이름 키는 NFC→locale-independent lower-case→NFC로 대소문자 차이를 무시한다. inactive 타입 이름도 예약한다. 실제 Unicode DB collation/Unique index 및 scope별 이름 정책은 Owner 결정 후 정합성 시험으로 확정해야 한다.
- 업무 분류 `OutlineType`과 기하 알고리즘 `OutlineKind`(CONVEX/PRECISE)는 **무관**하다. 현재 geometry JSON export 포맷(schemaVersion=1)에 임의 `typeId`를 넣거나 서버 수용으로 간주하지 않는다.
- 삭제 대신 soft deactivate/restore; 추후 외곽선 FK는 타입 ID를 불변으로 유지해야 한다. 관리자 승인 후에는 추가·이름/설명/순서·활성상태 변경을 단일 transaction/revision CAS + verified Admin RBAC + scope + audit로 구현한다.

## 구현 및 단계 계획

1. [구현] `domain/outline-type.ts`: 정규화·형식·중복·불변 ID·revision 동시 갱신 충돌·비활성/복구·stable sort를 **순수 함수**로 작성. DB 접근 불가.
2. [구현] `features/cad-viewer/outline-type-manager-preview.tsx` 및 `/lab/outline-types`: 명확한 비영속 고지, 입력·목록·수정·비활성·복구, 오류·접근성. ViewerManager 재생성이나 새 네트워크 호출 없음.
3. [구현] `tests/unit/outline-type.test.ts`, `tests/e2e/issue41-outline-type-preview.spec.ts`: 검증·중복·revision·soft delete·reload·미구현 API 404를 자동화. 기존 #38 메뉴 disabled / #40 도구 회귀는 기존 CI 활용.
4. [문서] README·Requirements·Architecture·Database 제안·ADR-037·TestPlan/Report·Operation·ChangeLog·AGENTS를 갱신. 버전 0.33.0→0.34.0; lockfile 루트 버전 동기화.
5. [보류] Owner 보안·범위 승인→#31 P4 공통 인증·감사 기반 구축→DB additive migration+FK/Unique→Admin Service/API/UI→typeId 연계(#42)→트리(#43)→운영 Backfill/복원·동시성/권한 수용.

## AC/TC 추적 및 완료 경계

| AC | 현재 단계 | 증거 / 이후 필요 |
| --- | --- | --- |
| AC-U4-01 (인증 Admin 영속 CRUD) | **BLOCKED** | 시안 CRUD만; 실제 DB·세션간 보존 미구현 |
| AC-U4-02 (Viewer/Editor 401·403) | **BLOCKED** | 실 API 자체 없음(404). 진짜 인증 RBAC 및 401/403 테스트는 승인 후 |
| AC-U4-03 (이름·scope·경쟁) | **PARTIAL** | UNIT-001~004 이름/형식/revision; scope별 DB Unique·동시 transaction 미구현 |
| AC-U4-04 (참조/비활성 유지) | **PARTIAL** | UNIT-003, E2E-PREVIEW-001의 ID·비활성/복구; 실제 Outline FK·Tree 미구현 |
| AC-U4-05 (미승인 시 배포 차단) | **CODE GATE** | 실제 API/migration 부재, Viewer 메뉴 disabled, E2E-GATE-002 404; 실행 결과 CI 이전 NOT RUN |

## 검증 상태 및 영향

- 신규 UNIT / E2E 테스트 **작성됨, 실행 NOT RUN**. remote PR CI가 시작된 시점에도 결과를 임의로 PASS 기록하지 않는다. 이 브랜치에서 실 DXF·GPU/native Fullscreen/보안 침투시험·운영 migration은 실행하지 않았다.
- 기존 DB schema/Version/Original CAD/SHA/Storage 및 Viewer Source·Renderer·outline export는 **불변**. `/lab` 시안 route만 추가되고 실 앱의 관리 메뉴는 disabled다. rollback은 PR 미병합 또는 변경 commit revert; 운영 데이터 이관 없음.
- 검토할 Owner 결정: (1) 사내 OIDC 검증 vs 별도 로컬 세션, (2) Role/RBAC + Viewer/Version/Site scope, (3) 타입 scope 전역 vs 사업부/제품/사업장 & 이름 대소문자 동등 정책, (4) 감사 로그 최소 보존 기간·조회 권한. 결정 전 AC-U4-01~04 전체 완료/Issue 종료 금지.
