# GitHub Issue #17 — 전체 화면 three-dxf-viewer 레이어 선택/표시 제어

기준일: 2026-09-18  
작업 브랜치: `feature/issue-17-fullscreen-layer-panel`  
대상 버전: `0.24.0`

## 버저닝 판단

이번 변경은 기존 Viewer/API/DB 호환성을 유지하면서 전체 화면에서 사용할 수 있는 신규 레이어 제어 UI를 추가하므로 SemVer MINOR로 분류한다. 애플리케이션 버전의 단일 기준인 `src/package.json`을 `0.23.0`에서 `0.24.0`으로 갱신한다.

외부 dependency, DB schema/migration, API contract는 변경하지 않는다. `src/package-lock.json`의 루트 version 메타데이터는 기존 릴리스부터 애플리케이션 버전과 분리되어 있으므로 dependency graph 변경이 없는 이번 작업에서는 수정하지 않는다.

## 요구사항 명확화

Issue #17은 기존 일반 화면 레이어 드롭다운을 대체하지 않는다. `three-dxf-viewer`가 정상 로드되고 현재 DXF에서 하나 이상의 레이어를 취득한 경우, 전체 화면 안에서 레이어를 직접 확인하고 표시/숨김할 수 있는 별도 패널을 제공한다.

- 전체 화면 + `three-dxf-viewer` + ready + 레이어 존재 조건에서만 패널을 표시한다.
- 패널은 좌측에 배치하고 최초 전체 화면 진입 시 펼친 상태로 표시한다.
- 패널은 접기/펼치기를 지원한다.
- 많은 레이어를 처리할 수 있도록 레이어 목록 영역만 세로 스크롤한다.
- 각 레이어는 체크박스로 표시 여부를 제어한다.
- `전체 선택` / `전체 해제`를 제공한다.
- 일반 화면 `LayerDropdown`과 전체 화면 패널은 동일 `selectedLayers` 상태를 공유한다.
- 레이어 변경은 기존 `ViewerManager.showLayer()`를 통해 현재 Adapter에 즉시 반영한다.
- 레이어 토글 때문에 ViewerManager, Adapter, Canvas를 재생성하거나 원본을 다시 다운로드하지 않는다.
- 따라서 사용자가 보고 있던 카메라/줌/팬 상태를 유지한다.
- 다른 Viewer에는 전체 화면 레이어 패널을 표시하지 않는다.
- 다른 도면, Renderer 전환, 다시 불러오기는 기존 load lifecycle에 따라 새 레이어 목록을 취득하고 전체 선택 상태로 초기화한다.

## 기존 구조 분석

`src/viewers/three-dxf-viewer/adapter.ts`는 이미 다음 공개 Adapter contract를 구현한다.

- `getLayers()`: Three.js Object tree의 `userData.entity.layer` metadata를 순회하여 정렬된 레이어 목록 반환
- `showLayer(name, visible)`: 동일 metadata를 가진 Object의 `visible`만 변경하고 즉시 render

따라서 upstream `three-dxf-viewer` 내부 API를 추가로 의존하거나 Three.js scene 구조를 UI에서 직접 다룰 필요가 없다. 기존 Adapter 경계를 유지하는 것이 회귀 위험이 가장 낮다.

일반 화면의 `LayerDropdown`도 이미 `layers`, `selected`, `onLayerChange`, `onAllChange` controlled contract를 사용한다. 이번 구현은 `CadViewer`에 공통 레이어 변경 함수를 두고 일반 드롭다운과 전체 화면 패널이 이를 공유하도록 한다.

## 구현 설계

### `src/features/cad-viewer/fullscreen-layer-panel.tsx`

- 전체 화면용 presentation component
- `layers`, `selected`, `onLayerChange`, `onAllChange`만 입력받으며 Viewer 객체를 직접 알지 않는다.
- native checkbox로 레이어별 선택 상태와 접근 가능한 이름을 제공한다.
- 접힌 상태에서는 `레이어 패널 펼치기` 버튼만 남긴다.
- 열린 상태에서는 선택 개수/전체 개수, 전체 선택/해제, scrollable layer list를 제공한다.

### `src/features/cad-viewer/viewer.tsx`

- 기존 inline 레이어 변경 코드를 `setLayerVisibility`, `setAllLayersVisibility` 함수로 통합한다.
- 일반 `LayerDropdown`과 `FullscreenLayerPanel`에 동일 함수를 전달한다.
- 전체 화면 shell 내부에만 패널을 mount한다.
- `isFullscreen`은 기존과 동일하게 Viewer load effect dependency가 아니므로 패널 조작/접기/펼치기로 Viewer가 재생성되지 않는다.

## Acceptance Criteria 매핑

- AC1 전체 화면 레이어 패널 표시: `three-dxf-viewer` + ready + layers 조건부 mount
- AC2 레이어 목록 누락 방지: 기존 Adapter `getLayers()` 결과를 그대로 사용
- AC3 즉시 표시/숨김: 기존 `showLayer()` 호출 후 render
- AC4 카메라/줌 유지: Viewer/Adapter/Canvas 재생성 없음
- AC5 다른 도면 갱신: 기존 load 완료 시 `setLayers(nextLayers)` 및 전체 선택 초기화
- AC6 다른 Viewer 영향 없음: renderer 조건으로 패널 미표시
- AC7 기존 Viewer 기능 회귀 방지: 기존 전체 화면/확대/축소/맞춤/Escape lifecycle 유지

## 자동 테스트 계획

`src/tests/e2e/issue17-fullscreen-layers.spec.ts`에 `TC-ISSUE17-001`을 추가한다.

1. 한글/영문/숫자/공백이 포함된 2개 레이어 DXF 등록
2. `three-dxf-viewer` 로드 후 확대하여 비기본 view state 생성
3. 전체 화면 진입 후 레이어 패널과 두 레이어가 모두 선택됐는지 확인
4. 개별 레이어 해제 후 canvas 변경 확인
5. 다시 선택 후 확대된 기존 canvas 결과가 복원되는지 확인하여 토글이 view state를 초기화하지 않음을 검증
6. content API 요청이 추가되지 않았는지 확인
7. 전체 해제/전체 선택 확인
8. 패널 접기/펼치기 확인
9. 전체 화면 종료 후 일반 LayerDropdown 상태 동기화 확인
10. `dxf-viewer` 전체 화면에서는 패널이 표시되지 않는지 확인

## 현재 상태

요구사항 명확화, 구조 분석, 설계, 버저닝, 작업 브랜치 생성 및 코드/테스트 작성까지 진행한다. 실제 TypeScript/Lint/Unit/Build/E2E 결과는 후속 PR/CI 단계에서 검증하며 실행 전 PASS로 기록하지 않는다.
