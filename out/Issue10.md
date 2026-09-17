# GitHub Issue #10 — 도면 뷰어 전체 화면 보기

기준일: 2026-09-17
작업 브랜치: `feature/issue-10-viewer-fullscreen`
대상 버전: `0.21.0`
PR: #13

## 버저닝 판단

이번 변경은 기존 Viewer/API/DB 호환성을 유지하면서 사용자가 사용할 수 있는 새 UI 기능인 전체 화면 보기를 추가하므로 SemVer MINOR로 분류한다. 애플리케이션 버전의 단일 기준인 `src/package.json`을 `0.20.0`에서 `0.21.0`으로 갱신했다.

`src/package-lock.json`의 루트 version 메타데이터가 이전 릴리스부터 `0.19.1`로 남아 있으나 의존성 해시/버전 lock과는 별개이며 기존 0.20.0 CI에서도 사용된 상태이다. 이번 기능 구현에서는 의존성 변경이 없으므로 lock dependency graph는 변경하지 않는다.

## 요구사항 구체화

Issue #10의 “전체 화면”은 브라우저 Fullscreen API만을 전제로 하지 않는다. 지원 브라우저에서는 Viewer shell에 `requestFullscreen()`을 우선 요청하고, API가 없거나 권한/정책으로 거부되는 경우에도 동일 shell을 CSS `position: fixed; inset: 0`으로 viewport 전체에 확장해 도면 확인 기능을 사용할 수 있어야 한다.

- Viewer가 정상 로드된 경우에만 `전체 화면` 버튼을 활성화한다.
- 전체 화면 전환은 기존 Viewer/Canvas를 재생성하지 않고 같은 DOM 인스턴스의 크기만 변경한다. 따라서 확대/축소/이동 상태를 불필요하게 초기화하지 않는다.
- 전체 화면에서는 주변 페이지 UI 대신 도면 영역과 최소 조작 버튼만 보이게 한다.
- 전체 화면 내부에서 확대, 축소, 화면 맞춤, 전체 화면 종료를 제공한다.
- 종료 버튼으로 native fullscreen 또는 CSS fallback 전체 화면을 모두 종료할 수 있다.
- `Escape` 입력은 native fullscreen과 CSS fallback 모두 명시적으로 종료한다. 브라우저 UI에 의해 native fullscreen이 해제되는 경우에도 `fullscreenchange`로 상태를 동기화한다.
- 전체 화면 진입/종료 시 컨테이너 resize를 기존 Viewer 구현이 처리하도록 한다. dxf-viewer는 `autoResize`, three-dxf-viewer와 DWG renderer는 기존 `ResizeObserver` 기반 구조를 유지한다.
- 전체 화면 전환 때문에 renderer 변경, 원본 재다운로드, ViewerManager 재생성, DB/API 변경은 발생하지 않는다.

## 구현 설계

### `src/features/cad-viewer/viewer.tsx`

- Viewer canvas를 `cad-viewer-shell`로 감싼다.
- `isFullscreen` 상태는 shell의 레이아웃만 변경하며 Viewer load effect dependency에 포함하지 않는다.
- `enterFullscreen()`은 먼저 fallback 상태를 활성화한 다음 native Fullscreen API를 best-effort로 호출한다. API 호출 실패는 fallback을 해제하지 않는다.
- `exitFullscreen()`은 React 상태를 일반 모드로 복귀시키고, shell이 native fullscreen element이면 `document.exitFullscreen()`도 호출한다.
- `fullscreenchange`에서 브라우저 자체 ESC, 브라우저 UI 등에 의한 native fullscreen 종료를 감지한다.
- `Escape` keydown에서는 native/fallback 여부와 관계없이 `exitFullscreen()`을 호출한다. 브라우저가 실제 사용자 ESC를 자체 처리하는 경우와 Playwright 등의 합성 keyboard 이벤트를 모두 안전하게 수용한다.
- fullscreen state 변경 다음 animation frame에 `resize` 이벤트를 발생시켜 window resize 기반 라이브러리도 즉시 반응할 수 있게 한다. 기존 `ResizeObserver`/`autoResize` 동작을 대체하지 않는다.
- 전체 화면 중 canvas는 `flex-1 min-h-0`으로 viewport 잔여 영역을 사용한다.

## Acceptance Criteria 매핑

- AC1 전체 화면 진입: 일반 toolbar의 `전체 화면` 버튼
- AC2 가용 영역 최대화: native fullscreen 또는 fixed viewport fallback
- AC3 기존 확대/축소/이동: Viewer 인스턴스 재생성 없이 동일 canvas 유지 + 전체 화면 전용 control
- AC4 ESC/종료 버튼: 명시적 `Escape` 처리, `fullscreenchange`, `전체 화면 종료`
- AC5 뷰 상태 보존: fullscreen state를 Viewer load effect와 분리하여 adapter 재생성 방지
- AC6 레이아웃 복원: fixed class 제거 후 기존 `h-[65vh] min-h-96 rounded-xl` 복원
- AC7 주요 데스크톱 브라우저: 표준 Fullscreen API 사용, API 실패 시 fallback 제공. Chromium 자동 회귀는 CI에서 검증하고 다른 브라우저의 실제 native fullscreen 정책 차이는 수동 확인 대상으로 남긴다.

## 테스트

기존 `TC-DXF/THREE-001`에 다음 회귀를 확장했다.

1. Viewer 표시 후 전체 화면 진입
2. shell이 viewport 크기로 확장되는지 확인
3. canvas backing buffer가 확대된 DOM 크기/devicePixelRatio에 맞게 resize되는지 확인
4. 종료 버튼으로 복귀 후 진입 전 canvas image와 동일한지 확인해 view state 불필요 초기화 여부 검증
5. 다시 전체 화면 진입 후 전체 화면 전용 확대/축소/화면 맞춤 실행
6. `Escape`로 일반 화면 복귀
7. 기존 다시 불러오기/화면 이탈/재진입 회귀 유지

Playwright의 실제 native fullscreen 동작은 실행 환경/브라우저 정책 영향을 받을 수 있으므로 `data-fullscreen`과 viewport layout 검증은 fallback 포함 공통 contract를 대상으로 한다. native fullscreen은 표준 `requestFullscreen`/`exitFullscreen`/`fullscreenchange` 경계를 유지한다.

## PR / CI 검증

PR #13에서 PR 전용 CI를 실행했다.

- 최초 run `35210713169`: TypeScript, ESLint, 22 files / 100 Unit·Integration, Production build는 PASS. Chromium E2E는 31/33 PASS였으며 DXF 두 renderer의 ESC 회귀 2건이 실패했다.
- 원인: headless Chromium의 Playwright 합성 `Escape`가 native fullscreen 브라우저 UI 해제를 자동 발생시키지 않았고, 구현도 native fullscreen일 때 keydown 처리를 조기 반환했다.
- 수정: ESC keydown에서 native/fallback을 구분하지 않고 `exitFullscreen()`으로 명시 종료하도록 보강했다. 실제 브라우저가 자체 fullscreen을 해제하는 경우에는 `fullscreenchange`와 중복돼도 일반 상태를 유지한다.
- 최종 기능 head: `9eff6d438ec86fffd6acdc99ea4d046c028f6690`
- 최종 기능 CI run `35211193682`: **PASS**
  - `npm ci`: PASS
  - Prisma Client 생성: PASS
  - TypeScript: PASS
  - ESLint: PASS
  - Unit / Integration: **22 files / 100 tests PASS**
  - Production build: PASS
  - Playwright Chromium E2E: **33 / 33 PASS**

관련 문서 갱신 커밋이 PR에 추가된 뒤에는 해당 최종 head 기준 PR CI를 다시 통과한 후 병합한다.

## 릴리스 처리

PR #13 병합 시 저장소의 `Build and publish Docker image` workflow가 `src/package.json`의 `0.21.0`을 읽어 `v0.21.0` 태그가 없으면 병합 커밋에 자동 생성하고, `ghcr.io/planner77/layoutmanager:0.21.0` 및 `latest`를 게시한다. 실제 병합 SHA, workflow run, image digest와 이슈 종료 상태는 `out/Release-0.21.0.md`에 기록한다.

## 범위 외

- Viewer renderer 자체 교체
- 도면 편집
- 전체 화면 상태 URL 영속화
- 모바일 전용 제스처/UI 최적화
- 브라우저별 비표준 fullscreen prefix 지원
