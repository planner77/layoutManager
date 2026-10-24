# Issue #45 — 도면 목록 Current Version 전용 표시

- 기준일: 2026-10-25
- 이슈: https://github.com/planner77/layoutManager/issues/45
- 대상 버전: `0.31.0` (UI 정책 변경 / MINOR)
- 상태: 최초 PR CI ESLint 실패(실패 Run 40142618328) 원인 보완; 새 수정 HEAD PR CI 결과 미검증
- 설계 기준: `AGENTS.md`, `out/Requirements.md`, `out/Architecture.md`, `out/Decisions.md` (저장소에 별도 `DESIGN.md`는 없음)

## 1. 현행 분석

- #8에서 `현재 버전만 표시` 토글을 기본 OFF로 구현했고, #16에서 중복 드롭다운을 제거해 토글로 단일화했다.
- 목록 홈(`src/app/page.tsx`)은 `listQuery(params)` 및 `CadListService.search(params)`를 사용하여 `current`가 없거나 레거시 `current=false`이면 전체 버전을 조회한다.
- Current는 버전 번호의 최댓값이 아니라 `CadLocation.currentVersionId`가 가리키는 Version이다. 한 Location은 Current 0~1개만 가질 수 있다(#24).
- `/api/cad-files`와 Location 상세에서는 전체/이전 버전 및 Current 변경이 필요하므로 **공유 파서나 repository에 Current-only 강제 적용하면 안 된다**.
- 기존 Location 상세는 `/cad/locations/[locationId]`만 제공하므로 Current가 없는 Location을 홈 목록에서 숨기면 접근 경로를 잃을 수 있다. 다섯 단계 기준정보 UI의 모든 층에 직접 **버전 이력** 링크를 제공한다.

## 2. 설계 결정 (ADR-034)

1. **경계:** 홈페이지 `/` Server Component 한 곳만 Current-only 계약을 적용한다. `currentOnlyListParams(input)`는 기존 `listQuery(input)`로 유효성을 검증한 뒤 사본의 `current=true`를 강제하고, 정규화된 Query와 Params를 함께 반환한다.
2. **서버 조건:** 홈페이지는 `service.search(scoped.params)`만 호출한다. 총건수/검색/페이지네이션은 repository의 이미 존재하는 `l.current_version_id=v.id` 조건을 사용한다. UI에서 전체 조회 후 row만 숨기는 방식은 사용하지 않는다.
3. **레거시 URL:** 누락/`true`/`false`는 모두 홈페이지에서 Current-only로 렌더링하며 중복·잘못된 검색 입력은 기존 검증 규칙에 따라 오류 처리한다. 목록 검색/초기화는 Current-only를 변경할 수 없다. 새 페이지 링크에도 `current=true`를 포함한다.
4. **UI:** OFF로 되돌리는 토글/유틸/컴포넌트를 삭제한다. Current 전용 안내·결과·빈 상태를 표시하고, 홈에서 **위치별 버전 관리 → 위치 기준정보 → 층의 버전 이력**으로 이동할 수 있다.
5. **관리 경로:** `MasterManager`의 모든 층(비활성/Current 없는 층 포함)에 `/cad/locations/{floorId}` 링크를 추가한다. Location 상세는 기존 모든 Version 및 Current 지정/삭제/다운로드/직접 Viewer를 보존하며 홈/기준정보로 복귀한다.
6. **불변 경계:** `listQuery()`, `CadListService.search`, `CadListRepository.list`, `GET /api/cad-files?current=false`, `CadLocation.currentVersionId`, 기존 Current 교체·삭제 및 원본 bytes/DB migration은 수정하지 않는다.

## 3. 구현·의존성

| 범위 | 변경 |
| --- | --- |
| `src/domain/cad-list.ts` | `currentOnlyToggleUrl` 대신 `currentOnlyListParams`; 공유 parser/API 동작 유지 |
| `src/app/page.tsx` | 서버 조회 전에 current=true 강제, 현재 도면 수·검색·빈 상태 및 버전 관리 링크 |
| `src/features/cad-list/list-filters.tsx` | 토글 제거. 파일명/설명/5단계 위치·형식·pageSize 필터 유지 |
| `src/features/cad-list/current-version-toggle.tsx` | 삭제(미사용 코드) |
| `src/features/master/master-manager.tsx`, `src/app/masters/page.tsx` | 층별 버전 이력 직접 링크·설명 추가 |
| `src/app/cad/locations/[locationId]/page.tsx` | 홈·기준정보 복귀 경로 명확화 |
| `src/package.json`, `src/package-lock.json` | 0.31.0 동기화 |
| 문서/회귀 | Requirements, Architecture, Decisions, TestPlan/Report, README, ChangeLog, #8/#16 후속 정책 기록 |

**대안 배제:** 공유 `listQuery`의 기본 Current를 변경하면 API의 전체/이전 버전 조회 계약을 파괴한다. UI row 필터만 적용하면 총건수/페이지네이션/빈 상태가 실제 결과와 불일치한다. Current 미지정 Location에 Current를 자동 지정하면 업무 데이터가 임의 변경된다.

## 4. 수용 기준 및 검증 매핑

| AC | 검증 기준 | TC |
| --- | --- | --- |
| AC1/AC2 | 기본 홈/초기화 시 Current만, 토글 및 Current 드롭다운 부재 | TC-LIST-045-003, TC-E2E-001 |
| AC3 | `current=false`, `true`, 누락 URL과 새로고침에서 동일 Current 스코프 | TC-LIST-045-001, TC-LIST-045-003 |
| AC4 | Current 미지정 층·과거 Version·더 높은 비Current Version이 홈에 없음 | TC-LIST-045-002/003 |
| AC5 | 다른 필터/pageSize/page, 총건수·빈 상태가 Current 결과 기준 | TC-LIST-045-001/002/003, TC-LIST-005/009 |
| AC6 | Current 지정/변경/삭제 직후 홈 조회가 새 지정 상태를 반영, 이력 보존 | TC-LIST-045-002/003, TC-DELETE-002/004 |
| AC7 | 기준정보에서 Current 미지정 층도 직접 이력 진입·지정 가능. 과거 버전 Viewer/다운로드 가능 | TC-LIST-045-003, TC-LINK-001/003, TC-MASTER-003/005/007 |
| AC8 | `/api/cad-files?current=false` 이전 버전 조회 및 Location Current 무결성 유지 | TC-LIST-003/004/045-001, TC-LIST-045-003 |
| AC9 | Typecheck/Lint/Unit/Integration/Browser E2E/Build/필수 문서 동기화 | PR CI 워크플로 & 증거 확인 |

기존 `workflow.spec.ts`의 OFF→ON→OFF 검사에서 Current-only 홈페이지 계약으로 변경하며, `link.spec.ts`의 non-Current 사례는 Location 상세로 이동한다. `drawing-name.spec.ts`는 홈에서 검증하는 버전을 명시적 Current로 등록한다.

## 5. 최초 CI 실패와 보완 (2026-10-25)

- [Run 40142618328](https://github.com/planner77/layoutManager/actions/runs/40142618328)의 ESLint step은 `src/app/masters/page.tsx` 내 신규 설명의 인용부호 2개 때문에 `react/no-unescaped-entities`로 FAIL. Typecheck와 Docker-runtime은 PASS; E2E는 실패가 아니라 **SKIPPED**.
- [PR review P2 #4368927952](https://github.com/planner77/layoutManager/pull/46#discussion_r4368927952)가 최초 CI에서 아직 실행되지 않은 `upload.spec.ts / TC-ISSUE-001/LIST`의 이전 비Current 행 표시 기대가 현행 홈 정책과 충돌함을 발견.
- [fix `69e6b175`](https://github.com/planner77/layoutManager/commit/69e6b17548f35c248c700c5526e9993fc3eaf7c7): JSX `&apos;` escape 및 기존 Current 행으로 Location 상세에 진입해 이전 Version을 선택하는 테스트 수정. 새 Run 전 성공으로 판정하지 않음.
- 기록: [FailureLedger](FailureLedger.md), [TestReport](TestReport.md).

## 6. 검증 상태와 릴리스 경계

- 준비된 자동 시험: `src/tests/integration/list.test.ts`, `src/tests/e2e/current-only-list.spec.ts`, `workflow.spec.ts`, `link.spec.ts`, `drawing-name.spec.ts`.
- 권장 실행: `cd src && npm ci && npm run db:generate && npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e`. PR CI의 독립 Docker-runtime, legacy migration E2E 역시 정책상 검증 대상.
- **로컬 실행 증거 없음 / 최초 PR CI 실패 확인 / 수정 HEAD의 PR CI 결과 미확인 (NOT VERIFIED).** PR CI를 시작해도 통과와 다르며, 실 운영 배포·GHCR 게시·Issue 종료는 이번 요청 범위에 포함되지 않는다.
- 사용자 지정: PR CI를 시작한 뒤 **모니터링하지 않는다**. 향후 실패가 보고되면 `out/FailureLedger.md`에 해당 Run/Step/원인/대응/재실행을 기록한다.
