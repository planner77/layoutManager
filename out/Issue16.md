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

사용자에게 보이는 목록 필터 UI 변경이므로 프로젝트 규칙에 따라 SemVer MINOR를 적용해 `0.21.1`에서 `0.22.0`으로 변경한다.

DB schema, migration, 외부 dependency, API contract 변경은 없다.

## 검증 계획

PR/CI 단계에서 다음을 실행한다.

- TypeScript typecheck
- ESLint
- Vitest unit/integration
- Production build
- Playwright Chromium E2E

## Acceptance Criteria 매핑

- 드롭다운 제거: `list-filters.tsx` 및 E2E combobox 부재 검증
- 토글 유지: 기존 `CurrentVersionToggle` 재사용
- OFF=전체 / ON=Current: 기존 토글 로직 및 E2E 검증
- 다른 필터와 병행: 기존 TC-LIST-008/009 및 E2E 검색조건 유지
- dead UI code 제거: Current select 및 `이전 버전만` 목록 요약 분기 제거
- 과거 `current=false` URL 호환: 목록 페이지 정규화 및 E2E 검증
- Current 지정/제약 영향 없음: 관련 API/Repository/DB 변경 없음
- API Current 필터 유지: Integration 및 E2E API 조회 검증
