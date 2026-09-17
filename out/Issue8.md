# GitHub Issue #8 — 현재 버전만 표시 토글

기준일: 2026-09-17

## 요구사항

- 도면 목록에 `현재 버전만 표시` 빠른 토글을 제공한다.
- 기본 상태는 OFF이며 기존과 동일하게 모든 Version을 표시한다.
- ON이면 기존 `current=true` 조회 규칙을 재사용하여 각 Location의 Current Version만 표시한다.
- Current가 지정되지 않은 Location은 ON 결과에서 제외한다.
- OFF이면 Current 조건을 제거해 기존 검색 조건에 맞는 모든 Version을 표시한다.
- 파일명, 도면 설명, 사업부, 사업장, 동, 층, 형식, 페이지당 표시 조건과 AND 조건으로 함께 동작한다.
- 토글 변경 시 기존 검색 조건은 보존하고 `page=1`로 초기화한다.
- 활성 상태는 시각적으로 구분하고 `aria-pressed`로 접근성 상태를 제공한다.
- 기존 `current=false`(이전 버전만) 검색 기능, Current 지정/교체 기능, Location별 Current 최대 1개 규칙은 변경하지 않는다.

## 구현

- `src/domain/cad-list.ts`: 기존 목록 URL 생성 규칙을 재사용하는 `currentOnlyToggleUrl`을 추가했다.
- `src/features/cad-list/current-version-toggle.tsx`: URL 기반 토글 UI와 `aria-pressed`를 추가했다.
- `src/features/cad-list/list-filters.tsx`: 기존 검색 폼에 토글을 연결했다.
- `src/app/page.tsx`: 목록 요약에 `모든 버전 / 현재 버전만 / 이전 버전만` 상태를 표시한다.
- 서버 repository와 DB schema는 변경하지 않고 기존 `current` 필터를 그대로 사용한다.

## 테스트

- `TC-LIST-008`: 토글 ON/OFF 시 다른 검색 조건과 `pageSize`가 유지되고 `page=1`로 초기화되는지 검증한다.
- `TC-LIST-009`: `current=true`와 파일명/위치/형식 필터가 AND로 결합되고 Current 미지정 Location이 제외되는지 검증한다.
- `tests/e2e/workflow.spec.ts`: OFF → ON → OFF, `aria-pressed`, URL 검색조건 유지, Current/이전 Version 행 표시 변화를 Browser에서 검증한다.

## CI 결과

PR #11에서 PR 전용 CI를 추가해 다음 단계를 실행했다.

- Node.js 22.14.0 / `npm ci`
- Prisma Client 생성
- TypeScript 검사
- ESLint 검사
- Vitest unit/integration
- Production build
- Playwright Chromium E2E

최초 CI는 기존 `TC-NAME-003`가 과거 `placeholder` 표현을 기대해 31개 E2E 중 1개가 실패했다. 현재 요구사항과 구현은 도면 이름 입력 아래 안내문으로 기본 이름과 등록 시 버전 확정을 안내하므로, 기능 코드는 변경하지 않고 해당 fixture를 현재 UI 계약에 맞게 갱신했다.

재실행 결과:

- TypeScript: PASS
- ESLint: PASS
- Unit/Integration: 22 files / 100 tests PASS
- Production build: PASS
- E2E: 31 / 31 PASS

## 범위 외

- Current 자동 선정 규칙 변경
- Version/Location 데이터 구조 변경
- Location별 복수 Current 허용
- Version 삭제/정리 정책 변경

상세 변경 이력은 `out/ChangeLog.md`, 코드 검토와 병합 이력은 PR #11 및 Issue #8을 기준으로 한다.
