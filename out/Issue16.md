# GitHub Issue #16 — 현재 버전 드롭다운 제거

기준일: 2026-09-18

## 요구사항

- 도면 목록 검색 영역의 `현재 버전` 드롭다운을 제거한다.
- `현재 버전만 표시` 토글은 유지한다.
- 토글 OFF는 Current 여부와 관계없이 기존 조건에 맞는 모든 Version을 표시한다.
- 토글 ON은 기존 `current=true` 조회 규칙을 재사용한다.
- 파일명, 도면 설명, 사업부, 사업장, 동, 층, 형식, 페이지당 표시 조건은 기존과 동일하게 유지한다.
- Current 지정/교체 기능과 Location별 Current 최대 1개 제약은 변경하지 않는다.
- `/api/cad-files`의 `current=true|false` 조회 계약은 유지한다.
- 과거 목록 URL에 `current=false`가 남아 있어도 오류 없이 토글 OFF, 즉 전체 Version 표시로 처리한다.

## 분석

Issue #8에서 토글이 추가된 뒤 기존 `전체 / Current / 이전 버전` 드롭다운과 `현재 버전만 표시` 토글이 중복되었다. 이번 변경은 목록 UI를 토글 하나로 단순화하는 것이 목적이며, 서버 측 Current 필터와 Current 관리 업무 규칙을 제거하는 변경이 아니다.

따라서 목록 페이지에서만 레거시 `current=false`를 Current 조건 없음으로 정규화한다. API Route는 기존 `CadListService`와 `listQuery`를 그대로 사용하므로 `current=false` 조회가 계속 가능하다.

## 구현

- `src/features/cad-list/list-filters.tsx`
  - `현재 버전` 드롭다운 제거
  - 검색 grid를 7열에서 6열로 정리
- `src/app/page.tsx`
  - 입력 Query를 먼저 검증한 뒤 `current=false`만 목록 UI에서 제거
  - 목록 요약을 `모든 버전 / 현재 버전만` 두 상태로 단순화
- `src/tests/integration/list.test.ts`
  - 서버의 `current=false` 필터 회귀는 유지
  - 토글 URL 시험에서 드롭다운 전용 `current=false` 선행 상태 제거
- `src/tests/e2e/workflow.spec.ts`
  - `현재 버전` combobox가 존재하지 않음을 검증
  - 과거 `current=false` 목록 URL에서 Current/이전 Version이 모두 보이는지 검증
  - 토글 ON/OFF 및 검색조건 유지 검증
  - API `current=false`가 계속 이전 Version만 반환하는지 검증

## 버전

사용자에게 보이는 목록 필터 UI 변경이므로 프로젝트 규칙에 따라 SemVer MINOR를 적용해 `0.21.1`에서 `0.22.0`으로 변경했다.

DB schema, migration, 외부 dependency, API contract 변경은 없다.

## 검증 결과

PR #19의 GitHub Actions `PR CI` run `35269062967`에서 최종 통과했다.

- Node.js 22.14.0 / `npm ci`: PASS
- Prisma Client 생성: PASS
- TypeScript: PASS
- ESLint: PASS
- Vitest Unit / Integration: **22 files / 100 tests PASS**
- Production build: PASS
- Playwright Chromium E2E: **34 / 34 PASS**

E2E는 `현재 버전` combobox 제거, 토글 OFF/ON 전환, 기존 검색조건 보존, 레거시 `current=false` 목록 URL의 전체 Version 표시, API의 `current=false` 이전 Version 조회 유지를 포함해 검증했다.

`npm ci`는 기존 dependency에 대해 high severity audit 경고 4건을 표시했으나 이번 변경에서 dependency 버전은 변경하지 않았으며 CI 실패 조건은 아니다.

## Acceptance Criteria 매핑

- 드롭다운 제거: `list-filters.tsx` 및 E2E combobox 부재 검증 완료
- 토글 유지: 기존 `CurrentVersionToggle` 재사용 및 E2E 검증 완료
- OFF=전체 / ON=Current: 토글 회귀 및 E2E 검증 완료
- 다른 필터와 병행: TC-LIST-008/009 및 E2E 검색조건 유지 검증 완료
- dead UI code 제거: Current select 및 `이전 버전만` 목록 요약 분기 제거 완료
- 과거 `current=false` URL 호환: 목록 페이지 정규화 및 E2E 검증 완료
- Current 지정/제약 영향 없음: 관련 API/Repository/DB 변경 없음 및 기존 회귀 PASS
- API Current 필터 유지: Integration 및 E2E API 조회 PASS

## 병합 및 릴리스

- PR: #19 `feat: 도면 목록 Current 필터를 토글로 단일화`
- 병합 방식: squash merge
- `main` 병합 commit: `1b52661fc5921de0018da1b9e8a7d86f6209395e`
- 작업 branch `feature/issue-16-remove-current-dropdown`: merge 후 자동 삭제 확인
- Issue #16: `completed` 상태로 종료 확인
- Release tag: `v0.22.0`
- Annotated tag 대상: `1b52661fc5921de0018da1b9e8a7d86f6209395e`
- Docker publish workflow: run `35269494098` PASS
- GHCR: `ghcr.io/planner77/layoutmanager:0.22.0`, `ghcr.io/planner77/layoutmanager:latest`
- Digest: `sha256:26de349a0909a5e23e09b3374edb9671497f56700cdbb696d3c1b8eb9a1e3202`
- OCI revision: `1b52661fc5921de0018da1b9e8a7d86f6209395e`
- OCI version: `0.22.0`

상세 릴리스 근거는 `out/Release-0.22.0.md`를 기준으로 한다.
