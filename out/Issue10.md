# GitHub Issue #10 — 도면 뷰어 전체 화면 보기

기준일: 2026-09-17
작업 브랜치: `feature/issue-10-viewer-fullscreen`
대상 버전: 후속 PR/릴리스 단계에서 확정

## 요구사항 구체화

Issue #10의 “전체 화면”은 브라우저 Fullscreen API만을 전제로 하지 않는다. 지원 브라우저에서는 Viewer shell에 `requestFullscreen()`을 우선 요청하고, API가 없거나 권한/정책으로 거부되는 경우에도 동일 shell을 CSS `position: fixed; inset: 0`으로 viewport 전체에 확장해 도면 확인 기능을 사용할 수 있어야 한다.

- Viewer가 정상 로드된 경우에만 `전체 화면` 버튼을 활성화한다.
- 전체 화면 전환은 기존 Viewer/Canvas를 재생성하지 않고 같은 DOM 인스턴스의 크기만 변경한다. 따라서 확대/축소/이동 상태를 불필요하게 초기화하지 않는다.
- 전체 화면에서는 주변 페이지 UI 대신 도면 영역과 최소 조작 버튼만 보이게 한다.
- 전체 화면 내부에서 확대, 축소, 화면 맞춤, 전체 화면 종료를 제공한다.
- 종료 버튼으로 native fullscreen 또는 CSS fallback 전체 화면을 모두 종료할 수 있다.
- native fullscreen에서 브라우저 `ESC`로 해제되면 `fullscreenchange`를 통해 UI 상태를 일반 화면으로 동기화한다.
- CSS fallback에서는 `ESC`를 직접 처리해 일반 화면으로 복귀한다.
- 전체 화면 진입/종료 시 컨테이너 resize를 기존 Viewer 구현이 처리하도록 한다. dxf-viewer는 `autoResize`, three-dxf-viewer와 DWG renderer는 기존 `ResizeObserver` 기반 구조를 유지한다.
- 전체 화면 전환 때문에 renderer 변경, 원본 재다운로드, ViewerManager 재생성, DB/API 변경은 발생하지 않는다.

## 구현 설계

### `src/features/cad-viewer/viewer.tsx`

- Viewer canvas를 `cad-viewer-shell`로 감싼다.
- `isFullscreen` 상태는 shell의 레이아웃만 변경하며 Viewer load effect dependency에 포함하지 않는다.
- `enterFullscreen()`은 먼저 fallback 상태를 활성화한 다음 native Fullscreen API를 best-effort로 호출한다. API 호출 실패는 fallback을 해제하지 않는다.
- `exitFullscreen()`은 React 상태를 일반 모드로 복귀시키고, shell이 native fullscreen element이면 `document.exitFullscreen()`도 호출한다.
- `fullscreenchange`에서 브라우저 자체 ESC, 브라우저 UI 등에 의한 native fullscreen 종료를 감지한다.
- fallback 모드에서는 window keydown의 `Escape`를 처리한다.
- fullscreen state 변경 다음 animation frame에 `resize` 이벤트를 발생시켜 window resize 기반 라이브러리도 즉시 반응할 수 있게 한다. 기존 `ResizeObserver`/`autoResize` 동작을 대체하지 않는다.
- 전체 화면 중 canvas는 `flex-1 min-h-0`으로 viewport 잔여 영역을 사용한다.

## Acceptance Criteria 매핑

- AC1 전체 화면 진입: 일반 toolbar의 `전체 화면` 버튼
- AC2 가용 영역 최대화: native fullscreen 또는 fixed viewport fallback
- AC3 기존 확대/축소/이동: Viewer 인스턴스 재생성 없이 동일 canvas 유지 + 전체 화면 전용 control
- AC4 ESC/종료 버튼: `fullscreenchange`, fallback keydown, `전체 화면 종료`
- AC5 뷰 상태 보존: fullscreen state를 Viewer load effect와 분리하여 adapter 재생성 방지
- AC6 레이아웃 복원: fixed class 제거 후 기존 `h-[65vh] min-h-96 rounded-xl` 복원
- AC7 주요 브라우저: Fullscreen API 실패 시 fallback 경로 제공. 실제 브라우저 행렬 검증은 PR/CI 및 필요 시 수동 검증 단계에서 기록

## 테스트 계획

기존 `TC-DXF/THREE-001`에 다음 회귀를 확장한다.

1. Viewer 표시 후 전체 화면 진입
2. shell이 viewport 크기로 확장되는지 확인
3. canvas backing buffer가 확대된 DOM 크기/devicePixelRatio에 맞게 resize되는지 확인
4. 종료 버튼으로 복귀 후 진입 전 canvas image와 동일한지 확인해 view state 불필요 초기화 여부 검증
5. 다시 전체 화면 진입 후 전체 화면 전용 확대/축소/화면 맞춤 실행
6. `Escape`로 일반 화면 복귀
7. 기존 다시 불러오기/화면 이탈/재진입 회귀 유지

Playwright의 실제 native fullscreen 동작은 실행 환경/브라우저 정책 영향을 받을 수 있으므로 `data-fullscreen`과 viewport layout 검증은 fallback 포함 공통 contract를 대상으로 한다. native fullscreen 자체의 `fullscreenchange` 경로는 브라우저 수동 확인 또는 지원되는 CI 환경에서 추가 검증한다.

## 범위 외

- Viewer renderer 자체 교체
- 도면 편집
- 전체 화면 상태 URL 영속화
- 모바일 전용 제스처/UI 최적화
- 브라우저별 비표준 fullscreen prefix 지원
